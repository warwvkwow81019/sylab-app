import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, RefreshControl, TextInput, ActivityIndicator, Alert, Platform } from 'react-native';
import { FlatList, Swipeable } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { Colors, Spacing, BorderRadius, FontSize, Shadows } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import { chatApi } from '../../src/api/chat';
import { filesApi } from '../../src/api/files';
import { useAuthStore } from '../../src/store/auth';
import { Storage } from '../../src/utils/storage';
import { AppEvents, subscribe, emit } from '../../src/utils/events';
import { botApi } from '../../src/api/bot';
import { EmptyState } from '../../src/components/EmptyState';
import { SkeletonLoader } from '../../src/components/SkeletonLoader';
import { Ionicons } from '@expo/vector-icons';
import type { ConversationInfo } from '../../src/types/api';

/** 用原生 Date 替代 dayjs */
const formatTime = (ts: any): string => {
  if (!ts) return '';
  const num = Number(ts);
  if (isNaN(num) || num === 0) return '';
  const ms = num < 1e12 ? num * 1000 : num;
  const date = new Date(ms);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const isThisYear = date.getFullYear() === now.getFullYear();

  if (isToday) {
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  }
  if (isThisYear) {
    const mo = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${mo}/${d}`;
  }
  const y = date.getFullYear();
  const mo = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}/${mo}/${d}`;
};

/** 清理 Markdown 标记，提取纯文本用于预览 */
const stripMarkdown = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/<img\s[^>]*>/gi, '[图片]')
    .replace(/<[^>]+>/g, '')
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/!\[.*?\]\(.+?\)/g, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/\n+/g, ' ')
    .trim();
};

const SWIPE_ACTIONS_WIDTH = 160;

interface EnrichedConversation extends ConversationInfo {
  displayTitle: string;
  lastMessagePreview: string;
}

/** 滑动操作封装组件：左滑显示重命名+删除（使用 react-native-gesture-handler 解决手势冲突） */
function SwipeableItem({
  item,
  children,
  onDelete,
  onRename,
}: {
  item: EnrichedConversation;
  children: React.ReactNode;
  onDelete: (item: EnrichedConversation) => void;
  onRename: (item: EnrichedConversation) => void;
}) {
  const swipeableRef = useRef<any>(null);
  const openRef = useRef(false);

  const close = () => {
    swipeableRef.current?.close();
    openRef.current = false;
  };

  const renderLeftActions = () => null;

  const renderRightActions = () => (
    <View style={styles.actionButtons}>
      <TouchableOpacity
        style={styles.renameActionBtn}
        onPress={() => {
          close();
          onRename(item);
        }}
        activeOpacity={0.8}
      >
        <Ionicons name="create" size={20} color="#fff" />
        <Text style={styles.actionText}>重命名</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.deleteActionBtn}
        onPress={() => {
          close();
          onDelete(item);
        }}
        activeOpacity={0.8}
      >
        <Ionicons name="trash" size={20} color="#fff" />
        <Text style={styles.actionText}>删除</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.swipeContainer}>
      <Swipeable
        ref={swipeableRef}
        friction={2}
        enableTrackpadTwoFingerGesture={false}
        leftThreshold={30}
        rightThreshold={40}
        overshootRight={false}
        overshootLeft={false}
        renderLeftActions={renderLeftActions}
        renderRightActions={renderRightActions}
        onSwipeableOpen={() => { openRef.current = true; }}
        onSwipeableClose={() => { openRef.current = false; }}
      >
        {children}
      </Swipeable>
    </View>
  );
}

const DEFAULT_BOT_ID = '7669580347859795968';
const DEFAULT_BOT_NAME = 'sylab AI';

export default function ChatListScreen() {
  const router = useRouter();
  const [conversations, setConversations] = useState<EnrichedConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const { isDark } = useTheme();
  const [searchText, setSearchText] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const creatingRef = useRef(false);

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === "web") {
      try { (window as any).alert?.(title + "\n" + message); } catch {}
    } else {
      Alert.alert(title, message);
    }
  };

  const fetchConversations = async () => {
    try {
      const currentUser = useAuthStore.getState().user;
      const currentUserId = currentUser?.id || '';
      const listParams: any = { page_num: 1, page_size: 50 };
      if (currentUserId) listParams.user_id = currentUserId;
      const result = await chatApi.listConversations(DEFAULT_BOT_ID, listParams);
      const rawConvs = result.items || [];

      // Backend filters by user_id, but keep client-side filter as safety net
      const filteredConvs = currentUserId
        ? rawConvs.filter((c: any) => c.user_id === currentUserId)
        : rawConvs;

      if (filteredConvs.length === 0) {
        setConversations([]);
        setLoading(false);
        return;
      }

      const enriched: EnrichedConversation[] = [];
      for (const conv of filteredConvs) {
        let displayTitle = conv.name || '';
        let lastMessagePreview = '';
        let msgCount = 0;

        try {
          const msgResult = await chatApi.getMessages(conv.id);
          const msgs = msgResult.items || [];
          msgCount = msgs.length;

          if (msgs.length > 0) {
            const latestMsg = msgs[0];
            lastMessagePreview = stripMarkdown(latestMsg.content || '');

            if (!displayTitle) {
              const firstUserMsg = [...msgs].reverse().find((m: any) => m.role === 'user');
              if (firstUserMsg?.content) {
                displayTitle = stripMarkdown(firstUserMsg.content).slice(0, 40);
              }
            }
          }
        } catch (e) {
          console.warn(`[ChatList] getMessages failed for ${conv.id}:`, e);
        }

        // Skip conversations with 0 messages AND no custom name (empty/stale)
        if (msgCount === 0 && !conv.name) {
          continue;
        }

        enriched.push({
          ...conv,
          displayTitle: displayTitle || DEFAULT_BOT_NAME,
          lastMessagePreview: lastMessagePreview || '暂无消息',
        });
      }

      setConversations(enriched);
    } catch (e) {
      console.warn('[ChatList] fetchConversations error:', e);
      setConversations([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleDeleteConversation = (conv: EnrichedConversation) => {
    const doDelete = async () => {
      try {
        try {
          const fileList = await filesApi.list(conv.id);
          if (fileList.files && fileList.files.length > 0) {
            for (const file of fileList.files) {
              try {
                await filesApi.delete(conv.id, file.name);
              } catch (fe) {
                console.warn(`[Delete] Failed to delete project file ${file.name}:`, fe);
              }
            }
            console.log(`[Delete] Cleaned up ${fileList.files.length} project files for conversation ${conv.id}`);
          }
        } catch (fileErr) {
          console.warn('[Delete] Failed to list/delete project files (non-blocking):', fileErr);
        }
        await chatApi.deleteConversation(conv.id);
        // 硬删除：物理清除云端数据（对话+消息）
        try {
          const API_BASE = 'http://36.137.84.216:9091';
          await fetch(`${API_BASE}/sylab-api/api/sylab/conversation/${conv.id}`, {
            method: 'DELETE',
          });
          console.log(`[HardDelete] Conversation ${conv.id} physically deleted`);
        } catch (hdErr) {
          console.warn('[HardDelete] Failed to hard delete (non-blocking):', hdErr);
        }
        setConversations(prev => prev.filter(c => c.id !== conv.id));
        emit(AppEvents.CONVERSATIONS_CHANGED);

      } catch (e: any) {
        const errMsg = String(e?.response?.data?.msg || e?.response?.data?.message || e?.message || String(e) || "未知错误");
        const errStatus = e?.response?.status ? " (HTTP " + e.response.status + ")" : "";
        console.error("[Delete] Error details:", { msg: errMsg, status: errStatus, data: e?.response?.data });
        showAlert("删除失败", errMsg + errStatus);
      }
    };
    if (Platform.OS === "web") {
      if (window.confirm("删除对话「" + conv.displayTitle + "」？此操作不可恢复。")) {
        doDelete();
      }
    } else {
      Alert.alert(
        "删除对话",
        "删除对话「" + conv.displayTitle + "」？此操作不可恢复。",
        [
          { text: "取消", style: "cancel" },
          { text: "删除", style: "destructive", onPress: () => { doDelete(); } },
        ],
      );
    }
  };

  const handleRenameConversation = (conv: EnrichedConversation) => {
    const doRename = async (newName: string) => {
      try {
        await chatApi.updateConversation(conv.id, { name: newName });
        setConversations(prev => prev.map(c =>
          c.id === conv.id
            ? { ...c, displayTitle: newName || DEFAULT_BOT_NAME, name: newName }
            : c
        ));
        console.log(`[Rename] Conversation ${conv.id} renamed to "${newName}"`);
      } catch (e: any) {
        const errMsg = String(e?.response?.data?.msg || e?.message || String(e));
        showAlert("重命名失败", errMsg);
      }
    };
    // Web 端用 window.prompt，原生端暂用简单 Alert 提示
    if (Platform.OS === "web") {
      const newName = window.prompt("重命名对话", conv.displayTitle);
      if (newName !== null && newName.trim()) {
        doRename(newName.trim());
      }
    } else {
      showAlert("提示", "请在 Web 端进行重命名操作");
    }
  };

  useEffect(() => {
    fetchConversations();
    const unsub = subscribe(AppEvents.CONVERSATIONS_CHANGED, fetchConversations);
    return unsub;
  }, []);

  const filtered = conversations.filter((c) =>
    !searchText ||
    c.displayTitle.toLowerCase().includes(searchText.toLowerCase()) ||
    c.lastMessagePreview.toLowerCase().includes(searchText.toLowerCase())
  );

  const renderConversation = ({ item }: { item: EnrichedConversation }) => (
    <SwipeableItem item={item} onDelete={handleDeleteConversation} onRename={handleRenameConversation}>
      <TouchableOpacity
        style={styles.item}
        onPress={() => router.push(`/chat/${item.id}`)}
        activeOpacity={0.7}
      >
        <View style={styles.avatar}>
          <Ionicons name="chatbubble-ellipses" size={20} color={Colors.primary} />
        </View>
        <View style={styles.content}>
          <View style={styles.topRow}>
            <Text style={styles.name} numberOfLines={1}>{item.displayTitle}</Text>
            <Text style={styles.time}>
              {formatTime(item.created_at)}
            </Text>
          </View>
          <View style={styles.bottomRow}>
            <Text style={styles.lastMsg} numberOfLines={1}>
              {item.lastMessagePreview}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </SwipeableItem>
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={18} color={Colors.textTertiary} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="搜索对话..."
          placeholderTextColor={Colors.textTertiary}
          value={searchText}
          onChangeText={setSearchText}
        />
      </View>

      {loading ? (
        <SkeletonLoader type="chat-list" visible={loading} />
      ) : filtered.length === 0 ? (
        <EmptyState iconName="chatbubbles" title="还没有对话" subtitle="选择一个 Agent 开始聊天" />
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderConversation}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchConversations(); }} tintColor={Colors.primary} />}
        />
      )}

      <TouchableOpacity
        style={[styles.fab, creatingRef.current && { opacity: 0.5 }]}
        onPress={async () => {
          if (creatingRef.current) return;
          creatingRef.current = true;
          try {
            const currentUser = useAuthStore.getState().user;
            const userId = currentUser?.id || '';
            console.log("[FAB] Creating conversation, userId:", userId);
            const conv = await chatApi.createConversation(DEFAULT_BOT_ID, '', userId);
            console.log("[FAB] Create result:", JSON.stringify(conv));
            if (conv?.id) {

              router.push(`/chat/${conv.id}`);
            } else {
              showAlert('创建失败', '未获取到会话ID，请重试');
            }
          } catch (e: any) {
            const errMsg = String(e?.response?.data?.msg || e?.response?.data?.message || e?.message || String(e) || "未知错误");
            const errStatus = e?.response?.status ? " (HTTP " + e.response.status + ")" : "";
            console.error("[FAB] Error details:", { msg: errMsg, status: errStatus, data: e?.response?.data });
            showAlert('创建失败', errMsg + errStatus);
          } finally {
            setTimeout(() => { creatingRef.current = false; }, 1500);
          }
        }}
        activeOpacity={0.8}
      >
        <View style={styles.fabInner}>
          <Ionicons name="add" size={28} color="#fff" />
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: Spacing.md, marginVertical: Spacing.sm,
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md, height: 40,
  },
  searchInput: { flex: 1, fontSize: FontSize.sm, color: Colors.text, paddingVertical: 0 },
  // 滑动删除相关
  swipeContainer: {
    marginHorizontal: Spacing.md, marginVertical: 4,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  actionButtons: {
    width: SWIPE_ACTIONS_WIDTH,
    flexDirection: 'row',
    height: '100%',
  },
  renameActionBtn: {
    flex: 1,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteActionBtn: {
    flex: 1,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionText: {
    color: '#fff',
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  // 会话项
  item: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    backgroundColor: '#fff', borderRadius: BorderRadius.lg,
    ...Shadows.sm,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center', alignItems: 'center',
    marginRight: Spacing.md,
  },
  content: { flex: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  name: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text, flex: 1, marginRight: Spacing.sm },
  time: { fontSize: FontSize.xs, color: Colors.textTertiary },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lastMsg: { fontSize: FontSize.sm, color: Colors.textSecondary, flex: 1, marginRight: Spacing.sm },
  fab: { position: 'absolute', right: Spacing.lg, bottom: Spacing.xl },
  fabInner: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center',
    ...Shadows.glow,
  },
});

