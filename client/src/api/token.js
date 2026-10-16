/**
 * 令牌与读者的本地持久化。
 * 单独拆一个模块，好处是单测里可以干净地替换掉 localStorage。
 */
const TOKEN_KEY = 'library.token';
const READER_KEY = 'library.reader';

function storage() {
  // SSR 或测试环境下可能没有 window
  return typeof window === 'undefined' ? null : window.localStorage;
}

export function getToken() {
  return storage()?.getItem(TOKEN_KEY) ?? '';
}

export function setToken(token) {
  if (!token) return;
  storage()?.setItem(TOKEN_KEY, token);
}

export function getReader() {
  const raw = storage()?.getItem(READER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null; // 存储被写坏时不要让页面崩掉
  }
}

export function setReader(reader) {
  if (!reader) return;
  storage()?.setItem(READER_KEY, JSON.stringify(reader));
}

export function clearAuth() {
  const s = storage();
  s?.removeItem(TOKEN_KEY);
  s?.removeItem(READER_KEY);
}

export const KEYS = { TOKEN_KEY, READER_KEY };
