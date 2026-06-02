import { Logger } from '../logger';

const log = new Logger('VISUALIZE');

// =============================================================================
// MermaidGenerator
// =============================================================================

export class MermaidGenerator {
  // ---------------------------------------------------------------------------
  // Timeline
  // ---------------------------------------------------------------------------

  generateTimeline(
    events: Array<{ title: string; score: number; published_at: string }>,
    date: string,
  ): string {
    log.info(`Generating Mermaid timeline for ${date} (${events.length} events)`);

    // Sort events by published_at ascending
    const sorted = [...events].sort(
      (a, b) => new Date(a.published_at).getTime() - new Date(b.published_at).getTime(),
    );

    const lines: string[] = [];
    lines.push('timeline');
    lines.push(`    title 今日 AI 显著事件时间线 — ${date}`);

    for (const evt of sorted) {
      const time = this.extractTime(evt.published_at);
      const marker = this.scoreMarker(evt.score);
      lines.push(`    ${time} : ${marker} ${evt.title} (${evt.score}/10)`);
    }

    return lines.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Entity graph
  // ---------------------------------------------------------------------------

  generateEntityGraph(
    coOccurrence: Array<{ source: string; target: string; weight: number }>,
    _date: string,
  ): string {
    log.info(`Generating Mermaid entity graph (${coOccurrence.length} edges)`);

    const lines: string[] = [];
    lines.push('graph LR');

    // Collect unique nodes and assign IDs
    const nodeIds = new Map<string, string>();
    let nextId = 0;

    const getId = (name: string): string => {
      if (!nodeIds.has(name)) {
        const id = String.fromCharCode(65 + nextId); // A, B, C, ...
        nextId++;
        nodeIds.set(name, id);
      }
      return nodeIds.get(name)!;
    };

    // First pass: declare all nodes
    const allNames = new Set<string>();
    for (const edge of coOccurrence) {
      allNames.add(edge.source);
      allNames.add(edge.target);
    }
    for (const name of allNames) {
      const id = getId(name);
      lines.push(`    ${id}[${name}]`);
    }

    // Second pass: edges
    for (const edge of coOccurrence) {
      const srcId = getId(edge.source);
      const tgtId = getId(edge.target);
      const arrow = edge.weight >= 3 ? '==>' : '-->';
      lines.push(`    ${srcId} ${arrow}|${edge.weight}次| ${tgtId}`);
    }

    return lines.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Extract HH:MM from an ISO 8601 timestamp.
   */
  private extractTime(isoString: string): string {
    try {
      const d = new Date(isoString);
      const hh = String(d.getUTCHours()).padStart(2, '0');
      const mm = String(d.getUTCMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    } catch {
      return '--:--';
    }
  }

  /**
   * Return a marker emoji based on score:
   *   >= 7  → 🔴
   *   4-6   → 🟡
   *   1-3   → 🟢
   */
  private scoreMarker(score: number): string {
    if (score >= 7) return '🔴';
    if (score >= 4) return '🟡';
    return '🟢';
  }
}
