/**
 * 项目文件 API - 按会话隔离的文件管理
 * 支持上传、下载、删除、列表查询、统计查询
 * 每个对话有独立的文件空间，用户上传和 AI 生成的文件都归到对应会话
 */

// 文件服务基础路径（通过 nginx 代理到 9093 端口）
const FILES_BASE = 'http://36.137.84.216:9091/project-files';

export interface ProjectFile {
  name: string;
  type: 'image' | 'document' | 'code' | 'audio' | 'video' | 'other';
  size: number;
  created_at: string;
  expires_at?: string;
  url: string;
  source: 'user_upload' | 'ai_generated';
}

export interface FileListResponse {
  conversation_id: string;
  files: ProjectFile[];
  total: number;
}

/**
 * 获取会话的文件列表
 */
export async function listFiles(conversationId: string): Promise<FileListResponse> {
  const resp = await fetch(`${FILES_BASE}/api/files?conversation_id=${encodeURIComponent(conversationId)}`, {
    method: 'GET',
    headers: {
      'X-Conversation-Id': conversationId,
    },
  });
  if (!resp.ok) throw new Error(`获取文件列表失败 (${resp.status})`);
  const json = await resp.json();
  return json.data as FileListResponse;
}

/**
 * 获取所有会话的文件统计信息
 */
export async function getAllStats(): Promise<{ conversations: Record<string, { file_count: number; total_size: number }> }> {
  const resp = await fetch(`${FILES_BASE}/api/files/all-stats`);
  if (!resp.ok) throw new Error(`获取文件统计失败 (${resp.status})`);
  const json = await resp.json();
  return json.data;
}

/**
 * 上传文件到会话项目目录
 */
export async function uploadFile(
  conversationId: string,
  file: Blob,
  fileName: string
): Promise<ProjectFile> {
  const resp = await fetch(`${FILES_BASE}/api/files/upload`, {
    method: 'POST',
    headers: {
      'X-Conversation-Id': conversationId,
      'X-File-Name': fileName,
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ msg: '上传失败' }));
    throw new Error(err.msg || `上传失败 (${resp.status})`);
  }

  const result = await resp.json();
  return result.data as ProjectFile;
}

/**
 * 删除会话中的文件
 */
export async function deleteFile(conversationId: string, fileName: string): Promise<void> {
  const resp = await fetch(`${FILES_BASE}/api/files/${conversationId}/${encodeURIComponent(fileName)}`, {
    method: 'DELETE',
    headers: {
      'X-Conversation-Id': conversationId,
    },
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ msg: '删除失败' }));
    throw new Error(err.msg || `删除失败 (${resp.status})`);
  }
}

/**
 * 获取文件下载/预览 URL
 */
export function getFileUrl(conversationId: string, fileName: string): string {
  return `${FILES_BASE}/api/files/${conversationId}/${encodeURIComponent(fileName)}`;
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * 同步文件从源会话到目标会话
 */
export async function syncFiles(fromId: string, toId: string): Promise<{ synced: number }> {
  const resp = await fetch(
    `${FILES_BASE}/api/files/sync?from=${encodeURIComponent(fromId)}&to=${encodeURIComponent(toId)}`,
    { method: 'PUT' }
  );
  if (!resp.ok) throw new Error(`同步文件失败 (${resp.status})`);
  const json = await resp.json();
  return json.data || { synced: 0 };
}

/**
 * 保存聊天记录到会话项目文件（自动导出为 chat_history.txt）
 */
export async function saveChatLog(
  conversationId: string,
  messages: Array<{ role: string; content: string; created_at?: string }>
): Promise<void> {
  const resp = await fetch(`${FILES_BASE}/api/files/save-chat-log`, {
    method: "POST",
    headers: {
      "X-Conversation-Id": conversationId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages }),
  });
  if (!resp.ok) {
    console.warn("[files] saveChatLog failed:", resp.status);
  }
}

export const filesApi = {
  list: listFiles,
  upload: uploadFile,
  delete: deleteFile,
  getFileUrl,
  formatFileSize,
  sync: syncFiles,
  getAllStats,
  saveChatLog,
};
