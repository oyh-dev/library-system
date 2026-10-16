/**
 * 业务逻辑与路由：纯函数式，不依赖任何 web 框架。
 * createApp(db) 返回 { dispatch, listRoutes }，由 server.js 接到真实 http 上，
 * 测试里也可以直接调用 dispatch，不需要起端口。
 */
import { RULES } from './db.js';

/** 登录令牌 = base64("reader:<id>")。演示用途，正式项目应换成 JWT 等 */
export function createToken(readerId) {
  return Buffer.from(`reader:${readerId}`, 'utf8').toString('base64');
}

/** 从 Authorization: Bearer <token> 解析读者 id；失败返回 null */
export function parseToken(header) {
  if (!header || typeof header !== 'string') return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m) return null;
  try {
    const raw = Buffer.from(m[1], 'base64').toString('utf8');
    const mm = /^reader:(\d+)$/.exec(raw);
    return mm ? Number(mm[1]) : null;
  } catch {
    return null;
  }
}

/** 基于 UTC 计算本地日期串（YYYY-MM-DD，Asia/Shanghai） */
export function localDate(iso, timeZone = 'Asia/Shanghai') {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function addDays(iso, days) {
  return new Date(new Date(iso).getTime() + days * 86400000).toISOString();
}

/** 统一响应体 */
function ok(data, message = 'ok') {
  return { status: 200, body: { code: 0, message, data } };
}
function fail(status, message) {
  return { status, body: { code: status, message, data: null } };
}

const round2 = (n) => Math.round(n * 100) / 100;
const asInt = (v, dflt) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : dflt;
};

/**
 * 转义 LIKE 的特殊字符，避免用户输入的 % _ 被当成通配符。
 * （这是一个真实踩过的坑：搜 "%" 会返回全部图书）
 */
export function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export function createApp(db) {
  // ---------------------------------------------------------------- 准备语句
  const S = {
    readerByLogin: db.prepare('SELECT * FROM reader WHERE username = ? AND password = ?'),
    readerById: db.prepare('SELECT * FROM reader WHERE id = ?'),
    categories: db.prepare('SELECT * FROM category ORDER BY id'),
    bookById: db.prepare('SELECT * FROM book WHERE id = ?'),
    activeLendCount: db.prepare('SELECT COUNT(*) AS c FROM lend WHERE reader_id = ? AND returned_at IS NULL'),
    activeLendOfBook: db.prepare(
      'SELECT id FROM lend WHERE reader_id = ? AND book_id = ? AND returned_at IS NULL',
    ),
    insertLend: db.prepare(
      'INSERT INTO lend (book_id, reader_id, lend_at, due_at, returned_at) VALUES (?, ?, ?, ?, NULL)',
    ),
    lastInsertId: db.prepare('SELECT last_insert_rowid() AS id'),
    lendById: db.prepare('SELECT * FROM lend WHERE id = ?'),
    markReturned: db.prepare('UPDATE lend SET returned_at = ? WHERE id = ?'),
    decAvailable: db.prepare('UPDATE book SET available = available - 1 WHERE id = ?'),
    incAvailable: db.prepare('UPDATE book SET available = available + 1 WHERE id = ?'),
    myLends: db.prepare(`
      SELECT l.id, l.lend_at, l.due_at, l.returned_at,
             b.id AS book_id, b.title, b.author
        FROM lend l JOIN book b ON b.id = l.book_id
       WHERE l.reader_id = ?
       ORDER BY l.id DESC
    `),
    myActiveCount: db.prepare(
      'SELECT COUNT(*) AS c FROM lend WHERE reader_id = ? AND returned_at IS NULL',
    ),
    allBooks: db.prepare(`
      SELECT b.*, c.name AS category_name
        FROM book b LEFT JOIN category c ON c.id = b.category_id
       ORDER BY b.id
    `),
  };

  // ---------------------------------------------------------------- 处理器
  function login(body) {
    const username = String(body.username ?? '').trim();
    const password = String(body.password ?? '');
    if (!username || !password) return fail(400, '用户名和密码不能为空');
    const reader = S.readerByLogin.get(username, password);
    if (!reader) return fail(401, '用户名或密码错误');
    return ok({
      token: createToken(reader.id),
      reader: { id: reader.id, name: reader.name, username: reader.username },
    });
  }

  function listBooks(query, readerId) {
    const keyword = String(query.keyword ?? '').trim();
    const categoryIdRaw = query.categoryId;
    const categoryId =
      categoryIdRaw === undefined || categoryIdRaw === '' ? null : asInt(categoryIdRaw, NaN);
    const page = Math.max(1, asInt(query.page, 1));
    const pageSize = Math.min(50, Math.max(1, asInt(query.pageSize, 10)));

    // 动态条件：SQLite 支持参数绑定，避免拼接字符串注入
    const where = [];
    const args = [];
    if (keyword) {
      where.push("(b.title LIKE ? ESCAPE '\\' OR b.author LIKE ? ESCAPE '\\' OR b.isbn LIKE ? ESCAPE '\\')");
      const like = `%${escapeLike(keyword)}%`;
      args.push(like, like, like);
    }
    if (categoryId !== null && Number.isFinite(categoryId)) {
      where.push('b.category_id = ?');
      args.push(categoryId);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const total = db
      .prepare(`SELECT COUNT(*) AS c FROM book b ${whereSql}`)
      .get(...args).c;

    const rows = db
      .prepare(`
        SELECT b.*, c.name AS category_name
          FROM book b LEFT JOIN category c ON c.id = b.category_id
          ${whereSql}
         ORDER BY b.id
         LIMIT ? OFFSET ?
      `)
      .all(...args, pageSize, (page - 1) * pageSize);

    const borrowedIds = new Set(
      readerId === null
        ? []
        : db
            .prepare('SELECT book_id FROM lend WHERE reader_id = ? AND returned_at IS NULL')
            .all(readerId)
            .map((r) => r.book_id),
    );

    return ok({
      total,
      page,
      pageSize,
      list: rows.map((b) => ({
        id: b.id,
        title: b.title,
        author: b.author,
        isbn: b.isbn,
        categoryId: b.category_id,
        categoryName: b.category_name,
        total: b.total_copies,
        available: b.available,
        borrowedByMe: borrowedIds.has(b.id),
      })),
    });
  }

  function listCategories() {
    return ok(S.categories.all());
  }

  function borrow(readerId, body) {
    const bookId = asInt(body.bookId, NaN);
    if (!Number.isFinite(bookId)) return fail(400, 'bookId 必须是数字');

    const book = S.bookById.get(bookId);
    if (!book) return fail(404, '图书不存在');

    const activeCount = S.activeLendCount.get(readerId).c;
    if (activeCount >= RULES.maxBorrowPerReader) {
      return fail(400, `最多同时借阅 ${RULES.maxBorrowPerReader} 本图书`);
    }
    if (S.activeLendOfBook.get(readerId, bookId)) {
      return fail(400, '你已借阅此书且尚未归还');
    }
    if (book.available <= 0) return fail(400, '该图书暂无可借副本');

    const now = new Date().toISOString();
    const due = addDays(now, RULES.loanDays);
    S.insertLend.run(bookId, readerId, now, due);
    S.decAvailable.run(bookId);

    return ok(
      {
        lendId: S.lastInsertId.get().id,
        bookId,
        title: book.title,
        lendAt: now,
        dueAt: due,
        dueDate: localDate(due),
      },
      '借阅成功',
    );
  }

  function giveBack(readerId, lendId) {
    if (!Number.isFinite(lendId)) return fail(400, 'lendId 必须是数字');
    const lend = S.lendById.get(lendId);
    if (!lend) return fail(404, '借阅记录不存在');
    if (lend.reader_id !== readerId) return fail(403, '你不能归还他人的借阅记录');
    if (lend.returned_at) return fail(400, '该图书已归还');

    const now = new Date().toISOString();
    S.markReturned.run(now, lendId);
    S.incAvailable.run(lend.book_id);

    return ok({ lendId, returnedAt: now }, '归还成功');
  }

  function myLends(readerId) {
    const list = S.myLends.all(readerId).map((r) => ({
      id: r.id,
      bookId: r.book_id,
      title: r.title,
      author: r.author,
      lendAt: r.lend_at,
      lendDate: localDate(r.lend_at),
      dueAt: r.due_at,
      dueDate: localDate(r.due_at),
      returnedAt: r.returned_at,
      returnedDate: r.returned_at ? localDate(r.returned_at) : null,
      status: r.returned_at ? 'returned' : 'borrowed',
    }));

    const active = S.myActiveCount.get(readerId).c;
    return ok({
      list,
      stats: {
        total: list.length,
        active,
        returned: list.length - active,
        maxBorrow: RULES.maxBorrowPerReader,
      },
    });
  }

  function me(readerId) {
    const reader = S.readerById.get(readerId);
    if (!reader) return fail(401, '登录状态无效');
    const active = S.activeLendCount.get(readerId).c;
    return ok({
      id: reader.id,
      name: reader.name,
      username: reader.username,
      phone: reader.phone,
      activeLends: active,
      maxBorrow: RULES.maxBorrowPerReader,
    });
  }

  /** 未登录也能看的总览，用于首页统计卡片 */
  function overview() {
    const totalBooks = db.prepare('SELECT COUNT(*) AS c FROM book').get().c;
    const totalCopies = db.prepare('SELECT COALESCE(SUM(total_copies),0) AS c FROM book').get().c;
    const availableCopies = db.prepare('SELECT COALESCE(SUM(available),0) AS c FROM book').get().c;
    const activeLends = db.prepare('SELECT COUNT(*) AS c FROM lend WHERE returned_at IS NULL').get().c;
    const totalLends = db.prepare('SELECT COUNT(*) AS c FROM lend').get().c;
    const categories = db.prepare('SELECT COUNT(*) AS c FROM category').get().c;
    return ok({
      totalBooks,
      totalCopies,
      availableCopies,
      borrowedCopies: totalCopies - availableCopies,
      activeLends,
      totalLends,
      categories,
      utilization: totalCopies === 0 ? 0 : round2(((totalCopies - availableCopies) / totalCopies) * 100),
    });
  }

  // ---------------------------------------------------------------- 路由表
  const routes = [
    { method: 'POST', pattern: /^\/api\/login$/, handler: (ctx) => login(ctx.body), auth: false },
    { method: 'GET', pattern: /^\/api\/me$/, handler: (ctx) => me(ctx.readerId) },
    { method: 'GET', pattern: /^\/api\/overview$/, handler: () => overview(), auth: false },
    { method: 'GET', pattern: /^\/api\/categories$/, handler: () => listCategories(), auth: false },
    { method: 'GET', pattern: /^\/api\/books$/, handler: (ctx) => listBooks(ctx.query, ctx.readerId), auth: false },
    { method: 'POST', pattern: /^\/api\/borrow$/, handler: (ctx) => borrow(ctx.readerId, ctx.body) },
    { method: 'GET', pattern: /^\/api\/my-lends$/, handler: (ctx) => myLends(ctx.readerId) },
    {
      method: 'POST',
      pattern: /^\/api\/return\/(\d+)$/,
      handler: (ctx) => giveBack(ctx.readerId, Number(ctx.params[0])),
    },
  ];

  /**
   * 分发一次请求。返回 { status, body }，不做任何 I/O。
   * ctx = { method, path, query, body, headers }
   */
  function dispatch(ctx) {
    const method = String(ctx.method ?? 'GET').toUpperCase();
    const path = String(ctx.path ?? '/');

    for (const route of routes) {
      if (route.method !== method) continue;
      const m = route.pattern.exec(path);
      if (!m) continue;

      // 先尝试解析身份：公开接口也能"认人"（例如图书列表要标记我借了哪些）
      const readerId = parseToken(ctx.headers?.authorization);
      if (route.auth !== false) {
        if (readerId === null) return fail(401, '请先登录');
        if (!S.readerById.get(readerId)) return fail(401, '登录状态无效');
      }

      return route.handler({
        db,
        body: ctx.body ?? {},
        query: ctx.query ?? {},
        headers: ctx.headers ?? {},
        params: m.slice(1),
        readerId,
      });
    }
    return fail(404, `接口不存在: ${method} ${path}`);
  }

  return {
    dispatch,
    /** 供启动日志展示：把正则还原成可读的路由形式 */
    listRoutes: () =>
      routes.map((r) => {
        const path = r.pattern.source
          .replace(/^\^/, '')
          .replace(/\$$/, '')
          .replace(/\\\//g, '/')
          .replace(/\(\\d\+\)/g, ':id');
        return `${r.method} ${path}`;
      }),
  };
}
