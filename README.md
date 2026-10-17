# 图书管理系统（前后端分离 + 自动化测试）

一个**能真跑起来**的小型全栈项目：借书、还书、查借阅记录，前后端分离，带 116 条自动化测试。

做完这个项目能说清三件事：前端组件怎么拆、后端接口怎么设计、**测试怎么保证业务规则不被改坏**。

---

## 一、技术栈

| 层 | 选型 | 为什么 |
|---|---|---|
| 前端 | Vue 3（`<script setup>`）+ Vite + Vue Router + Pinia + Axios | 主流组合，组件化 + 集中状态管理 |
| 后端 | **Node 内置 `http` + `node:sqlite`** | 零第三方依赖，`npm install` 都不会失败 |
| 测试 | 后端：`node --test`；前端：Vitest + jsdom | 都用官方/主流工具，不引额外测试框架 |

> 后端特意**不依赖 Express**：`node:http` 足够表达路由与鉴权，`node:sqlite` 是 Node 22.5+ 内置的数据库驱动。少一层依赖，就少一类"装不上、跑不起来"的问题。

---

## 二、目录结构

```
library-system/
├── server/                     # 后端
│   ├── src/
│   │   ├── db.js               # 表结构、种子数据、借阅规则常量
│   │   ├── app.js              # 业务逻辑 + 路由分发（纯函数，可脱离 HTTP 测试）
│   │   └── server.js           # HTTP 接入层：CORS、请求体解析、静态托管
│   ├── test/
│   │   ├── app.test.js         # 业务逻辑 51 条
│   │   ├── http.test.js        # 真实 HTTP 12 条
│   │   └── consistency.test.js # 并发与一致性 9 条
│   └── package.json
└── client/                     # 前端
    ├── src/
    │   ├── api/                # axios 实例、拦截器、令牌存储
    │   ├── stores/             # Pinia：auth（登录态）、library（图书与借阅）
    │   ├── views/              # 三个页面：登录 / 图书浏览 / 我的借阅
    │   ├── components/         # BookCard、StatsBar
    │   └── utils/format.js     # 日期、逾期、额度、关键词高亮
    └── test/unit.test.js       # 前端 44 条
```

---

## 三、怎么跑起来

### 环境要求
- **Node ≥ 22.5**（`node:sqlite` 的最低版本；本项目在 Node 24 上验证）
- 不需要 MySQL、不需要 Docker

### 1. 启动后端

```bash
cd server
npm start          # 或 node src/server.js
```

看到这些输出就成功了：

```
[library-system] 服务已启动: http://localhost:5178
[library-system] 接口 8 个:
    POST /api/login
    GET /api/me
    ...
```

数据库文件会自动创建在 `server/data/library.db`，并写入种子数据。

### 2. 启动前端

```bash
cd client
npm install
npm run dev
```

打开 http://localhost:5173 ，用演示账号登录：

| 用户名 | 密码 | 说明 |
|---|---|---|
| `zhangsan` | `123456` | 张三，无借阅记录 |
| `lisi` | `123456` | 李四 |
| `wangwu` | `123456` | 王五，已借走《明朝那些事儿》 |

> 不登录也能浏览图书列表（公开接口），点"借阅"才会要求登录。

### 3. 跑测试

```bash
cd server && npm test     # 后端 72 条
cd client && npm test     # 前端 44 条
```

---

## 四、接口一览

| 方法 | 路径 | 说明 | 需要登录 |
|---|---|---|---|
| POST | `/api/login` | 登录，返回令牌 | 否 |
| GET | `/api/me` | 当前读者信息 + 借阅额度 | 是 |
| GET | `/api/overview` | 首页统计（种类数、可借数、在借率） | 否 |
| GET | `/api/categories` | 分类列表 | 否 |
| GET | `/api/books` | 图书列表，支持 `keyword` / `categoryId` / `page` / `pageSize` | 否（带令牌会标记"我借过"） |
| POST | `/api/borrow` | 借书 | 是 |
| GET | `/api/my-lends` | 我的借阅记录 + 统计 | 是 |
| POST | `/api/return/:id` | 还书 | 是 |

统一响应格式：

```json
{ "code": 0, "message": "ok", "data": { } }
```

`code === 0` 表示成功；其它值为 HTTP 状态码，`message` 可直接展示给用户。

### 业务规则（都有测试覆盖）

| 规则 | 值 | 在哪测的 |
|---|---|---|
| 每人最多同时在借 | 5 本 | `consistency.test.js` |
| 借期 | 30 天 | `app.test.js` |
| 同一本书不能重复借（未还时） | — | `app.test.js` |
| 不能归还他人的借阅记录 | — | `app.test.js` |
| 副本数为 0 时拒绝借阅 | — | `app.test.js` |

---

## 五、测试覆盖了什么

### 后端 72 条（`node --test`）

| 文件 | 条数 | 重点 |
|---|---|---|
| `app.test.js` | 51 | 登录校验、令牌解析、搜索（书名/作者/ISBN）、分页边界、借还流程、越权、统计口径 |
| `http.test.js` | 12 | 真实起服务 + `fetch` 打请求：路由、CORS、JSON 解析失败、中文编码往返 |
| `consistency.test.js` | 9 | 多人抢同一本书、副本不出现负数、上限只算未归还、还书后即时释放额度 |

### 前端 44 条（Vitest）

- **工具函数**：日期格式化、天数差、逾期判定（含"正好 3 天"这种边界）、额度与可借文案、关键词高亮
- **auth store**：登录成功/失败、令牌失效自动登出、额度增减不为负
- **library store**：列表加载与失败、筛选重置页码、页码夹取、借还提示文案

---

## 六、开发过程中测出来的 2 个真实缺陷

这不是"写完了补测试"，而是测试先发现了问题。面试可以直接讲这两段：

### 缺陷 1：搜索 `%` 会返回全部图书

`LIKE` 语句里 `%` 和 `_` 是通配符，用户输入 `%` 时拼出的条件是 `LIKE '%%%'`，结果匹配所有记录。

**修复**：转义特殊字符并使用 `ESCAPE` 子句

```js
export function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
// SQL: b.title LIKE ? ESCAPE '\'
```

**回归用例**：`搜索词中的 % 不会当作通配符放大结果`

### 缺陷 2：公开接口拿不到登录身份，`borrowedByMe` 恒为 false

`/api/books` 是公开接口（游客可看），但我在分发逻辑里写了"不需要鉴权就直接跳过令牌解析"，导致**即使带了合法令牌，读者身份也是空的**，列表里"你已借阅"的标记永远不出现。

**修复**：把"解析身份"和"是否强制登录"拆开

```js
const readerId = parseToken(ctx.headers?.authorization);  // 总是尝试解析
if (route.auth !== false) {                                // 是否强制才单独判断
  if (readerId === null) return fail(401, '请先登录');
}
```

**回归用例**：`带令牌时标记 borrowedByMe`

---

## 七、设计取舍（面试常被追问）

**为什么业务逻辑不写在 HTTP 处理函数里？**
`app.js` 只暴露 `dispatch(ctx) → { status, body }`，完全不知道 HTTP 存在。所以 51 条业务测试**不用起端口**，毫秒级跑完；`server.js` 那 12 条才验证真实网络行为。分层的直接收益就是测试快、定位准。

**为什么令牌是 `base64(reader:id)`？**
演示用途，重点是让"鉴权"这件事真实存在（有解析、有失效判断）。生产环境应换成 JWT：签名防篡改、有过期时间、可携带权限。

**为什么额度只在本地增减（`bumpActiveLends`）？**
借书成功后额度 +1 是确定的，不需要为这一个数字再发一次请求。但如果接口报错，本地值可能与服务端不一致 —— 所以每次进入"我的借阅"页面都会重新拉一次服务端数据兜底。

**为什么数据库用 `:memory:` 跑测试？**
测试之间必须互不影响。用内存库 + `beforeEach(resetData)`，每条用例都在完全相同的种子数据上开始，避免"测试互相污染导致的偶发失败"。

---

## 八、下一步可以做什么

- [ ] 换成 JWT + 刷新令牌，密码改为哈希存储
- [ ] 增加"逾期罚金"与续借功能
- [ ] 借书加事务（当前是单连接顺序执行，高并发下仍可能超借）
- [ ] 加 Playwright 端到端测试，覆盖完整点击流程
- [ ] 后端接口补一份 OpenAPI 文档
