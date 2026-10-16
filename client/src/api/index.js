import axios from 'axios';
import { getToken } from './token.js';

/**
 * 统一的 axios 实例。
 * 后端约定响应体为 { code, message, data }：
 *   - code === 0 视为业务成功，直接把 data 返回给调用方
 *   - 其余情况抛出带 message 的错误
 */
const http = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

/** 请求拦截：自动带上令牌 */
http.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/** 响应拦截：解包 data、统一错误信息 */
http.interceptors.response.use(
  (response) => {
    const body = response.data;
    if (body && typeof body === 'object' && 'code' in body) {
      if (body.code === 0) return body.data;
      const err = new Error(body.message || '请求失败');
      err.code = body.code;
      err.status = response.status;
      return Promise.reject(err);
    }
    return body;
  },
  (error) => {
    // 后端返回了非 2xx：优先用响应体里的 message
    const body = error?.response?.data;
    const message = body?.message || error.message || '网络异常，请稍后重试';
    const err = new Error(message);
    err.status = error?.response?.status ?? 0;
    err.code = body?.code ?? err.status;
    return Promise.reject(err);
  },
);

// ------------------------------------------------------------------ 接口封装
export const api = {
  login: (username, password) => http.post('/login', { username, password }),
  me: () => http.get('/me'),
  overview: () => http.get('/overview'),
  categories: () => http.get('/categories'),
  books: (params = {}) => http.get('/books', { params }),
  borrow: (bookId) => http.post('/borrow', { bookId }),
  returnBook: (lendId) => http.post(`/return/${lendId}`),
  myLends: () => http.get('/my-lends'),
};

export default http;
