/**
 * Server-controlled metric tokens for structured narrative rendering.
 * LLM selects metric keys; server injects approved formatted values.
 */

import type { ApprovedNumericValue } from './numeric-validator';

export interface MetricCatalogEntry {
  key: string;
  value: number;
  unit?: ApprovedNumericValue['unit'];
  formatted: string;
  labels?: string[];
}

const TOKEN_RE = /\{\{metric:([a-zA-Z0-9._-]+)\}\}/g;

export function formatApprovedValue(value: number, unit?: ApprovedNumericValue['unit']): string {
  if (unit === 'pct') {
    const abs = Math.abs(value);
    const digits = abs >= 10 ? 1 : 2;
    return `${value.toFixed(digits)}%`;
  }
  if (unit === 'usd') {
    const abs = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1000) {
      return `${sign}$${Math.round(abs).toLocaleString('en-US')}`;
    }
    return `${sign}$${abs.toFixed(2)}`;
  }
  if (unit === 'count') return Math.round(value).toLocaleString('en-US');
  return String(value);
}

export function buildMetricCatalog(approved: ApprovedNumericValue[]): MetricCatalogEntry[] {
  return approved.map((a, i) => {
    const key =
      (a.labels?.[0] && a.labels[0].trim()) ||
      (a.unit ? `${a.unit}_${i}` : `metric_${i}`);
    return {
      key: key.replace(/\s+/g, '_').toLowerCase(),
      value: a.value,
      unit: a.unit,
      formatted: formatApprovedValue(a.value, a.unit),
      labels: a.labels,
    };
  });
}

/** Replace {{metric:key}} tokens with server-formatted approved values. */
export function renderMetricTemplate(
  template: string,
  catalog: MetricCatalogEntry[],
): { text: string; unresolved: string[] } {
  const byKey = new Map(catalog.map(e => [e.key, e]));
  // Also index labels
  for (const e of catalog) {
    for (const label of e.labels ?? []) {
      byKey.set(label.replace(/\s+/g, '_').toLowerCase(), e);
    }
  }

  const unresolved: string[] = [];
  const text = template.replace(TOKEN_RE, (_m, key: string) => {
    const hit = byKey.get(String(key).toLowerCase());
    if (!hit) {
      unresolved.push(key);
      return '[unavailable]';
    }
    return hit.formatted;
  });
  return { text, unresolved };
}

export function templatesToApprovedTexts(
  templates: string[],
  catalog: MetricCatalogEntry[],
): string[] {
  return templates.map(t => renderMetricTemplate(t, catalog).text);
}
