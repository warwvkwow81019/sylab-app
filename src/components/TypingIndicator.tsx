import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Platform } from "react-native";
import { Colors, Spacing, FontSize } from "../constants/theme";
import { Ionicons } from "@expo/vector-icons";

interface ToolCallInfo {
  name: string;
  result?: string;
}

interface TypingIndicatorProps {
  statusText: string;
  visible: boolean;
  botName?: string;
  currentTool?: ToolCallInfo | null;
}

function getToolLabel(toolName: string): string {
  const n = toolName.toLowerCase();
  const isImageUnderstand = n.includes("understand_image") || n.includes("analyze_image") || n.includes("vision") || n.includes("ocr") || n.includes("describe_image");
  const isImageSearch = n.includes("search_image") || n.includes("image_search");
  const isScreenshot = n.includes("screenshot") || n.includes("take_screenshot") || n.includes("capture_screen");
  const isBgRemove = n.includes("remove_background") || n.includes("rembg") || n.includes("cutout");
  const isVideoStatus = n.includes("video_status") || n.includes("probe_video");
  const isClick = n.includes("click_element") || (n.includes("click") && !n.includes("doubleclick"));
  const isFill = n.includes("fill_form") || n.includes("fill");
  const isGetContent = n.includes("get_content") || n.includes("browser/content");
  const isHttp = n.includes("http_request");
  const isImageGen = !isImageUnderstand && !isImageSearch && !isScreenshot && !isBgRemove &&
    (n.includes("generate_image") || n.includes("text2image") || n.includes("txt2img") || n.includes("draw") || n.includes("paint") || n.includes("dall"));
  const isVideoGen = !isVideoStatus &&
    (n.includes("generate_video") || n.includes("text2video") || n.includes("txt2vid") || n.includes("animate") || n.includes("sora"));

  if (isImageGen) return "生成图片";
  if (isVideoGen) return "生成视频";
  if (isImageUnderstand) return "识别图片";
  if (isImageSearch) return "搜索图片";
  if (isScreenshot) return "截取屏幕";
  if (isBgRemove) return "处理图片";
  if (isVideoStatus) return "查询视频进度";
  if (isClick) return "点击操作";
  if (isFill) return "填写表单";
  if (isGetContent) return "读取网页";
  if (isHttp) return "网络请求";
  if (n.includes("web_search") || n.includes("search")) return "搜索";
  if (n.includes("code") || n.includes("execute") || n.includes("run_code") || n.includes("python") || n.includes("javascript")) return "执行代码";
  if (n.includes("read_file") || n.includes("read")) return "读取文件";
  if (n.includes("write") || n.includes("create_file") || n.includes("create")) return "创建文件";
  if (n.includes("edit") || n.includes("modify") || n.includes("update")) return "修改内容";
  if (n.includes("upload") || n.includes("download") || n.includes("file")) return "文件传输";
  if (n.includes("database") || n.includes("sql") || n.includes("db")) return "数据库操作";
  if (n.includes("translate")) return "翻译";
  if (n.includes("summarize") || n.includes("summary")) return "总结归纳";
  if (n.includes("email") || n.includes("send")) return "发送消息";
  if (n.includes("workflow")) return "执行工作流";
  if (n.includes("github")) return "GitHub操作";
  if (n.includes("memory")) return "检索记忆";
  if (n.includes("list_conversations")) return "查询会话";
  if (n.includes("presign") || n.includes("upload_url")) return "准备上传";
  if (n.includes("plugin") || n.includes("api")) return "API调用";
  if (n.includes("think") || n.includes("reason")) return "思考";
  return "调用工具";
}

const AnimatedDot = ({ delay }: { delay: number }) => {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 300,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [delay, opacity]);

  return <Animated.View style={[styles.dot, { opacity }]} />;
};

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ statusText, visible, botName, currentTool }) => {
  if (!visible) return null;

  let displayText = "";
  // Map English SSE status to Chinese
  const statusMap: Record<string, string> = {
    streaming: "正在回复",
    complete: "回复完成",
    queued: "排队中",
    processing: "处理中",
    thinking: "正在思考理解…",
  };
  if (currentTool && currentTool.name) {
    const label = getToolLabel(currentTool.name);
    if (currentTool.result) {
      displayText = `${label}完成`;
    } else {
      displayText = `正在${label}`;
    }
  } else if (statusText) {
    displayText = statusMap[statusText] || statusText;
  } else {
    displayText = "正在思考理解…";
  }

  const icon = currentTool && !currentTool.result ? "hammer" : "sparkles";
  const isWorking = !currentTool?.result;

  return (
    <View style={styles.container}>
      <View style={styles.innerContainer}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon as any} size={14} color={Colors.primary} />
        </View>
        <Text style={styles.statusText} numberOfLines={1}>
          {botName ? `${botName} ` : ""}{displayText}
        </Text>
        {isWorking && (
          <View style={styles.dotsContainer}>
            <AnimatedDot delay={0} />
            <AnimatedDot delay={200} />
            <AnimatedDot delay={400} />
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  innerContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(139, 92, 246, 0.08)",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 9,
    minWidth: "60%",
  },
  iconWrap: {
    marginRight: 2,
  },
  statusText: {
    fontSize: FontSize.sm,
    color: Colors.textTertiary,
    flexShrink: 1,
  },
  dotsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginLeft: 2,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Colors.primary,
  },
});
