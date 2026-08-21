/**
 * 聊天 & 会话模块
 * - 聊天 (OpenAPI, Bearer PAT): /v3/chat/*
 * - 会话 (OpenAPI, Bearer PAT): /v1/conversation(s)/*
 */
import { openApiClient } from './client';
import { API_PATHS } from '../constants';
import type { SnowflakeId } from '../types/api';

/** OpenAPI 列表响应归一化 - 适配多种后端返回格式
 *  后端可能返回：
 *  1. { code:0, data: { conversations: [...] } }  → 拦截器解包为 { conversations: [...] }
 *  2. { code:0, data: [msg1, msg2], has_more: false } → 拦截器解包为 [msg1, msg2]
 *  3. { code:0, data: { messages: [...] } }
 */
function normalizeListResponse(data: any, _keyField?: string) {
  // 如果 data 本身就是数组（消息列表/会话列表 API 经 interceptor 解包后直接返回数组）
  if (Array.isArray(data)) {
    const items = data.map((item: any) => {
      if (item && !item.id && item.message_id) {
        return { ...item, id: item.message_id };
      }
      return item;
    });
    return {
      items,
      total: items.length,
      page: 1,
      page_size: items.length,
      has_more: false,
    };
  }
  // 如果 data 是对象，尝试多种字段名提取列表
  let items = data?.conversations || data?.messages || data?.items || data?.list || data?.data || data?.Messages || [];
  items = Array.isArray(items) ? items : [];
  // Normalize message IDs: some endpoints return message_id instead of id
  items = items.map((item: any) => {
    if (item && !item.id && item.message_id) {
      return { ...item, id: item.message_id };
    }
    return item;
  });
  return {
    items,
    total: data?.total || 0,
    page: data?.page_num || data?.page || 1,
    page_size: data?.page_size || 20,
    has_more: data?.has_more || false,
  };
}

export const chatApi = {
  // ────────────── 会话 ─────────────

  /** 会话列表 (需要 bot_id) */
  listConversations: (botId: string, params?: { page_num?: number; page_size?: number; user_id?: string }) =>
    openApiClient
      .get(API_PATHS.CONVERSATIONS, { params: { bot_id: botId, ...params } })
      .then((r) => normalizeListResponse(r.data)),

  /** 创建会话 */
  createConversation: (botId: string, name?: string, userId?: string) =>
    openApiClient
      .post(API_PATHS.CONVERSATION_CREATE, { bot_id: botId, name: name || '', user_id: userId || '' })
      .then((r) => {
        const data = r.data;
        return {
          id: data?.conversation_id || data?.id || '',
          ...data,
        };
      }),

  /** 获取会话详情 */
  getConversation: (conversationId: SnowflakeId) =>
    openApiClient
      .get(API_PATHS.CONVERSATION_RETRIEVE, { params: { conversation_id: conversationId } })
      .then((r) => r.data),

  /** 更新会话（如修改名称） */
  updateConversation: (conversationId: SnowflakeId, data: { name?: string }) =>
    openApiClient
      .put(`/v1/conversations/${conversationId}`, data)
      .then((r) => r.data),

  /** 获取消息列表 */
  getMessages: (
    conversationId: SnowflakeId,
    params?: { page_num?: number; page_size?: number },
  ) =>
    openApiClient
      .post(API_PATHS.CONVERSATION_MESSAGE_LIST, {
        conversation_id: conversationId,
        ...params,
      })
      .then((r) => normalizeListResponse(r.data)),

  // ────────────── 聊天 ──────────────

  /** 取消聊天 (停止生成) */
  cancelChat: (conversationId: SnowflakeId, chatId: SnowflakeId) =>
    openApiClient
      .post(API_PATHS.CHAT_CANCEL, {
        conversation_id: conversationId,
        chat_id: chatId,
      })
      .then((r) => r.data),

  /** 删除会话 */
  deleteConversation: (conversationId: SnowflakeId) =>
    openApiClient
      .delete(API_PATHS.CONVERSATION_DELETE(conversationId))
      .then((r) => r.data),
};




