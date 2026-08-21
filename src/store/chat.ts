import { create } from 'zustand';

interface ChatMessage {
  id: string;
  conversation_id: string;
  role: string;
  type: string;
  content: string;
  content_type?: string;
  tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
  created_at: string;
  updated_at: string;
}

interface ToolCall {
  id: string;
  name: string;
  arguments: string;
  result?: string;
}

interface ChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingContent: string;
  streamingMessageId: string | null;
  toolCalls: ToolCall[];
  error: string | null;
  // NEW: activity status for typing indicator
  activityStatus: string;
  // NEW: generation type for placeholder
  generatingType: 'image' | 'video' | 'general' | null;

  setMessages: (messages: ChatMessage[]) => void;
  startStreaming: () => void;
  appendDelta: (delta: string) => void;
  appendToolCall: (name: string, args: string, result?: string) => void;
  finishStreaming: (messageId: string) => void;
  clearStreaming: () => void;
  setError: (error: string | null) => void;
  // NEW actions
  setActivityStatus: (status: string) => void;
  setGeneratingType: (type: 'image' | 'video' | 'general' | null) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isStreaming: false,
  streamingContent: '',
  streamingMessageId: null,
  toolCalls: [],
  error: null,
  activityStatus: '',
  generatingType: null,

  setMessages: (messages) => set({ messages }),

  startStreaming: () => set({
    isStreaming: true,
    streamingContent: '',
    streamingMessageId: null,
    toolCalls: [],
    error: null,
    activityStatus: '正在思考理解…',
    generatingType: null,
  }),

  appendDelta: (delta) => set((state) => ({
    streamingContent: state.streamingContent + delta,
    activityStatus: state.generatingType ? state.activityStatus : '正在输入回复…',
  })),

  appendToolCall: (name, args, result?) => set((state) => {
    // If result is provided, update existing tool call
    if (result) {
      let idx = -1;
      if (name) {
        idx = state.toolCalls.findIndex(tc => tc.name === name && !tc.result);
      }
      // If no name or no match by name, find the last unmatched tool call
      if (idx < 0) {
        for (let i = state.toolCalls.length - 1; i >= 0; i--) {
          if (!state.toolCalls[i].result) { idx = i; break; }
        }
      }
      if (idx >= 0) {
        const updated = [...state.toolCalls];
        updated[idx] = { ...updated[idx], result };
        return { toolCalls: updated, activityStatus: '工具调用完成' };
      }
      // No matching tool call found for result, skip adding a new entry
      return state;
    }
    // Prevent duplicate tool calls
    if (!name) return state;
    // Allow status update from onToolCallStart (empty args)
    const isDuplicate = args === '' ? false : state.toolCalls.some(tc => tc.name === name && tc.arguments === args);
    if (isDuplicate) return state;
    // Detect generation type from tool name
    const lowerName = name.toLowerCase();
    let genType: 'image' | 'video' | 'general' | null = null;
    if (lowerName.includes('image') || lowerName.includes('draw') || lowerName.includes('paint') || lowerName.includes('dall')) {
      genType = 'image';
    } else if (lowerName.includes('video') || lowerName.includes('animate') || lowerName.includes('sora')) {
      genType = 'video';
    }

    // Generate status text from tool name
    let statusText = '正在处理中…';
    if (lowerName.includes('image') || lowerName.includes('draw') || lowerName.includes('paint') || lowerName.includes('dall'))
      statusText = '正在生成图片…';
    else if (lowerName.includes('video') || lowerName.includes('animate') || lowerName.includes('sora'))
      statusText = '正在生成视频…';
    else if (lowerName.includes('search') || lowerName.includes('web_search') || lowerName.includes('browse'))
      statusText = '正在搜索中…';
    else if (lowerName.includes('query') || lowerName.includes('fetch') || lowerName.includes('lookup'))
      statusText = '正在查询…';
    else if (lowerName.includes('code') || lowerName.includes('execute') || lowerName.includes('run_code'))
      statusText = '正在执行代码…';
    else if (lowerName.includes('read') || lowerName.includes('read_file'))
      statusText = '正在读取文件…';
    else if (lowerName.includes('write') || lowerName.includes('create_file') || lowerName.includes('create'))
      statusText = '正在创建文件…';
    else if (lowerName.includes('edit') || lowerName.includes('modify') || lowerName.includes('update'))
      statusText = '正在修改内容…';
    else if (lowerName.includes('think') || lowerName.includes('reason'))
      statusText = '正在思考理解…';
    else if (lowerName.includes('analyze') || lowerName.includes('process'))
      statusText = '正在分析数据…';
    else if (lowerName.includes('translate'))
      statusText = '正在翻译内容…';
    else if (lowerName.includes('summarize') || lowerName.includes('summary'))
      statusText = '正在总结归纳…';
    else if (lowerName.includes('upload') || lowerName.includes('download'))
      statusText = '正在处理文件…';
    else if (lowerName.includes('send') || lowerName.includes('email') || lowerName.includes('message'))
      statusText = '正在发送消息…';
    else if (lowerName.includes('database') || lowerName.includes('db') || lowerName.includes('sql'))
      statusText = '正在查询数据库…';
    else if (lowerName.includes('plugin') || lowerName.includes('api'))
      statusText = '正在调用插件…';
    else if (lowerName.includes('workflow') || lowerName.includes('pipeline'))
      statusText = '正在执行工作流…';

    return {
      toolCalls: [...state.toolCalls, { id: `tc_${Date.now()}_${Math.random()}`, name, arguments: args }],
      activityStatus: statusText,
      generatingType: genType !== null ? genType : state.generatingType,
    };
  }),

  finishStreaming: (messageId) => set({
    isStreaming: false,
    streamingContent: '',
    streamingMessageId: null,
    activityStatus: '',
    generatingType: null,
  }),

  clearStreaming: () => set({
    isStreaming: false,
    streamingContent: '',
    streamingMessageId: null,
    toolCalls: [],
    error: null,
    activityStatus: '',
    generatingType: null,
  }),

  setError: (error) => set({
    error,
    isStreaming: false,
    activityStatus: '',
    generatingType: null,
  }),

  setActivityStatus: (status) => set({ activityStatus: status }),
  setGeneratingType: (type) => set({ generatingType: type }),
}));
