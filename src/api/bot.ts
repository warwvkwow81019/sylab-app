/**
 * Bot 模块
 * - 列表/搜索 → WebAPI (Session): /api/intelligence_api/search/get_draft_intelligence_list
 * - 详情 → OpenAPI (Bearer PAT): /v1/bots/:id
 */
import { webApiClient } from './client';
import { API_PATHS, OPENAPI_CONNECTOR_ID } from '../constants';
import type { SnowflakeId } from '../types/api';

const SPACE_ID = '1';

/** 归一化 Bot 列表项（后端字段名可能不统一） */
function normalizeBotItem(item: any) {
  return {
    id: String(item.bot_id || item.id || ''),
    name: item.bot_name || item.name || '',
    description: item.description || '',
    icon_url: item.icon_url || item.avatar_url || '',
    avatar_url: item.icon_url || item.avatar_url || '',
    connector_ids: item.connector_ids || [],
    status: item.status ?? 1,
    published: item.published ?? true,
    // 保留原始字段
    ...item,
  };
}

export const botApi = {
  // ────────────── WebAPI (Session) ──────────────

  /** Bot 列表 (WebAPI POST) */
  list: async (params?: { page?: number; page_size?: number }) => {
    try {
      const pageSize = params?.page_size || 20;
      const page = params?.page || 1;
      const resp = await webApiClient.post(
        '/api/intelligence_api/search/get_draft_intelligence_list',
        {
          space_id: SPACE_ID,
          count: pageSize,
          offset: (page - 1) * pageSize,
        },
      );
      const data = resp.data?.data || resp.data;
      const list: any[] = data.intelligence_list || data.intelligences || data.items || [];
      return {
        items: list.map(normalizeBotItem),
        total: data.total || list.length,
        page,
        page_size: pageSize,
      };
    } catch {
      return { items: [], total: 0, page: 1, page_size: 20 };
    }
  },

  /** Bot 搜索 (WebAPI POST) */
  search: async (keyword: string, params?: { page?: number; page_size?: number }) => {
    try {
      const pageSize = params?.page_size || 20;
      const page = params?.page || 1;
      const resp = await webApiClient.post(
        '/api/intelligence_api/search/get_draft_intelligence_list',
        {
          space_id: SPACE_ID,
          keyword,
          count: pageSize,
          offset: (page - 1) * pageSize,
        },
      );
      const data = resp.data?.data || resp.data;
      const list: any[] = data.intelligence_list || data.intelligences || data.items || [];
      return {
        items: list.map(normalizeBotItem),
        total: data.total || list.length,
        page,
        page_size: pageSize,
      };
    } catch {
      return { items: [], total: 0, page: 1, page_size: 20 };
    }
  },

  // ────────────── OpenAPI (Bearer PAT) ──────────────

  /** Bot 详情 (OpenAPI) */
  get: (id: SnowflakeId) =>
    webApiClient.get(API_PATHS.BOT_DETAIL(id)).then((r) => {
      const data = r.data?.data || r.data;
      return data;
    }),

  // ────────────── 工具方法 ──────────────

  /** 检查 Bot 是否支持 OpenAPI 调用 */
  isOpenApiEnabled: (bot: any): boolean =>
    bot?.connector_ids?.includes(OPENAPI_CONNECTOR_ID) ||
    bot?.connector_id === OPENAPI_CONNECTOR_ID,
};
