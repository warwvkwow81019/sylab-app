import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  TextInput,
  Alert,
  Platform,
  PanResponder,
  Animated,
} from "react-native";
import { SafeAlert } from "../../src/utils/safeAlert";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  Colors,
  Spacing,
  BorderRadius,
  FontSize,
  Shadows,
} from "../../src/constants/theme";
import { chatApi } from "../../src/api/chat";
import { filesApi } from "../../src/api/files";
import { AppEvents, subscribe, emit } from "../../src/utils/events";
import { useAuthStore } from "../../src/store/auth";
import { EmptyState } from "../../src/components/EmptyState";
import { SkeletonLoader } from "../../src/components/SkeletonLoader";
import { Ionicons } from "@expo/vector-icons";
import type { ConversationInfo } from "../../src/types/api";

const DEFAULT_BOT_ID = "7669580347859795968";
const DEFAULT_BOT_NAME = "sylab AI";
const DELETE_BTN_WIDTH = 80;

const stripMarkdown = (text: string): string => {
  if (!text) return "";
  return text
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
    return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
  }
  if (isThisYear) {
    return `${(date.getMonth() + 1).toString().padStart(2, "0")}/${date.getDate().toString().padStart(2, "0")}`;
  }
  return `${date.getFullYear()}/${(date.getMonth() + 1).toString().padStart(2, "0")}/${date.getDate().toString().padStart(2, "0")}`;
};

interface ProjectItem {
  id: string;
  displayTitle: string;
  created_at: any;
  fileCount?: number;
  subtitle?: string;
}

function SwipeableProjectItem({
  item,
  onDelete,
  onPress,
}: {
  item: ProjectItem;
  onDelete: (item: ProjectItem) => void;
  onPress: (item: ProjectItem) => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const isOpenRef = useRef(false);

  const animateTo = (toValue: number) => {
    Animated.spring(translateX, {
      toValue,
      useNativeDriver: true,
      friction: 7,
      tension: 100,
    }).start();
    isOpenRef.current = toValue < 0;
  };

  const close = () => animateTo(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) => {
        return Math.abs(gs.dx) > 10 && Math.abs(gs.dx) > Math.abs(gs.dy) * 2;
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        translateX.stopAnimation();
      },
      onPanResponderMove: (_, gs) => {
        const dx = gs.dx;
        if (dx < 0) {
          translateX.setValue(Math.max(dx, -DELETE_BTN_WIDTH));
        } else if (isOpenRef.current) {
          translateX.setValue(Math.min(0, -DELETE_BTN_WIDTH + dx));
        }
      },
      onPanResponderRelease: (_, gs) => {
        const dx = gs.dx;
        const vx = gs.vx;
        if (dx < 0) {
          if (dx < -DELETE_BTN_WIDTH * 0.35 || vx < -0.3) {
            animateTo(-DELETE_BTN_WIDTH);
          } else {
            animateTo(0);
          }
        } else {
          animateTo(0);
        }
      },
    })
  ).current;

  return (
    <View style={styles.swipeWrapper}>
      <View style={styles.deleteBtnContainer}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => { close(); onDelete(item); }}
          style={styles.deleteBtn}
        >
          <Ionicons name="trash" size={22} color="#fff" />
          <Text style={styles.deleteBtnText}>删除</Text>
        </TouchableOpacity>
      </View>
      <Animated.View
        {...panResponder.panHandlers}
        style={[styles.swipeForeground, { transform: [{ translateX }] }]}
      >
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            if (isOpenRef.current) {
              close();
            } else {
              onPress(item);
            }
          }}
          style={styles.cardInner}
        >
          <LinearGradient
            colors={[Colors.gradientStart, Colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.projectIcon}
          >
            <Ionicons name="folder" size={22} color="#fff" />
          </LinearGradient>
          <View style={styles.projectInfo}>
            <Text style={styles.projectName} numberOfLines={1}>
              {item.displayTitle}
            </Text>
            {item.subtitle ? (
              <Text style={styles.projectSubtitle} numberOfLines={1}>
                {item.subtitle}
              </Text>
            ) : null}
            <Text style={styles.projectTime}>{formatTime(item.created_at)}</Text>
          </View>
          {(item.fileCount ?? 0) > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{item.fileCount}</Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

export default function ProjectsScreen() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === "web") {
      try { (window as any).alert?.(title + "\n" + message); } catch {}
    } else {
      SafeAlert.alert(title, message);
    }
  };

  const fetchProjects = useCallback(async () => {
    try {
      const currentUser = useAuthStore.getState().user;
      const currentUserId = currentUser?.id || '';
      const listParams: any = { page_num: 1, page_size: 50 };
      if (currentUserId) listParams.user_id = currentUserId;
      const result = await chatApi.listConversations(DEFAULT_BOT_ID, listParams);
      const rawConvs: ConversationInfo[] = result.items || [];

      const filteredConvs = currentUserId
        ? rawConvs.filter((c: any) => c.user_id === currentUserId)
        : rawConvs;

      if (filteredConvs.length === 0) {
        setProjects([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // 与对话列表保持一致：跳过无消息且无名称的空对话
      let statsData: any = null;
      try { statsData = await filesApi.getAllStats(); } catch {}
      const convStats = statsData?.conversations || {};

      const convMsgMap = new Map<string, any[]>();
      try {
        const msgResults = await Promise.all(
          filteredConvs.map(conv => chatApi.getMessages(conv.id, { page_num: 1, page_size: 5 }).catch(() => null))
        );
        msgResults.forEach((result, idx) => {
          if (result?.items) convMsgMap.set(filteredConvs[idx].id, result.items);
        });
      } catch {}

      const validConvs = filteredConvs.filter(conv => {
        const msgs = convMsgMap.get(conv.id) || [];
        const fileCount = convStats[conv.id]?.file_count || 0;
        return conv.name || msgs.length > 0 || fileCount > 0;
      });

      if (validConvs.length === 0) {
        setProjects([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const items: ProjectItem[] = validConvs.map((conv) => {
        let displayTitle = conv.name || DEFAULT_BOT_NAME;
        const msgs = convMsgMap.get(conv.id) || [];
        const firstUserMsg = msgs.find((m: any) => m.role === 'user');
        const subtitle = firstUserMsg ? stripMarkdown(firstUserMsg.content || '').substring(0, 50) : undefined;
        return { id: conv.id, displayTitle, created_at: conv.created_at, fileCount: convStats[conv.id]?.file_count || 0, subtitle };
      });

      setProjects(items);

    } catch (e) {
      console.warn("[Projects] fetchProjects error:", e);
      setProjects([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
    const unsub = subscribe(AppEvents.CONVERSATIONS_CHANGED, fetchProjects);
    return unsub;
  }, []);

  const handleDeleteProject = (item: ProjectItem) => {
    const doDelete = async () => {
      try {
        try {
          const fileList = await filesApi.list(item.id);
          if (fileList.files && fileList.files.length > 0) {
            for (const file of fileList.files) {
              try { await filesApi.delete(item.id, file.name); } catch {}
            }
          }
        } catch {}
        await chatApi.deleteConversation(item.id);
        setProjects(prev => prev.filter(p => p.id !== item.id));
        emit(AppEvents.CONVERSATIONS_CHANGED);
      } catch (e: any) {
        const errMsg = String(e?.response?.data?.msg || e?.message || String(e) || "未知错误");
        showAlert("删除失败", errMsg);
      }
    };
    if (Platform.OS === "web") {
      if (window.confirm("删除项目「" + item.displayTitle + "」？此操作不可恢复。")) doDelete();
    } else {
      SafeAlert.alert("删除项目", "删除项目「" + item.displayTitle + "」？此操作不可恢复。", [
        { text: "取消", style: "cancel" },
        { text: "删除", style: "destructive", onPress: doDelete },
      ]);
    }
  };

  const filtered = projects.filter(c =>
    !searchText || c.displayTitle.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={18} color={Colors.textTertiary} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="搜索项目..."
          placeholderTextColor={Colors.textTertiary}
          value={searchText}
          onChangeText={setSearchText}
        />
      </View>

      {loading ? (
        <SkeletonLoader type="card-grid" visible={loading} />
      ) : filtered.length === 0 ? (
        <EmptyState
          iconName="folder-open"
          title={searchText ? "未找到匹配项目" : "还没有项目"}
          subtitle={searchText ? "尝试其他关键词" : "点击右下角按钮新建对话，即可创建项目"}
        />
      ) : (
        <FlatList
          data={filtered}
          renderItem={({ item }) => (
            <SwipeableProjectItem
              item={item}
              onDelete={handleDeleteProject}
              onPress={(it) => router.push(`/projects/${it.id}`)}
            />
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchProjects(); }}
              tintColor={Colors.primary}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundSecondary },
  searchBar: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: Spacing.md, marginVertical: Spacing.sm,
    backgroundColor: "#fff", borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md, height: 40, ...Shadows.sm,
  },
  searchInput: { flex: 1, fontSize: FontSize.sm, color: Colors.text, paddingVertical: 0 },
  list: { paddingHorizontal: Spacing.md, paddingBottom: 80 },
  swipeWrapper: {
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  deleteBtnContainer: {
    position: 'absolute',
    right: 0, top: 0, bottom: 0,
    width: DELETE_BTN_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtn: {
    width: '100%', height: '100%',
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtnText: { color: '#fff', fontSize: 12, marginTop: 2 },
  swipeForeground: { zIndex: 1 },
  cardInner: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    ...Shadows.md,
  },
  projectIcon: {
    width: 48, height: 48, borderRadius: 14,
    justifyContent: "center", alignItems: "center",
    marginRight: Spacing.md,
  },
  projectInfo: { flex: 1 },
  projectName: { fontSize: FontSize.md, fontWeight: "600", color: Colors.text, marginBottom: 4 },
  projectSubtitle: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  projectTime: { fontSize: FontSize.xs, color: Colors.textTertiary },
  badge: {
    backgroundColor: Colors.primary, borderRadius: 10,
    minWidth: 20, height: 20,
    justifyContent: "center", alignItems: "center",
    paddingHorizontal: 6, marginRight: 8,
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
});
