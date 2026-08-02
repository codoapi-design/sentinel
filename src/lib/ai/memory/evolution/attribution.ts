import type { PersistedInsightSnapshot } from '../types';
import type { EvolutionAttribution, IntelligenceEvolution } from './types';

const SIGNALS: Array<{ signal: EvolutionAttribution['mainDrivers'][number]['signal']; pattern: RegExp }> = [
  { signal: 'quantity', pattern: /quantity|amount|balance|units?|tokens?/i },
  { signal: 'price', pattern: /price|value_usd|usd_value|market_value/i },
  { signal: 'allocation', pattern: /allocation|concentration|weight|exposure|share|percent|pct/i },
  { signal: 'fees', pattern: /fee|cost|gas/i },
  { signal: 'diversification', pattern: /diversif/i },
];

function numeric(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function attributeEvolution(input: {
  evolution: IntelligenceEvolution;
  snapshots: PersistedInsightSnapshot[];
}): EvolutionAttribution {
  const ordered = [...input.snapshots].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const first = ordered[0];
  const last = ordered.at(-1);
  if (!first || !last || first === last) {
    return {
      mainDrivers: [{
        signal: 'unknown',
        description: 'Trend is observed, but its driver cannot be determined from available evidence.',
      }],
    };
  }

  const drivers = SIGNALS.flatMap(({ signal, pattern }) => {
    const key = Object.keys(last.observedValues).find(candidate => pattern.test(candidate));
    if (!key) return [];
    const previousValue = first.observedValues[key];
    const currentValue = last.observedValues[key];
    if (!numeric(previousValue) || !numeric(currentValue) || previousValue === currentValue) return [];
    return [{
      signal,
      previousValue,
      currentValue,
      description: `${signal[0]!.toUpperCase()}${signal.slice(1)} changed from ${previousValue} to ${currentValue}.`,
    }];
  });

  return drivers.length
    ? { mainDrivers: drivers }
    : {
      mainDrivers: [{
        signal: 'unknown',
        description: 'Trend is observed, but its driver cannot be determined from available evidence.',
      }],
    };
}
