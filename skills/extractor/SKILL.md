# SKILL.md — Extractor (结构化抽取器)

> **所属管道**: Stage 2 — EXTRACT
> **依赖上游**: `skills/ingest/` (Stage 1 产出的标准化原始数据)
> **输出流向**: `skills/analyzer/` (Stage 3) 和 `skills/visualizer/` (Stage 4)
> **最后更新**: 2026-06-01

---

## §1 技能定位

### 1.1 你是什么

**Extractor** 是管道第二阶段的核心技能。你的职责是：

> 将经过 Stage 1 清洗的**非结构化 / 半结构化 AI 新闻文本**，按照项目定义的 JSON Schema，逐条抽取为**结构化、可查询、可聚合的数据记录**。

### 1.2 你解决什么问题

| 常见错误做法 | Extractor 的正确做法 |
|:------------|:-------------------|
| 让 LLM 直接写一段 summary | 按字段逐项抽取，每个字段独立生成 |
| 一次性传入 20 条新闻让 LLM 批量处理 | 逐条处理 (1 item/batch)，保持注意力聚焦 |
| 抽取结果只有自然语言文本 | 输出严格符合 JSON Schema，包含 confidence 评分 |
| 中英文混在一起不做区分 | 英文内容抽取 `title_zh` 翻译字段，中文保留原文 |

---

## §2 输入与输出契约

### 2.1 输入格式 (来自 Stage 1)

```typescript
interface RawNewsItem {
  id: string;                    // 唯一标识符
  title: string;                 // 原始标题
  content: string;               // 正文内容或摘要
  source: {
    name: string;                // e.g., "TechCrunch", "机器之心"
    type: "tech_media" | "official" | "social_media" | "aggregator";
    url: string;                 // 原始链接
  };
  published_at: string;          // ISO 8601
  language: "zh" | "en" | "mixed";
}
```

### 2.2 输出格式 (流向 Stage 3 & 4)

```typescript
interface StructuredInsightItem {
  // --- 元信息 (透传自上游) ---
  id: string;
  ingested_at: string;           // 系统摄入时间戳，本阶段追加

  // --- 原始数据引用 (透传自上游) ---
  source: RawNewsItem["source"];

  // --- 内容抽取 ---
  title: string;
  title_zh: string | null;       // 非中文源时必填
  abstract: string;              // AI 生成的 1-2 句摘要 (≤120 字)
  entities: {
    companies: Array<{ name: string; confidence: number }>;
    products: Array<{ name: string; confidence: number }>;
    people: Array<{ name: string; confidence: number }>;
    technologies: Array<{ name: string; confidence: number }>;
  };
  topics: Array<{
    label: string;
    category: "technology" | "application" | "policy" | "capital" | "ethics" | "other";
    confidence: number;
  }>;
  category: {                    // 主分类
    primary: string;
    secondary: string | null;
    confidence: number;
  };
  sentiment: {
    overall: "positive" | "neutral" | "negative";
    score: number;               // -1.0 (极负面) ~ +1.0 (极正面)
    confidence: number;
  };
  risk_level: "none" | "low" | "medium" | "high" | "critical";
  risk_rationale: string | null; // risk_level > low 时必须填写

  // --- 影响评估 ---
  impact: {
    scope: "global" | "regional" | "company" | "individual";
    time_horizon: "immediate" | "short_term" | "medium_term" | "long_term";
    category: "technology" | "application" | "policy" | "capital" | "ethics";
    significance_score: number;  // 1-10
    rationale: string;           // ≤100 字
  };

  // --- 质量控制 ---
  extraction_confidence: number; // 0.0 - 1.0，整体置信度
  needs_review: boolean;
  review_reason: string | null;
}
```

---

## §3 操作流程 (SOP)

### Step 1: 读取并验证输入

```
1. 从 data/raw/ 读取待处理的 RawNewsItem[]
2. 验证每条数据的必填字段完整性
3. 对于缺少 content 或 content 长度 < 50 字符的条目，标记为 "insufficient_data" 并跳过
4. 按 source.type 分组统计，输出摘要: "共 N 条待抽取: tech_media X, official Y, social_media Z, aggregator W"
```

### Step 2: 逐条抽取 (核心步骤)

对每条 `RawNewsItem`，**独立发起一次 LLM 调用**（不混合多条），使用 §4 中的 Prompt 模板。

抽取顺序:
1. **先抽取实体 (entities)**: 识别公司、产品、人物、技术 — 这是最客观的抽取
2. **再分类 (category + topics)**: 确定主分类和话题标签
3. **再判断情感 (sentiment)**: 基于整体语气判断正负面
4. **再评估风险 (risk_level)**: 判断是否存在政策/安全/商业风险
5. **最后评分 (impact)**: 综合评估重要性和影响范围

### Step 3: 结果校验

对 LLM 返回的 JSON 进行校验:

```typescript
function validateStructuredItem(item: StructuredInsightItem): ValidationResult {
  const errors: string[] = [];

  // 1. 必填字段检查
  if (!item.entities.companies.length && !item.entities.products.length
      && !item.entities.people.length && !item.entities.technologies.length) {
    errors.push("entities: 至少需识别出一个实体");
  }
  if (!item.topics.length) {
    errors.push("topics: 至少需要一个话题标签");
  }
  if (!item.abstract || item.abstract.length > 120) {
    errors.push("abstract: 非空且不超过 120 字");
  }

  // 2. 置信度阈值检查
  if (item.extraction_confidence < 0.6) {
    errors.push(`extraction_confidence 过低: ${item.extraction_confidence}`);
  }
  if (item.sentiment.confidence < 0.5) {
    errors.push(`sentiment confidence 过低: ${item.sentiment.confidence}`);
  }

  // 3. 风险一致性检查
  if (item.risk_level !== "none" && item.risk_level !== "low" && !item.risk_rationale) {
    errors.push(`risk_level=${item.risk_level} 但 risk_rationale 为空`);
  }

  // 4. 语言一致性检查
  if (item.source.name.match(/[TechCrunch|The Verge|Ars Technica|VentureBeat]/)
      && !item.title_zh) {
    errors.push("非中文源但 title_zh 为空");
  }

  return { valid: errors.length === 0, errors };
}
```

校验失败的条目:
- 如果 `extraction_confidence < 0.4`: 标记 `needs_review=true`，使用备用策略（更详细的 prompt）重试一次
- 如果仅缺少 optional 字段: 补填 null，正常通过
- 如果必填字段缺失: 记录 `review_reason`，标记 `needs_review=true`

### Step 4: 输出写入

```
1. 将校验通过的条目写入 data/structured/{date}/items.json
2. 将 need_review=true 的条目单独写入 data/structured/{date}/needs_review.json
3. 写入处理摘要 data/structured/{date}/extraction_summary.json:
   {
     "date": "2026-06-01",
     "total_items": 20,
     "extracted_successfully": 18,
     "needs_review": 2,
     "skipped": 0,
     "average_confidence": 0.82,
     "extraction_duration_seconds": 45
   }
```

---

## §4 Prompt 模板

### 4.1 主抽取 Prompt (逐条使用)

> **使用方式**: 每条 `RawNewsItem` 独立调用，模板中的 `{{PLACEHOLDER}}` 替换为实际值。

```markdown
## 角色

你是一个 AI 新闻结构化抽取引擎。你的任务是将给定的 AI 行业新闻，按照指定的 JSON Schema 进行字段级的结构化抽取。

## 核心原则

1. **原子抽取**: 每个字段表达一个单一事实，不混合多条信息
2. **置信度透明**: 对每个 AI 生成字段标注 0.0-1.0 的置信度
3. **有据可依**: 所有字段值直接从原文本中推导，不做无依据的推测
4. **语言规范**: entity name 尽量使用英文原名，必要时附带中文翻译

## 输入数据

- **ID**: {{id}}
- **标题**: {{title}}
- **正文/摘要**: {{content}}
- **来源**: {{source_name}} (类型: {{source_type}})
- **发布时间**: {{published_at}}
- **语言**: {{language}}

## JSON Schema

请严格按照以下 JSON Schema 输出（不要输出 Markdown 代码块标记，只输出纯 JSON）:

{
  "id": "{{id}}",
  "ingested_at": "{{ingested_at}}",
  "source": {
    "name": "{{source_name}}",
    "type": "{{source_type}}",
    "url": "{{source_url}}",
    "published_at": "{{published_at}}"
  },
  "title": "<原始标题>",
  "title_zh": "<中文翻译，如果原文为中文则为 null>",
  "abstract": "<1-2句AI生成的摘要，不超过120字>",
  "entities": {
    "companies": [{"name": "<公司名>", "confidence": 0.0}],
    "products": [{"name": "<产品名/模型名/服务名>", "confidence": 0.0}],
    "people": [{"name": "<人物全名>", "confidence": 0.0}],
    "technologies": [{"name": "<技术/算法/框架名>", "confidence": 0.0}]
  },
  "topics": [
    {
      "label": "<话题标签，例如: '大语言模型'、'AI监管'、'自动驾驶'>",
      "category": "technology|application|policy|capital|ethics|other",
      "confidence": 0.0
    }
  ],
  "category": {
    "primary": "<主分类标签>",
    "secondary": "<次分类标签 或 null>",
    "confidence": 0.0
  },
  "sentiment": {
    "overall": "positive|neutral|negative",
    "score": 0.0,
    "confidence": 0.0
  },
  "risk_level": "none|low|medium|high|critical",
  "risk_rationale": "<风险理由说明，risk_level <= low 时为 null>",
  "impact": {
    "scope": "global|regional|company|individual",
    "time_horizon": "immediate|short_term|medium_term|long_term",
    "category": "technology|application|policy|capital|ethics",
    "significance_score": 0,
    "rationale": "<评分理由，不超过100字>"
  },
  "extraction_confidence": 0.0,
  "needs_review": false,
  "review_reason": null
}

## 字段抽取指南

### entities（实体识别）
- companies: 公司全名，如 "OpenAI", "Google DeepMind", "百度"
- products: 产品或模型名，如 "GPT-5", "Gemini", "文心一言"
- people: 人物全名，如 "Sam Altman", "李彦宏"（仅当人物是新闻核心时提取，非提及即提取）
- technologies: 具体技术名，如 "Transformer", "RLHF", "MoE"
- 如果没有识别到某类实体，返回空数组 []

### category（分类）
- technology: 纯技术突破、算法创新、论文发表
- application: 产品发布、落地应用、商业合作
- policy: 监管政策、法律法规、伦理规范
- capital: 融资、IPO、收购、股价波动
- ethics: 安全对齐、偏见、隐私争议

### sentiment（情感判断）
- positive: 技术突破、产品成功、行业利好
- neutral: 客观报道、数据发布
- negative: 安全事故、监管处罚、舆论危机
- score: -1.0 (极负面) 到 +1.0 (极正面)

### risk_level（风险评估）
- none: 无任何风险关联
- low: 提及风险但影响极小
- medium: 可能影响行业格局或公司业务
- high: 涉及安全事故、重大政策变化、市场剧烈波动
- critical: 涉及公共安全、重大伦理事件、系统性风险

### impact.significance_score（重要性 1-10）
- 1-3: 常规动态，影响面小
- 4-6: 值得关注，行业内有影响
- 7-8: 重要事件，可能改变行业格局
- 9-10: 重大里程碑或系统性事件
- rationale 中必须说明为什么给出这个分数（引用原文中的具体依据）

请输出结构化 JSON:
```

### 4.2 低置信度补救 Prompt

> **使用场景**: 当 Stage 3 校验发现 `extraction_confidence < 0.4` 时，使用此模板重试。

```markdown
## 角色

你是一个 AI 新闻结构化抽取引擎（仔细模式）。

之前对该条新闻的抽取结果置信度较低（{{previous_confidence}}），原因是: {{review_reason}}。

请重新仔细阅读以下文本，特别关注之前遗漏或不确定的部分。

## 原始文本

**标题**: {{title}}
**正文**: {{content}}
**来源**: {{source_name}}

## 特别提醒

{{#if missing_entities}}
- 上次抽取可能遗漏了实体，请仔细扫描文中的公司名、产品名、人物名
{{/if}}
{{#if unclear_sentiment}}
- 原文情感倾向不明，请注意文中的形容词、转折词、对比句
{{/if}}
{{#if low_confidence_topics}}
- 话题分类置信度低，请注意文中的关键词和技术术语
{{/if}}

请使用与主抽取 Prompt 相同的 JSON Schema 重新输出。确保每个字段的 confidence 反映你的确定程度。
```

### 4.3 批量结果总结 Prompt

> **使用场景**: 所有逐条抽取完成后，生成一个总览摘要供 Stage 3 快速索引。

```markdown
## 角色

你是一个数据摘要引擎。你已经完成了 {{total}} 条 AI 新闻的结构化抽取。

以下是抽取结果的关键字段汇总（JSON 数组，每条仅含 id, title, category, sentiment, risk_level, significance_score）:

{{summary_json_array}}

请用 3-5 句话总结:

1. 这批数据中占比最高的 3 个话题是什么？
2. 风险等级 ≥ medium 的有几条？分别涉及什么方面？
3. significance_score ≥ 7 的重要事件有几条？
4. 整体情感倾向如何（正面/负面/中性比例）？

输出格式: 自然语言段落，不做 JSON 输出。
```

---

## §5 常见抽取场景与策略

### 5.1 科技媒体报道 (tech_media)

**特点**: 标题党较多，正文比标题更可靠
**策略**: 以正文内容为主要抽取依据，标题仅作参考。对 `significance_score` 的判断需要结合正文细节，不被标题夸大影响。

### 5.2 官方发布 (official)

**特点**: 措辞严谨，不夸大，confidence 通常较高
**策略**: 直接抽取即可，但需注意辨别官方公告中的"计划/即将/有望"与"已发布/已实现"的区别。

### 5.3 社交媒体 (social_media)

**特点**: 信息碎片化，情绪化表达多，噪声大
**策略**:
- `extraction_confidence` 天然较低，预期 0.5-0.7
- `sentiment` 判断需区分"社区情绪"与"事件本身的性质"
- 缺少足够实体信息时，`needs_review` 标记为 true

### 5.4 聚合平台 (aggregator)

**特点**: 通常只有标题和链接，正文内容缺失
**策略**:
- `content` 不足 100 字符时，`extraction_confidence` 降低 0.2
- 仅基于标题抽取，所有置信度字段适当下调
- 在 `review_reason` 中注明 "insufficient_content"

---

## §6 质量自检清单

每批次处理完成后，Extractor 必须自检:

- [ ] 每条记录的 `entities` 至少有一个非空数组（兜底检查）
- [ ] `category.primary` 在 5 个合法值 (technology/application/policy/capital/ethics) 中
- [ ] `risk_level` 为 medium/high/critical 时 `risk_rationale` 非空
- [ ] `impact.significance_score` 在 1-10 范围内
- [ ] `impact.rationale` 包含具体依据（不允许 "综合判断" 等空洞表述）
- [ ] 英文源新闻的 `title_zh` 已填充
- [ ] 所有 confidence 值在 0.0-1.0 范围内
- [ ] 批次级 `extraction_summary.json` 已写入
- [ ] `needs_review.json` 中每条都有明确的 `review_reason`

---

> **关联技能**: 抽取失败或置信度过低的情况，参考 `skills/retry/SKILL.md` 中的容错与重试策略。
> **上游**: `skills/ingest/SKILL.md` — 数据摄入与清洗规范
> **下游**: `skills/analyzer/SKILL.md` — 基于本阶段输出的日报分析合成
