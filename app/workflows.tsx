import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Modal, TextInput, Alert } from "react-native";
import { SafeAlert } from "../src/utils/safeAlert";
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { workflowApi } from '../src/api/workflow';
import { SkeletonLoader } from '../src/components/SkeletonLoader';
import { Colors, Spacing, BorderRadius, FontSize, Shadows } from '../src/constants/theme';
import { useTheme } from '../src/hooks/useTheme';

interface WorkflowItem {
  id: string;
  name: string;
  description?: string;
  status?: number;
  update_time?: string;
}

export default function WorkflowsScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const [items, setItems] = useState<WorkflowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const result = await workflowApi.list({ page: 1, page_size: 50 });
      const list = (result.items || []).map((item: any) => ({
        id: String(item.workflow_id || item.id || ''),
        name: item.name || item.workflow_name || '\u672a\u547d\u540d\u5de5\u4f5c\u6d41',
        description: item.description || '',
        status: item.status,
        update_time: item.update_time || '',
      }));
      setItems(list);
    } catch (error) {
      console.error('Failed to fetch workflows:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  const handleCreate = async () => {
    if (!newName.trim()) {
      SafeAlert.alert('\u63d0\u793a', '\u8bf7\u8f93\u5165\u5de5\u4f5c\u6d41\u540d\u79f0');
      return;
    }
    setCreating(true);
    try {
      // Workflow creation would go through the API
      SafeAlert.alert('\u63d0\u793a', '\u5de5\u4f5c\u6d41\u521b\u5efa\u8bf7\u5230 sylab \u5e73\u53f0\u64cd\u4f5c\uff0c\u6b64\u5904\u4ec5\u652f\u6301\u67e5\u770b');
      setShowCreateModal(false);
      setNewName('');
      setNewDesc('');
    } catch (e) {
      SafeAlert.alert('\u9519\u8bef', '\u521b\u5efa\u5de5\u4f5c\u6d41\u5931\u8d25');
    } finally {
      setCreating(false);
    }
  };

  const getStatusInfo = (status?: number) => {
    switch (status) {
      case 1: return { label: '\u5df2\u53d1\u5e03', color: '#10b981', icon: 'checkmark-circle' };
      case 0: return { label: '\u8349\u7a3f', color: '#f59e0b', icon: 'create-outline' };
      default: return { label: '\u5df2\u53d1\u5e03', color: '#10b981', icon: 'checkmark-circle' };
    }
  };

  const renderItem = ({ item }: { item: WorkflowItem }) => {
    const statusInfo = getStatusInfo(item.status);
    return (
      <View style={[styles.card, { backgroundColor: isDark ? '#1e293b' : '#fff' }]}>
        <View style={[styles.cardIconWrap, { backgroundColor: isDark ? 'rgba(96,48,255,0.2)' : 'rgba(96,48,255,0.08)' }]}>
          <Ionicons name="git-network-outline" size={22} color={Colors.primary} />
        </View>
        <View style={styles.cardContent}>
          <Text style={[styles.cardTitle, { color: isDark ? '#f1f5f9' : Colors.text }]} numberOfLines={1}>{item.name}</Text>
          {item.description ? (
            <Text style={[styles.cardDesc, { color: isDark ? '#94a3b8' : Colors.textSecondary }]} numberOfLines={2}>{item.description}</Text>
          ) : null}
          <View style={styles.cardMeta}>
            <Ionicons name={statusInfo.icon as any} size={12} color={statusInfo.color} />
            <Text style={[styles.cardMetaText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
            {item.update_time ? (
              <Text style={[styles.cardMetaText, { color: isDark ? '#64748b' : Colors.textTertiary, marginLeft: 8 }]}>
                {new Date(item.update_time).toLocaleDateString()}
              </Text>
            ) : null}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color={isDark ? '#64748b' : Colors.textTertiary} />
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: isDark ? '#0f172a' : Colors.backgroundSecondary }]}>
        <View style={[styles.header, { backgroundColor: isDark ? '#1e293b' : '#fff' }]}>
          <View style={{ width: 36 }} />
          <View style={{ height: 16, width: 80, backgroundColor: isDark ? '#334155' : '#E8E8E8', borderRadius: 12 }} />
          <View style={{ width: 36 }} />
        </View>
        <SkeletonLoader type="list" visible={loading} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#0f172a' : Colors.backgroundSecondary }]}>
      <View style={[styles.header, { backgroundColor: isDark ? '#1e293b' : '#fff', borderBottomColor: isDark ? '#334155' : Colors.borderLight }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={isDark ? '#f1f5f9' : Colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: isDark ? '#f1f5f9' : Colors.text }]}>\u5de5\u4f5c\u6d41</Text>
        <TouchableOpacity onPress={() => setShowCreateModal(true)} style={{ width: 36, height: 36, justifyContent: 'center', alignItems: 'center' }}>
          <Ionicons name="add-circle-outline" size={22} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="git-network-outline" size={56} color={isDark ? '#475569' : Colors.textTertiary} />
          <Text style={[styles.emptyText, { color: isDark ? '#94a3b8' : Colors.textTertiary }]}>\u6682\u65e0\u5de5\u4f5c\u6d41</Text>
          <Text style={[styles.emptySubText, { color: isDark ? '#64748b' : Colors.textTertiary }]}>\u70b9\u51fb\u53f3\u4e0a\u89d2 + \u521b\u5efa\u5de5\u4f5c\u6d41</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: Spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Create FAB */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: Colors.primary }]}
        onPress={() => setShowCreateModal(true)}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Create Modal */}
      <Modal visible={showCreateModal} transparent animationType="fade" onRequestClose={() => setShowCreateModal(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowCreateModal(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: isDark ? '#1e293b' : '#fff' }]} onStartShouldSetResponder={() => true}>
            <Text style={[styles.modalTitle, { color: isDark ? '#f1f5f9' : '#0f172a' }]}>\u521b\u5efa\u5de5\u4f5c\u6d41</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: isDark ? '#0f172a' : '#f8fafc', color: isDark ? '#f1f5f9' : '#0f172a', borderColor: isDark ? '#334155' : '#e2e8f0' }]}
              placeholder="\u5de5\u4f5c\u6d41\u540d\u79f0"
              placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
              value={newName}
              onChangeText={setNewName}
            />
            <TextInput
              style={[styles.modalInput, { backgroundColor: isDark ? '#0f172a' : '#f8fafc', color: isDark ? '#f1f5f9' : '#0f172a', borderColor: isDark ? '#334155' : '#e2e8f0', minHeight: 80, textAlignVertical: 'top' }]}
              placeholder="\u63cf\u8ff0\uff08\u53ef\u9009\uff09"
              placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
              value={newDesc}
              onChangeText={setNewDesc}
              multiline
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: isDark ? '#334155' : '#f1f5f9' }]}
                onPress={() => setShowCreateModal(false)}
              >
                <Text style={{ color: isDark ? '#94a3b8' : '#64748b', fontSize: 15, fontWeight: '600' }}>\u53d6\u6d88</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: Colors.primary, opacity: creating ? 0.6 : 1 }]}
                onPress={handleCreate}
                disabled={creating}
              >
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>{creating ? '\u521b\u5efa\u4e2d...' : '\u521b\u5efa'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderBottomWidth: 0.5,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '700' },
  card: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: BorderRadius.lg, padding: Spacing.md,
    marginBottom: Spacing.sm, ...Shadows.sm,
  },
  cardIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginRight: Spacing.md,
  },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: FontSize.md, fontWeight: '600' },
  cardDesc: { fontSize: FontSize.sm, marginTop: 2 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 4 },
  cardMetaText: { fontSize: FontSize.xs },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 80 },
  emptyText: { fontSize: FontSize.md, marginTop: Spacing.md },
  emptySubText: { fontSize: FontSize.sm, marginTop: 4 },
  fab: {
    position: 'absolute', right: 20, bottom: 24,
    width: 56, height: 56, borderRadius: 28,
    justifyContent: 'center', alignItems: 'center',
    elevation: 6, shadowColor: '#6030ff',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 8,
  },
  modalOverlay: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalContent: {
    width: 320, borderRadius: 16, padding: 24,
  },
  modalTitle: {
    fontSize: 18, fontWeight: '700', marginBottom: 16, textAlign: 'center',
  },
  modalInput: {
    borderWidth: 1, borderRadius: 10, padding: 12,
    fontSize: 15, marginBottom: 12,
  },
  modalButtons: {
    flexDirection: 'row', gap: 12, marginTop: 8,
  },
  modalBtn: {
    flex: 1, height: 44, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },
});
