# Daily AI Insight Engine — 项目说明文档

> **版本**: 1.0.0 | **日期**: 2026-06-01
> **对应笔试题**: AI 舆情分析日报系统 — 第六部分：说明文档

---

## 一、数据源说明

### 1.1 数据来源

本次 MVP 使用了 **20 条中英文混合 AI 新闻**，手动整理为 `data/raw/1.json`，来源覆盖 4 个类型：

| 来源名称 | 类型 | 条数 | 代表内容 |
|:---------|:-----|:----:|:---------|
| The News International | tech_media | 1 | NVIDIA Nemotron 3 Ultra 发布 |
| TechOrange | tech_media | 1 | 黄仁勋 COMPUTEX 2026 演讲 |
| 钛媒体 | tech_media | 1 | OpenAI 进军机器人 |
| 艾媒网 | tech_media | 2 | MiniMax M3、NVIDIA Cosmos 3 |
| AI 早报 (微信公众号) | tech_media | 3 | Anthropic 融资、OpenAI 下线、ElevenLabs |
| IT之家 | tech_media | 2 | Hermes Agent、阶跃星辰 |
| 4sysops | tech_media | 1 | OpenAI GPT-4.5/o3 下线 |
| 品玩 | tech_media | 1 | 阿里云百炼 CLI 开源 |
| ME AI News | tech_media | 1 | 智谱 AI 消费硬件 |
| python88.com | aggregator | 1 | llama.cpp 更新 |
| BAAI Hub | aggregator | 2 | 阶跃星辰、面壁智能 |
| 东方财富 | aggregator | 1 | 百度文心 5.1 发布 |

### 1.2 选择理由

1. **时间集中**: 数据集中在 2026 年 5 月 28 日 — 6 月 1 日，确保日报有"今日感"
2. **话题覆盖**: 覆盖技术突破（模型发布）、资本动态（融资）、政策合规（生物防御）、应用落地（Agent/机器人）四个维度
3. **中英文平衡**: 10 条中文 + 10 条英文，验证多语言处理能力
4. **来源多样**: 传统科技媒体 + 行业垂直媒体 + 聚合平台，避免单一视角
5. **实体丰富**: 涉及 NVIDIA、OpenAI、Anthropic、MiniMax、百度、字节跳动等核心玩家

### 1.3 数据特点

- **格式**: JSON 数组，每条包含 `id`, `title`, `content`, `source`, `published_at`, `language`
- **内容长度**: 150-500 字/条，信息密度适中
- **语言标记**: `en` / `zh` 明确标注，便于抽取阶段的翻译策略
- **质量**: 全部 20 条数据通过 Zod schema 校验，0 条跳过

---

## 二、系统设计思路

### 2.1 整体架构

```
┌──────────────────────────────────────────────────────────────┐
│                    CLI 入口 (npm run daily)                    │
│                    src/pipeline/index.ts                       │
└──────────────────────────┬───────────────────────────────────┘
                           │
    ┌──────────────────────┼──────────────────────┐
    │                      │                      │
    ▼                      ▼                      ▼
┌───────┐   RawNewsItem[]  ┌─────────┐   Structured   ┌──────────┐
│ M1    │ ───────────────▶ │ M2      │ ─────────────▶ │ M3       │
│INGEST │                  │ EXTRACT │  InsightItem[] │SYNTHESIZE│
│ 纯计算 │                  │ 逐条AI  │                │ 聚合+AI  │
└───────┘                  └─────────┘                └────┬─────┘
                                                          │
                              ┌───────────────────────────┤
                              │                           │
                              ▼                           ▼
                         ┌──────────┐              ┌──────────┐
                         │ M4       │              │  Daily   │
                         │VISUALIZE │              │  Report  │
                         │ 纯代码   │              │  .md/.html│
                         └──────────┘              └──────────┘
```

### 2.2 关键设计决策

| 决策 | 选择 | 理由 |
|:-----|:-----|:-----|
| 管道架构 | 同步顺序管道 | 20 条数据量小，无需消息队列；分层测试方便；阶段间数据文件可独立检查 |
| LLM 后端 | DeepSeek (OpenAI 兼容) | 成本低、中文能力强、API 兼容性好 |
| 抽取粒度 | 逐条 1 item/batch | 防止 LLM 注意力稀释，保证每条质量；满足笔试题"不允许一次性丢给 AI" |
| 合成策略 | 先纯计算聚合 → 再 AI 分析 | 统计确定性工作不应浪费 token；AI 专注需要推理的部分 |
| 可视化 | 纯 TypeScript 生成 SVG | 不依赖外部渲染库；自包含；可嵌入 HTML |
| 数据校验 | Zod (运行时) + TypeScript (编译时) | 双保险：编译时类型检查 + 运行时 LLM 输出校验 |
| 测试策略 | TDD (RED→GREEN→REFACTOR) | 每个模块先写测试再写实现；LLM 依赖通过 Mock 隔离 |
| 模块解耦 | 依赖注入 (LLMClient) | 测试可用 mock；生产可切换模型 |
| CLI 框架 | 零框架 (纯 process.argv) | MVP 阶段不引入额外依赖；够用且简单 |

### 2.3 目录结构

```
daily-ai-insight-engine/
├── src/
│   ├── schema/          # M6: 共享类型 + Zod schema（全管道契约）
│   ├── llm-client.ts    # LLM 调用封装（DeepSeek, 重试/退避/Mock）
│   ├── logger.ts        # 5 级分级日志
│   ├── ingest/          # M1: 文件读取 + 数据验证
│   ├── extract/         # M2: Prompt 引擎 + 逐条 LLM 抽取
│   ├── synthesize/      # M3: 统计聚合 + AI 分析 + 日报组装
│   ├── visualize/       # M4: SVG 图表 + Mermaid + HTML 生成
│   └── pipeline/        # M5: 管道编排 + CLI 入口
├── tests/               # 275 个测试 (14 套件)
├── skills/              # Agent 操作手册 (extractor/analyzer/visualizer)
├── data/
│   ├── raw/             # 原始新闻 JSON
│   └── reports/         # 日报输出 (report.md + index.html + assets/)
└── .specs/feature/      # SDD 需求文档 (spec.md/plan.md/tasks.md)
```

---

## 三、AI 使用方式

### 3.1 使用场景与分批策略

**分批处理（核心约束）**：

| 阶段 | 分批粒度 | 并行策略 | 原因 |
|:-----|:--------|:--------|:-----|
| M1 INGEST | 无 AI | — | 纯文件读取 |
| **M2 EXTRACT** | **每 3 条一个 batch** | **batch 内并行, batch 间串行** | 满足"严禁一次性丢给 AI"的硬性约束；20 条 = 7 个 batch |
| M3 SYNTHESIZE | 逐热点独立调用 | 顺序 | 每个热点需要不同上下文 |

**M2 batch 执行示意**（以 20 条为例）：
```
Batch 1: [item-001, item-002, item-003] → Promise.all (并行)
Batch 2: [item-004, item-005, item-006] → Promise.all (并行)
Batch 3: [item-007, item-008, item-009] → Promise.all (并行)
Batch 4: [item-010, item-011, item-012] → Promise.all (并行)
Batch 5: [item-013, item-014, item-015] → Promise.all (并行)
Batch 6: [item-016, item-017, item-018] → Promise.all (并行)
Batch 7: [item-019, item-020]           → Promise.all (并行)
```
每 batch 内最多 3 条同时调用 LLM，batch 间顺序等待，保证任何时候最多 3 个并发请求。

**AI 调用分布**：
|:-----|:--------|:--------------:|:-----|
| M1 INGEST | ❌ 无 | 0 | 纯文件读取 + Zod 校验 |
| M2 EXTRACT | ✅ 逐条 | 20-40 | 非结构化新闻 → 结构化 JSON |
| M3 SYNTHESIZE | ✅ 分阶段 | 3-6 | 热点识别 + 深度分析 + 趋势推演 + 机会风险 |
| M4 VISUALIZE | ❌ 无 | 0 | 纯 TypeScript 生成 SVG/Mermaid |
| **合计** | | **23-46 次** | |

### 3.2 Prompt 设计

所有 Prompt 模板遵循以下原则：

1. **角色定义**: 每条 prompt 开头明确 AI 的角色（"你是一个 AI 新闻结构化抽取引擎"）
2. **结构化约束**: JSON Schema 内嵌在 prompt 中，明确要求"只输出纯 JSON"
3. **字段指南**: 每个字段附带抽取指南（如何判断 sentiment、如何评估 risk_level）
4. **置信度透明**: 要求每个 AI 生成字段附带 `confidence` 评分
5. **可追溯性**: Prompt 中传递原始数据 id，确保输出可回溯

**M2 主抽取 Prompt 结构** (详见 `src/extract/prompt-builder.ts`):
```
角色定义 → 核心原则 → 输入数据 → JSON Schema → 字段抽取指南 → 输出指令
```

**M3 分析 Prompt 结构** (详见 `src/synthesize/analyzer.ts`):
```
角色定义 → 统计数据输入 → 判断标准 → 输出格式 → 约束条件
```

### 3.3 错误处理

| 层级 | 策略 | 说明 |
|:-----|:-----|:-----|
| LLM API 层 | Exponential Backoff 重试 3 次 (1s/2s/4s) | 网络超时、429、5xx 自动重试 |
| 抽取结果层 | Zod schema 校验失败 → 补救 Prompt 重试 1 次 | 针对低置信度或校验失败的场景 |
| 抽取失败降级 | 单条失败 → 标记 null，继续下一条 | 不阻断整批处理 |
| 合成失败降级 | LLM 调用失败 → 使用默认值 | 趋势为空时显示"暂无数据" |
| 管道失败降级 | 阶段失败 → 记录日志，继续后续阶段 | INGEST 失败则停止（数据基础不存在） |

---

## 四、核心流程说明

### 4.1 从原始数据到最终报告的完整流程

```
Step 1: 用户将新闻 JSON 放入 data/raw/
    │
    ▼
Step 2: M1 INGEST (src/ingest/)
    │   NewsReader 扫描 data/raw/*.json
    │   NewsValidator 用 Zod schema 逐条校验
    │   输出: RawNewsItem[] (20 条合格) + IngestSummary
    │   耗时: <1 秒
    │
    ▼
Step 3: M2 EXTRACT (src/extract/)
    │   NewsExtractor 分批逐条调用 LLM
    │   每 3 条打包为一个 batch，batch 内并行、batch 间串行
    │   20 条数据 = 7 个 batch (6×3 + 1×2)
    │   每条独立调用一次 LLM: buildExtractionPrompt() 构建 prompt
    │   LLM 返回 JSON → cleanJsonResponse() → JSON.parse() → Zod 校验
    │   低置信度 (<0.4) → buildRemedialPrompt() 补救重试 (仅一次)
    │   输出: StructuredInsightItem[] (含 entities/topics/sentiment/risk)
    │   耗时: ~50 秒 (20 条, 3 并发, ~2.5 秒/条)
    │
    ▼
Step 4: M3 SYNTHESIZE (src/synthesize/)
    │   Phase A: StatsAggregator 纯计算统计 (话题频次/情感分布/风险分布/Top-10)
    │   Phase B: InsightAnalyzer.identifyTopEvents() → Top 3 热点 (轻量 AI)
    │   Phase C: InsightAnalyzer.analyzeEvent() → 深度分析 (逐热点 AI)
    │   Phase D: InsightAnalyzer.analyzeTrends() → 四维趋势推演 (综合 AI)
    │   Phase E: InsightAnalyzer.identifyRisksAndOpportunities() → 机会风险
    │   Phase F: ReportBuilder 组装 DailyReport → toMarkdown() → Markdown 字符串
    │   耗时: ~80 秒 (AI 调用为主)
    │
    ▼
Step 5: M4 VISUALIZE (src/visualize/)
    │   SvgGenerator 生成话题柱状图 + 情感饼图 + 趋势雷达图 (纯计算)
    │   HtmlBuilder 将所有内容打包为自包含 HTML
    │   耗时: <1 秒
    │
    ▼
Step 6: 输出文件
    │   data/reports/{date}/report.md   (Markdown 日报)
    │   data/reports/{date}/index.html  (HTML 日报, 内联 SVG)
    │   data/reports/{date}/assets/     (独立图表文件)
    │
    ▼
    ✅ 完成：总耗时 ~120 秒
```

### 4.2 关键数据流

```
RawNewsItem                    (M1 输出)
  │ title, content, source, published_at, language
  ▼
StructuredInsightItem          (M2 输出 → M3/M4 输入)
  │ + entities { companies, products, people, technologies }
  │ + topics [{ label, category, confidence }]
  │ + sentiment { overall, score, confidence }
  │ + risk_level, risk_rationale
  │ + impact { scope, time_horizon, significance_score, rationale }
  │ + extraction_confidence, needs_review
  ▼
AggregationStats               (M3 Phase A)
  │ topic_frequency, sentiment_distribution, risk_distribution
  │ top_by_significance, entity_co_occurrence
  ▼
DailyReport                    (M3 Phase F → PipelineResult)
  │ dashboard, top_events[], deep_analyses[], trend_analysis
  │ risk_opportunity, references_index[]
  ▼
report.md / index.html         (最终输出)
```

---

## 五、Schema 设计思路

### 5.1 设计原则

1. **原子性 (Atomicity)**: 每个字段表达单一事实。例如 `sentiment` 拆分为 `overall`（整体倾向）和 `score`（量化分数 -1.0~1.0），而非一个含糊的"情感标签"。

2. **可查询性 (Queryability)**: 字段设计支持结构化查询。例如"今天有哪些 high risk 的新闻？"可以通过 `risk_level == 'high'` 过滤，而不需要全文搜索。

3. **可追溯性 (Traceability)**: 每条结构化记录保留 `source.url`；分析结论用 `[ref: {id}]` 引用；`references_index` 提供完整索引。

4. **置信度透明 (Confidence Transparency)**: 每个 AI 生成字段附带 `confidence` 评分。低置信度条目标记 `needs_review = true`，下游可选择性忽略或人工复核。

### 5.2 核心字段设计决策

| 字段 | 设计理由 |
|:-----|:--------|
| `entities.{companies, products, people, technologies}` | 四类实体分库存储，支持"涉及 OpenAI 的新闻"这种精确查询。每人/每产品独立标注 confidence |
| `topics[{label, category, confidence}]` | 多标签设计（一条新闻可能同时涉及"技术突破"和"资本动态"）。category 用枚举约束，label 用自由文本 |
| `sentiment.{overall, score, confidence}` | overall 提供定性判断（正面/中性/负面），score 提供定量刻度（-1.0~1.0），适应不同的展示需求 |
| `risk_level (none/low/medium/high/critical)` | 五级风险评估，对标行业预警标准。medium+ 强制填写 risk_rationale |
| `impact.{scope, time_horizon, significance_score, rationale}` | 四维影响评估：影响范围（全球/区域/公司/个人）、时间跨度（即时/短期/中期/长期）、重要性 1-10 分、评分理由 |
| `extraction_confidence` | 整体抽取置信度，质量控制门禁：<0.4 触发补救重试，<0.6 标记 needs_review |
| `title_zh` | 英文新闻强制翻译，保证日报中文一致性 |

### 5.3 为什么不是简单的 Summary？

Summary（摘要）是自然语言、不可查询、不可聚合。我们的结构化 Schema 允许：

- **跨新闻聚合**: "本周 risk_level≥medium 的事件有哪些？"→ 过滤查询
- **统计分析**: "正面情感占比？"→ 聚合计算
- **实体关联**: "OpenAI 和 NVIDIA 在哪些新闻中同时出现？"→ 共现分析
- **可视化输入**: 每个图表的数据点直接来自结构化字段（sentiment.score → 饼图，significance_score → Top-N 排名）

---

## 六、技术栈

| 层 | 技术 |
|:---|:-----|
| 语言 | TypeScript (strict:true) |
| 运行时 | Node.js ≥18 |
| LLM | DeepSeek (deepseek-chat / deepseek-v4-flash) |
| LLM SDK | openai v6 (兼容 DeepSeek API) |
| 数据校验 | Zod v4 |
| 测试 | Jest + ts-jest (275 tests) |
| 可视化 | 纯 TypeScript → SVG / Mermaid / HTML |
| 包管理 | npm |

---

## 七、运行方式

```bash
# 1. 安装依赖
npm install

# 2. 设置 API Key
export DEEPSEEK_API_KEY="sk-..."

# 3. 放入数据文件到 data/raw/ (JSON 数组格式)

# 4. 一键运行
npm run daily

# 5. 查看结果
#    data/reports/{date}/report.md   — Markdown 日报
#    data/reports/{date}/index.html  — HTML 日报 (浏览器打开)
```

---

> 本项目的完整 Spec/Plan/Tasks 见 `.specs/feature/`，Agent 操作手册见 `skills/`，项目宪法见 `CLAUDE.md`。
