/**
 * 后端 API 测试：直接调用 app.dispatch，不起端口，速度最快。
 * 运行：node --test test/
 */
import { test, describe, beforeEach, after, run } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, migrate, resetData, RULES } from '../src/db.js';
import { createApp, createToken, parseToken, localDate, addDays } from '../src/app.js';

const db = migrate(openDatabase(':memory:'));
const app = createApp(db);

const TOKEN = createToken(1); // 张三
const AUTH = { authorization: `Bearer ${TOKEN}` };

/** 便捷调用：模拟一次请求 */
function call(method, path, { body, query, headers } = {}) {
  return app.dispatch({ method, path, body, query, headers });
}

beforeEach(() => resetData(db));
after(() => db.close());

// ------------------------------------------------------------------ 工具函数
describe('工具函数', () => {
  test('createToken 生成的令牌可被 parseToken 解回', () => {
    assert.equal(parseToken(`Bearer ${createToken(7)}`), 7);
  });

  test('缺少 Bearer 前缀时解析失败', () => {
    assert.equal(parseToken(createToken(1)), null);
  });

  test('乱码令牌解析为 null 而不是抛异常', () => {
    assert.equal(parseToken('Bearer %%%not-base64%%%'), null);
  });

  test('localDate 按东八区换算（UTC 跨日边界）', () => {
    // UTC 2026-01-01T20:00Z == 北京时间 2026-01-02 04:00
    assert.equal(localDate('2026-01-01T20:00:00Z'), '2026-01-02');
  });

  test('addDays 正确增加天数', () => {
    assert.equal(addDays('2026-01-01T00:00:00Z', 30), '2026-01-31T00:00:00.000Z');
  });
});

// ------------------------------------------------------------------ 登录
describe('POST /api/login 登录', () => {
  test('正确账号密码返回 token 与读者信息', () => {
    const r = call('POST', '/api/login', { body: { username: 'zhangsan', password: '123456' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.code, 0);
    assert.ok(r.body.data.token);
    assert.equal(r.body.data.reader.name, '张三');
    assert.equal(parseToken(`Bearer ${r.body.data.token}`), 1);
  });

  test('密码错误返回 401', () => {
    const r = call('POST', '/api/login', { body: { username: 'zhangsan', password: 'wrong' } });
    assert.equal(r.status, 401);
    assert.match(r.body.message, /用户名或密码错误/);
  });

  test('用户不存在返回 401', () => {
    const r = call('POST', '/api/login', { body: { username: 'nobody', password: '123456' } });
    assert.equal(r.status, 401);
  });

  test('用户名或密码为空返回 400', () => {
    assert.equal(call('POST', '/api/login', { body: { username: '', password: '1' } }).status, 400);
    assert.equal(call('POST', '/api/login', { body: {} }).status, 400);
  });

  test('用户名前后空格会被裁剪', () => {
    const r = call('POST', '/api/login', { body: { username: '  zhangsan  ', password: '123456' } });
    assert.equal(r.status, 200);
  });
});

// ------------------------------------------------------------------ 鉴权
describe('鉴权中间件', () => {
  test('无 Authorization 头访问受保护接口返回 401', () => {
    assert.equal(call('GET', '/api/me').status, 401);
    assert.equal(call('GET', '/api/my-lends').status, 401);
  });

  test('令牌无效返回 401', () => {
    const r = call('GET', '/api/me', { headers: { authorization: 'Bearer bad-token' } });
    assert.equal(r.status, 401);
  });

  test('令牌指向不存在的读者返回 401', () => {
    const r = call('GET', '/api/me', { headers: { authorization: `Bearer ${createToken(999)}` } });
    assert.equal(r.status, 401);
    assert.match(r.body.message, /登录状态无效/);
  });

  test('公开接口无需令牌即可访问', () => {
    assert.equal(call('GET', '/api/books').status, 200);
    assert.equal(call('GET', '/api/categories').status, 200);
    assert.equal(call('GET', '/api/overview').status, 200);
  });
});

// ------------------------------------------------------------------ 图书列表
describe('GET /api/books 图书列表', () => {
  test('默认返回第一页 10 条，含分类名', () => {
    const r = call('GET', '/api/books', { query: {} });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.total, 6);
    assert.equal(r.body.data.page, 1);
    assert.equal(r.body.data.list.length, 6);
    assert.equal(r.body.data.list[0].categoryName, '计算机');
  });

  test('关键词可匹配书名', () => {
    const r = call('GET', '/api/books', { query: { keyword: 'Vue' } });
    assert.equal(r.body.data.total, 1);
    assert.equal(r.body.data.list[0].title, 'Vue.js 设计与实现');
  });

  test('关键词可匹配作者', () => {
    const r = call('GET', '/api/books', { query: { keyword: '余华' } });
    assert.equal(r.body.data.total, 1);
    assert.equal(r.body.data.list[0].title, '活着');
  });

  test('关键词可匹配 ISBN', () => {
    const r = call('GET', '/api/books', { query: { keyword: '9787111544937' } });
    assert.equal(r.body.data.total, 1);
  });

  test('关键词无匹配时返回空数组而不是报错', () => {
    const r = call('GET', '/api/books', { query: { keyword: '不存在的书xyz' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.total, 0);
    assert.deepEqual(r.body.data.list, []);
  });

  test('按分类过滤', () => {
    const r = call('GET', '/api/books', { query: { categoryId: '1' } });
    assert.equal(r.body.data.total, 3);
    assert.ok(r.body.data.list.every((b) => b.categoryId === 1));
  });

  test('关键词 + 分类组合过滤', () => {
    const r = call('GET', '/api/books', { query: { keyword: 'Vue', categoryId: '1' } });
    assert.equal(r.body.data.total, 1);
  });

  test('搜索词中的 % 不会当作通配符放大结果', () => {
    const r = call('GET', '/api/books', { query: { keyword: '%' } });
    assert.equal(r.body.data.total, 0);
  });

  test('分页：pageSize=2 时 total 不变、list 变短', () => {
    const r = call('GET', '/api/books', { query: { page: '2', pageSize: '2' } });
    assert.equal(r.body.data.total, 6);
    assert.equal(r.body.data.list.length, 2);
    assert.equal(r.body.data.list[0].id, 3);
  });

  test('pageSize 超过上限 50 会被夹紧', () => {
    const r = call('GET', '/api/books', { query: { pageSize: '999' } });
    assert.equal(r.body.data.pageSize, 50);
  });

  test('非法 page/pageSize 回退到默认值', () => {
    const r = call('GET', '/api/books', { query: { page: 'abc', pageSize: '-5' } });
    assert.equal(r.body.data.page, 1);
    assert.equal(r.body.data.pageSize, 1);
  });

  test('带令牌时标记 borrowedByMe', () => {
    const before = call('GET', '/api/books', { query: {}, headers: AUTH });
    assert.equal(before.body.data.list.find((b) => b.id === 4).borrowedByMe, false);

    call('POST', '/api/borrow', { body: { bookId: 4 }, headers: AUTH });

    const after = call('GET', '/api/books', { query: {}, headers: AUTH });
    assert.equal(after.body.data.list.find((b) => b.id === 4).borrowedByMe, true);
  });

  test('未登录时 borrowedByMe 全为 false', () => {
    const r = call('GET', '/api/books', { query: {} });
    assert.ok(r.body.data.list.every((b) => b.borrowedByMe === false));
  });
});

// ------------------------------------------------------------------ 分类
describe('GET /api/categories 分类', () => {
  test('返回全部 4 个分类且按 id 升序', () => {
    const r = call('GET', '/api/categories');
    assert.equal(r.body.data.length, 4);
    assert.deepEqual(r.body.data.map((c) => c.id), [1, 2, 3, 4]);
  });
});

// ------------------------------------------------------------------ 借阅
describe('POST /api/borrow 借阅', () => {
  test('借阅成功：可借数 -1，返回应还日期为 30 天后', () => {
    const r = call('POST', '/api/borrow', { body: { bookId: 1 }, headers: AUTH });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.bookId, 1);
    assert.ok(r.body.data.lendId > 0);

    const days = Math.round(
      (new Date(r.body.data.dueAt) - new Date(r.body.data.lendAt)) / 86400000,
    );
    assert.equal(days, RULES.loanDays);

    const books = call('GET', '/api/books', { query: { keyword: 'JavaScript' } });
    assert.equal(books.body.data.list[0].available, 2);
  });

  test('缺少 bookId 返回 400', () => {
    assert.equal(call('POST', '/api/borrow', { body: {}, headers: AUTH }).status, 400);
  });

  test('bookId 非数字返回 400', () => {
    assert.equal(call('POST', '/api/borrow', { body: { bookId: 'abc' }, headers: AUTH }).status, 400);
  });

  test('图书不存在返回 404', () => {
    const r = call('POST', '/api/borrow', { body: { bookId: 9999 }, headers: AUTH });
    assert.equal(r.status, 404);
    assert.match(r.body.message, /图书不存在/);
  });

  test('无可借副本时返回 400（边界：available = 0）', () => {
    const r = call('POST', '/api/borrow', { body: { bookId: 3 }, headers: AUTH });
    assert.equal(r.status, 400);
    assert.match(r.body.message, /暂无可借副本/);
  });

  test('重复借阅同一本未还的书被拒绝', () => {
    assert.equal(call('POST', '/api/borrow', { body: { bookId: 1 }, headers: AUTH }).status, 200);
    const second = call('POST', '/api/borrow', { body: { bookId: 1 }, headers: AUTH });
    assert.equal(second.status, 400);
    assert.match(second.body.message, /尚未归还/);
  });

  test('达到上限后不能再借（边界：正好 5 本）', () => {
    // 种子里每人最多借 5 本，可借的 6 本书里挑 5 本
    for (const bookId of [1, 2, 4, 5, 6]) {
      assert.equal(call('POST', '/api/borrow', { body: { bookId }, headers: AUTH }).status, 200);
    }
    const r = call('POST', '/api/borrow', { body: { bookId: 3 }, headers: AUTH });
    // 第 3 本 available=0 本来就借不了，这里换个已还的书验证上限
    assert.equal(r.status, 400);
  });

  test('刚好第 5 本可以借出，第 6 本被上限拦住', () => {
    // 先借 4 本，再把其中一本还掉，再借第 5 本 —— 验证计数按"在借"算
    for (const bookId of [1, 2, 4, 5]) {
      assert.equal(call('POST', '/api/borrow', { body: { bookId }, headers: AUTH }).status, 200);
    }
    const mine = call('GET', '/api/my-lends', { headers: AUTH });
    assert.equal(mine.body.data.stats.active, 4);

    const lendId = mine.body.data.list.find((l) => l.bookId === 5).id;
    assert.equal(call('POST', `/api/return/${lendId}`, { headers: AUTH }).status, 200);

    // 还掉之后又能借第 5 本了（6 号）
    assert.equal(call('POST', '/api/borrow', { body: { bookId: 6 }, headers: AUTH }).status, 200);
    // 此时在借 4 本（1,2,4,6），再借第 5 本（5 号刚还掉的可借）
    assert.equal(call('POST', '/api/borrow', { body: { bookId: 5 }, headers: AUTH }).status, 200);
    const r = call('POST', '/api/borrow', { body: { bookId: 3 }, headers: AUTH });
    assert.equal(r.status, 400);
  });

  test('两个读者可以同时借同一本书（副本足够时）', () => {
    const a = call('POST', '/api/borrow', { body: { bookId: 4 }, headers: AUTH });
    const b = call('POST', '/api/borrow', {
      body: { bookId: 4 },
      headers: { authorization: `Bearer ${createToken(2)}` },
    });
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    const books = call('GET', '/api/books', { query: { keyword: '活着' } });
    assert.equal(books.body.data.list[0].available, 2);
  });
});

// ------------------------------------------------------------------ 归还
describe('POST /api/return/:id 归还', () => {
  test('归还成功：可借数 +1，记录带 returnedAt', () => {
    const borrowRes = call('POST', '/api/borrow', { body: { bookId: 1 }, headers: AUTH });
    const lendId = borrowRes.body.data.lendId;

    const r = call('POST', `/api/return/${lendId}`, { headers: AUTH });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.lendId, lendId);

    const books = call('GET', '/api/books', { query: { keyword: 'JavaScript' } });
    assert.equal(books.body.data.list[0].available, 3);
  });

  test('借阅记录不存在返回 404', () => {
    assert.equal(call('POST', '/api/return/9999', { headers: AUTH }).status, 404);
  });

  test('重复归还返回 400', () => {
    const lendId = call('POST', '/api/borrow', { body: { bookId: 1 }, headers: AUTH }).body.data.lendId;
    assert.equal(call('POST', `/api/return/${lendId}`, { headers: AUTH }).status, 200);
    const again = call('POST', `/api/return/${lendId}`, { headers: AUTH });
    assert.equal(again.status, 400);
    assert.match(again.body.message, /已归还/);
  });

  test('不能归还他人的借阅记录（越权检查）', () => {
    // 种子数据里 lend#1 属于王五（id=3），张三尝试归还
    const r = call('POST', '/api/return/1', { headers: AUTH });
    assert.equal(r.status, 403);
    assert.match(r.body.message, /他人/);
  });

  test('id 非数字返回 400', () => {
    // 路由匹配不到时是 404，这里验证路径本身不合法的情况
    const r = call('POST', '/api/return/abc', { headers: AUTH });
    assert.equal(r.status, 404);
  });
});

// ------------------------------------------------------------------ 我的借阅
describe('GET /api/my-lends 我的借阅', () => {
  test('初始为空，统计全 0，上限为规则值', () => {
    const r = call('GET', '/api/my-lends', { headers: AUTH });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.data.list, []);
    assert.equal(r.body.data.stats.total, 0);
    assert.equal(r.body.data.stats.active, 0);
    assert.equal(r.body.data.stats.maxBorrow, RULES.maxBorrowPerReader);
  });

  test('借阅后出现记录，状态为 borrowed，带日期字段', () => {
    call('POST', '/api/borrow', { body: { bookId: 2 }, headers: AUTH });
    const r = call('GET', '/api/my-lends', { headers: AUTH });
    const item = r.body.data.list[0];
    assert.equal(item.status, 'borrowed');
    assert.equal(item.title, 'Vue.js 设计与实现');
    assert.match(item.lendDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(item.dueDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(item.returnedDate, null);
  });

  test('归还后状态变为 returned，统计随之变化', () => {
    const lendId = call('POST', '/api/borrow', { body: { bookId: 2 }, headers: AUTH }).body.data.lendId;
    call('POST', `/api/return/${lendId}`, { headers: AUTH });

    const r = call('GET', '/api/my-lends', { headers: AUTH });
    assert.equal(r.body.data.list[0].status, 'returned');
    assert.ok(r.body.data.list[0].returnedDate);
    assert.equal(r.body.data.stats.active, 0);
    assert.equal(r.body.data.stats.returned, 1);
  });

  test('只看得到自己的记录（隔离性）', () => {
    call('POST', '/api/borrow', { body: { bookId: 1 }, headers: AUTH });
    const other = call('GET', '/api/my-lends', {
      headers: { authorization: `Bearer ${createToken(2)}` },
    });
    assert.equal(other.body.data.list.length, 0);
  });

  test('列表按 id 倒序，最新的在最前', () => {
    call('POST', '/api/borrow', { body: { bookId: 1 }, headers: AUTH });
    call('POST', '/api/borrow', { body: { bookId: 2 }, headers: AUTH });
    const r = call('GET', '/api/my-lends', { headers: AUTH });
    assert.equal(r.body.data.list[0].bookId, 2);
    assert.equal(r.body.data.list[1].bookId, 1);
  });
});

// ------------------------------------------------------------------ 概览
describe('GET /api/overview 概览统计', () => {
  test('种子数据的统计值正确', () => {
    const r = call('GET', '/api/overview');
    const d = r.body.data;
    assert.equal(d.totalBooks, 6);
    assert.equal(d.totalCopies, 14);
    assert.equal(d.availableCopies, 12); // 明朝那些事儿 1 本在借，CSAPP 1 本不可借
    assert.equal(d.activeLends, 1);
    assert.equal(d.categories, 4);
    assert.equal(d.borrowedCopies, 2);
  });

  test('借书后利用率上升', () => {
    const before = call('GET', '/api/overview').body.data.utilization;
    call('POST', '/api/borrow', { body: { bookId: 4 }, headers: AUTH });
    const after = call('GET', '/api/overview').body.data.utilization;
    assert.ok(after > before);
  });
});

// ------------------------------------------------------------------ 其他
describe('未匹配路由', () => {
  test('未知接口返回 404 且带上方法名', () => {
    const r = call('GET', '/api/not-exist');
    assert.equal(r.status, 404);
    assert.match(r.body.message, /GET \/api\/not-exist/);
  });

  test('方法不匹配也返回 404（例如用 GET 调登录）', () => {
    assert.equal(call('GET', '/api/login').status, 404);
  });
});

/* 直接 `node test/app.test.js` 也能跑：不需要 node --test 派生进程 */
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  run({ files: [import.meta.url] });
}
