import Constants from 'expo-constants';

const API_BASE = Constants.expoConfig?.extra?.EXPO_PUBLIC_API_BASE || 'https://upload-korean-guide-dan.trycloudflare.com';

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

export interface SseCallbacks {
  onDelta: (text: string) => void;
  onToolCall?: (name: string, args: string, result?: string) => void;
  onToolCallStart?: (name: string) => void;
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
 * Uses character-based approximation: ~3 chars per token (mixed Chinese/English).
 */
function estimateTokens(text: string): number {
  if (!text) return 0;
  const len = text.length;
  // Chinese chars: ~1.5 chars/token, English: ~4 chars/token
  // Use average of ~3 chars/token for mixed content
  return Math.ceil(len / 3);
}

export function sendMessageStream(
  body: ChatRequest,
  bearerToken: string,
  callbacks: SseCallbacks
): { abort: () => void } {
  // Coze Studio API requires conversation_id as URL query param, not in body
  const convId = (body as any).conversation_id;
  let url = `${API_BASE}/v3/chat`;
  if (convId) {
    url += `?conversation_id=${encodeURIComponent(convId)}`;
  }
  // Remove non-standard params from body
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
      // No 'connecting' status - keep showing 'thinking' until stream starts
      console.log('[SSE] POST', url);

      // Connect timeout: abort if response headers not received within 90s
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

      // Check if response body is available for streaming
      if (!response.body) {
        // Fallback: read entire response as text and parse SSE events
        console.log('[SSE] No streaming body, reading as text...');
        const text = await response.text();
        console.log('[SSE] Got text response, length:', text.length);
        parseSseText(text, callbacks, lastChatId, lastConversationId);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = '';

      // Don't set 'streaming' yet - wait for first real content delta
      // Status stays 'thinking' until AI actually starts outputting text
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
              // Always try to extract IDs from any event
              if (data.chat_id) lastChatId = data.chat_id;
              if (data.conversation_id) lastConversationId = data.conversation_id;
              if (data.id && !lastChatId) {
                if (currentEvent.startsWith('conversation.chat.')) {
                  lastChatId = data.id;
                }
              }

              // Handle delta events
              if (currentEvent === 'conversation.message.delta') {
                if (data.content) {
                  callbacks.onDelta(data.content);
                  if (data.role === "assistant") fullAssistantContent += data.content;
                  callbacks.onStatus?.('streaming');
                }
                if (data.type === 'function_call' && data.content) {
                  try {
                    const tc = JSON.parse(data.content);
                    const name = tc.function?.name || tc.name || 'unknown';
                    callbacks.onToolCallStart?.(name);
                    callbacks.onToolCall?.(name, tc.function?.arguments || tc.arguments || '{}');
                  } catch {}
                }
                if (data.reasoning_content && !data.content) {
                  callbacks.onStatus?.('thinking');
                }
              }
              // Handle tool calls
              else if (currentEvent === 'conversation.message.completed') {
                // Extract token usage from meta_data (if backend provides it)
                if (data.role === 'assistant' && data.meta_data) {
                  callbacks.onMessageComplete?.();
                
                  try {
                    const ext = data.meta_data;
                    const inputT = parseInt(ext.input_tokens || '0') || 0;
                    const outputT = parseInt(ext.output_tokens || '0') || 0;
                    const totalT = parseInt(ext.token || '0') || 0;
                    if (totalT > 0 || inputT > 0 || outputT > 0) {
                      lastTokenUsage = { input: inputT, output: outputT, total: totalT || (inputT + outputT) };
                    }
                  } catch {}
                }
                // If backend didn't provide token counts, estimate from full content
                if (!lastTokenUsage && data.role === 'assistant' && fullAssistantContent.length > 0) {
                  const outputTokens = estimateTokens(fullAssistantContent);
                  const inputTokens = Math.round(outputTokens * 2); // rough estimate: input ≈ 2x output
                  lastTokenUsage = { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens };
                  console.log('[SSE] Estimated tokens from content:', lastTokenUsage, 'contentLen:', fullAssistantContent.length);
                }
                // Detect function_call events (AI decides to call a tool)
                if (data.type === 'function_call') {
                  try {
                    const tc = JSON.parse(data.content || '{}');
                    const name = tc.function?.name || tc.name || 'unknown';
                    const args = tc.function?.arguments || tc.arguments || '{}';
                    callbacks.onToolCallStart?.(name);
                    callbacks.onToolCall?.(name, args);
                  } catch {}
                }
                // Detect tool_response events (tool result returned)
                if (data.type === 'tool_response') {
                  try {
                    const toolName = data.meta_data?.tool_name || data.meta_data?.plugin || '';
                    callbacks.onToolCall?.(toolName, '', data.content);
                  } catch {}
                }
              }
              // Handle chat completed - extract total usage for the entire run
              else if (currentEvent === 'conversation.chat.completed') {
                try {
                  if (data.usage) {
                    const totalTokens = (data.usage.token_count || 0) || ((data.usage.input_count || 0) + (data.usage.output_count || 0));
                    const inputTokens = data.usage.input_count || 0;
                    const outputTokens = data.usage.output_count || 0;
                    if (totalTokens > 0) {
                      lastTokenUsage = { input: inputTokens, output: outputTokens, total: totalTokens };
                      console.log('[SSE] Chat completed - total usage:', lastTokenUsage);
                    }
                  }
                } catch (e) {
                  console.warn('[SSE] Failed to parse chat completed usage:', e);
                }
              }
              // Handle errors
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

      // Stream ended normally
      console.log('[SSE] Complete. chatId:', lastChatId, 'convId:', lastConversationId);
      callbacks.onComplete(lastChatId, lastConversationId, lastTokenUsage);
      callbacks.onStatus?.('complete');
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('[SSE] Aborted');
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

// Fallback parser for non-streaming responses
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

/**
 * 检查 Bot 是否支持 OpenAPI（connector_ids 包含 1024）
 */
export function isBotOpenApiEnabled(connectorIds: string[]): boolean {
  return connectorIds.includes('1024');
}
