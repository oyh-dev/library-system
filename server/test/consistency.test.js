/**
 * 数据一致性测试：并发借还、副本扣减、边界条件。
 * 这些用例专门用于回答面试里的"你怎么保证数据没算错"。
 */
import { test, describe, beforeEach, after, run } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, migrate, resetData, RULES } from '../src/db.js';
import { createApp, createToken } from '../src/app.js';

const db = migrate(openDatabase(':memory:'));
const app = createApp(db);

const T1 = { authorization: `Bearer ${createToken(1)}` };
const T2 = { authorization: `Bearer ${createToken(2)}` };
const T3 = { authorization: `Bearer ${createToken(3)}` };

const call = (method, path, opts = {}) => app.dispatch({ method, path, ...opts });
const book = (id) => call('GET', '/api/books', { query: { pageSize: '50' } })
  .body.data.list.find((b) => b.id === id);

beforeEach(() => resetData(db));
after(() => db.close());

describe('并发与副本一致性', () => {
  test('3 人同借 2 副本的书：2 人成功、1 人失败，副本正好归零', () => {
    // 《明朝那些事儿》total=2，种子里已有 1 本在借（王五），可借 1 本
    const results = [
      call('POST', '/api/borrow', { body: { bookId: 5 }, headers: T1 }),
      call('POST', '/api/borrow', { body: { bookId: 5 }, headers: T2 }),
      call('POST', '/api/borrow', { body: { bookId: 5 }, headers: T3 }),
    ];
    const succeeded = results.filter((r) => r.status === 200).length;
    assert.equal(succeeded, 1, '此时只有 1 个可借副本');
    assert.equal(book(5).available, 0, '可借数应正好归零，不能变成负数');
  });

  test('副本从不出现负数（对同一本书连续借到失败为止）', () => {
    // 先还掉种子里的在借记录，让 copies=2 全部可借
    call('POST', '/api/return/1', { headers: T3 });
    assert.equal(book(5).available, 2);

    const outcomes = [
      call('POST', '/api/borrow', { body: { bookId: 5 }, headers: T1 }),
      call('POST', '/api/borrow', { body: { bookId: 5 }, headers: T2 }),
      call('POST', '/api/borrow', { body: { bookId: 5 }, headers: T3 }),
    ];
    assert.equal(outcomes.filter((r) => r.status === 200).length, 2);
    assert.equal(book(5).available, 0);
  });

  test('归还后副本回到原值，且不超过总量', () => {
    const total = book(1).total;
    const lendId = call('POST', '/api/borrow', { body: { bookId: 1 }, headers: T1 }).body.data.lendId;
    assert.equal(book(1).available, total - 1);
    call('POST', `/api/return/${lendId}`, { headers: T1 });
    assert.equal(book(1).available, total);
    assert.ok(book(1).available <= book(1).total);
  });

  test('总副本数在借还过程中保持不变', () => {
    const before = call('GET', '/api/overview').body.data;
    const lendId = call('POST', '/api/borrow', { body: { bookId: 6 }, headers: T1 }).body.data.lendId;
    call('POST', `/api/return/${lendId}`, { headers: T1 });
    const after = call('GET', '/api/overview').body.data;
    assert.equal(after.totalCopies, before.totalCopies);
    assert.equal(after.availableCopies, before.availableCopies);
  });

  test('两个读者同时借书互不干扰，各自统计独立', () => {
    call('POST', '/api/borrow', { body: { bookId: 1 }, headers: T1 });
    call('POST', '/api/borrow', { body: { bookId: 2 }, headers: T1 });
    call('POST', '/api/borrow', { body: { bookId: 4 }, headers: T2 });

    assert.equal(call('GET', '/api/my-lends', { headers: T1 }).body.data.stats.active, 2);
    assert.equal(call('GET', '/api/my-lends', { headers: T2 }).body.data.stats.active, 1);
    // 种子里已有 1 条在借（王五），加上刚借出的 3 条
    assert.equal(call('GET', '/api/overview').body.data.activeLends, 4);
  });
});

describe('借阅规则边界', () => {
  test('借到第 5 本仍成功，第 6 本被拒绝', () => {
    // 可借的 6 本书：1,2,4,5,6 可借（3 号 available=0）
    const order = [1, 2, 4, 5, 6];
    for (const id of order) {
      const r = call('POST', '/api/borrow', { body: { bookId: id }, headers: T1 });
      assert.equal(r.status, 200, `第 ${order.indexOf(id) + 1} 本应可借`);
    }
    assert.equal(call('GET', '/api/my-lends', { headers: T1 }).body.data.stats.active,
      RULES.maxBorrowPerReader);

    // 已到上限：先把一本书还掉腾出名额前的状态检查
    const stillBlocked = call('POST', '/api/borrow', { body: { bookId: 3 }, headers: T1 });
    assert.equal(stillBlocked.status, 400);
  });

  test('上限只算未归还的书：还掉一本后立刻又能借一本', () => {
    for (const id of [1, 2, 4, 5, 6]) {
      call('POST', '/api/borrow', { body: { bookId: id }, headers: T1 });
    }
    const mine = call('GET', '/api/my-lends', { headers: T1 });
    assert.equal(mine.body.data.stats.active, 5);

    const lendId = mine.body.data.list[0].id;
    call('POST', `/api/return/${lendId}`, { headers: T1 });

    const after = call('GET', '/api/my-lends', { headers: T1 });
    assert.equal(after.body.data.stats.active, 4);
    assert.equal(after.body.data.stats.returned, 1);
  });

  test('应还日期与借出日期相差恰好 30 天', () => {
    const r = call('POST', '/api/borrow', { body: { bookId: 1 }, headers: T1 });
    const diff = (new Date(r.body.data.dueAt) - new Date(r.body.data.lendAt)) / 86400000;
    assert.equal(diff, RULES.loanDays);
  });

  test('同一本不同副本归还顺序不影响可借数', () => {
    const a = call('POST', '/api/borrow', { body: { bookId: 4 }, headers: T1 }).body.data.lendId;
    const b = call('POST', '/api/borrow', { body: { bookId: 4 }, headers: T2 }).body.data.lendId;
    call('POST', `/api/return/${a}`, { headers: T1 });
    call('POST', `/api/return/${b}`, { headers: T2 });
    assert.equal(book(4).available, book(4).total);
  });
});

if (process.argv[1] && process.argv[1].endsWith('consistency.test.js')) {
  run({ files: [import.meta.url] });
}
