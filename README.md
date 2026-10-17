图书管理系统
一个图书馆借还书系统，前后端分离。功能包括登录、图书搜索和分页、借书还书、查借阅记录、逾期提示。
前后端和测试都是自己写的，配了 116 条自动化测试。
技术栈
| 层 | 配置 | 说明 |
|---|---|---|
| 前端 | Vue 3 + Vite + Vue Router + Pinia + Axios | |
| 后端 | Node 内置的 http 和 node:sqlite | 无 Express，没用到 MySQL |
| 测试 | 后端 node --test，前端 Vitest + jsdom | |

后端没用框架是因为接口只有 8 个，node:http 够用；数据库用 node:sqlite， clone 下来装完依赖就能跑，不用另外装数据库。

目录

```
library-system/
├── server/
│   ├── src/
│   │   ├── db.js          建表、种子数据、借阅规则常量
│   │   ├── app.js         业务逻辑 + 路由分发
│   │   └── server.js      HTTP 层：CORS、请求体解析、静态托管
│   ├── test/
│   │   ├── app.test.js        51 条，业务逻辑
│   │   ├── http.test.js       12 条，真实起服务打请求
│   │   └── consistency.test.js 9 条，并发和副本数
│   └── package.json
└── client/
    ├── src/
    │   ├── api/          axios 实例、拦截器、token 存取
    │   ├── stores/       Pinia：auth（登录态）、library（图书和借阅）
    │   ├── views/        登录页、图书浏览页、我的借阅页
    │   ├── components/   BookCard、StatsBar
    │   └── utils/        日期、逾期、额度、关键词高亮
    ├── test/unit.test.js 44 条
    └── package.json
```

运行方式：
需要 Node 22.5 以上。
启动后端：

bash
cd server
npm start

启动后应该看到：

[library-system] 服务已启动: http://localhost:5178
[library-system] 接口 8 个:
    POST /api/login
    ...

数据库会自动建在 `server/data/library.db`，
再开一个终端启动前端：

bash
cd client
npm install
npm run dev


浏览器打开 http://localhost:5173。演示账号密码都是 `123456`：

| 用户名 | 说明 |
|---|---|
| zhangsan | 张三，没有借阅记录 |
| lisi | 李四 |
| wangwu | 王五，已经借了一本 |

不登录也能看图书列表，点借阅的时候才会要求登录。

测试：

bash
cd server && npm test
cd client && npm test

接口：

| 方法 | 路径 | 说明 | 是否登录 |
|---|---|---|---|
| POST | /api/login | 登录，返回 token | 否 |
| GET | /api/me | 读者信息 + 借阅额度 | 是 |
| GET | /api/overview | 首页统计 | 否 |
| GET | /api/categories | 分类列表 | 否 |
| GET | /api/books | 图书列表，支持 keyword / categoryId / page / pageSize | 否（带 token 会标出我借过哪些） |
| POST | /api/borrow | 借书 | 是 |
| GET | /api/my-lends | 我的借阅记录 + 统计 | 是 |
| POST | /api/return/:id | 还书 | 是 |

返回格式统一：

json
{ "code": 0, "message": "ok", "data": {} }

code 为 0 表示成功，其他值是 HTTP 状态码，message 可以直接显示给用户。

业务规则（都有测试）：

 每人同时最多借 5 本
 借期 30 天
 同一本书没还的时候不能再借
 不能还别人的借阅记录
 副本为 0 时不能借

测试：

后端 72 条：

| 文件 | 条数 | 测试内容 |
|---|---|---|
| app.test.js | 51 | 登录校验、token 解析、搜索、分页边界、借还流程、越权、统计 |
| http.test.js | 12 | 起真实服务用 fetch 打：路由、CORS、JSON 解析失败、中文编码 |
| consistency.test.js | 9 | 多人抢同一本书、副本不为负、上限按未归还算 |

前端 44 条：

 工具函数：日期格式化、天数差、逾期判断（包括正好 3 天这种边界）、额度文案、关键词高亮
 auth store：登录成功/失败、token 失效自动登出、额度增减不为负
 library store：列表加载、加载失败、筛选重置页码、页码夹取、借还提示

写测试时发现的两个问题：

 一、搜 `%` 会返回全部图书

本来想加一条边界用例：搜 `%` 应该一条都搜不到。结果返回了全部 6 条。
原因是 SQL 的 `LIKE` 里 `%` 和 `_` 是通配符，拼接出来的条件是 `LIKE '%%%'`，把所有记录都匹配上了。
改法是先转义再拼，SQL 那边加 `ESCAPE`：

js
export function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

// SQL 里：b.title LIKE ? ESCAPE '\'

 二、公开接口拿不到登录身份

图书列表是公开接口，游客也能看。我在分发那块写成了"不需要鉴权就跳过 token 解析"。
结果登录用户也拿不到身份，列表里"你已借阅"的标记不会出现。
改法是把两件事分开，解析身份总是做，是否强制登录才看路由配置：

js
const readerId = parseToken(ctx.headers?.authorization);  // 总是解析
if (route.auth !== false) {                                // 是否强制才看配置
  if (readerId === null) return fail(401, '请先登录');
}

