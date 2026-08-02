/**
 * Schema-validated structured narrative + rendering for backward compatibility.
 */

import { z } from 'zod';

import { STRUCTURED_NARRATIVE_SCHEMA_VERSION, type StructuredNarrative } from './types';

export const structuredNarrativeSchema = z.object({
  schemaVersion: z.string().min(1),
  headline: z.string().min(1).max(300),
  directAnswer: z.string().max(800).optional(),
  summary: z.string().min(1).max(4000),
  selectedFindingIds: z.array(z.string().max(200)).max(30),
  interpretation: z.string().max(4000),
  monitoringPoints: z.array(z.string().max(500)).max(12),
  monitoringPointIds: z.array(z.string().max(200)).max(12).optional(),
  whatMatters: z
    .object({
      whatChanged: z.string().max(1000),
      whyItMatters: z.string().max(1000),
      mainCause: z.string().max(500).optional(),
      mainOffset: z.string().max(500).optional(),
    })
    .optional(),
  limitations: z.array(z.string().max(500)).max(20),
  language: z.string().min(2).max(16),
});

export function parseStructuredNarrative(
  raw: unknown,
  allowedFindingIds: Set<string>,
): { ok: true; value: StructuredNarrative } | { ok: false; reason: string } {
  const parsed = structuredNarrativeSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues.map(i => i.message).join('; ') };
  }

  const value = parsed.data;
  const invalidIds = value.selectedFindingIds.filter(id => !allowedFindingIds.has(id));
  if (invalidIds.length > 0) {
    return {
      ok: false,
      reason: `selectedFindingIds not in supplied findings: ${invalidIds.slice(0, 5).join(', ')}`,
    };
  }

  // Reject advisory verbs in structured fields
  const joined = [
    value.headline,
    value.directAnswer ?? '',
    value.summary,
    value.interpretation,
    ...value.monitoringPoints,
  ].join('\n');
  if (/\b(buy|sell|hold|guaranteed profit|sure profit)\b/i.test(joined)) {
    return { ok: false, reason: 'Structured narrative contains prohibited advisory language.' };
  }

  return {
    ok: true,
    value: {
      ...value,
      schemaVersion: value.schemaVersion || STRUCTURED_NARRATIVE_SCHEMA_VERSION,
    },
  };
}

/** Try to extract JSON object from model text (fenced or raw). */
export function extractJsonObject(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function renderStructuredNarrativeMarkdown(sn: StructuredNarrative): string {
  const lines: string[] = [];
  lines.push(`## ${sn.headline}`);
  if (sn.directAnswer) {
    lines.push('');
    lines.push(sn.directAnswer);
  }
  lines.push('');
  lines.push(sn.summary);
  if (sn.interpretation.trim()) {
    lines.push('');
    lines.push(sn.interpretation);
  }
  if (sn.monitoringPoints.length > 0) {
    lines.push('');
    lines.push('### Monitoring');
    for (const point of sn.monitoringPoints) {
      lines.push(`- ${point}`);
    }
  }
  if (sn.limitations.length > 0) {
    lines.push('');
    lines.push('### Limitations');
    for (const lim of sn.limitations) {
      lines.push(`- ${lim}`);
    }
  }
  return lines.join('\n').trim();
}

export function structuredNarrativeFromDeterministic(input: {
  headline: string;
  summary: string;
  interpretation?: string;
  monitoringPoints?: string[];
  limitations?: string[];
  findingIds?: string[];
  language?: string;
  directAnswer?: string;
}): StructuredNarrative {
  return {
    schemaVersion: STRUCTURED_NARRATIVE_SCHEMA_VERSION,
    headline: input.headline.slice(0, 300) || 'Analysis',
    directAnswer: input.directAnswer,
    summary: input.summary.slice(0, 4000) || input.headline,
    selectedFindingIds: input.findingIds ?? [],
    interpretation: (input.interpretation ?? '').slice(0, 4000),
    monitoringPoints: input.monitoringPoints ?? [],
    limitations: input.limitations ?? [],
    language: input.language ?? 'en',
  };
}

export const STRUCTURED_OUTPUT_INSTRUCTIONS = `Return ONLY a JSON object matching this schema (no markdown outside JSON):
{
  "schemaVersion": "${STRUCTURED_NARRATIVE_SCHEMA_VERSION}",
  "headline": string,
  "directAnswer": string (optional),
  "summary": string,
  "selectedFindingIds": string[] (only IDs from Retrieved Intelligence),
  "interpretation": string,
  "monitoringPoints": string[],
  "limitations": string[],
  "language": string (BCP-47 / short code, match the user)
}

Rules:
- Do not invent metrics or findings.
- Do not include buy/sell/hold or guaranteed-profit instructions.
- Prefer server metric tokens for financial values: {{metric:<key>}} where <key> matches an approved metric key from Retrieved Intelligence (e.g. {{metric:allocationpct}}). The server injects formatted numbers.
- You may also repeat exact numbers already present in Retrieved Intelligence.
- selectedFindingIds must reference supplied finding ids only.`;
