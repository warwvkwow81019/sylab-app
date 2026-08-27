import Constants from 'expo-constants';

const API_BASE = Constants.expoConfig?.extra?.EXPO_PUBLIC_API_BASE || 'https://s.symsgf.xyz';

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

export interface SseCallbacks {
  onDelta: (text: string) => void;
  onToolCall?: (name: string, args: string, result?: string) => void;
  onComplete: (chatId: string, conversationId: string, tokens?: TokenUsage) => void;
  onMessageComplete?: () => void;
  onError: (error: Error) => void;
  onStatus?: (status: string) => void;
}

export interface ChatRequest {
  bot_id: string;
  user_id: string;
  conversation_id?: string;
  additional_messages: Array<{
    role: string;
    content: string;
    content_type: string;
  }>;
  stream?: boolean;
  auto_save_history?: boolean;
}


/**
 * Estimate token count from text content.
 */
function estimateTokens(text: string): number {
  if (!text) return 0;
  const len = text.length;
  return Math.ceil(len / 3);
}

export function sendMessageStream(
  body: ChatRequest,
  bearerToken: string,
  callbacks: SseCallbacks
): { abort: () => void } {
  const convId = (body as any).conversation_id;
  let url = `${API_BASE}/v3/chat`;
  if (convId) {
    url += `?conversation_id=${encodeURIComponent(convId)}`;
  }
  const reqBody: Record<string, any> = { ...body };
  delete reqBody.conversation_id;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${bearerToken}`,
  };

  let aborted = false;
  const controller = new AbortController();
  let lastChatId = '';
  let lastConversationId = '';
  let lastTokenUsage: TokenUsage | undefined;
  let fullAssistantContent = "";

  (async () => {
    try {
      console.log('[SSE] POST', url);

      const connectTimeout = setTimeout(() => {
        if (!aborted) {
          console.error('[SSE] Connect timeout (90s), aborting');
          controller.abort();
        }
      }, 90000);

      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(reqBody),
          signal: controller.signal,
        });
      } catch (fetchErr: any) {
        clearTimeout(connectTimeout);
        if (fetchErr.name === 'AbortError') {
          throw new Error('连接超时，请检查网络后重试');
        }
        throw fetchErr;
      }
      clearTimeout(connectTimeout);

      console.log('[SSE] response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
      }

      if (!response.body) {
        const text = await response.text();
        parseSseText(text, callbacks, lastChatId, lastConversationId);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = '';

      console.log('[SSE] Stream started, reading...');

      while (true) {
        if (aborted) break;
        const { done, value } = await reader.read();
        if (done) {
          console.log('[SSE] Stream ended, done=true');
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (aborted) break;

          const trimmed = line.trim();
          if (!trimmed) {
            currentEvent = '';
            continue;
          }

          if (trimmed.startsWith('event:')) {
            currentEvent = trimmed.slice(6).trim();
            continue;
          }

          if (trimmed.startsWith('data:')) {
            const dataStr = trimmed.slice(5).trim();
            if (!dataStr || dataStr === '[DONE]') continue;

            try {
              const data = JSON.parse(dataStr);
              if (data.chat_id) lastChatId = data.chat_id;
              if (data.conversation_id) lastConversationId = data.conversation_id;
              if (data.id && !lastChatId) {
                if (currentEvent.startsWith('conversation.chat.')) {
                  lastChatId = data.id;
                }
              }

              // delta: only real content text triggers streaming
              if (currentEvent === 'conversation.message.delta') {
                // Support both top-level and nested message_item
                const dMsg = data.message_item || data;
                const dType = (dMsg.type || dMsg.message_type || '').toLowerCase();
                // Only process answer-type messages; skip function_call/tool_response/verbose fragments
                const isAnswerType = !dType || dType === 'answer' || dType === 'text';
                if (isAnswerType && dMsg.content) {
                  callbacks.onDelta(dMsg.content);
                  if (dMsg.role === "assistant") fullAssistantContent += dMsg.content;
                  callbacks.onStatus?.('streaming');
                }
                // Reasoning deltas do NOT change status - thinking is already set at stream start.
                // Triggering onStatus('thinking') here would override tool status ("正在搜索...") during tool execution.
                // We only update status when actual answer content arrives (onStatus('streaming')).
                // Detect tool_calls in delta (some formats)
                const tcList = dMsg.tool_calls || data.tool_calls;
                if (tcList && Array.isArray(tcList)) {
                  for (const tc of tcList) {
                    const name = tc.function?.name || tc.name || 'unknown';
                    const args = tc.function?.arguments || tc.arguments || '{}';
                    if (name && name !== 'unknown') {
                      console.log('[SSE] Tool call from delta:', name);
                      callbacks.onToolCall?.(name, args);
                    }
                  }
                }
              }
              // message.completed: token usage + function_call + tool_response
              else if (currentEvent === 'conversation.message.completed') {
                // Support both top-level and nested message_item
                const dMsg = data.message_item || data;
                if (dMsg.role === 'assistant' && (dMsg.ext || data.meta_data)) {
                  callbacks.onMessageComplete?.();
                  try {
                    const ext = dMsg.ext ? (typeof dMsg.ext === 'string' ? JSON.parse(dMsg.ext) : dMsg.ext) : data.meta_data;
                    const inputT = parseInt(ext.input_tokens || '0') || 0;
                    const outputT = parseInt(ext.output_tokens || '0') || 0;
                    const totalT = parseInt(ext.token || '0') || 0;
                    if (totalT > 0 || inputT > 0 || outputT > 0) {
                      lastTokenUsage = { input: inputT, output: outputT, total: totalT || (inputT + outputT) };
                    }
                  } catch {}
                }
                if (!lastTokenUsage && dMsg.role === 'assistant' && fullAssistantContent.length > 0) {
                  const outputTokens = estimateTokens(fullAssistantContent);
                  const inputTokens = Math.round(outputTokens * 2);
                  lastTokenUsage = { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens };
                }
                // function_call arrives as a completed message (type=function_call, role=assistant)
                const msgType = dMsg.type || dMsg.message_type || data.type || data.message_type || '';
                if (msgType === 'function_call') {
                  try {
                    let tc: any = {};
                    try { tc = JSON.parse(dMsg.content || '{}'); } catch { tc = {}; }
                    let extObj: any = {};
                    try { extObj = dMsg.ext ? (typeof dMsg.ext === 'string' ? JSON.parse(dMsg.ext) : dMsg.ext) : {}; } catch {}
                    const name = tc.function?.name || tc.name || dMsg.meta_data?.tool_name || data.meta_data?.tool_name || extObj.tool_name || extObj.plugin || 'unknown';
                    const args = tc.function?.arguments || tc.arguments || '{}';
                    console.log('[SSE] Tool call detected:', name);
                    callbacks.onToolCall?.(name, args);
                    callbacks.onStatus?.('tool_running');
                  } catch (e) { console.warn('[SSE] function_call parse error:', e); }
                }
                // tool_response: mark previous tool call as done
                if (msgType === 'tool_response') {
                  try {
                    let toolName = '';
                    const content = dMsg.content || '';
                    let extObj: any = {};
                    try { extObj = dMsg.ext ? (typeof dMsg.ext === 'string' ? JSON.parse(dMsg.ext) : dMsg.ext) : {}; } catch {}
                    if (dMsg.meta_data?.tool_name) toolName = dMsg.meta_data.tool_name;
                    else if (data.meta_data?.tool_name) toolName = data.meta_data.tool_name;
                    else if (extObj.tool_name) toolName = extObj.tool_name;
                    else if (extObj.plugin) toolName = extObj.plugin;
                    // Pass empty toolName - appendToolCall will match the most recent unfinished tool call
                    callbacks.onToolCall?.(toolName, '', content);
                  } catch {}
                }
              }
              else if (currentEvent === 'conversation.chat.completed') {
                try {
                  if (data.usage) {
                    const totalTokens = (data.usage.token_count || 0) || ((data.usage.input_count || 0) + (data.usage.output_count || 0));
                    const inputTokens = data.usage.input_count || 0;
                    const outputTokens = data.usage.output_count || 0;
                    if (totalTokens > 0) {
                      lastTokenUsage = { input: inputTokens, output: outputTokens, total: totalTokens };
                    }
                  }
                } catch (e) {
                  console.warn('[SSE] Failed to parse chat completed usage:', e);
                }
              }
              else if (currentEvent === 'conversation.chat.failed') {
                callbacks.onError(new Error(data.last_error?.msg || '聊天处理失败'));
                return;
              }
            } catch (parseErr) {
              console.warn('[SSE] Parse error for data:', dataStr.substring(0, 100));
            }
          }
        }
      }

      console.log('[SSE] Complete. chatId:', lastChatId, 'convId:', lastConversationId);
      callbacks.onComplete(lastChatId, lastConversationId, lastTokenUsage);
      callbacks.onStatus?.('complete');
    } catch (error: any) {
      if (error.name === 'AbortError') {
        callbacks.onError(new Error('连接已中断'));
        return;
      }
      console.error('[SSE] Error:', error.message);
      callbacks.onError(error);
    }
  })();

  return {
    abort: () => {
      aborted = true;
      controller.abort();
    },
  };
}

function parseSseText(
  text: string,
  callbacks: SseCallbacks,
  chatId: string,
  conversationId: string
) {
  const lines = text.split('\n');
  let currentEvent = '';
  let lastChatId = chatId;
  let lastConvId = conversationId;
  let fullContent = '';
  let tokenUsage: TokenUsage | undefined;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { currentEvent = ''; continue; }
    if (trimmed.startsWith('event:')) { currentEvent = trimmed.slice(6).trim(); continue; }
    if (trimmed.startsWith('data:')) {
      const dataStr = trimmed.slice(5).trim();
      if (!dataStr || dataStr === '[DONE]') continue;
      try {
        const data = JSON.parse(dataStr);
        if (data.chat_id) lastChatId = data.chat_id;
        if (data.conversation_id) lastConvId = data.conversation_id;
        if (data.id && !lastChatId && currentEvent.startsWith('conversation.chat.')) {
          lastChatId = data.id;
        }
        if (currentEvent === 'conversation.message.delta' && data.content) {
          fullContent += data.content;
          callbacks.onDelta(data.content);
        }
        if (currentEvent === 'conversation.message.completed' && data.role === 'assistant' && data.meta_data) {
          try {
            const ext = data.meta_data;
            const inputT = parseInt(ext.input_tokens || '0') || 0;
            const outputT = parseInt(ext.output_tokens || '0') || 0;
            const totalT = parseInt(ext.token || '0') || 0;
            if (totalT > 0 || inputT > 0 || outputT > 0) {
              tokenUsage = { input: inputT, output: outputT, total: totalT || (inputT + outputT) };
            }
          } catch {}
        }
        if (currentEvent === 'conversation.chat.failed') {
          callbacks.onError(new Error(data.last_error?.msg || '聊天处理失败'));
          return;
        }
      } catch {}
    }
  }
  callbacks.onComplete(lastChatId, lastConvId, tokenUsage);
  callbacks.onStatus?.('complete');
}

export function isBotOpenApiEnabled(connectorIds: string[]): boolean {
  return connectorIds.includes('1024');
}
