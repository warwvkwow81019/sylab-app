/**
 * Chat Queue Service API
 * 当 SSE 直连断开时，通过任务队列恢复/获取消息
 */

const QUEUE_BASE = 'http://36.137.84.216:9091/chat-queue';

export interface QueueSubmitRequest {
  bot_id: string;
  user_id: string;
  conversation_id?: string;
  additional_messages: Array<{ role: string; content: string; content_type: string }>;
  stream?: boolean;
  auto_save_history?: boolean;
  bearer_token?: string;
}

export interface QueueSubmitResponse {
  task_id: string;
  status: string;
}

export interface QueueStatusResponse {
  task_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  chat_id?: string;
  conversation_id?: string;
  content?: string;
  error?: string;
  events_count?: number;
  created_at?: string;
}

export interface QueueEvent {
  event_type: string;
  data: any;
  index: number;
}

export interface QueueEventsResponse {
  events: QueueEvent[];
  total: number;
  status: string;
}

export const chatQueueApi = {
  submit: async (req: QueueSubmitRequest, bearerToken: string): Promise<QueueSubmitResponse> => {
    const resp = await fetch(`${QUEUE_BASE}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${bearerToken}` },
      body: JSON.stringify(req),
    });
    if (!resp.ok) throw new Error(`Queue submit failed: ${resp.status}`);
    return resp.json();
  },

  getStatus: async (taskId: string): Promise<QueueStatusResponse> => {
    const resp = await fetch(`${QUEUE_BASE}/status/${taskId}`);
    if (!resp.ok) throw new Error(`Queue status failed: ${resp.status}`);
    return resp.json();
  },

  getEvents: async (taskId: string, since: number = 0): Promise<QueueEventsResponse> => {
    const resp = await fetch(`${QUEUE_BASE}/events/${taskId}?since=${since}`);
    if (!resp.ok) throw new Error(`Queue events failed: ${resp.status}`);
    return resp.json();
  },

  cancel: async (taskId: string): Promise<void> => {
    await fetch(`${QUEUE_BASE}/cancel/${taskId}`, { method: 'DELETE' });
  },

  connectStream: (taskId: string, callbacks: {
    onDelta: (text: string) => void;
    onToolCall?: (name: string, args: string, result?: string) => void;
    onComplete: (chatId: string, conversationId: string) => void;
    onError: (error: Error) => void;
  }): { abort: () => void } => {
    const controller = new AbortController();
    const url = `${QUEUE_BASE}/stream/${taskId}`;

    (async () => {
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`Stream failed: ${response.status}`);
        if (!response.body) throw new Error('No stream body');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let currentEvent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) { currentEvent = ''; continue; }
            if (trimmed.startsWith('event:')) { currentEvent = trimmed.slice(6).trim(); continue; }
            if (trimmed.startsWith('data:')) {
              const dataStr = trimmed.slice(5).trim();
              if (!dataStr || dataStr === '[DONE]') {
                if (dataStr === '[DONE]') {
                  const status = await chatQueueApi.getStatus(taskId);
                  callbacks.onComplete(status.chat_id || '', status.conversation_id || '');
                  return;
                }
                continue;
              }
              try {
                const data = JSON.parse(dataStr);
                if (currentEvent === 'conversation.message.delta' && data.content) {
                  callbacks.onDelta(data.content);
                } else if (currentEvent === 'conversation.message.completed') {
                  if (data.type === 'function_call') {
                    const tc = JSON.parse(data.content || '{}');
                    callbacks.onToolCall?.(tc.function?.name || tc.name || 'unknown', tc.function?.arguments || tc.arguments || '{}');
                  } else if (data.type === 'tool_response') {
                    const toolName = data.meta_data?.tool_name || '';
                    callbacks.onToolCall?.(toolName, '', data.content);
                  }
                } else if (currentEvent === 'conversation.chat.completed') {
                  callbacks.onComplete(data.chat_id || data.id || '', data.conversation_id || '');
                  return;
                } else if (currentEvent === 'conversation.chat.failed') {
                  callbacks.onError(new Error(data.last_error?.msg || 'Chat failed'));
                  return;
                }
              } catch (e) {
                console.warn('[ChatQueue] Parse error:', dataStr.substring(0, 100));
              }
            }
          }
        }
      } catch (e: any) {
        if (e.name !== 'AbortError') {
          callbacks.onError(e);
        }
      }
    })();

    return { abort: () => controller.abort() };
  },
};
