# SKILL.md — Visualizer (可视化生成器)

> **所属管道**: Stage 4 — VISUALIZE
> **依赖上游**: `skills/extractor/` (Stage 2 的结构化数据) 和 `skills/analyzer/` (Stage 3 的分析结论)
> **输出流向**: `.specs/daily-report/assets/` — 最终日报的可视化附件
> **最后更新**: 2026-06-01

---

## §1 技能定位

### 1.1 你是什么

**Visualizer** 是管道第四阶段的核心技能。你的职责是：

> 将结构化数据中的统计量、评分、趋势信号和分析结论，转化为**人类一眼就能看懂的图表** — 输出格式为 SVG（矢量图形）或 Mermaid（Markdown 原生图表）。

### 1.2 核心原则

| 原则 | 说明 |
|:-----|:----|
| **信息传达优先** | 图表的存在是为了让数据更容易理解，不是装饰 |
| **数据驱动** | 每一个柱、每一条线、每一个色块都对应结构化数据中的一个值 |
| **可访问性** | 颜色方案考虑色盲友好，关键信息有文字标注而非仅靠颜色区分 |
| **自包含** | 每个图表有 title、legend、数据来源、时间戳，脱离日报也能独立理解 |
| **技术栈灵活** | SVG 适合数据图表（柱状图/饼图/雷达图），Mermaid 适合流程/关系图 |

---

## §2 图表类型选择指南

### 2.1 决策树

```
你想展示什么？
  ├── 排名/对比
  │   └── 话题热度 Top-N → 水平柱状图 (SVG)
  │   └── 来源分布 → 饼图/环形图 (SVG)
  │   └── 公司/技术提及频次 → 水平柱状图 (SVG)
  │
  ├── 时间趋势
  │   └── 事件时间线 → 时间轴图 (Mermaid timeline)
  │   └── 情感/热度随时间变化 → 折线图 (SVG)
  │
  ├── 关系/网络
  │   └── 实体共现关系 → 关系图 (Mermaid graph)
  │   └── 事件因果链 → 流程图 (Mermaid flowchart)
  │
  ├── 多维对比
  │   └── 四维趋势雷达 → 雷达图 (SVG)
  │   └── 多重指标对比 → 分组柱状图 (SVG)
  │
  └── 结构/流程
      └── 数据处理管道 → 流程图 (Mermaid flowchart)
      └── 系统架构 → 架构图 (Mermaid block diagram)
```

### 2.2 强制生成的图表 (每期日报必须包含)

| 序号 | 图表 | 类型 | 数据来源 |
|:-----|:-----|:-----|:--------|
| 1 | **话题热度柱状图** | SVG Bar Chart | `topic_frequency` from Analyzer Phase A |
| 2 | **情感分布饼图** | SVG Pie Chart | `sentiment_distribution` from Analyzer Phase A |
| 3 | **显著事件时间线** | Mermaid Timeline | `top_by_significance` from Analyzer Phase A |
| 4 | **趋势四维雷达图** | SVG Radar Chart | `trend_analysis` from Analyzer Phase D |

### 2.3 可选图表 (根据数据特点决定)

- 实体共现网络图 → 当 `entity_co_occurrence` 中有 > 3 对高频共现时生成
- 风险等级仪表盘 → 当有 `risk_level >= medium` 的条目时生成
- 来源分布环形图 → 当数据来自 > 3 种不同 source.type 时生成
- 数据中心处理流程图 → 每期日报可选附带一张，不需重复生成

---

## §3 操作流程 (SOP)

### Step 1: 数据准备

从 Analyzer 的输出中提取可视化所需的结构化数据:

```typescript
interface VisualizationData {
  // 来自 Analyzer Phase A (统计聚合)
  topicFrequency: Record<string, number>;           // { "大语言模型": 8, ... }
  sentimentDistribution: Record<string, number>;    // { "positive": 12, "neutral": 5, ... }
  sourceDistribution: Record<string, number>;       // { "tech_media": 10, ... }
  topBySignificance: Array<{
    title: string;
    score: number;
    publishedAt: string;
  }>;
  entityCoOccurrence: Array<{ source: string; target: string; weight: number }>;

  // 来自 Analyzer Phase D (趋势推演)
  trendConfidence: {
    technology: number;
    application: number;
    policy: number;
    capital: number;
  };
  trendNarratives: {
    technology: string;
    application: string;
    policy: string;
    capital: string;
  };

  // 元信息
  date: string;
  totalItems: number;
}

// Step 1 的纯代码实现 (不需要 AI)
function prepareVisualizationData(
  stats: AggregationStats,
  trends: TrendAnalysis,
  date: string
): VisualizationData {
  return {
    topicFrequency: stats.topic_frequency,
    sentimentDistribution: stats.sentiment_distribution,
    sourceDistribution: stats.source_distribution,
    topBySignificance: stats.top_by_significance.slice(0, 10),
    entityCoOccurrence: stats.entity_co_occurrence
      .filter(e => e.weight >= 2),   // 至少共现 2 次才展示
    trendConfidence: {
      technology: trends.technology.confidence,
      application: trends.application.confidence,
      policy: trends.policy.confidence,
      capital: trends.capital.confidence,
    },
    trendNarratives: {
      technology: trends.technology.trend,
      application: trends.application.trend,
      policy: trends.policy.trend,
      capital: trends.capital.trend,
    },
    date,
    totalItems: stats.extracted_successfully,
  };
}
```

### Step 2: SVG 图表生成 (逐图表 AI 调用)

对每个 SVG 类型的图表，**独立发起一次 AI 调用**。

#### SVG 生成通用原则:

1. **使用原生 `<svg>` 标签**，不使用需要外部 JS 库的图表
2. **内联 `<style>`** 定义样式
3. **`viewBox="0 0 800 500"`** 保持一致的画布尺寸
4. **颜色方案**:
   - 主色调: `#2563EB` (蓝), `#7C3AED` (紫), `#059669` (绿)
   - 注意色: `#DC2626` (红), `#F59E0B` (琥珀/警告)
   - 中性: `#6B7280` (灰), `#E5E7EB` (浅灰背景)
   - 背景: `#FFFFFF` 或 `#F9FAFB`
5. **文字**: 使用 `font-family="system-ui, -apple-system, sans-serif"`
6. **辅助线**: 使用浅灰 (`#E5E7EB`) 虚线，不过分突出
7. **数据值标注**: 在每个数据点上方标注具体数值
8. **来源标注**: 图表底部添加 `text` 标注 "数据来源: Daily AI Insight Engine — {{date}}"

### Step 3: Mermaid 图表生成 (逐图表 AI 调用)

对每个 Mermaid 类型的图表，独立发起一次 AI 调用。输出**纯 Mermaid 代码块**。

### Step 4: 图表集成到日报

将生成的 SVG 内联或链接到日报 Markdown 中:

```markdown
## 可视化分析

### 今日话题热度 Top-10
![话题热度](assets/topic_bar_chart.svg)

### 情感分布
![情感分布](assets/sentiment_pie.svg)

### 显著事件时间线
```mermaid
<生成的 Mermaid 代码>
```

### 趋势四维雷达
![趋势雷达](assets/trend_radar.svg)
```

---

## §4 Prompt 模板

### 4.1 SVG 柱状图 (话题热度) Prompt

```markdown
## 角色

你是一个数据可视化专家。请生成一个 SVG 格式的水平柱状图 (horizontal bar chart)，展示今日 AI 话题热度排名。

## 数据

```json
{{topic_frequency_json}}
```

## 设计要求

### 布局
- viewBox="0 0 800 500"
- 左侧: Y 轴标签 (话题名称)，截断超过 15 字符的文本
- 右侧: 柱状条 + 末端数值标注
- 底部: 数据来源标注 "数据来源: Daily AI Insight Engine — {{date}}"
- 顶部: 图表标题 "AI 话题热度 Top-10 — {{date}}"

### 配色
- 柱状条渐变: 从 #3B82F6 (蓝) 到 #8B5CF6 (紫)，按排名递减
- 背景: #FFFFFF
- 网格线: #E5E7EB 虚线
- 文字: #374151 (深灰)

### 交互
- 每个柱状条上叠加 `<title>` tooltip，显示完整话题名和具体数值

### 约束
- 只输出纯 SVG 代码，不要包裹在 HTML 中
- 不要在 SVG 外添加任何 Markdown 说明
- 确保所有标签正确闭合
- 按频次降序排列 (最高的在最上面)

请输出完整 SVG:
```

### 4.2 SVG 饼图 (情感分布) Prompt

```markdown
## 角色

你是一个数据可视化专家。请生成一个 SVG 格式的饼图/环形图 (donut chart)，展示今日 AI 新闻的情感分布。

## 数据

```json
{{sentiment_distribution_json}}
```

例如: { "positive": 12, "neutral": 5, "negative": 3 }

## 设计要求

### 布局
- viewBox="0 0 600 500"
- 中央: 环形图（内半径 60，外半径 120），中心显示总计 "N={{total}}条"
- 右侧: 图例，包含颜色块 + 标签 + 百分比 + 条数
- 底部: "数据来源: Daily AI Insight Engine — {{date}}"

### 配色 (色盲友好)
- positive: #059669 (深绿)
- neutral: #6B7280 (灰)
- negative: #DC2626 (红)

### 标注
- positive 扇区标注 "正面"
- neutral 扇区标注 "中性"
- negative 扇区标注 "负面"

### 约束
- 只输出纯 SVG 代码
- 百分比计算和扇区角度需要精确
- 确保环形图的圆弧路径正确

请输出完整 SVG:
```

### 4.3 SVG 雷达图 (趋势四维) Prompt

```markdown
## 角色

你是一个数据可视化专家。请生成一个 SVG 格式的雷达图 (radar chart)，展示今日 AI 趋势四维评估。

## 数据

```json
{
  "technology": {
    "confidence": {{tech_confidence}},
    "trend": "{{tech_trend_summary}}"
  },
  "application": {
    "confidence": {{app_confidence}},
    "trend": "{{app_trend_summary}}"
  },
  "policy": {
    "confidence": {{policy_confidence}},
    "trend": "{{policy_trend_summary}}"
  },
  "capital": {
    "confidence": {{capital_confidence}},
    "trend": "{{capital_trend_summary}}"
  }
}
```

## 设计要求

### 布局
- viewBox="0 0 600 600"
- 四个轴 (从中心向外): 技术、应用、政策、资本
- 每个轴刻度 0.0 ~ 1.0 (confidence 值)
- 填充区域: 半透明蓝色 `rgba(59, 130, 246, 0.2)` + 边框 `#3B82F6`
- 网格线: 在 0.25, 0.5, 0.75 处画多边形参考线
- 顶部标题: "趋势四维雷达 — {{date}}"
- 每个轴端点标注维度名称和数值
- 底部: 数据来源标注

### 标注
- 在每个数据点旁显示具体的 confidence 值
- 添加一段简洁的趋势摘要文字在图表右侧或底部

### 约束
- 只输出纯 SVG 代码
- 坐标计算需要精确（使用三角函数定位四个轴上的点）
- 填充多边形需按轴顺序连接 (技术→应用→政策→资本)

请输出完整 SVG:
```

### 4.4 Mermaid 时间线 (显著事件) Prompt

```markdown
## 角色

你是一个 Mermaid 图表专家。请生成一个 Mermaid timeline 图，展示今日 AI 显著事件的时间排列。

## 数据

```json
{{top_events_timeline_json}}
```

每项包含: title, significance_score, published_at (ISO 8601), sentiment

## 设计要求

- 使用 Mermaid `timeline` 语法
- 按时间升序排列
- 每个事件显示: 时间(HH:MM) + 标题(截断至 30 字) + significance_score
- 高 significance_score (≥7) 的事件用 🔴 标记
- medium (4-6) 用 🟡 标记
- 低 (1-3) 用 🟢 标记
- 标题: "今日 AI 显著事件时间线"

### 约束
- 只输出 ` ` `mermaid ... ` ` ` 代码块
- 不使用未提交到 Mermaid 主线的实验性语法
- 如果事件时间不在同一天，使用日期+时间格式

请输出完整 Mermaid 代码块:
```

### 4.5 Mermaid 实体关系图 (可选) Prompt

```markdown
## 角色

你是一个 Mermaid 图表专家。请生成一个 Mermaid graph 图，展示今日 AI 新闻中实体之间的共现关系。

## 数据

```json
{{entity_co_occurrence_json}}
```

格式: [{ "source": "OpenAI", "target": "GPT-5", "weight": 3 }, ...]

## 设计要求

- 使用 Mermaid `graph LR` (左到右) 或 `graph TB` (上到下)
- 节点: 用方框表示公司，圆角框表示产品，菱形表示技术
- 边: weight ≥ 3 用粗线 `==>` ，weight=2 用细线 `-->`，边上标注共现次数
- 根据 weight 调整节点大小和边的粗细
- 标题: "AI 实体共现网络 — {{date}}"

### 约束
- 只输出 ` ` `mermaid ... ` ` ` 代码块
- 节点数量控制在 20 个以内，weight=1 的边可以不展示以保持可读性
- 使用颜色区分实体类型: 公司=#3B82F6, 产品=#059669, 技术=#8B5CF6

请输出完整 Mermaid 代码块:
```

---

## §5 SVG 代码质量规范

### 5.1 必须遵守的 SVG 规则

```xml
<!-- ✅ 好的 SVG 结构 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="100%" height="100%">
  <defs>
    <linearGradient id="barGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#3B82F6"/>
      <stop offset="100%" stop-color="#8B5CF6"/>
    </linearGradient>
  </defs>
  <style>
    text { font-family: system-ui, -apple-system, sans-serif; }
    .title { font-size: 18px; font-weight: 700; fill: #111827; }
    .axis-label { font-size: 13px; fill: #6B7280; }
    .data-label { font-size: 12px; font-weight: 600; fill: #374151; }
    .source-note { font-size: 11px; fill: #9CA3AF; }
  </style>

  <!-- 背景 -->
  <rect width="800" height="500" fill="#FFFFFF" rx="8"/>

  <!-- 标题 -->
  <text x="40" y="35" class="title">图表标题</text>

  <!-- ... 图表内容 ... -->

  <!-- 底部来源标注 -->
  <text x="40" y="475" class="source-note">数据来源: Daily AI Insight Engine — {{date}}</text>
</svg>

<!-- ❌ 不好的 SVG -->
<svg>
  <!-- 缺少 xmlns, viewBox, 样式不规范, 无来源标注 -->
</svg>
```

### 5.2 输出前验证

生成 SVG 后，必须检查:

- [ ] `<svg>` 标签有 `xmlns` 和 `viewBox` 属性
- [ ] 所有标签正确闭合
- [ ] 颜色使用十六进制格式 (`#RRGGBB`)
- [ ] `font-family` 使用系统字体栈（不依赖外部字体加载）
- [ ] 图表内所有文字有合理的 `font-size`（不小于 10px）
- [ ] 对比度: 文字颜色与背景色对比度 ≥ 4.5:1
- [ ] 没有硬编码绝对路径或外部资源引用
- [ ] SVG 可以独立打开（脱离日报也能理解）

---

## §6 Mermaid 代码质量规范

### 6.1 语法检查清单

- [ ] 使用的是 Mermaid 官方支持的语法
- [ ] 节点 ID 不含特殊字符（只用字母、数字、下划线）
- [ ] 流程图有明确的方向 (`LR` / `TB` / `RL` / `BT`)
- [ ] 节点标签中的特殊字符（如括号、引号）被正确转义
- [ ] 子图 (`subgraph`) 有名称
- [ ] 样式定义 (`classDef`, `class`) 使用合法的 CSS 属性名
- [ ] 不使用 `%%{init}%%` 中的复杂配置除非必要

### 6.2 可读性规范

```
// ✅ 好的 Mermaid 代码
graph LR
    subgraph "大语言模型生态"
        A[OpenAI] -->|发布| B[GPT-5]
        C[Anthropic] -->|对标| B
        A -->|合作| D[Microsoft]
    end

// ❌ 不好的 Mermaid 代码 (缺少 subgraph, 节点名不表意)
graph LR
    A --> B --> C
```

---

## §7 输出结构

每个图表的输出路径:

```
.specs/daily-report/assets/
├── topic_bar_chart.svg        # 话题热度柱状图 (必须)
├── sentiment_pie.svg          # 情感分布饼图 (必须)
├── trend_radar.svg            # 趋势四维雷达图 (必须)
├── timeline.md                # 显著事件时间线 Mermaid 代码 (必须)
├── entity_graph.md            # 实体共现网络 Mermaid 代码 (可选)
├── risk_gauge.svg             # 风险等级仪表盘 (可选)
├── source_donut.svg           # 来源分布环形图 (可选)
└── pipeline_flow.md           # 数据处理管道流程图 (可选,每项目仅需生成一次)
```

### 日报中的引用格式

```markdown
### 📊 今日话题热度 Top-10

![话题热度柱状图](./assets/topic_bar_chart.svg)

> **解读**: 今日话题集中在{{top_topic}}领域，共 {{topic_count}} 条相关新闻。这反映了...
```

---

## §8 质量自检清单

Visualizer 在完成全部图表生成后，必须逐项检查:

- [ ] 至少生成了 4 个必须图表 (话题柱状图 / 情感饼图 / 事件时间线 / 趋势雷达)
- [ ] 所有 SVG 可以独立打开且在浏览器中正常渲染
- [ ] 所有 Mermaid 代码块在 Markdown 预览中正常渲染
- [ ] 每个图表有 title 和数据来源标注
- [ ] 图表中的数据值与原数据源一致（抽查 3 个数据点）
- [ ] 颜色方案使用了定义的色板，没有随意使用随机颜色
- [ ] 图表间风格统一（字体、颜色、标注风格一致）
- [ ] 所有文件写入 `.specs/daily-report/assets/` 目录
- [ ] 日报中的图表引用路径正确

---

> **上游依赖**:
> - `skills/extractor/SKILL.md` — 提供结构化数据 (entities, sentiment_score 等)
> - `skills/analyzer/SKILL.md` — 提供聚合统计和趋势分析结论
> **关联技能**: `skills/retry/SKILL.md` — 图表生成失败时的重试策略
