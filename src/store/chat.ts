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
    const lowerName = (name || "").toLowerCase();

    const getLabel = (n: string): string => {
      const l = n.toLowerCase();
      const isImgUnderstand = l.includes("understand_image") || l.includes("analyze_image") || l.includes("vision") || l.includes("ocr") || l.includes("describe_image");
      const isImgSearch = l.includes("search_image") || l.includes("image_search");
      const isScreenshot = l.includes("screenshot") || l.includes("take_screenshot") || l.includes("capture_screen");
      const isBgRemove = l.includes("remove_background") || l.includes("rembg") || l.includes("cutout");
      const isVideoStatus = l.includes("video_status") || l.includes("probe_video");
      const isClick = l.includes("click_element") || (l.includes("click") && !l.includes("doubleclick"));
      const isFill = l.includes("fill_form") || l.includes("fill");
      const isGetContent = l.includes("get_content") || l.includes("browser/content");
      const isHttp = l.includes("http_request");
      const isImgGen = !isImgUnderstand && !isImgSearch && !isScreenshot && !isBgRemove &&
        (l.includes("generate_image") || l.includes("text2image") || l.includes("txt2img") || l.includes("draw") || l.includes("paint") || l.includes("dall"));
      const isVideoGen = !isVideoStatus &&
        (l.includes("generate_video") || l.includes("text2video") || l.includes("txt2vid") || l.includes("animate") || l.includes("sora"));
      if (isImgGen) return "生成图片";
      if (isVideoGen) return "生成视频";
      if (isImgUnderstand) return "识别图片";
      if (isImgSearch) return "搜索图片";
      if (isScreenshot) return "截取屏幕";
      if (isBgRemove) return "处理图片";
      if (isVideoStatus) return "查询视频进度";
      if (isClick) return "点击操作";
      if (isFill) return "填写表单";
      if (isGetContent) return "读取网页";
      if (isHttp) return "网络请求";
      if (l.includes("web_search") || l.includes("search")) return "搜索";
      if (l.includes("code") || l.includes("execute") || l.includes("run_code") || l.includes("python")) return "执行代码";
      if (l.includes("read_file") || (l.includes("read") && !l.includes("already"))) return "读取文件";
      if (l.includes("write") || l.includes("create_file")) return "创建文件";
      if (l.includes("edit") || l.includes("modify") || l.includes("update")) return "修改内容";
      if (l.includes("upload") || l.includes("download") || l.includes("file")) return "文件传输";
      if (l.includes("database") || l.includes("sql")) return "数据库操作";
      if (l.includes("translate")) return "翻译";
      if (l.includes("summarize") || l.includes("summary")) return "总结归纳";
      if (l.includes("email") || l.includes("send")) return "发送消息";
      if (l.includes("workflow")) return "执行工作流";
      if (l.includes("github")) return "GitHub操作";
      if (l.includes("memory")) return "检索记忆";
      if (l.includes("list_conversations")) return "查询会话";
      if (l.includes("presign") || l.includes("upload_url")) return "准备上传";
      return "调用工具";
    };

    // Result: mark tool call as done
    if (result) {
      let idx2 = -1;
      if (name) {
        idx2 = state.toolCalls.findIndex(tc => tc.name === name && !tc.result);
      }
      if (idx2 < 0) {
        for (let i = state.toolCalls.length - 1; i >= 0; i--) {
          if (!state.toolCalls[i].result) { idx2 = i; break; }
        }
      }
      if (idx2 >= 0) {
        const updated = [...state.toolCalls];
        updated[idx2] = { ...updated[idx2], result };
        const label = getLabel(updated[idx2].name);
        return { toolCalls: updated, activityStatus: label + "完成" };
      }
      return state;
    }

    if (!name) return state;
    const isDuplicate = args === "" ? false : state.toolCalls.some(tc => tc.name === name && tc.arguments === args);
    if (isDuplicate) return state;

    let genType: "image" | "video" | "general" | null = null;
    const isImgU = lowerName.includes("understand_image") || lowerName.includes("analyze_image") || lowerName.includes("vision") || lowerName.includes("ocr");
    const isImgS = lowerName.includes("search_image") || lowerName.includes("image_search");
    const isScr = lowerName.includes("screenshot") || lowerName.includes("take_screenshot") || lowerName.includes("capture_screen");
    const isBg = lowerName.includes("remove_background") || lowerName.includes("rembg") || lowerName.includes("cutout");
    const isImgGen = !isImgU && !isImgS && !isScr && !isBg &&
      (lowerName.includes("generate_image") || lowerName.includes("text2image") || lowerName.includes("txt2img") || lowerName.includes("draw") || lowerName.includes("paint") || lowerName.includes("dall"));
    const isVideoGen = (lowerName.includes("generate_video") || lowerName.includes("text2video") || lowerName.includes("txt2vid") || lowerName.includes("animate") || lowerName.includes("sora"));
    if (isImgGen) genType = "image";
    else if (isVideoGen) genType = "video";

    const label = getLabel(name);
    return {
      toolCalls: [...state.toolCalls, { id: "tc_" + Date.now() + "_" + Math.random(), name, arguments: args }],
      activityStatus: "正在" + label + "…",
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
