# ClawWork - 应用设计文档

> OpenClaw ClawWork · 版本：v0.2 | 日期：2026-03-12 | 作者：samzong + Claude

---

## 1. 问题定义

### 1.1 核心痛点

IM 工具（飞书、Telegram、Slack）作为 OpenClaw 的对话渠道存在结构性缺陷：

- **线性对话流**：任务状态埋在消息流里，无法一眼看到当前进度
- **无上下文侧边栏**：缺乏 Progress / Context / Files 的结构化展示
- **多任务并行失控**：多个 AI 任务同时进行时，消息混在一起无法区分
- **产物散落**：AI 生成的文件、代码、文档分散在聊天记录中，难以检索和管理

### 1.2 目标

**产品体验对标 Claude Cowork**，在其基础上增加文件管理能力，技术层对接 OpenClaw。

核心价值主张：

1. **多任务并行** — 像 Claude Cowork 一样，多个 Task 可以同时进行，左侧列表自由切换，互不干扰
2. **结构化上下文** — 三栏布局：导航 + 对话流 + Progress/Artifacts 面板
3. **产物文件管理** — Claude Cowork 没有的能力：所有 AI 产物统一存储、检索、版本化
4. **本地优先** — 产物存储在用户本地 git repo，可追溯、可离线访问

### 1.3 体验对标 Claude Cowork

| 能力 | Claude Cowork | 本项目 | 差异说明 |
|------|--------------|--------|----------|
| 多 Task 并行 | ✅ 左侧列表切换 | ✅ 相同交互模式 | 完全对齐 |
| 三栏布局 | ✅ Nav + Chat + Context | ✅ 相同 | 完全对齐 |
| Progress 面板 | ✅ 任务步骤追踪 | ✅ 相同 | 完全对齐 |
| Artifacts 面板 | ✅ 当前对话产物 | ✅ 相同 + 全局文件管理器 | 增强 |
| 文件管理器 | ❌ 无 | ✅ 全局产物浏览/搜索/筛选 | 新增 |
| 后端 | Claude API | OpenClaw Gateway | 替换 |
| 存储 | 临时会话 | 本地 Git Repo 持久化 | 增强 |

### 1.4 不做什么

- 不做 OpenClaw 的管理后台（Agent 配置、模型管理等留给 OpenClaw Server）
- 不做通用 IM 客户端（不处理群聊、频道、@提及等 IM 语义）
- 不做多人协作（单用户桌面工具）

---

## 2. 核心概念与数据模型

### 2.1 Task（核心实体）

Task 是本应用的一等公民，1:1 映射到 OpenClaw 的一个 conversation session。**多个 Task 可以同时处于 active 状态并行执行**，就像 Claude Cowork 的多任务体验。

```
Task {
  id: string              // 本地 UUID
  sessionKey: string      // OpenClaw session key（格式：agent:<agentId>:<taskId>）
  sessionId: string       // OpenClaw session ID（由 Gateway 分配）
  title: string           // 用户命名或 AI 自动摘要
  status: enum            // active | completed | archived
  createdAt: timestamp
  updatedAt: timestamp
  tags: string[]          // 用户自定义标签
  artifactDir: string     // 产物目录路径（相对于 repo 根目录）
}
```

**与 OpenClaw Session 的映射：**

- 每个 Task 创建时，在 OpenClaw Gateway 创建一个独立的 session（通过唯一的 sessionKey）
- OpenClaw 的 session key 格式为 `agent:<agentId>:<mainKey>`，我们用 Task 的本地 UUID 作为 mainKey，确保每个 Task 对应独立的对话上下文
- OpenClaw Gateway 天然支持跨 session 并行执行：各 session 内消息串行处理，session 之间并发互不干扰
- Gateway 通过 WebSocket 广播所有 session 的事件，客户端按 sessionKey 过滤分发到对应 Task

**生命周期（简化）：**

```
[用户点击 New Task] → active（可同时存在多个 active Task）
                         ↓
                    completed（用户标记完成，对话记录保留可查看）
                         ↓
                    archived（归档，不在默认列表显示）
```

注意：没有 paused 状态。OpenClaw session 在两次消息之间天然是"休眠"的，不需要显式暂停。用户可以随时切换回任何 active Task 继续对话，这与 Claude Cowork 的行为一致。

### 2.2 Message

```
Message {
  id: string
  taskId: string           // 所属 Task
  role: enum               // user | assistant | system
  content: string          // 消息文本（支持 Markdown）
  artifacts: Artifact[]    // 本条消息产生的产物
  toolCalls: ToolCall[]    // AI 的工具调用记录
  timestamp: timestamp
}
```

### 2.3 Artifact（任务产物）

```
Artifact {
  id: string
  taskId: string
  messageId: string        // 产生这个产物的消息
  type: enum               // file | code | image | link | structured_data
  name: string             // 显示名
  filePath: string         // 本地存储路径（相对于 Task 产物目录）
  mimeType: string
  size: number
  createdAt: timestamp
}
```

### 2.4 存储结构（Git Repo）

用户首次启动时指定一个目录，初始化为 git repo：

```
<user-workspace>/
├── .openclaw/
│   ├── config.yaml        # 应用配置（OpenClaw server 地址、channel 信息等）
│   └── db.sqlite           # 本地元数据数据库（Task/Message 索引）
├── tasks/
│   ├── 2026-03-12-重构用户模块/
│   │   ├── artifacts/      # 此 Task 的产物文件
│   │   │   ├── schema.sql
│   │   │   ├── design.md
│   │   │   └── screenshot.png
│   │   └── .task.json      # Task 元数据
│   └── 2026-03-11-API文档生成/
│       ├── artifacts/
│       └── .task.json
└── .gitignore              # 忽略 db.sqlite、临时文件等
```

**设计决策说明：**

- **SQLite 做索引，文件系统做存储**：SQLite 用于快速查询和搜索，实际产物文件直接存在文件系统中。两者通过 filePath 关联。
- **Git 做版本化但不做同步**：git repo 提供本地版本追溯能力。如果未来需要多设备同步，用户可以自行配置 remote（GitHub、Gitea 等）。
- **自动提交策略**：每次 Task 状态变更或新产物生成时自动 commit，commit message 包含 Task 标题和变更摘要。不需要用户手动操作 git。

---

## 3. OpenClaw Gateway 集成

### 3.1 Gateway-Only 架构

ClawWork 通过单一 WebSocket 连接与 OpenClaw Gateway (:18789) 通信：

```
┌─────────────────────────────────────────────────────────────┐
│ 用户的机器                                                    │
│                                                             │
│  ┌─────────────────────┐      ┌──────────────────────────┐  │
│  │ OpenClaw Server      │      │ ClawWork Desktop App     │  │
│  │ (Node.js 进程)       │  WS  │ (Electron 进程)          │  │
│  │                     │◄────►│                          │  │
│  │ ┌─────────────────┐ │      │  React UI + SQLite       │  │
│  │ │ Gateway :18789  │ │      │  Git Repo (产物版本化)     │  │
│  │ │ Agent Engine    │ │      │                          │  │
│  │ └─────────────────┘ │      └──────────────────────────┘  │
│  └─────────────────────┘                                    │
└─────────────────────────────────────────────────────────────┘
```

Desktop 作为 Gateway WebSocket 客户端，使用 JSON-RPC 风格帧格式通信：

**出站（Desktop → Gateway）：**

| RPC 方法 | 用途 |
|---|---|
| `chat.send` | 发送用户消息 (`sessionKey` + `message` + `idempotencyKey`, `deliver: false`) |
| `chat.history` | 拉取 session 历史消息 |
| `sessions.list` | 列出所有 session |

**入站（Gateway → Desktop 事件）：**

| event | 用途 |
|---|---|
| `chat` | Agent 文本回复 (`payload.message.content[]`) |
| `agent` | 工具调用事件 (需 `caps:["tool-events"]`) |

**连接握手**：Gateway 先发 `connect.challenge`（含 nonce），客户端回复 `connect` 请求（protocol=3, client.id=`gateway-client`, mode=`backend`）。

> 历史说明：早期版本设计了 Desktop↔Channel Plugin 双通道架构（Plugin 运行在 OpenClaw 内部，通过 :13579 WS 与 Desktop 通信）。经验证 Gateway 单通道已能完成完整对话流 + 工具调用事件，双通道架构已在 Gateway-Only 重构（G1-G9）中完全移除。`packages/channel-plugin` 代码仍在仓库中但已从 workspace 排除。

### 3.2 Session 机制与多任务并行

**已确认：OpenClaw 天然支持多 session 并行，这是实现 Cowork 式多任务体验的基础。**

**Session Key 结构：**

```
agent:<agentId>:<mainKey>
```

ClawWork为每个 Task 生成唯一的 mainKey（使用 Task 本地 UUID），确保每个 Task 对应独立的 OpenClaw session。例如：

```
agent:my-agent:task-a1b2c3d4    ← Task "重构用户模块"
agent:my-agent:task-e5f6g7h8    ← Task "API文档生成"
agent:my-agent:task-i9j0k1l2    ← Task "数据迁移"（三个 Task 可同时 active）
```

**并行执行模型：**

- OpenClaw Gateway 采用 "Default Serial, Explicit Parallel" 架构
- **session 内**：消息串行处理（通过 lane queue），防止竞态
- **session 间**：完全并行执行，互不阻塞
- 这意味着用户可以在 Task A 等待 Agent 响应的同时，切到 Task B 发送新消息

**WebSocket 事件分发：**

Gateway 通过 WebSocket 广播所有 session 的事件（已知设计：不做 session 级过滤）。客户端需要：

1. 接收所有事件
2. 从事件 payload 中提取 `sessionKey`
3. 按 sessionKey 分发到对应 Task 的消息队列
4. 只渲染当前激活 Task 的消息流，后台 Task 的新消息更新左侧列表的未读计数

**Session 生命周期：**

- 创建：用户新建 Task 时自动创建
- 维持：session 在两次消息之间自然休眠，不消耗 Gateway 资源
- 重置：OpenClaw 默认每天 4:00 AM 重置 session。ClawWork 应通过服务端配置禁用自动重置，让 Task 的对话上下文长期保持
- 持久化：Gateway 将对话记录存储为 `.jsonl` 格式的 transcript 文件（`~/.openclaw/agents/<agentId>/sessions/<sessionId>.jsonl`），客户端同时在本地 SQLite 保存一份用于离线查看和搜索

### 3.3 通信架构

```
┌──────────────────┐        WebSocket         ┌──────────────────┐
│  Desktop Client  │ ◄────────────────────►   │  OpenClaw Server │
│  (Electron App)  │                          │  (Gateway:18789) │
│                  │   1. chat.send (sessionKey)│                │
│  Task A ─┐      │   2. ← chat event (回复)  │                  │
│  Task B ─┤ mux  │   3. ← agent event (工具) │  - Agent Engine  │
│  Task C ─┘      │   4. ← artifact 路径      │  - Gateway WS    │
│  (并行执行)      │                          │                  │
│                  │   客户端按 sessionKey     │                  │
│  - Local SQLite  │   分发到对应 Task         │  session 间并行  │
│  - Git Repo      │                          │  session 内串行  │
└──────────────────┘                          └──────────────────┘
```

**消息流：**

1. **用户 → Agent**：ClawWork 通过 `chat.send` RPC 发送消息，携带目标 Task 的 sessionKey + idempotencyKey
2. **Agent → 用户**：Gateway 通过 `chat` event 推送 Agent 回复，客户端按 sessionKey 路由到对应 Task
3. **工具调用**：Agent 执行工具时，进度通过 `agent` event 实时推送（需 `caps:["tool-events"]`）
4. **产物处理**：artifact 文件通过本地路径复制到 workspace 产物目录（见 3.4 文件传输设计）

### 3.4 文件传输设计

MVP 只做同机部署：artifact 文件通过本地路径直接复制到 workspace 产物目录。

| 场景 | 方案 | 说明 |
|------|------|------|
| **同机部署（MVP）** | 直接传路径 | Agent 产物通过 `mediaPath` 传递，ClawWork 直接读本地文件并复制到 Task 产物目录 |
| **远程部署（后续）** | 三方存储中转 | 产物上传到三方存储（WebDAV / S3 / MinIO），ClawWork 从存储服务下载 |

```
本地路径（同机） ← MVP 默认
       ↓ 可扩展
WebDAV（自建 NAS / Nextcloud 等）
S3-compatible（AWS S3 / MinIO / Cloudflare R2）
```

> **注意**：OpenClaw 近期（v2026.3.2）加强了 `mediaLocalRoots` 安全校验。参见 issue [#20258] 和 [#36477]。

### 3.5 已确认技术细节 + 待确认问题

**已确认（通过逆向工程验证）：**

1. **Gateway 协议**：JSON-RPC 风格帧格式（`req`/`res`/`event`），protocol version 3，challenge-response 认证。完整协议参考存储在项目 memory 中
2. **Chat 事件 payload 结构**：`payload.message.content[]`（不是 `payload.content[]`）。content 是数组，支持 `text`、`thinking`、`toolCall` 三种 block 类型
3. **有效 Client ID/Mode**：Electron 使用 `client.id="gateway-client"` + `mode="backend"`。避免 `openclaw-control-ui`（会触发浏览器 origin 检查）
4. **广播过滤**：客户端侧按 sessionKey 过滤是当前可行方案（Gateway 暂无 session 级过滤计划）
5. **Gateway-Only 架构可行**：Gateway 单通道已能完成完整对话流 + 工具调用事件，无需 Channel Plugin 双通道

**待确认：**

1. ~~Gateway 协议细节~~ → 已逆向完整协议
2. **Session 自动重置禁用**：如何在服务端配置禁用 4:00 AM 自动重置
3. **WebSocket 重连后的 session 恢复**：断线重连后通过 `chat.history` RPC 可补齐历史消息
4. **`mediaLocalRoots` 配置**：ClawWork 场景下如何正确配置
5. ~~Channel Plugin 验证问题~~ → Gateway-Only 架构已绕过
6. ~~广播过滤~~ → 客户端侧过滤已实现

---

## 4. 界面设计

### 4.1 整体布局：三栏结构

```
┌─────────┬──────────────────────────┬──────────────────┐
│         │                          │                  │
│  Left   │      Main Area           │   Right Panel    │
│  Nav    │      (对话流)              │   (上下文)        │
│  (240px)│                          │   (320px)        │
│         │                          │                  │
│         │                          │                  │
│         │                          │                  │
│         │                          │                  │
│         │                          │                  │
│         │                          │                  │
│         │  ┌──────────────────┐    │                  │
│         │  │   输入框          │    │                  │
│         │  └──────────────────┘    │                  │
└─────────┴──────────────────────────┴──────────────────┘
```

### 4.2 左侧导航栏（Left Nav）

左侧导航栏是固定结构，不切换模式。文件浏览通过入口跳转到 Main Area 展示。

```
┌─────────────┐
│ [+ New Task] │   ← 新建 Task 按钮
│ [🔍 Search ] │   ← 全局搜索入口
│ [📁 Files  ] │   ← 文件存储入口（点击后 Main Area 切换为文件浏览器）
├─────────────┤
│              │
│ 最近 Tasks    │   ← 按时间倒序，最新的在最上面
│  ├ 重构用户模块│      当前选中 Task 高亮
│  ├ API文档生成 │      鼠标悬停显示创建时间和标签
│  ├ 数据迁移   │
│  └ ...       │
│              │
├─────────────┤
│ [⚙ Settings] │   ← 底部固定
└─────────────┘
```

- 顶部三个固定入口：New Task / Search / Files
- 下方是 Task 列表，按时间倒序，不分组（保持简单）
- 当前选中的 Task 高亮
- Task 列表项显示：标题 + 状态标签（active/completed）+ 最后更新时间

### 4.3 文件浏览器（Main Area 内展示）

点击左侧 [📁 Files] 后，Main Area 从对话流切换为文件浏览器全屏视图：

```
┌──────────────────────────────────────────────────┐
│ ← 返回                    文件浏览器                │  ← 顶部导航栏，← 返回到上一个 Task 对话
├──────────────────────────────────────────────────┤
│ [🔍 搜索文件名...                               ] │  ← 搜索栏
│                                                  │
│ [全部] [文档] [代码] [图片]                        │  ← 文件类型快速筛选 tab
├──────────────────────────────────────────────────┤
│                                                  │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│ │ 📄       │ │ 📝       │ │ 🖼       │          │
│ │schema-v2 │ │migration │ │screenshot│          │  ← 宫格列表
│ │.sql      │ │.sql      │ │.png      │          │     按生成时间倒序
│ │ 03-12    │ │ 03-12    │ │ 03-11    │          │     显示：图标 + 文件名 + 日期
│ │ 重构用户..│ │ 重构用户..│ │ API文档..│          │     底部显示所属 Task 名称
│ └──────────┘ └──────────┘ └──────────┘          │
│                                                  │
│ ┌──────────┐ ┌──────────┐                        │
│ │ 📄       │ │ 📄       │                        │  点击文件卡片：
│ │design    │ │api-spec  │                        │  → 跳转到对应 Task 的对话详情
│ │.md       │ │.yaml     │                        │     并高亮产生该文件的消息
│ │ 03-12    │ │ 03-11    │                        │
│ │ 重构用户..│ │ API文档..│                        │
│ └──────────┘ └──────────┘                        │
│                                                  │
└──────────────────────────────────────────────────┘
```

**设计说明**：文件浏览器占据整个 Main Area + Right Panel 的空间（此时右侧面板隐藏），因为宫格列表需要足够的横向空间来展示文件卡片。点击某个文件卡片后跳转回对应 Task 的对话视图。

### 4.4 中间主区域 — 对话流（Main Area 默认视图）

选中某个 Task 后显示完整的对话流：

```
┌──────────────────────────────┐
│ Task: 重构用户模块    [状态标签]  │  ← Task 标题栏
├──────────────────────────────┤
│                              │
│ 👤 帮我重构 user 模块的数据库    │  ← 用户消息
│    schema，需要支持多租户       │
│                              │
│ 🤖 好的，我来分析当前的 schema  │  ← AI 响应
│    ┌─ 工具调用 ─────────────┐ │     内嵌工具调用折叠块
│    │ 📂 读取 schema.sql     │ │
│    │ ✅ 完成                 │ │
│    └────────────────────────┘ │
│                              │
│    基于分析，建议如下方案：       │
│    [查看 schema-v2.sql →]    │  ← 产物内联链接
│                              │
│ 👤 用方案二，加上审计字段        │
│                              │
│ 🤖 已更新，新增 audit_log 表   │
│    [查看 schema-v2.sql →]    │
│    [查看 migration.sql →]    │
│                              │
├──────────────────────────────┤
│ ┌──────────────────────────┐ │
│ │ 输入消息...      [发送]   │ │  ← 输入框（支持 Shift+Enter 换行）
│ │              [📎] [⌘]   │ │     附件上传 / 快捷命令
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

### 4.5 右侧上下文面板（Right Panel）

仅在对话流视图下显示（文件浏览器视图时隐藏）。当前阶段保持精简，只有两个区块：

```
┌──────────────────┐
│ ▾ Progress       │  ← 任务进度追踪
│   ✅ 分析现有 Schema │
│   ✅ 设计多租户方案  │
│   🔄 生成迁移脚本   │  ← 进行中
│   ⬜ 编写测试用例   │
│                  │
│ ▾ Artifacts      │  ← 任务产物列表
│   📄 schema-v2.sql│  ← 点击可预览/用默认应用打开
│   📄 migration.sql│
│   📄 design.md   │
│                  │
└──────────────────┘
```

**两个区块的职责：**

- **Progress**：从 AI 响应中提取任务步骤。OpenClaw Agent 执行复杂任务时通常输出步骤列表或 todo，客户端解析这些结构化输出渲染为进度条。如果 AI 没有输出结构化步骤，此区块隐藏。
- **Artifacts**：当前 Task 的所有产物文件列表，按生成时间倒序。点击文件可预览（Markdown/代码内联预览，图片缩略图）或用系统默认应用打开。

**后续可扩展的区块**（不在 MVP 范围内）：Context（标签、创建时间等元信息）、Related Tasks（关联任务）、Agent Config（当前 Agent 配置信息）。

---

## 5. 开发计划（Vibe Coding 模式）

> **开发策略**：全程 Vibe Coding，任务拆分到单个 Agent session 可独立完成的粒度。多个无依赖任务可并行分配给不同 Agent。每个任务有明确的验收检查点（✅ Check），完成即可进入下一个。

### Phase 1：项目骨架 + OpenClaw 通信

**目标：跑通 "启动 App → 连上 OpenClaw → 发一条消息 → 收到回复" 的最小闭环**

#### 1.1 项目初始化（可并行）

- [x] **T1-0** 初始化 monorepo 骨架：pnpm workspace + `packages/shared` + `packages/desktop` + tsconfig.base.json
  - ✅ Check：`pnpm install` 成功，包互相引用类型不报错
- [x] **T1-1** `packages/desktop`：用 electron-vite 初始化 Electron 应用（React 19 + TS + Tailwind v4）
  - ✅ Check：`pnpm --filter @clawwork/desktop dev` 能启动空白 Electron 窗口
- [x] **T1-2** ~~`packages/channel-plugin`~~ (已在 Gateway-Only 重构中移除，代码保留但不参与构建)
- [x] **T1-3** `packages/shared`：定义 Gateway 协议类型 + Task/Message/Artifact 类型
  - ✅ Check：desktop 包能 import `@clawwork/shared` 的类型

#### 1.2 三栏布局骨架

- [x] **T1-4** 实现三栏布局组件（Left Nav 260px + Main Area flex + Right Panel 320px），可折叠右侧面板
  - ✅ Check：三栏响应式渲染，右侧面板可收起/展开
- [x] **T1-5** Left Nav：静态结构（New Task 按钮 + Search 入口 + Files 入口 + 空 Task 列表 + Settings 入口）
  - ✅ Check：所有按钮可点击，console.log 确认事件绑定

#### 1.3 OpenClaw 通信链路

- [x] **T1-7** Electron 主进程：WebSocket 客户端连接 OpenClaw Gateway（ws://127.0.0.1:18789），含 challenge-response 认证
  - ✅ Check：连接建立，心跳正常，断线自动重连
- [x] **T1-8** 实现消息发送：Electron → Gateway（chat.send），携带 sessionKey + idempotencyKey
  - ✅ Check：从 Electron DevTools console 手动发一条消息，OpenClaw Agent 能收到并回复
- [x] **T1-9** 实现消息接收 + sessionKey 路由：Gateway chat 事件通过 IPC 转发到 renderer，按 sessionKey 分发到对应 Task
  - ✅ Check：多个 sessionKey 的消息不会串台

**Phase 1 验收：能在 Electron 空白页面中通过代码与 OpenClaw Agent 完成一轮对话**

---

### Phase 2：核心 UI 交互

**目标：完整的 Task 对话体验，可以日常使用**

#### 2.1 Task 管理

- [x] **T2-1** New Task 流程：点击按钮 → 创建本地 Task 记录 → 自动设为 active → 跳转到对话视图
  - ✅ Check：新建 Task 后左侧列表出现新条目，Main Area 切换到空对话页
- [x] **T2-2** Task 列表渲染：按状态分组（Active → Completed → Archived），组内按创建时间倒序，当前选中高亮
  - ✅ Check：点击不同 Task 可切换 Main Area 显示的对话内容
- [x] **T2-3** Task 状态流转：active → completed → archived，右键菜单 ContextMenu 组件 + useTaskContextMenu hook
  - ✅ Check：状态变更后 UI 即时更新

#### 2.2 对话流组件

- [x] **T2-4** 消息渲染组件：支持 user / assistant / system 角色区分，Markdown 渲染（react-markdown + rehype-highlight）
  - ✅ Check：代码块有语法高亮，链接可点击
- [x] **T2-5** 输入框组件：支持 Shift+Enter 换行，Enter 发送，发送后清空，textarea 自动伸缩高度
  - ✅ Check：发送消息后 → Agent 回复 → 消息流自动滚动到底部
- [x] **T2-6** 流式响应渲染：Gateway chat 事件 delta 累加 + 光标闪烁动画
  - ✅ Check：长回复不是整块出现而是逐步渲染
- [x] **T2-7** 工具调用折叠块：AI 的 tool_use 渲染为可展开/折叠的卡片（工具名 + arguments + result）
  - ✅ Check：工具调用默认折叠，点击可展开看详情

#### 2.3 右侧面板

- [x] **T2-8** Progress 区块：解析 AI 响应中的 `- [x]`/`- [ ]` 模式，渲染为 checklist
  - ✅ Check：AI 输出 todo 列表时右侧自动出现进度条，无 todo 时区块隐藏
- [x] **T2-9** Artifacts 区块：当前 Task 的产物文件列表（从消息 artifacts 字段提取）
  - ✅ Check：Agent 生成文件后 Artifacts 列表自动更新

#### 2.4 多任务并行验证

- [ ] **T2-10** 同时开 3 个 active Task，在 A 等待回复时切到 B 发消息，验证不串台
  - ✅ Check：各 Task 消息流独立，左侧列表后台 Task 有新消息时显示未读标记

**Phase 2 验收：能像 Claude Cowork 一样多任务并行对话，右侧显示 Progress 和 Artifacts**

---

### Phase 3：产物管理 + 文件系统

**目标：产物自动落盘，全局文件浏览**

#### 3.1 产物落盘

- [x] **T3-1** Workspace 配置持久化：`app.getPath('userData')/clawwork-config.json`，Setup 引导页
  - ✅ Check：首次启动显示 Setup 引导，选择目录后配置写入 JSON
- [x] **T3-2** SQLite 数据库初始化：`better-sqlite3` + Drizzle ORM，tasks/messages/artifacts 表，DB 文件在 `<workspacePath>/.clawwork.db`（WAL 模式）
  - ✅ Check：DB 文件自动创建，Drizzle schema 与表结构一致
- [x] **T3-3** 产物落盘 + Git auto-commit：artifact 文件复制到 workspace task dir + SQLite insert + simple-git add/commit
  - ✅ Check：`git log` 能看到产物变更的 commit 记录

#### 3.2 文件浏览器

- [x] **T3-4** 文件浏览器 Main Area 视图：FileBrowser 布局，搜索栏 + 类型筛选 tab + 宫格列表，数据来自 IPC
  - ✅ Check：点击左侧 Files 入口 → Main Area 切换为文件浏览器，右侧面板隐藏
- [x] **T3-5** 文件卡片组件：FileCard，图标 + 文件名 + 日期 + 所属 Task 名称
  - ✅ Check：按生成时间倒序排列，文件类型筛选正常工作
- [x] **T3-6** 文件 → Task 跳转 + 文件预览：点击文件卡片跳转到对应 Task 对话详情，高亮产生该文件的消息（2s fade 动画）；FilePreview 组件支持 Markdown/代码/图片
  - ✅ Check：从文件浏览器跳转后，目标消息滚动到可视区域并有高亮动画
- [x] **T3-7** IPC 层：workspace/artifact/settings IPC handlers 完整实现
  - ✅ Check：所有 file browser 数据通过 IPC 获取，mock 数据已移除

**Phase 3 验收：产物自动保存到本地 Git Repo，文件浏览器可按类型筛选和搜索**

---

### Phase 3.5：Design System + UI 全面重构 + Premium Depth Pass

**目标：从原型级 UI 升级为产品级 UI，建立完整设计系统**

#### 3.5.1 Design System 基础设施

- [x] **T3.5-0** 安装依赖：framer-motion, cva, Radix UI 全家桶 (@radix-ui/react-collapsible, @radix-ui/react-dropdown-menu, @radix-ui/react-scroll-area, @radix-ui/react-tabs, @radix-ui/react-tooltip), @fontsource-variable/inter, @fontsource-variable/jetbrains-mono, clsx, tailwind-merge
  - ✅ Check：所有依赖安装成功，无版本冲突
- [x] **T3.5-1** 设计系统定义：`design-system.md` 规范文档 + `design-tokens.ts` TS 常量（colors, spacing, radius, typography, shadows, transitions, motion presets）+ shadcn/ui 基础组件（Button, ScrollArea, Collapsible, Tabs, DropdownMenu, Tooltip）
  - ✅ Check：所有 token 值在 TS 和 CSS 中保持一致

#### 3.5.2 基础层重构

- [x] **T3.5-2** theme.css 重写：字体 CSS @import, @layer base 包裹自定义样式, 扩展 CSS Variables（dark+light 双模式完整覆盖）
  - ✅ Check：无 unlayered 全局样式（避免覆盖 Tailwind utilities）

#### 3.5.3 组件重构（shadcn/ui + Framer Motion）

- [x] **T3.5-3** 全部业务组件用 shadcn/ui + motion 重写：ChatMessage (motion.div listItem), ChatInput (Button + motion), StreamingMessage (motion.div fadeIn), ToolCallCard (Radix Collapsible + AnimatePresence), FileCard (motion.button), FilePreview (ScrollArea)
  - ✅ Check：所有组件使用 cn() 合并 class，颜色通过 CSS Variables，动画使用 motion presets

#### 3.5.4 布局重构

- [x] **T3.5-4** 全部布局组件重写：LeftNav (TaskItem 提取为独立组件 + DropdownMenu 右键菜单 + Tooltip), MainArea (AnimatePresence 视图切换 + 欢迎屏), RightPanel (Tabs 组件), FileBrowser (AnimatePresence 预览), Settings, Setup, App.tsx (TooltipProvider 包裹)
  - ✅ Check：布局组件均使用 shadcn/ui 基础组件 + motion 动画

#### 3.5.5 清理 + 验证

- [x] **T3.5-5** 删除死代码：`useAgentMessages.ts`（已被 `useGatewayDispatcher.ts` 取代）
- [x] **T3.5-6** 验证通过：tsc --noEmit 零错误，dev server 正常启动，UI 截图确认渲染正确

#### 3.5.6 Visual Polish — Font/Size Bump

- [x] **T3.5-7** 全局尺寸调整（13 个文件）：基础字体 13→14px，avatar/icon/button 尺寸放大，圆角统一，section labels 用 text-xs 区分层级，Button danger variant 硬编码 hex → CSS Variables

#### 3.5.7 Visual Polish — Premium Depth Pass

- [x] **T3.5-8** Premium CSS Variables：12 个新 token（`--accent-hover`, `--accent-soft`, `--accent-soft-hover`, `--bg-elevated`, `--ring-accent`, `--glow-accent`, `--shadow-elevated`, `--shadow-card`, `--border-subtle`, `--danger`, `--danger-bg`），dark + light 双模式值
- [x] **T3.5-9** CSS utility classes：`.surface-elevated`, `.glow-accent`, `.ring-accent-focus` 在 `@layer base` 中定义
- [x] **T3.5-10** Button `soft` variant：`--accent-soft` 背景 + accent 文字（比 `default` 全填充柔和），ChatInput 发送按钮和 LeftNav "新任务"按钮使用
- [x] **T3.5-11** 所有 Button variants 增加 `active:scale-[0.98]` 按压反馈
- [x] **T3.5-12** ChatInput：`--bg-elevated` + `--shadow-elevated` + `ring-accent-focus` 焦点环
- [x] **T3.5-13** WelcomeScreen：radial glow behind logo + "AI-powered task execution" subtitle + typography hierarchy
- [x] **T3.5-14** TaskItem：active 状态左侧 3px accent bar + `whileHover={{ x: 2 }}` 微交互
- [x] **T3.5-15** ToolCallCard：左侧状态条（running=pulse, done=semi-transparent, error=red）+ shadow-card
- [x] **T3.5-16** tabs.tsx 尺寸调整：h-8→h-9, px-2.5→px-3, active 使用 `--bg-elevated` + `--shadow-card`
- [x] **T3.5-17** dropdown-menu.tsx：硬编码颜色 → CSS Variables (`--danger`, `--danger-bg`)，content 使用 `--bg-elevated` + `--shadow-elevated`
- [x] **T3.5-18** Setup 页面：radial glow + form 卡片容器

**Phase 3.5 验收：tsc --noEmit 零错误，dev server 正常启动，UI 截图确认 premium depth 效果**

---

### Phase 4：体验打磨 + 打包分发

**目标：可分发给他人使用的完整产品**

#### 4.1 体验优化

- [ ] **T4-1** 主题系统：dark / light 主题切换，CSS Variables + Tailwind v4
  - ✅ Check：Settings 中可切换主题，所有组件跟随变化
- [ ] **T4-2** 全局搜索：Task 标题 + 文件名 + 消息内容全文检索（SQLite FTS5）
  - ✅ Check：搜索结果点击可跳转到对应 Task 或文件
- [ ] **T4-3** Settings 页面：OpenClaw Server 地址配置 + Workspace 路径配置 + 主题切换
  - ✅ Check：修改 Server 地址后重连成功
- [ ] **T4-4** 错误处理 + 重连：WebSocket 断线提示、重连动画、离线状态展示
  - ✅ Check：拔网线 → 显示断线提示 → 恢复后自动重连

#### 4.2 打包分发

- [ ] **T4-5** electron-builder 配置：macOS dmg（Universal Binary：`--arch universal`）
  - ✅ Check：M 系列和 Intel Mac 都能安装运行
- [ ] **T4-6** 应用图标 + 启动画面 + 应用元信息（name/version/description）
  - ✅ Check：dmg 安装后应用图标正确，About 信息完整

**Phase 4 验收：生成 .dmg 文件，新用户安装后配置 OpenClaw 地址即可使用**

---

### 任务依赖图（Vibe Coding 并行指南）

```
Phase 1:
  T1-0 ──→ T1-1 ─────┐
           T1-3 ─────┘──→ T1-7 → T1-8 → T1-9
           T1-4 ─┬──→ （Phase 2 UI 任务依赖这两个）
           T1-5 ─┘

  T1-0 先行（monorepo 骨架，所有后续任务的前置）
  可并行组：[T1-1, T1-3] 同时开 2 个 Agent
           [T1-4, T1-5] 同时开 2 个 Agent（与上组无依赖也可并行）

Phase 2:
  T2-1 → T2-2 → T2-3（串行：Task CRUD 链路）
  T2-4 → T2-5 → T2-6 → T2-7（串行：对话流组件递进）
  T2-8 ─┐
  T2-9 ─┘ 可并行（右侧面板两个独立区块）
  T2-10 在所有 Phase 2 任务完成后做

  可并行组：[T2-1..T2-3] 和 [T2-4..T2-7] 两条线可同时推进
           [T2-8, T2-9] 可同时开 2 个 Agent

Phase 3:
  T3-1 → T3-2 → T3-3（串行：产物落盘链路）
  T3-4 → T3-5 → T3-6 → T3-7（串行：文件浏览器递进）

  可并行组：[T3-1..T3-3] 和 [T3-4..T3-7] 两条线可同时推进

Phase 4:
  [T4-1, T4-2, T4-3, T4-4] 全部可并行（4 个 Agent 同时开）
  T4-5 → T4-6（串行：打包链路）
```

---

## 6. 技术栈

### 6.1 Monorepo 项目结构

整个项目使用 pnpm workspace 管理的 monorepo，所有代码在一个仓库中：

```
clawwork/
├── package.json                 # workspace root
├── pnpm-workspace.yaml          # pnpm workspace 配置
├── tsconfig.base.json           # 共享 TS 配置 (ES2022, strict, bundler resolution)
│
├── packages/
│   ├── shared/                  # @clawwork/shared — 零依赖类型桥梁
│   │   ├── package.json
│   │   └── src/
│   │       ├── types.ts         # Task, Message, Artifact, ToolCall, ProgressStep
│   │       ├── protocol.ts      # WsMessage 联合类型 + type guards
│   │       ├── gateway-protocol.ts  # GatewayFrame 类型, GatewayConnectParams
│   │       ├── constants.ts     # 端口号, buildSessionKey(), parseTaskIdFromSessionKey()
│   │       └── index.ts         # barrel export
│   │
│   ├── channel-plugin/          # (已从 workspace 排除，代码保留但不参与构建)
│   │
│   └── desktop/                 # @clawwork/desktop — Electron 桌面应用
│       ├── package.json
│       ├── electron.vite.config.ts
│       └── src/
│           ├── main/            # Electron 主进程
│           │   ├── index.ts     # hiddenInset titleBar, 自动截图
│           │   ├── ws/
│           │   │   ├── gateway-client.ts  # GatewayClient: challenge-response auth, heartbeat, reconnect
│           │   │   ├── window-utils.ts    # BrowserWindow 辅助工具
│           │   │   └── index.ts           # initWebSockets, getters, destroy
│           │   └── ipc/
│           │       └── ws-handlers.ts     # IPC handlers
│           ├── preload/
│           │   ├── index.ts     # buildApi() factory, contextBridge
│           │   └── clawwork.d.ts
│           └── renderer/        # React 渲染进程
│               ├── App.tsx      # 三栏布局 (260px | flex | 320px)
│               ├── stores/      # Zustand stores (taskStore, messageStore, uiStore)
│               ├── styles/      # theme.css + design-tokens.ts
│               ├── lib/         # utils.ts, session-sync.ts
│               ├── components/  # ChatMessage, ChatInput, StreamingMessage, ToolCallCard, FileCard, FilePreview
│               │   └── ui/      # shadcn/ui 基础组件
│               ├── hooks/       # useGatewayDispatcher, useTheme
│               └── layouts/     # LeftNav/, MainArea/, RightPanel/, FileBrowser/, Settings/, Setup/
```

**`pnpm-workspace.yaml`：**

```yaml
packages:
  - 'packages/shared'
  - 'packages/desktop'
```

**包间依赖关系：**

```
@clawwork/shared ← @clawwork/desktop
```

`@clawwork/shared` 是类型桥梁，定义 Gateway 通信的类型和 Desktop 使用的数据模型。`composite: true` + `references` 确保跨包类型安全。

**常用开发命令：**

```bash
# 安装所有依赖
pnpm install

# 开发 Desktop App（热更新）
pnpm --filter @clawwork/desktop dev

# 类型检查（tsc 只在 desktop/node_modules 下）
packages/desktop/node_modules/.bin/tsc -b packages/shared/tsconfig.json
packages/desktop/node_modules/.bin/tsc --noEmit -p packages/desktop/tsconfig.json

# 打包
pnpm --filter @clawwork/desktop build
```

### 6.2 技术栈总览

```
clawwork (pnpm monorepo)
├── @clawwork/shared            # 共享类型 + 协议定义
│   └── TypeScript 5.x
├── @clawwork/desktop            # Electron 桌面应用
│   ├── 渲染进程
│   │   ├── React 19 + TypeScript 5.x
│   │   ├── Zustand 5（状态管理：taskStore, messageStore, uiStore）
│   │   ├── shadcn/ui (Radix UI + cva + tailwind-merge)
│   │   ├── Framer Motion（动画）
│   │   ├── Tailwind CSS v4 + CSS Variables（主题）
│   │   └── react-markdown + rehype-highlight（Markdown 渲染）
│   ├── 主进程
│   │   ├── ws/（GatewayClient → Gateway :18789）
│   │   ├── better-sqlite3 + Drizzle ORM
│   │   └── simple-git
│   ├── 构建：Vite 6 + electron-vite 3
│   └── 打包：electron-builder（macOS Universal Binary）
└── 工具链
    ├── pnpm 10 workspace（monorepo 管理）
    ├── lucide-react（图标）
    └── Inter Variable + JetBrains Mono（字体）
```

### 6.3 UI 组件选型

- **shadcn/ui** — headless 组件，不锁定样式
- **lucide-react** — 图标
- **@tanstack/react-virtual** — 长消息列表虚拟滚动
- **react-markdown + rehype-highlight** — 消息中的 Markdown 和代码高亮渲染

### 6.4 主题系统

```css
:root[data-theme="dark"] {
  --bg-primary: #1C1C1C;
  --bg-secondary: #242424;
  --bg-tertiary: #2A2A2A;
  --accent: #0FFD0D;
  --text-primary: #F3F4F4;
  --text-secondary: #9CA3AF;
  --border: rgba(255, 255, 255, 0.08);
  --border-accent: rgba(15, 253, 93, 0.15);
}

:root[data-theme="light"] {
  --bg-primary: #FAFAFA;
  --bg-secondary: #FFFFFF;
  --bg-tertiary: #F3F4F6;
  --accent: #0B8A0A;
  --text-primary: #111827;
  --text-secondary: #6B7280;
  --border: rgba(0, 0, 0, 0.08);
  --border-accent: rgba(11, 138, 10, 0.15);
}
```

---

## 7. 关键设计决策记录

### ADR-001：为什么走 Gateway-Only 而不是 Channel Plugin

**决策**：通过 Gateway WebSocket 直连实现完整对话流，不使用 Channel Plugin 双通道。

**原因**：
- Gateway 单通道已能完成完整对话（`chat.send` + `chat`/`agent` events），无需额外 Plugin 层
- 减少一个进程间通信通道，降低架构复杂度和排障成本
- 避免 Channel Plugin 校验 bug（[#12484]）和配置复杂度
- `deliver: false` 参数确保消息不走外部渠道，只通过 Gateway 事件回传

**历史**：
- 早期设计了 Channel Plugin 双通道架构（Plugin 运行在 OpenClaw 内部，通过 :13579 WS 与 Desktop 通信）
- 实现过程中发现 Gateway 单通道已够用，在 Gateway-Only 重构（G1-G9）中移除了 Plugin 依赖
- `packages/channel-plugin` 代码保留但已从 workspace 排除

### ADR-002：为什么用 Git Repo 而不是纯 SQLite

**决策**：文件系统 + SQLite 索引 + Git 版本化。

**原因**：
- 产物文件（代码、文档、图片）天然适合文件系统存储，SQLite 存 blob 不合适
- Git 提供免费的版本追溯能力，用户可以看到每个 Task 的产物变更历史
- 未来如果需要多设备同步，git remote 是现成的基础设施
- SQLite 只做索引和全文搜索，保持轻量

**取舍**：
- Git 不适合存储大型二进制文件（>100MB 的图片/视频）。如果未来需要支持大文件，考虑引入 git-lfs 或单独的文件存储策略
- 自动 commit 会让 git history 很多，需要定期 gc 或限制保留时间

### ADR-003：为什么是 Electron 而非 Tauri

**决策**：使用 Electron。

**原因**：
- OpenClaw 本身是 TypeScript 生态，Electron 技术栈一致
- shadcn/ui、React 生态成熟，组件复用性高
- Electron 的 node 集成让 SQLite、git 操作、文件系统访问更直接
- 对于需要重度 UI 交互的三栏布局应用，Electron 的 Chromium 渲染引擎更稳定

**取舍**：
- 包体积较大（~150MB），Tauri 会小很多
- 内存占用较高，但对于桌面开发工具场景可接受

---

## 8. 风险与待确认项

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| OpenClaw Gateway 协议文档不完整 | 阻塞 Phase 1 | 先读源码，参考 feishu plugin 实现反推 |
| Gateway 广播所有 session 事件 [#32579] | 客户端收到无关 session 的消息，增加过滤开销 | 客户端侧按 sessionKey 过滤，性能影响可控 |
| `mediaLocalRoots` 安全校验 [#20258] [#36477] | 文件发送被拒绝 | 正确配置 mediaLocalRoots 参数 |
| Session 4AM 自动重置 | 长期 Task 对话上下文被清空 | 服务端配置禁用自动重置 |
| Git auto-commit 性能 | 大量小文件时 commit 慢 | 批量 commit + debounce |
| macOS 签名和公证 | 用户无法安装 | Phase 4 处理，开发阶段用 ad-hoc 签名 |

---

## 9. 附录：参考资源

**官方文档：**
- OpenClaw 主仓库：https://github.com/openclaw/openclaw
- OpenClaw Channel 文档：https://docs.openclaw.ai/cli/channels
- Gateway 协议：https://docs.openclaw.ai/gateway/protocol
- Session 管理：https://docs.openclaw.ai/concepts/session
- Session 压缩与持久化：https://docs.openclaw.ai/reference/session-management-compaction
- 命令队列系统：https://docs.openclaw.ai/concepts/queue

**Channel Plugin 参考实现（历史参考）：**
- 飞书 Plugin：https://github.com/xzq-xu/openclaw-plugin-feishu
- DingTalk Plugin：https://github.com/soimy/openclaw-channel-dingtalk
- Channel Plugin 开发指南：https://zread.ai/openclaw/openclaw/16-channel-plugin-development

**已知 Issue（需跟进）：**
- sendMedia mediaLocalRoots：https://github.com/openclaw/openclaw/issues/20258
- Slack mediaLocalRoots 回归：https://github.com/openclaw/openclaw/issues/36477
- Gateway 广播无 session 过滤：https://github.com/openclaw/openclaw/issues/32579
