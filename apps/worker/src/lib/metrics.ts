/** Minimal Prometheus text exposition (no client library). Metric names are prefixed `beacon_worker_`. */
export class Metrics {
  private readonly counters = new Map<string, Map<string, number>>();
  private readonly help = new Map<string, string>();

  inc(name: string, labels: Record<string, string>, by = 1, help = ''): void {
    if (help) this.help.set(name, help);
    const series = this.counters.get(name) ?? new Map<string, number>();
    const key = labelString(labels);
    series.set(key, (series.get(key) ?? 0) + by);
    this.counters.set(name, series);
  }

  get(name: string, labels: Record<string, string>): number {
    return this.counters.get(name)?.get(labelString(labels)) ?? 0;
  }

  render(gauges: { name: string; help: string; samples: { labels: Record<string, string>; value: number }[] }[] = []): string {
    const lines: string[] = [];
    for (const [name, series] of this.counters) {
      lines.push(`# HELP ${name} ${this.help.get(name) ?? name}`, `# TYPE ${name} counter`);
      for (const [labels, value] of series) lines.push(`${name}${labels} ${value}`);
    }
    for (const g of gauges) {
      lines.push(`# HELP ${g.name} ${g.help}`, `# TYPE ${g.name} gauge`);
      for (const s of g.samples) lines.push(`${g.name}${labelString(s.labels)} ${s.value}`);
    }
    return `${lines.join('\n')}\n`;
  }
}

function labelString(labels: Record<string, string>): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return '';
  return `{${entries.map(([k, v]) => `${k}="${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}`;
}
