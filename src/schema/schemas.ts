// =============================================================================
// M6 共享数据模型 — Zod 校验 Schema
// =============================================================================

import { z } from "zod";

// ========== 基础枚举 Schema ==========

const SourceTypeSchema = z.enum(["tech_media", "official", "social_media", "aggregator"]);
const LanguageSchema = z.enum(["zh", "en", "mixed"]);
const SentimentOverallSchema = z.enum(["positive", "neutral", "negative"]);
const RiskLevelSchema = z.enum(["none", "low", "medium", "high", "critical"]);
const ImpactScopeSchema = z.enum(["global", "regional", "company", "individual"]);
const TimeHorizonSchema = z.enum(["immediate", "short_term", "medium_term", "long_term"]);
const ImpactCategorySchema = z.enum(["technology", "application", "policy", "capital", "ethics"]);
const TopicCategorySchema = z.enum(["technology", "application", "policy", "capital", "ethics", "other"]);

// ========== 子 Schema ==========

const EntitySchema = z.object({
  name: z.string().min(1, "Entity name must not be empty"),
  confidence: z.number().min(0, "Confidence must be >= 0").max(1, "Confidence must be <= 1"),
});

const EntitiesSchema = z.object({
  companies: z.array(EntitySchema),
  products: z.array(EntitySchema),
  people: z.array(EntitySchema),
  technologies: z.array(EntitySchema),
});

const TopicSchema = z.object({
  label: z.string().min(1, "Topic label must not be empty"),
  category: TopicCategorySchema,
  confidence: z.number().min(0, "Confidence must be >= 0").max(1, "Confidence must be <= 1"),
});

const SentimentSchema = z.object({
  overall: SentimentOverallSchema,
  score: z.number().min(-1, "Sentiment score must be >= -1").max(1, "Sentiment score must be <= 1"),
  confidence: z.number().min(0, "Confidence must be >= 0").max(1, "Confidence must be <= 1"),
});

const ImpactSchema = z.object({
  scope: ImpactScopeSchema,
  time_horizon: TimeHorizonSchema,
  category: ImpactCategorySchema,
  significance_score: z.number().min(1, "Significance score must be between 1 and 10").max(10, "Significance score must be between 1 and 10"),
  rationale: z.string().min(1, "Rationale must not be empty").max(200, "Rationale must be 200 characters or less"),
});

const RawNewsSourceSchema = z.object({
  name: z.string().min(1, "Source name must not be empty"),
  type: SourceTypeSchema,
  url: z.string().url("Source URL must be a valid URL"),
});

// ========== RawNewsItemSchema ==========

export const RawNewsItemSchema = z.object({
  id: z.string().min(1, "ID must not be empty"),
  title: z.string().min(1, "Title must not be empty"),
  content: z.string().min(50, "Content must be at least 50 characters long"),
  source: RawNewsSourceSchema,
  published_at: z.string().datetime({ message: "published_at must be a valid ISO 8601 datetime" }),
  language: LanguageSchema,
});

// ========== StructuredInsightItemSchema ==========

export const StructuredInsightItemSchema = z.object({
  id: z.string().min(1, "ID must not be empty"),
  ingested_at: z.string().datetime({ message: "ingested_at must be a valid ISO 8601 datetime" }),
  source: RawNewsSourceSchema,
  title: z.string().min(1, "Title must not be empty"),
  title_zh: z.string().nullable(),
  abstract: z.string().min(1, "Abstract must not be empty").max(120, "Abstract must be 120 characters or fewer"),
  entities: EntitiesSchema,
  topics: z.array(TopicSchema).min(1, "At least one topic is required"),
  category: z.object({
    primary: z.string().min(1, "Primary category must not be empty"),
    secondary: z.string().nullable(),
    confidence: z.number().min(0, "Confidence must be >= 0").max(1, "Confidence must be <= 1"),
  }),
  sentiment: SentimentSchema,
  risk_level: RiskLevelSchema,
  risk_rationale: z.string().nullable(),
  impact: ImpactSchema,
  extraction_confidence: z.number().min(0, "Extraction confidence must be >= 0").max(1, "Extraction confidence must be <= 1"),
  needs_review: z.boolean(),
  review_reason: z.string().nullable(),
}).superRefine((data, ctx) => {
  // At least one of entities sub-arrays must be non-empty, unless topics has entries
  const hasAnyEntity = data.entities.companies.length > 0
    || data.entities.products.length > 0
    || data.entities.people.length > 0
    || data.entities.technologies.length > 0;
  if (!hasAnyEntity && data.topics.length === 0) {
    ctx.addIssue({
      code: "custom",
      message: "At least one entity array or topics must be non-empty",
      path: ["entities"],
    });
  }
}).superRefine((data, ctx) => {
  // risk_rationale must be non-empty when risk_level >= medium
  const riskyLevels = ["medium", "high", "critical"] as const;
  if (riskyLevels.includes(data.risk_level as typeof riskyLevels[number]) && !data.risk_rationale) {
    ctx.addIssue({
      code: "custom",
      message: "risk_rationale is required when risk_level is medium or higher",
      path: ["risk_rationale"],
    });
  }
});

// ========== IngestSummarySchema ==========

export const IngestSummarySchema = z.object({
  date: z.string().min(1, "Date must not be empty"),
  total_input: z.number().int("total_input must be an integer").min(0, "total_input must be >= 0"),
  validated: z.number().int("validated must be an integer").min(0, "validated must be >= 0"),
  skipped: z.number().int("skipped must be an integer").min(0, "skipped must be >= 0"),
  skipped_reasons: z.array(z.object({
    id: z.string().min(1, "Skipped item ID must not be empty"),
    reason: z.string().min(1, "Skipped reason must not be empty"),
  })),
  source_distribution: z.record(z.string(), z.number().int().min(0)),
});

// ========== ExtractionSummarySchema ==========

export const ExtractionSummarySchema = z.object({
  date: z.string().min(1, "Date must not be empty"),
  total_items: z.number().int("total_items must be an integer").min(0, "total_items must be >= 0"),
  extracted_successfully: z.number().int().min(0, "extracted_successfully must be >= 0"),
  needs_review: z.number().int().min(0, "needs_review must be >= 0"),
  skipped: z.number().int().min(0, "skipped must be >= 0"),
  average_confidence: z.number().min(0, "average_confidence must be >= 0").max(1, "average_confidence must be <= 1"),
  extraction_duration_seconds: z.number().min(0, "extraction_duration_seconds must be >= 0"),
});
