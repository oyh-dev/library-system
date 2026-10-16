/**
 * 前端测试：工具函数 + Pinia store（用假 API 替换网络层）。
 * 运行：npm test
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

// 用假模块替换真实网络层与本地存储，测试不依赖后端
vi.mock('../src/api/index.js', () => ({
  api: {
    login: vi.fn(),
    me: vi.fn(),
    overview: vi.fn(),
    categories: vi.fn(),
    books: vi.fn(),
    borrow: vi.fn(),
    returnBook: vi.fn(),
    myLends: vi.fn(),
  },
}));
vi.mock('../src/api/token.js', () => ({
  getToken: vi.fn(() => ''),
  setToken: vi.fn(),
  getReader: vi.fn(() => null),
  setReader: vi.fn(),
  clearAuth: vi.fn(),
}));

import { api } from '../src/api/index.js';
import { getToken, setToken, clearAuth, setReader } from '../src/api/token.js';
import { useAuthStore } from '../src/stores/auth.js';
import { useLibraryStore } from '../src/stores/library.js';
import {
  formatDate,
  daysBetween,
  lendStatus,
  quotaText,
  availabilityText,
  highlightParts,
} from '../src/utils/format.js';

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  getToken.mockReturnValue('');
});

// ================================================================ 工具函数
describe('formatDate 日期格式化', () => {
  it('把 ISO 串格式化为 YYYY-MM-DD 并补零', () => {
    expect(formatDate('2026-03-05T08:30:00+08:00')).toBe('2026-03-05');
  });

  it('空值返回占位符而不是崩溃', () => {
    expect(formatDate(null)).toBe('--');
    expect(formatDate(undefined)).toBe('--');
    expect(formatDate('')).toBe('--');
  });

  it('非法日期串返回占位符', () => {
    expect(formatDate('not-a-date')).toBe('--');
  });
});

describe('daysBetween 天数差', () => {
  it('相差整天数正确', () => {
    expect(daysBetween('2026-01-01T00:00:00Z', '2026-01-31T00:00:00Z')).toBe(30);
  });

  it('不足一天向下取整', () => {
    expect(daysBetween('2026-01-01T00:00:00Z', '2026-01-01T23:00:00Z')).toBe(0);
  });

  it('目标早于起始返回负数', () => {
    expect(daysBetween('2026-01-10T00:00:00Z', '2026-01-01T00:00:00Z')).toBe(-9);
  });

  it('非法输入返回 0 而不是 NaN', () => {
    expect(daysBetween('bad', '2026-01-01T00:00:00Z')).toBe(0);
  });
});

describe('lendStatus 借阅状态', () => {
  const now = '2026-03-01T10:00:00+08:00';

  it('已归还优先于其他状态', () => {
    const s = lendStatus({ returnedAt: '2026-02-20T10:00:00+08:00', dueAt: '2026-01-01T00:00:00+08:00' }, now);
    expect(s.code).toBe('returned');
    expect(s.label).toBe('已归还');
  });

  it('超过应还日期显示逾期天数', () => {
    const s = lendStatus({ dueAt: '2026-02-25T10:00:00+08:00' }, now);
    expect(s.code).toBe('overdue');
    expect(s.label).toContain('4 天');
  });

  it('剩余 3 天以内算即将到期（边界值：正好 3 天）', () => {
    expect(lendStatus({ dueAt: '2026-03-04T10:00:00+08:00' }, now).code).toBe('due-soon');
    expect(lendStatus({ dueAt: '2026-03-04T09:00:00+08:00' }, now).code).toBe('due-soon');
  });

  it('剩余 4 天算正常（边界值：3 与 4 之间）', () => {
    expect(lendStatus({ dueAt: '2026-03-05T10:00:00+08:00' }, now).code).toBe('normal');
  });

  it('正好当天到期算即将到期而不是逾期', () => {
    expect(lendStatus({ dueAt: '2026-03-01T18:00:00+08:00' }, now).code).toBe('due-soon');
  });
});

describe('quotaText / availabilityText 文案', () => {
  it('额度文案显示已用与上限', () => {
    expect(quotaText(2, 5)).toBe('2 / 5');
  });

  it('额度负数会被夹到 0', () => {
    expect(quotaText(-3, 5)).toBe('0 / 5');
  });

  it('无可借副本时 tone 为 danger', () => {
    expect(availabilityText(0, 3)).toEqual({ text: '暂无可借', tone: 'danger' });
  });

  it('仅剩 1 本时 tone 为 warn', () => {
    expect(availabilityText(1, 3).tone).toBe('warn');
  });

  it('副本充足时显示可借/总量，tone 为 ok', () => {
    expect(availabilityText(2, 4)).toEqual({ text: '可借 2 / 4', tone: 'ok' });
  });
});

describe('highlightParts 关键词高亮', () => {
  it('空关键词返回整段且不命中', () => {
    expect(highlightParts('JavaScript', '')).toEqual([{ text: 'JavaScript', hit: false }]);
  });

  it('命中一次时切成三段', () => {
    const parts = highlightParts('JavaScript 高级程序设计', 'java');
    expect(parts.map((p) => p.text)).toEqual(['Java', 'Script 高级程序设计']);
    expect(parts[0].hit).toBe(true);
    expect(parts[1].hit).toBe(false);
  });

  it('大小写不敏感但保留原文大小写', () => {
    expect(highlightParts('Vue.js', 'VUE')[0].text).toBe('Vue');
  });

  it('多次命中全部标记', () => {
    const parts = highlightParts('a-b-a-b', 'a');
    expect(parts.filter((p) => p.hit).length).toBe(2);
  });

  it('未命中时原样返回', () => {
    expect(highlightParts('abc', 'zzz')).toEqual([{ text: 'abc', hit: false }]);
  });
});

// ================================================================ auth store
describe('auth store', () => {
  it('初始状态为未登录', () => {
    const auth = useAuthStore();
    expect(auth.isLoggedIn).toBe(false);
    expect(auth.displayName).toBe('');
  });

  it('登录成功后写入令牌并拉取额度', async () => {
    api.login.mockResolvedValue({
      token: 'tok-1',
      reader: { id: 1, name: '张三', username: 'zhangsan' },
    });
    api.me.mockResolvedValue({ id: 1, name: '张三', activeLends: 2, maxBorrow: 5 });

    const auth = useAuthStore();
    const ok = await auth.login('zhangsan', '123456');

    expect(ok).toBe(true);
    expect(auth.isLoggedIn).toBe(true);
    expect(auth.displayName).toBe('张三');
    expect(auth.activeLends).toBe(2);
    expect(setToken).toHaveBeenCalledWith('tok-1');
    expect(setReader).toHaveBeenCalled();
  });

  it('登录失败时记录错误且保持未登录', async () => {
    api.login.mockRejectedValue(new Error('用户名或密码错误'));

    const auth = useAuthStore();
    const ok = await auth.login('zhangsan', 'wrong');

    expect(ok).toBe(false);
    expect(auth.isLoggedIn).toBe(false);
    expect(auth.error).toBe('用户名或密码错误');
  });

  it('登录中重复提交不会并发（loading 状态）', async () => {
    let resolveLogin;
    api.login.mockReturnValue(new Promise((r) => { resolveLogin = r; }));
    api.me.mockResolvedValue({ activeLends: 0, maxBorrow: 5 });

    const auth = useAuthStore();
    const p = auth.login('a', 'b');
    expect(auth.loading).toBe(true);
    resolveLogin({ token: 't', reader: { name: 'A' } });
    await p;
    expect(auth.loading).toBe(false);
  });

  it('canBorrowMore 在达到上限时为 false（边界：正好 5 本）', async () => {
    api.login.mockResolvedValue({ token: 't', reader: { name: 'A' } });
    api.me.mockResolvedValue({ activeLends: 5, maxBorrow: 5 });

    const auth = useAuthStore();
    await auth.login('a', 'b');
    expect(auth.canBorrowMore).toBe(false);
  });

  it('借还时本地额度会增减', async () => {
    api.login.mockResolvedValue({ token: 't', reader: { name: 'A' } });
    api.me.mockResolvedValue({ activeLends: 1, maxBorrow: 5 });

    const auth = useAuthStore();
    await auth.login('a', 'b');

    auth.bumpActiveLends(1);
    expect(auth.activeLends).toBe(2);
    auth.bumpActiveLends(-1);
    expect(auth.activeLends).toBe(1);
  });

  it('额度不会减到负数', async () => {
    api.login.mockResolvedValue({ token: 't', reader: { name: 'A' } });
    api.me.mockResolvedValue({ activeLends: 0, maxBorrow: 5 });

    const auth = useAuthStore();
    await auth.login('a', 'b');
    auth.bumpActiveLends(-1);
    expect(auth.activeLends).toBe(0);
  });

  it('令牌失效（401）时自动登出', async () => {
    getToken.mockReturnValue('expired');
    api.me.mockRejectedValue(Object.assign(new Error('请先登录'), { status: 401 }));

    const auth = useAuthStore();
    auth.token = 'expired';
    await auth.loadMe();

    expect(auth.isLoggedIn).toBe(false);
    expect(clearAuth).toHaveBeenCalled();
  });

  it('logout 清空令牌与读者信息', async () => {
    api.login.mockResolvedValue({ token: 't', reader: { name: 'A' } });
    api.me.mockResolvedValue({ activeLends: 0, maxBorrow: 5 });
    const auth = useAuthStore();
    await auth.login('a', 'b');

    auth.logout();
    expect(auth.isLoggedIn).toBe(false);
    expect(auth.reader).toBe(null);
    expect(clearAuth).toHaveBeenCalled();
  });
});

// ================================================================ library store
describe('library store', () => {
  it('加载图书列表写入 books 与 total', async () => {
    api.books.mockResolvedValue({ list: [{ id: 1, title: 'A' }], total: 1, page: 1 });

    const lib = useLibraryStore();
    await lib.loadBooks();

    expect(lib.books).toHaveLength(1);
    expect(lib.total).toBe(1);
    expect(lib.loading).toBe(false);
    expect(lib.error).toBe('');
  });

  it('加载失败时记录错误并清空列表', async () => {
    api.books.mockRejectedValue(new Error('网络异常'));

    const lib = useLibraryStore();
    await lib.loadBooks();

    expect(lib.error).toBe('网络异常');
    expect(lib.books).toEqual([]);
  });

  it('切换关键词会重置到第一页', async () => {
    api.books.mockResolvedValue({ list: [], total: 0, page: 1 });
    const lib = useLibraryStore();
    lib.page = 3;

    await lib.setKeyword('vue');

    expect(lib.page).toBe(1);
    expect(api.books).toHaveBeenCalledWith(expect.objectContaining({ keyword: 'vue', page: 1 }));
  });

  it('空关键词不会作为参数发给后端', async () => {
    api.books.mockResolvedValue({ list: [], total: 0, page: 1 });
    const lib = useLibraryStore();

    await lib.setKeyword('   ');

    expect(api.books).toHaveBeenCalledWith(expect.objectContaining({ keyword: undefined }));
  });

  it('totalPages 按 total 与 pageSize 计算（向上取整）', () => {
    const lib = useLibraryStore();
    lib.total = 21;
    lib.pageSize = 10;
    expect(lib.totalPages).toBe(3);
  });

  it('totalPages 至少为 1（空结果）', () => {
    const lib = useLibraryStore();
    lib.total = 0;
    expect(lib.totalPages).toBe(1);
  });

  it('goPage 会夹在合法范围内', async () => {
    // mock 需要跟着请求的 page 返回，否则 store 会以响应里的 page 覆盖本地值
    api.books.mockImplementation(async ({ page }) => ({ list: [], total: 30, page }));
    const lib = useLibraryStore();
    lib.total = 30;
    lib.pageSize = 10;

    await lib.goPage(99);
    expect(lib.page).toBe(3); // 夹到最后一页
    expect(api.books).toHaveBeenLastCalledWith(expect.objectContaining({ page: 3 }));

    await lib.goPage(-5);
    expect(lib.page).toBe(1); // 夹到第一页
    expect(api.books).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));
  });

  it('goPage 目标页与当前页相同时不发请求', async () => {
    const lib = useLibraryStore();
    lib.page = 1;
    await lib.goPage(1);
    expect(api.books).not.toHaveBeenCalled();
  });

  it('借书成功会写入提示文案', async () => {
    api.borrow.mockResolvedValue({ lendId: 1, dueDate: '2026-04-01' });

    const lib = useLibraryStore();
    const result = await lib.borrow(2);

    expect(result.ok).toBe(true);
    expect(lib.toast).toContain('2026-04-01');
  });

  it('借书失败会把后端错误显示给用户', async () => {
    api.borrow.mockRejectedValue(new Error('该图书暂无可借副本'));

    const lib = useLibraryStore();
    const result = await lib.borrow(3);

    expect(result.ok).toBe(false);
    expect(lib.toast).toBe('该图书暂无可借副本');
  });

  it('归还成功写入提示', async () => {
    api.returnBook.mockResolvedValue({ lendId: 1 });

    const lib = useLibraryStore();
    const result = await lib.giveBack(1);

    expect(result.ok).toBe(true);
    expect(lib.toast).toBe('归还成功');
    expect(api.returnBook).toHaveBeenCalledWith(1);
  });

  it('borrowedTitles 只包含未归还的书', async () => {
    api.myLends.mockResolvedValue({
      list: [
        { id: 1, title: 'A', status: 'borrowed' },
        { id: 2, title: 'B', status: 'returned' },
        { id: 3, title: 'C', status: 'borrowed' },
      ],
      stats: { total: 3, active: 2, returned: 1, maxBorrow: 5 },
    });

    const lib = useLibraryStore();
    await lib.loadMyLends();

    expect(lib.borrowedTitles).toEqual(['A', 'C']);
    expect(lib.myStats.active).toBe(2);
  });

  it('clearToast 能清掉提示', () => {
    const lib = useLibraryStore();
    lib.notify('x');
    expect(lib.toast).toBe('x');
    lib.clearToast();
    expect(lib.toast).toBe('');
  });
});
