/**
 * HTTP 接入层：把 app.js 的 dispatch 接到真实 http.Server 上。
 * 额外负责：CORS（方便前端 dev server 直接调）、请求体解析、静态资源托管。
 */
import { createServer as createHttpServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { createApp } from './app.js';
import { openDatabase, migrate } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

const MAX_BODY = 1024 * 1024; // 1MB，防大请求打满内存

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  };
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    ...corsHeaders(),
  });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('请求体过大');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('请求体不是合法 JSON');
  }
}

/**
 * 创建服务。
 * @param {{ db?: import('node:sqlite').DatabaseSync, staticDir?: string|null }} options
 */
export function createServer(options = {}) {
  const db = options.db ?? migrate(openDatabase());
  const app = createApp(db);
  const staticDir = options.staticDir === undefined
    ? resolve(__dirname, '..', '..', 'client', 'dist')
    : options.staticDir;

  const server = createHttpServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const path = url.pathname;

    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders());
      res.end();
      return;
    }

    if (path.startsWith('/api/')) {
      let body = {};
      try {
        body = req.method === 'GET' || req.method === 'HEAD' ? {} : await readBody(req);
      } catch (err) {
        sendJson(res, 400, { code: 400, message: err.message, data: null });
        return;
      }
      const query = Object.fromEntries(url.searchParams.entries());
      const result = app.dispatch({
        method: req.method,
        path,
        query,
        body,
        headers: req.headers,
      });
      sendJson(res, result.status, result.body);
      return;
    }

    await serveStatic(res, staticDir, path);
  });

  server.app = app;
  server.db = db;
  return server;
}

async function serveStatic(res, staticDir, path) {
  if (!staticDir) {
    sendJson(res, 404, { code: 404, message: '接口不存在', data: null });
    return;
  }
  try {
    const safe = normalize(path).replace(/^(\.\.[/\\])+/, '');
    let filePath = join(staticDir, safe);
    const info = await stat(filePath).catch(() => null);
    if (!info || info.isDirectory()) {
      filePath = join(staticDir, 'index.html'); // SPA 回退
    }
    const buf = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': buf.length,
    });
    res.end(buf);
  } catch {
    sendJson(res, 404, { code: 404, message: '资源不存在', data: null });
  }
}

/** 命令行入口：node src/server.js */
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const port = Number(process.env.PORT ?? 5178);
  const server = createServer();
  server.listen(port, () => {
    const routes = server.app.listRoutes();
    console.log(`[library-system] 服务已启动: http://localhost:${port}`);
    console.log(`[library-system] 接口 ${routes.length} 个:`);
    for (const r of routes) console.log('   ', r);
  });
}
