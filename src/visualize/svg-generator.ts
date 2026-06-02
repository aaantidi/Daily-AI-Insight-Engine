import { Logger } from '../logger';
import type { TrendAnalysis, StructuredInsightItem } from '../schema/types';

const log = new Logger('VISUALIZE');

// =============================================================================
// Types
// =============================================================================

export interface SvgOptions {
  width?: number;
  height?: number;
  colorScheme?: 'default' | 'colorblind';
}

// =============================================================================
// Color palettes
// =============================================================================

const BARS_DEFAULT = ['#3B82F6', '#6366F1', '#8B5CF6'];
const BARS_COLORBLIND = ['#0077BB', '#EE7733', '#009988', '#CC3311', '#33BBEE', '#AA3377', '#BBBBBB'];
const SENTIMENT_COLORS_DEFAULT: Record<string, string> = {
  positive: '#059669',
  neutral: '#6B7280',
  negative: '#DC2626',
};
const SENTIMENT_COLORS_COLORBLIND: Record<string, string> = {
  positive: '#0077BB',
  neutral: '#BBBBBB',
  negative: '#CC3311',
};
const SENTIMENT_LABELS: Record<string, string> = {
  positive: '正面',
  neutral: '中性',
  negative: '负面',
};

// =============================================================================
// Helpers
// =============================================================================

function wrapSvg(content: string, w: number, h: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">
  <style>
    .title { font-family: system-ui, -apple-system, sans-serif; font-size: 18px; font-weight: bold; fill: #111827; }
    .label { font-family: system-ui, -apple-system, sans-serif; font-size: 13px; fill: #374151; }
    .value { font-family: system-ui, -apple-system, sans-serif; font-size: 13px; fill: #6B7280; }
    .note { font-family: system-ui, -apple-system, sans-serif; font-size: 11px; fill: #9CA3AF; }
    .grid { stroke: #E5E7EB; stroke-width: 1; stroke-dasharray: 4 4; }
    .axis { stroke: #D1D5DB; stroke-width: 2; }
  </style>
${content}
</svg>`;
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + '…';
}

/**
 * Compute a polar-to-cartesian point.
 */
function polarPoint(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/**
 * Build an SVG arc path for a donut segment (inner to outer).
 * Angles in degrees, measured clockwise from the positive x-axis.
 */
function donutArcPath(
  cx: number, cy: number,
  innerR: number, outerR: number,
  startDeg: number, endDeg: number,
): string {
  // Clamp angles
  let start = startDeg;
  let end = endDeg;
  // Normalize to 0-360
  const sweep = end - start;

  const outerStart = polarPoint(cx, cy, outerR, start);
  const outerEnd = polarPoint(cx, cy, outerR, end);
  const innerStart = polarPoint(cx, cy, innerR, start);
  const innerEnd = polarPoint(cx, cy, innerR, end);

  const largeArc = sweep > 180 ? 1 : 0;

  return [
    `M ${outerStart.x.toFixed(2)} ${outerStart.y.toFixed(2)}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerEnd.x.toFixed(2)} ${outerEnd.y.toFixed(2)}`,
    `L ${innerEnd.x.toFixed(2)} ${innerEnd.y.toFixed(2)}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerStart.x.toFixed(2)} ${innerStart.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

// =============================================================================
// SvgGenerator class
// =============================================================================

export class SvgGenerator {
  private readonly width: number;
  private readonly height: number;
  private readonly colorScheme: 'default' | 'colorblind';

  constructor(options?: SvgOptions) {
    this.width = options?.width ?? 800;
    this.height = options?.height ?? 500;
    this.colorScheme = options?.colorScheme ?? 'default';
  }

  // ---------------------------------------------------------------------------
  // Topic bar chart
  // ---------------------------------------------------------------------------

  generateTopicBarChart(
    topicFrequency: Record<string, number>,
    date: string,
    topN = 10,
  ): string {
    log.info(`Generating topic bar chart for ${date} (topN=${topN})`);

    const entries = Object.entries(topicFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.max(1, topN)); // At least try to show 1

    if (entries.length === 0) {
      // Empty state
      return this.emptySvg(`AI 话题热度 — ${date}`, '暂无话题数据', date);
    }

    const maxVal = entries[0][1];
    const w = this.width;
    const h = this.height;

    const barH = 30;
    const barGap = 5;
    const barAreaTop = 70;
    const barAreaBottom = 430;
    const maxBars = Math.min(entries.length, Math.floor((barAreaBottom - barAreaTop) / (barH + barGap)));
    const limited = entries.slice(0, maxBars);

    const labelX = 200;
    const barStartX = 210;
    const maxBarWidth = 440;
    const valueX = 660;

    const bars: string[] = [];
    const gridLines: string[] = [];
    const labels: string[] = [];
    const values: string[] = [];

    // Grid lines (0%, 25%, 50%, 75%, 100%)
    for (const pct of [0, 0.25, 0.5, 0.75, 1]) {
      const gx = barStartX + maxBarWidth * pct;
      gridLines.push(`  <line class="grid" x1="${gx.toFixed(1)}" y1="${barAreaTop - 10}" x2="${gx.toFixed(1)}" y2="${barAreaTop + limited.length * (barH + barGap)}" />`);
    }

    limited.forEach(([topic, count], i) => {
      const y = barAreaTop + i * (barH + barGap);
      const barWidth = maxVal > 0 ? (count / maxVal) * maxBarWidth : 0;

      const colorIndex = this.colorScheme === 'colorblind'
        ? i % BARS_COLORBLIND.length
        : i % BARS_DEFAULT.length;
      const color = this.colorScheme === 'colorblind'
        ? BARS_COLORBLIND[colorIndex]
        : (i < 1 ? BARS_DEFAULT[0] : BARS_DEFAULT[Math.min(colorIndex, BARS_DEFAULT.length - 1)]);

      // If colorblind, add pattern
      let rectExtra = '';
      if (this.colorScheme === 'colorblind') {
        rectExtra = ` fill="url(#cbBar${i})"`;
        // Add pattern definition (will be hoisted)
      } else {
        rectExtra = ` fill="${color}"`;
      }

      labels.push(`  <text class="label" x="${labelX}" y="${y + barH / 2 + 4}" text-anchor="end">${truncate(topic, 15)}</text>`);
      bars.push(`  <rect role="bar" x="${barStartX}" y="${y}" width="${barWidth.toFixed(1)}" height="${barH}" rx="4"${rectExtra} />`);
      values.push(`  <text class="value" x="${valueX}" y="${y + barH / 2 + 4}">${count}</text>`);
    });

    // Add pattern defs for colorblind
    let defs = '';
    if (this.colorScheme === 'colorblind') {
      const patterns = limited.map((_, i) => {
        const colorIndex = i % BARS_COLORBLIND.length;
        const color = BARS_COLORBLIND[colorIndex];
        return `  <pattern id="cbBar${i}" patternUnits="userSpaceOnUse" width="8" height="8">
    <rect width="8" height="8" fill="${color}" />
    <rect x="${i % 2 * 4}" y="${i % 2 * 4}" width="4" height="4" fill="#ffffff" opacity="0.4" />
  </pattern>`;
      });
      defs = `<defs>\n${patterns.join('\n')}\n  </defs>\n`;
    }

    const svgContent = [
      defs,
      `  <text class="title" x="${w / 2}" y="40" text-anchor="middle">AI 话题热度 Top-${limited.length} — ${date}</text>`,
      gridLines.join('\n'),
      labels.join('\n'),
      bars.join('\n'),
      values.join('\n'),
      `  <text class="note" x="${w / 2}" y="${h - 20}" text-anchor="middle">数据来源: Daily AI Insight Engine — ${date}</text>`,
    ].join('\n');

    return wrapSvg(svgContent, w, h);
  }

  // ---------------------------------------------------------------------------
  // Sentiment donut chart
  // ---------------------------------------------------------------------------

  generateSentimentDonut(
    sentimentDistribution: Record<string, number>,
    date: string,
  ): string {
    log.info(`Generating sentiment donut for ${date}`);

    const entries = Object.entries(sentimentDistribution);
    const total = entries.reduce((s, [, v]) => s + v, 0);

    const w = 600;
    const h = 500;
    const cx = 300;
    const cy = 250;
    const outerR = 120;
    const innerR = 60;

    if (total === 0) {
      return this.emptySvg(`情感分布 — ${date}`, '暂无情感数据', date);
    }

    const colors = this.colorScheme === 'colorblind'
      ? SENTIMENT_COLORS_COLORBLIND
      : SENTIMENT_COLORS_DEFAULT;

    // Sort entries for consistent rendering: positive, neutral, negative
    const sorted: [string, number][] = ['positive', 'neutral', 'negative']
      .map((k) => [k, sentimentDistribution[k] ?? 0]);

    const paths: string[] = [];
    const legendItems: string[] = [];

    // Start from the top (-90 degrees)
    let currentAngle = -90;

    sorted.forEach(([key, value], idx) => {
      const color = colors[key] || '#6B7280';

      // Skip 0-value sectors — don't generate path, don't update currentAngle
      if (value > 0) {
        const pct = value / total;
        const sweepDeg = pct * 360;
        const endAngle = currentAngle + sweepDeg;

        // Add pattern defs for colorblind
        if (this.colorScheme === 'colorblind') {
          // Use texture via pattern
          paths.push(donutArcPath(cx, cy, innerR, outerR, currentAngle, endAngle));
          paths.push(`  <path d="${donutArcPath(cx, cy, innerR - 2, outerR + 2, currentAngle, endAngle)}" fill="none" stroke="#333" stroke-width="1" />`);
        } else {
          paths.push(`  <path d="${donutArcPath(cx, cy, innerR, outerR, currentAngle, endAngle)}" fill="${color}" />`);
        }

        currentAngle = endAngle;
      }

      // Always show legend (including 0-value categories)
      const legendY = 150 + idx * 30;
      legendItems.push(`  <rect x="430" y="${legendY}" width="12" height="12" rx="2" fill="${color}" />`);
      legendItems.push(`  <text class="label" x="450" y="${legendY + 10}">${SENTIMENT_LABELS[key] || key} (${value})</text>`);
    });

    const svgContent = [
      `  <text class="title" x="${w / 2}" y="40" text-anchor="middle">情感分布 — ${date}</text>`,
      paths.join('\n'),
      `  <text class="value" x="${cx}" y="${cy - 8}" text-anchor="middle" font-size="24" font-weight="bold" fill="#111827">N=${total}</text>`,
      `  <text class="note" x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="12">条</text>`,
      legendItems.join('\n'),
      `  <text class="note" x="${w / 2}" y="${h - 20}" text-anchor="middle">数据来源: Daily AI Insight Engine — ${date}</text>`,
    ].join('\n');

    return wrapSvg(svgContent, w, h);
  }

  // ---------------------------------------------------------------------------
  // Trend radar chart
  // ---------------------------------------------------------------------------

  generateTrendRadar(trends: TrendAnalysis, date: string): string {
    log.info(`Generating trend radar for ${date}`);

    const w = 600;
    const h = 600;
    const cx = 300;
    const cy = 300;
    const axisLen = 200;

    type TrendDimensionKey = 'technology' | 'application' | 'policy' | 'capital';

    interface AxisDef {
      key: TrendDimensionKey;
      label: string;
      angleDeg: number; // clockwise from positive x-axis
    }

    const axes: AxisDef[] = [
      { key: 'technology', label: '技术', angleDeg: -90 },
      { key: 'application', label: '应用', angleDeg: 0 },
      { key: 'policy', label: '政策', angleDeg: 90 },
      { key: 'capital', label: '资本', angleDeg: 180 },
    ];

    // Helper to get data point on an axis
    const getPoint = (angleDeg: number, ratio: number) =>
      polarPoint(cx, cy, axisLen * ratio, angleDeg);

    // Grid polygons (0.25, 0.5, 0.75, 1.0)
    const gridPolygons: string[] = [];
    for (const ratio of [0.25, 0.5, 0.75, 1.0]) {
      const pts = axes.map((a) => {
        const p = getPoint(a.angleDeg, ratio);
        return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      });
      gridPolygons.push(`  <polygon class="grid" points="${pts.join(' ')}" fill="none" />`);
    }

    // Axes lines from center to edge
    const axisLines: string[] = [];
    const axisLabels: string[] = [];
    axes.forEach((a) => {
      const tip = getPoint(a.angleDeg, 1.0);
      axisLines.push(`  <line class="axis" x1="${cx}" y1="${cy}" x2="${tip.x.toFixed(1)}" y2="${tip.y.toFixed(1)}" />`);

      // Label at tip + offset
      const offset = 20;
      let lx = tip.x;
      let ly = tip.y;
      let anchor = 'middle';
      if (a.angleDeg === -90) { ly = tip.y - offset; anchor = 'middle'; }
      else if (a.angleDeg === 0) { lx = tip.x + offset; anchor = 'start'; }
      else if (a.angleDeg === 90) { ly = tip.y + offset; anchor = 'middle'; }
      else if (a.angleDeg === 180) { lx = tip.x - offset; anchor = 'end'; }

      axisLabels.push(`  <text class="label" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" font-weight="bold" font-size="14">${a.label}</text>`);

    });

    // Data polygon
    const dataPoints = axes.map((a) => {
      const dim = trends[a.key];
      const conf = dim?.confidence ?? 0;
      const p = getPoint(a.angleDeg, conf);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    });

    // Data value labels at each axis
    const dataLabels: string[] = [];
    axes.forEach((a) => {
      const dim = trends[a.key];
      const conf = dim?.confidence ?? 0;
      const p = getPoint(a.angleDeg, conf);
      const off = 12;
      const dx = a.angleDeg === 180 ? -off : a.angleDeg === 0 ? off : 0;
      const dy = a.angleDeg === -90 ? -off : a.angleDeg === 90 ? off : 0;
      const anchor = a.angleDeg === 180 ? 'end' : a.angleDeg === 0 ? 'start' : 'middle';
      dataLabels.push(`  <text class="value" x="${(p.x + dx).toFixed(1)}" y="${(p.y + dy).toFixed(1)}" text-anchor="${anchor}" font-size="13" font-weight="bold" fill="#3B82F6">${conf.toFixed(2)}</text>`);
    });

    const svgContent = [
      `  <text class="title" x="${w / 2}" y="40" text-anchor="middle">四维趋势雷达 — ${date}</text>`,
      gridPolygons.join('\n'),
      axisLines.join('\n'),
      axisLabels.join('\n'),
      `  <polygon points="${dataPoints.join(' ')}" fill="rgba(59, 130, 246, 0.2)" stroke="#3B82F6" stroke-width="2" />`,
      dataLabels.join('\n'),
      `  <text class="note" x="${w / 2}" y="${h - 20}" text-anchor="middle">数据来源: Daily AI Insight Engine — ${date}</text>`,
    ].join('\n');

    return wrapSvg(svgContent, w, h);
  }

  // ---------------------------------------------------------------------------
  // Topic summary (Markdown)
  // ---------------------------------------------------------------------------

  generateTopicSummary(
    items: StructuredInsightItem[],
    date: string,
    topN = 3,
  ): string {
    log.info(`Generating topic summary for ${date} (topN=${topN})`);

    if (items.length === 0) {
      return `## 📊 今日 AI 话题热度 Top — ${date}\n\n暂无话题数据\n`;
    }

    // Sort by significance_score descending, take top N
    const sorted = [...items].sort(
      (a, b) => b.impact.significance_score - a.impact.significance_score,
    );
    const top = sorted.slice(0, Math.max(1, topN));

    const medals = ['🥇', '🥈', '🥉'];
    const sentimentLabels: Record<string, string> = {
      positive: '正面',
      neutral: '中性',
      negative: '负面',
    };

    const lines: string[] = [
      `## 📊 今日 AI 话题热度 Top ${top.length} — ${date}`,
      '',
    ];

    top.forEach((item, i) => {
      const medal = i < medals.length ? medals[i] : `#${i + 1}`;
      const score = item.impact.significance_score;
      const sentiment =
        sentimentLabels[item.sentiment.overall] || item.sentiment.overall;

      // Gather topic labels
      const topicLabels = item.topics.map((t) => t.label).join(', ');

      // Gather entity names
      const entityNames: string[] = [];
      for (const key of ['companies', 'products', 'people', 'technologies'] as const) {
        for (const ent of item.entities[key]) {
          entityNames.push(ent.name);
        }
      }

      lines.push(`### ${medal} No.${i + 1}: ${item.title} (显著性: ${score}/10)`);
      lines.push(`**来源**: ${item.source.name} | **情感**: ${sentiment} | **话题**: ${topicLabels}`);
      lines.push(`**摘要**: ${item.abstract}`);
      if (entityNames.length > 0) {
        lines.push(`**实体**: ${entityNames.join(', ')}`);
      }
      lines.push('');
    });

    return lines.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Empty state helper
  // ---------------------------------------------------------------------------

  private emptySvg(title: string, message: string, date?: string): string {
    const w = this.width;
    const h = this.height;
    const dateStr = date ?? '';
    const svgContent = [
      `  <text class="title" x="${w / 2}" y="40" text-anchor="middle">${title}</text>`,
      `  <text class="value" x="${w / 2}" y="${h / 2}" text-anchor="middle">${message}</text>`,
      `  <text class="note" x="${w / 2}" y="${h - 20}" text-anchor="middle">数据来源: Daily AI Insight Engine${dateStr ? ` — ${dateStr}` : ''}</text>`,
    ].join('\n');
    return wrapSvg(svgContent, w, h);
  }
}
