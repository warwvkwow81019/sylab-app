import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, FontSize, Shadows } from '../src/constants/theme';

const APP_VERSION = '1.0.0';

const FAQ_ITEMS = [
  { q: '如何创建 Agent？', a: '在 sylab 平台创建 Bot 后，即可在 App 的"我的 Agent"中查看和使用。' },
  { q: '积分如何计算？', a: '每次 Agent 对话、工作流运行等操作会消耗积分，具体消耗量取决于 Token 使用量。' },
  { q: '如何获取积分？', a: '可通过积分充值卡兑换，或联系管理员获取积分额度。' },
  { q: '知识库如何同步？', a: '在 sylab 平台创建并上传文档后，App 会自动同步最新的知识库列表。' },
  { q: '支持哪些模型？', a: '支持 Sylab 平台提供的所有模型，包括 Doubao 系列和第三方模型。' },
];

export default function HelpScreen() {
  const router = useRouter();
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const handleContact = () => {
    Linking.openURL('http://36.137.84.216:9091').catch(() => {});
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>帮助与反馈</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* APP 介绍 */}
        <View style={styles.introSection}>
          <View style={styles.introIconWrap}>
            <Ionicons name="apps" size={36} color={Colors.primary} />
          </View>
          <Text style={styles.introTitle}>SyLab App</Text>
          <Text style={styles.introVersion}>版本 {APP_VERSION}</Text>
          <Text style={styles.introDesc}>
            SyLab 是您的智能 Agent 工作台，提供便捷的 Agent 对话、工作流管理、知识库管理等功能。
          </Text>
        </View>

        {/* 常见问题 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>常见问题</Text>
          {FAQ_ITEMS.map((item, idx) => (
            <TouchableOpacity
              key={idx}
              style={[styles.faqItem, idx === FAQ_ITEMS.length - 1 && { borderBottomWidth: 0 }]}
              onPress={() => setExpandedFaq(expandedFaq === idx ? null : idx)}
              activeOpacity={0.7}
            >
              <View style={styles.faqHeader}>
                <Ionicons name="help-circle-outline" size={16} color={Colors.primary} />
                <Text style={styles.faqQuestion}>{item.q}</Text>
                <Ionicons
                  name={expandedFaq === idx ? 'chevron-up' : 'chevron-down'}
                  size={14} color={Colors.textTertiary}
                />
              </View>
              {expandedFaq === idx && (
                <Text style={styles.faqAnswer}>{item.a}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* 联系我们 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>联系我们</Text>
          <TouchableOpacity style={styles.contactRow} onPress={handleContact} activeOpacity={0.6}>
            <View style={styles.rowLeft}>
              <Ionicons name="globe-outline" size={20} color={Colors.textSecondary} />
              <Text style={styles.rowLabel}>官方网站</Text>
            </View>
            <Ionicons name="open-outline" size={14} color={Colors.textTertiary} />
          </TouchableOpacity>
          <View style={styles.contactRow}>
            <View style={styles.rowLeft}>
              <Ionicons name="mail-outline" size={20} color={Colors.textSecondary} />
              <Text style={styles.rowLabel}>客服邮箱</Text>
            </View>
            <Text style={styles.rowValue}>support@sylab.com</Text>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundSecondary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    backgroundColor: '#fff', borderBottomWidth: 0.5, borderBottomColor: Colors.borderLight,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  introSection: {
    alignItems: 'center', paddingVertical: Spacing.xl,
    backgroundColor: '#fff', marginTop: Spacing.sm,
    marginHorizontal: Spacing.md, borderRadius: BorderRadius.lg, ...Shadows.sm,
  },
  introIconWrap: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: 'rgba(96,48,255,0.08)',
    justifyContent: 'center', alignItems: 'center',
  },
  introTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text, marginTop: 12 },
  introVersion: { fontSize: FontSize.sm, color: Colors.textTertiary, marginTop: 4 },
  introDesc: {
    fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center',
    paddingHorizontal: Spacing.lg, marginTop: Spacing.md, lineHeight: 20,
  },
  section: {
    backgroundColor: '#fff', marginTop: Spacing.sm,
    borderRadius: BorderRadius.lg, marginHorizontal: Spacing.md,
    paddingHorizontal: Spacing.md, paddingTop: Spacing.sm,
    ...Shadows.sm,
  },
  sectionTitle: {
    fontSize: FontSize.xs, color: Colors.textTertiary, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 1, paddingVertical: Spacing.xs,
  },
  faqItem: {
    paddingVertical: Spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: Colors.borderLight,
  },
  faqHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  faqQuestion: { flex: 1, fontSize: FontSize.sm, color: Colors.text, fontWeight: '500' },
  faqAnswer: {
    fontSize: FontSize.sm, color: Colors.textSecondary,
    marginTop: 8, paddingLeft: 24, lineHeight: 20,
  },
  contactRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: Colors.borderLight,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  rowLabel: { fontSize: FontSize.md, color: Colors.text },
  rowValue: { fontSize: FontSize.sm, color: Colors.textSecondary },
});
