# 技术实现规划 — Daily AI Insight Engine (MVP)

> **版本**: 1.0.0
> **状态**: 初稿 (Phase 3 — Plan)
> **前置文档**: `.specs/feature/spec.md`
> **后续产物**: `.specs/feature/tasks.md` → Phase 4 TDD 实施

---

## 1. 技术架构总览

### 1.1 分层架构

整个系统采用**严格分层管道 (Strict Layered Pipeline)** 架构，共 5 层：

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         L5: CLI 入口层 (M5 Pipeline)                    │
│  npm run daily ──► cli.ts ──► Pipeline Orchestrator ──► 各阶段调度      │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ 顺序调用
┌───────────────────────────────▼─────────────────────────────────────────┐
│                      L4: 管道编排层 (M5 Pipeline)                       │
│  pipeline/ingest.ts  ──►  pipeline/extract.ts  ──►  pipeline/synthesize.ts  ──►  pipeline/visualize.ts │
│  每阶段: load → run → summarize → pass to next stage                    │
│  分级日志: [INFO] [WARN] [ERROR]                                        │
└───────────────┬───────────────┬───────────────┬─────────────────────────┘
                │               │               │
    ┌───────────▼───┐  ┌───────▼───────┐  ┌───▼───────────┐
    │ M1: INGEST   │  │ M2: EXTRACT  │  │ M3: SYNTHESIZE │
    │ src/ingest/  │  │ src/extract/ │  │ src/synthesize/│
    ├───────────────┤  ├───────────────┤  ├────────────────┤
    │ 文件读取      │  │ LLM 逐条抽取  │  │ 统计分析(纯计算)│
    │ Zod 校验      │  │ 实体/分类/   │  │ 热点识别(轻AI) │
    │ 去重/分组     │  │ 情感/风险    │  │ 深度分析(重AI) │
    └───────┬───────┘  └───────┬───────┘  └───────┬────────┘
            │                  │                   │
            ▼                  ▼                   ▼
    ┌──────────────────────────────────────────────────┐
    │          M4: VISUALIZE (src/visualize/)          │
    │  SVG 柱状图 / SVG 饼图 / SVG 雷达图 / Mermaid    │
    └──────────────────────────────────────────────────┘
            │
            ▼
    ┌──────────────────────────────────────────────────┐
    │     M6: Models (src/schema/) — 共享数据层        │
    │  TypeScript 接口 + Zod Schema (运行时校验)        │
    │  被所有模块引用，零依赖环形引用                    │
    └──────────────────────────────────────────────────┘
```

**设计理由**: 选择严格分层而非事件驱动或消息队列架构，原因如下：
- **MVP 阶段不需要消息队列**：20 条数据总量极小，同步调用即可满足 ≤5 分钟的性能目标（N1.2）
- **分层带来测试便利**：每层可独立 Mock 下层依赖进行单元测试
- **失败隔离**：某一阶段抛出异常不会污染前序阶段的数据产物
- **替换代价低**：日后如需升级为消息队列架构，只需修改 M5 编排层，业务模块不受影响

### 1.2 模块依赖关系图

```
                    ┌──────────┐
                    │  M6:     │
                    │  Models  │◄────── 所有模块依赖 M6 定义的类型和 schema
                    └──────────┘
                         │
     ┌───────────────────┼───────────────────┐
     │                   │                   │
     ▼                   ▼                   ▼
┌──────────┐      ┌──────────┐      ┌──────────────┐
│  M1:     │─────►│  M2:     │─────►│  M3:         │
│  INGEST  │      │  EXTRACT │      │  SYNTHESIZE  │
│  (无AI)  │      │  (有AI)  │      │  (有AI)      │
└──────────┘      └──────────┘      └──────┬───────┘
                                           │
                                           ▼
                                    ┌──────────┐
                                    │  M4:     │
                                    │VIZUALIZE │
                                    │  (无AI)  │
                                    └──────────┘
```

**依赖规则**:
- M6 (Models) 是唯一"被依赖"的模块，零外部依赖
- M1 → M2 → M3 → M4 为单向数据流，禁止反向引用
- M5 (Pipeline) 依赖所有 M1-M4，负责编排
- 同层模块间不互相引用

### 1.3 数据流向

```
data/raw/*.json
    │
    ▼
[M1 INGEST] ──► data/structured/{date}/raw_items.json
    │                    + ingest_summary.json
    ▼
[M2 EXTRACT] ──► data/structured/{date}/items.json
    │                    + needs_review.json
    │                    + extraction_summary.json
    ▼
[M3 SYNTHESIZE] ──► data/reports/{date}/daily-report-{date}.md
    │                        + assets/ (图表文件)
    ▼
[M4 VISUALIZE] ──► data/reports/{date}/assets/
    │                topic-chart-{date}.svg
    │                sentiment-chart-{date}.svg
    │                timeline-{date}.mermaid
    │                radar-chart-{date}.svg
    ▼
[最终产物] data/reports/{date}/daily-report-{date}.md
            (内联引用 assets/ 中的图表文件路径)
```

---

## 2. 模块详细设计

### 2.1 M6 — Models（共享数据模型）— 基石模块

**设计思路**:

M6 是系统基石，优先于任何功能模块实现。采取"接口优先 + Zod 运行时校验"双保险策略：
- TypeScript 接口在编译期捕获类型错误
- Zod Schema 在运行时校验 LLM 输出（因为 LLM 输出天然不可信）

每个数据模型拆分为三件套：`interface` + `ZodSchema` + 类型推导辅助类型。

**数据契约**:

```typescript
// ===== 文件: src/schema/raw-news.ts (F6.1) =====

export interface RawNewsItem {
  id: string;
  title: string;
  content: string;
  source: {
    name: string;
    type: "tech_media" | "official" | "social_media" | "aggregator";
    url: string;
  };
  published_at: string;  // ISO 8601
  language: "zh" | "en" | "mixed";
}

export const RawNewsItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(50),  // 内容至少 50 字
  source: z.object({
    name: z.string().min(1),
    type: z.enum(["tech_media", "official", "social_media", "aggregator"]),
    url: z.string().url(),
  }),
  published_at: z.string().datetime(),
  language: z.enum(["zh", "en", "mixed"]),
});
```

```typescript
// ===== 文件: src/schema/structured-insight.ts (F6.2) =====

export interface StructuredInsightItem {
  // 原始引用
  id: string;                     // 全局唯一，格式: {source_abbr}-{date}-{seq}
  raw_item_id: string;            // 指向原始 RawNewsItem.id
  source: { name: string; type: string; url: string };

  // 实体识别
  entities: {
    companies: string[];
    products: string[];
    people: string[];
    technologies: string[];
  };

  // 分类
  topics: string[];               // 至少 1 个
  category: "technology_breakthrough" | "product_launch" | "policy_regulation"
          | "investment_funding" | "partnership" | "security_privacy"
          | "market_trend" | "research_paper" | "other";

  // 情感与显著性
  sentiment: "positive" | "neutral" | "negative";
  significance_score: number;     // 1-10

  // 风险评估
  risk_level: "none" | "low" | "medium" | "high" | "critical";
  risk_rationale?: string;        // risk_level >= medium 时必须

  // 标题翻译（英文源专用）
  title_zh?: string;              // F2.7

  // 置信度
  abstract: string;               // ≤120 字
  extraction_confidence: number;  // 0.0-1.0
  needs_review: boolean;          // confidence < 0.6
  review_reason?: string;

  // 元数据
  extracted_at: string;           // ISO 8601
  model_version: string;          // 使用的模型版本
}

export const StructuredInsightItemSchema: z.ZodSchema<StructuredInsightItem>;
// 保证 schema 能校验 LLM 输出
```

```typescript
// ===== 文件: src/schema/summary.ts (F6.3) =====

export interface IngestSummary {
  date: string;
  total_input: number;
  validated: number;
  skipped: number;
  skipped_reasons: Array<{ id: string; reason: string }>;
  source_distribution: Record<string, number>;
}

export interface ExtractionSummary {
  date: string;
  total: number;
  success: number;
  needs_review: number;
  failed: number;
  average_confidence: number;
  duration_ms: number;
}

export interface AggregationStats {
  topic_frequency: Record<string, number>;
  source_distribution: Record<string, number>;
  sentiment_distribution: Record<string, number>;
  risk_distribution: Record<string, number>;
  significance_top10: Array<{ id: string; title: string; score: number }>;
  entity_cooccurrence: Record<string, string[]>;  // 实体 → 共现实体列表
}
```

```typescript
// ===== 文件: src/schema/analysis.ts (F6.4) =====

export interface TopEvent {
  rank: number;                    // 1-3
  title: string;
  significance_score: number;
  reason: string;                  // 排名理由
  related_item_ids: string[];      // [ref] 引用的条目 ID
}

export interface DeepAnalysis {
  event_title: string;
  background: string;              // 200-400 字
  key_developments: string[];      // 3-5 条
  impact_analysis: {
    short_term: string;
    medium_term: string;
  };
  affected_parties: string[];
  ref_ids: string[];
}

export interface TrendDimension {
  dimension: "technology" | "application" | "policy" | "capital";
  trend: string;
  confidence: number;
  supporting_evidence: string[];   // 每条对应一个 [ref]
}

export interface TrendAnalysis {
  dimensions: TrendDimension[];    // 4 个维度
}

export interface RiskOpportunityPanel {
  risks: Array<{ title: string; description: string; severity: string; ref_ids: string[] }>;
  opportunities: Array<{ title: string; description: string; ref_ids: string[] }>;
}
```

```typescript
// ===== 文件: src/schema/report.ts (F6.5) =====

export interface DailyReport {
  date: string;
  overview: {
    total_news: number;
    sentiment_ratio: { positive: number; negative: number; neutral: number };
    risk_item_count: number;
    top_topics: string[];
  };
  top_events: TopEvent[];
  deep_analyses: DeepAnalysis[];
  trend_analysis: TrendAnalysis;
  risk_opportunity: RiskOpportunityPanel;
  appendices: {
    data_source: string;
    methodology: string;
    full_index: Array<{ id: string; title: string; source: string; url: string }>;
  };
}
```

**关键决策**:

| 决策 | 选择 | 备选方案 | 理由 |
|------|------|----------|------|
| Schema 位置 | 独立 `src/schema/` 目录 | 分散在各模块内 | 所有模块依赖相同类型，集中管理避免循环引用 |
| 运行时校验 | Zod | io-ts / 手写类型守卫 | Zod 是 TS 生态最流行的运行时校验库，与 Jest 集成好 |
| ID 格式 | `{source_abbr}-{date}-{seq}` | UUID | 可读性强，一眼看出来源和日期；UUID 无法人工识别 |
| 置信度类型 | number (0-1) | "high"/"medium"/"low" | 数值支持后续阈值调整和统计平均 |
| abstract 长度 | ≤120 字 | 不限 | 120 字可控制日报版面，同时保证内容足够 |

**错误处理策略**:
- Zod parse 失败时捕获 `ZodError`，格式化输出字段级错误路径和期望类型
- 不可修正的 schema 错误（如 sentiment 非预期值）标记为 extraction 失败
- 可修正的错误（如 abstract 略超 120 字）可以截断处理

---

### 2.2 M1 — INGEST（数据摄入）

**设计思路**:

采用"读取 → 校验 → 分组统计 → 写出"四步流水线。核心思想是**尽早拒绝坏数据**：在管道入口处过滤掉所有不合格条目，避免垃圾进垃圾出。

选择同步读取（而非流式）的原因：20 条 JSON 数据总量约 200KB，同步读取即可满足 N1.3 (≤2 秒) 要求。

**数据契约**:

```
输入: data/raw/*.json  →  文件系统中的任意 .json 文件
                           （数组格式：类型为 RawNewsItem[]）
输出: data/structured/{date}/raw_items.json  +  IngestSummary
```

**核心流程**:

```
function ingest(date: string): IngestSummary {
  1. 扫描 data/raw/ 下的所有 .json 文件
  2. 解析为 { id, title, content, source, published_at, language }[]
  3. 遍历每条：
     a. Zod schema 校验必填字段 (F1.2)
     b. content.length >= 50? (F1.3)
     c. 通过 → validated[] ; 不通过 → skipped[]
  4. 按 source.type 分组统计 (F1.4)
  5. [可选] 标题+来源模糊去重 (F1.5, P2)
  6. 写出 validated[] 到 raw_items.json
  7. 写出 skipped[] 到 skipped_reasons
  8. 返回 IngestSummary
}
```

**关键决策**:

| 决策 | 选择 | 理由 |
|------|------|------|
| 文件格式 | 纯 JSON 数组，每文件一数组 | 用户手动准备数据，JSON 最通用；避免 JSONL 的逐行解析复杂性 |
| 日期解析 | 从 `published_at` 提取，不接受推算 | 避免引入时区错误；每个条目自包含日期 |
| 去重策略 (P2) | 基于 Levenshtein 距离的标题相似度 | 简单可实施，无需调用 LLM；阈值设为 0.85 |

**错误处理策略**:
- 文件读取失败 → 记录 `[ERROR] 无法读取文件 {path}: {error}`，跳过该文件
- 单条校验失败 → 跳过该条，记录到 `skipped_reasons`
- 所有文件均无法读取 → 返回总量 0 的 IngestSummary，后续阶段正常退出（F3.8）
- **不会抛出异常**：即使 0 条数据也返回正常 summary，由 Pipeline 决定下一步

---

### 2.3 M2 — EXTRACT（结构化抽取）

**设计思路**:

这是系统中最关键的模块，也是 LLM 成本的主要消耗点。核心设计原则：

1. **逐条抽取，严禁混批**（F2.1）：每条新闻独立调用 LLM，保证每条的上下文窗口都是完整的原文
2. **结构化输出强制 Zod 校验**：LLM 输出必须通过 Zod schema 才算成功
3. **低置信度自动补救**（F2.6）：confidence < 0.4 时重试一次，用不同的 prompt 引导
4. **限并发**：最大 3 个并发，使用 `p-limit` 或手动信号量控制

**数据契约**:

```
输入: RawNewsItem[] (来自 M1 输出的 raw_items.json)
输出: StructuredInsightItem[] + needs_review.json + ExtractionSummary
```

**核心流程**:

```
async function extract(items: RawNewsItem[]): Promise<{
  success: StructuredInsightItem[];
  summary: ExtractionSummary;
}> {
  const semaphore = new Semaphore(3);  // 最大并发 3
  const results: StructuredInsightItem[] = [];
  const needsReview: StructuredInsightItem[] = [];

  // 并发池
  await Promise.all(
    items.map(item => semaphore.run(async () => {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          // 1. 调用 LLM (结构化抽取 prompt)
          const raw = await llm.call(extractionPrompt(item));

          // 2. Zod 校验
          const parsed = StructuredInsightItemSchema.parse(raw);

          // 3. 后处理
          parsed.id = generateId(item);           // F6.2 ID 格式
          parsed.raw_item_id = item.id;
          parsed.extracted_at = new Date().toISOString();

          // 4. 置信度检查
          if (parsed.extraction_confidence < 0.6) {
            parsed.needs_review = true;
            parsed.review_reason = `置信度 ${parsed.extraction_confidence} < 0.6`;
          }

          // 5. 低置信度补救 (F2.6)
          if (parsed.extraction_confidence < 0.4 && attempt === 1) {
            // 重试一次，带补救 prompt
            continue;  // 进入第二次循环
          }

          results.push(parsed);
          break;  // 成功，退出重试循环
        } catch (err) {
          if (isRetryable(err) && attempt < 3) {
            await sleep(1000 * Math.pow(2, attempt - 1));  // 1s → 2s → 4s
            continue;
          }
          // 不可重试或重试耗尽
          recordFailure(item.id, err);
          break;
        }
      }
    }))
  );

  // 写出 needs_review.json
  const needsReviewItems = results.filter(r => r.needs_review);
  await writeJSON(needsReviewPath, needsReviewItems);

  return computeSummary(results, items.length);
}
```

**LLM Prompt 模板设计**:

抽取 prompt 存放在 `skills/extractor/extraction-prompt.md` 中。

```
## 结构化新闻抽取任务

请从以下新闻中提取结构化字段。严格按 JSON 格式输出。

### 输出格式 (严格 JSON)：
{ ... StructuredInsightItem 的 JSON 结构 ... }

### 约束：
- abstract ≤ 120 字
- significance_score: 1-10
- risk_level: none/low/medium/high/critical
- 如果 risk_level >= medium，必须填写 risk_rationale
- 英文源新闻必须填写 title_zh 字段

### 待分析新闻：
标题: {title}
正文: {content}
来源: {source_name}
发布时间: {published_at}
```

**关键决策**:

| 决策 | 选择 | 备选方案 | 理由 |
|------|------|----------|------|
| LLM 调用方式 | 单次调用，一次性输出所有字段 | 按实体/分类/情感分次调用 | 减少 LLM 调用次数（20 条 × 1 次 vs 20 条 × 5 次）|
| 并行控制 | `p-limit` 信号量 | `Promise.all` + 分批 | 信号量更精细，不浪费并发容量 |
| 低置信度补救 | 同 prompt + 附加"请仔细检查"指令 | 不同模型重试 | 避免模型切换增加复杂度；补救 prompt 即可 |
| Zod 校验失败处理 | 视为不可重试错误 | 重新生成 | 结构问题说明 prompt 或模型问题，重试大概率同样失败 |

**错误处理策略**:
- LLM 网络超时 → 可重试（1s/2s/4s）
- 429 (Rate Limit) → 可重试（更长退避 5s/10s/20s）
- 401/403/400 → 不可重试，立即失败（F5.9）
- Zod 校验失败 → 记录失败到 `extraction_summary.json`
- 单条失败不影响其它条目（F5.6）

---

### 2.4 M3 — SYNTHESIZE（洞察合成）

**设计思路**:

采用"纯计算 + 轻量 AI + 深度 AI"三层推理架构：

1. **纯计算层** (F3.1)：话题频次、情感分布、显著性排序等，零 LLM 调用
2. **轻量 AI 层** (F3.2)：基于统计数据调用一次 LLM 识别 Top-3 热点
3. **深度 AI 层** (F3.3-F3.5)：对每个 Top 热点独立调用 LLM 深度分析

这种分层设计让 AI 只花在真正需要"理解"和"推理"的地方，统计聚合靠计算完成，准确且免费。

**数据契约**:

```
输入: StructuredInsightItem[] (来自 M2)
输出: DailyReport (Markdown 日报)
```

**核心流程**:

```
async function synthesize(items: StructuredInsightItem[]): Promise<string> {

  // === 阶段 1: 纯计算 (F3.1) — 0 LLM 调用 ===
  const stats = computeStats(items);
  // topic_frequency, sentiment_distribution, risk_distribution,
  // significance_top10, entity_cooccurrence_matrix

  // 数据不足检查 (F3.8)
  if (items.length === 0) return "今日无可分析数据";
  if (items.length < 10) logger.warn(`数据不足: ${items.length} 条, 分析置信度可能偏低`);

  // === 阶段 2: 热点识别 (F3.2) — 1 次 LLM 调用 ===
  const topEvents: TopEvent[] = await identifyTopEvents(stats, items);

  // === 阶段 3: 深度分析 (F3.3) — N 次 LLM 调用 (N = top事件数, ≤3) ===
  const deepAnalyses: DeepAnalysis[] = await Promise.all(
    topEvents.map(event => deepAnalyze(event, items))
  );

  // === 阶段 4: 趋势推演 (F3.4) — 1 次 LLM 调用 ===
  const trends: TrendAnalysis = await analyzeTrends(items, stats);

  // === 阶段 5: 机会风险 (F3.5) — 1 次 LLM 调用 ===
  const riskOps = await identifyRisks(items);

  // === 阶段 6: 日报组装 (F3.6) — 纯拼接, 0 LLM 调用 ===
  const report = assembleReport({
    date, stats, topEvents, deepAnalyses, trends, riskOps, items
  });

  return report;
}
```

**LLM 调用汇总**（20 条数据基准）:

| 子步骤 | 调用次数 | 输入 Token 预估 | 说明 |
|--------|---------|----------------|------|
| 热点识别 | 1 | ~3000 | 输入统计聚合数据 + 条目摘要，输出 Top-3 |
| 深度分析 × 3 | 3 | ~4000 × 3 | 每个热点相关条目全量输入 |
| 趋势推演 | 1 | ~6000 | 输入全量结构化数据，四维输出 |
| 机会风险 | 1 | ~4000 | 输入 risk_level ≥ medium 的条目 |
| **合计** | **6 次** | **~25000** | |

**关键决策**:

| 决策 | 选择 | 备选方案 | 理由 |
|------|------|----------|------|
| 热点识别方式 | 统计驱动 + LLM 排序 | 纯 LLM 阅读所有条目 | 统计预过滤减少 LLM token 消耗；LLM 仅做排序和理由生成 |
| 深度分析并行度 | 串行（逐个调用） | 并行 | 深度分析依赖热点识别输出，天然串行；但 3 个热点间可独立并行 |
| 趋势维度固定 | 技术/应用/政策/资本 四维 | LLM 自由发现 | 保持输出一致性和可比性；自由发现可能每天维度不同 |
| 矛盾信息标注 | 轻量级标记 (P2) | 深度矛盾检测 | MVP 阶段不做 NLP 级矛盾检测，仅标记明显分歧 |

**错误处理策略**:
- 热点识别失败 → 使用纯统计 Top-3（按 significance_score 排序降级）
- 某深度分析失败 → 跳过该热点，记录日志，继续其他热点
- 趋势推演失败 → 输出空趋势面板 + 警告
- 报告组装不调用 LLM，纯字符串拼接，几乎不会失败

---

### 2.5 M4 — VISUALIZE（可视化生成）

**设计思路**:

纯文本生成 SVG 和 Mermaid 图表，不依赖任何外部渲染库。每次生成只写一个文件，通过模板引擎替换变量值。

选择**模板函数**（而非 AST 操作）的理由：SVG 是 XML，模板字符串拼接即可保证结构正确；引入 XML DOM 解析器增加复杂度但收益有限。

**数据契约**:

```
输入: AggregationStats + TrendAnalysis + StructuredInsightItem[]
输出: .svg / .mermaid 文件 → data/reports/{date}/assets/
```

**图表实现方案**:

```typescript
// 话题热度柱状图 (F4.1)
function generateTopicBarChart(topics: [string, number][]): string {
  // 1. 对 topics 按频次降序排列，取 Top-10
  // 2. 计算最大频次确定比例
  // 3. SVG: viewBox="0 0 800 500"
  //    - <rect> 水平柱，左侧标签，右侧数值
  //    - 色盲友好配色（蓝色系渐变，不依赖颜色区分）
  //    - 图例: "话题热度 Top-10 | {date}"
  //    - 每个柱上标注频次数字
  // 4. 返回完整 SVG 字符串
}

// 情感分布环形图 (F4.2)
function generateSentimentDonut(distribution: Record<string, number>): string {
  // 1. 计算正/中/负比例
  // 2. SVG: <path> 圆弧 + <circle> 中间空白形成环形
  //    - 色盲友好: 蓝色(正面) / 灰色(中性) / 橙色(负面)
  //    - 中心显示总数
  //    - 图例 + 百分比文字标注
}

// 显著事件时间线 (F4.3) - Mermaid
function generateTimeline(items: StructuredInsightItem[]): string {
  // mermaid timeline
  //    title AI 显著事件时间线
  //    {date1} : {event1}
  //    {date2} : {event2}
  // 取 significance_top10
}

// 趋势四维雷达图 (F4.4)
function generateRadarChart(trends: TrendDimension[]): string {
  // SVG: 四轴雷达图
  //    - 4 条轴线从中心放射
  //    - confidence 值映射为轴上的点
  //    - 多边形填充
  //    - 色盲友好配色
  //    - 每个维度轴上标注维度和具体置信度值
  //    - 图例: "趋势置信度雷达 | {date}"
}
```

**SVG 质量标准**（F4.5）：

```typescript
// 所有 SVG 遵守的通用约束
const SVG_QUALITY_RULES = {
  viewBox: "0 0 800 500",
  inlineStyle: true,        // <style> 标签内联
  title: true,              // <title> 必须有
  legend: true,             // 图例
  dataSource: true,         // 数据来源: "基于 {date} 日 {n} 条新闻分析"
  timestamp: true,          // 生成时间戳
  colorBlindSafe: true,     // 色盲友好
  labelsOnChart: true,      // 数值直接标注在图表上
  validXML: true,           // 所有标签闭合
};
```

**关键决策**:

| 决策 | 选择 | 备选方案 | 理由 |
|------|------|----------|------|
| 图表生成方式 | TypeScript 函数返回字符串 | 模板文件 + Handlebars | 更灵活，逻辑内聚；避免引入模板引擎依赖 |
| Mermaid vs SVG | 时间线用 Mermaid，其余用 SVG | 全部 SVG | Mermaid 时间线语法比手写 SVG 时间线简单一半代码量 |
| 颜色方案 | 内置色盲友好色板 | 用户自定义 | MVP 阶段固定色板，可维护；色盲友好是硬要求 (N5.1) |
| 图表数量下限 | 至少 4 个（柱状/环形/时间线/雷达） | 用图表数量换取质量 | spec 硬要求 (N5.1) |

**错误处理策略**:
- 图表生成失败 → 输出 `<p>图表生成失败: {错误原因}</p>` 占位，日志记录 `[ERROR]`
- 数据不足无法生成某图表（如情感全是正面无负面）→ 生成简化版图表，标注"数据分布单一"
- 不影响其他图表的生成

---

### 2.6 M5 — Pipeline（管道编排）

**设计思路**:

Pipeline 是系统的"骨架"，职责纯粹：编排而非执行。采用**策略模式**实现阶段可插拔。

CLI 入口使用 Node.js 原生 `process.argv`，不引入 Commander 或 yargs 的理由：MVP 只需 2 个参数（`--date`, `--stage`），原生解析更轻量。

**核心流程**:

```typescript
// src/pipeline/cli.ts
async function main() {
  const args = parseArgs(process.argv.slice(2));
  // --date=2026-06-01  |  默认: 今天
  // --stage=extract    |  默认: ingest → ... → visualize

  const pipeline = new Pipeline(args.date, args.stage);

  // 注册阶段
  pipeline.register("ingest",    new IngestStage());
  pipeline.register("extract",   new ExtractStage());
  pipeline.register("synthesize", new SynthesizeStage());
  pipeline.register("visualize", new VisualizeStage());

  // 运行
  await pipeline.run();
}

// src/pipeline/pipeline.ts
class Pipeline {
  private stages: Map<string, Stage> = new Map();
  private results: Map<string, StageResult> = new Map();

  async run() {
    console.log(`[INFO] Pipeline 启动 | 日期: ${this.date}`);
    const start = Date.now();

    for (const [name, stage] of this.stages) {
      if (!this.shouldRun(name)) continue;

      const stageStart = Date.now();
      console.log(`[INFO] === 阶段 ${name} 开始 ===`);

      try {
        const result = await stage.run({ date: this.date, previousResults: this.results });
        this.results.set(name, {
          status: "success",
          summary: result.summary,
          duration_ms: Date.now() - stageStart,
        });
        console.log(`[INFO] === 阶段 ${name} 完成 | ${result.summary} | ${Date.now()-stageStart}ms ===`);
      } catch (err) {
        this.results.set(name, {
          status: "failed",
          error: err.message,
          duration_ms: Date.now() - stageStart,
        });
        console.log(`[ERROR] === 阶段 ${name} 失败: ${err.message} ===`);
        break;  // 关键阶段失败，终止管道
      }
    }

    this.printFinalReport(Date.now() - start);
  }
}
```

**日志系统** (F5.5):

```typescript
// 分级日志实现
const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, FATAL: 4 } as const;

class Logger {
  level: number = LOG_LEVELS.INFO;

  debug(msg: string) { this.log("DEBUG", msg); }
  info(msg: string)  { this.log("INFO", msg); }
  warn(msg: string)  { this.log("WARN", msg); }
  error(msg: string) { this.log("ERROR", msg); }
  fatal(msg: string) { this.log("FATAL", msg); process.exit(1); }

  private log(level: string, msg: string) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level}] ${msg}`);
    // 可选: 同时写入日志文件
  }
}
```

**重试机制** (F5.8):

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries: number; baseDelay: number; retryableErrors: string[] }
): Promise<T> {
  let lastError: Error;
  for (let attempt = 1; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isRetryable(err, options.retryableErrors)) throw err;
      if (attempt < options.maxRetries) {
        const delay = options.baseDelay * Math.pow(2, attempt - 1);
        console.log(`[WARN] 重试 ${attempt}/${options.maxRetries} | 等待 ${delay}ms`);
        await sleep(delay);
      }
    }
  }
  throw lastError;
}
```

**关键决策**:

| 决策 | 选择 | 备选方案 | 理由 |
|------|------|----------|------|
| CLI 参数解析 | 原生 `process.argv` | Commander / yargs | 仅 2 个参数，增加依赖不值得 |
| 阶段间通信 | 文件系统 + in-memory Map | 纯内存 | 文件系统提供断点续跑能力 (--stage) |
| 失败处理 | 阶段级失败 = 管道终止 | 阶段级失败跳过继续 | 下游依赖上游输出，M1/M2 失败后 M3/M4 无法执行 |
| 配置管理 | 硬编码常量 + 环境变量覆盖 | dotenv 文件 | MVP 阶段配置项少，环境变量足够 |

**错误处理策略**:
- 阶段级失败 → 终止管道（Ingest/Extract 失败后下游模块无有效输入）
- 条目级失败 → 仅跳过该条目（Extract 中单条 LLM 调用失败）
- 日志输出到 stdout 和 `.claude/runtime/` 日志文件

---

## 3. LLM 调用策略

### 3.1 调用次数估算（20 条数据基准）

| 模块 | 子步骤 | LLM 调用次数 | 输入 Token (估) | 输出 Token (估) | 预计耗时 |
|------|--------|:-----------:|:---------------:|:---------------:|:--------:|
| M2 | 结构化抽取 × 20 条 | 20-40* | ~2000/条 × 20 = ~40K | ~500/条 × 20 = ~10K | ~5-10s/条 |
| M3 | 热点识别 | 1 | ~3K | ~1K | ~5s |
| M3 | 深度分析 × 3 | 3 | ~4K × 3 = ~12K | ~2K × 3 = ~6K | ~5s/个 |
| M3 | 趋势推演 | 1 | ~6K | ~2K | ~8s |
| M3 | 机会风险 | 1 | ~4K | ~1.5K | ~5s |
| | **合计** | **26-46** | **~65K** | **~20.5K** | **~4-8 分钟** |

*低置信度重试（F2.6）会增加 20 条中约 2-3 条的第二次调用。

**Token 消耗估算**:
- 输入 Token: ~65K
- 输出 Token: ~20.5K
- 总计: ~85.5K Token
- Anthropic Claude 3.5 Sonnet 定价约 $3/MTok 输入, $15/MTok 输出
- 单次运行成本: ~$0.20 + ~$0.31 = ~$0.51

### 3.2 Prompt 管理策略

**模板存放位置**:

```
skills/
├── extractor/
│   ├── SKILL.md                    # Coder 子代理工作说明
│   └── extraction-prompt.md        # M2 抽取 prompt 模板
├── analyzer/
│   ├── SKILL.md                    # Coder 子代理工作说明
│   ├── top-events-prompt.md        # M3 热点识别 prompt
│   ├── deep-analysis-prompt.md     # M3 深度分析 prompt
│   ├── trend-analysis-prompt.md    # M3 趋势推演 prompt
│   └── risk-opportunity-prompt.md  # M3 机会风险 prompt
└── visualizer/
    ├── SKILL.md                    # Coder 子代理工作说明
    └── (图表生成逻辑在代码中，无独立 prompt)
```

**变量替换机制**:

```typescript
// 所有 prompt 使用统一的模板引擎函数
function renderPrompt(template: string, vars: Record<string, string>): string {
  // 简单 {{variable}} 替换
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

// 示例: 抽取 prompt
const prompt = renderPrompt(extractionTemplate, {
  title: newsItem.title,
  content: newsItem.content,
  source_name: newsItem.source.name,
  published_at: newsItem.published_at,
});
```

选择双花括号 `{{var}}` 而非模板字面量 \`${var}\` 的理由：prompt 模板是独立的 `.md` 文件，不在代码字符串中；`{{var}}` 与 Nunjucks/Handlebars/Anthropic Prompt 语法一致，便于将来迁移。

### 3.3 模型选择策略

| 模块 | 推荐模型 | 理由 |
|------|----------|------|
| M2 结构化抽取 | Claude 3.5 Sonnet | 需要精确的 JSON 结构化输出，Sonnet 指令跟随最佳 |
| M3 热点识别 | Claude 3.5 Sonnet | 需要排序和理由生成，准确度关键 |
| M3 深度分析 | Claude 3.5 Sonnet | 需要推理深度 |
| M3 趋势推演 | Claude 3.5 Sonnet | 需要多维度综合推理 |
| M3 机会风险 | Claude 3.5 Sonnet | 需要审慎判断 |

**模型配置**:

```typescript
// src/pipeline/model-config.ts
export const MODEL_CONFIG = {
  extraction: {
    model: "claude-3-5-sonnet-20241022",
    maxTokens: 1024,
    temperature: 0.1,      // 低温度保证结构化输出一致性
  },
  analysis: {
    model: "claude-3-5-sonnet-20241022",
    maxTokens: 2048,
    temperature: 0.3,      // 略高温度使分析有一定多样性
  },
};
```

### 3.4 LLM 客户端封装

```typescript
// src/pipeline/llm-client.ts
// 封装 Anthropic SDK 调用，统一处理重试、日志、错误映射

export class LLMClient {
  constructor(private apiKey: string) {}

  async call(params: {
    prompt: string;
    model: string;
    maxTokens: number;
    temperature: number;
    systemPrompt?: string;
  }): Promise<string> {
    // 1. 记录调用开始 + prompt 版本
    // 2. 调用 Anthropic SDK
    // 3. 记录响应时间 + token 消耗
    // 4. 返回响应文本
    // 5. 支持重试 (由 withRetry 包装)
  }
}
```

---

## 4. 数据管理

### 4.1 文件目录规范

```
daily-ai-insight-engine/
├── data/
│   ├── raw/                              # 原始数据（用户提供）
│   │   └── *.json                        # 任意格式，字段名自由
│   │
│   ├── structured/                       # 结构化处理产物
│   │   └── {date}/                       # 按日期分组，例: 2026-06-01/
│   │       ├── raw_items.json            # M1: 校验通过的标准条目
│   │       ├── ingest_summary.json       # M1: 摄入摘要
│   │       ├── items.json                # M2: 结构化抽取结果
│   │       ├── needs_review.json         # M2: 需复核条目
│   │       └── extraction_summary.json   # M2: 抽取摘要
│   │
│   └── reports/                          # 日报输出
│       └── {date}/                       # 按日期分组
│           ├── daily-report-{date}.md    # M3: 最终日报
│           └── assets/                   # M4: 可视化资源
│               ├── topic-chart-{date}.svg
│               ├── sentiment-chart-{date}.svg
│               ├── timeline-{date}.mermaid
│               └── radar-chart-{date}.svg
│
├── .specs/
│   └── feature/
│       ├── spec.md                       # 规格文档
│       ├── plan.md                       # ← 本文件
│       └── tasks.md                      # 任务拆解（后续生成）
```

### 4.2 中间产物保留策略

| 产物 | 保留策略 | 用途 |
|------|----------|------|
| `raw_items.json` | 保留，不自动清理 | 断点续跑（`--stage=extract` 时跳过 M1） |
| `ingest_summary.json` | 保留 | 运营者查看处理统计 |
| `items.json` | 保留 | 断点续跑（`--stage=synthesize` 时跳过 M1+M2） |
| `needs_review.json` | 保留 | 人工复核入口 |
| `extraction_summary.json` | 保留 | 运营者查看抽取质量 |
| 最终日报 `.md` | 保留 | 历史查阅 |
| SVG/Mermaid 资源 | 保留 | 日报内联引用 |

**清理策略**: 不自动清理。用户可手动删除 `data/structured/{date}/` 和 `data/reports/{date}/` 目录。

### 4.3 数据版本管理

- 每个结构化文件头部可通过文件名分辨日期
- Zod schema 中埋入版本号字段 `schema_version: "1.0"`
- schema 变更时，在 `src/schema/` 目录中用 `v1/`, `v2/` 子目录承载向后兼容版本

---

## 5. 测试策略

### 5.1 测试金字塔

```
         ╱╲
        ╱  ╲           E2E: 1-2 个
       ╱    ╲          模拟全管道运行，20 条 fixture 数据
      ╱      ╲
     ╱────────╲
    ╱          ╲       集成测试: 6-10 个
   ╱            ╲      模块间接口测试 (Ingest→Extract, Extract→Synthesize)
  ╱──────────────╲
 ╱                  ╲
╱────────────────────╲  单元测试: 30-50 个
╱                      ╲ 每个函数独立测试，Mock LLM 调用
```

**覆盖率目标**: ≥80%（N3.2）

| 模块 | 单元测试数 | 集成测试数 | 重点测试 |
|------|:---------:|:---------:|----------|
| M1 INGEST | 8 | 2 | 文件读取、字段校验、跳过逻辑、去重 |
| M2 EXTRACT | 10 | 2 | 并发控制、重试逻辑、置信度阈值、补救 Prompt |
| M3 SYNTHESIZE | 10 | 2 | 统计聚合正确性、热点识别降级、数据不足 |
| M4 VISUALIZE | 8 | 0 | SVG 闭合性、颜色一致性、标签完整性 |
| M5 Pipeline | 6 | 2 | CLI 参数解析、阶段编排、失败传播 |
| M6 Models | 6 | 0 | Zod schema 字段级校验、边界值 |

### 5.2 Mock LLM 调用策略

```typescript
// tests/helpers/mock-llm.ts
export function createMockLLM() {
  return {
    call: jest.fn().mockResolvedValue(MOCK_EXTRACTION_RESPONSE),
  };
}

// Fixture 数据
export const MOCK_EXTRACTION_RESPONSE = {
  entities: {
    companies: ["Anthropic"],
    products: ["Claude"],
    people: [],
    technologies: ["LLM"],
  },
  topics: ["AI Safety", "模型评估"],
  category: "technology_breakthrough",
  sentiment: "positive",
  significance_score: 8,
  risk_level: "low",
  abstract: "这是用于测试的固定返回数据",
  extraction_confidence: 0.92,
  needs_review: false,
};
```

**Mock 策略**:
- 单元测试：完全 Mock LLM 调用，返回固定 fixture
- 集成测试：使用一个"模拟 LLM"函数，实际调用但用预定义响应表匹配输入
- E2E 测试：真实调用 LLM（可选，节省成本时跳过）

### 5.3 Fixture 数据设计

```typescript
// tests/fixtures/raw-news-items.ts
// 10-20 条人工构造的混合数据，覆盖：

export const RAW_FIXTURES = {
  // 正常中英文数据
  valid_zh: { /* ... */ },
  valid_en: { /* ... */ },

  // 边界数据
  empty_title: { /* ... */ },       // F1.3: 缺少必填字段
  short_content: { /* ... */ },      // F1.3: content < 50 字
  no_source_type: { /* ... */ },     // F1.2: 缺少 source.type

  // 边缘情况
  mixed_language: { /* ... */ },     // 中英混合
  high_risk: { /* ... */ },          // risk_level = critical
  same_title_similar: { /* ... */ }, // F1.5: 标题相似用于去重测试

  // 低置信度
  ambiguous_content: { /* ... */ },  // 内容模糊，期望 confidence < 0.6
};
```

**Fixture 数量分布**:
- 12 条正常数据（中英文各半）
- 4 条边界数据（缺失字段、过短内容）
- 2 条高相似度数据（去重测试）
- 2 条高风险/模糊数据

---

## 6. 关键风险与缓解措施

### 6.1 技术风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|:----:|:----:|----------|
| LLM API 不可用 | 低 | 高 | 重试机制 (3次 + 退避)；失败优雅跳过 |
| API 请求超时 | 中 | 中 | 设置 30s 超时；可重试 |
| Rate Limit (429) | 中 | 中 | 指数退避 + 并发控制 (3 并发上限) |
| 文件 I/O 失败 | 低 | 中 | 读/写失败记录日志，跳过该文件 |
| 日期解析错误 | 低 | 低 | 统一的 `parseDate()` 函数 + Zod datetime() 校验 |
| TypeScript 编译报错 | 中 | 高 | 启用 `strict: true`，CI 中 `tsc --noEmit` 检查 |

### 6.2 LLM 输出不确定性

| 风险 | 缓解措施 |
|------|----------|
| JSON 格式错误（缺失逗号/引号）| Zod schema 严格校验；尝试 JSON5 宽松解析作为 fallback |
| 实体遗漏（应识别但未识别）| Prompt 中给出具体实体类型示例；设置 entity 非空校验 |
| 置信度膨胀（LLM 总是打高分）| Prompt 中要求 "只有当非常确定时才打高分，模棱两可时打 0.5-0.7" |
| 幻觉（编造不存在的实体/事件）| `[ref]` 强制要求每条结论关联原始数据 ID；无引用则低置信度 |
| 情感判断偏差 | 要求 LLM 给出判断依据（原文引用）；不使用纯情感分析做高风险决策 |
| 分类不一致 | 固定分类枚举值 + 每类附简短定义引导 LLM |

### 6.3 数据质量风险

| 风险 | 缓解措施 |
|------|----------|
| 用户提供的原始数据质量差 | M1 中严格做字段校验和内容长度过滤 |
| 中英文混合导致抽取偏差 | 在 prompt 中明确标注每条的语言字段 |
| 数据量不足 10 条 | 输出低置信度警告；0 条则不生成日报 |
| 数据偏向性（来源单一）| 在趋势推演 prompt 中提示 "基于有限的来源" |
| 过时新闻（发布超过 7 天）| M1 统计中标注老新闻比例 |

---

## 7. 实现优先级与阶段划分

### 阶段划分 (Phase 4 TDD 实施顺序)

#### Stage 1 — 基础层（M6 Models + M5 Pipeline 骨架）

**预计耗时**: 1-2 天
**依赖**: 无

| 任务 | 说明 |
|------|------|
| S1.1 | 定义所有 TypeScript 接口 (F6.1-F6.5) |
| S1.2 | 实现所有 Zod Schema (F6.6) |
| S1.3 | 实现 Pipeline 框架（Stage 接口、Pipeline 类、CLI 入口）(F5.1, F5.3) |
| S1.4 | 实现 CLI 参数解析（--date, --stage）(F5.2, F5.4) |
| S1.5 | 实现分级日志系统 (F5.5) |
| S1.6 | 实现 LLM 客户端 + 重试机制 (F5.8, F5.9) |
| S1.7 | 实现 `withRetry` 通用函数 |

**验证标准**:
- `npm run build` 编译通过
- CLI 显示帮助信息
- 日志系统正确输出 5 级日志

#### Stage 2 — 数据摄入（M1 INGEST）

**预计耗时**: 0.5-1 天
**依赖**: Stage 1

| 任务 | 说明 |
|------|------|
| S2.1 | 读取 `data/raw/*.json` 文件 (F1.1) |
| S2.2 | Zod schema 校验必填字段 (F1.2) |
| S2.3 | 内容长度过滤 + 跳过逻辑 (F1.3) |
| S2.4 | 输出 `raw_items.json` + `ingest_summary.json` (F1.6) |
| S2.5 | 来源分布分组统计 (F1.4, P1) |
| S2.6 | 标题+来源去重 (F1.5, P2) |

**验证标准**:
- 10 条正常数据全部通过校验
- 缺失字段/过短内容被正确跳过
- 输出文件符合 `IngestSummary` 结构
- 测试覆盖跳过原因记录

#### Stage 3 — 结构化抽取（M2 EXTRACT）

**预计耗时**: 1-2 天
**依赖**: Stage 1 (LLM 客户端) + Stage 2 (数据)

| 任务 | 说明 |
|------|------|
| S3.1 | 抽取 Prompt 模板编写 (F2.1, F2.2) |
| S3.2 | 逐条 LLM 调用 + 并发控制（3 并发）(F2.1) |
| S3.3 | Zod 校验结构化输出 (F2.9) |
| S3.4 | 置信度阈值检查 + `needs_review` 标记 (F2.4, F2.5) |
| S3.5 | 低置信度补救 Prompt 重试 (F2.6) |
| S3.6 | 英文源 `title_zh` 强制填充 (F2.7) |
| S3.7 | `risk_level >= medium` 强制 `risk_rationale` (F2.8) |
| S3.8 | 写出 `items.json` + `needs_review.json` + `extraction_summary.json` (F2.10, F2.11) |

**验证标准**:
- 所有字段按 schema 输出
- 并发数不超过 3
- 重试机制正常（Mock LLM 返回错误时触发）
- 低置信度条目正确标记

#### Stage 4 — 洞察合成（M3 SYNTHESIZE）

**预计耗时**: 1.5-2 天
**依赖**: Stage 1 (类型) + Stage 3 (数据)

| 任务 | 说明 |
|------|------|
| S4.1 | 统计聚合函数（纯计算）(F3.1) |
| S4.2 | 热点识别 Prompt + LLM 调用 (F3.2) |
| S4.3 | 深度分析 Prompt + LLM 调用 (F3.3) |
| S4.4 | 趋势推演 Prompt + LLM 调用 (F3.4) |
| S4.5 | 机会风险 Prompt + LLM 调用 (F3.5, P1) |
| S4.6 | 日报 Markdown 组装 (F3.6) |
| S4.7 | `[ref]` 引用标注机制 (F3.7) |
| S4.8 | 数据不足处理 (F3.8, P1) |
| S4.9 | 矛盾信息标注 (F3.9, P2) |

**验证标准**:
- 统计聚合结果与手工计算结果一致
- 日报格式符合 spec 要求
- 每条 `[ref]` 都能在附录中找到对应条目
- 0 条数据时输出特定消息

#### Stage 5 — 可视化（M4 VISUALIZE）

**预计耗时**: 1-1.5 天
**依赖**: Stage 4 (数据)

| 任务 | 说明 |
|------|------|
| S5.1 | 话题热度柱状图 SVG 生成 (F4.1) |
| S5.2 | 情感分布环形图 SVG 生成 (F4.2) |
| S5.3 | 显著事件时间线 Mermaid 生成 (F4.3) |
| S5.4 | 趋势四维雷达图 SVG 生成 (F4.4) |
| S5.5 | 图表质量控制：viewBox/title/legend/标签 (F4.5) |
| S5.6 | 可选图表：实体共现/风险仪表盘/来源分布 (F4.6, P2) |
| S5.7 | 图表写入 assets/ + 日报内联引用 (F4.7) |

**验证标准**:
- 4 个必选图表全部生成
- SVG 都是有效 XML（可以由 `xmllint` 或正则检查）
- 色盲友好颜色方案
- 所有图表包含 title/legend/时间戳

#### Stage 6 — 管道集成 + 测试完善

**预计耗时**: 1-1.5 天
**依赖**: Stage 1-5

| 任务 | 说明 |
|------|------|
| S6.1 | 完整管道集成测试（E2E Mock LLM 版本）|
| S6.2 | 部分失败场景测试 |
| S6.3 | 性能测试（20 条数据 ≤5 分钟）(N1.2) |
| S6.4 | 覆盖率目标 ≥80% 验证 |
| S6.5 | 编写 `skills/` 下操作手册 |

**验证标准**:
- `npm run daily` 一键跑通
- 20 条 fixture 数据完整 E2E
- 覆盖率报告 ≥80%
- 失败场景不崩溃

### 7.1 优先级矩阵

```
                    ┌─────────────────────────────────────────┐
                    │           实施价值 (高 → 低)            │
                    │  P0 (核心价值观)  │  P1 (重要) │  P2 (锦上添花)│
┌──────────┬────────┼──────────────────┼────────────┼──────────────┤
│ 实施难度  │  低    │  S1(基础层)      │  F1.4      │  F1.5(去重)  │
│ (低→高)   │        │  S2(INGEST)      │  F2.11     │  F3.9(矛盾)  │
│           │        │  S3(EXTRACT) 核心 │  F3.5(机会)│  F4.6(可选)  │
│           │        │  S4(SYNTHESIZE)  │  F3.8(不足)│  F6.7(版本)  │
│           │        │  S5(VISUALIZE)   │            │              │
│           ├────────┼──────────────────┼────────────┼──────────────┤
│           │  高    │                  │            │              │
└──────────┴────────┴──────────────────┴────────────┴──────────────┘
```

**实施策略**: 先做 P0 全部功能，再做 P1，P2 放在 MVP 验证后。

### 7.2 里程碑

| 里程碑 | 完成条件 | 预计时间 |
|--------|----------|----------|
| M0: 基础就绪 | CLI 可运行 + 日志系统工作 + 模型定义完成 | Stage 1 完成后 |
| M1: 数据摄入闭环 | 从 raw JSON 到结构化数据文件就绪 | Stage 2 完成后 |
| M2: 洞察引擎闭环 | 从原始新闻到 Markdown 日报就绪 | Stage 4 完成后 |
| M3: 可视化闭环 | 日报包含所有图表 | Stage 5 完成后 |
| MVP 发布 | 全管道 20 条数据跑通，覆盖率 ≥80% | Stage 6 完成后 |

---

## 附录 A: 技术栈版本

| 技术 | 版本 | 备注 |
|------|:----:|------|
| TypeScript | ^6.0.3 | `strict: true` |
| Node.js | ≥ 18 | LTS |
| Jest | ^30.4.2 | 测试框架 |
| ts-jest | ^29.4.11 | TypeScript 转译 |
| Zod | ^3.x | 运行时校验 |
| @anthropic-ai/sdk | latest | Claude API (可选: 也可直接 fetch) |
| p-limit | ^6.x | 并发控制 (可选: 也可自实现) |

## 附录 B: 文件清单（最终产物）

```
src/
├── pipeline/
│   ├── cli.ts              # CLI 入口 (F5.1, F5.2)
│   ├── pipeline.ts         # Pipeline 编排 (F5.3, F5.4, F5.6, F5.7)
│   ├── logger.ts           # 分级日志 (F5.5)
│   ├── llm-client.ts       # LLM 客户端 (F5.8, F5.9)
│   └── model-config.ts     # 模型配置
├── schema/
│   ├── raw-news.ts         # RawNewsItem (F6.1)
│   ├── structured-insight.ts  # StructuredInsightItem (F6.2)
│   ├── summary.ts          # 各种 Summary 类型 (F6.3)
│   ├── analysis.ts         # TopEvent/DeepAnalysis/TrendAnalysis (F6.4)
│   └── report.ts           # DailyReport (F6.5)
├── ingest/
│   └── index.ts            # INGEST 实现 (F1.1-F1.6)
├── extract/
│   └── index.ts            # EXTRACT 实现 (F2.1-F2.11)
├── synthesize/
│   ├── stats.ts            # 统计聚合 (F3.1)
│   ├── hot-events.ts       # 热点识别 (F3.2)
│   ├── deep-analysis.ts    # 深度分析 (F3.3)
│   ├── trends.ts           # 趋势推演 (F3.4)
│   ├── risks.ts            # 机会风险 (F3.5)
│   └── report-assembler.ts # 日报组装 (F3.6)
└── visualize/
    ├── bar-chart.ts        # 柱状图 (F4.1)
    ├── donut-chart.ts      # 环形图 (F4.2)
    ├── timeline.ts         # Mermaid 时间线 (F4.3)
    └── radar-chart.ts      # 雷达图 (F4.4)

tests/
├── fixtures/
│   └── raw-news-items.ts   # 测试数据
├── helpers/
│   └── mock-llm.ts         # Mock LLM 工具
├── unit/
│   ├── ingest.test.ts
│   ├── extract.test.ts
│   ├── synthesize.test.ts
│   ├── visualize.test.ts
│   ├── pipeline.test.ts
│   └── schema.test.ts
└── integration/
    ├── ingest-extract.test.ts
    └── full-pipeline.test.ts
```
