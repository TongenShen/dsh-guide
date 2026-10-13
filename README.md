# DSH 指南

> **免责声明**
>
> 本仓库是个人学习整理，**非 DeepSeek 官方文档**。内容基于对已安装应用的
> `app.asar` 做静态分析得出，仅供技术研究与学习参考，可能与实际行为存在偏差。
> DeepSeek Harness 为闭源商业产品，相关商标与版权归 DeepSeek 所有。
> 如需权威说明，请以官方文档为准。

DeepSeek Harness（DSH）内部机制说明。基于对本机 `app.asar` 的实测调查整理，
不是官方文档的转述——所有结论都标注了代码位置，可以复核。

**对应版本**：`@deepseek-ai/dsh-base@0.2.0-rc.2`
**整理时间**：2026-10

---

## 环境事实

| 项 | 值 |
|---|---|
| 应用根 | `C:\Users\<用户名>\AppData\Local\Programs\DeepSeek Harness\` |
| 代码包（只读） | `resources\app.asar`（约 121 MB，11470 个文件） |
| 原生模块（已解包） | `resources\app.asar.unpacked\dsh\node_modules\` |
| 运行时/内置技能 | `resources\runtime\`（含 `office-skills\`） |
| 配置根 `$DSH_HOME` | `C:\Users\<用户名>\.dsh` |
| 当前 profile | `desktop` → `~/.dsh/profiles/desktop/` |
| 当前 preset | `standard` |
| 会话工作区 | `C:\Users\<用户名>\Desktop\code` |

> asar 是归档格式，里面的路径（如 `dsh/node_modules/@deepseek-ai/...`）不是真实磁盘路径。
> 要读它得用 `tools/` 里的脚本提取，见 [06-调查工具与方法.md](06-调查工具与方法.md)。

---

## 一页速查

### 当前能约束模型行为的文件（5 个）

| 文件 | 作用 | 状态 |
|---|---|---|
| `~/.dsh/AGENTS.md` | 用户全局指令，每会话必读 | ✅ 在用 |
| `~/.dsh/profiles/desktop/cordis.patch.yml` | **权威配置层**：模型、persona、MCP、hooks、工具开关 | ✅ 存在 |
| `~/.dsh/profiles/desktop/package.json` | bundle 列表（`dsh.profile.bundles`） | ✅ |
| `~/.dsh/profiles/desktop/cordis.yml` | 空根，别改 | ✅ |
| `<ws>/dsh-peakvalley/cordis.patch.yml` | 自建 bundle 的 patch | ✅ 仅 UI |

### 可用但当前未建的位置

| 位置 | 用途 |
|---|---|
| `<projectRoot>/.dsh/skills/`、`<ws>/.agents/skills/` | 项目级技能（rank 100/200） |
| `~/.dsh/skills/`、`~/.agents/skills/` | 用户级技能（rank 400/500） |
| `<projectRoot>/AGENTS.md`、`CLAUDE.md`、`*.local.md` | 项目级指令（4 个候选名，逐层） |
| `~/.dsh/cordis.patch.yml` | home 层 patch，**优先级高于 profile 层** |
| `.claude/hooks.json`、`.codex/hooks.json` | 外部 hooks（需先手动挂载桥接插件） |

### 上下文注入的来源分类

| 来源 | 内容 | 是文件吗 |
|---|---|---|
| **JS 硬编码** | harness identity、各工具指导段、subagent 委派声明、`@` 语法说明 | ❌ |
| **YAML 配置** | persona prefix/suffix、plan-mode 长文 | ✅ `cordis.patch.yml` |
| **运行时拼接** | harness 源码路径、Web GUI URL、沙箱/审批策略 | ❌ |
| **磁盘文件** | AGENTS.md 指令、SKILL.md 摘要 | ✅ |

**结论：系统提示词没有"正文文件"**，是 31 个 section 槽位 + 3 个 runtime context 槽位现拼的。

---

## 文档索引

| 文档 | 内容 |
|---|---|
| [01-架构与加载顺序.md](01-架构与加载顺序.md) | DSH 三层结构、bundle/patch 加载顺序、94 个 base 插件 |
| [02-上下文注入全图.md](02-上下文注入全图.md) | 什么进模型、从哪来；系统提示词 31 槽位全表；零注入插件 |
| [03-可约束模型的文件.md](03-可约束模型的文件.md) | AGENTS.md / SKILL.md / hooks 的发现规则与格式 |
| [04-配置层与优先级.md](04-配置层与优先级.md) | 4 层 patch、格式规范、两个坑 |
| [05-hooks与MCP.md](05-hooks与MCP.md) | Claude Code / Codex hooks 协议、MCP 配置与注入 |
| [06-调查工具与方法.md](06-调查工具与方法.md) | asar 解析脚本用法、常用调查套路、关键包索引 |
| [tools/](tools/) | 4 个可直接运行的 asar 调查脚本 |

---

## 维护本指南

当 DSH 升级后，用 `tools/` 下的脚本重新核对关键事实：

```powershell
$asar = 'C:\Users\<用户名>\AppData\Local\Programs\DeepSeek Harness\resources\app.asar'

# 核对 bundle 插件清单
node tools/asar-extract.mjs $asar 'dsh/node_modules/@deepseek-ai/dsh-base/cordis.patch.yml' 'base.yml'

# 核对系统提示词槽位
node tools/asar-extract.mjs $asar 'dsh/node_modules/@deepseek-ai/dsh-system-prompt/lib/index.js' 'sysprompt.js'

# 核对指令文件候选名
node tools/asar-grep-all.mjs $asar 'AGENTS\.md'
```

版本变了（`app.asar` 里的 `package.json` 的 `version` 字段）就该重新核对一遍，
并更新本文件顶部的「对应版本」。
