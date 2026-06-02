// =============================================================================
// M2 EXTRACT — Prompt 构建引擎
// =============================================================================

import { RawNewsItem } from '../schema/types';

// ---------------------------------------------------------------------------
// Prompt 模板
// ---------------------------------------------------------------------------

/**
 * 构建主抽取 Prompt。
 *
 * 基于 SKILL.md §4.1 的主抽取模板，将 RawNewsItem 字段填入 prompt 中。
 */
export function buildExtractionPrompt(item: RawNewsItem): string {
  return `## 角色
你是一个 AI 新闻结构化抽取引擎。你的任务是将给定的 AI 行业新闻，按照指定的 JSON Schema 进行字段级的结构化抽取。

## 输入数据
- ID: ${item.id}
- 标题: ${item.title}
- 正文/摘要: ${item.content}
- 来源: ${item.source.name} (类型: ${item.source.type}, URL: ${item.source.url})
- 发布时间: ${item.published_at}
- 语言: ${item.language}

## JSON Schema
请严格按照以下 JSON Schema 输出 (只输出纯 JSON, 不要 Markdown 代码块标记):

{
  "id": "${item.id}",
  "ingested_at": "${new Date().toISOString()}",
  "source": {
    "name": "${item.source.name}",
    "type": "${item.source.type}",
    "url": "${item.source.url}"
  },
  "title": "...",
  "title_zh": "...或null",
  "abstract": "...1-2句AI生成的摘要，不超过120字",
  "entities": {
    "companies": [{"name": "...", "confidence": 0.0}],
    "products": [{"name": "...", "confidence": 0.0}],
    "people": [{"name": "...", "confidence": 0.0}],
    "technologies": [{"name": "...", "confidence": 0.0}]
  },
  "topics": [{"label": "...", "category": "technology|application|policy|capital|ethics|other", "confidence": 0.0}],
  "category": {"primary": "...", "secondary": null, "confidence": 0.0},
  "sentiment": {"overall": "positive|neutral|negative", "score": 0.0, "confidence": 0.0},
  "risk_level": "none|low|medium|high|critical",
  "risk_rationale": null,
  "impact": {
    "scope": "global|regional|company|individual",
    "time_horizon": "immediate|short_term|medium_term|long_term",
    "category": "technology|application|policy|capital|ethics",
    "significance_score": 0,
    "rationale": "...不超过100字"
  },
  "extraction_confidence": 0.0,
  "needs_review": false,
  "review_reason": null
}

## 字段抽取指南
### entities
- companies: 公司全名
- products: 产品/模型/服务名
- people: 新闻核心人物全名（非提及即提取）
- technologies: 具体技术/算法/框架名
- 没有识别到某类实体时返回空数组 []

### category
- technology: 纯技术突破、算法创新
- application: 产品发布、落地应用
- policy: 监管政策、法律
- capital: 融资、IPO、收购
- ethics: 安全对齐、偏见

### sentiment
- score: -1.0 (极负面) 到 +1.0 (极正面)

### risk_level
- none/low/medium/high/critical

### impact.significance_score (1-10)
- 1-3: 常规动态; 4-6: 值得关注; 7-8: 重要事件; 9-10: 重大里程碑

请输出结构化 JSON:`;
}

/**
 * 构建补救重试 Prompt。
 *
 * 在原始 prompt 基础上追加特别提醒，指导 LLM 重新关注之前遗漏的部分。
 *
 * @param item             原始新闻项
 * @param previousConfidence 上次抽取的置信度
 * @param reviewReason      需要补救的原因
 */
export function buildRemedialPrompt(
  item: RawNewsItem,
  previousConfidence: number,
  reviewReason: string,
): string {
  const original = buildExtractionPrompt(item);

  return `${original}

## 特别提醒
上次抽取置信度较低 (${previousConfidence})，原因是: ${reviewReason}
请重新仔细阅读原文，特别关注之前遗漏或不确定的部分。确保每个字段的 confidence 反映你的确定程度。`;
}
