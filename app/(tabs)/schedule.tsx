import { useAuthStore } from "../../src/store/auth";
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { SafeAlert } from "../../src/utils/safeAlert";
import { useRouter } from 'expo-router';
import { Colors, Spacing, BorderRadius, FontSize, Shadows } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import { Ionicons } from '@expo/vector-icons';
import { chatApi } from '../../src/api/chat';

const TOOLS = [
  { icon: 'image-outline', label: 'AI 生图', desc: '文字生成图片', color: '#6030ff', prompt: '帮我生成一张图片：' },
  { icon: 'videocam-outline', label: 'AI 视频', desc: '文字/图片生成视频', color: '#ec4899', prompt: '帮我生成一段视频：' },
  { icon: 'globe-outline', label: '浏览器', desc: 'AI 智能网页浏览', color: '#3b82f6', prompt: '帮我浏览这个网页并总结内容：' },
  { icon: 'document-text-outline', label: '文档处理', desc: '文件预览与转换', color: '#f59e0b', prompt: '帮我处理一个文档，我需要：' },
  { icon: 'search-outline', label: '知识检索', desc: '从知识库中搜索', color: '#22c55e', prompt: '在知识库中搜索：' },
  { icon: 'code-slash-outline', label: '代码执行', desc: '运行代码片段', color: '#6366f1', prompt: '帮我执行以下代码：\n```python\n\n```' },
];

export default function ScheduleScreen() {
  const router = useRouter();
  const { isDark } = useTheme();


  const handleToolPress = async (toolLabel: string, prompt?: string) => {
    try {
      const botId = '7669580347859795968';
      const userId = useAuthStore.getState().user?.id || "";
      const conv = await chatApi.createConversation(botId, toolLabel, userId);
      const convId = conv?.id || conv?.conversation_id || '';
      if (convId) {
        // Navigate with optional prompt parameter
        const promptParam = prompt ? `&prompt=${encodeURIComponent(prompt)}` : '';
        router.push(`/chat/${convId}?bot_id=${botId}${promptParam}` as any);
      }
    } catch (e: any) {
      SafeAlert.alert('提示', `${toolLabel} 功能正在准备中`);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>工具中心</Text>
      <Text style={styles.sectionSubtitle}>快速调用 AI 工具，助力高效创作</Text>

      <View style={styles.grid}>
        {TOOLS.map((tool) => (
          <TouchableOpacity key={tool.label} style={styles.toolCard} activeOpacity={0.7} onPress={() => handleToolPress(tool.label, tool.prompt)}>
            <View style={[styles.toolIcon, { backgroundColor: tool.color + '15' }]}>
              <Ionicons name={tool.icon as any} size={24} color={tool.color} />
            </View>
            <Text style={styles.toolLabel}>{tool.label}</Text>
            <Text style={styles.toolDesc}>{tool.desc}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundSecondary },
  content: { padding: Spacing.md },
  sectionTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text, marginTop: Spacing.sm },
  sectionSubtitle: { fontSize: FontSize.sm, color: Colors.textTertiary, marginTop: 4, marginBottom: Spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  toolCard: {
    width: '48%', backgroundColor: '#fff',
    borderRadius: BorderRadius.lg, padding: Spacing.md,
    ...Shadows.sm,
  },
  toolIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.sm },
  toolLabel: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text, marginBottom: 4 },
  toolDesc: { fontSize: FontSize.xs, color: Colors.textTertiary },
});

