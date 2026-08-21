import { create } from 'zustand';
import { Storage } from '../utils/storage';
import { authApi } from '../api/auth';
import { setSessionId, setBearerToken, clearAuth } from '../api/client';
import type { UserInfo, LoginResponse } from '../types/api';

interface AuthState {
  user: UserInfo | null;
  sessionId: string | null;
  patToken: string | null;
  isLoading: boolean;
  isRestoring: boolean;

  restore: () => Promise<void>;
  login: (account: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: UserInfo) => void;
}

const SESSION_KEY = 'sylab_session_id';
const PAT_KEY = 'sylab_pat_token';
const USER_KEY = 'sylab_user';

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  sessionId: null,
  patToken: null,
  isLoading: false,
  isRestoring: true,

  restore: async () => {
    try {
      const [sessionId, patToken, userStr] = await Promise.all([
        Storage.getItem(SESSION_KEY),
        Storage.getItem(PAT_KEY),
        Storage.getItem(USER_KEY),
      ]);

      if (sessionId) {
        setSessionId(sessionId);
        set({ sessionId });
      }
      if (patToken) {
        setBearerToken(patToken);
        set({ patToken });
      }
      if (userStr) {
        set({ user: JSON.parse(userStr) });
      }
    } catch (e) {
      console.warn('Auth restore failed:', e);
    } finally {
      set({ isRestoring: false });
    }
  },

  login: async (account: string, password: string) => {
    set({ isLoading: true });
    try {
      const result = await authApi.login(account, password);
      const data = result?.data || result;

      const userId = data.user_id_str || data.user_id || data.user_id_str_id || '';
      const user: UserInfo = {
        id: String(userId),
        name: (() => {
          const n = data.screen_name || data.name || account || '';
          return /^\d+$/.test(n.trim()) ? '用户' : n;
        })(),
        email: data.email || account,
        avatar_url: data.avatar_url || '',
        created_at: String(data.user_create_time || Date.now()),
      };

      // Extract session_key from login response
      const sessionKey = data?.session_key || '';
      if (sessionKey) {
        await Storage.setItem(SESSION_KEY, sessionKey);
        setSessionId(sessionKey);
      }

      const defaultPat = process.env.EXPO_PUBLIC_DEFAULT_PAT || 'pat_f360e4508904a857bf1466629c9ecc4f53abd2c4cb6572fa76667fceefb24de4';
      await Storage.setItem(PAT_KEY, defaultPat);
      setBearerToken(defaultPat);
      await Storage.setItem(USER_KEY, JSON.stringify(user));
      set({ user, sessionId: sessionKey || null, patToken: defaultPat, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  register: async (email: string, password: string) => {
    set({ isLoading: true });
    try {
      const resp = await authApi.register(email, password);
      if (resp.code !== 0) {
        throw new Error(resp.msg || '注册失败');
      }
      const loginResp = await authApi.login(email, password);
      if (loginResp.code === 0) {
        const data = loginResp.data;
        let sessionKey = data?.session_key || '';
        let userId = data?.user_id_str || data?.user_id || '';
        
        if (sessionKey) {
          await setSessionId(sessionKey);
          set({ sessionId: sessionKey });
        }
        if (userId) {
          await Storage.setItem('sylab_user_id', userId);
        }
        
        try {
          const meResp = await authApi.getMe();
          if (meResp.code === 0 && meResp.data) {
            const user = meResp.data;
            await Storage.setItem(USER_KEY, JSON.stringify(user));
            set({ user });
          }
        } catch {}
      }
    } catch (error: any) {
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {}
    await Promise.all([
      Storage.deleteItem(SESSION_KEY),
      Storage.deleteItem(PAT_KEY),
      Storage.deleteItem(USER_KEY),
    ]);
    clearAuth();
    set({ user: null, sessionId: null, patToken: null });
  },

  setUser: (user) => set({ user }),
}));




