你现在是一位资深的全栈自动化架构师。请在当前目录中，自主运行命令和创建文件，从零搭建一个基于 Claude Code 官方 Hook 规范与原生 Workflow 沙箱 API 的"SDD + TDD + Auto CR"全自动开发脚手架。

**支持环境**：跨平台 (Linux/macOS/Windows)。
**核心原则**：声明式构建，零 API 幻觉。严禁询问业务需求，构建完毕后对照文末清单自检，然后直接退出。

请严格遵守下方定义的"沙箱边界"与"系统级约束"，自主生成以下工程模块：

## 阶段 0：环境深度预检与依赖诊断
1. **路径初始化**：首先执行 `mkdir -p .claude/runtime .claude/hooks` 建立基础物理路径。
2. **深度环境诊断**：
   - 检测 `node` 运行版本（必须 $\ge 18.0.0$），检测 `npm`、`npx` 与 `git` 可用性。
   - 检测 `git` 仓库状态：若当前已是 Git 仓库，必须运行 `git status --porcelain` 检查是否有未提交的代码，若有则输出红色警告并终止搭建，以防污染用户当前工作区。
   - 检查 `claude` 命令行工具是否存在（以便后续运行诊断）。
   - 将所有检测结果和版本指标写入持久化诊断报告 `.claude/runtime/env_diagnostics.log`。
3. **参数自适应分析**：
   - 自动运行 `claude --help`，动态分析当前版本中限制执行步数的 Flag（如 `--max-turns` 或 `--max-steps`）以及限制工具的 Flag（如 `--allowedTools` 或 `--tools`）。
   - 将分析出的标志和参数值写入 `.claude/runtime/cli_config.sh`：
     ```bash
     export CLAUDE_MAX_FLAG="<检测到的轮次标志>"
     export CLAUDE_MAX_VALUE="3"
     export CLAUDE_TOOLS_FLAG="<检测到的工具标志>"
     export CLAUDE_TOOLS_VALUE="Read,Write,Bash"
     ```
4. **跨平台换行符**：创建 `.gitattributes`，强制统一换行符以防 Windows CRLF 导致 Shell 脚本崩溃：
   ```text
   * text=auto
   *.sh text eol=lf
   *.js text eol=lf
   *.json text eol=lf
   *.md text eol=lf
   ```

## 阶段 1：项目骨架与项目宪法 (`CLAUDE.md`)
1. **配置开发环境**：
   - 初始化 `npm init -y` 并安装 `jest`, `ts-jest`, `typescript`, `@types/jest` 等开发依赖。
   - 生成标准的 `tsconfig.json`（目标 ES2020，启用严格模式，指定 `src` 为根目录）。其必须包含 `"types": ["jest"]`、`"isolatedModules": true`，且 **exclude 不得包含 `"tests"`**。
   - 生成 `jest.config.js`，确保 ts-jest 配置 `isolatedModules: true`，及 `moduleNameMapper: { '^(.+)\\.js$': '$1' }` 解决 NodeNext 扩展名报错。
2. **参数化 Prompt 注册表**：创建 `.specs/prompts/registry.json`，包含四个模板：`tdd-fix`（修复）、`tdd-review`（审查）、`tdd-spec-gen`（生成测试）、`tdd-abort`（中止告警）。
3. **自动生成项目宪法 (`CLAUDE.md`)**：必须在根目录生成该文件，内容必须明确以下 AI 开发约束：

   ### §0 编排协议（最高优先级，不可覆盖）
   - **角色定义**：主 Agent 是 **指挥（Conductor）**，不是 **编码者（Coder）**，也不是 **代码审查员（Code Reviewer）**。
   - **强制委派表**：
     | 动作 | 主 Agent | Sub-Agent |
     |------|:--:|:--:|
     | 写 `src/`、`tests/`、`spec.md` | ❌ | ✅ |
     | 代码级深度审查与重构 (Auto-CR) | ❌ | ✅ (由 Workflow 唤醒) |
     | 宏观架构规划与 Spec 对齐审查 | ✅ (需人类拍板) | ❌ |
     | 读文件 / 运行测试 / 调 Workflow | ✅ | ❌ |
   - **强制委派流程**：涉及具体文件的生成修改，主 Agent 必须 spawn 子代理。

   ### §1 五阶段开发流水线规范 (Human-in-the-Loop)
   开发任何新需求，必须严格遵循以下阶段，**严禁跨阶段擅自执行，严禁合并或省略中间文件**：
   - **Phase 1 — 宪法 (Constitution) 与设计（人类主导）**：
     主 Agent 协助将复杂需求拆解为独立功能子树。**完成后必须停止并等待人类确认。**
   - **Phase 2 — 规格定义 (Specify)（委派子代理）**：
     在 `.specs/feature/` 下生成 `spec.md`。包含：用户故事、带有 `- [ ]` 的验收标准、边界约束。
   - **Phase 3 — 技术规划 (Plan) 与 任务拆解 (Tasks)**：
     基于 spec.md，在 `.specs/feature/` 目录下必须强制生成对应的 `plan.md`（技术实现规划）与 `tasks.md`（任务拆解 Checklist）。**生成完毕后，主 Agent 必须暂停，询问人类是否开始实施。**
   - **Phase 4 — 分步执行 (Implement)（TDD 闭环）**：
     获得人类同意后进入 TDD：根据 spec 委派子代理写 `tests/`（TDD-RED），保存后再委派子代理写 `src/`（TDD-GREEN）。

   ### §2 异常接管与重构规则
   - 看到 `🚨 [TDD] Tests FAILED` 告警时，**严禁主 Agent 自行尝试修复**，必须立即停止并提示人类运行 `/workflow tdd-cycle`。
   - 代码变绿后，代码重构（Refactoring）必须交给 `/workflow tdd-cycle` 里的 Review 子代理完成。
   - 回滚策略：`git reset --hard && git clean -fd`

   ### §3 目录黑名单与隔离
   - 创建 `.claudeignore` 和 `.gitignore`，写入 `.specs/`、`.claude/hooks/`、`.claude/workflows/`、`.claude/runtime/`。

## 阶段 2：响应式 Hook 引擎 (Signal-Writer 物理防抖 + Stop 轮次触发)
1. **配置 `settings.json`**：
   - 在 `.claude/settings.json` 中配置挂载。由你（AI）自主根据当前 CLI 的最新规范编写（包含 matcher, hooks 数组及 type/command 的正确嵌套）。
   - `PreToolUse`：挂载 `.claude/hooks/pre-tool.sh`。
   - `Stop`：挂载 `.claude/hooks/signal-writer.sh`（当对话轮次结束、主 Agent 交还控制权时触发测试）。
   - **自愈准备**：你无需担心硬编码格式错误，在后续阶段中你将被命令运行 `claude doctor` 诊断工具，届时你必须根据诊断反馈动态自愈修正此文件的配置结构。
2. **编写 `pre-tool.sh`（两级编排强制器）**：
   - **TIER 1（正常）**：主 Agent 拦截 `src/`、`tests/`、`.specs/feature/` 写入，并打印引导提示。
   - **TIER 2（子进程）**：当 `CLAUDE_TDD_MODE=subprocess` 或存在 `.claude/runtime/tdd_subprocess.flag` 时，放行 `src/`，仍拦截 `tests/`。
   - **紧急绕过**：`CLAUDE_TDD_BYPASS=1` 放行所有。
   - 路径通过 `process.argv[1]` 传递，禁用 `/dev/stdin`。
3. **编写 `signal-writer.sh`（Jest 信号源）**：
   - 获取原子锁（`mkdir .claude/runtime/debounce.lock 2>/dev/null || exit 0`），成功后 `sleep 3` 释放。
   - 运行前剥离敏感密钥。静默运行 `npx jest --json --outputFile=.claude/runtime/test_output.json`，日志写至 `.log`。
   - 失败：高亮打印 `🚨 [TDD] Tests FAILED — run /workflow tdd-cycle to auto-fix`。
   - 成功：打印 `✅ [TDD] Tests PASSED — run /workflow tdd-cycle to Auto-CR`。

## 阶段 3：Workflow 原生编排引擎 (`.claude/workflows/tdd-cycle.js`)
1. **沙箱 I/O 隔离**：**严禁使用 `fs` 和 `Date.now()`**。读文件用 `await agent('cat <file>')`，时间戳用 `agent('date +%s')`。
2. **Phase: Test & State Check**：运行 Jest，读取 `.json` 结果与 `fail_count.txt`。失败 ≥ 3 次中止；通过则重置计数。
3. **Phase: Fix (安全穿透)**：读取 `tdd-fix` 模板，**写入 `.claude/runtime/tdd_subprocess.flag`** 穿透沙箱，唤起子代理修复 `src/`。完成后删标记。
4. **Phase: Verify Fix**：复测，失败则递增 fail_count。
5. **Phase: Code Review & Verify**：
   - 创建快照：`git add -A && git commit -m "AUTO-CR-BACKUP" && git tag AUTO-CR-BACKUP-<ts>`
   - 唤起审查子代理重构。复测失败则通过 Bash 执行 `git reset --hard AUTO-CR-BACKUP-<ts> && git clean -fd` 回滚。

## 阶段 4：配置层诊断自愈、Worktree 隔离自检与静态编译检查
主 Agent 在完成搭建后，必须通过物理诊断与实弹测试证明系统的绝对可靠：
1. **`claude doctor` 诊断与配置自愈（核心）**：
   - 物理执行诊断：运行 `claude doctor`（或对应的诊断命令），捕获其 stdout/stderr 输出。
   - **动态自愈**：仔细分析诊断报告。如果发现 `.claude/settings.json` 存在任何结构层、格式层或 Hook 无法挂载的警告/错误，必须自主修正 settings.json 的格式（包括多层 hooks 嵌套及 type/command 定义），直到重新运行 `claude doctor` 报告 **0 错误、0 警告**。
2. **建立隔离区**：`rm -rf .selfcheck_worktree 2>/dev/null || true` 和 `git worktree prune`。执行 `git worktree add .selfcheck_worktree -B selfcheck-worktree`。
3. **装载测试物料与编译校验（增强）**：
   - 复制 `.claude/`、`.specs/` 到 worktree。并在 worktree 内通过 npm 链接或独立构建使环境就绪。
   - **静态类型与编译检查**：在隔离区内运行 `npx tsc --noEmit`，对当前脚手架及 tsconfig 进行物理静态类型校验。若有任何编译期错误（如 Jest 类型未加载、类型定义缺失），必须修正主项目配置。
4. **验证五阶段物理文件完整性**：
   - 在自检测试中，验证在隔离区内是否强制生成并包含了：`.specs/feature/spec.md`（规格）、`.specs/feature/plan.md`（规划）以及 `.specs/feature/tasks.md`（任务列表）。任何文件的缺失都将导致自检失败。
5. **行为验证**：
   - 写入红灯测试与有 bug 的 src/。
   - 设置 `CLAUDE_TDD_MODE=subprocess` 验证改 `tests/` 被拦截（exit 1），改 `src/` 被放行（exit 0）。
   - 验证标记文件穿透有效。
6. **自验证子代理工作流**：
   - 运行 Workflow，验证 Coder 子代理能成功将代码修复正确，且 Reviewer 子代能成功触发重构并完美处理异常回滚。
7. **三级强杀清理策略**：
   - 先 `cd /tmp` 离开 worktree 释放句柄。
   - 尝试 1：`git worktree remove --force .selfcheck_worktree`
   - 尝试 2：若失败，`git worktree prune`，然后 `taskkill /F /IM node.exe || true`
   - 尝试 3：`rm -rf .selfcheck_worktree`。
8. **闭环收尾**：`git add -A && git commit -m "Scaffold complete with self-check verification"`

---

## 🚨 系统级安全与跨平台强制约束
1. **禁用顶层 `set -e`**：预期失败命令必须用 `|| ACTUAL=$?` 手动捕获。
2. **防 Windows 路径转义**：Bash 传路径给 `node -e` 时以 `"$VAR"` 形式附加并用 `process.argv[1]` 提取。禁用 `/dev/stdin`。

---

### ✅ 脚手架构建终极自我校验清单 (Completion Checklist)

在宣布基建项目构建完成并退出前，请在终端和对话日志中**逐项输出以下校验点并打勾（[x]）**。只有在所有项目均满足条件且全绿（`[x]`）后，方可输出成功提示并退出：

#### 一、环境预检与静态安全校验 (Environment & Static Checks)
- [ ] **环境深度诊断**：是否已生成 `.claude/runtime/env_diagnostics.log`，且在构建前已通过 `git status` 验证当前工作区无未提交的脏代码（防覆盖风险）？
- [ ] **跨平台换行符**：是否已生成 `.gitattributes` 文件，强制设置 `eol=lf` 以防 Windows 环境下的 CRLF 导致 Shell 脚本崩溃？
- [ ] **自愈配置诊断**：是否物理运行了 `claude doctor` 诊断指令，并根据其报错反馈将 `.claude/settings.json` 自愈修正至 **0 错误、0 警告** 状态？
- [ ] ** settings.json 结构对齐**：`settings.json` 中的 Hook 挂载是否严格遵循 `entry` -> `hooks[]` -> `{type, command}` 的嵌套格式（消除 doctor 警告）？
- [ ] **静态类型安全**：是否在隔离自检区运行了 `npx tsc --noEmit`，并验证当前项目及 Jest 相关类型无任何 TypeScript 编译期错误？

#### 二、项目宪法与编排协议对齐 (Constitution & Orchestration)
- [ ] **§0 编排协议就绪**：`CLAUDE.md` 是否已正确生成，且严格规定主 Agent 的角色是“指挥官（Conductor）”，从工具层面剥夺其直接使用 `Edit`/`Write` 写入代码的权限？
- [ ] **双重审查权解耦**：`CLAUDE.md` 中是否明确将“代码级重构/审查权（Auto-CR）”完全归属于子代理，而将“宏观架构与 Spec 审查权”归属于主 Agent 与人类？
- [ ] **五阶段流水线约束**：`CLAUDE.md` 中是否完整定义了 `[Constitution] -> [Specify] -> [Plan] -> [Tasks] -> [Implement]` 流程，且严禁省略或合并中间文件？
- [ ] **人类在环（HITL）断点**：`CLAUDE.md` 中是否在 **Phase 1（设计完毕）** 和 **Phase 3（Spec/Plan就绪）** 显式写入了强制暂停并等待人类确认的断点指令？
- [ ] **基础设施目录过滤**：`.gitignore` 与 `.claudeignore` 中是否已同步排除工具目录（`.specs/`、`.claude/hooks/`、`.claude/workflows/`、`.claude/runtime/`），防止主 Agent 探索浪费 Token？

#### 三、底层 Hook 引擎与物理防护 (Hook Engine & Protections)
- [ ] **自适应 CLI 参数**：阶段 0 是否已自动运行 `claude --help` 分析当前版本限制，并将对应的 flag 持久化至 `.claude/runtime/cli_config.sh`？
- [ ] **两级拦截机制 (pre-tool.sh)**：拦截器是否完美实现两级防御：
  - **TIER 1 (正常模式)**：主 Agent 尝试 Edit/Write 修改任何代码目录（`src/`、`tests/`、`spec.md`）时被物理拦截并返回 `exit 1`？
  - **TIER 2 (子进程模式)**：当 `CLAUDE_TDD_MODE=subprocess` 或文件标记存在时，放行 `src/` 写入，但仍拦截 `tests/` 写入？
- [ ] **`Stop` 事件绑定**：`settings.json` 中，`signal-writer.sh` 是否正确绑定在 **`Stop` 触发器** 上（而不是 `PostToolUse`），以规避频繁触发测试导致的队列堆积？
- [ ] **物理防抖限流 (Debounce)**：`signal-writer.sh` 内是否通过 `mkdir .claude/runtime/debounce.lock` + `sleep 3` 的机制实现了跨平台可靠限流，而非依赖未稳定的 JSON 配置？

#### 四、运行态与沙箱安全 (Sandbox Security & Robustness)
- [ ] **沙箱穿透媒介**：Workflow 在启动 TDD 修复子代理前，是否通过写入 `.claude/runtime/tdd_subprocess.flag` 临时标记，成功使 TIER 2 权限穿透沙箱？
- [ ] **无痕回滚精度**：Workflow 在重构（CR）失败回滚时，是否全部使用了 **`git reset --hard <tag> && git clean -fd`**，确保 100% 肃清所有未追踪的重构脏文件？
- [ ] **物理路径防转义**：所有的 `node -e` 命令中，是否彻底禁用了 Linux 特有的 `/dev/stdin`，且所有路径变量均通过 `process.argv` 安全接收，没有任何一处路径直接内联入 JS 字符串字面量中？
- [ ] **安全黑名单隔离**：在 Bash 唤起子进程时，是否使用 `env -u CLAUDE_API_KEY ...` 模式，在清洗敏感密钥的同时保留了 `APPDATA`, `USERPROFILE`, `LANG` 等系统关键环境参数？

#### 五、物理隔离与自愈闭环演练 (Self-Check & Sub-Agents Verification)
- [ ] **Bootstrap 模式退出**：主 Agent 创骨架完毕后，是否已执行了基准提交 `git commit -m "Initial scaffold"`，标志着 Bootstrap 豁免期正式结束？
- [ ] **五阶段物理存在断言**：在自检测试中，是否对 `.specs/feature/` 目录下的 `spec.md`、`plan.md`、`tasks.md` 的物理存在性进行了断言，确保五阶段流程被强制执行？
- [ ] **Worktree 零碰撞加载**：在自检时，是否未复制 `node_modules`，转而使用隔离区独立安装（或主目录链接）方案，避免了 Jest Haste Map 的缓存冲突？
- [ ] **子代理修复（Coder）实弹验证**：是否成功模拟测试红灯，并验证自动唤起的 `tdd-fix` 子代理能在 TIER 2 保护下（无法改单测），成功将 `src/` 下的代码修复正确？
- [ ] **子代理审查（Reviewer）实弹验证**：是否成功验证自动唤起的 `tdd-review` 子代理能自动生成备份快照、重构代码，并在模拟重构失败时完美执行 `git clean` 回滚？
- [ ] **三级强杀清理策略**：自检结束清理 Worktree 时，是否完美执行了“先 `cd /tmp` 释放句柄 $\rightarrow$ git remove $\rightarrow$ 失败时强杀 node $\rightarrow$ 物理 rm -rf 抹除”的三级防御策略？