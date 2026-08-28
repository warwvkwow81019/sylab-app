import React, { useState, useRef, useEffect } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, Platform, Alert, ActivityIndicator, Modal, FlatList } from 'react-native';
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

// Read a native file URI into a Blob (for project-files raw upload)
const uriToBlob = async (uri: string): Promise<Blob> => {
  const resp = await fetch(uri);
  return await resp.blob();
};

// Derive a filename from a URI
const fileNameFromUri = (uri: string, fallback: string): string => {
  try {
    const parts = uri.split('/');
    const last = parts[parts.length - 1];
    if (last && last.includes('.')) return last.split('?')[0];
  } catch {}
  return fallback;
};

export const ChatInput: React.FC<ChatInputProps> = ({
  onSend, onStop, isStreaming, isDark, placeholder,
  onFileUploaded, conversationId, patToken,
  quotedMessage, onClearQuote, initialText,
}) => {
  const [text, setText] = useState('');

  React.useEffect(() => {
    if (initialText && !text) {
      setText(initialText);
    }
  }, [initialText]);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const isSendingRef = useRef(false);
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

  const handleSend = () => {
    if (isSendingRef.current) return;
    const trimmed = text.trim();
    if (!trimmed && attachedFiles.length === 0) return;
    isSendingRef.current = true;
    onSend(trimmed, attachedFiles.length > 0 ? attachedFiles : undefined);
    setText('');
    setAttachedFiles([]);
    setTimeout(() => { isSendingRef.current = false; }, 500);
  };

  const addFiles = (newFiles: AttachedFile[]) => {
    if (newFiles.length > 0) {
      setAttachedFiles(prev => [...prev, ...newFiles]);
    }
  };

  const handleDocumentPicker = async () => {
    setShowAttachMenu(false);
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.onchange = (e: any) => {
        const files = Array.from(e.target.files || []) as File[];
        addFiles(files.map(f => ({
          name: f.name,
          size: f.size,
          type: f.type,
          blob: f as Blob,
        })));
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
        addFiles(result.assets.map((asset: any) => ({
          name: asset.name || 'unknown',
          size: asset.size || 0,
          type: asset.mimeType || 'application/octet-stream',
          uri: asset.uri,
        })));
      } catch (e) {
        console.error('[ChatInput] Document picker error:', e);
      }
    }
  };

  const handleImagePicker = async () => {
    setShowAttachMenu(false);
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = 'image/*';
      input.onchange = (e: any) => {
        const files = Array.from(e.target.files || []) as File[];
        addFiles(files.map(f => ({
          name: f.name,
          size: f.size,
          type: f.type || 'image/jpeg',
          blob: f as Blob,
        })));
      };
      input.click();
      return;
    }
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('需要权限', '请在设置中允许访问照片库');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.9,
      });
      if (result.canceled) return;
      addFiles(result.assets.map((asset: any) => ({
        name: asset.fileName || fileNameFromUri(asset.uri, `photo_${Date.now()}.jpg`),
        size: asset.fileSize || 0,
        type: asset.mimeType || 'image/jpeg',
        uri: asset.uri,
      })));
    } catch (e) {
      console.error('[ChatInput] Image picker error:', e);
    }
  };

  const handleCamera = async () => {
    setShowAttachMenu(false);
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment';
      input.onchange = (e: any) => {
        const files = Array.from(e.target.files || []) as File[];
        addFiles(files.map(f => ({
          name: f.name,
          size: f.size,
          type: f.type || 'image/jpeg',
          blob: f as Blob,
        })));
      };
      input.click();
      return;
    }
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('需要权限', '请在设置中允许访问相机');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.9,
      });
      if (result.canceled) return;
      addFiles(result.assets.map((asset: any) => ({
        name: asset.fileName || `photo_${Date.now()}.jpg`,
        size: asset.fileSize || 0,
        type: asset.mimeType || 'image/jpeg',
        uri: asset.uri,
      })));
    } catch (e) {
      console.error('[ChatInput] Camera error:', e);
    }
  };

  const removeFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const UPLOAD_URL = 'https://s.symsgf.xyz/user-upload';

  const uploadToCoze = async (file: AttachedFile): Promise<string | null> => {
    try {
      // Native (iOS/Android): use FileSystem.uploadAsync which builds multipart reliably.
      // React Native FormData with {uri,name,type} often fails to send file bytes on iOS.
      if (Platform.OS !== 'web' && file.uri) {
        const uploadResp = await FileSystem.uploadAsync(UPLOAD_URL, file.uri, {
          httpMethod: 'POST',
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'X-File-Name': encodeURIComponent(file.name || 'upload.bin'),
          },
        });
        console.log('[ChatInput] native upload status:', uploadResp.status, 'name:', file.name);
        if (uploadResp.status >= 200 && uploadResp.status < 300) {
          const result = JSON.parse(uploadResp.body);
          let fileUrl = '';
          if (result?.code === 0 && result?.data) {
            try {
              const d = typeof result.data === 'string' ? JSON.parse(result.data) : result.data;
              fileUrl = d?.url || '';
            } catch {}
          }
          const fileId = result?.data?.id || result?.id || null;
          console.log('[ChatInput] Upload OK (native), url:', fileUrl, 'file_id:', fileId);
          return fileId || fileUrl || null;
        }
        console.error('[ChatInput] Coze native upload failed:', uploadResp.status, (uploadResp.body || '').substring(0, 300));
        return null;
      }

      const blob = file.blob || new Blob([]);
      const resp = await fetch(UPLOAD_URL, {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'X-File-Name': encodeURIComponent(file.name || 'upload.bin'),
        },
        body: blob,
      });
      if (resp.ok) {
        const result = await resp.json();
        let fileUrl = '';
        if (result?.code === 0 && result?.data) {
          try {
            const d = typeof result.data === 'string' ? JSON.parse(result.data) : result.data;
            fileUrl = d?.url || '';
          } catch {}
        }
        const fileId = result.data?.id || result.id || null;
        console.log('[ChatInput] Upload OK (web), url:', fileUrl, 'file_id:', fileId);
        return fileId || fileUrl || null;
      }
      const errText = await resp.text().catch(() => '');
      console.error('[ChatInput] Coze upload failed:', resp.status, errText);
      return null;
    } catch (e) {
      console.error('[ChatInput] Coze upload error:', e);
      return null;
    }
  };

  const handleUploadAndSend = async () => {
    if (isSendingRef.current) return;
    const effectiveConvId = conversationId || '';
    if (attachedFiles.length === 0) {
      handleSend();
      return;
    }

    isSendingRef.current = true;
    setUploading(true);
    const uploadedNames: string[] = [];
    const cozeFileIds: string[] = [];
    const uploadedUrls: string[] = [];

    try {
      for (const file of attachedFiles) {
        // 1. Upload to project-files (conversation file storage)
        try {
          let blob: Blob;
          if (file.blob) {
            blob = file.blob;
          } else if (file.uri) {
            blob = await uriToBlob(file.uri);
          } else {
            blob = new Blob([]);
          }
          const resp = await fetch(
            'https://s.symsgf.xyz/project-files/api/files/upload',
            {
              method: 'POST',
              headers: {
                'X-Conversation-Id': effectiveConvId || 'pending',
                'X-File-Name': file.name,
                'Content-Type': file.type || 'application/octet-stream',
              },
              body: blob,
            }
          );
          if (resp.ok) {
            const result = await resp.json();
            const savedName = result.data?.name || file.name;
            uploadedNames.push(savedName);
            // Build public URL for the uploaded file
            const pubUrl = 'https://s.symsgf.xyz/project-files' + (result.data?.url || '');
            uploadedUrls.push(pubUrl);
            onFileUploaded?.({ name: file.name, url: pubUrl });
          } else {
            console.warn('[ChatInput] project-files upload failed:', resp.status);
          }
        } catch (pe) {
          console.warn('[ChatInput] project-files upload error:', pe);
        }

        // 2. Upload to Coze file API (so AI can see it)
        const fileId = await uploadToCoze(file);
        if (fileId) {
          cozeFileIds.push(fileId);
        }
      }
    } catch (e) {
      console.error('[ChatInput] 文件上传失败:', e);
    } finally {
      setUploading(false);
      setTimeout(() => { isSendingRef.current = false; }, 500);
    }

    // Store pending blobs for later sync (new conversation case)
    if (!effectiveConvId) {
      _pendingFileBlobs = await Promise.all(
        attachedFiles.map(async (f) => {
          let blob = f.blob;
          if (!blob && f.uri) {
            try { blob = await uriToBlob(f.uri); } catch { blob = new Blob([]); }
          }
          return { blob: blob || new Blob([]), name: f.name, type: f.type || 'application/octet-stream' };
        })
      );
    }

    let msgText = text.trim();
    const displayNames = uploadedNames.length > 0 ? uploadedNames : attachedFiles.map(f => f.name);
    if (displayNames.length > 0) {
      const fileNames = displayNames.map(n => `\u{1F4CE}${n}`).join(' ');
      msgText = msgText ? `${msgText}\n${fileNames}` : fileNames;
    }

    if (cozeFileIds.length === 0 && attachedFiles.length > 0) {
      Alert.alert(
        '附件上传失败',
        '文件未能上传到服务器（可能是网络或隧道不稳定）。请重试，或换用截图/较小的文件。',
        [{ text: '知道了' }]
      );
    }

    // Build file metadata with public URLs for images
    const fileMeta = attachedFiles.map((f, i) => ({
      name: f.name,
      type: f.type || 'application/octet-stream',
      url: uploadedUrls[i] || '',
      fileId: cozeFileIds[i] || '',
    }));
    onSend(msgText, fileMeta, cozeFileIds.length > 0 ? cozeFileIds : undefined);
    setText('');
    setAttachedFiles([]);
  };

  const bgColor = isDark ? Colors.surfaceDark : '#fff';
  const borderColor = isDark ? Colors.borderDark : Colors.borderLight;
  const inputColor = isDark ? Colors.textInverse : Colors.text;
  const hasContent = text.trim() || attachedFiles.length > 0;

  const quoteLabel = quotedMessage ? (quotedMessage.role === 'user' ? '我' : 'AI') : '';
  const quotePreview = quotedMessage ? stripMd(quotedMessage.content).substring(0, 100) : '';

  const attachMenuItems = [
    { icon: 'image-outline', label: '照片', color: '#3b82f6', action: handleImagePicker },
    { icon: 'camera-outline', label: '拍照', color: '#10b981', action: handleCamera },
    { icon: 'document-outline', label: '文件', color: '#f59e0b', action: handleDocumentPicker },
  ];

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
                name={file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'videocam' : 'document'}
                size={14}
                color={Colors.primary}
              />
              <Text style={styles.attachmentName}>{file.name}</Text>
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
          onPress={() => setShowAttachMenu(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="add" size={26} color={Colors.textSecondary} />
        </TouchableOpacity>

        <TextInput
          ref={inputRef}
          style={[styles.input, { color: inputColor, height: inputHeight }]}
          value={text}
          onChangeText={setText}
          placeholder={placeholder || '输入消息...'}
          placeholderTextColor={Colors.textTertiary}
          multiline
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

      <Modal
        visible={showAttachMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAttachMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowAttachMenu(false)}
        >
          <View style={styles.attachMenu}>
            {attachMenuItems.map((item) => (
              <TouchableOpacity
                key={item.label}
                style={styles.attachMenuItem}
                onPress={item.action}
                activeOpacity={0.7}
              >
                <View style={[styles.attachMenuIcon, { backgroundColor: item.color + '18' }]}>
                  <Ionicons name={item.icon as any} size={22} color={item.color} />
                </View>
                <Text style={styles.attachMenuLabel}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
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
  quoteIconWrap: { marginRight: 8 },
  quoteContent: { flex: 1, marginRight: 8 },
  quoteLabel: { fontSize: 11, color: Colors.primary, fontWeight: '600', marginBottom: 2 },
  quoteText: { fontSize: 13, color: Colors.textSecondary },
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  attachMenu: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingTop: 20,
    paddingBottom: 36,
    paddingHorizontal: 24,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    justifyContent: 'space-around',
  },
  attachMenuItem: {
    alignItems: 'center',
    gap: 8,
  },
  attachMenuIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachMenuLabel: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: '500',
  },
});
