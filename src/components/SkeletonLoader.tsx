import React from "react";
import { View, ActivityIndicator, Text, StyleSheet } from "react-native";

type SkeletonType = "chat-list" | "chat-detail" | "card-grid" | "list";
interface SkeletonLoaderProps { type: SkeletonType; visible: boolean; delay?: number; }

export function SkeletonLoader({ visible }: SkeletonLoaderProps) {
  if (!visible) return null;
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#8B5CF6" />
      <Text style={styles.text}>加载中...</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  text: { marginTop: 12, fontSize: 14, color: "#9ca3af" },
});
