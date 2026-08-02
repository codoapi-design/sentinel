import type { DomainStatus } from '@/lib/ai/trust/types';

import type {
  ApprovedInsight,
  ContributionAttribution,
  WhatMattersSummary,
} from './types';

export function buildWhatMatters(input: {
  approved: ApprovedInsight[];
  selectedIds: string[];
  portfolio?: ContributionAttribution;
  domainStatuses: DomainStatus[];
}): WhatMattersSummary {
  const selected = input.selectedIds
    .map(id => input.approved.find(a => a.id === id))
    .filter((x): x is ApprovedInsight => Boolean(x));

  const primary = selected[0] ?? null;
  const secondary = selected.slice(1, 4).map(s => s.id);

  const negativeAsset = input.portfolio?.contributors.find(
    c => c.entityType === 'asset' && c.direction === 'negative',
  );
  const positiveOffset = input.portfolio?.contributors.find(
    c => c.entityType === 'asset' && c.direction === 'positive',
  );

  const domainsOk = (name: string) => {
    const d = input.domainStatuses.find(x => x.domain === name);
    return d && (d.status === 'available' || d.status === 'partial');
  };

  const importantAbsence: string[] = [];
  if (domainsOk('transactions') && !selected.some(s => s.category === 'flow' && s.type.includes('distribution'))) {
    importantAbsence.push('No abnormal broad selling pattern selected in primary insights.');
  }
  if (domainsOk('holdings') && !selected.some(s => s.materiality.level === 'critical' && s.category === 'risk')) {
    importantAbsence.push('No newly critical risk regime beyond selected concentration/performance items.');
  }
  if (
    domainsOk('transactions') &&
    !selected.some(s => s.type.includes('dependency') || s.type.includes('recurring'))
  ) {
    importantAbsence.push('No meaningful recurring counterparty concentration in primary selection.');
  }

  return {
    primaryFindingId: primary?.id ?? null,
    secondaryFindingIds: secondary,
    headline: primary?.title ?? 'No primary insight cleared eligibility for this scope.',
    whatChanged: primary?.proposedMeaning ?? 'No material approved change narrative for this period.',
    whyItMatters:
      primary?.userMeaning.general ??
      'Approved insights prioritize material, adequately sampled, non-duplicative findings.',
    mainCause: primary?.reasoning.summary,
    mainOffset:
      negativeAsset && positiveOffset
        ? `${negativeAsset.entityId} detracted while ${positiveOffset.entityId} offset part of the move.`
        : undefined,
    importantAbsence: importantAbsence.length ? importantAbsence : undefined,
  };
}
