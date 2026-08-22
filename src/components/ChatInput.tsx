import React, { useState, useRef, useEffect } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, Platform, Alert, ActivityIndicator } from 'react-native';
import { Colors, Spacing, BorderRadius, FontSize } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';

// Module-level storage for pending file blobs when no conversationId exists yet
let _pendingFileBlobs: Array<{blob: Blob, name: string, type: string}> = [];
export function getPendingFiles() { return _pendingFileBlobs; }
export function clearPendingFiles() { _pendingFileBlobs = []; }

interface AttachedFile {
  name: string;
  size: number;
  type: string;
  blob?: Blob;
  uri?: string;
}

interface QuotedMessage {
  role: string;
  content: string;
}

interface ChatInputProps {
  onSend: (text: string, files?: AttachedFile[], fileIds?: string[]) => void;
  onStop?: () => void;
  isStreaming?: boolean;
  isDark?: boolean;
  placeholder?: string;
  onFileUploaded?: (file: { name: string; url: string }) => void;
  conversationId?: string;
  patToken?: string;
  quotedMessage?: QuotedMessage | null;
  onClearQuote?: () => void;
  initialText?: string;
}

const stripMd = (text: string): string => {
  if (!text) return "";
  return text
    .replace(/<img\s[^>]*alt="([^"]*)"[^>]*>/gi, (_, alt) => alt ? `[图片]` : "[图片]")
    .replace(/<img\s[^>]*>/gi, "[图片]")
    .replace(/<[^>]+>/g, "")
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

export const ChatInput: React.FC<ChatInputProps> = ({
  onSend, onStop, isStreaming, isDark, placeholder,
  onFileUploaded, conversationId, patToken,
  quotedMessage, onClearQuote, initialText,
}) => {
  const [text, setText] = useState('');

  // Set initial text from props (e.g., from tool center prompts)
  React.useEffect(() => {
    if (initialText && !text) {
      setText(initialText);
    }
  }, [initialText]);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const [inputHeight, setInputHeight] = useState(40);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!inputRef.current) return;
    const node = inputRef.current as any;
    const el = node?.getElement ? node.getElement() : node;
    if (!el) return;
    el.style.height = '1px';
    const newHeight = Math.min(el.scrollHeight, 120);
    setInputHeight(newHeight);
    el.style.height = newHeight + 'px';
  }, [text]);
  const fileInputRef = useRef<any>(null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed && attachedFiles.length === 0) return;
    onSend(trimmed, attachedFiles.length > 0 ? attachedFiles : undefined);
    setText('');
    setAttachedFiles([]);
  };

  const handleFileSelect = async () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.onchange = (e: any) => {
        const files = Array.from(e.target.files || []) as File[];
        const newFiles: AttachedFile[] = files.map(f => ({
          name: f.name,
          size: f.size,
          type: f.type,
          blob: f as Blob,
        }));
        setAttachedFiles(prev => [...prev, ...newFiles]);
      };
      input.click();
    } else {
      try {
        const result = await DocumentPicker.getDocumentAsync({
          multiple: true,
          type: '*/*',
          copyToCacheDirectory: true,
        });
        if (result.canceled) return;
        const newFiles: AttachedFile[] = result.assets.map((asset: any) => ({
          name: asset.name || 'unknown',
          size: asset.size || 0,
          type: asset.mimeType || 'application/octet-stream',
          uri: asset.uri,
        }));
        setAttachedFiles(prev => [...prev, ...newFiles]);
      } catch (e) {
        console.error('[ChatInput] Native file picker error:', e);
      }
    }
  };

  const removeFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadToCoze = async (file: AttachedFile): Promise<string | null> => {
    try {
      const formData = new FormData();
      if (Platform.OS === 'web' || file.blob) {
        const blob = file.blob || new Blob([]);
        const fileObj = new File([blob], file.name, { type: file.type || 'application/octet-stream' });
        formData.append('file', fileObj);
      } else if (file.uri) {
        formData.append('file', {
          uri: file.uri,
          name: file.name,
          type: file.type || 'application/octet-stream',
        } as any);
      } else {
        formData.append('file', new Blob([]));
      }
      formData.append('purpose', 'assistants');
      const resp = await fetch('https://measures-customize-compounds-crm.trycloudflare.com/v1/files/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${patToken || ''}` },
        body: formData,
      });
      if (resp.ok) {
        const result = await resp.json();
        return result.data?.id || null;
      }
      console.error('[ChatInput] Coze upload failed:', resp.status);
      return null;
    } catch (e) {
      console.error('[ChatInput] Coze upload error:', e);
      return null;
    }
  };

  const handleUploadAndSend = async () => {
    const effectiveConvId = conversationId || '';
    if (attachedFiles.length === 0) {
      handleSend();
      return;
    }
    if (!effectiveConvId) {
      const cozeFileIds: string[] = [];
      setUploading(true);
      try {
        for (const file of attachedFiles) {
          const fileId = await uploadToCoze(file);
          if (fileId) cozeFileIds.push(fileId);
        }
      } catch (e) {
        console.error('[ChatInput] Coze upload failed (no convId):', e);
      } finally {
        setUploading(false);
      }
      // Store file blobs for later upload to project-files when convId is obtained
      _pendingFileBlobs = attachedFiles.map(f => ({
        blob: f.blob || new Blob([]),
        name: f.name,
        type: f.type || 'application/octet-stream',
      }));
      let msgText = text.trim();
      if (attachedFiles.length > 0) {
        const fileNames = attachedFiles.map(f => `\u{1F4CE}${f.name}`).join(' ');
        msgText = msgText ? `${msgText}\n${fileNames}` : fileNames;
      }
      onSend(msgText, [], cozeFileIds.length > 0 ? cozeFileIds : undefined);
      setText('');
      setAttachedFiles([]);
      return;
    }

    setUploading(true);
    const uploadedNames: string[] = [];
    const cozeFileIds: string[] = [];

    try {
      for (const file of attachedFiles) {
        if (!file.blob) continue;
        const formData = new Blob([file.blob]);
        const resp = await fetch(
          `https://measures-customize-compounds-crm.trycloudflare.com/project-files/api/files/upload`,
          {
            method: 'POST',
            headers: {
              'X-Conversation-Id': effectiveConvId,
              'X-File-Name': file.name,
              'Content-Type': file.type || 'application/octet-stream',
            },
            body: formData,
          }
        );
        if (resp.ok) {
          const result = await resp.json();
          const savedName = result.data?.name || file.name;
          uploadedNames.push(savedName);
          onFileUploaded?.({ name: file.name, url: result.data?.url });
        }
        const fileId = await uploadToCoze(file);
        if (fileId) {
          cozeFileIds.push(fileId);
        }
      }
    } catch (e) {
      console.error('[ChatInput] 文件上传失败:', e);
    } finally {
      setUploading(false);
    }

    let msgText = text.trim();
    if (uploadedNames.length > 0) {
      const fileNames = uploadedNames.map(n => `\u{1F4CE}${n}`).join(' ');
      msgText = msgText ? `${msgText}\n${fileNames}` : fileNames;
    }

    onSend(msgText, [], cozeFileIds.length > 0 ? cozeFileIds : undefined);
    setText('');
    setAttachedFiles([]);
  };

  const bgColor = isDark ? Colors.surfaceDark : '#fff';
  const borderColor = isDark ? Colors.borderDark : Colors.borderLight;
  const inputColor = isDark ? Colors.textInverse : Colors.text;
  const hasContent = text.trim() || attachedFiles.length > 0;

  const quoteLabel = quotedMessage ? (quotedMessage.role === 'user' ? '我' : 'AI') : '';
  const quotePreview = quotedMessage ? stripMd(quotedMessage.content).substring(0, 100) : '';

  return (
    <View style={[styles.container, { backgroundColor: bgColor, borderTopColor: borderColor }]}>
      {quotedMessage && (
        <View style={styles.quoteBar}>
          <View style={styles.quoteIconWrap}>
            <Ionicons name="return-down-back-outline" size={14} color={Colors.primary} />
          </View>
          <View style={styles.quoteContent}>
            <Text style={styles.quoteLabel}>引用{quoteLabel}的消息</Text>
            <Text style={styles.quoteText} numberOfLines={2}>{quotePreview}</Text>
          </View>
          <TouchableOpacity onPress={onClearQuote} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={18} color={Colors.textTertiary} />
          </TouchableOpacity>
        </View>
      )}

      {attachedFiles.length > 0 && (
        <View style={styles.attachments}>
          {attachedFiles.map((file, index) => (
            <View key={index} style={styles.attachmentChip}>
              <Ionicons
                name={file.type.startsWith('image/') ? 'image' : 'document'}
                size={14}
                color={Colors.primary}
              />
              <Text style={styles.attachmentName} >{file.name}</Text>
              <TouchableOpacity onPress={() => removeFile(index)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={16} color={Colors.textTertiary} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <View style={[styles.inputRow, { backgroundColor: isDark ? Colors.surfaceSecondaryDark : '#eef0f4' }]}>
        <TouchableOpacity
          style={styles.attachBtn}
          onPress={handleFileSelect}
          activeOpacity={0.7}
        >
          <Ionicons name="attach" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>

        <TextInput
          ref={inputRef}
          style={[styles.input, { color: inputColor, height: inputHeight }]}
          value={text}
          onChangeText={setText}
          placeholder={placeholder || '输入消息...'}
          placeholderTextColor={Colors.textTertiary}
          multiline
          onContentSizeChange={() => {}}
          maxLength={10000}
          returnKeyType="send"
          onSubmitEditing={handleUploadAndSend}
          blurOnSubmit={true}
          onKeyDown={(e: any) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleUploadAndSend();
            }
          }}
          
        />

        {isStreaming && (
          <TouchableOpacity style={styles.stopBtn} onPress={onStop} activeOpacity={0.7}>
            <Ionicons name="stop" size={18} color={Colors.danger} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: hasContent ? Colors.primary : 'transparent' }]}
          onPress={handleUploadAndSend}
          disabled={!hasContent || uploading}
          activeOpacity={0.7}
        >
          {uploading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={16} color={hasContent ? '#fff' : Colors.textTertiary} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Platform.OS === 'web' ? 34 : Spacing.sm },
  quoteBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary + '08',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  quoteIconWrap: {
    marginRight: 8,
  },
  quoteContent: {
    flex: 1,
    marginRight: 8,
  },
  quoteLabel: {
    fontSize: 11,
    color: Colors.primary,
    fontWeight: '600',
    marginBottom: 2,
  },
  quoteText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  attachments: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  attachmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary + '10',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 4,
    maxWidth: 200,
  },
  attachmentName: { fontSize: 12, color: Colors.text, maxWidth: 130 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 6,
  },
  attachBtn: {
    width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: Colors.border,
    justifyContent: 'center', alignItems: 'center',
  },
  input: { flex: 1, fontSize: FontSize.md, maxHeight: 120, lineHeight: 20, paddingVertical: 2 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginLeft: Spacing.sm },
  stopBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginLeft: Spacing.sm },
});
