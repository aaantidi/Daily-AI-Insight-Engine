# CLAUDE.md — 项目宪法 (Project Constitution)

> **生成时间**：2026-06-01
> **适用环境**：Claude Code v2.1.159+
> **法律效力**：本文件为项目最高行为准则。所有 Agent（主/子）必须无条件遵守。

---

## §0 编排协议（最高优先级，不可覆盖）

### 角色定义

| 角色 | 身份 | 职责边界 |
|------|------|----------|
| **主 Agent (Conductor)** | 指挥/编排者 | 宏观架构规划、Spec 对齐审查、读文件、运行测试、调度 Workflow |
| **子 Agent (Coder)** | 编码执行者 | 编写 `src/`、`tests/`、`.specs/feature/*.md` 的具体实现 |
| **子 Agent (Reviewer)** | 代码审查员 | 代码级深度审查与重构 (Auto-CR) |

### 强制委派表

| 动作 | 主 Agent | Sub-Agent (Coder) | Sub-Agent (Reviewer) |
|------|:--:|:--:|:--:|
| 写 `src/` 下的代码文件 | ❌ | ✅ | ❌ |
| 写 `tests/` 下的测试文件 | ❌ | ✅ | ❌ |
| 写 `.specs/feature/spec.md` | ❌ | ✅ | ❌ |
| 写 `.specs/feature/plan.md` | ❌ | ✅ | ❌ |
| 写 `.specs/feature/tasks.md` | ❌ | ✅ | ❌ |
| 代码级深度审查与重构 (Auto-CR) | ❌ | ❌ | ✅ (由 Workflow 唤醒) |
| 宏观架构规划与 Spec 对齐审查 | ✅ (需人类拍板) | ❌ | ❌ |
| 读文件 / 运行测试 / 调 Workflow | ✅ | ❌ | ❌ |
| 编排 TDD 闭环流程 | ✅ | ❌ | ❌ |

### 强制委派流程

涉及具体文件的生成与修改，主 Agent **必须 spawn 子代理**，严禁使用 Edit/Write/NotebookEdit 直接写入代码目录。违反此规则将被 PreToolUse Hook 物理拦截。

---

## §1 五阶段开发流水线规范 (Human-in-the-Loop)

开发任何新需求，必须严格遵循以下阶段。**严禁跨阶段擅自执行，严禁合并或省略中间文件。**

### Phase 1 — 宪法 (Constitution) 与设计（人类主导）
- 主 Agent 协助将复杂需求拆解为独立功能子树。
- **🛑 断点：完成后必须停止并等待人类确认。**

### Phase 2 — 规格定义 (Specify)（委派子代理）
- 在 `.specs/feature/` 下生成 `spec.md`。
- 必须包含：用户故事、带有 `- [ ]` 的验收标准、边界约束。

### Phase 3 — 技术规划 (Plan) 与 任务拆解 (Tasks)
- 基于 spec.md，在 `.specs/feature/` 目录下**强制生成**对应的：
  - `plan.md`（技术实现规划）
  - `tasks.md`（任务拆解 Checklist）
- **🛑 断点：生成完毕后，主 Agent 必须暂停，询问人类是否开始实施。**

### Phase 4 — 分步执行 (Implement)（TDD 闭环）
- 获得人类同意后进入 TDD：
  1. **TDD-RED**：委派子代理根据 spec 写 `tests/` 下的测试文件
  2. **TDD-GREEN**：委派子代理写 `src/` 下的实现代码
  3. **TDD-REFACTOR**：通过 `/workflow tdd-cycle` 触发自动审查与重构

### 严禁行为
- ❌ 跳过 Phase 2/3 直接写代码
- ❌ 合并 spec.md / plan.md / tasks.md 为单一文件
- ❌ 在未获人类同意的情况下从 Phase 3 进入 Phase 4
- ❌ 绕过子代理直接修改 src/ 或 tests/

---

## §2 异常接管与重构规则

### TDD 失败处理
- 看到 `🚨 [TDD] Tests FAILED` 告警时，**严禁主 Agent 自行尝试修复**。
- 必须立即停止并提示人类运行：`/workflow tdd-cycle`

### 代码重构 (Refactoring)
- 代码变绿后，重构必须交给 `/workflow tdd-cycle` 里的 **Reviewer 子代理** 完成。
- 主 Agent 不得自行重构。

### 回滚策略
```bash
git reset --hard && git clean -fd
```
- 当重构导致测试失败时，Workflow 自动执行回滚至最近的 `AUTO-CR-BACKUP-*` 标签。

---

## §3 目录黑名单与隔离

以下目录被排除在 Agent 探索范围之外，防止 Token 浪费与配置污染：

```
.specs/
.claude/hooks/
.claude/workflows/
.claude/runtime/
```

- `.gitignore` 和 `.claudeignore` 已同步配置排除规则。
- 主 Agent 在执行 Glob/Grep 搜索时，应避免扫描上述目录。

---

## §4 工具使用约束

- 主 Agent 的工具集受限：禁止使用 `Edit`、`Write`、`NotebookEdit` 写入代码目录。
- Hook 引擎 (`pre-tool.sh`) 在 PreToolUse 阶段物理拦截违规写入。
- 紧急绕过：设置 `CLAUDE_TDD_BYPASS=1` 环境变量可放行所有写入（仅限调试场景）。
