# agent.md — Daily AI Insight Engine 通用 Agent 行为指南

> **版本**: 1.0.0
> **生效日期**: 2026-06-01
> **适用对象**: 所有进入本仓库的 AI Agent（主 Agent、子 Agent、Reviewer Agent、以及任何外部 AI 工具）
> **与 CLAUDE.md 的关系**: 本文件为**操作手册 (Operations Manual)**，CLAUDE.md 为**项目宪法 (Constitution)**。本文件解释"如何做事"，CLAUDE.md 定义"做事边界"。两者互补，不可互相替代。

---

## §1 项目定位 (Project Identity)

### 1.1 我们是什么

**Daily AI Insight Engine**（AI 舆情分析日报系统）是一个**数据驱动的 AI 舆情洞察引擎**。

我们的核心使命是：

> 从每日全球 AI 新闻信息中，经过结构化处理与分析，生成一份可读、可追溯、可可视化的"AI 分析日报"。

### 1.2 我们不是什么

| 我们不是... | 所以不要... |
|:-----------|:----------|
| 一个简单的 RSS 聚合器 | 不要只做标题拼接或摘要堆砌 |
| 一个 prompt-and-dump 工具 | 不要将原始数据一次性丢给 LLM 然后直接输出 |
| 一个静态报告生成器 | 不要跳过结构化抽取环节，直接生成自然语言报告 |
| 一个截图收集工具 | 不要调用第三方 AI 产品截图后提交 |

### 1.3 目标用户与应用场景

| 场景 | 用户诉求 | 我们提供的价值 |
|:-----|:--------|:-------------|
| **AI 行业趋势分析** | 了解今日 AI 领域发生了什么 | 结构化的热点事件 + 趋势判断 |
| **舆情监测与风险预警** | 识别潜在公关/政策/安全风险 | 风险标注 + 机会提示 |
| **信息快速理解** | 30 秒内把握当日 AI 动态 | Top-N 热点 + 可视化摘要 |
| **决策辅助** | 基于数据做技术/投资/战略决策 | 深度分析 + 逻辑链支撑 |

---

## §2 核心数据流与工作流 (Core Pipeline)

### 2.1 数据流全景图

```
┌──────────────┐    ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│ 1. INGEST    │───▶│ 2. EXTRACT       │───▶│ 3. SYNTHESIZE    │───▶│ 4. VISUALIZE     │
│ Raw Data     │    │ JSON Schema      │    │ Insight Report   │    │ SVG / Mermaid    │
│ (batch input)│    │ (structured)     │    │ (analysis)       │    │ (charts & graphs)│
└──────────────┘    └──────────────────┘    └──────────────────┘    └──────────────────┘
      ▲                    ▲                       ▲                       ▲
      │                    │                       │                       │
  skills/ingest/      skills/extract/         skills/synthesize/     skills/visualize/
```

### 2.2 四阶段详解

#### Stage 1: INGEST（数据摄入）

- **输入**: 原始新闻/信息源（URL 列表、API 响应、手动整理的 Markdown/JSON 文件）
- **职责**:
  - 数据获取与初步清洗（去重、去噪、格式标准化）
  - 按数据源类型（科技媒体 / 官方渠道 / 社交媒体 / 聚合平台）分组标记
  - 验证每条数据至少包含：`title`、`content`(或 `summary`)、`source`、`published_at`
- **输出**: `data/raw/` 目录下的标准化数据文件
- **约束**: 数据质量校验不通过的项目，标记为 `status: "skipped"` 并记录原因，不进入下一阶段
- **详细操作手册**: `skills/ingest/`

#### Stage 2: EXTRACT（结构化抽取）

- **输入**: Stage 1 产出的标准化数据
- **职责**:
  - 按照设计的 JSON Schema（见 §3）对每条新闻进行字段级结构化抽取
  - **严禁只生成一段自然语言 summary** — 必须将信息拆解为可查询、可聚合的结构化字段
  - 每个字段值应附带 `confidence` (置信度) 评分
- **输出**: `data/structured/` 目录下符合 Schema 的 JSON 数组
- **约束**: 置信度低于阈值 (默认 0.6) 的抽取结果需标记 `needs_review: true`
- **详细操作手册**: `skills/extract/`

#### Stage 3: SYNTHESIZE（洞察合成）

- **输入**: Stage 2 产出的结构化数据
- **职责**:
  - 聚合统计（话题频次、热度排名、时间分布、来源分布）
  - 生成 Top 3-5 今日热点（附排名理由与数据支撑）
  - 对关键事件撰写深度分析（背景 + 影响 + 关联事件）
  - 趋势判断（技术/应用/政策/资本 四个维度）
  - 可选：风险/机会标注（`risk_level`: low/medium/high, `opportunity_type`: tech/business/policy）
- **输出**: `.specs/daily-report/report.md` (Markdown 格式的日报分析)
- **约束**: 每一条分析结论必须有至少一条结构化数据作为证据支撑。不允许空洞的形容词堆砌。
- **详细操作手册**: `skills/synthesize/`

#### Stage 4: VISUALIZE（可视化生成）

- **输入**: Stage 2 的结构化数据 + Stage 3 的分析结论
- **职责**:
  - 生成至少包含以下内容之一的可视化：
    - 话题热度柱状图 / 条形图
    - 时间-事件时间线
    - 数据源分布饼图
    - 实体关系图 (知识图谱风格)
    - 趋势雷达图
  - 输出格式：SVG（推荐，矢量无损）或 Mermaid（便于嵌入 Markdown）
- **输出**: `.specs/daily-report/assets/` 目录下的可视化文件
- **约束**: 可视化必须有 title、legend、数据来源标注。颜色方案需考虑可访问性（色盲友好）。
- **详细操作手册**: `skills/visualize/`

---

## §3 数据结构契约 (Data Schema Contract)

### 3.1 设计原则

1. **原子性 (Atomicity)**: 每个字段表达一个单一事实，不做信息混合
2. **可查询性 (Queryability)**: 字段设计使得 "今天 AI 安全相关的新闻有哪些？" 这类问题可通过过滤而非全文搜索回答
3. **可追溯性 (Traceability)**: 每条结构化记录保留指向原始数据的引用
4. **置信度透明 (Confidence Transparency)**: 每个 AI 生成的字段附带置信度，让下游知道哪些结论是可靠的

### 3.2 核心 Schema（基准版本）

```typescript
interface DailyInsightItem {
  // --- 元信息 ---
  id: string;                    // 唯一标识符，格式: "{source_abbr}-{date}-{seq}"
  ingested_at: string;           // ISO 8601 时间戳，数据被摄入系统的时间

  // --- 原始数据引用 ---
  source: {
    name: string;                // 来源名称 (e.g., "TechCrunch", "机器之心")
    type: "tech_media" | "official" | "social_media" | "aggregator";
    url: string;                 // 原始链接
    published_at: string;        // 原始发布时间 (ISO 8601)
  };

  // --- 内容结构化抽取 ---
  title: string;                 // 原始标题
  title_zh: string | null;       // 中文翻译（非中文源时填充）
  abstract: string;              // 1-2 句摘要（AI 生成，非原文摘抄）
  entities: {
    companies: Entity[];         // 涉及的公司/组织
    products: Entity[];          // 涉及的产品/模型/服务
    people: Entity[];            // 涉及的人物
    technologies: Entity[];      // 涉及的技术栈/算法
  };
  topics: Topic[];               // 话题分类（可多标签）
  sentiment: {
    overall: "positive" | "neutral" | "negative";
    confidence: number;          // 0.0 - 1.0
  };

  // --- 分析维度 ---
  impact_assessment: {
    scope: "global" | "regional" | "company" | "individual";
    time_horizon: "immediate" | "short_term" | "medium_term" | "long_term";
    category: "technology" | "application" | "policy" | "capital" | "ethics";
    significance_score: number;  // 1-10, 综合重要性评分
    rationale: string;           // 评分理由（不超过 100 字）
  };

  // --- 质量控制 ---
  extraction_confidence: number;       // 整体抽取置信度 (0.0 - 1.0)
  needs_review: boolean;               // 是否需要人工复核
  review_reason: string | null;        // 需要复核的原因
}

interface Entity {
  name: string;
  confidence: number;            // 实体识别置信度
}

interface Topic {
  label: string;                 // 话题标签
  category: "technology" | "application" | "policy" | "capital" | "ethics" | "other";
  confidence: number;
}
```

### 3.3 Schema 扩展指南

- 当数据源特点需要额外字段时，在 `DailyInsightItem` 中新增 `custom_fields: Record<string, unknown>` 字段
- 扩展后必须在 `skills/extract/` 目录下更新 Schema 文档
- 如果某字段在 >30% 的数据中为空，考虑将其标记为可选或重新评估其必要性

---

## §4 工作原则 (Working Principles)

### 4.1 分批处理 (Batching) — 最高优先级

> **⚠️ 严禁将全部原始数据一次性塞给大模型。**

这是本项目的核心约束，也是笔试题的硬性要求。违反此原则将导致：
- Token 窗口溢出（数据量大时）
- 分析质量下降（模型注意力稀释）
- 无法追溯每条结论的数据来源
- 不符合题目评分要求

**强制分批规则**:

| 阶段 | 分批粒度 | 并行策略 |
|:-----|:--------|:--------|
| INGEST | 按数据源分组，每组 ≤5 条 | 可并行处理不同数据源 |
| EXTRACT | 逐条处理 (1 item/batch) | 最多并行 3 条 |
| SYNTHESIZE | 按话题分组，每组 ≤10 条 | 顺序处理，先聚合再分析 |
| VISUALIZE | 按图表类型分组 | 可并行生成不同图表 |

**分批处理伪代码模式**:

```typescript
// ✅ 正确做法: 逐条抽取，分批合成
async function processDailyInsight(rawItems: RawNewsItem[]): Promise<DailyReport> {
  // Step 1: 逐条结构化抽取 (每条独立调用 AI)
  const structuredItems: DailyInsightItem[] = [];
  for (const item of rawItems) {
    const structured = await aiExtract(item, SCHEMA);  // 单条处理
    structuredItems.push(structured);
  }

  // Step 2: 聚合统计 (不需要 AI，纯计算)
  const stats = aggregateStats(structuredItems);

  // Step 3: 按话题分组后分批合成分析
  const topicGroups = groupByTopic(structuredItems);
  const analyses: TopicAnalysis[] = [];
  for (const [topic, items] of topicGroups) {
    const analysis = await aiAnalyze(topic, items.slice(0, 10));  // 每组 ≤10 条
    analyses.push(analysis);
  }

  // Step 4: 最终报告组装 (使用分析结果，非原始数据)
  return assembleReport(stats, analyses);
}

// ❌ 错误做法: 一次性全部丢给 AI
// const report = await ai("这是今天所有的新闻，帮我生成日报", rawItems);
```

### 4.2 重试机制 (Retry)

对外部 API 调用（LLM API、数据源 API）必须实现重试逻辑：

```
重试策略:
  - 最大重试次数: 3
  - 退避算法: Exponential Backoff (1s → 2s → 4s)
  - 可重试错误: 网络超时、429 (Rate Limit)、5xx 服务端错误
  - 不可重试错误: 401 (Unauthorized)、403 (Forbidden)、400 (Bad Request — 除非是 schema validation error)
  - 重试耗尽后: 标记该条数据为 failed，记录错误日志，继续处理下一条
```

**重试伪代码**:

```typescript
async function withRetry<T>(fn: () => Promise<T>, itemId: string): Promise<T> {
  const MAX_RETRIES = 3;
  const RETRYABLE_CODES = [429, 500, 502, 503, 504];
  let lastError: Error;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!RETRYABLE_CODES.includes(error.status) || attempt === MAX_RETRIES - 1) {
        logError(itemId, error, attempt + 1);
        throw new Error(`[FATAL] Item ${itemId}: ${error.message}`);
      }
      await sleep(Math.pow(2, attempt) * 1000);  // 1s, 2s, 4s
      logWarning(itemId, `Retry ${attempt + 1}/${MAX_RETRIES}: ${error.message}`);
    }
  }
  throw lastError;
}
```

### 4.3 可追溯性 (Traceability)

每一句分析结论必须能回溯到原始数据：

- 报告中引用数据时使用 `[ref: {id}]` 标注
- 每个 `DailyInsightItem` 的 `id` 字段确保全局唯一
- 禁止做出无法在结构化数据中找到依据的断言

### 4.4 中英文混合处理

- 英文新闻 → 抽取时保留原文 + 补充中文翻译（`title_zh` 字段）
- 中文新闻 → 保留原文即可
- 最终报告语言: **中文为主，关键术语保留英文原名**（如 "Large Language Model (LLM)"）

---

## §5 目录导航 (Directory Navigation)

### 5.1 Agent 需要了解的目录结构

```
daily-ai-insight-engine/
├── CLAUDE.md                    # 项目宪法 — 角色、边界、五阶段开发流水线
├── agent.md                     # ← 你正在读的文件 — 通用 Agent 行为指南
│
├── src/                         # 核心代码 (TypeScript)
│   ├── pipeline/                #   四阶段管道实现
│   ├── schema/                  #   数据模型定义
│   ├── ingest/                  #   数据摄入模块
│   ├── extract/                 #   结构化抽取模块
│   ├── synthesize/              #   洞察合成模块
│   └── visualize/               #   可视化生成模块
│
├── tests/                       # 测试文件 (Jest + TypeScript)
│   ├── pipeline/
│   ├── ingest/
│   ├── extract/
│   ├── synthesize/
│   └── visualize/
│
├── skills/                      # 🎯 专用操作手册 (Agent 必读)
│   ├── ingest/                  #   数据摄入操作手册
│   ├── extract/                 #   结构化抽取操作手册
│   ├── synthesize/              #   洞察合成操作手册
│   ├── visualize/               #   可视化生成操作手册
│   └── retry/                   #   重试与容错策略手册
│
├── data/                        # 数据文件 (不进入版本控制)
│   ├── raw/                     #   原始数据
│   ├── structured/              #   结构化抽取结果
│   └── reports/                 #   生成的日报输出
│
├── .specs/                      # 规格与设计文档 (Agent 探索黑名单)
│   ├── feature/                 #   需求规格 spec.md / plan.md / tasks.md
│   └── daily-report/            #   日报输出工作区
│       └── assets/              #     可视化图表文件
│
├── .claude/                     # Claude Code 配置 (Agent 探索黑名单)
│   ├── hooks/                   #   PreToolUse / Stop 钩子脚本
│   ├── workflows/               #   自动化工作流定义
│   └── runtime/                 #   运行时临时文件
│
└── node_modules/                # 依赖 (忽略)
```

### 5.2 黑名单提醒

以下目录被 CLAUDE.md §3 标记为探索黑名单。Agent 在执行 Glob/Grep/Read 操作时应**主动跳过**这些目录，避免 token 浪费：

- `.specs/`
- `.claude/hooks/`
- `.claude/workflows/`
- `.claude/runtime/`

> 💡 **为什么这些是黑名单？** 它们要么是历史痕迹（`.specs/`），要么是基础设施配置（`.claude/`），对理解业务逻辑没有帮助。Agent 应将搜索重点放在 `src/`、`tests/`、`skills/`、`data/` 上。

---

## §6 技能系统 (Skills System)

### 6.1 什么是 Skills？

Skills 是存放在 `skills/` 目录下的**专用操作手册 (Standard Operating Procedures)**。每个 skill 回答一个具体问题："在这个阶段，Agent 应该如何操作？"

Skills 是 `agent.md` 的**下游细化文档**。本文件给出全局原则，各 skill 给出具体步骤。

### 6.2 Skill 目录规划

| Skill | 路径 | 回答的问题 |
|:------|:-----|:----------|
| Ingest | `skills/ingest/` | 如何获取、清洗、验证原始数据？支持哪些数据源？ |
| Extract | `skills/extract/` | 如何针对不同数据源调整抽取策略？如何处理抽取失败？ |
| Synthesize | `skills/synthesize/` | 如何从结构化数据中生成有逻辑支撑的分析？如何排名？ |
| Visualize | `skills/visualize/` | 如何选择图表类型？SVG vs Mermaid 分别适用什么场景？ |
| Retry | `skills/retry/` | 重试机制的详细配置？如何处理部分失败（partial failure）？ |

### 6.3 Agent 如何查找 Skills

1. **进入项目后第一步**: 阅读本 `agent.md` 了解全局
2. **明确当前处于哪个阶段**: INGEST / EXTRACT / SYNTHESIZE / VISUALIZE
3. **打开对应的 skill 文件**: 例如 `skills/extract/README.md`，按照 SOP 执行
4. **遇到异常**: 先查 `skills/retry/`，再查本文件的 §4.2

### 6.4 Skills 文件格式约定

每个 `skills/<name>/` 目录下至少包含：
- `README.md` — 操作流程 (SOP)，主入口
- `examples.md` — 输入/输出示例 (optional but recommended)
- `prompts.md` — 该阶段使用的 prompt 模板集合 (必须保留)

> 保留 prompts 是笔试题的提交要求之一（见"六、提交内容 §2"）。

---

## §7 开发方法论 (SDD + TDD)

### 7.1 双轨开发

本项目采用 **SDD (Specification-Driven Development) + TDD (Test-Driven Development)** 双轨制：

| 维度 | SDD | TDD |
|:-----|:----|:----|
| **关注点** | 需求与设计是否正确 | 实现与规格是否一致 |
| **产出物** | `.specs/feature/spec.md` → `plan.md` → `tasks.md` | `tests/` → `src/` → 重构 |
| **执行者** | 人类 (拍板) + 主 Agent (规划) + 子 Agent (撰写) | 子 Agent Coder (RED→GREEN) + Reviewer (REFACTOR) |

### 7.2 五阶段流水线

当收到新的开发需求时，严格遵守 CLAUDE.md §1 的**五阶段开发流水线**：

1. **Constitution & Design** → 🛑 人类确认
2. **Specify** → 生成 `.specs/feature/spec.md`
3. **Plan & Tasks** → 生成 `plan.md` + `tasks.md` → 🛑 人类确认
4. **Implement (TDD)** → RED → GREEN → REFACTOR
5. **Review** → Reviewer 子代理深度审查

### 7.3 禁止事项

- ❌ 跳过 Phase 2/3 直接写 `src/` 代码
- ❌ 合并 spec / plan / tasks 为一个文件
- ❌ 主 Agent 直接修改 `src/`、`tests/`、`.specs/feature/` 下的文件
- ❌ Reviewer 之外的角色执行代码重构

---

## §8 质量标准 (Quality Standards)

### 8.1 日报输出质量 Checklist

在生成最终日报前，Agent 必须自检以下项目：

- [ ] 每条结构化记录的 `entities` 字段非空（至少识别出一个实体）
- [ ] 每条记录的 `topics` 字段至少包含一个标签
- [ ] Top-N 热点的排名有明确的 `significance_score` 作为依据
- [ ] 每条分析结论有 `[ref: {id}]` 引用来源
- [ ] 趋势判断覆盖了 technology / application / policy / capital 四个维度中的至少三个
- [ ] 可视化图表包含 title、legend、数据来源
- [ ] 没有将原始数据直接复制粘贴到报告中
- [ ] 中英文混杂内容中，英文术语保留了中文翻译/解释

### 8.2 代码质量标准

- TypeScript 严格模式 (`strict: true`)
- 每个 `src/` 模块有对应的 `tests/` 测试文件
- 测试覆盖率目标: ≥80%
- CI 中 `npm test` 必须通过后才能合并

---

## §9 错误处理与日志规范

### 9.1 分级日志

```
[DEBUG]   — 仅开发调试时关注 (e.g., "processing item 3/15")
[INFO]    — 关键流程节点   (e.g., "Stage EXTRACT completed: 15/15 items")
[WARN]    — 可恢复异常     (e.g., "Retry 2/3 for item techcrunch-20260601-003")
[ERROR]   — 单条失败但流程继续 (e.g., "Item arxiv-20260601-007 extraction failed")
[FATAL]   — 全局流程中断   (e.g., "All data sources unreachable")
```

### 9.2 部分失败处理

当一批数据中部分处理失败时：
1. 失败项标记为 `status: "failed"`，记录 `error_reason`
2. 成功项继续走后续管道
3. 最终报告中注明："今日共获取 X 条信息，其中 Y 条成功处理，Z 条因 [原因] 未纳入分析"
4. **不因部分失败而丢弃整批数据**

---

## §10 快速启动 Checklist (新 Agent 入仓首读)

以下是一个新 Agent 进入本仓库后的**强制自检清单**：

- [ ] 已阅读 `CLAUDE.md`（项目宪法），理解自己的角色边界
- [ ] 已阅读本 `agent.md`，理解项目定位与核心管道
- [ ] 已确认当前处于哪个开发阶段（Phase 1-5）或管道阶段（Stage 1-4）
- [ ] 已打开对应 `skills/` 目录下的操作手册
- [ ] 如果是写代码：确认自己是 Coder 还是 Reviewer 角色
- [ ] 如果是处理数据：确认已理解分批规则（§4.1）和重试规则（§4.2）
- [ ] 如果调用 AI API：确认 prompt 模板已记录在 `skills/*/prompts.md` 中
- [ ] 如果生成日报：确认已过 §8.1 的质量 Checklist

---

> **本文件的维护**: `agent.md` 随项目演进持续更新。当核心管道、Schema、或工作原则发生变化时，必须同步更新本文档。更新由主 Agent 提议，人类拍板后执行。每个 Agent 在每次会话中都有义务对照本文档检查自己的行为是否符合规范。
