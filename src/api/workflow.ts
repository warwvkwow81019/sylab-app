/**
 * 工作流模块
 * - 列表/详情/删除/发布 → WebAPI (Session): /api/workflow_api/*
 * - 运行/流式运行 → OpenAPI (Bearer PAT): /v1/workflow/*
 */
import { webApiClient } from './client';
import { API_PATHS } from '../constants';
import type { SnowflakeId } from '../types/api';

const SPACE_ID = '1';

export const workflowApi = {
  // ────────────── WebAPI (Session) ──────────────

  /** 工作流列表 (已发布) */
  list: (params?: { page?: number; page_size?: number }) =>
    webApiClient.post('/api/workflow_api/released_workflows', {
      space_id: SPACE_ID,
      page_size: params?.page_size || 20,
      page_num: params?.page || 1,
    }).then((r) => {
      const data = r.data?.data || r.data;
      return {
        items: data.workflow_list || data.items || [],
        total: data.total_count || data.total || 0,
      };
    }),

  /** 工作流详情 */
  get: (id: SnowflakeId) =>
    webApiClient
      .get(API_PATHS.WORKFLOW_DETAIL, { params: { workflow_id: id } })
      .then((r) => r.data?.data || r.data),

  /** 删除工作流 */
  delete: (id: SnowflakeId) =>
    webApiClient.post(API_PATHS.WORKFLOW_DELETE, { workflow_id: id }).then((r) => r.data),

  /** 发布工作流 */
  publish: (id: SnowflakeId) =>
    webApiClient.post(API_PATHS.WORKFLOW_PUBLISH, { workflow_id: id }).then((r) => r.data),

  /** 保存工作流 */
  save: (data: { workflow_id: SnowflakeId; [key: string]: any }) =>
    webApiClient.post(API_PATHS.WORKFLOW_SAVE, data).then((r) => r.data?.data || r.data),

  /** 测试运行 (WebAPI，用于编辑器调试) */
  testRun: (data: { workflow_id: SnowflakeId; parameters?: Record<string, any> }) =>
    webApiClient.post(API_PATHS.WORKFLOW_TEST_RUN, data).then((r) => r.data?.data || r.data),

  /** 测试恢复 (WebAPI，用于调试中断后恢复) */
  testResume: (data: { workflow_id: SnowflakeId; [key: string]: any }) =>
    webApiClient.post(API_PATHS.WORKFLOW_TEST_RESUME, data).then((r) => r.data?.data || r.data),

  // ────────────── OpenAPI (Bearer PAT) ──────────────

  /** 运行工作流 (OpenAPI, 同步) */
  run: (data: { workflow_id: SnowflakeId; parameters?: Record<string, any> }) =>
    webApiClient.post('/v1/workflow/run', data).then((r) => r.data),

  /** 流式运行工作流 (OpenAPI, SSE) */
  streamRun: (data: { workflow_id: SnowflakeId; parameters?: Record<string, any> }) =>
    webApiClient.post('/v1/workflow/stream_run', data).then((r) => r.data),
};
