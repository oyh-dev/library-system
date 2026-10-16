/**
 * HTTP 层集成测试：真的起一个 http.Server 并监听随机端口，用 fetch 打真实请求。
 * 覆盖：路由分发、JSON 解析、CORS、错误码、静态资源回退。
 */
import { test, describe, before, after, beforeEach, run } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';
import { openDatabase, migrate, resetData } from '../src/db.js';
import { createToken } from '../src/app.js';

let server;
let base;
const db = migrate(openDatabase(':memory:'));

before(async () => {
  server = createServer({ db, staticDir: null });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
});

beforeEach(() => resetData(db));

const auth = () => ({ authorization: `Bearer ${createToken(1)}` });

async function get(path, headers = {}) {
  const res = await fetch(`${base}${path}`, { headers });
  return { status: res.status, body: await res.json(), res };
}

async function post(path, body, headers = {}) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, body: await res.json(), res };
}

describe('HTTP 服务', () => {
  test('GET /api/books 返回 200 与 JSON 结构', async () => {
    const r = await get('/api/books?pageSize=3');
    assert.equal(r.status, 200);
    assert.equal(r.body.code, 0);
    assert.equal(r.body.data.list.length, 3);
    assert.equal(r.res.headers.get('content-type'), 'application/json; charset=utf-8');
  });

  test('POST /api/login 走通真实网络链路并拿到令牌', async () => {
    const r = await post('/api/login', { username: 'lisi', password: '123456' });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.reader.name, '李四');
  });

  test('鉴权头经 HTTP 传递后可访问受保护接口', async () => {
    const r = await get('/api/me', auth());
    assert.equal(r.status, 200);
    assert.equal(r.body.data.name, '张三');
  });

  test('缺少鉴权头返回 401（HTTP 状态码与 body.code 一致）', async () => {
    const r = await get('/api/me');
    assert.equal(r.status, 401);
    assert.equal(r.body.code, 401);
  });

  test('借书 -> 查我的借阅 全链路', async () => {
    const borrow = await post('/api/borrow', { bookId: 1 }, auth());
    assert.equal(borrow.status, 200);

    const mine = await get('/api/my-lends', auth());
    assert.equal(mine.body.data.list.length, 1);
    assert.equal(mine.body.data.list[0].title, 'JavaScript 高级程序设计');
    assert.equal(mine.body.data.stats.active, 1);
  });

  test('OPTIONS 预检返回 204 且带 CORS 头', async () => {
    const res = await fetch(`${base}/api/books`, { method: 'OPTIONS' });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    assert.match(res.headers.get('access-control-allow-methods') ?? '', /POST/);
  });

  test('所有响应都带 CORS 头（前端 dev server 可跨域调用）', async () => {
    const r = await get('/api/categories');
    assert.equal(r.res.headers.get('access-control-allow-origin'), '*');
  });

  test('非法 JSON 请求体返回 400 而不是崩溃', async () => {
    const res = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad json',
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.message, /合法 JSON/);
  });

  test('空请求体按空对象处理，返回业务校验错误', async () => {
    const res = await fetch(`${base}/api/login`, { method: 'POST' });
    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /不能为空/);
  });

  test('未知 API 路径返回 404 JSON', async () => {
    const r = await get('/api/unknown');
    assert.equal(r.status, 404);
    assert.equal(r.body.code, 404);
  });

  test('关闭静态托管时，非 API 路径也返回 404 JSON', async () => {
    const r = await get('/index.html');
    assert.equal(r.status, 404);
  });

  test('中文内容在 HTTP 往返中不乱码', async () => {
    const r = await get('/api/books?keyword=' + encodeURIComponent('明朝'));
    assert.equal(r.body.data.list[0].title, '明朝那些事儿');
    assert.equal(r.body.data.list[0].author, '当年明月');
  });
});

if (process.argv[1] && process.argv[1].endsWith('http.test.js')) {
  run({ files: [import.meta.url] });
}
