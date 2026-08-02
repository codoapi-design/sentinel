function normalize(value?: string | null): string {
  return (value ?? 'none')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Stable identity for a monitored condition within a wallet. */
export function buildMonitoringKey(input: {
  walletId: string;
  metric: string;
  relatedFindingId?: string | null;
  lifecycleKey?: string | null;
}): string {
  return [
    `wallet:${normalize(input.walletId)}`,
    `metric:${normalize(input.metric)}`,
    `finding:${normalize(input.relatedFindingId)}`,
    `lifecycle:${normalize(input.lifecycleKey)}`,
  ].join(':');
}
