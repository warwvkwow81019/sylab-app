import axios from 'axios';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type { CreditBalance, CreditTransaction, ModelPricing, ActionPricing, CardRedeemResponse, ApiResponse } from '../types/api';

const API_BASE = Platform.OS === 'web'
  ? 'http://36.137.84.216:9091'
  : (Constants.expoConfig?.extra?.EXPO_PUBLIC_API_BASE || 'http://36.137.84.216:9091');

// 积分服务用独立的 axios 实例，不需要 bearer/session 认证，用 user_id 做标识
const creditsClient = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

export const creditsApi = {
  // 查询余额
  getBalance: (userId: string): Promise<CreditBalance> =>
    creditsClient.post('/token-api/api/balance', { user_id: userId }).then(r => r.data.data || r.data),

  // 消费记录
  getTransactions: (userId: string, params?: { page?: number; page_size?: number }): Promise<{ items: CreditTransaction[]; total: number }> =>
    creditsClient.get('/token-api/api/transactions', { params: { user_id: userId, ...params } }).then(r => r.data.data || r.data),

  // 模型价格表
  getModelPricing: (): Promise<ModelPricing[]> =>
    creditsClient.get('/token-api/api/pricing').then(r => r.data.data || r.data),

  // 动作价格表
  getActionPricing: (): Promise<ActionPricing[]> =>
    creditsClient.get('/token-api/api/action/pricing').then(r => r.data.data || r.data),

  // 卡密兑换
  redeemCard: (userId: string, cardCode: string): Promise<CardRedeemResponse> =>
    creditsClient.post('/token-api/api/card/redeem', { user_id: userId, card_code: cardCode }).then(r => r.data.data || r.data),

  // 充值
  recharge: (userId: string, amount: number): Promise<any> =>
    creditsClient.post('/token-api/api/recharge', { user_id: userId, amount }).then(r => r.data),

  // 按 token 数量扣费：每 200 token 扣 1 积分
  deductByTokens: (userId: string, totalTokens: number, modelName?: string): Promise<{
    status: string;
    cost: string;
    balance?: string;
    message?: string;
  }> => {
    const cost = Math.ceil(totalTokens / 200); // 每200 token = 1积分，向上取整
    if (cost <= 0) {
      return Promise.resolve({ status: 'ok', cost: '0', message: '无需扣费' });
    }
    return creditsClient.post('/token-api/api/deduct', {
      user_id: userId,
      total_tokens: totalTokens,
      fixed_cost: cost,
      ...(modelName ? { model_name: modelName } : {}),
    }).then(r => r.data);
  },
};
