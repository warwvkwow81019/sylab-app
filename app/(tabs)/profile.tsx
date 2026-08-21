import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, TextInput, Alert, Image, ActivityIndicator, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../../src/store/auth';
import { creditsApi } from '../../src/api/credits';
import { authApi } from '../../src/api/auth';
import { botApi } from '../../src/api/bot';
import { projectApi } from '../../src/api/project';
import { knowledgeApi } from '../../src/api/knowledge';
import { Colors, Spacing, BorderRadius, FontSize, Shadows } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import { Ionicons } from '@expo/vector-icons';

// 路由映射
const ROUTE_MAP: Record<string, string> = {
  '我的知识库': '/knowledge',
  '工作流': '/workflows',
  '我的插件': '/plugins',
  '我的 Agent': '/(tabs)/agents',
  '工具中心': '/(tabs)/schedule',
  '积分明细': '/credits',
  '应用设置': '/settings',
  '通知设置': '/notifications',
  '帮助与反馈': '/help',
};

const MENU_GROUPS = [
  {
    title: '创作工具',
    items: [
      { icon: 'apps-outline', label: '工具中心', desc: 'AI生图/视频/浏览器等快捷工具' },
      { icon: 'book-outline', label: '我的知识库', desc: '管理文档和知识切片' },
      { icon: 'git-network-outline', label: '工作流', desc: '可视化流程编排' },
      { icon: 'extension-puzzle', label: '我的插件', desc: '自定义插件管理' },
      { icon: 'people-outline', label: '我的 Agent', desc: '创建和管理 Agent' },
    ],
  },
  {
    title: '自动化',
    items: [
      { icon: 'link-outline', label: 'Webhook', desc: '外部触发器管理' },
    ],
  },
  {
    title: '设置',
    items: [
      { icon: 'wallet-outline', label: '积分明细', desc: '查看积分消费记录' },
      { icon: 'settings-outline', label: '应用设置', desc: '通用配置' },
      { icon: 'notifications-outline', label: '通知设置', desc: '推送通知管理' },
      { icon: 'help-circle-outline', label: '帮助与反馈', desc: '使用帮助' },
    ],
  },
];

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout, setUser } = useAuthStore();
  const [balance, setBalance] = useState<number>(0);
  const [stats, setStats] = useState({ projects: 0, agents: 0, knowledge: 0 });
  const [comingSoonModal, setComingSoonModal] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const { isDark, Colors: C } = useTheme();

  useEffect(() => {
    if (user?.id) {
      creditsApi.getBalance(user.id).then(data => {
        const raw = typeof data.balance === 'string' ? parseFloat(data.balance) : (data.balance || 0);
        setBalance(Math.round(raw));
      }).catch(() => setBalance(0));

      Promise.all([
        projectApi.list({ page: 1, page_size: 1 }).catch(() => ({ total: 0 })),
        botApi.list({ page: 1, page_size: 1 }).catch(() => ({ total: 0 })),
        knowledgeApi.list({ page: 1, page_size: 1 }).catch(() => ({ total: 0 })),
      ]).then(([projResult, botResult, knowledgeResult]) => {
        setStats({
          projects: projResult.total || 0,
          agents: botResult.total || 0,
          knowledge: knowledgeResult.total || 0,
        });
      }).catch(() => {});
    }
  }, [user]);

  // Edit profile
  const [showEditName, setShowEditName] = useState(false);
  const [webAlert, setWebAlert] = useState<{ title: string; message: string; buttons: { text: string; onPress?: () => void; style?: string }[] } | null>(null);

  const showAlert = (title: string, message: string, buttons?: { text: string; onPress?: () => void }[]) => {
    if (Platform.OS === 'web') {
      setWebAlert({ title, message, buttons: buttons || [{ text: '确定' }] });
    } else {
      Alert.alert(title, message, buttons?.map(b => ({ text: b.text, onPress: b.onPress, style: b.style as any })) || undefined);
    }
  };
  const [editName, setEditName] = useState('');
  const [savingName, setSavingName] = useState(false);

  const handleEditName = () => {
    setEditName(user?.name || '');
    setShowEditName(true);
  };

  const handleSaveName = async () => {
    if (!editName.trim()) {
      showAlert('提示', '昵称不能为空');
      return;
    }
    setSavingName(true);
    try {
      await authApi.updateProfile({ name: editName.trim() });
      setShowEditName(false);
      showAlert('成功', '昵称已更新，重新登录后生效');
    } catch (e: any) {
      showAlert('失败', e.message || '请稍后重试');
    } finally {
      setSavingName(false);
    }
  };

  // 头像上传
  const handlePickAvatar = async () => {
    try {
      const permResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permResult.granted) {
        showAlert('权限不足', '请允许访问相册以选择头像');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      await uploadAvatar(asset.uri);
    } catch (e: any) {
      showAlert('上传失败', e.message || '请稍后重试');
    }
  };

  const uploadAvatar = async (uri: string) => {
    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      const filename = uri.split('/').pop() || 'avatar.jpg';
      const ext = filename.split('.').pop();
      const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
      formData.append('file', {
        uri,
        name: filename,
        type: mimeType,
      } as any);

      const authToken = useAuthStore.getState().patToken;
      const baseUrl = 'http://36.137.84.216:9091';
      const resp = await fetch(`${baseUrl}/api/web/user/update/upload_avatar/`, {
        method: 'POST',
        headers: {
          'Authorization': authToken ? `Bearer ${authToken}` : '',
          'Content-Type': 'multipart/form-data',
        },
        body: formData,
      });
      const data = await resp.json();
      if (data.code === 0 && data.data?.avatar_url) {
        const currentUser = useAuthStore.getState().user;
        if (currentUser) {
          setUser({ ...currentUser, avatar_url: data.data.avatar_url });
        }
        showAlert('成功', '头像已更新');
      } else {
        showAlert('上传失败', data.msg || '服务器返回错误');
      }
    } catch (e: any) {
      showAlert('上传失败', e.message || '网络错误');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleAvatarPress = () => {
    showAlert('修改资料',
      '选择要修改的内容',
      [
        { text: '更换头像', onPress: handlePickAvatar },
        { text: '修改昵称', onPress: handleEditName },
        { text: '取消', style: 'cancel' },
      ]
    );
  };

  const handleMenuPress = (label: string) => {
    if (label === 'Webhook') {
      setComingSoonModal(true);
      return;
    }
    const route = ROUTE_MAP[label];
    if (route) {
      router.push(route as any);
    }
  };

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = async () => {
    setShowLogoutConfirm(false);
    await logout();
    router.replace('/login');
  };

  const renderAvatar = () => {
    if (user?.avatar_url) {
      return <Image source={{ uri: user.avatar_url }} style={styles.avatarImage} />;
    }
    return <Text style={styles.avatarText}>{user?.name?.[0] || 'U'}</Text>;
  };

  // Web Alert Modal
  const WebAlertModal = () => {
    if (!webAlert || Platform.OS !== 'web') return null;
    return (
      <Modal visible animationType="fade" transparent>
        <TouchableOpacity style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }} activeOpacity={1} onPress={() => setWebAlert(null)}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, margin: 40, minWidth: 280, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: Colors.text, textAlign: 'center', marginBottom: 12 }}>{webAlert.title}</Text>
            <Text style={{ fontSize: 15, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 20 }}>{webAlert.message}</Text>
            <View style={{ flexDirection: 'row', justifyContent: webAlert.buttons.length > 1 ? 'space-between' : 'center' }}>
              {webAlert.buttons.map((btn, i) => (
                <TouchableOpacity
                  key={i}
                  style={{ paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, backgroundColor: btn.text === '取消' ? '#f1f5f9' : Colors.primary, minWidth: 80 }}
                  onPress={() => { setWebAlert(null); btn.onPress?.(); }}
                >
                  <Text style={{ textAlign: 'center', color: btn.text === '取消' ? Colors.textSecondary : '#fff', fontWeight: '600', fontSize: 15 }}>{btn.text}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    );
  };

  return (
    <View style={{ flex: 1 }}>
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* 用户头部 */}
      <LinearGradient colors={[Colors.gradientStart, Colors.gradientEnd]} style={styles.header}>
        <TouchableOpacity style={styles.avatarCircle} onPress={handleAvatarPress} disabled={uploadingAvatar}>
          {renderAvatar()}
          {uploadingAvatar ? (
            <ActivityIndicator size="small" color="#fff" style={styles.uploadingIndicator} />
          ) : (
            <View style={styles.editBadge}>
              <Ionicons name="camera" size={10} color="#fff" />
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={handleAvatarPress}>
          <Text style={styles.userName}>{user?.name || '未登录'}</Text>
        </TouchableOpacity>
        <Text style={styles.userEmail}>{user?.email || '未设置'}</Text>

        {/* 资产概览 */}
        <View style={styles.statsRow}>
          {[
            { icon: 'folder' as const, label: '项目', value: String(stats.projects) },
            { icon: 'people' as const, label: 'Agent', value: String(stats.agents) },
            { icon: 'book' as const, label: '知识库', value: String(stats.knowledge) },
          ].map((s) => (
            <View key={s.label} style={styles.statItem}>
              <Ionicons name={s.icon} size={16} color="rgba(255,255,255,0.7)" />
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
          <TouchableOpacity style={styles.statItem} onPress={() => router.push('/credits' as any)}>
            <Ionicons name="diamond" size={16} color="rgba(255,255,255,0.9)" />
            <Text style={[styles.statValue, { color: '#fde68a' }]}>{balance}</Text>
            <Text style={styles.statLabel}>积分 ›</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* 菜单组 */}
      {MENU_GROUPS.map((group) => (
        <View key={group.title} style={styles.menuGroup}>
          <Text style={styles.groupTitle}>{group.title}</Text>
          {group.items.map((item, idx) => (
            <TouchableOpacity
              key={item.label}
              style={[styles.menuItem, idx === group.items.length - 1 && { borderBottomWidth: 0 }]}
              onPress={() => handleMenuPress(item.label)}
              activeOpacity={0.6}
            >
              <View style={styles.menuIconWrap}>
                <Ionicons name={item.icon as any} size={20} color={Colors.textSecondary} />
              </View>
              <View style={styles.menuContent}>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Text style={styles.menuDesc}>{item.desc}</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={Colors.textTertiary} />
            </TouchableOpacity>
          ))}
        </View>
      ))}

      {/* 退出登录 */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
        <Ionicons name="log-out-outline" size={18} color={Colors.danger} style={{ marginRight: 8 }} />
        <Text style={styles.logoutText}>退出登录</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />

      {/* 即将上线弹窗 */}
      <Modal visible={comingSoonModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Ionicons name="rocket-outline" size={40} color={Colors.primary} />
            <Text style={styles.modalTitle}>即将上线</Text>
            <Text style={styles.modalDesc}>Webhook 功能正在开发中，敬请期待</Text>
            <TouchableOpacity
              style={styles.modalBtn}
              onPress={() => setComingSoonModal(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.modalBtnText}>知道了</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 退出登录确认弹窗 */}
      <Modal visible={showLogoutConfirm} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>确认退出</Text>
            <Text style={styles.modalDesc}>确定要退出登录吗？</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: isDark ? '#334155' : '#f3f4f6', flex: 1 }]}
                onPress={() => setShowLogoutConfirm(false)}
                activeOpacity={0.7}
              >
                <Text style={[styles.modalBtnText, { color: '#374151' }]}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: Colors.danger, flex: 1 }]}
                onPress={confirmLogout}
                activeOpacity={0.7}
              >
                <Text style={styles.modalBtnText}>退出</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 编辑昵称弹窗 */}
      <Modal visible={showEditName} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Ionicons name="person-outline" size={36} color={Colors.primary} />
            <Text style={styles.modalTitle}>修改昵称</Text>
            <TextInput
              style={styles.editInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="输入新昵称"
              placeholderTextColor={Colors.textTertiary}
              maxLength={20}
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: isDark ? '#334155' : '#f3f4f6', flex: 1 }]}
                onPress={() => setShowEditName(false)}
              >
                <Text style={[styles.modalBtnText, { color: '#374151' }]}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { flex: 1, opacity: savingName ? 0.6 : 1 }]}
                onPress={handleSaveName}
                disabled={savingName}
              >
                <Text style={styles.modalBtnText}>{savingName ? '保存中...' : '保存'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      </ScrollView>
      <WebAlertModal />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundSecondary },
  header: {
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
  },
  avatarCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)',
    marginBottom: Spacing.sm,
    overflow: 'hidden',
  },
  avatarImage: { width: 72, height: 72, borderRadius: 36 },
  avatarText: { color: '#fff', fontSize: FontSize.xxl, fontWeight: '700' },
  uploadingIndicator: { position: 'absolute' },
  userName: { fontSize: FontSize.xl, fontWeight: '700', color: '#fff' },
  userEmail: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  statsRow: {
    flexDirection: 'row', marginTop: Spacing.lg,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    width: '100%',
  },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontSize: FontSize.lg, fontWeight: '700', color: '#fff' },
  statLabel: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.7)' },
  menuGroup: {
    backgroundColor: '#fff',
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    ...Shadows.sm,
  },
  groupTitle: {
    fontSize: FontSize.xs, color: Colors.textTertiary,
    fontWeight: '600', textTransform: 'uppercase',
    letterSpacing: 1, paddingVertical: Spacing.xs,
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: Colors.borderLight,
  },
  menuIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.backgroundSecondary,
    justifyContent: 'center', alignItems: 'center',
    marginRight: Spacing.md,
  },
  menuContent: { flex: 1 },
  menuLabel: { fontSize: FontSize.md, color: Colors.text, fontWeight: '500' },
  menuDesc: { fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 2 },
  logoutBtn: {
    flexDirection: 'row',
    margin: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
    ...Shadows.sm,
  },
  logoutText: { color: Colors.danger, fontSize: FontSize.md, fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBox: {
    width: 280,
    backgroundColor: '#fff',
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    ...Shadows.sm,
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
    marginTop: 12,
  },
  modalDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 8,
  },
  modalBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    marginTop: 12,
  },
  editBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  editInput: {
    width: '100%', height: 44, borderWidth: 1, borderColor: Colors.borderLight,
    borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md,
    fontSize: FontSize.md, color: Colors.text, marginBottom: Spacing.md,
    backgroundColor: Colors.backgroundSecondary,
  },
  modalBtnText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: '600',
  },
});
