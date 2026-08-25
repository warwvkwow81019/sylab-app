import React, { useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, KeyboardAvoidingView, Platform, StyleSheet, ActivityIndicator, TouchableOpacity, Modal, Alert, Dimensions, StatusBar, TextInput, Animated, ScrollView, Linking, Keyboard } from "react-native";
import { SafeAlert } from "../../src/utils/safeAlert";
// expo-video dynamically imported to prevent native crash on iOS 26
import NetInfo from '@react-native-community/netinfo';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Colors, Spacing, BorderRadius, FontSize } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import { useChatStore } from '../../src/store/chat';
import { useAuthStore } from '../../src/store/auth';
import { Storage } from '../../src/utils/storage';
import { chatApi } from '../../src/api/chat';
import { botApi } from '../../src/api/bot';
import { creditsApi } from '../../src/api/credits';
import { filesApi } from '../../src/api/files';
import { sendMessageStream } from '../../src/api/sse';
import { chatQueueApi } from '../../src/api/chatQueue';
import { useChatQueue } from '../../src/hooks/useChatQueue';
import { MessageBubble } from '../../src/components/MessageBubble';
import { ChatInput, getPendingFiles, clearPendingFiles } from '../../src/components/ChatInput';
import { EmptyState } from '../../src/components/EmptyState';
import { SkeletonLoader } from '../../src/components/SkeletonLoader';
import { TypingIndicator } from '../../src/components/TypingIndicator';
import { GenerationPlaceholder } from '../../src/components/GenerationPlaceholder';
import { Ionicons } from '@expo/vector-icons';
import type { ChatMessage } from '../../src/types/api';

// Safe Clipboard wrapper
const SafeClipboard = {
  setString: (text: string) => {
    try {
      const RN = require('react-native');
      if (RN.Clipboard && RN.Clipboard.setString) {
        RN.Clipboard.setString(text);
      }
    } catch (e) {
      console.warn('[Clipboard] Failed to copy:', e);
    }
  }
};





// Error Boundary to catch crashes and show error instead of white screen
class ChatErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: '' };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error: String(error?.message || error) };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error('[ChatErrorBoundary]', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#fff' }}>
          <Ionicons name="alert-circle" size={48} color="#ef4444" />
          <Text style={{ fontSize: 18, fontWeight: 'bold', marginTop: 16, color: '#1f2937' }}>页面加载出错</Text>
          <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 12, textAlign: 'center' }}>{this.state.error}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}




// Module-level message tracker - survives component remounts
let _sessionMessages: any[] = [];
// Nuclear backup: Map<convId, messages[]> - survives any reset
const _messageBackup = new Map<string, any[]>();

// Helper: match credit transactions to assistant messages by time proximity
const matchTransactionsToMessages = (
  msgs: any[],
  transactions: any[],
  timeWindowMs: number = 60000
): Map<string, number> => {
  const costMap = new Map<string, number>();
  const assistantMsgs = msgs
    .filter((m: any) => m.role === 'assistant' && m.created_at)
    .map((m: any) => ({
      id: m.id,
      ts: Number(m.created_at) < 1e12 ? Number(m.created_at) * 1000 : Number(m.created_at),
    }))
    .sort((a: any, b: any) => a.ts - b.ts);

  const sortedTx = [...transactions]
    .filter((t: any) => t.created_at && t.cost > 0)
    .map((t: any) => ({
      id: t.id,
      ts: new Date(t.created_at).getTime(),
      cost: t.cost,
      used: false,
    }))
    .sort((a: any, b: any) => a.ts - b.ts);

  for (const aMsg of assistantMsgs) {
    let bestTx: any = null;
    let bestDiff = Infinity;
    for (const tx of sortedTx) {
      if (tx.used) continue;
      const diff = Math.abs(tx.ts - aMsg.ts);
      if (diff <= timeWindowMs && diff < bestDiff) {
        bestDiff = diff;
        bestTx = tx;
      }
    }
    if (bestTx) {
      costMap.set(aMsg.id, bestTx.cost);
      bestTx.used = true;
    }
  }
  return costMap;
};

const DEFAULT_BOT_ID = '7669580347859795968';
const DEFAULT_BOT_NAME = 'sylab AI';

// Video generation progress card - matches user screenshot style
function VideoGenerationOverlay({ status, progress }: { status: string; progress: number }) {
  const pulseAnim = React.useRef(new Animated.Value(1)).current;
  const barAnim = React.useRef(new Animated.Value(0)).current;
  const progressAnim = React.useRef(new Animated.Value(15)).current;

  React.useEffect(() => {
    const breathing = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    );
    breathing.start();
    return () => breathing.stop();
  }, []);

  // Animated indeterminate bar that bounces up and down when progress is low
  React.useEffect(() => {
    if (progress < 50) {
      const bounce = Animated.loop(
        Animated.sequence([
          Animated.timing(barAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
          Animated.timing(barAnim, { toValue: 0, duration: 1500, useNativeDriver: true }),
        ])
      );
      bounce.start();
      return () => bounce.stop();
    }
  }, [progress < 50]);

  // Smoothly animate progress bar to actual progress value
  React.useEffect(() => {
    const targetHeight = Math.max(10, Math.min(90, progress || 15));
    Animated.timing(progressAnim, {
      toValue: targetHeight,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const statusText = status === 'polling' || status === 'queued' ? '正在生成中...'
    : status === 'processing' ? '视频渲染中...'
    : status === 'completed' ? '生成完成，加载中...'
    : '正在生成中...';

  const progressHeight = progressAnim;

  return (
    <View style={{ marginHorizontal: 12, marginVertical: 4 }}>
      <View style={{ flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16, padding: 24, minHeight: 120, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2, position: 'relative' }}>
        {/* Center: icon + text */}
        <View style={{ alignItems: 'center' }}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <Ionicons name="videocam-outline" size={36} color="#9ca3af" />
          </Animated.View>
          <Text style={{ marginTop: 12, color: '#9ca3af', fontSize: 15, fontWeight: '500' }}>{statusText}</Text>
          {progress > 0 && progress < 100 && (
            <Text style={{ marginTop: 4, color: '#8B5CF6', fontSize: 12, fontWeight: '600' }}>{progress}%</Text>
          )}
        </View>
        {/* Right side: animated vertical progress bar */}
        <View style={{ position: 'absolute', right: 20, top: '50%', transform: [{ translateY: -30 }], width: 4, height: 60, backgroundColor: '#f3f4f6', borderRadius: 2, overflow: 'hidden' }}>
          {progress < 50 ? (
            <Animated.View style={{
              width: '100%',
              height: '40%',
              backgroundColor: '#8B5CF6',
              borderRadius: 2,
              position: 'absolute',
              bottom: barAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '60%'],
              }),
            }} />
          ) : (
            <Animated.View style={{
              width: '100%',
              height: progressHeight.interpolate({
                inputRange: [10, 90],
                outputRange: ['10%', '90%'],
                extrapolate: 'clamp',
              }),
              backgroundColor: '#8B5CF6',
              borderRadius: 2,
              position: 'absolute',
              bottom: 0,
            }} />
          )}
        </View>
      </View>
      <Text style={{ textAlign: 'center', marginTop: 10, color: '#d1d5db', fontSize: 12 }}>视频任务耗时较长，完成后会通知您</Text>
    </View>
  );
}

// Completed video card - inline video playback
function CompletedVideoCard({ videoUrl, isDark }: { videoUrl: string; isDark: boolean }) {
  if (!videoUrl) return null;
  if (Platform.OS === 'web') {
    return (
      <View style={{ marginHorizontal: 12, marginVertical: 6 }}>
        <View style={{ backgroundColor: isDark ? '#1e293b' : '#fff', borderRadius: 16, padding: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Ionicons name="videocam" size={20} color="#8B5CF6" />
            <Text style={{ color: isDark ? '#f1f5f9' : '#1f2937', fontSize: 14, fontWeight: '600', marginLeft: 8 }}>视频已生成</Text>
          </View>
          <video src={videoUrl} controls style={{ width: '100%', maxWidth: 480, borderRadius: 12, backgroundColor: '#000' }} />
        </View>
      </View>
    );
  }
  return <NativeVideoPlayer videoUrl={videoUrl} isDark={isDark} />;
}

// Error boundary for native video player
class NativeVideoErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ marginHorizontal: 12, marginVertical: 6, padding: 20, backgroundColor: '#f3f4f6', borderRadius: 16, alignItems: 'center' }}>
          <Ionicons name="videocam-off-outline" size={28} color="#9ca3af" />
          <Text style={{ color: '#6b7280', fontSize: 13, marginTop: 8 }}>视频播放不可用</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

function NativeVideoPlayer({ videoUrl, isDark }: { videoUrl: string; isDark: boolean }) {
  const [videoModule, setVideoModule] = useState<{ useVideoPlayer: any; VideoView: any } | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!videoUrl || Platform.OS === 'web') return;
    let mounted = true;
    import('expo-video').then(mod => {
      if (mounted) setVideoModule({ useVideoPlayer: mod.useVideoPlayer, VideoView: mod.VideoView });
    }).catch(() => {
      if (mounted) setLoadError(true);
    });
    return () => { mounted = false; };
  }, [videoUrl]);

  if (!videoUrl || typeof videoUrl !== 'string') return null;
  if (loadError) {
    return (
      <View style={{ marginHorizontal: 12, marginVertical: 6, padding: 20, backgroundColor: '#f3f4f6', borderRadius: 16, alignItems: 'center' }}>
        <Ionicons name="videocam-off-outline" size={28} color="#9ca3af" />
        <Text style={{ color: '#6b7280', fontSize: 13, marginTop: 8 }}>视频播放不可用</Text>
      </View>
    );
  }
  if (!videoModule) {
    return (
      <View style={{ marginHorizontal: 12, marginVertical: 6, padding: 20, backgroundColor: isDark ? '#1e293b' : '#fff', borderRadius: 16, alignItems: 'center' }}>
        <ActivityIndicator size="small" color="#8B5CF6" />
        <Text style={{ color: isDark ? '#94a3b8' : '#6b7280', fontSize: 13, marginTop: 8 }}>加载视频播放器...</Text>
      </View>
    );
  }
  return (
    <NativeVideoErrorBoundary>
      <NativeVideoPlayerInner videoUrl={videoUrl} isDark={isDark} useVideoPlayer={videoModule.useVideoPlayer} VideoView={videoModule.VideoView} />
    </NativeVideoErrorBoundary>
  );
}

function NativeVideoPlayerInner({ videoUrl, isDark, useVideoPlayer, VideoView }: { videoUrl: string; isDark: boolean; useVideoPlayer: any; VideoView: any }) {
  const player = useVideoPlayer(videoUrl, (p: any) => { p.loop = false; });
  return (
    <View style={{ marginHorizontal: 12, marginVertical: 6 }}>
      <View style={{ backgroundColor: isDark ? '#1e293b' : '#fff', borderRadius: 16, padding: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Ionicons name="videocam" size={20} color="#8B5CF6" />
          <Text style={{ color: isDark ? '#f1f5f9' : '#1f2937', fontSize: 14, fontWeight: '600', marginLeft: 8 }}>视频已生成</Text>
        </View>
        <VideoView player={player} style={{ width: '100%', height: 220, borderRadius: 12, backgroundColor: '#000' }} contentFit="contain" allowsFullscreen allowsPictureInPicture />
      </View>
    </View>
  );
}

// Strip technical info (task_id, API URLs) from AI message for display
const sanitizeVideoContent = (text: string): string => {
  if (!text) return text;
  let result = text;
  // Remove any line containing task_id or task_xxx
  result = result.replace(/^.*task_[A-Za-z0-9_]{10,}.*$/gm, '');
  // Remove lines containing 任务ID
  result = result.replace(/^[^\n]*任务ID[^\n]*/gm, '');
  // Remove lines containing 状态：
  result = result.replace(/^[^\n]*状态[：:][^\n]*/gm, '');
  // Remove lines containing 进度：xx% or 进度 xx%
  result = result.replace(/^[^\n]*进度[\s：:]*\d+%[^\n]*/gm, '');
  // Remove 当前状态 lines
  result = result.replace(/^当前状态[：:][^\n]*$/gm, '');
  // Remove **最终状态：** header
  result = result.replace(/[*]*最终状态[*]*[：:][^\n]*/gi, '');
  // Remove **任务信息：** header
  result = result.replace(/[*]*任务信息[*]*[：:][^\n]*/gi, '');
  // Remove **视频正在生成中** and similar markdown status lines
  result = result.replace(/^[^\n]*\*\*视频正在生成中[^\n]*/gm, '');
  // Remove **视频已生成完成** lines
  result = result.replace(/^[^\n]*\*\*视频已生成完成[^\n]*/gm, '');
  // Remove **关于视频链接：** lines
  result = result.replace(/^[^\n]*\*\*关于视频链接[^\n]*/gm, '');
  // Remove emoji+bold status lines like ✅**xxx** or ️**xxx**
  result = result.replace(/^[\s]*[✅⚠️📋🎬]*\s*\*\*[^*]+\*\*[^\n]*/gm, '');
  // Remove --- separator lines
  result = result.replace(/^---+$/gm, '');
  // Remove empty ** lines
  result = result.replace(/^\*\*\s*$/gm, '');
  // Remove empty lines left behind
  result = result.replace(/\n{3,}/g, '\n\n');
  return result.trim();
};


const stripMarkdown = (text: string): string => {
  if (!text) return "";
  return text
    .replace(/<img\s[^>]*alt="([^"]*)"[^>]*>/gi, (_, alt) => alt ? `[图片: ${alt}]` : "[图片]")
    .replace(/<img\s[^>]*>/gi, "[图片]")
    .replace(/<[^>]+>/g, "")
    .replace(/#{1,6}\s*/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/!\[.*?\]\(.+?\)/g, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/\n+/g, " ")
    .trim();
};

const formatTime = (ts: any): string => {
  if (!ts) return "";
  const num = Number(ts);
  if (isNaN(num) || num === 0) return "";
  const ms = num < 1e12 ? num * 1000 : num;
  const date = new Date(ms);
  if (isNaN(date.getTime())) return "";
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const isThisYear = date.getFullYear() === now.getFullYear();
  if (isToday) {
    const h = date.getHours().toString().padStart(2, "0");
    const m = date.getMinutes().toString().padStart(2, "0");
    return `${h}:${m}`;
  }
  if (isThisYear) {
    const mo = (date.getMonth() + 1).toString().padStart(2, "0");
    const d = date.getDate().toString().padStart(2, "0");
    return `${mo}/${d}`;
  }
  const y = date.getFullYear();
  const mo = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}/${mo}/${d}`;
};

function ChatDetailScreenInner() {
  const { id, bot_id, prompt } = useLocalSearchParams<{ id: string; bot_id?: string; prompt?: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const streamRef = useRef<{ abort: () => void } | null>(null);
  const queueTaskIdRef = useRef<string | null>(null);
  const ssePollingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const { registerTask, clearTask, activeTaskRef, getActiveTask } = useChatQueue(id as string);

  const scrollToBottom = () => {
    flatListRef.current?.scrollToEnd({ animated: true });
  };

  const handleScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
    const shouldShow = distanceFromBottom > 200;
    setShowScrollBtn(prev => prev !== shouldShow ? shouldShow : prev);
  };


  const { user, patToken, isRestoring } = useAuthStore();
  const userName = (() => {
    const n = user?.name || '';
    return /^\d+$/.test(n.trim()) ? '用户' : (n || '用户');
  })();
  const userAvatar = user?.avatar_url || '';
  const {
    messages, isStreaming, streamingContent, streamingMessageId,
    toolCalls, error,
    setMessages, appendDelta, appendToolCall, finishStreaming,
    clearStreaming, setError, startStreaming,
    activityStatus, generatingType,
    setActivityStatus,
  } = useChatStore();

  const [loading, setLoading] = useState(true);
  const [botName, setBotName] = useState(DEFAULT_BOT_NAME);
  const [botAvatar, setBotAvatar] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [currentBotId, setCurrentBotId] = useState<string>(
    bot_id || DEFAULT_BOT_ID
  );
  const [initError, setInitError] = useState<string | null>(null);
  const [debugError, setDebugError] = useState<string | null>(null);
  // Bot selector
  const [showBotSelector, setShowBotSelector] = useState(false);
  const [availableBots, setAvailableBots] = useState<Array<{id: string; name: string; icon_url?: string}>>([]);
  // Video task polling
  const [videoTasks, setVideoTasks] = useState<Map<string, {taskId: string; status: string; url?: string; progress?: number; msgId?: string}>>(new Map());
  const videoPollingRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  // Failed messages for retry
  const [failedMessages, setFailedMessages] = useState<Set<string>>(new Set());

  // Long press action menu
  const [longPressMenu, setLongPressMenu] = useState<{
    visible: boolean;
    message: ChatMessage | null;
  }>({ visible: false, message: null });

  // Quote state
  const [quotedMessage, setQuotedMessage] = useState<ChatMessage | null>(null);

  // Message queue for continuous sending
  const messageQueueRef = useRef<Array<{ text: string; files?: any[]; fileIds?: string[] }>>([]);
  // Track which user message each AI reply is responding to
  const [replyToMap, setReplyToMap] = useState<Record<string, { role: string; content: string }>>({});
  const lastUserMsgRef = useRef<ChatMessage | null>(null);
  const pendingFilesRef = useRef<Array<{blob: Blob, name: string, type: string}>>([]);
  // Track when last tool completed, to keep "X完成" visible briefly
  const lastToolCompleteRef = useRef<number>(0);

  // Pagination
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);

  // Network status
  const [isOffline, setIsOffline] = useState(false);
  const { isDark, Colors: C } = useTheme();

  // Message search
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Message costs tracking
  const [messageCosts, setMessageCosts] = useState<Map<string, number>>(() => new Map());
  const costsVersionRef = useRef(0);


  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      setIsOffline(!state.isConnected);
    });
    return () => unsub();
  }, []);

  // Keyboard height tracking for iOS input avoidance
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);


  const lastScrollTimeRef = useRef(0);
  // Auto-scroll when activity status or streaming content changes
  useEffect(() => {
    if (useChatStore.getState().isStreaming) {
      const now = Date.now();
      if (now - lastScrollTimeRef.current > 300) {
        lastScrollTimeRef.current = now;
        setTimeout(() => scrollToBottom(), 100);
      }
    }
  }, [activityStatus, streamingContent, generatingType, isStreaming]);

  const lastLoadMoreRef = useRef(0);
  const loadMoreMessages = async () => {
    const now = Date.now();
    if (loadingMoreRef.current || !hasMore || isNewChat || (now - lastLoadMoreRef.current < 2000)) return;
    lastLoadMoreRef.current = now;
    const convId = conversationId || id || "";
    if (!convId) return;
    
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const result = await chatApi.getMessages(convId, { page_num: nextPage, page_size: 50 });
      const msgs = (result.items || []).filter((m: any) => m && m.id && (m.role === 'user' || (m.content && m.content.trim()))).reverse();
      if (msgs.length === 0) {
        setHasMore(false);
      } else {
        const prev = useChatStore.getState().messages;
        const validMsgs = msgs.filter((m: any) => m && m.id);
        const existingIds = new Set(prev.map(m => m.id).filter(Boolean));
        const newMsgs = validMsgs.filter((m: any) => !existingIds.has(m.id));
        if (newMsgs.length > 0) {
          setMessages([...newMsgs, ...prev]);
        }
        setPage(nextPage);
      }
    } catch (e) {
      console.warn('[Chat] loadMore failed:', e);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  };




  const isNewChat = !!bot_id && bot_id !== id;

  useEffect(() => {
    navigation.setOptions({
      title: botName,
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginRight: 8 }}>
          <TouchableOpacity onPress={() => { fetchBots(); setShowBotSelector(true); }}>
            <Ionicons name="swap-horizontal" size={20} color="#6030ff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowSearch(!showSearch)}>
            <Ionicons name={showSearch ? "close" : "search"} size={22} color="#6030ff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push(`/projects/${conversationId || id}`)}>
            <Ionicons name="folder" size={22} color="#6030ff" />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [botName, conversationId, id]);

  // Track last processed conversation to avoid re-fetching when user changes
  const lastProcessedConvRef = useRef<string | null>(null);

  useEffect(() => {
    // Abort any in-flight stream from a previous conversation before switching
    if (streamRef.current) {
      try { streamRef.current.abort(); } catch (e) {}
      streamRef.current = null;
    }
    // Reset streaming state so stale "connecting" indicator never carries over
    if (useChatStore.getState().isStreaming) {
      console.log('[Chat] Resetting stale streaming state on conversation switch');
      useChatStore.getState().clearStreaming();
    }

    let cancelled = false;

    const init = async () => {
      console.log('[Chat] Init called, id:', id, 'user:', !!user, 'isRestoring:', isRestoring);
      if (!id) { 
        
        return; 
      }
      // Wait for auth to restore
      if (isRestoring || !user) {
        setLoading(true);
        // Safety timeout - dont get stuck forever
        setTimeout(() => setLoading(false), 8000);
        return;
      }
      // Skip if already loaded this conversation
      if (lastProcessedConvRef.current === id) { 
      
        return; 
      }
      lastProcessedConvRef.current = id;
      

      // Clear old messages when switching conversations
      setMessages([]);
      _sessionMessages = [];
      setPage(1);
      setHasMore(true);

      try {
        if (isNewChat) {
          setCurrentBotId(bot_id!);
          const conv = await chatApi.createConversation(bot_id!, '', user.id);
          const convId = conv?.id || conv?.conversation_id || '';
          if (!cancelled) {
            if (convId) {
              setConversationId(convId);
              setMessages([]);
              _sessionMessages = [];
            } else {
              setInitError('创建对话失败');
            }
          }
        } else {
          setConversationId(id);
          const result = await chatApi.getMessages(id, { page_num: 1, page_size: 50 });
          const msgs = (result.items || []).filter((m: any) => m && m.id && (m.role === 'user' || (m.content && m.content.trim())));
          msgs.reverse();
          if (!cancelled) {
            
            setMessages(msgs);
            _sessionMessages = msgs;
            _messageBackup.set(id as string, msgs);
            // Batch query transactions for historical cost matching
            try {
              const txResult = await creditsApi.getTransactions(user.id, { page: 1, page_size: 50 });
              const txItems = txResult.items || [];
              if (txItems.length > 0) {
                const costMap = matchTransactionsToMessages(msgs, txItems, 120000);
                if (costMap.size > 0) {
                  setMessageCosts(costMap);
                }
              }
            } catch (e) {
              console.warn("[Chat] Failed to load transaction costs:", e);
            }
          }
        }
      } catch (e: any) {
        console.error("[Chat] Init failed:", e?.message, e?.response?.status, e?.stack);
          setDebugError(e?.message || String(e));
        if (!cancelled) {
          setMessages([]);
          _sessionMessages = [];
          setInitError(e?.message || '加载消息失败');
        }
      } finally {
        if (!cancelled) {
          
          setLoading(false);
        }
      }
    };
    
    init();
    return () => {
      cancelled = true;
      if (ssePollingTimerRef.current) { clearTimeout(ssePollingTimerRef.current); ssePollingTimerRef.current = null; }
      // Abort SSE when navigating away from this chat screen
      if (streamRef.current) {
        try { streamRef.current.abort(); } catch (e) {}
        streamRef.current = null;
      }
    };
  }, [id, user, isRestoring]);


  // === Recover pending queue task after page remount ===
  useEffect(() => {
    const recoverPendingTask = async () => {
      // Clear any orphaned localStorage tasks from previous conversations
      if (!user) return;
      // Check for active task belonging to THIS conversation
      const task = getActiveTask(id as string);
      if (!task) {
        // No task for this conversation - clean up any orphaned tasks
        try {
          if (Platform.OS === 'web') {
            const keys = Object.keys(localStorage).filter(k => k.startsWith('sylab_active_queue_task_') && !k.endsWith(id as string));
            keys.forEach(k => localStorage.removeItem(k));
          }
        } catch(e) {}
        return;
      }
      if (!task.isStreaming) return;
      // Double-check: only recover tasks belonging to THIS conversation
      if (task.conversationId !== id) {
        console.log('[ChatQueue] Skipping task from different conversation:', task.conversationId, 'vs', id);
        return;
      }

      console.log('[ChatQueue] Recovering pending task on mount:', task.taskId);
      try {
        const status = await chatQueueApi.getStatus(task.taskId);
        if (status.status === 'processing') {
          // Task still running on server - reconnect stream
          console.log('[ChatQueue] Task still processing, resuming stream');
          startStreaming();
          chatQueueApi.connectStream(task.taskId, {
            onDelta: (text) => appendDelta(text),
            onComplete: (chatId) => {
              finishStreaming(chatId || `msg_${Date.now()}`);
              clearTask();
            },
            onError: (err) => {
              console.error('[ChatQueue] Recovery stream error:', err);
              // Fall back to polling
              const pollRecovery = async () => {
                const t = getActiveTask();
                if (!t || t.taskId !== task.taskId) return;
                try {
                  const st = await chatQueueApi.getStatus(task.taskId);
                  if (st.status === 'completed') {
                    const { events } = await chatQueueApi.getEvents(task.taskId, t.lastEventIndex);
                    for (const event of events) {
                      t.lastEventIndex = event.index + 1;
                      if (event.event_type === 'conversation.message.delta' && event.data?.content) {
                        appendDelta(event.data.content);
                      }
                    }
                    finishStreaming(st.chat_id || `msg_${Date.now()}`);
                    clearTask();
                  } else if (st.status === 'failed') {
                    setError(st.error || 'Background task failed');
                    finishStreaming(`msg_${Date.now()}`);
                    clearTask();
                  } else {
                    const { events } = await chatQueueApi.getEvents(task.taskId, t.lastEventIndex);
                    for (const event of events) {
                      t.lastEventIndex = event.index + 1;
                      if (event.event_type === 'conversation.message.delta' && event.data?.content) {
                        appendDelta(event.data.content);
                      }
                    }
                    setTimeout(pollRecovery, 3000);
                  }
                } catch (pe) {
                  setTimeout(pollRecovery, 5000);
                }
              };
              setTimeout(pollRecovery, 2000);
            },
          });
        } else if (status.status === 'completed') {
          // Task completed while we were away - fetch results
          console.log('[ChatQueue] Task completed while away, recovering results');
          startStreaming();
          const { events } = await chatQueueApi.getEvents(task.taskId, task.lastEventIndex);
          for (const event of events) {
            task.lastEventIndex = event.index + 1;
            if (event.event_type === 'conversation.message.delta' && event.data?.content) {
              appendDelta(event.data.content);
            }
          }
          finishStreaming(status.chat_id || `msg_${Date.now()}`);
          clearTask();
        } else if (status.status === 'failed') {
          setError(status.error || 'Background task failed');
          clearTask();
        }
      } catch (e) {
        console.error('[ChatQueue] Recovery failed:', e);
        clearTask();
      }
    };

    recoverPendingTask();
  }, []);

  // Auto-scroll useEffect removed to prevent infinite scroll loop

  const handleLongPress = (message: ChatMessage) => {
    setLongPressMenu({ visible: true, message });
  };

  const closeMenu = () => {
    setLongPressMenu({ visible: false, message: null });
  };

  const handleCopy = () => {
    if (!longPressMenu.message) return;
    const plainText = stripMarkdown(longPressMenu.message.content || '');
    closeMenu();
    if (Platform.OS === 'web') {
      // Web端统一用prompt兜底，兼容iOS Safari HTTP等所有环境
      setTimeout(() => {
        window.prompt('复制消息（长按文字可手动复制）：', plainText);
      }, 100);
    } else {
      SafeClipboard.setString(plainText);
      SafeAlert.alert('已复制');
    }
  };

  const handleQuote = () => {
    if (!longPressMenu.message) return;
    setQuotedMessage(longPressMenu.message);
    closeMenu();
  };



  const processQueue = async () => { console.log("[Queue] processQueue called, queueLen:", messageQueueRef.current.length, "isStreaming:", useChatStore.getState().isStreaming, "convId:", conversationId || id);
    if (messageQueueRef.current.length === 0 || useChatStore.getState().isStreaming) { console.log("[Queue] EXIT: len=0 or streaming"); return; }
    const next = messageQueueRef.current.shift()!;
    await doSend(next.text, next.files, next.fileIds, (conversationId || id || "") as string, true);
  };

  const effectiveConvId = conversationId || id || '';

  const handleSend = async (text: string, _files?: any[], fileIds?: string[]) => {
    if (!patToken) return; if (!text.trim() && (!fileIds || fileIds.length === 0)) return;

    // Ensure conversationId is set; create conversation if needed
    let currentConvId = conversationId || id;
    if (!currentConvId) {
      try {
        const conv = await chatApi.createConversation(currentBotId, '', user?.id || '');
        if (conv?.id) {
          currentConvId = conv.id;
          setConversationId(conv.id);
          // Update URL to the new conversation
          router.replace(`/chat/${conv.id}`);
        } else {
          console.error('[Chat] Failed to create conversation for quote');
          return;
        }
      } catch (e) {
        console.error('[Chat] Create conversation failed:', e);
        return;
      }
    }
    
    // If already streaming, queue the message
    if (useChatStore.getState().isStreaming) {
      messageQueueRef.current.push({ text, files: _files, fileIds }); console.log("[Queue] message QUEUED:", (text || "").substring(0,30), "total:", messageQueueRef.current.length);
      // Still add user message to display immediately
      const userMsg: ChatMessage = {
        id: `msg_${Date.now()}`,
        conversation_id: effectiveConvId,
        role: 'user',
        type: 'text',
        content: text,
        content_type: 'text',
        created_at: String(Date.now()),
        updated_at: String(Date.now()),
      };
      lastUserMsgRef.current = userMsg;
      setMessages([...useChatStore.getState().messages, userMsg]);
      _sessionMessages = [..._sessionMessages, userMsg];
      return;
    }
    
    await doSend(text, _files, fileIds, currentConvId as string);
  };

  const doSend = async (text: string, _files?: any[], fileIds?: string[], forcedConvId?: string, skipUserMsg?: boolean) => {
    const effectiveConvId = forcedConvId || conversationId || id || '';

    let finalContent = text;
    if (quotedMessage) {
      const quoteRole = quotedMessage.role === 'user' ? '我' : 'AI';
      const quotePreview = stripMarkdown(quotedMessage.content || '').substring(0, 300);
      finalContent = `[引用${quoteRole}的消息]：「${quotePreview}」\n\n${text}`;
      setQuotedMessage(null);
    }

    if (!skipUserMsg) {
    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      conversation_id: effectiveConvId,
      role: 'user',
      type: 'text',
      content: finalContent,
      content_type: 'text',
      created_at: String(Date.now()),
      updated_at: String(Date.now()),
    };
    lastUserMsgRef.current = userMsg;
    setMessages([...useChatStore.getState().messages, userMsg]);
      _sessionMessages = [..._sessionMessages, userMsg];
      // Save to nuclear backup immediately
      const backupKey = effectiveConvId || 'pending';
      const existing = _messageBackup.get(backupKey) || [];
      _messageBackup.set(backupKey, [...existing, userMsg]);
    }
    startStreaming();

    const aiContent = finalContent;

    // Build additional_messages: combine files + text into object_string for multimodal support
    const additionalMsgs: Array<{ role: string; content: string; content_type: string }> = [];
    if (fileIds && fileIds.length > 0) {
      // Use object_string (mix) format to send files + text together as one message
      const contentParts: Array<{ type: string; text?: string; file_id?: string }> = [];
      for (const fid of fileIds) {
        contentParts.push({ type: 'file', file_id: fid });
      }
      contentParts.push({ type: 'text', text: aiContent });
      additionalMsgs.push({
        role: 'user',
        content: JSON.stringify(contentParts),
        content_type: 'object_string',
      });
    } else {
      additionalMsgs.push({
        role: 'user',
        content: aiContent,
        content_type: 'text',
      });
    }

    // === LOCAL CAPTURE: immune to component remounts and store resets ===
    const localUserContent = finalContent;
    const localConvId = conversationId;
    let localAiAccum = "";

    // === Chat Queue: submit task for background resilience (fire-and-forget, don't block SSE) ===
    let queueSubmitResolve: ((id: string) => void) | null = null;
    const queueSubmitPromise = new Promise<string>((res) => { queueSubmitResolve = res; });
    chatQueueApi.submit({
      bot_id: currentBotId,
      user_id: user?.id || 'app_user',
      conversation_id: effectiveConvId || undefined,
      additional_messages: additionalMsgs,
      stream: true,
      auto_save_history: true,
      bearer_token: patToken || '',
    }, patToken || '').then((queueResp) => {
      queueTaskIdRef.current = queueResp.task_id;
      registerTask(queueResp.task_id, effectiveConvId || '');
      console.log('[ChatQueue] Task submitted:', queueResp.task_id);
      if (queueSubmitResolve) queueSubmitResolve(queueResp.task_id);
    }).catch((qe) => {
      console.warn('[ChatQueue] Submit failed (non-blocking):', qe);
      if (queueSubmitResolve) queueSubmitResolve('');
    });



    setActivityStatus("thinking");
    streamRef.current = sendMessageStream(
      {
        bot_id: currentBotId,
        user_id: user?.id || 'app_user',
        conversation_id: effectiveConvId || undefined,
        additional_messages: additionalMsgs,
        stream: true,
        auto_save_history: true,
      },
      patToken || "",
      {
        onDelta: (delta) => {
          localAiAccum += delta;
          appendDelta(delta);
        },
        onToolCall: (name, args, result) => {
          if (result) {
            lastToolCompleteRef.current = Date.now();
          }
          appendToolCall(name, args, result);
          // Detect video task_id from tool result and start polling immediately
          if (result && (name === 'video_generate' || name === 'generate_video')) {
            try {
              const parsed = typeof result === 'string' ? JSON.parse(result) : result;
              const resultData = typeof parsed.data === 'string' ? JSON.parse(parsed.data) : (parsed.data || parsed);
              const taskId = resultData.task_id || resultData.taskId;
              if (taskId && taskId.startsWith('task_')) {
                console.log('[Video] Detected task_id from tool result:', taskId);
                // Store for later msgId association
                if (!(globalThis as any).__pendingVideoTasks) (globalThis as any).__pendingVideoTasks = [];
                (globalThis as any).__pendingVideoTasks.push(taskId);
                // Start polling immediately with empty msgId (will be updated in onComplete)
                startVideoPolling(taskId, '');
              }
            } catch (e) {
              console.warn('[Video] Failed to parse tool result:', e);
            }
          }
        },
        onComplete: (chatId, convId, tokens) => {
          try {
          // Clear queue task - SSE completed normally
          // Cancel standby queue task: wait briefly for submit promise to resolve,
          // then cancel with a retry so a fast SSE completion can never cause duplicate messages.
          (async () => {
            try {
              const tid = await Promise.race([
                queueSubmitPromise,
                new Promise<string>((r) => setTimeout(() => r(queueTaskIdRef.current || ''), 3000)),
              ]);
              const taskId = tid || queueTaskIdRef.current;
              if (taskId) {
                for (let attempt = 0; attempt < 3; attempt++) {
                  try {
                    await chatQueueApi.cancel(taskId);
                    console.log('[ChatQueue] Cancelled standby task:', taskId);
                    break;
                  } catch (ce) {
                    console.warn('[ChatQueue] Cancel attempt', attempt + 1, 'failed:', ce);
                    await new Promise((r) => setTimeout(r, 400));
                  }
                }
              }
            } catch (e) {
              console.warn('[ChatQueue] Cancel flow error:', e);
            }
          })();
          clearTask();
          // Use closure-captured content (immune to store/state resets)
          const capturedAiContent = localAiAccum || useChatStore.getState().streamingContent;
          const aiMsgId = chatId || `msg_${Date.now()}`;
          // FIX: Add final AI message BEFORE finishStreaming to prevent render gap
          if (capturedAiContent) {
            // Capture toolCalls from store BEFORE finishStreaming clears them
            const savedToolCalls = useChatStore.getState().toolCalls;
            const aiMsg: ChatMessage = {
              id: aiMsgId,
              conversation_id: convId || effectiveConvId || '',
              role: 'assistant',
              type: 'text',
              content: capturedAiContent,
              content_type: 'markdown',
              tool_calls: savedToolCalls.length > 0 ? savedToolCalls.map(tc => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: tc.arguments || '{}' } })) : undefined,
              created_at: String(Date.now()),
              updated_at: String(Date.now()),
            };
            const _cur = useChatStore.getState().messages; setMessages([..._cur.filter(m => m.id !== aiMsgId), aiMsg]);
          }
          finishStreaming(aiMsgId);
          console.log("[Chat] onComplete: localAi:", localAiAccum.length, "localUser:", localUserContent.length, "sessionMsgs:", _sessionMessages.length, "tokens:", tokens);
          // Save reply-to mapping
          if (lastUserMsgRef.current) {
            setReplyToMap(prev => ({
              ...prev,
              [aiMsgId]: { role: lastUserMsgRef.current!.role, content: lastUserMsgRef.current!.content || '' },
            }));
          }
          // Token-based billing: deduct credits based on actual token usage
          const currentAiMsgId = aiMsgId;
          if (tokens && tokens.total > 0) {
            setTimeout(async () => {
              try {
                const userId = user?.id || 'app_user';
                const result = await creditsApi.deductByTokens(userId, tokens.total);
                const costNum = parseFloat(result.cost) || 0;
                if (costNum > 0) {
                  setMessageCosts(prev => {
                    const next = new Map(prev);
                    next.set(currentAiMsgId, costNum);
                    return next;
                  });
                  console.log('[Chat] Token deduction:', tokens.total, 'tokens -> cost:', costNum);
                }
              } catch (e) {
                console.warn('[Chat] Token deduction failed (non-blocking):', e);
              }
            }, 100);
          } else {
            // Fallback: query recent transaction for legacy cost matching
            setTimeout(async () => {
              try {
                const userId = user?.id || 'app_user';
                const txResult = await creditsApi.getTransactions(userId, { page: 1, page_size: 3 });
                const txItems = txResult.items || [];
                const now = Date.now();
                for (const tx of txItems) {
                  const txTime = new Date(tx.created_at).getTime();
                  if (Math.abs(txTime - now) < 30000 && tx.cost > 0) {
                    setMessageCosts(prev => {
                      const next = new Map(prev);
                      next.set(currentAiMsgId, tx.cost);
                      return next;
                    });
                    break;
                  }
                }
              } catch (e) {
                console.warn('[Chat] Failed to query transaction cost:', e);
              }
            }, 500);
          }
          // Detect and poll video tasks in AI response
          if (capturedAiContent) {
            detectAndPollVideoTasks(capturedAiContent, aiMsgId);
          }
          // Also associate pending video tasks (detected from tool results) with this AI message
          if ((globalThis as any).__pendingVideoTasks && (globalThis as any).__pendingVideoTasks.length > 0) {
            const pendingTaskIds = (globalThis as any).__pendingVideoTasks;
            (globalThis as any).__pendingVideoTasks = [];
            for (const taskId of pendingTaskIds) {
              setVideoTasks(prev => {
                const next = new Map(prev);
                const existing = next.get(taskId);
                if (existing && !existing.msgId) {
                  next.set(taskId, { ...existing, msgId: aiMsgId });
                }
                return next;
              });
            }
          }
          // Process next queued message
          setTimeout(() => { const checkAndProcess = () => { if (!useChatStore.getState().isStreaming) { processQueue(); } else { setTimeout(checkAndProcess, 200); } }; checkAndProcess(); }, 300);
          // Determine the real conversation ID (prefer server-returned convId)
          const realConvId = convId || effectiveConvId;
          if (convId && !conversationId) {
            setConversationId(convId);
          }
          // Upload pending files (from new conversation with no convId at send time)
          if (realConvId) {
            const pendingFiles = getPendingFiles();
            if (pendingFiles.length > 0) {
              for (const pf of pendingFiles) {
                fetch('https://s.symsgf.xyz/project-files/api/files/upload', {
                  method: 'POST',
                  headers: {
                    'X-Conversation-Id': realConvId,
                    'X-File-Name': pf.name,
                    'Content-Type': pf.type,
                  },
                  body: pf.blob,
                }).catch(e => console.warn('[Chat] Pending file upload failed:', e));
              }
              clearPendingFiles();
            }
            // Also try sync for backward compatibility
            const tempId = id as string;
            if (tempId && tempId !== realConvId) {
              filesApi.sync(tempId, realConvId).then(result => {
                if (result.synced > 0) {
                  console.log(`[Chat] Synced ${result.synced} files from ${tempId} to ${realConvId}`);
                }
              }).catch((e: any) => console.warn('[Chat] File sync failed:', e.message));
            }
          }
          const saveConvId = realConvId;
          // === IMMEDIATE SAVE using closure-captured variables ===
          if (saveConvId) {
            const saveMessages: Array<{role: string; content: string; created_at: string}> = [];
            // User message from closure (always available)
            if (localUserContent) {
              saveMessages.push({ role: 'user', content: localUserContent, created_at: String(Date.now()) });
            }
            // AI message from closure accumulator
            if (capturedAiContent) {
              saveMessages.push({ role: 'assistant', content: capturedAiContent, created_at: String(Date.now()) });
            }
            if (saveMessages.length > 0) {
              console.log("[Chat] Saving chat log. convId:", saveConvId, "msgs:", saveMessages.length, "userLen:", localUserContent.length, "aiLen:", capturedAiContent.length);
              filesApi.saveChatLog(saveConvId, saveMessages).catch(e => {
                console.warn("[Chat] Immediate save failed:", e);
              });
            }
            // Backup: fetch from Coze API after 3s to ensure complete history
            setTimeout(async () => {
              try {
                const msgResult = await chatApi.getMessages(saveConvId, { page_num: 1, page_size: 50 });
                const apiMessages = (msgResult.items || []).filter((m: any) => m.role === 'user' || m.role === 'assistant');
                if (apiMessages.length > 0) {
                  const apiLogMessages = apiMessages.map((m: any) => ({
                    role: m.role,
                    content: m.content || '',
                    created_at: m.created_at || String(Date.now()),
                  }));
                  await filesApi.saveChatLog(saveConvId, apiLogMessages);
                  console.log("[Chat] API backup save done. msgs:", apiLogMessages.length);
                }
              } catch (e) {
                console.warn("[Chat] API backup failed:", e);
              }
            }, 3000);
          }
          // Auto-name conversation from first user message (using closure variable)
          if (saveConvId && localUserContent) {
            const autoName = stripMarkdown(localUserContent).substring(0, 30);
            if (autoName) {
              chatApi.updateConversation(saveConvId, { name: autoName }).catch(() => {});
            }
          }
          } catch (e) { console.error("[Chat] onComplete error:", e); }
        },
        onMessageComplete: () => { /* streaming ends via onComplete */ },
        onError: (err) => {
          console.error('[Chat] SSE error FULL:', err.message, err.stack, 'queueTaskId:', queueTaskIdRef.current, 'convId:', effectiveConvId, 'botId:', currentBotId);
          if (queueTaskIdRef.current && activeTaskRef.current) {
            // SSE disconnected - activate standby queue task to fetch response from backend
            console.log('[ChatQueue] SSE disconnected, starting queue task:', queueTaskId);
            chatQueueApi.start(queueTaskIdRef.current!).catch(e => console.warn('[ChatQueue] Start failed:', e));
            const pollQueue = async () => {
              const task = activeTaskRef.current;
              if (!task || task.taskId !== queueTaskIdRef.current) return;
              try {
                const status = await chatQueueApi.getStatus(queueTaskIdRef.current!);
                if (status.status === 'completed') {
                  // Fetch remaining events and apply them
                  const { events } = await chatQueueApi.getEvents(queueTaskIdRef.current!, task.lastEventIndex);
                  for (const event of events) {
                    task.lastEventIndex = event.index + 1;
                    if (event.event_type === 'conversation.message.delta' && event.data?.content) {
                      localAiAccum += event.data.content;
                      appendDelta(event.data.content);
                    }
                  }
                  const aiMsgId = status.chat_id || `msg_${Date.now()}`;
                  if (localAiAccum) {
                    const aiMsg: ChatMessage = {
                      id: aiMsgId,
                      conversation_id: effectiveConvId || '',
                      role: 'assistant',
                      type: 'text',
                      content: localAiAccum,
                      content_type: 'markdown',
                      created_at: String(Date.now()),
                      updated_at: String(Date.now()),
                    };
                    const _cur = useChatStore.getState().messages;
                    setMessages([..._cur.filter(m => m.id !== aiMsgId), aiMsg]);
                  }
                  finishStreaming(aiMsgId);
                  clearTask();
                } else if (status.status === 'failed') {
                  setError(status.error || 'Background task failed');
                  finishStreaming(`msg_${Date.now()}`);
                  clearTask();
                  if (lastUserMsgRef.current) {
                    setFailedMessages(prev => new Set(prev).add(lastUserMsgRef.current!.id));
                  }
                } else {
                  // Still processing - get incremental events and keep polling
                  const { events } = await chatQueueApi.getEvents(queueTaskIdRef.current!, task.lastEventIndex);
                  for (const event of events) {
                    task.lastEventIndex = event.index + 1;
                    if (event.event_type === 'conversation.message.delta' && event.data?.content) {
                      localAiAccum += event.data.content;
                      appendDelta(event.data.content);
                    }
                  }
                  ssePollingTimerRef.current = setTimeout(pollQueue, 3000);
                }
              } catch (pe) {
                console.error('[ChatQueue] Poll error:', pe);
                ssePollingTimerRef.current = setTimeout(pollQueue, 5000);
              }
            };
            ssePollingTimerRef.current = setTimeout(pollQueue, 2000);
          } else {
            // No queue task - original error handling
            setError(err.message);
            finishStreaming(`msg_${Date.now()}`);
            if (lastUserMsgRef.current) {
              setFailedMessages(prev => new Set(prev).add(lastUserMsgRef.current!.id));
            }
          }
        },
        onStatus: (status) => {
          console.log('[SSE status]', status);
          if (!status) return;
          const store = useChatStore.getState();
          const current = store.activityStatus;
          const hasRunningTool = store.toolCalls.some(tc => !tc.result);
          const now = Date.now();
          const sinceToolComplete = now - lastToolCompleteRef.current;
          // Keep "X完成" visible for at least 1.2s so user sees the transition
          const completionVisible = current.endsWith("完成") && sinceToolComplete < 1200;
          if (status === "streaming") {
            // AI is outputting text now - always switch (content is streaming)
            setActivityStatus("正在输入回复…");
          } else if (status === "thinking") {
            // Don't overwrite if a tool is running or completion just showed
            if (!hasRunningTool && !completionVisible) {
              setActivityStatus("正在思考理解…");
            }
            // If completion visible, schedule a fallback update after window
            if (completionVisible) {
              setTimeout(() => {
                const s = useChatStore.getState();
                if (!s.toolCalls.some(tc => !tc.result) && s.activityStatus.endsWith("完成")) {
                  setActivityStatus("正在思考理解…");
                }
              }, 1200 - sinceToolComplete);
            }
          } else if (status === "complete") {
            setActivityStatus("");
          } else {
            setActivityStatus(status);
          }
        },
      }
    );
  };

  const handleRetry = async (failedMsgId: string) => {
    const failedMsg = messages.find(m => m.id === failedMsgId);
    if (!failedMsg) return;
    setFailedMessages(prev => { const next = new Set(prev); next.delete(failedMsgId); return next; });
    // Remove the failed message
    const _cur = useChatStore.getState().messages;
    setMessages(_cur.filter(m => m.id !== failedMsgId));
    // Resend
    await handleSend(failedMsg.content || '');
  };

  const handleStop = () => {
    streamRef.current?.abort();
    // Also cancel queue task if active
    if (activeTaskRef.current) {
      chatQueueApi.cancel(activeTaskRef.current.taskId).catch(e => console.warn('[ChatQueue] Cancel failed:', e));
      clearTask();
    }
    clearStreaming();
  };

  // Start polling for a specific video task
  const startVideoPolling = (taskId: string, initialMsgId: string) => {
    if (videoPollingRef.current.has(taskId)) return; // Already polling

    setVideoTasks(prev => {
      const next = new Map(prev);
      const existing = next.get(taskId);
      next.set(taskId, { taskId, status: 'polling', progress: existing?.progress || 0, msgId: existing?.msgId || initialMsgId, url: existing?.url });
      return next;
    });

    // Poll every 10 seconds
    const poll = async () => {
      try {
        const baseUrl = 'https://s.symsgf.xyz';
        const resp = await fetch(`${baseUrl}/video/status/${taskId}`);
        const data = await resp.json();
        const parsed = typeof data.data === 'string' ? JSON.parse(data.data || '{}') : (data.data || data);
        const status = parsed.status || 'unknown';
        const videoUrl = parsed.video_url || '';
        const progress = typeof parsed.progress === 'number' ? parsed.progress : (parseInt(String(parsed.progress)) || 0);
        
        console.log('[Video Poll]', taskId, 'status:', status, 'progress:', progress, 'url:', videoUrl ? 'yes' : 'no');

        setVideoTasks(prev => {
          const next = new Map(prev);
          const existing = next.get(taskId);
          next.set(taskId, { taskId, status, url: videoUrl, progress, msgId: existing?.msgId || initialMsgId });
          return next;
        });

        if (status === 'completed' && videoUrl) {
          const interval = videoPollingRef.current.get(taskId);
          if (interval) { clearInterval(interval); videoPollingRef.current.delete(taskId); }
        } else if (status === 'failed') {
          const interval = videoPollingRef.current.get(taskId);
          if (interval) { clearInterval(interval); videoPollingRef.current.delete(taskId); }
        }
      } catch (e) {
        console.warn('[Video Poll] Failed:', e);
      }
    };

    poll();
    const interval = setInterval(poll, 10000);
    videoPollingRef.current.set(taskId, interval);

    // Auto-stop after 5 minutes
    setTimeout(() => {
      const iv = videoPollingRef.current.get(taskId);
      if (iv) {
        clearInterval(iv);
        videoPollingRef.current.delete(taskId);
        setVideoTasks(prev => {
          const next = new Map(prev);
          const existing = next.get(taskId);
          if (existing && existing.status !== 'completed') {
            next.set(taskId, { ...existing, status: 'timeout' });
          }
          return next;
        });
      }
    }, 300000);
  };

  // Detect video task_id in AI message and start polling
  const detectAndPollVideoTasks = async (aiContent: string, aiMsgId: string) => {
    // Look for task_id patterns in the response
    const taskIdPatterns = [
      /task_id["\s:]+["']?(task_[A-Za-z0-9]+)["']?/gi,
      /task_(?:id)?["\s:=]+["']?(task_[A-Za-z0-9_]+)["']?/gi,
      /任务ID[：:\s]+\s*(task_[A-Za-z0-9_]+)/gi,
      /\b(task_[A-Za-z0-9]{20,})\b/gi,
    ];
    const taskIds = new Set<string>();
    for (const pattern of taskIdPatterns) {
      let match;
      while ((match = pattern.exec(aiContent)) !== null) {
        taskIds.add(match[1]);
      }
    }
    
    for (const taskId of taskIds) {
      startVideoPolling(taskId, aiMsgId);
    }
  };


  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      videoPollingRef.current.forEach((interval) => clearInterval(interval));
      videoPollingRef.current.clear();
    };
  }, []);

  // Fetch available bots
  const fetchBots = async () => {
    try {
      const result = await botApi.list({ page: 1, page_size: 20 });
      setAvailableBots(result.items.map((b: any) => ({
        id: b.id,
        name: b.name || 'Unknown',
        icon_url: b.icon_url || b.avatar_url || '',
      })));
      // Set avatar for current bot
      const currentBot = result.items.find((b: any) => b.id === currentBotId);
      if (currentBot) {
        setBotAvatar(currentBot.icon_url || currentBot.avatar_url || '');
      }
    } catch (e) {
      console.warn('[Chat] Failed to fetch bots:', e);
    }
  };

  const handleBotSwitch = async (newBotId: string, newBotName: string) => {
    setCurrentBotId(newBotId);
    setBotName(newBotName);
    const matched = availableBots.find((b: any) => b.id === newBotId);
    if (matched) setBotAvatar(matched.icon_url || '');
    setShowBotSelector(false);
    // Create a new conversation with the new bot
    try {
      const userId = user?.id || '';
      const conv = await chatApi.createConversation(newBotId, '', userId);
      if (conv?.id) {
        setConversationId(conv.id);
        setMessages([]);
        _sessionMessages = [];
        router.replace(`/chat/${conv.id}?bot_id=${newBotId}` as any);
      }
    } catch (e) {
      console.warn('[Chat] Failed to create conversation with new bot:', e);
    }
  };

  if (debugError) {
    return (
      <View style={styles.container}>
        <View style={{flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20}}>
          <Ionicons name="alert-circle" size={48} color="#ef4444" />
          <Text style={{fontSize: 16, fontWeight: 'bold', marginTop: 16, color: '#1f2937'}}>Error</Text>
          <Text style={{fontSize: 12, color: '#6b7280', marginTop: 8, textAlign: 'center'}}>{debugError}</Text>
          <TouchableOpacity onPress={() => { setDebugError(null); init(); }} style={{marginTop: 16, padding: 10, backgroundColor: '#8B5CF6', borderRadius: 8}}>
            <Text style={{color: '#fff', fontSize: 14, fontWeight: '600'}}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={{backgroundColor: '#ff9900', padding: 8, alignItems: 'center'}}>
        </View>
        <SkeletonLoader type="chat-detail" visible={loading} />
      </View>
    );
  }

  const renderItem = ({ item }: { item: ChatMessage }) => {
    if (!item || !item.id) return null;
    if (item.role === 'assistant' && (!item.content || !item.content.trim())) return null;
    const isFailed = failedMessages.has(item.id);
    
    // Check if this message has an active video task
    const hasActiveVideoTask = Array.from(videoTasks.values()).some(t => 
      t.msgId === item.id && (t.status === 'polling' || t.status === 'queued' || t.status === 'processing')
    );
    const activeTask = hasActiveVideoTask ? Array.from(videoTasks.values()).find(t => t.msgId === item.id) : null;
    
    // Sanitize message content if it contains video task technical info
    const hasVideoTechInfo = item.role === 'assistant' && /task_id|task_[A-Za-z0-9]+|\u4efb\u52a1ID|\u8fdb\u5ea6[\s\uff1a:]*\d+%|\u89c6\u9891\u5df2\u751f\u6210\u5b8c\u6210|\u89c6\u9891\u6b63\u5728\u751f\u6210\u4e2d|\u6b63\u5728\u5c1d\u8bd5\u751f\u6210\u89c6\u9891|\u89c6\u9891\u751f\u6210\u670d\u52a1\u6682\u65f6\u4e0d\u53ef\u7528|\u5173\u4e8e\u89c6\u9891\u94fe\u63a5|\u66ff\u4ee3\u65b9\u6848/i.test(item.content || '');
    const displayItem = hasVideoTechInfo ? { ...item, content: sanitizeVideoContent(item.content) } : item;
    
    return (
      <View>
        <MessageBubble 
          message={displayItem}
          userName={userName}
          botName={botName}
          botAvatar={botAvatar}
          userAvatar={userAvatar}
          isDark={isDark}
          onLongPress={handleLongPress} 
          replyToMessage={replyToMap[item.id] || null}
          cost={messageCosts.get(item.id)}
        />
        {activeTask && <VideoGenerationOverlay status={activeTask.status} progress={activeTask.progress || 0} />}
        {(() => {
          const completedVideoTask = Array.from(videoTasks.values()).find(t => 
            t.msgId === item.id && t.status === 'completed' && t.url
          );
          return completedVideoTask ? <CompletedVideoCard videoUrl={completedVideoTask.url} isDark={isDark} /> : null;
        })()}
        {isFailed && item.role === 'user' && (
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: Spacing.md, marginTop: -2, marginBottom: 4 }}>
            <TouchableOpacity 
              onPress={() => handleRetry(item.id)}
              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#334155' : '#fef2f2', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, gap: 4 }}
            >
              <Ionicons name="refresh" size={12} color={Colors.danger} />
              <Text style={{ fontSize: 11, color: Colors.danger }}>发送失败，点击重试</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const renderFooter = () => {
    if (!isStreaming) return null;

    // Case 1: Generating media - show generation placeholder with animation
    if (generatingType) {
      return (
        <View style={{ paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm }}>
          <View style={styles.genPlaceholderRow}>
            <View style={[styles.genAvatar, { backgroundColor: Colors.primary }]}>
              <Ionicons name="sparkles" size={14} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <GenerationPlaceholder type={generatingType} />
            </View>
          </View>
        </View>
      );
    }

    // Case 2: Streaming text content or tool calls active - show streaming text only
    if (streamingContent || toolCalls.length > 0) {
      const sanitizedStreaming = /task_id|任务ID|进度[：:\s]*\d+%|视频已生成完成|视频正在生成中|正在尝试生成视频|视频生成服务暂时不可用|关于视频链接|替代方案|状态[：:]\s*(queued|processing)/i.test(streamingContent) 
        ? sanitizeVideoContent(streamingContent) 
        : streamingContent;
      if (streamingContent) {
        return (
          <View style={{ paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm }}>
            <MessageBubble
              message={{
                id: streamingMessageId || '',
                conversation_id: conversationId || id || '',
                role: 'assistant',
                type: 'text',
                content: sanitizedStreaming,
                content_type: 'markdown',
                created_at: String(Date.now()),
                updated_at: String(Date.now()),
              }}
              userName={userName}
              botName={botName}
              botAvatar={botAvatar}
              userAvatar={userAvatar}
              isDark={isDark}
            />
          </View>
        );
      }
      // Tool calls running but no text yet - just return null, TypingIndicator handles it
      return null;
    }
    
    // Show VideoGenerationOverlay during streaming if video task detected
    const streamingVideoTask = Array.from(videoTasks.values()).find(t => 
      t.msgId === streamingMessageId && (t.status === 'polling' || t.status === 'queued' || t.status === 'processing')
    );
    // Case 3: No streaming content, no tool calls - just return null
    // TypingIndicator handles all status display above the input box
    return null;
  };

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#0f172a' : '#fff' }]}>


      {showSearch && (
        <View style={[styles.searchBar, { backgroundColor: isDark ? '#1e293b' : Colors.backgroundSecondary }]}>
          <Ionicons name="search-outline" size={16} color={Colors.textTertiary} style={{ marginRight: 6 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="搜索消息..."
            placeholderTextColor={Colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
          {searchQuery ? (
            <Text style={styles.searchCount}>
              {messages.filter(m => (m.content || '').toLowerCase().includes(searchQuery.toLowerCase())).length} 条结果
            </Text>
          ) : null}
        </View>
      )}
      {isOffline && (
        <View style={styles.offlineBar}>
          <Ionicons name="cloud-offline-outline" size={14} color="#fff" />
          <Text style={styles.offlineText}> 网络已断开，消息可能无法发送</Text>
        </View>
      )}
      {initError ? (
        <View style={[styles.errorBar, { backgroundColor: isDark ? '#1c1917' : '#fef2f2', borderTopColor: isDark ? '#7f1d1d' : '#fecaca' }]}>
          <Ionicons name="alert-circle" size={14} color={Colors.danger} />
          <Text style={styles.errorText}> {initError}</Text>
        </View>
      ) : null}

      {messages.length === 0 && !isStreaming ? (
        <View style={styles.emptyArea}>
          <EmptyState iconName="chatbubbles" title={`和 ${botName} 开始对话`} subtitle="输入消息开始聊天" />
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          ref={flatListRef}
          data={(searchQuery ? messages.filter((m: any) => m && (m.content || "").toLowerCase().includes(searchQuery.toLowerCase())) : messages).filter((m: any) => m && m.id)}
          renderItem={renderItem}
          keyExtractor={(item, index) => item?.id || `msg_${index}`}
          contentContainerStyle={styles.listContent}
          ListFooterComponent={renderFooter}
          ListHeaderComponent={loadingMore ? (
            <View style={{ padding: 16, alignItems: 'center' }}>
              {<ActivityIndicator size="small" color={Colors.primary} />}
              <Text style={{ fontSize: 12, color: Colors.textTertiary, marginTop: 4 }}>加载中...</Text>
            </View>
          ) : !hasMore && messages.length > 0 ? (
            <View style={{ padding: 16, alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: Colors.textTertiary }}>没有更多消息了</Text>
            </View>
          ) : null}
          onEndReached={Platform.OS === 'web' ? undefined : loadMoreMessages}
          onEndReachedThreshold={Platform.OS === 'web' ? 0 : 0.3}
          showsVerticalScrollIndicator={false}
          inverted={false}
          extraData={videoTasks}
          onScroll={handleScroll}
          onContentSizeChange={() => {
            if (useChatStore.getState().isStreaming) {
              flatListRef.current?.scrollToEnd({ animated: false });
            }
          }}
          scrollEventThrottle={Platform.OS === 'web' ? 0 : 100}
        />
      )}

      {error ? (
        <View style={[styles.errorBar, { backgroundColor: isDark ? '#1c1917' : '#fef2f2', borderTopColor: isDark ? '#7f1d1d' : '#fecaca' }]}>
          <Ionicons name="alert-circle" size={14} color={Colors.danger} />
          <Text style={styles.errorText}> {error}</Text>
        </View>
      ) : null}

      {/* Scroll to bottom button */}
      {showScrollBtn && (
        <TouchableOpacity
          onPress={scrollToBottom}
          style={{
            position: 'absolute',
            right: 16,
            bottom: 80,
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: 'rgba(0,0,0,0.3)',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 10,
            elevation: 5,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.2,
            shadowRadius: 4,
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-down" size={22} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Dynamic typing indicator + input with keyboard avoidance */}
      <View style={{ marginBottom: keyboardHeight }}>
        <TypingIndicator
          statusText={activityStatus}
          visible={isStreaming}
          botName={botName}
          currentTool={
            // If AI is outputting text, hide tool badge so statusText ("正在输入回复…") shows
            streamingContent
              ? null
              : // No text yet: show latest tool call (running or just completed)
                toolCalls.length > 0
                ? toolCalls[toolCalls.length - 1]
                : null
          }
        />
        <ChatInput
        onSend={handleSend}
        onStop={handleStop}
        isStreaming={isStreaming}
        placeholder={`给 ${botName} 发消息...`}
        conversationId={conversationId || id}
        patToken={patToken || undefined}
        quotedMessage={quotedMessage}
        onClearQuote={() => setQuotedMessage(null)}
        initialText={prompt as string | undefined}
      />

      </View>

      {/* Bot selector modal */}
      <Modal
        visible={showBotSelector}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBotSelector(false)}
      >
        <TouchableOpacity
          style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}
          activeOpacity={1}
          onPress={() => setShowBotSelector(false)}
        >
          <View style={{ backgroundColor: isDark ? '#1e293b' : '#fff', borderRadius: 16, padding: 20, width: 300, maxHeight: 400 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: isDark ? '#f1f5f9' : '#0f172a', textAlign: 'center', marginBottom: 16 }}>选择 AI 模型</Text>
            {availableBots.length === 0 ? (
              <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: 20 }} />
            ) : (
              <ScrollView style={{ maxHeight: 300 }}>
                {availableBots.map((bot) => (
                  <TouchableOpacity
                    key={bot.id}
                    style={{
                      flexDirection: 'row', alignItems: 'center',
                      paddingVertical: 12, paddingHorizontal: 12,
                      borderRadius: 10,
                      backgroundColor: bot.id === currentBotId ? (isDark ? '#2d1b69' : '#f3eeff') : 'transparent',
                      marginBottom: 4,
                    }}
                    onPress={() => handleBotSwitch(bot.id, bot.name)}
                    activeOpacity={0.7}
                  >
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                      <Ionicons name="sparkles" size={16} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: isDark ? '#f1f5f9' : '#0f172a' }}>{bot.name}</Text>
                      <Text style={{ fontSize: 11, color: isDark ? '#94a3b8' : '#64748b', marginTop: 2 }}>{bot.id === currentBotId ? '当前使用' : '点击切换'}</Text>
                    </View>
                    {bot.id === currentBotId && <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Long press action menu */}
      <Modal
        visible={longPressMenu.visible}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={closeMenu}
        >
          <View style={[styles.actionMenu, { backgroundColor: isDark ? '#1e293b' : '#fff' }]}>
            <TouchableOpacity style={styles.menuItem} onPress={handleQuote}>
              <Ionicons name="return-down-back-outline" size={18} color={Colors.primary} />
              <Text style={styles.menuItemText}>引用</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={handleCopy}>
              <Ionicons name="copy-outline" size={18} color={Colors.text} />
              <Text style={styles.menuItemText}>复制</Text>
            </TouchableOpacity>

          </View>
        </TouchableOpacity>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: Platform.OS === 'web' ? 0 : 0, paddingBottom: Platform.OS === 'web' ? 0 : Spacing.sm },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyArea: { flex: 1, justifyContent: 'center' },
  listContent: { paddingVertical: Spacing.md, paddingBottom: 90 },
  errorBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fef2f2',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs,
    borderTopWidth: 0.5, borderTopColor: '#fecaca',
  },
  errorText: { fontSize: 12, color: Colors.danger, marginLeft: 4 },
  // Menu
  menuOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  actionMenu: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 4,
    minWidth: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
  },
  menuItemText: {
    fontSize: 16,
    color: Colors.text,
  },


  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.backgroundSecondary,
    marginHorizontal: Spacing.md, marginVertical: Spacing.xs,
    paddingHorizontal: Spacing.md, height: 36,
    borderRadius: BorderRadius.full,
  },
  searchInput: { flex: 1, fontSize: FontSize.sm, color: Colors.text, paddingVertical: 0 },
  searchCount: { fontSize: FontSize.xs, color: Colors.textTertiary, marginLeft: 6 },
  offlineBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#ef4444', paddingVertical: 6, paddingHorizontal: Spacing.md,
  },
  offlineText: { color: '#fff', fontSize: 12 },
  menuDivider: {
    height: 0.5,
    backgroundColor: '#e5e5e5',
    marginHorizontal: 16,
  },
  // Generation placeholder row
  genPlaceholderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  genAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  // Thinking indicator
  thinkingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  thinkingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundSecondary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: BorderRadius.lg,
    borderBottomLeftRadius: BorderRadius.xs,
    gap: 8,
  },
  thinkingText: {
    fontSize: FontSize.sm,
    color: Colors.textTertiary,
  },
});
// QUEUE_FIX_20260811


export default function ChatDetailScreen() {
  return (
    <ChatErrorBoundary>
      <ChatDetailScreenInner />
    </ChatErrorBoundary>
  );
}

