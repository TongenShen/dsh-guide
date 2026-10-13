# 05 · hooks 与 MCP

## 先说结论：两者都是 opt-in

`dsh-hooks-claude-code`、`dsh-hooks-codex`、`dsh-mcp-client` **都没有被任何 bundle 挂载**。

证据：`dsh-base/cordis.patch.yml`（529 行）和 `dsh-web-app/cordis.patch.yml`（565 行）里，
grep `hooks|mcp` 只命中 `mcp-resources`（base:88 行）——那是**读取** MCP 资源的工具，
不是连接服务器。用户自己的 `dsh-peakvalley/cordis.patch.yml` 只有 3 行，纯 UI。

**装了 DSH ≠ 有 hooks 和 MCP**。要自己在 `cordis.patch.yml` 里写条目。

---

## 一、Claude Code hooks

### 挂载

```yaml
- insert:
    - id: my-claude-hooks
      name: '@deepseek-ai/dsh-hooks-claude-code'
      config:
        configPath: ./.claude/hooks.json      # 必填
        pluginRoot: ./.claude/plugins/my-plugin   # 可选
        projectDir: .                         # 可选，默认会话工作区
```

| 字段 | 默认 | 含义 |
|---|---|---|
| `configPath` | 必填 | `hooks.json`，或含 `hooks` 键的 settings 文件 |
| `pluginRoot` | — | 替换命令里的 `${CLAUDE_PLUGIN_ROOT}` |
| `projectDir` | 会话工作区 | 替换 `${CLAUDE_PROJECT_DIR}` 并设同名环境变量 |
| `defaultTimeoutMs` | `600000` | 每个 hook 的超时 |
| `stderrSummaryMaxChars` | `500` | stderr 摘要上限 |

**一个进程只读一次**，相对路径从**启动进程的目录**解析（不是会话 cwd）。

### 配置格式

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "my-check.sh", "timeout": 5000 }
        ]
      }
    ]
  }
}
```

也接受裸事件映射（省略外层 `hooks` 键）。

### 支持的 7 个事件

| 事件 | 时机 | 能做什么 |
|---|---|---|
| `SessionStart` | 会话开始 | 附加模型可见的上下文 |
| `UserPromptSubmit` | 收到提示词 | **阻塞提示词**，或附加上下文 |
| `PreToolUse` | 工具运行前 | **阻塞工具**，或请求批准 |
| `PostToolUse` | 工具运行后 | 带反馈阻塞结果，或附加上下文 |
| `Stop` | 即将停止 | **强制再执行一步** |
| `SubagentStart` | 子 agent 启动 | 附加上下文（仅同进程） |
| `SubagentStop` | 子 agent 结束 | 只观测 |

### 输出协议

| 情况 | 行为 |
|---|---|
| exit code `2` | block，stderr 成为 reason |
| exit `0` + stdout 以 `{` 开头 | 解析 JSON |
| 其他 | 忽略 |

JSON 字段：

- 顶层 `decision` **只接受** `approve` / `block`
- `allow` / `deny` / `ask` 只在 `hookSpecificOutput.permissionDecision`
- 认得的字段：`continue`、`stopReason`、`systemMessage`、`decision`、`reason`、
  `hookSpecificOutput.{hookEventName, permissionDecision, permissionDecisionReason, additionalContext, updatedInput}`

**多个 hook 的折叠规则**：`deny > ask > allow`，按配置顺序串行执行。

**不生效的字段**：
- `updatedInput` —— 只 warn，不应用
- `systemMessage` —— 只 warn，对模型不可见

### 决策映射

| 事件 + 输出 | 效果 |
|---|---|
| `PreToolUse` + deny | `{kind:"deny", reason}` 工具被阻止 |
| `PreToolUse` + ask | `{kind:"ask"}` 请求批准 |
| `UserPromptSubmit` + deny | `{kind:"reject"}` 整轮被拒 |
| `PostToolUse` + deny | `{kind:"block", feedback}` 结果被替换 |
| `Stop` + deny | `agent.steer()` 强制再走一轮 |
| 任意 + `additionalContext` | 注入一条 user 消息 |

---

## 二、Codex hooks

挂载方式相同（`configPath`），格式相同。**只有 5 个事件**：
`PreToolUse`、`PostToolUse`、`SessionStart`、`UserPromptSubmit`、`Stop`。

与 Claude 版的差异：

| 项 | Claude 版 | Codex 版 |
|---|---|---|
| `async: true` | 支持 | **跳过** |
| 命令替换 / 环境注入 | 有 | 无 |
| `ask` 决策 | 有 | **无**，只有 deny |
| 纯 stdout | 不直接当上下文 | `SessionStart`/`UserPromptSubmit` 的纯 stdout **直接当上下文** |
| payload | camelCase | snake_case，无尾换行，含 `model`/`permission_mode`/`turn_id` |
| 超时字段 | `timeout` | `timeout` 或 `timeoutSec` 都接受 |

```yaml
- insert:
    - id: my-codex-hooks
      name: '@deepseek-ai/dsh-hooks-codex'
      config:
        configPath: ./.codex/hooks.json
        model: deepseek-v4
```

---

## 三、MCP

### 没有独立的 mcp.json

全 asar 搜索 `mcpServers` / `mcp.json` / `claude_desktop_config` 只命中 `dsh-acp`（ACP 协议用）
和 mcp-client 自己。**配置就在 `cordis.patch.yml` 里，一个插件实例连一个服务器。**

### 配置 union

```yaml
# stdio
- insert:
    - id: mcp-filesystem
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        transport: stdio
        serverName: filesystem
        command: npx
        args: ['-y', '@modelcontextprotocol/server-filesystem', 'C:\data']
        env: {}
        cwd: .
        toolCallTimeoutMs: 60000
        failOnStartupError: false
        maxInstructionBytes: 32768
        reconnect:
          enabled: true

# streamable-http
- insert:
    - id: mcp-remote
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        transport: streamable-http
        serverName: remote
        url: https://example.com/mcp
        headers:
          Authorization: Bearer xxx
```

| 约束 | 值 |
|---|---|
| `serverName` 正则 | `/^[A-Za-z0-9_-]{1,32}$/` |
| `maxInstructionBytes` | 默认 32768 |
| 重连退避 | 500 ms 起，逐次翻倍，上限 30 s |
| 连续失败上限 | 10 次后移除该服务器的工具，停止重连 |
| 同名服务器 | 后加载的一条会**明确报错** |

### 注入三样东西

| 注入 | 形态 |
|---|---|
| **工具** | `mcp__<serverName>__<rawName>`，截断时追加 12 位 SHA-256 |
| **服务器 instructions** | system prompt section `mcp:${server}`（order 3100），字面文本不插值 |
| **资源** | `mcpResources.register()` |

### 资源不是自动进上下文的

`dsh-mcp-resources`（**这个已默认挂载**，base 第 88 行）注册 3 个工具：

- `list_mcp_resources`
- `list_mcp_resource_templates`
- `read_mcp_resource`

外加一个列出可用服务器名的 prompt section。**模型得主动调工具去读资源。**

### 子进程环境清洗

MCP 子进程的环境以 `scrubbedParentEnv()` 为基座：
删除匹配 `/KEY|PASSWORD|SECRET|TOKEN/i` 的变量名和所有 `DSH_*`，再合并配置里的 `env`。

---

## 四、其他"看着像但没挂载"的插件

| 插件 | 状态 |
|---|---|
| `dsh-time-context` | 未挂载（README 明说随附 Web 组合不含该行） |
| `dsh-tmux-context` | 未挂载（README 明说不包含在随附 profile 中） |
| `dsh-invariants` | base **刻意省略** |
| `dsh-tool-ralph` | 行存在但 `disabled: true` |
| `dsh-skill-badge` | `disabled: true` |
| `dsh-experimental-*` | 都是可选 bundle，需显式加载 |
