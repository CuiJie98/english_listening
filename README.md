# 6 Min English - BBC 听力练习 App

基于 BBC Learning English 6 Minute English 的英语听力练习应用。支持音频播放、影子跟读、词汇间隔复习。

## 技术栈

- **前端**: Expo (React Native) + Expo Router, 部署到 Cloudflare Pages
- **后端**: Cloudflare Worker (D1 SQLite + R2 存储)
- **数据源**: BBC 6 Minute English RSS Feed

## 本地开发

### 启动后端

```bash
cd backend
npx wrangler dev
```

后端运行在 `http://localhost:8787`。

### 启动前端

```bash
npm install
npx expo start --web
```

前端在 `localhost` 环境会自动连接 `http://localhost:8787`。

## 部署

### 部署后端 (Cloudflare Worker)

```bash
cd backend
npx wrangler deploy
```

### 部署前端 (Cloudflare Pages)

```bash
npx expo export --platform web
npx wrangler pages deploy dist --project-name bbc-english-app --commit-message "your message" --commit-dirty=true
```

## 管理端点

所有管理端点需要 `secret` 参数（值见 `backend/wrangler.toml` 中的 `ADMIN_SECRET`）。

**基础 URL**: `https://bbc-english-api.1140390745.workers.dev`

### 数据同步

| 端点 | 说明 |
|------|------|
| `GET /api/sync?secret=xxx` | 手动触发 RSS 同步，抓取新节目和 transcript |
| `GET /api/reparse-all?secret=xxx` | 重新提取 transcript（每批 10 个），需多次调用直到返回 `remaining: 0` |
| `GET /api/reparse/:id?secret=xxx` | 重新提取单个节目的 transcript |
| `GET /api/clear-transcripts?secret=xxx` | 清除所有 transcript 数据，状态重置为 `pending`，等 cron 自动重新抓取 |

### 调试

| 端点 | 说明 |
|------|------|
| `GET /api/debug/audio/:id?secret=xxx` | 查看某个节目的音频 URL 提取情况 |
| `GET /api/debug/transcript/:id?secret=xxx` | 查看 transcript 提取详情（segments、speakers） |
| `GET /api/debug/rss?secret=xxx` | 查看 RSS feed 原始响应 |

## 常见操作

### 更新 transcript 解析逻辑后重新提取

修改 `transcriptExtractor.ts` 后，需要 reparse 已有数据：

```bash
# 批量 reparse（每批 10 个，重复调用直到 remaining: 0）
curl "https://bbc-english-api.1140390745.workers.dev/api/reparse-all?secret=debug2026"

# 或单个节目 reparse
curl "https://bbc-english-api.1140390745.workers.dev/api/reparse/1?secret=debug2026"
```

也可以在浏览器中直接访问上述 URL。

### 清除所有数据重新抓取

```bash
# 1. 清除 transcript
curl "https://bbc-english-api.1140390745.workers.dev/api/clear-transcripts?secret=debug2026"

# 2. 等待 cron 自动重新抓取（每 6 小时），或手动触发
curl "https://bbc-english-api.1140390745.workers.dev/api/sync?secret=debug2026"
```

### 查看某个节目的提取结果

```bash
# 查看 transcript 提取详情
curl "https://bbc-english-api.1140390745.workers.dev/api/debug/transcript/1?secret=debug2026"
```

## 项目结构

```
app/
  (tabs)/
    index.tsx          # 首页：统计、最新节目、复习入口
    episodes.tsx       # 节目列表 + 练习历史
    vocab.tsx          # 词汇复习（SM-2 间隔重复）
  episode/[id].tsx     # 节目详情 + 播放器 + transcript + 存词
  settings.tsx         # 设置
  _layout.tsx          # 路由配置

backend/
  src/
    index.ts           # Worker 入口 + 路由 + cron sync
    router.ts          # 简易路由
    handlers/          # API handlers
    db/queries.ts      # D1 数据库查询
    services/
      transcriptExtractor.ts  # BBC 页面 transcript 提取
      feedFetcher.ts          # RSS 解析
    types.ts           # 类型定义

src/
  services/
    apiClient.ts       # 前端 API 客户端
    storage.ts         # AsyncStorage 封装（用户 ID、播放速度、进度）
  constants/
    theme.ts           # 颜色/间距/字号
    config.ts          # API 地址、速度选项
```
