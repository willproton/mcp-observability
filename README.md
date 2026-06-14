# 🔍 MCP Observability System

Claude Code MCP 观测系统 — 自动记录、追踪、可视化所有 MCP 活动。

## 架构

```
Claude Code ──stdio──▶ MCP Proxy ──stdio──▶ Real MCP Server
Claude Code ──HTTP──▶ MCP Proxy ──HTTP──▶ Real MCP Server
                          │
                    HTTP POST (events)
                          │
                          ▼
                    Event Server (Express + WebSocket)
                          │
                    WebSocket (real-time)
                          │
                          ▼
                    Dashboard (Next.js + React)
```

## 三大模块

| 模块 | 端口 | 技术 | 用途 |
|------|------|------|------|
| **MCP Proxy** | 动态分配 | Node.js + TypeScript | 拦截 MCP 请求/响应，生成 trace_id，转发到真实 MCP 服务器 |
| **Event Server** | 3100 | Express + WebSocket | 接收事件、持久化 JSON 日志、WebSocket 实时广播 |
| **Dashboard** | 3000 | Next.js 14 + TypeScript | Chrome DevTools 风格实时可视化面板 |

## 快速开始

### 1. 安装依赖

```bash
cd /path/to/mcp-observability
npm install
```

### 2. 启动 Event Server

```bash
npm run dev:server
# → HTTP: http://localhost:3100
# → WS:   ws://localhost:3100/ws
# → Logs: ~/.claude/logs/mcp-observability/
```

### 3. 启动 Dashboard

```bash
npm run dev:dashboard
# → http://localhost:3000
```

### 4. 接入 Claude Code MCP

在 `~/.claude.json` 的 `mcpServers` 中，将任意 stdio MCP 服务器替换为代理版本：

#### 示例：代理 filesystem MCP

**原始配置：**
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/landeng/Projects"]
    }
  }
}
```

**代理配置：**
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "node",
      "args": [
        "/Users/landeng/Projects/mcp-observability/packages/proxy/dist/index.js",
        "--name", "filesystem",
        "--target-command", "npx",
        "--target-args", "-y,@modelcontextprotocol/server-filesystem,/Users/landeng/Projects"
      ]
    }
  }
}
```

#### 示例：代理 HTTP MCP (如 Vercel)

先构建代理：
```bash
npm run build -w packages/proxy
```

启动 HTTP 代理：
```bash
node packages/proxy/dist/index.js \
  --name vercel \
  --http-proxy \
  --target-url https://mcp.vercel.com \
  --port 3101
```

然后在 Claude Code 配置中：
```json
{
  "mcpServers": {
    "vercel": {
      "type": "http",
      "url": "http://localhost:3101"
    }
  }
}
```

### 一键启动全部

```bash
npm start
# 同时启动 Event Server + Dashboard
```

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/health` | 健康检查 |
| `POST` | `/api/events` | 接收事件 (MCP Proxy → Event Server) |
| `GET` | `/api/events?since=ISO&limit=100` | 查询事件 |
| `GET` | `/api/traces/:traceId` | 获取完整 trace |
| `GET` | `/api/stats` | 聚合统计 |
| `DELETE` | `/api/events` | 清空事件 |
| `WS` | `/ws` | WebSocket 实时推送 |

## 统一事件格式

```typescript
interface TraceEvent {
  trace_id: string;        // UUID — 同一会话共享
  span_id: string;         // UUID — 单次调用唯一
  parent_span_id?: string; // 父 span (嵌套调用)
  timestamp: string;       // ISO 8601
  type: "mcp_call" | "mcp_response" | "skill_inferred" | "file_access" | "reasoning" | "output" | "error";
  server_name: string;     // MCP 服务器名称
  tool_name?: string;      // 调用的工具名
  direction: "request" | "response";
  payload: Record<string, unknown>;
  metadata: {
    transport: "stdio" | "http";
    duration_ms?: number;
    skill_tags?: string[];   // 自动推断的 Skill 标签
  };
}
```

## Skill 自动推断

系统根据 MCP 服务器名称和工具调用自动推断正在使用的 Claude Code Skill：

| MCP Server | Inferred Skill |
|------------|---------------|
| `filesystem` | `file_access` |
| `github`, `git` | `git_workflow` |
| `playwright`, `browser_*` | `e2e_testing` |
| `context7`, `exa-web-search` | `research` |
| `sequential-thinking` | `reasoning` |
| `supabase`, `clickhouse` | `database` |
| `magic`, `shadcn` | `frontend_design` |
| `fal-ai` | `media_generation` |
| `jira`, `confluence` | `project_management` |
| `vercel`, `railway` | `deployment` |
| `memory`, `omega-memory` | `memory_retrieval` |

## Dashboard 截图

![Dashboard](screenshots/%E6%88%AA%E5%B1%8F2026-06-14%2021.54.21.png)

## Dashboard 功能

- ✅ **Trace Timeline**: 瀑布图展示所有 trace 的时间线
- ✅ **Event Table**: 表格视图，可按类型/服务器筛选
- ✅ **Trace Detail**: 点击任一事件查看完整 payload
- ✅ **Skill Panel**: 实时显示推断的 Skill 使用统计
- ✅ **Server Stats**: MCP 服务器调用频率统计
- ✅ **Live Status**: WebSocket 连接状态指示器
- ✅ **Real-time**: 事件到达即显示，无需刷新
- ✅ **Dark Theme**: Chrome DevTools 风格深色主题

## 可扩展导出器 (Exporters)

系统内置三个导出器，通过环境变量启用。所有导出器默认关闭，仅在配置后自动激活。

### n8n Webhook 导出器

将 MCP 事件实时推送到 n8n webhook，触发自动化工作流：

```bash
export N8N_WEBHOOK_URL=https://n8n.example.com/webhook/mcp-observability
export N8N_WEBHOOK_AUTH_HEADER="Bearer your-token"  # 可选
```

n8n 工作流示例用途：
- MCP 错误 → Slack 告警
- 特定 tool call → 自动创建 Jira ticket
- 部署事件 → 触发 CI/CD pipeline

### LangSmith 导出器

导出 LangSmith 兼容的 trace 格式，用于 LLM 可观测性：

```bash
export LANGSMITH_API_KEY=ls__xxx
export LANGSMITH_ENDPOINT=https://api.smith.langchain.com  # 可选
export LANGSMITH_PROJECT=mcp-observability  # 可选
```

每个 span 映射为 LangSmith run：
- `mcp_call` → `tool` run
- `reasoning` → `llm` run
- `file_access` → `retriever` run
- 其他 → `chain` run

### Obsidian 导出器

将 trace 写入 Obsidian vault 为带 frontmatter 的 Markdown 笔记：

```bash
export OBSIDIAN_VAULT_PATH=/Users/xxx/ObsidianVault/MCP-Logs
export OBSIDIAN_TEMPLATE=trace-log  # "trace-log" | "daily-note" | "summary"
```

- **trace-log**: 每个 trace 生成独立笔记，含完整事件详情
- **daily-note**: 追加到每日笔记 `MCP-Daily-YYYY-MM-DD.md`
- **summary**: 仅生成摘要笔记

Obsidian 笔记兼容 Dataview 插件，可直接用 dataview 查询。

### 添加自定义导出器

实现 `Exporter` 接口即可接入：

```typescript
import type { Exporter } from "./exporters/base";
import type { TraceEvent } from "../store";

export class MyExporter implements Exporter {
  readonly name = "my-exporter";

  async initialize(): Promise<void> { /* 启动时调用 */ }
  async export(event: TraceEvent): Promise<void> { /* 每个事件调用 */ }
  async flush(): Promise<void> { /* 定时刷新 */ }
  async shutdown(): Promise<void> { /* 关闭时调用 */ }
  health(): { ok: boolean; message?: string } { /* 健康状态 */ }
}
```

然后在 `exporters/index.ts` 的 `ExporterManager` 构造函数中注册。

## 项目结构

```
mcp-observability/
├── packages/
│   ├── proxy/src/
│   │   ├── index.ts          # CLI 入口 (stdio / HTTP 代理)
│   │   ├── stdio-proxy.ts    # stdio 传输代理
│   │   ├── http-proxy.ts     # HTTP 传输代理
│   │   ├── tracer.ts         # Trace ID 生成
│   │   └── reporter.ts       # 事件上报 (批量 HTTP POST)
│   ├── server/src/
│   │   ├── index.ts          # Express + WS 入口
│   │   ├── store.ts          # 事件存储 (内存环形缓冲 + JSONL)
│   │   ├── routes.ts         # REST API
│   │   ├── websocket.ts      # WebSocket 广播
│   │   ├── inferrer.ts       # Skill 推断引擎
│   │   └── exporters/        # 可扩展导出器
│   │       ├── base.ts       # Exporter 接口
│   │       ├── index.ts      # ExporterManager 编排器
│   │       ├── n8n.ts        # n8n webhook 导出
│   │       ├── langsmith.ts  # LangSmith trace 导出
│   │       └── obsidian.ts   # Obsidian markdown 导出
│   └── dashboard/src/
│       ├── app/              # Next.js App Router
│       ├── components/       # Timeline, TraceDetail, etc.
│       └── lib/              # Types, WebSocket hook
└── README.md
```
