import { defineStore } from 'pinia';
import { api } from '../api/index.js';

/** 图书与借阅：列表、筛选条件、我的借阅 */
export const useLibraryStore = defineStore('library', {
  state: () => ({
    books: [],
    total: 0,
    page: 1,
    pageSize: 10,
    keyword: '',
    categoryId: '',
    categories: [],
    myLends: [],
    myStats: { total: 0, active: 0, returned: 0, maxBorrow: 5 },
    overview: null,
    loading: false,
    error: '',
    toast: '',
  }),

  getters: {
    hasBooks: (state) => state.books.length > 0,
    totalPages: (state) => Math.max(1, Math.ceil(state.total / state.pageSize)),
    borrowedTitles: (state) => state.myLends.filter((l) => l.status === 'borrowed').map((l) => l.title),
  },

  actions: {
    notify(message) {
      this.toast = message;
    },

    clearToast() {
      this.toast = '';
    },

    async loadCategories() {
      try {
        this.categories = await api.categories();
      } catch (err) {
        this.error = err.message;
      }
    },

    async loadOverview() {
      try {
        this.overview = await api.overview();
      } catch (err) {
        this.error = err.message;
      }
    },

    /** 拉图书列表；传 reset 表示回到第一页（比如切换分类时） */
    async loadBooks({ reset = false } = {}) {
      if (reset) this.page = 1;
      this.loading = true;
      this.error = '';
      try {
        // 关键词为空或只有空格时不发给后端，避免把 "   " 当成搜索条件
        const keyword = (this.keyword ?? '').trim();
        const data = await api.books({
          keyword: keyword || undefined,
          categoryId: this.categoryId || undefined,
          page: this.page,
          pageSize: this.pageSize,
        });
        this.books = data.list;
        this.total = data.total;
        this.page = data.page;
      } catch (err) {
        this.error = err.message || '加载图书失败';
        this.books = [];
        this.total = 0;
      } finally {
        this.loading = false;
      }
    },

    async setKeyword(keyword) {
      this.keyword = (keyword ?? '').trim();
      await this.loadBooks({ reset: true });
    },

    async setCategory(categoryId) {
      this.categoryId = categoryId;
      await this.loadBooks({ reset: true });
    },

    async goPage(page) {
      const target = Math.min(Math.max(1, page), this.totalPages);
      if (target === this.page) return;
      this.page = target;
      await this.loadBooks();
    },

    async loadMyLends() {
      this.loading = true;
      try {
        const data = await api.myLends();
        this.myLends = data.list;
        this.myStats = data.stats;
        return data;
      } catch (err) {
        this.error = err.message || '加载借阅记录失败';
        return null;
      } finally {
        this.loading = false;
      }
    },

    /** 借书：成功后刷新列表与我的借阅，返回是否成功 */
    async borrow(bookId) {
      try {
        const data = await api.borrow(bookId);
        this.notify(`借阅成功，请于 ${data.dueDate} 前归还`);
        return { ok: true, data };
      } catch (err) {
        this.notify(err.message || '借阅失败');
        return { ok: false, error: err.message };
      }
    },

    async giveBack(lendId) {
      try {
        await api.returnBook(lendId);
        this.notify('归还成功');
        return { ok: true };
      } catch (err) {
        this.notify(err.message || '归还失败');
        return { ok: false, error: err.message };
      }
    },
  },
});
