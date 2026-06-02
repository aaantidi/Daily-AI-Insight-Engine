// =============================================================================
// M6 共享数据模型 — TypeScript 接口定义
// =============================================================================

// ========== 基础类型 ==========

export type SourceType = "tech_media" | "official" | "social_media" | "aggregator";
export type Language = "zh" | "en" | "mixed";
export type SentimentOverall = "positive" | "neutral" | "negative";
export type RiskLevel = "none" | "low" | "medium" | "high" | "critical";
export type ImpactScope = "global" | "regional" | "company" | "individual";
export type TimeHorizon = "immediate" | "short_term" | "medium_term" | "long_term";
export type ImpactCategory = "technology" | "application" | "policy" | "capital" | "ethics";
export type TopicCategory = "technology" | "application" | "policy" | "capital" | "ethics" | "other";

// ========== M1 INGEST 类型 ==========

export interface RawNewsSource {
  name: string;
  type: SourceType;
  url: string;
}

export interface RawNewsItem {
  id: string;
  title: string;
  content: string;
  source: RawNewsSource;
  published_at: string;  // ISO 8601
  language: Language;
}

// ========== M2 EXTRACT 类型 ==========

export interface Entity {
  name: string;
  confidence: number;  // 0.0 - 1.0
}

export interface Entities {
  companies: Entity[];
  products: Entity[];
  people: Entity[];
  technologies: Entity[];
}

export interface Topic {
  label: string;
  category: TopicCategory;
  confidence: number;
}

export interface Sentiment {
  overall: SentimentOverall;
  score: number;        // -1.0 到 +1.0
  confidence: number;
}

export interface Impact {
  scope: ImpactScope;
  time_horizon: TimeHorizon;
  category: ImpactCategory;
  significance_score: number;  // 1-10
  rationale: string;           // ≤100 字
}

export interface StructuredInsightItem {
  id: string;
  ingested_at: string;
  source: RawNewsSource;
  title: string;
  title_zh: string | null;
  abstract: string;              // ≤120 字
  entities: Entities;
  topics: Topic[];
  category: {
    primary: string;
    secondary: string | null;
    confidence: number;
  };
  sentiment: Sentiment;
  risk_level: RiskLevel;
  risk_rationale: string | null;
  impact: Impact;
  extraction_confidence: number;
  needs_review: boolean;
  review_reason: string | null;
}

// ========== M1/M2 摘要类型 ==========

export interface SkippedItem {
  id: string;
  reason: string;
}

export interface IngestSummary {
  date: string;
  total_input: number;
  validated: number;
  skipped: number;
  skipped_reasons: SkippedItem[];
  source_distribution: Record<string, number>;
}

export interface ExtractionSummary {
  date: string;
  total_items: number;
  extracted_successfully: number;
  needs_review: number;
  skipped: number;
  average_confidence: number;
  extraction_duration_seconds: number;
}

// ========== M3 SYNTHESIZE 类型 ==========

export interface AggregationStats {
  topic_frequency: Record<string, number>;
  source_distribution: Record<string, number>;
  sentiment_distribution: Record<string, number>;
  risk_distribution: Record<string, number>;
  top_by_significance: Array<{
    id: string;
    title: string;
    score: number;
    published_at: string;
  }>;
  entity_co_occurrence: Array<{
    source: string;
    target: string;
    weight: number;
  }>;
}

export interface TopEvent {
  rank: number;
  title: string;
  item_ids: string[];
  significance: number;
  why_important: string;
  key_entities: string[];
  sentiment_summary: string;
}

export interface DeepAnalysis {
  event_title: string;
  background: string;
  key_developments: string[];
  impact_analysis: {
    short_term: string;
    medium_term: string;
    affected_parties: string[];
  };
  related_events: string[];
  expert_perspective: string;
  references: string[];
}

export interface TrendDimension {
  trend: string;
  confidence: number;
  supporting_items: string[];
  signals: string[];
}

export interface TrendAnalysis {
  technology: TrendDimension;
  application: TrendDimension;
  policy: TrendDimension;
  capital: TrendDimension;
  overall_narrative: string;
  uncertainties: string[];
}

export interface RiskItem {
  description: string;
  level: "medium" | "high" | "critical";
  probability: "low" | "medium" | "high";
  type: "quantifiable" | "systemic";
  related_items: string[];
  suggested_action: string;
}

export interface OpportunityItem {
  description: string;
  category: "technology" | "business" | "policy";
  time_window: "immediate" | "short_term" | "medium_term";
  related_items: string[];
  rationale: string;
}

export interface RiskOpportunityPanel {
  risks: RiskItem[];
  opportunities: OpportunityItem[];
  overall_risk_assessment: string;
}

// ========== M4/M5 日报类型 ==========

export interface DailyReport {
  date: string;
  generated_at: string;
  dashboard: {
    total_items: number;
    sentiment_distribution: Record<string, number>;
    risk_count: number;
    top_topics: string[];
  };
  top_events: TopEvent[];
  deep_analyses: DeepAnalysis[];
  trend_analysis: TrendAnalysis;
  risk_opportunity: RiskOpportunityPanel;
  references_index: Array<{
    id: string;
    title: string;
    source_name: string;
    source_url: string;
  }>;
}
