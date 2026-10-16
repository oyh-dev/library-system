/**
 * 数据库层：使用 Node 24 内置的 node:sqlite，无需任何第三方依赖。
 * 表结构、种子数据、以及"重置数据库"能力（便于测试跑在干净数据上）。
 */
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** 借阅业务规则，提取为常量，测试可直接引用 */
export const RULES = {
  maxBorrowPerReader: 5, // 每人最多同时在借 5 本
  loanDays: 30,          // 借期 30 天
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS category (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS book (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  author       TEXT NOT NULL DEFAULT '',
  isbn         TEXT NOT NULL DEFAULT '',
  category_id  INTEGER,
  total_copies INTEGER NOT NULL DEFAULT 1,
  available    INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (category_id) REFERENCES category(id)
);

CREATE TABLE IF NOT EXISTS reader (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  name     TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  phone    TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS lend (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id     INTEGER NOT NULL,
  reader_id   INTEGER NOT NULL,
  lend_at     TEXT NOT NULL,
  due_at      TEXT NOT NULL,
  returned_at TEXT,
  FOREIGN KEY (book_id) REFERENCES book(id),
  FOREIGN KEY (reader_id) REFERENCES reader(id)
);
`;

const SEED = {
  categories: [
    [1, '计算机'],
    [2, '文学'],
    [3, '历史'],
    [4, '经济'],
  ],
  books: [
    // id, title, author, isbn, category_id, total, available
    [1, 'JavaScript 高级程序设计', 'Matt Frisbie', '9787115545381', 1, 3, 3],
    [2, 'Vue.js 设计与实现', '霍春阳', '9787115583864', 1, 2, 2],
    [3, '深入理解计算机系统', 'Randal E. Bryant', '9787111544937', 1, 1, 0],
    [4, '活着', '余华', '9787506365437', 2, 4, 4],
    [5, '明朝那些事儿', '当年明月', '9787801655990', 3, 2, 1],
    [6, '经济学原理', '曼昆', '9787301256909', 4, 2, 2],
  ],
  readers: [
    [1, '张三', 'zhangsan', '123456', '13800000001'],
    [2, '李四', 'lisi', '123456', '13800000002'],
    [3, '王五', 'wangwu', '123456', '13800000003'],
  ],
  /* 一条"在借"记录：王五借走《明朝那些事儿》 */
  lends: [
    [1, 5, 3, '2026-09-20T10:00:00+08:00', '2026-10-20T10:00:00+08:00', null],
  ],
};

/**
 * 打开数据库。传 ':memory:' 得到内存库（测试用），
 * 传具体路径则落在磁盘上（开发用）。
 */
export function openDatabase(file = join(__dirname, '..', 'data', 'library.db')) {
  if (file !== ':memory:') {
    mkdirSync(dirname(file), { recursive: true });
  }
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

/** 建表 + 写种子数据；重复调用会先清空，保证数据确定 */
export function migrate(db) {
  db.exec(SCHEMA);
  resetData(db);
  return db;
}

/** 清空业务数据并重新写入种子数据 */
export function resetData(db) {
  db.exec('DELETE FROM lend');
  db.exec('DELETE FROM book');
  db.exec('DELETE FROM reader');
  db.exec('DELETE FROM category');
  db.exec("DELETE FROM sqlite_sequence WHERE name IN ('book','reader','category','lend')");

  const insertCategory = db.prepare('INSERT INTO category (id, name) VALUES (?, ?)');
  for (const row of SEED.categories) insertCategory.run(...row);

  const insertBook = db.prepare(
    'INSERT INTO book (id, title, author, isbn, category_id, total_copies, available) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  for (const row of SEED.books) insertBook.run(...row);

  const insertReader = db.prepare(
    'INSERT INTO reader (id, name, username, password, phone) VALUES (?, ?, ?, ?, ?)',
  );
  for (const row of SEED.readers) insertReader.run(...row);

  const insertLend = db.prepare(
    'INSERT INTO lend (id, book_id, reader_id, lend_at, due_at, returned_at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  for (const row of SEED.lends) insertLend.run(...row);
}

export const seed = SEED;
