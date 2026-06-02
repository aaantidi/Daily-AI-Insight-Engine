# 任务拆解文档 — Daily AI Insight Engine (MVP)

> **版本**: 1.0.0
> **状态**: 定稿
> **对应阶段**: Phase 3 — Tasks
> **前置文档**: spec.md (Phase 2)
> **后续流程**: Phase 4 — Implement (TDD 闭环)

---

## 阶段划分与执行顺序

```
阶段 0: 基础设施搭建  ──────────────────────────┐
                                                │
阶段 1: M6 共享数据模型 ────────────────┐        │
                                        │        │
阶段 2: M1 数据摄入 ────────────────────┤        │
                                        │        │
阶段 3: M2 结构化抽取 ─────────────────┤        │
                                        │        │
阶段 4: M3 洞察合成 ───────────────────┤        │
                                        │        │
阶段 5: M4 可视化生成 ─────────────────┤        │
                                        │        │
阶段 6: M5 管道编排 ◀──────────────────┘◀───────┘
```

**核心依赖链**: 0.1 → 1.1 → 1.2 → 2.1 → 2.2 → 2.3 → 3.1 → 3.2 → 3.3 → 3.4 → 3.5 → 4.1 → 4.2 → 4.3 → 4.4 → 4.6 → 5.5 → 6.1 → 6.2 → 6.4
**并行机会**: Phase 1 内部 Task 1.2 和 1.3 无相互依赖；Phase 5 的 5.1/5.2/5.3/5.4 可并行；Phase 6 的 6.1 与前面阶段无强依赖（仅入口）。

---

## 阶段 0: 基础设施搭建 (4 个 P0 Task)

此阶段搭建所有后续阶段依赖的工具层。不涉及业务逻辑，因此不适用严格的 RED/GREEN/REFACTOR 循环，但仍需测试覆盖。

### Task 0.1: 项目依赖安装与构建验证
- **关联**: spec.md — 全局
- **预估工时**: 0.5h
- **依赖**: 无
- **TDD**: 安装后直接运行 `npm test` 验证 Jest 可用 → 运行 `npx tsc --noEmit` 验证编译
- **验收**:
  - 安装 `zod`、`@anthropic-ai/sdk` 依赖
  - `npm test` 通过（项目已有测试样板）
  - `npx tsc --noEmit` 无错误
  - 项目中已有的 `src/calculator.ts` 和 `tests/calculator.test.ts` 被保留但后续可移除

### Task 0.2: 测试夹具 (Test Fixtures) 准备
- **关联**: spec.md — 全局（所有模块测试的基础数据）
- **预估工时**: 1h
- **依赖**: Task 0.1
- **TDD**: 先定义 fixture 类型 → 构造 fixture 数据 → 验证 fixture 结构完整
- **验收**:
  - 在 `tests/fixtures/` 下准备以下数据集：
    - `valid-news.json`: 10 条合格的中英文混合数据（覆盖 4 种 source.type）
    - `invalid-news.json`: 包含缺失必填字段、content < 50 字符、空数组等边界情况
    - `mixed-news.json`: 合格与不合格混合
    - `empty.json`: 空数组
    - `en-only-news.json`: 纯英文数据
    - `high-risk-news.json`: 含 risk_level >= medium 的数据
    - `low-confidence-news.json`: 抽取置信度 < 0.6 的数据
  - 每条 fixture 数据符合 `RawNewsItem` 接口定义
  - 添加辅助函数 `loadFixture(name: string)` 供测试文件使用

### Task 0.3: LLM 客户端封装 (可 Mock / 重试 / 退避)
- **关联**: spec.md F5.8, F5.9
- **预估工时**: 2h
- **依赖**: Task 0.1
- **TDD**: RED → 编写调用方测试（含网络超时/429/5xx/401/403/400 场景）→ GREEN → REFACTOR
- **验收**:
  - 封装 `LLMClient` 类，基于 `@anthropic-ai/sdk`
  - `send(prompt: string, options?: LLMOptions): Promise<LLMResponse>` 方法
  - 可重试错误（网络超时/429/5xx）自动重试最多 3 次，Exponential Backoff 1s/2s/4s
  - 不可重试错误（401/403/400）直接抛出，不重试
  - 支持 mock 模式：`LLMClient.createMock(stubResponse)` 用于测试
  - 每次调用记录耗时、token 用量
  - 注入式设计：上层模块通过构造函数接收 `LLMClient` 实例

### Task 0.4: 日志工具 (Logger)
- **关联**: spec.md F5.5
- **预估工时**: 0.5h
- **依赖**: Task 0.1
- **TDD**: RED → 编写日志输出格式测试 → GREEN → REFACTOR
- **验收**:
  - 实现 5 级日志：`[DEBUG]`, `[INFO]`, `[WARN]`, `[ERROR]`, `[FATAL]`
  - 日志格式：`[2026-06-01T10:30:00.000Z] [INFO] [ModuleName] message`
  - 支持 `setLogLevel(level)` 控制输出级别
  - 支持模块前缀标记（如 `[INGEST]`, `[EXTRACT]`）
  - 日志可以同时写入 stdout 和文件（可选）

---

## 阶段 1: M6 — 共享数据模型 (3 个 P0 Task, 1 个 P2 备注)

此阶段定义全管道的数据契约。每个 Task 内按 TDD 执行：先写 Zod 校验测试，再写类型定义。

### Task 1.1: RawNewsItem 类型与 Zod Schema
- **关联**: spec.md F6.1, F6.6
- **预估工时**: 1h
- **依赖**: Task 0.1
- **TDD**: RED → 编写 RawNewsItem Zod schema 校验测试 → GREEN 定义类型+schema → REFACTOR
- **验收**:
  - 定义 `src/schema/raw-news.ts` 包含 `RawNewsItem` 接口和 `RawNewsItemSchema` Zod schema
  - `id`: string (非空)
  - `title`: string (非空)
  - `content`: string (非空, 长度 >= 50)
  - `source`: `{ name: string, type: enum("tech_media"|"official"|"social_media"|"aggregator"), url: string }`
  - `published_at`: string (ISO 8601 格式校验)
  - `language`: enum("zh"|"en"|"mixed")
  - Zod schema `parse()` 对合法数据通过，对非法数据抛出 ZodError
  - 类型 export 供其他模块 import

### Task 1.2: 结构化中间产物类型 (StructuredInsightItem / IngestSummary / ExtractionSummary / AggregationStats)
- **关联**: spec.md F6.2, F6.3, F6.6
- **预估工时**: 1.5h
- **依赖**: Task 0.1, Task 1.1
- **TDD**: RED → 编写各 schema 校验测试 → GREEN 定义类型+schema → REFACTOR
- **验收**:
  - 定义 `src/schema/structured-insight.ts` 包含 `StructuredInsightItem` 接口和 Zod schema
    - `entities: { companies: string[], products: string[], people: string[], technologies: string[] }`
    - `topics: string[]`
    - `category: string`
    - `sentiment: "positive" | "neutral" | "negative"`
    - `risk_level: "none" | "low" | "medium" | "high" | "critical"`
    - `risk_rationale?: string` (risk_level >= medium 时必填)
    - `impact: 1-10`
    - `significance_score: 1-10`
    - `abstract: string` (≤120 字)
    - `extraction_confidence: 0.0-1.0`
    - `needs_review: boolean`
    - `review_reason?: string`
    - `title_zh?: string`
    - `_ref: { raw_item_id: string }`
  - 定义 `src/schema/summary.ts` 包含：
    - `IngestSummary`: date, total_input, validated, skipped, skipped_reasons, source_distribution
    - `ExtractionSummary`: date, total_items, success_count, needs_review_count, avg_confidence, duration_ms
    - `AggregationStats`: topic_frequency, source_distribution, sentiment_distribution, risk_distribution, significance_top10, entity_co_occurrence
  - 所有 schema 的 `parse()` 校验通过/失败测试

### Task 1.3: 分析产物类型与日报类型 (TopEvent / DeepAnalysis / TrendAnalysis / RiskOpportunityPanel / DailyReport)
- **关联**: spec.md F6.4, F6.5 (P1)
- **预估工时**: 1.5h
- **依赖**: Task 0.1, Task 1.2
- **TDD**: RED → 编写各 schema 校验测试 → GREEN → REFACTOR
- **验收**:
  - 定义 `src/schema/report.ts` 包含：
    - `TopEvent`: rank, title, significance_score, reasoning, ref_item_ids[]
    - `DeepAnalysis`: event_title, background(200-400 字), key_developments(3-5 条), impact_analysis(短期/中期), affected_parties, ref_ids[]
    - `TrendDimension`: dimension(技术/应用/政策/资本), trend_judgment, confidence, supporting_refs[](≥2)
    - `TrendAnalysis`: dimensions[TrendDimension], overall_assessment
    - `RiskOpportunityItem`: type("risk"|"opportunity"), description, ref_ids[], suggestion
    - `RiskOpportunityPanel`: items[RiskOpportunityItem], summary
    - `DailyReport` (P1): metadata(date, version), overview_panel, top_events[], deep_analyses[], trend_analysis, risk_opportunity, appendices
  - 所有 schema 运行时校验测试通过

**备注**: Schema 版本管理 (F6.7) 为 P2 项，不在 MVP 范围内。

---

## 阶段 2: M1 — 数据摄入 (3 个 P0 Task, 1 个 P1 备注, 1 个 P2 备注)

### Task 2.1: 原始数据文件读取
- **关联**: spec.md F1.1
- **预估工时**: 1.5h
- **依赖**: Task 1.1
- **TDD**: RED → 编写读取测试（含正常目录/空目录/非 JSON 文件/文件不存在）→ GREEN → REFACTOR
- **验收**:
  - 实现 `src/ingest/reader.ts` 中的 `readRawData(date: string): Promise<RawNewsItem[]>`
  - 从 `data/raw/` 目录读取所有 `.json` 文件
  - 支持 `data/raw/{date}` 和 `data/raw/` 两种路径模式
  - 返回合并后的 RawNewsItem[]（保留原始 JSON 中的 id）
  - 文件读取失败时抛出明确错误信息
  - 空目录返回空数组而非报错

### Task 2.2: 数据清洗与验证 (必填字段 + 内容长度 + 跳过标记)
- **关联**: spec.md F1.2, F1.3; 去重 F1.5 为 P2
- **预估工时**: 1.5h
- **依赖**: Task 2.1
- **TDD**: RED → 编写校验测试（完整字段/缺失字段/过短内容/混合数据）→ GREEN → REFACTOR
- **验收**:
  - 实现 `src/ingest/validator.ts`：
    - `validateItem(item: RawNewsItem): ValidationResult` 检查必填字段
    - `content.length < 50` 的条目标记 `status: "skipped"`
    - 缺少 `title`/`content`/`source`/`published_at` 中任一字段 → skipped
    - 返回 `{ valid: boolean, skipped_reason?: string }`
  - 实现 `src/ingest/pipeline.ts` 中的 `processIngest(date: string): Promise<{valid: RawNewsItem[], skipped: SkippedItem[], summary: IngestSummary}>`
  - 跳过原因用中文描述（如："缺少必填字段：title"、"正文长度不足50字符"）
  - Fixture `invalid-news.json` 中所有非法数据都能被正确标记
  - Fixture `mixed-news.json` 的正确/错误数据被正确分流

**备注**: 去重 F1.5 (基于标题+来源相似度检测) 为 P2 项，不在 MVP 范围内。但可在 `validator.ts` 中预留 `dedup()` 函数签名。

### Task 2.3: 来源分组统计与输出 (IngestSummary 生成 + 文件写入)
- **关联**: spec.md F1.4 (P1), F1.6
- **预估工时**: 1.5h
- **依赖**: Task 2.2
- **TDD**: RED → 编写统计与输出测试 → GREEN → REFACTOR
- **验收**:
  - 实现 `sourceDistribution(items: RawNewsItem[]): Record<string, number>` 按 source.type 分组统计
  - 实现 `buildIngestSummary(date, total, valid, skipped, distribution): IngestSummary`
  - 输出文件写入 `data/structured/{date}/raw_items.json`（有效条目）
  - 输出文件写入 `data/structured/{date}/ingest_summary.json`（处理摘要）
  - 输出目录结构：`data/structured/{date}/raw_items.json`
  - 摘要中 `skipped_reasons` 包含每条跳过数据的 id 和原因

---

## 阶段 3: M2 — 结构化抽取 (5 个 P0 Task, 2 个 P1 备注)

### Task 3.1: 批量抽取编排器 (顺序处理 / 最大 3 并发)
- **关联**: spec.md F2.1（分批约束：逐条处理，最多并行 3 条）
- **预估工时**: 2h
- **依赖**: Task 0.3, Task 1.2
- **TDD**: RED → 编写编排测试（3 并发/单条失败不影响整体/全失败）→ GREEN → REFACTOR
- **验收**:
  - 实现 `src/extract/orchestrator.ts` 中的 `batchExtract(items: RawNewsItem[], llm: LLMClient): Promise<ExtractionResult[]>`
  - 逐条处理：每条 `RawNewsItem` 独立发起一次 LLM 调用
  - 并发上限严格 ≤ 3 条（使用信号量或队列机制）
  - 单条失败时优雅跳过，不影响其他条目
  - 返回结果按输入顺序排列
  - 每条结果保留 `_ref.raw_item_id` 与原始数据关联
  - 使用 mock LLM 验证并发数不被突破

### Task 3.2: 抽取 Prompt 模板与 LLM 响应解析
- **关联**: spec.md F2.2, F2.3
- **预估工时**: 2h
- **依赖**: Task 3.1
- **TDD**: RED → 编写 Prompt 输出解析测试（多种合法/非法 LLM 响应）→ GREEN → REFACTOR
- **验收**:
  - 实现 `src/extract/prompt.ts`：
    - `buildExtractionPrompt(item: RawNewsItem): string` 构建抽取 Prompt
    - Prompt 要求 LLM 按顺序抽取：实体识别 → 分类 → 情感判断 → 风险评估 → 影响评分
    - 要求 LLM 输出 JSON 格式（适配 StructuredInsightItem schema）
    - Prompt 模板集中管理，引用 spec.md N3.4
  - 实现 `src/extract/parser.ts`：
    - `parseLLMResponse(rawResponse: string): StructuredInsightItem` 解析 LLM 返回
    - 处理 LLM 返回非 JSON/字段缺失等异常情况
    - 对英文源新闻，Prompt 中强制要求输出 `title_zh`
  - 使用 `skills/extractor/SKILL.md` 中的 Prompt 标准（如存在）
  - 抽取结果中的 entities 至少有一个非空

### Task 3.3: 置信度评分与需复核标记
- **关联**: spec.md F2.4, F2.5
- **预估工时**: 1h
- **依赖**: Task 3.2
- **TDD**: RED → 编写置信度校验测试 → GREEN → REFACTOR
- **验收**:
  - 每个 AI 生成字段（entities/topics/category/sentiment/risk_level/impact）附带 `confidence: 0.0-1.0`
  - `extraction_confidence < 0.6` 时自动设置 `needs_review: true`，填写 `review_reason`
  - `review_reason` 示例格式："整体置信度 0.45，低于 0.6 阈值"
  - 置信度遵循 schema 中定义的 0.0-1.0 范围

### Task 3.4: 结果后处理与校验 (title_zh / risk_rationale / 字段校验)
- **关联**: spec.md F2.7, F2.8, F2.9
- **预估工时**: 1.5h
- **依赖**: Task 3.2
- **TDD**: RED → 编写后处理校验测试 → GREEN → REFACTOR
- **验收**:
  - 实现 `src/extract/post-process.ts`：
    - `ensureTitleZh(item: RawNewsItem, result: StructuredInsightItem): void` — 英文源且 title_zh 为空时补充
    - `ensureRiskRationale(result: StructuredInsightItem): void` — risk_level >= medium 且 risk_rationale 为空时补充
    - `validateExtractionResult(result: StructuredInsightItem): ValidationResult`
  - 校验清单：
    - entities 至少一个非空（companies/products/people/technologies 任一非空）
    - topics 非空
    - abstract ≤ 120 字符
    - significance_score 在 1-10 范围内
    - extraction_confidence 在 0.0-1.0 范围内
  - 校验失败时标记 `needs_review: true` 并写明原因

### Task 3.5: 抽取结果输出 (items.json / needs_review.json / extraction_summary)
- **关联**: spec.md F2.10, F2.11 (P1)
- **预估工时**: 1h
- **依赖**: Task 3.4
- **TDD**: RED → 编写输出文件测试 → GREEN → REFACTOR
- **验收**:
  - 写入 `data/structured/{date}/items.json`（全部成功抽取的结构化数据）
  - 写入 `data/structured/{date}/needs_review.json`（needs_review=true 的条目汇总）
  - 写入 `data/structured/{date}/extraction_summary.json` (P1)：总数、成功数、需复核数、平均置信度、耗时
  - 输出文件格式为合法的 JSON 数组

**备注**: 低置信度补救重试 (F2.6) 为 P1 项 — 在 extraction_confidence < 0.4 时使用补救 Prompt 自动重试一次。

---

## 阶段 4: M3 — 洞察合成 (6 个 P0 Task, 2 个 P1 备注, 1 个 P2 备注)

### Task 4.1: 统计聚合 (纯计算)
- **关联**: spec.md F3.1
- **预估工时**: 2h
- **依赖**: Task 1.3
- **TDD**: RED → 编写聚合计算测试（各种分布/排名/矩阵）→ GREEN → REFACTOR
- **验收**:
  - 实现 `src/synthesize/aggregator.ts`：
    - `aggregate(items: StructuredInsightItem[]): AggregationStats`
    - 话题频次排名：统计所有 topics，按出现频次降序
    - 来源分布：按 source.type 统计
    - 情感分布：positive/neutral/negative 各多少
    - 风险分布：none/low/medium/high/critical 各多少
    - 显著性 Top-10 榜单：按 significance_score 降序
    - 实体共现矩阵：同一条目中出现两个及以上实体时记为一次共现
  - 空数组返回空统计（各字段为空/0）
  - 单条目返回正确的单一值统计

### Task 4.2: Top-3 热点识别 (AI 辅助)
- **关联**: spec.md F3.2
- **预估工时**: 1.5h
- **依赖**: Task 4.1, Task 0.3
- **TDD**: RED → 编写热点识别测试（输入已知数据验证输出）→ GREEN → REFACTOR
- **验收**:
  - 实现 `src/synthesize/hotspot.ts`：
    - `identifyTopEvents(stats: AggregationStats, items: StructuredInsightItem[], llm: LLMClient): Promise<TopEvent[]>`
    - 基于统计数据识别 Top-3 热点事件
    - 每个事件包含：排名(1-3)、标题、significance_score、排名理由（50-100 字）、关联条目 ID 列表
    - 热点与统计聚合数据不矛盾（排名第一的热点对应最高频话题）
    - 总条目 < 10 时在结果中附加低置信度警告
  - 使用 mock LLM 验证输出格式

### Task 4.3: 深度分析 (逐热点 AI 调用)
- **关联**: spec.md F3.3
- **预估工时**: 2h
- **依赖**: Task 4.2, Task 0.3
- **TDD**: RED → 编写深度分析测试 → GREEN → REFACTOR
- **验收**:
  - 实现 `src/synthesize/deep-analysis.ts`：
    - `generateDeepAnalysis(event: TopEvent, items: StructuredInsightItem[], llm: LLMClient): Promise<DeepAnalysis>`
    - 对每个 Top 热点独立调用 AI
    - 输出包含：事件背景(200-400 字)、关键进展(3-5 条)、影响分析(短期/中期)、受影响方
    - 所有结论使用 `[ref: {id}]` 标注数据来源
    - 3 个热点依次处理（不并发，避免 LLM throttling）
  - 使用 mock LLM 验证输出结构

### Task 4.4: 四维趋势推演 (AI 调用)
- **关联**: spec.md F3.4
- **预估工时**: 2h
- **依赖**: Task 4.3, Task 0.3
- **TDD**: RED → 编写趋势推演测试 → GREEN → REFACTOR
- **验收**:
  - 实现 `src/synthesize/trend.ts`：
    - `generateTrendAnalysis(items: StructuredInsightItem[], topEvents: TopEvent[], llm: LLMClient): Promise<TrendAnalysis>`
    - 从技术/应用/政策/资本四个维度推演趋势
    - 每个维度包含：趋势判断、置信度(0.0-1.0)、至少 2 条数据支撑(`supporting_refs[]`)
    - 整体评估(overall_assessment)：综合四维趋势的总结性判断
  - 使用 mock LLM 验证输出结构

### Task 4.5: 机会风险识别 (AI 调用) — P1
- **关联**: spec.md F3.5 (P1)
- **预估工时**: 1.5h
- **依赖**: Task 4.4, Task 0.3
- **TDD**: RED → GREEN → REFACTOR
- **验收**:
  - 实现 `src/synthesize/risk-opportunity.ts`：
    - `identifyRiskOpportunity(items: StructuredInsightItem[], llm: LLMClient): Promise<RiskOpportunityPanel>`
    - 基于 `risk_level >= medium` 的条目识别风险与机会
    - 每条风险/机会包含：类型(risk/opportunity)、描述、ref_ids、建议
    - Panel 包含 summary 字段汇总整体情况
  - 使用 mock LLM 验证输出结构

### Task 4.6: 日报 Markdown 组装 (含 [ref] 引用)
- **关联**: spec.md F3.6, F3.7; F3.8 (P1)
- **预估工时**: 2h
- **依赖**: Task 4.2, Task 4.3, Task 4.4, Task 4.5 (可选)
- **TDD**: RED → 编写组装测试 → GREEN → REFACTOR
- **验收**:
  - 实现 `src/synthesize/report-builder.ts`：
    - `buildDailyReport(overview, topEvents, deepAnalyses, trend, riskPanel): string`
    - 日报结构严格遵循 spec.md 定义：
      ```
      # AI 分析日报 — YYYY-MM-DD
      ## 概览面板 (Dashboard)
      ## 第一部分: Top 3 焦点事件
      ## 第二部分: 重要事件深度分析
      ## 第三部分: 趋势推演 (四维雷达)
      ## 第四部分: 机会与风险提示
      ## 附录 A: 数据来源与方法论
      ## 附录 B: 完整结构化数据索引
      ```
    - 概览面板包含：新闻总数、情感分布比例、风险条目数量、Top 话题标签
    - 每条分析结论至少一个 `[ref: {id}]` 引用
    - 所有引用的 ref ID 在附录 B 中可找到
    - 附录 B 包含所有条目的 id/title/source/URL
    - 关键数字使用加粗
    - 总字数 2000-4000 字（不含附录）
    - 报告头部附数据质量声明（如：存在 X 条需复核数据）
  - 总条目 = 0 时抛出特定错误（不生成日报）(P1, F3.8)

**备注**: 矛盾信息处理 (F3.9) 为 P2 项，不在 MVP 范围内。

---

## 阶段 5: M4 — 可视化生成 (5 个 P0 Task, 1 个 P2 备注)

所有 SVG 图表遵循统一标准：
- `viewBox="0 0 800 500"`
- 内联 `<style>` 定义样式
- 颜色方案色盲友好（不使用仅靠颜色区分的标注，关键信息有文字标注）
- 包含 title、legend、数据来源标注、时间戳
- 所有标签正确闭合

### Task 5.1: SVG 话题热度柱状图
- **关联**: spec.md F4.1, F4.5
- **预估工时**: 2h
- **依赖**: Task 4.1
- **TDD**: RED → 编写柱状图 SVG 输出测试（验证标签闭合/颜色/样式/数据正确）→ GREEN → REFACTOR
- **验收**:
  - 实现 `src/visualize/bar-chart.ts`：`generateTopicBarChart(stats: AggregationStats): string`
  - 水平柱状图，降序排列，展示 Top-10 话题频次
  - 每个柱体上方显示频次数值
  - SVG 包含 title："话题热度 Top-10"
  - 包含图例和生成时间戳
  - 数据不足 10 个时只展示实际数量

### Task 5.2: SVG 情感分布环形图 (色盲友好)
- **关联**: spec.md F4.2, F4.5
- **预估工时**: 1.5h
- **依赖**: Task 4.1
- **TDD**: RED → 编写饼图 SVG 测试 → GREEN → REFACTOR
- **验收**:
  - 实现 `src/visualize/pie-chart.ts`：`generateSentimentPieChart(stats: AggregationStats): string`
  - 环形图（donut chart），展示正面/中性/负面比例
  - 色盲友好配色方案（默认：正面=蓝色调 #4A90D9，中性=灰色 #9B9B9B，负面=橙色 #E8833A）
  - 每个扇区标注百分比和数值
  - 中心留白区域显示总条目数
  - SVG 包含 title："情感分布"

### Task 5.3: Mermaid 显著事件时间线
- **关联**: spec.md F4.3, F4.5
- **预估工时**: 1h
- **依赖**: Task 4.1
- **TDD**: RED → 编写 Mermaid 语法测试 → GREEN → REFACTOR
- **验收**:
  - 实现 `src/visualize/timeline.ts`：`generateEventTimeline(items: StructuredInsightItem[]): string`
  - 按时间顺序排列 Top-10 显著事件
  - 条目包含：日期、标题、significance_score
  - 输出合法的 Mermaid timeline 语法（可用在线 Mermaid 预览验证）
  - 数据不足 10 条时只展示实际数量
  - 顶部注释标明数据来源

### Task 5.4: SVG 四维趋势雷达图
- **关联**: spec.md F4.4, F4.5
- **预估工时**: 1.5h
- **依赖**: Task 4.4
- **TDD**: RED → 编写雷达图 SVG 测试 → GREEN → REFACTOR
- **验收**:
  - 实现 `src/visualize/radar-chart.ts`：`generateTrendRadarChart(trend: TrendAnalysis): string`
  - 展示技术/应用/政策/资本四维 confidence 值
  - 四维标注在雷达图顶点
  - 填充半透明颜色，带边框
  - 每个维度顶点标注数值
  - SVG 包含 title："四维趋势雷达图"

### Task 5.5: 图表集成与输出
- **关联**: spec.md F4.7
- **预估工时**: 1h
- **依赖**: Task 4.6, Task 5.1, Task 5.2, Task 5.3, Task 5.4
- **TDD**: RED → 编写图表嵌入测试 → GREEN → REFACTOR
- **验收**:
  - 将各图表嵌入日报 Markdown 的对应位置：
    - 概览面板：情感分布饼图
    - 趋势推演：四维雷达图
    - 附录前：话题热度柱状图 + 事件时间线
  - SVG 使用 `<img>` 标签或 Markdown `![alt](path)` 嵌入
  - 图表文件输出到 `.specs/daily-report/assets/` 目录
  - 图表文件名格式：`{chart-type}-{date}.svg`

**备注**: 实体共现网络图( Mermaid)、风险仪表盘(SVG)、来源分布环形图(SVG) (F4.6) 为 P2 项。

---

## 阶段 6: M5 — 管道编排 (4 个 P0 Task, 3 个 P1 备注)

### Task 6.1: CLI 入口与参数解析
- **关联**: spec.md F5.1, F5.2 (P1)
- **预估工时**: 1.5h
- **依赖**: Task 0.4
- **TDD**: RED → 编写 CLI 参数解析测试 → GREEN → REFACTOR
- **验收**:
  - 实现 `src/pipeline/cli.ts`：
    - 主入口解析命令行参数
    - `npm run daily` → 运行今天日期的全管道（使用 `--date` 时运行指定日期）
    - `npm run daily -- --date=2026-06-01` (P1) 指定日期
    - `npm run daily -- --stage=extract` (P1) 从指定阶段开始
    - `npm run daily -- --help` 显示帮助信息
  - 更新 `package.json` 的 scripts 段添加 `"daily": "ts-node src/pipeline/cli.ts"`（或使用构建后的 js）
  - 日期参数默认为当天日期（YYYY-MM-DD 格式）
  - 阶段参数支持：`ingest` / `extract` / `synthesize` / `visualize`

### Task 6.2: 管道阶段编排器 (顺序执行 / 数据传递)
- **关联**: spec.md F5.3
- **预估工时**: 2h
- **依赖**: Task 2.3, Task 3.5, Task 4.6, Task 5.5, Task 6.1
- **TDD**: RED → 编写管道编排测试（顺序执行/数据传递/部分失败）→ GREEN → REFACTOR
- **验收**:
  - 实现 `src/pipeline/orchestrator.ts`：
    - `runPipeline(date: string, options?: { startStage?: string }): Promise<PipelineResult>`
    - 顺序执行四阶段：INGEST → EXTRACT → SYNTHESIZE → VISUALIZE
    - 每个阶段接收上一阶段的输出作为输入
    - 支持 `startStage` 参数从指定阶段开始（跳过之前阶段）
    - 返回 `PipelineResult` 包含各阶段的状态、耗时、处理数量
  - 使用 Task 0.4 Logger 输出每个阶段的起始、结束、耗时和状态

### Task 6.3: 阶段级状态日志与摘要
- **关联**: spec.md F5.4 (P1), F5.5
- **预估工时**: 1h
- **依赖**: Task 6.2
- **TDD**: RED → 编写日志输出格式测试 → GREEN → REFACTOR
- **验收**:
  - 管道运行中每阶段输出以下日志：
    ```
    [2026-06-01T10:30:00.000Z] [INFO] [PIPELINE] === Stage 1/4: INGEST started ===
    [2026-06-01T10:30:05.000Z] [INFO] [INGEST] Read 20 items from data/raw/
    [2026-06-01T10:30:05.000Z] [WARN] [INGEST] 2 items skipped (missing required fields)
    [2026-06-01T10:30:06.000Z] [INFO] [PIPELINE] === Stage 1/4: INGEST completed (1250ms) ===
    ```
  - 管道结束时输出整体统计：
    ```
    [2026-06-01T10:35:00.000Z] [INFO] [PIPELINE] === Pipeline Complete ===
    [2026-06-01T10:35:00.000Z] [INFO] [PIPELINE] Total: 20 items | Success: 18 | Failed: 0 | Skipped: 2
    [2026-06-01T10:35:00.000Z] [INFO] [PIPELINE] Total duration: 300000ms
    ```

### Task 6.4: 部分失败处理与优雅降级
- **关联**: spec.md F5.6, F5.8, F5.9
- **预估工时**: 1.5h
- **依赖**: Task 6.2
- **TDD**: RED → 编写部分失败场景测试 → GREEN → REFACTOR
- **验收**:
  - 单条 LLM 抽取失败时：
    - 跳过失败项，继续处理下一条
    - 记录错误日志（条目 ID、错误类型、失败原因）
    - 该条在总数中标记为 "failed"
  - 阶段内错误不影响管道整体：
    - 即使一个阶段部分失败，管道继续下一阶段
    - 最终报告中注明各阶段失败情况
  - LLM API 不可重试错误（401/403/400）直接标记条目为 "failed"
  - 最终报告中包含："今日共获取 X 条信息，其中 Y 条成功处理，Z 条因 [原因] 未纳入分析"
  - 所有数据均为 0 时输出"今日无可分析数据"并不生成日报
  - 使用 Task 0.3 的 LLMClient 重试机制处理可重试错误

**备注**: 管道整体耗时统计及明细 (F5.7) 为 P1 项。

---

## 总结

### 任务统计

| 阶段 | P0 任务数 | P1/P2 标记 | 子计工时 (P0) |
|:-----|:---------:|:----------:|:-------------:|
| 阶段 0: 基础设施 | 4 | — | 4h |
| 阶段 1: M6 数据模型 | 3 | 1 (P2) | 4h |
| 阶段 2: M1 数据摄入 | 3 | 1 (P1) + 1 (P2) | 4.5h |
| 阶段 3: M2 结构化抽取 | 5 | 2 (P1) | 7.5h |
| 阶段 4: M3 洞察合成 | 6 | 2 (P1) + 1 (P2) | 11h |
| 阶段 5: M4 可视化 | 5 | 1 (P2) | 7h |
| 阶段 6: M5 管道编排 | 4 | 3 (P1) | 6h |
| **合计** | **30** | **12 (标记)** | **~44h** |

### 关键路径 (最长依赖链)

```
0.1 (0.5h) → 1.1 (1h) → 1.2 (1.5h) → 2.1 (1.5h) → 2.2 (1.5h) → 2.3 (1.5h)
→ 3.1 (2h) → 3.2 (2h) → 3.3 (1h) → 3.4 (1.5h) → 3.5 (1h)
→ 4.1 (2h) → 4.2 (1.5h) → 4.3 (2h) → 4.4 (2h) → 4.6 (2h)
→ 5.5 (1h) → 6.1 (1.5h) → 6.2 (2h) → 6.4 (1.5h)
```

**关键路径总预估工时**: ~30.5h

### 并行执行建议

1. **Phase 1 内部并行**: Task 1.2 与 Task 1.3 可并行（前者完成后开始后者，或两人同时）
2. **Phase 5 内部并行**: Task 5.1, 5.2, 5.3, 5.4 互无依赖，可全并行
3. **P1/P2 的时机**: 所有 P1 项可在对应阶段的 P0 完成后立即开始，不阻塞后续阶段
4. **Task 0.4 (Logger)** 与 **Task 0.3 (LLMClient)** 互无依赖，可并行

### TDD 执行说明

每个 Task 的实施遵循三步流程：

1. **RED**: 先编写该功能的测试用例（`tests/` 下），运行 `npm test` 确认失败
2. **GREEN**: 编写最小实现代码（`src/` 下），运行 `npm test` 确认通过
3. **REFACTOR**: 通过 `/workflow tdd-cycle` 触发 Reviewer 子代理进行代码审查与重构
