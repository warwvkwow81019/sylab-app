import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Modal, Platform } from "react-native";
import { SafeAlert } from "../src/utils/safeAlert";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, FontSize, Shadows } from '../src/constants/theme';
import { useTheme } from '../src/hooks/useTheme';

const APP_VERSION = '1.3.0';

const THEME_COLORS = [
  { name: '星空紫', value: '#6030ff' },
  { name: '科技蓝', value: '#3b82f6' },
  { name: '活力橙', value: '#f59e0b' },
  { name: '薄荷绿', value: '#22c55e' },
  { name: '玫瑰红', value: '#ec4899' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { isDark, toggleDark, Colors: C } = useTheme();
  const [showAbout, setShowAbout] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [currentTheme, setCurrentTheme] = useState(Colors.primary);
  const [cacheSize, setCacheSize] = useState<string>('计算中...');
  const [fontSize, setFontSize] = useState<number>(15);
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(true);

  React.useEffect(() => {
    AsyncStorage.getItem('app_theme_color').then(saved => {
      if (saved) setCurrentTheme(saved);
    }).catch(() => {});
    AsyncStorage.getItem('app_font_size').then(saved => {
      if (saved) setFontSize(Number(saved));
    }).catch(() => {});
    AsyncStorage.getItem('app_notifications').then(saved => {
      if (saved === 'false') setNotificationsEnabled(false);
    }).catch(() => {});
    AsyncStorage.getAllKeys().then(keys => {
      const size = keys.length * 200;
      if (size < 1024) setCacheSize(`${size} B`);
      else if (size < 1024 * 1024) setCacheSize(`${(size / 1024).toFixed(1)} KB`);
      else setCacheSize(`${(size / 1024 / 1024).toFixed(1)} MB`);
    }).catch(() => setCacheSize('未知'));
  }, []);

  const showAlert = (title: string, message: string, buttons?: { text: string; onPress?: () => void; style?: string }[]) => {
    if (Platform.OS === 'web') {
      if (buttons && buttons.length > 1) {
        const confirmed = window.confirm(message);
        if (confirmed && buttons[1]?.onPress) buttons[1].onPress();
      } else {
        window.alert(title + '\n' + message);
      }
    } else {
      SafeAlert.alert(title, message, buttons as any);
    }
  };

  const handleClearCache = async () => {
    showAlert('清除缓存', '确定要清除应用缓存吗？不会影响账号数据。', [
      { text: '取消', style: 'cancel' },
      {
        text: '确定清除',
        style: 'destructive',
        onPress: async () => {
          try {
            const keys = await AsyncStorage.getAllKeys();
            const protectedKeys = ['auth_token', 'pat_token', 'user_info', 'app_theme_color', 'app_dark_mode'];
            const keysToRemove = keys.filter(k => !protectedKeys.some(pk => k.includes(pk)));
            for (const key of keysToRemove) {
              await AsyncStorage.removeItem(key);
            }
            setCacheSize('0 B');
            showAlert('完成', '缓存已清除');
          } catch (e) {
            showAlert('提示', '清除缓存失败');
          }
        },
      },
    ]);
  };

  const handleThemeChange = async (color: string) => {
    try {
      await AsyncStorage.setItem('app_theme_color', color);
      setCurrentTheme(color);
      setShowThemePicker(false);
      showAlert('提示', '主题色已更换');
    } catch (e) {
      showAlert('提示', '设置失败');
    }
  };

  const bgColor = isDark ? '#0f172a' : '#fff';
  const cardBg = isDark ? '#1e293b' : '#fff';
  const borderColor = isDark ? '#334155' : Colors.borderLight;

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#0f172a' : Colors.backgroundSecondary }]}>
      <View style={[styles.header, { backgroundColor: bgColor, borderBottomColor: borderColor }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={isDark ? '#f1f5f9' : Colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: isDark ? '#f1f5f9' : Colors.text }]}>应用设置</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={[styles.section, { backgroundColor: cardBg }]}>
          <Text style={styles.sectionTitle}>外观</Text>
          <View style={[styles.row, { borderBottomColor: borderColor }]}>
            <View style={styles.rowLeft}>
              <Ionicons name={isDark ? "moon" : "sunny-outline"} size={20} color={Colors.textSecondary} />
              <Text style={[styles.rowLabel, { color: isDark ? '#f1f5f9' : Colors.text }]}>深色模式</Text>
            </View>
            <TouchableOpacity onPress={toggleDark} activeOpacity={0.6}>
              <View style={[styles.toggleTrack, isDark && styles.toggleTrackActive]}>
                <View style={[styles.toggleThumb, isDark && styles.toggleThumbActive]} />
              </View>
            </TouchableOpacity>
          </View>
          <View style={[styles.row, { borderBottomColor: borderColor }]}>
            <View style={styles.rowLeft}>
              <Ionicons name="information-circle-outline" size={20} color={Colors.textSecondary} />
              <Text style={[styles.rowLabel, { color: isDark ? '#f1f5f9' : Colors.text }]}>应用版本</Text>
            </View>
            <Text style={styles.rowValue}>v{APP_VERSION}</Text>
          </View>
          <View style={[styles.row, { borderBottomColor: borderColor }]}>
            <View style={styles.rowLeft}>
              <Ionicons name="text-outline" size={20} color={Colors.textSecondary} />
              <Text style={[styles.rowLabel, { color: isDark ? '#f1f5f9' : Colors.text }]}>字体大小</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TouchableOpacity onPress={() => { const s = Math.max(12, fontSize - 1); setFontSize(s); AsyncStorage.setItem('app_font_size', String(s)); }} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: isDark ? '#334155' : '#f1f5f9', justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name="remove" size={14} color={isDark ? '#f1f5f9' : Colors.text} />
              </TouchableOpacity>
              <Text style={{ fontSize: 12, color: isDark ? '#94a3b8' : Colors.textSecondary, width: 24, textAlign: 'center' }}>{fontSize}</Text>
              <TouchableOpacity onPress={() => { const s = Math.min(22, fontSize + 1); setFontSize(s); AsyncStorage.setItem('app_font_size', String(s)); }} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: isDark ? '#334155' : '#f1f5f9', justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name="add" size={14} color={isDark ? '#f1f5f9' : Colors.text} />
              </TouchableOpacity>
            </View>
          </View>
          <TouchableOpacity style={[styles.row, { borderBottomColor: borderColor }]} onPress={() => setShowThemePicker(true)} activeOpacity={0.6}>
            <View style={styles.rowLeft}>
              <Ionicons name="color-palette-outline" size={20} color={Colors.textSecondary} />
              <Text style={[styles.rowLabel, { color: isDark ? '#f1f5f9' : Colors.text }]}>主题色</Text>
            </View>
            <View style={styles.colorPreview}>
              <View style={[styles.colorDot, { backgroundColor: currentTheme }]} />
              <Ionicons name="chevron-forward" size={14} color={Colors.textTertiary} />
            </View>
          </TouchableOpacity>
        </View>

        <View style={[styles.section, { backgroundColor: cardBg }]}>
          <Text style={styles.sectionTitle}>存储</Text>
          <View style={[styles.row, { borderBottomColor: borderColor }]}>
            <View style={styles.rowLeft}>
              <Ionicons name="server-outline" size={20} color={Colors.textSecondary} />
              <Text style={[styles.rowLabel, { color: isDark ? '#f1f5f9' : Colors.text }]}>缓存大小</Text>
            </View>
            <Text style={styles.rowValue}>{cacheSize}</Text>
          </View>
          <TouchableOpacity style={styles.row} onPress={handleClearCache} activeOpacity={0.6}>
            <View style={styles.rowLeft}>
              <Ionicons name="trash-outline" size={20} color={Colors.textSecondary} />
              <Text style={[styles.rowLabel, { color: isDark ? '#f1f5f9' : Colors.text }]}>清除缓存</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={Colors.textTertiary} />
          </TouchableOpacity>
        </View>

        <View style={[styles.section, { backgroundColor: cardBg }]}>
          <Text style={styles.sectionTitle}>通知</Text>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="notifications-outline" size={20} color={Colors.textSecondary} />
              <Text style={[styles.rowLabel, { color: isDark ? '#f1f5f9' : Colors.text }]}>消息通知</Text>
            </View>
            <TouchableOpacity onPress={() => {
              const next = !notificationsEnabled;
              setNotificationsEnabled(next);
              AsyncStorage.setItem('app_notifications', String(next));
            }} activeOpacity={0.6}>
              <View style={[styles.toggleTrack, notificationsEnabled && styles.toggleTrackActive]}>
                <View style={[styles.toggleThumb, notificationsEnabled && styles.toggleThumbActive]} />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: cardBg }]}>
          <Text style={styles.sectionTitle}>关于</Text>
          <TouchableOpacity style={styles.row} onPress={() => setShowAbout(true)} activeOpacity={0.6}>
            <View style={styles.rowLeft}>
              <Ionicons name="help-circle-outline" size={20} color={Colors.textSecondary} />
              <Text style={[styles.rowLabel, { color: isDark ? '#f1f5f9' : Colors.text }]}>关于应用</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={Colors.textTertiary} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={showThemePicker} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: cardBg }]}>
            <Ionicons name="color-palette" size={36} color={Colors.primary} />
            <Text style={[styles.modalTitle, { color: isDark ? '#f1f5f9' : Colors.text }]}>选择主题色</Text>
            <View style={styles.themeGrid}>
              {THEME_COLORS.map((t) => (
                <TouchableOpacity
                  key={t.value}
                  style={[styles.themeOption, currentTheme === t.value && styles.themeSelected]}
                  onPress={() => handleThemeChange(t.value)}
                >
                  <View style={[styles.themeColorDot, { backgroundColor: t.value }]} />
                  <Text style={[styles.themeName, { color: isDark ? '#94a3b8' : Colors.textSecondary }]}>{t.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: isDark ? '#334155' : '#f3f4f6', marginTop: 16 }]}
              onPress={() => setShowThemePicker(false)}
            >
              <Text style={{ color: isDark ? '#f1f5f9' : '#374151', fontSize: FontSize.md, fontWeight: '600' }}>取消</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showAbout} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: cardBg }]}>
            <Ionicons name="apps" size={40} color={Colors.primary} />
            <Text style={[styles.modalTitle, { color: isDark ? '#f1f5f9' : Colors.text }]}>SyLab App</Text>
            <Text style={[styles.modalDesc, { color: isDark ? '#94a3b8' : Colors.textSecondary }]}>版本 {APP_VERSION}</Text>
            <Text style={[styles.modalDesc, { color: isDark ? '#94a3b8' : Colors.textSecondary }]}>
              Sylab 移动端应用，提供 Agent 对话、工作流管理、知识库管理等功能。
            </Text>
            <TouchableOpacity
              style={styles.modalBtn}
              onPress={() => setShowAbout(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.modalBtnText}>知道了</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundSecondary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderBottomWidth: 0.5,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '700' },
  section: {
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.lg, marginHorizontal: Spacing.md,
    paddingHorizontal: Spacing.md, paddingTop: Spacing.sm,
    ...Shadows.sm,
  },
  sectionTitle: {
    fontSize: FontSize.xs, color: Colors.textTertiary, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 1, paddingVertical: Spacing.xs,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    borderBottomWidth: 0.5,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  rowLabel: { fontSize: FontSize.md },
  rowValue: { fontSize: FontSize.sm, color: Colors.textSecondary },
  colorPreview: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  colorDot: { width: 16, height: 16, borderRadius: 8 },
  toggleTrack: {
    width: 48, height: 28, borderRadius: 14,
    backgroundColor: '#e2e8f0', justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleTrackActive: {
    backgroundColor: Colors.primary,
  },
  toggleThumb: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2, shadowRadius: 2, elevation: 2,
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalBox: {
    width: 300, borderRadius: BorderRadius.lg,
    padding: Spacing.lg, alignItems: 'center', ...Shadows.sm,
  },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '700', marginTop: 12, marginBottom: 8 },
  modalDesc: { fontSize: FontSize.sm, textAlign: 'center', marginBottom: 8 },
  modalBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, marginTop: 12, width: '100%', alignItems: 'center',
  },
  modalBtnText: { color: '#fff', fontSize: FontSize.md, fontWeight: '600' },
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: 8 },
  themeOption: {
    alignItems: 'center', padding: 8, borderRadius: 12,
    borderWidth: 2, borderColor: 'transparent',
  },
  themeSelected: { borderColor: Colors.primary },
  themeColorDot: { width: 32, height: 32, borderRadius: 16, marginBottom: 4 },
  themeName: { fontSize: FontSize.xs },
});
