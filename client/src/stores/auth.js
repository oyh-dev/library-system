import { defineStore } from 'pinia';
import { api } from '../api/index.js';
import { getToken, setToken, getReader, setReader, clearAuth } from '../api/token.js';

/** 登录状态：谁在登录、我的额度用了多少 */
export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: getToken(),
    reader: getReader(),
    loading: false,
    error: '',
  }),

  getters: {
    isLoggedIn: (state) => Boolean(state.token),
    displayName: (state) => state.reader?.name ?? '',
    activeLends: (state) => state.reader?.activeLends ?? 0,
    maxBorrow: (state) => state.reader?.maxBorrow ?? 5,
    canBorrowMore: (state) => (state.reader?.activeLends ?? 0) < (state.reader?.maxBorrow ?? 5),
  },

  actions: {
    async login(username, password) {
      this.loading = true;
      this.error = '';
      try {
        const data = await api.login(username, password);
        this.token = data.token;
        this.reader = data.reader;
        setToken(data.token);
        setReader(data.reader);
        // 登录后补一次 /me，拿到额度信息（login 只返回基础资料）
        await this.loadMe();
        return true;
      } catch (err) {
        this.error = err.message || '登录失败';
        return false;
      } finally {
        this.loading = false;
      }
    },

    async loadMe() {
      if (!this.token) return null;
      try {
        const me = await api.me();
        this.reader = me;
        setReader(me);
        return me;
      } catch (err) {
        // 令牌失效：直接登出，避免页面一直报错
        if (err.status === 401) this.logout();
        return null;
      }
    },

    logout() {
      this.token = '';
      this.reader = null;
      this.error = '';
      clearAuth();
    },

    /** 借还之后更新本地额度，避免整页重新拉取 */
    bumpActiveLends(delta) {
      if (!this.reader) return;
      this.reader = { ...this.reader, activeLends: Math.max(0, this.activeLends + delta) };
      setReader(this.reader);
    },
  },
});
