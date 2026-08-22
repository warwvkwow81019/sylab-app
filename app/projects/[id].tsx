import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, RefreshControl, Alert, Platform } from "react-native";
import { SafeAlert } from "../../src/utils/safeAlert";
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, BorderRadius, FontSize, Shadows } from '../../src/constants/theme';
import { filesApi, type ProjectFile } from '../../src/api/files';

type FileCategory = 'image' | 'document' | 'code' | 'audio' | 'video' | 'other';

const CATEGORY_CONFIG: Record<FileCategory, { emoji: string; label: string; color: string }> = {
  image: { emoji: '📷', label: '图片', color: '#8b5cf6' },
  document: { emoji: '📄', label: '文档', color: '#3b82f6' },
  code: { emoji: '💻', label: '代码', color: '#10b981' },
  audio: { emoji: '🎵', label: '音频', color: '#f59e0b' },
  video: { emoji: '🎬', label: '视频', color: '#ef4444' },
  other: { emoji: '📁', label: '其他', color: '#6b7280' },
};

const CATEGORY_ORDER: FileCategory[] = ['image', 'document', 'code', 'audio', 'video', 'other'];

/** 计算过期信息 */
function getExpiryInfo(file: ProjectFile): { daysLeft: number; label: string; color: string } | null {
  const now = new Date();

  // 优先使用 expires_at，否则使用 created_at + 7天
  let expiryDate: Date | null = null;
  if (file.expires_at) {
    expiryDate = new Date(file.expires_at);
  } else if (file.created_at) {
    const created = new Date(file.created_at);
    expiryDate = new Date(created.getTime() + 7 * 24 * 60 * 60 * 1000);
  }

  if (!expiryDate || isNaN(expiryDate.getTime())) return null;

  const diffMs = expiryDate.getTime() - now.getTime();
  const daysLeft = diffMs / (24 * 60 * 60 * 1000);

  if (daysLeft < 0) {
    return { daysLeft: 0, label: '已过期', color: '#ef4444' };
  }
  if (daysLeft < 1) {
    return { daysLeft, label: '即将过期', color: '#ef4444' };
  }
  if (daysLeft <= 3) {
    return { daysLeft, label: `剩余${Math.ceil(daysLeft)}天`, color: '#f59e0b' };
  }
  // > 3天不显示警告，但仍返回信息
  return { daysLeft, label: `剩余${Math.ceil(daysLeft)}天`, color: Colors.textTertiary };
}

/** 格式化时间 */
function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return '昨天 ' + d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
  }
  return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}

interface FileGroup {
  category: FileCategory;
  files: ProjectFile[];
}

export default function ProjectFilesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({
      title: '项目文件',
      headerLeft: () => (
        <TouchableOpacity onPress={() => router.back()} style={{ paddingLeft: 16, paddingVertical: 8 }}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, router]);

  const loadFiles = useCallback(async () => {
    const convId = id as string;
    try {
      const result = await filesApi.list(convId);
      setFiles(result.files || []);
    } catch (e: any) {
      console.error('[ProjectFiles] 加载失败:', e);
      setFiles([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadFiles();
    });
    return unsubscribe;
  }, [navigation, loadFiles]);

  const onRefresh = () => {
    setRefreshing(true);
    loadFiles();
  };

  const handleDelete = (file: ProjectFile) => {
    if (Platform.OS === 'web') {
      if (!confirm(`确定要删除「${file.name}」吗？`)) return;
    } else {
      SafeAlert.alert('确认删除', `确定要删除「${file.name}」吗？`, [
        { text: '取消', style: 'cancel' },
        { text: '删除', style: 'destructive', onPress: () => doDelete(file) },
      ]);
      return;
    }
    doDelete(file);
  };

  const doDelete = async (file: ProjectFile) => {
    if (!id) return;
    setDeleting(file.name);
    try {
      await filesApi.delete(id, file.name);
      setFiles(prev => prev.filter(f => f.name !== file.name));
    } catch (e: any) {
      if (Platform.OS === 'web') {
        alert('删除失败: ' + (e.message || '未知错误'));
      } else {
        SafeAlert.alert('删除失败', e.message || '未知错误');
      }
    } finally {
      setDeleting(null);
    }
  };

  const handleDownload = (file: ProjectFile) => {
    if (!id) return;
    const url = filesApi.getFileUrl(id, file.name);
    if (Platform.OS === 'web') {
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  // 按类型分组
  const groupedFiles: FileGroup[] = CATEGORY_ORDER
    .map((category) => ({
      category,
      files: files.filter(f => f.type === category),
    }))
    .filter(group => group.files.length > 0);

  const renderFileItem = (file: ProjectFile) => {
    const config = CATEGORY_CONFIG[file.type] || CATEGORY_CONFIG.other;
    const isDeleting = deleting === file.name;
    const expiry = getExpiryInfo(file);

    return (
      <View key={file.name + file.created_at} style={[styles.fileItem, isDeleting && styles.fileItemDeleting]}>
        <View style={[styles.fileIcon, { backgroundColor: config.color + '15' }]}>
          <Ionicons name={(
            file.type === 'image' ? 'image' :
            file.type === 'document' ? 'document-text' :
            file.type === 'code' ? 'code-slash' :
            file.type === 'audio' ? 'musical-notes' :
            file.type === 'video' ? 'videocam' : 'file-tray'
          ) as any} size={22} color={config.color} />
        </View>
        <View style={styles.fileInfo}>
          <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
          <View style={styles.fileMetaRow}>
            <Text style={styles.fileMeta}>{filesApi.formatFileSize(file.size)}</Text>
            <Text style={styles.fileMetaDot}>·</Text>
            <Text style={styles.fileMeta}>{formatTime(file.created_at)}</Text>
            <Text style={styles.fileMetaDot}>·</Text>
            <Text style={[styles.fileSource, { color: file.source === 'user_upload' ? '#3b82f6' : '#8b5cf6' }]}>
              {file.source === 'user_upload' ? '上传' : 'AI生成'}
            </Text>
          </View>
          {expiry && expiry.daysLeft <= 3 && (
            <Text style={[styles.expiryLabel, { color: expiry.color }]}>
              {expiry.label}
            </Text>
          )}
        </View>
        <View style={styles.fileActions}>
          <TouchableOpacity
            onPress={() => handleDownload(file)}
            style={styles.actionBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="download-outline" size={18} color={Colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleDelete(file)}
            style={styles.actionBtn}
            activeOpacity={0.7}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color={Colors.danger} />
            ) : (
              <Ionicons name="trash-outline" size={18} color={Colors.danger} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderSectionHeader = (group: FileGroup) => {
    const config = CATEGORY_CONFIG[group.category];
    return (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionEmoji}>{config.emoji}</Text>
        <Text style={styles.sectionTitle}>{config.label}</Text>
        <Text style={styles.sectionCount}>{group.files.length}</Text>
      </View>
    );
  };

  // 将分组数据扁平化为 FlatList 可用的数据
  const listData: Array<{ type: 'header'; group: FileGroup } | { type: 'file'; file: ProjectFile }> = [];
  for (const group of groupedFiles) {
    listData.push({ type: 'header', group });
    for (const file of group.files) {
      listData.push({ type: 'file', file });
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {files.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="folder-open-outline" size={56} color="#ddd" />
          <Text style={styles.emptyTitle}>暂无项目文件</Text>
          <Text style={styles.emptyHint}>对话中上传或 AI 生成的文件都会保存在这里</Text>
          <Text style={styles.emptyHint}>每个对话的文件互相独立</Text>
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item, index) => {
            if (item.type === 'header') return `header-${item.group.category}`;
            return `file-${item.file.name}-${index}`;
          }}
          renderItem={({ item }) => {
            if (item.type === 'header') {
              return renderSectionHeader(item.group);
            }
            return renderFileItem(item.file);
          }}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
          ListHeaderComponent={
            <View style={styles.header}>
              <View>
                <Text style={styles.headerTitle}>项目文件</Text>
                <Text style={styles.headerCount}>{files.length} 个文件</Text>
              </View>
              <TouchableOpacity
                onPress={onRefresh}
                style={styles.refreshBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="refresh-outline" size={20} color={Colors.primary} />
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: Spacing.md },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  headerCount: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    paddingHorizontal: 4,
  },
  sectionEmoji: { fontSize: 18, marginRight: 6 },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  sectionCount: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    backgroundColor: Colors.surfaceSecondary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    marginLeft: 8,
    fontWeight: '600',
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  fileItemDeleting: { opacity: 0.5 },
  fileIcon: {
    width: 42,
    height: 42,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fileInfo: { flex: 1, marginLeft: 12 },
  fileName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  fileMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  fileMeta: { fontSize: FontSize.xs, color: Colors.textTertiary },
  fileMetaDot: { fontSize: FontSize.xs, color: Colors.textTertiary, marginHorizontal: 4 },
  fileSource: { fontSize: FontSize.xs, fontWeight: '600' },
  expiryLabel: { fontSize: FontSize.xs, fontWeight: '600', marginTop: 3 },
  fileActions: { flexDirection: 'row', gap: 4 },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: '600', color: Colors.textSecondary, marginTop: 16 },
  emptyHint: { fontSize: FontSize.sm, color: Colors.textTertiary, marginTop: 6, textAlign: 'center' },
});
