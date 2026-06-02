# SKILL.md — Analyzer (日报分析合成器)

> **所属管道**: Stage 3 — SYNTHESIZE
> **依赖上游**: `skills/extractor/` (Stage 2 产出的结构化 JSON 数据)
> **输出流向**: `skills/visualizer/` (Stage 4, 为可视化提供分析结论) 和最终用户
> **最后更新**: 2026-06-01

---

## §1 技能定位

### 1.1 你是什么

**Analyzer** 是管道第三阶段的核心技能。你的职责是：

> 基于 Stage 2 产出的结构化 JSON 数据，通过聚合、统计、关联分析，合成一份**有逻辑支撑、可追溯、可操作**的"AI 分析日报"。

### 1.2 核心原则

| 原则 | 说明 |
|:-----|:----|
| **数据驱动** | 每条结论必须有结构化数据作为证据，禁止空洞形容词堆砌 |
| **分层递进** | 先统计，后归纳，再推演 — 不跳步骤 |
| **证据可追溯** | 所有引用标注 `[ref: {id}]`，读者可回溯原始数据 |
| **区分事实与观点** | 明确标注什么是"数据表明的"、什么是"我们的判断" |
| **信息密度优先** | 日报的目标是让读者 30 秒把握全局，3 分钟深入理解 |

---

## §2 输入与输出

### 2.1 输入 (来自 Stage 2)

```typescript
// 单个结构化条目
interface StructuredInsightItem {
  id: string;
  source: { name: string; type: string; url: string; published_at: string };
  title: string;
  title_zh: string | null;
  abstract: string;
  entities: { companies: Entity[]; products: Entity[]; people: Entity[]; technologies: Entity[] };
  topics: Topic[];
  category: { primary: string; secondary: string | null; confidence: number };
  sentiment: { overall: string; score: number; confidence: number };
  risk_level: string;
  risk_rationale: string | null;
  impact: {
    scope: string;
    time_horizon: string;
    category: string;
    significance_score: number;
    rationale: string;
  };
  extraction_confidence: number;
}

// 批次输入
interface ExtractionBatch {
  date: string;
  items: StructuredInsightItem[];
  summary: {
    total_items: number;
    extracted_successfully: number;
    needs_review: number;
    average_confidence: number;
  };
}
```

### 2.2 输出: 日报 Markdown

最终产出为 `.specs/daily-report/report.md`，结构如下:

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

---

## §3 操作流程 (SOP)

### Phase A: 统计聚合 (纯计算，不调用 AI)

```typescript
function aggregateStatistics(items: StructuredInsightItem[]) {
  return {
    // 1. 话题频次排名
    topic_frequency: countByTopic(items),           // { "大语言模型": 8, "AI监管": 5, ... }

    // 2. 来源分布
    source_distribution: countBySourceType(items),  // { tech_media: 10, official: 3, ... }

    // 3. 情感分布
    sentiment_distribution: countBySentiment(items),// { positive: 12, neutral: 5, negative: 3 }

    // 4. 风险分布
    risk_distribution: countByRiskLevel(items),     // { none: 10, low: 5, medium: 3, high: 2, critical: 0 }

    // 5. 显著度 Top-10 榜单
    top_by_significance: items
      .filter(i => i.extraction_confidence >= 0.5)
      .sort((a, b) => b.impact.significance_score - a.impact.significance_score)
      .slice(0, 10),

    // 6. 实体共现矩阵
    entity_co_occurrence: buildCoOccurrenceMatrix(items), // 哪些公司/技术经常一起出现

    // 7. 时间分布
    time_distribution: groupByHour(items),          // 事件按发布时间分布
  };
}
```

### Phase B: 热点识别 (轻量 AI 调用)

**目的**: 从 Phase A 的统计结果中，识别今日 Top 3 焦点事件。

**输入**: Phase A 的 `top_by_significance` + `topic_frequency`

**Prompt 策略**: 使用 §4.1 的 Top-3 热点识别 Prompt。输入仅为统计数据（不含原文），让 AI 基于结构化数据做判断。

**输出**:
```typescript
interface TopEvent {
  rank: number;                    // 1, 2, 3
  title: string;                   // 热点事件标题
  item_ids: string[];              // 关联的结构化条目 ID (一个热点可能对应多条新闻)
  significance: number;            // 综合重要性 (1-10)
  why_important: string;           // 为什么这是热点 (≤100 字)
  key_entities: string[];          // 核心涉及的实体
  sentiment_summary: string;       // 整体情感倾向概述
}
```

### Phase C: 深度分析 (逐热点 AI 调用)

**目的**: 对每个 Top 热点事件进行深度分析。

**输入**: 该热点关联的 `StructuredInsightItem[]` (通常 2-5 条) + 相关实体的背景知识

**Prompt 策略**: 使用 §4.2 的深度分析 Prompt。**每条热点独立调用一次 AI**，不混合。

**输出**:
```typescript
interface DeepAnalysis {
  event_title: string;
  background: string;              // 事件背景 (200-400 字)
  key_developments: string[];      // 关键进展 (bullet points)
  impact_analysis: {
    short_term: string;            // 短期影响
    medium_term: string;           // 中期影响
    affected_parties: string[];    // 受影响方
  };
  related_events: string[];        // 关联的历史事件或同期事件
  expert_perspective: string;      // 分析视角 (≤200 字)
  references: string[];            // [ref: xxx] 引用列表
}
```

### Phase D: 趋势推演 (综合分析)

**目的**: 从整个批次中提炼跨事件的趋势信号。

**输入**: 全部 `StructuredInsightItem[]` + Phase B/C 的分析结果

**Prompt 策略**: 使用 §4.3 的趋势推演 Prompt。**仅输入一次**，要求从四个维度输出。

**输出**:
```typescript
interface TrendAnalysis {
  technology: {
    trend: string;                 // 技术趋势判断
    confidence: number;
    supporting_items: string[];    // [ref: xxx]
    signals: string[];             // 支撑信号
  };
  application: {
    trend: string;                 // 应用落地趋势判断
    confidence: number;
    supporting_items: string[];
    signals: string[];
  };
  policy: {
    trend: string;                 // 政策/监管趋势判断
    confidence: number;
    supporting_items: string[];
    signals: string[];
  };
  capital: {
    trend: string;                 // 资本/市场趋势判断
    confidence: number;
    supporting_items: string[];
    signals: string[];
  };
  overall_narrative: string;       // 跨维度叙事: 今天 AI 世界的整体故事线
}
```

### Phase E: 机会与风险识别

**目的**: 从数据中识别 actionable insights。

**输入**: `risk_level >= medium` 的条目 + 趋势分析结果

**输出**:
```typescript
interface RiskOpportunityPanel {
  risks: Array<{
    description: string;
    level: "medium" | "high" | "critical";
    probability: "low" | "medium" | "high";
    related_items: string[];       // [ref: xxx]
    suggested_action: string;      // 建议应对措施
  }>;
  opportunities: Array<{
    description: string;
    category: "technology" | "business" | "policy";
    related_items: string[];       // [ref: xxx]
    rationale: string;
  }>;
}
```

### Phase F: 日报组装

将 Phase A-E 的结果组装为最终 Markdown 日报。**此阶段不需要 AI 调用**，纯粹的数据拼接与格式化。

---

## §4 Prompt 模板

### 4.1 Top-3 热点识别 Prompt

```markdown
## 角色

你是一个 AI 行业分析日报的主编。你的任务是基于今天的结构化 AI 新闻数据，识别出最重要的 Top 3 焦点事件。

## 输入数据

### 今日话题频次统计
{{topic_frequency_json}}

### 显著性 Top-10 新闻列表
{{top_10_items_summary}}

### 情感分布
{{sentiment_distribution_json}}

## 判断标准

在确定 Top 3 时，请综合考虑:
1. **显著性**: significance_score 高的自然优先
2. **话题集中度**: 同一话题下聚集了多条报道 = 行业共识焦点
3. **跨领域影响**: 是否同时涉及技术/政策/资本等多维度
4. **时间紧迫性**: impact.time_horizon 为 immediate 或 short_term 的事件优先
5. **风险等级**: risk_level ≥ medium 的事件应给予额外关注

## 输出格式

请严格按照以下 JSON 输出 (纯 JSON，不要 Markdown 代码块标记):

{
  "date": "{{date}}",
  "top_events": [
    {
      "rank": 1,
      "title": "<热点事件标题，简洁有力>",
      "item_ids": ["<关联的 structured item IDs>"],
      "significance": 0,
      "why_important": "<为什么是热点，≤100 字>",
      "key_entities": ["<核心实体列表>"],
      "sentiment_summary": "<整体情感倾向>"
    }
  ],
  "editorial_note": "<一句话总结今日 AI 行业的整体基调>"
}

## 约束
- 必须恰好输出 3 个热点事件
- 每个热点的 item_ids 至少关联 1 条结构化条目
- why_important 必须有具体的数据支撑，禁止 "这是重要事件" 等空洞表述
```

### 4.2 深度分析 Prompt (每个热点独立调用)

```markdown
## 角色

你是一个 AI 行业深度分析师。请对以下热点事件进行深度分析。

## 热点事件

**标题**: {{event_title}}
**重要性评分**: {{significance}}/10
**核心实体**: {{key_entities}}

## 关联新闻 (结构化数据)

{{#each related_items}}
---
**ID**: {{id}}
**来源**: {{source.name}} ({{source.type}})
**标题**: {{title}}
**摘要**: {{abstract}}
**话题**: {{topics_labels}}
**情感**: {{sentiment.overall}} (score: {{sentiment.score}})
**风险等级**: {{risk_level}}
{{#if risk_rationale}}**风险说明**: {{risk_rationale}}{{/if}}
**影响评估**: scope={{impact.scope}}, time_horizon={{impact.time_horizon}}, category={{impact.category}}
**重要性理由**: {{impact.rationale}}
{{/each}}

## 分析要求

请从以下角度进行深度分析:

### 1. 事件背景 (background)
- 该事件发生的行业背景和上下文
- 为什么这件事现在发生？（技术成熟度/市场推力/政策窗口）
- 200-400 字

### 2. 关键进展 (key_developments)
- 提炼 3-5 个关键进展点
- 每个点 1-2 句话
- 基于关联新闻中的具体信息，不要编造

### 3. 影响分析 (impact_analysis)
- **短期影响** (未来 1-3 个月): 直接影响哪些公司、产品、赛道？
- **中期影响** (3-12 个月): 可能引发什么连锁反应？
- **受影响方**: 列出直接和间接受影响的实体

### 4. 关联事件 (related_events)
- 近期的相关事件或历史类比事件
- 说明关联性

### 5. 分析视角 (expert_perspective)
- 从行业分析师的角度给出独立判断
- 不要只复述事实，要给出你的解读
- ≤200 字

## 输出格式

{
  "event_title": "{{event_title}}",
  "background": "<事件背景>",
  "key_developments": ["<进展1>", "<进展2>", "..."],
  "impact_analysis": {
    "short_term": "<短期影响>",
    "medium_term": "<中期影响>",
    "affected_parties": ["<受影响方1>", "..."]
  },
  "related_events": ["<关联事件1>", "..."],
  "expert_perspective": "<独立分析视角>",
  "references": ["ref: xxx", "ref: yyy"]
}

## 约束
- 所有分析必须基于输入的关联新闻数据
- 不要编造不存在的关联事件或背景
- references 必须对应到具体 input item 的 id
- 如果信息不足以支撑某个分析维度，标注 "基于当前数据无法判断"
```

### 4.3 趋势推演 Prompt

```markdown
## 角色

你是一个 AI 行业趋势分析师。请基于今日的全量结构化新闻数据，从四个维度推演行业趋势。

## 今日全部结构化数据摘要

### 话题分布
{{topic_frequency_json}}

### Top 3 热点
{{top_3_events_json}}

### 情感与风险全景
- 正面: {{positive_count}} 条
- 中性: {{neutral_count}} 条
- 负面: {{negative_count}} 条
- 有风险事项: {{risky_items_count}} 条 (medium: {{medium}}, high: {{high}}, critical: {{critical}})

### 实体聚合
- 提及最多的公司: {{top_companies}}
- 提及最多的技术: {{top_technologies}}
- 提及最多的产品: {{top_products}}

## 分析要求

从以下四个维度分别推演趋势。每个维度的判断必须有数据支撑。

### 技术维度 (technology)
- 今天的数据反映出哪些技术方向在加速/减速？
- 有没有出现新的技术关键词或范式转移信号？

### 应用维度 (application)
- 哪些应用场景/行业在积极采用 AI？
- 是否有新的落地模式或商业模式出现？

### 政策维度 (policy)
- 监管动向如何？哪些地区在收紧/放松？
- 有没有新出台的法规或标准？

### 资本维度 (capital)
- 资本流向如何？哪些赛道在吸金？
- 有没有大型融资、IPO、并购事件？

## 输出格式

{
  "technology": {
    "trend": "<趋势判断，1-2 句>",
    "confidence": 0.0,
    "supporting_items": ["ref: xxx", "ref: yyy"],
    "signals": ["<数据中观察到的支撑信号>"]
  },
  "application": { ... },
  "policy": { ... },
  "capital": { ... },
  "overall_narrative": "<今天 AI 行业的整体故事线，3-5 句话串联四个维度的核心发现>",
  "uncertainties": ["<基于当前数据无法确定的问题>"]
}

## 约束
- 每个趋势判断必须至少有 2 条 supporting_items
- 如果某个维度今天数据不足（<3 条相关新闻），confidence 调低并说明
- overall_narrative 要像一篇微型社论：有观点、有逻辑、有数据支撑
```

### 4.4 机会与风险识别 Prompt

```markdown
## 角色

你是一个 AI 行业风险管理与投资机会分析专家。请基于今日的结构化数据和分析结果，识别 actionable insights。

## 输入数据

### 风险条目汇总 (risk_level >= medium)
{{risky_items_summary_json}}

### 趋势分析结果
{{trend_analysis_json}}

### 情感负面条目
{{negative_items_summary_json}}

## 分析要求

### 风险识别
- 区分 "可量化风险" (如某公司股价可能下跌) 和 "系统性风险" (如新法规影响整个行业)
- 评估每个风险的发生概率: low (10-30%) / medium (30-60%) / high (60%+)
- 为每个风险提出建议应对措施

### 机会识别
- 从趋势中识别技术/商业/政策机会
- 机会必须有明确的时间窗口暗示 (immediate/short_term/medium_term)
- 说明为什么这个时间点值得关注

## 输出格式

{
  "risks": [
    {
      "description": "<风险描述>",
      "level": "medium|high|critical",
      "probability": "low|medium|high",
      "type": "quantifiable|systemic",
      "related_items": ["ref: xxx"],
      "suggested_action": "<建议应对，≤80 字>"
    }
  ],
  "opportunities": [
    {
      "description": "<机会描述>",
      "category": "technology|business|policy",
      "time_window": "immediate|short_term|medium_term",
      "related_items": ["ref: xxx"],
      "rationale": "<为什么现在是机会，≤100 字>"
    }
  ],
  "overall_risk_assessment": "<一句话总结今日的整体风险状况>"
}

## 约束
- 风险和机会都必须有数据依据
- 不要为了凑数而编造风险或机会
- 如果今天确实没有值得关注的 risk 或 opportunity，坦率输出空数组并说明原因
```

---

## §5 质量自检清单

日报组装完成后 (Phase F)，Analyzer 必须逐项检查:

### 内容完整性
- [ ] 日报包含概览面板 (Dashboard: 新闻总数、情感比、风险数、Top 话题)
- [ ] Top 3 热点事件有明确的排名理由
- [ ] 每个深度分析包含 background / key_developments / impact_analysis
- [ ] 趋势推演覆盖了四个维度 (technology, application, policy, capital)
- [ ] 每个维度至少有 2 条 `[ref: xxx]` 引用
- [ ] 机会与风险部分分析了所有 `risk_level >= medium` 的条目

### 逻辑一致性
- [ ] Top-3 排名与统计聚合结果不矛盾
- [ ] 趋势判断与情感分布/话题分布数据一致
- [ ] 风险描述与对应条目的 `risk_rationale` 字段不冲突

### 可追溯性
- [ ] 每条分析结论有对应的 `[ref: {id}]` 标注
- [ ] 所有引用的 `ref:id` 在附录 B 的索引中能找到
- [ ] 不存在无数据支撑的断言

### 可读性
- [ ] 日报标题和各级标题清晰
- [ ] 关键数字使用加粗或高亮
- [ ] 专业术语在首次出现时有解释
- [ ] 总字数在 2000-4000 字范围内（不含附录）

---

## §6 边界情况处理

### 6.1 数据不足时

- **总条目 < 10**: 报告顶部加 `⚠️ 今日数据量较少 (N 条)，分析结论的置信度可能偏低`
- **总条目 = 0**: 输出 "今日无可分析数据"，不强行生成日报
- **四维度中某个完全缺失**: 保持该维度，内容写 "今日无相关信号"，不删除维度

### 6.2 高噪音数据时

- **`extraction_confidence` 均值 < 0.5**: 日报加免责声明
- **`needs_review` 条目 > 总数 30%**: 报告顶部标注不确定性等级

### 6.3 矛盾信息处理

- 如果同一热点下的不同新闻给出矛盾信号: 在 deep analysis 中明确标注分歧，不强行统一口径

---

> **上游**: `skills/extractor/SKILL.md` — 结构化数据抽取规范
> **下游**: `skills/visualizer/SKILL.md` — 可视化图表生成
> **关联技能**: 当分析结论置信度低时，参考 `skills/retry/SKILL.md`
