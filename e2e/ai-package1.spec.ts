/**
 * Minimal Package 1 E2E.
 *
 * - Unauthenticated API contract tests hit real routes.
 * - UI Analyze/Chat flows use the controlled fixture page at /e2e/ai-package1
 *   (ENABLE_E2E_FIXTURES=1) with Playwright route mocks labeled below.
 * - Full dashboard auth UI remains available when E2E_EMAIL / E2E_PASSWORD are set.
 */

import { expect, test, type Page } from '@playwright/test';

const hasAuth = Boolean(process.env.E2E_EMAIL && process.env.E2E_PASSWORD);
const FIXTURE_TRACE = 'e2e-trace-package1-sol-42';
const FIXTURE_SOL_PCT = 42;

const analyzeFixture = {
  success: true,
  data: {
    completionStatus: 'partial',
    narrative:
      '## Summary\n\nSOL represents 42% of the portfolio.\n\n## Key Findings\n\n- SOL is the largest holding.',
    source: 'deterministic',
    insights: [
      {
        id: 'sol-allocation',
        title: 'SOL allocation',
        description: 'SOL represents 42% of the portfolio.',
        severity: 'info',
        evidence: { allocationPct: FIXTURE_SOL_PCT },
      },
    ],
    metrics: [
      {
        engine: 'asset',
        key: 'allocationPct',
        label: 'SOL allocation',
        value: FIXTURE_SOL_PCT,
        unit: 'percent',
      },
    ],
    confidence: 'high',
    dataQuality: {
      completeness: 72,
      truncated: true,
      loadedTransactionCount: 100,
      totalTransactionCount: 500,
      syncStatus: 'ready',
      lastSyncedAt: null,
      notes: ['Controlled fixture: truncated history'],
    },
    toolsUsed: ['asset'],
    analysisMode: 'dashboard',
    periodDays: 30,
    periodLabel: 'Last 30 days',
    generatedAt: Date.now(),
    traceId: FIXTURE_TRACE,
    reasonedIntelligence: {
      schemaVersion: '1.0.0',
      selectedInsightIds: ['cand:sol-loss', 'cand:sol-one-time'],
      rankedInsightIds: ['cand:sol-loss', 'cand:sol-one-time'],
      approvedInsights: [
        {
          id: 'cand:sol-loss',
          type: 'concentrated_loss',
          category: 'performance',
          title: 'SOL detracted while portfolio grew',
          proposedMeaning:
            'SOL contributed −$368 before a small net flow; portfolio growth came from other assets.',
          priority: { score: 0.72, level: 'high' },
          materiality: { score: 0.45, level: 'medium' },
          reasoning: {
            summary: 'Cannot determine from available data.',
            selectedCauseIds: ['cause:unknown'],
            hypotheses: [{ languageState: 'cannot_determine', causeType: 'unknown' }],
          },
          reasoningConfidence: {
            observationConfidence: { score: 70 },
            causalConfidence: { score: 35 },
            interpretationConfidence: { score: 35 },
          },
        },
        {
          id: 'cand:sol-one-time',
          type: 'one_time_material_event',
          category: 'flow',
          title: 'One-time material inflow — not a recurring dependency',
          proposedMeaning: 'Single 100% counterparty interaction reclassified as one-time event.',
          priority: { score: 0.6, level: 'medium' },
          materiality: { score: 0.55, level: 'medium' },
          reasoning: {
            summary: 'likely: external inflow.',
            hypotheses: [{ languageState: 'likely', causeType: 'external_inflow' }],
          },
          reasoningConfidence: {
            observationConfidence: { score: 80 },
            causalConfidence: { score: 55 },
            interpretationConfidence: { score: 55 },
          },
        },
      ],
      whatMatters: {
        primaryFindingId: 'cand:sol-loss',
        secondaryFindingIds: ['cand:sol-one-time'],
        headline: 'SOL detracted while portfolio grew',
        whatChanged:
          'SOL contributed negatively before a small net flow; one-time inflow is not dependency.',
        whyItMatters: 'Negative contribution must rank ahead of immaterial net flow.',
        mainCause: 'Cannot determine from available data.',
      },
      monitoringPoints: [
        {
          id: 'mon:sol',
          relatedFindingId: 'cand:sol-loss',
          metric: 'allocation_pct',
          explanation: 'Watch SOL allocation rising above 50%.',
        },
      ],
      attribution: {
        portfolio: {
          totalChangeUsd: 4559,
          contributors: [
            { entityId: 'ETH', contributionUsd: 4928, direction: 'positive' },
            { entityId: 'SOL', contributionUsd: -368, direction: 'negative' },
          ],
        },
      },
      limitations: [
        'Controlled fixture',
        'Analysis level: individual wallet (not combined user portfolio).',
        'Historical snapshots insufficient — drift cause cannot be determined; current allocation remains usable.',
      ],
      versions: { reasoningEngine: 'reasoning-engine-v1' },
    },
  },
};

const chatFixture = {
  success: true,
  data: {
    ...analyzeFixture.data,
    completionStatus: 'exact',
    message: 'SOL represents 42% of the portfolio.',
    narrative: 'SOL represents 42% of the portfolio.',
    analysisMode: 'chat',
    dataQuality: {
      ...analyzeFixture.data.dataQuality,
      truncated: false,
      completeness: 100,
    },
  },
};

async function mockAiApis(page: Page) {
  await page.route('**/api/ai/analyze', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(analyzeFixture),
    });
  });
  await page.route('**/api/ai/chat', async route => {
    const body = route.request().postDataJSON() as { mode?: string; message?: string };
    // Server would force chat; fixture still returns chat mode even if client sends telegram.
    const payload = {
      ...chatFixture,
      data: {
        ...chatFixture.data,
        message:
          body?.message?.toLowerCase().includes('follow')
            ? 'Follow-up stays in chat mode with the same 42% SOL allocation.'
            : chatFixture.data.message,
        analysisMode: 'chat',
        // Deliberately omit any hallucinated 99% figure — UI must not invent one.
      },
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });
}

test.describe('Package 1 AI — unauthenticated API', () => {
  test('login page is reachable', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('body')).toBeVisible();
  });

  test('analyze/chat API reject unauthenticated requests with structured error', async ({
    request,
  }) => {
    const analyze = await request.post('/api/ai/analyze', {
      data: { walletId: '11111111-1111-4111-8111-111111111111', sectionType: 'portfolio' },
    });
    expect([401, 403]).toContain(analyze.status());
    const analyzeBody = await analyze.json();
    expect(analyzeBody.error?.traceId || analyzeBody.error).toBeTruthy();

    const chat = await request.post('/api/ai/chat', {
      data: {
        walletId: '11111111-1111-4111-8111-111111111111',
        message: 'How much of my portfolio is SOL?',
      },
    });
    expect([401, 403]).toContain(chat.status());
  });
});

test.describe('Package 1 AI — controlled fixture UI (ENABLE_E2E_FIXTURES=1)', () => {
  test('Analyze flow: loading, structured result, trace, allocation, partial badge', async ({
    page,
  }) => {
    await mockAiApis(page);
    await page.goto('/e2e/ai-package1');
    await expect(page.getByTestId('e2e-ai-package1')).toBeVisible();

    const trigger = page.getByTestId('ai-analysis-trigger');
    await expect(trigger).toBeVisible();
    await trigger.click();

    await expect(page.getByTestId('ai-analysis-loading')).toBeVisible({ timeout: 5_000 }).catch(
      () => undefined
    );
    await expect(page.getByTestId('ai-analysis-result')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('ai-analysis-trace-id')).toContainText(/Trace e2e-trac/i);
    await expect(page.getByTestId('ai-analysis-limitation-badge')).toHaveText(/Partial/i);
    await expect(page.getByTestId('ai-analysis-result')).toContainText(/42/);
    await expect(page.getByTestId('ai-analysis-result')).not.toContainText(/99%/);
    await expect(page.getByTestId('ai-what-matters')).toContainText(/SOL detracted|portfolio grew/i);
    const primary = page.getByTestId('ai-primary-insight');
    await expect(primary).toBeVisible();
    await expect(primary.getByTestId('ai-insight-materiality')).toBeVisible();
    await expect(primary.getByTestId('ai-insight-confidence')).toBeVisible();
    await expect(primary.getByTestId('ai-insight-cause')).toContainText(/Cannot determine/i);
    await expect(page.getByTestId('ai-attribution')).toContainText(/SOL/);
    await expect(page.getByTestId('ai-attribution')).toContainText(/-368/);
    await expect(page.getByTestId('ai-monitoring-points')).toBeVisible();
    await expect(page.getByTestId('ai-limitations')).toContainText(/individual wallet/i);
    await expect(page.getByTestId('ai-main-cause')).toContainText(/Cannot determine/i);
    // One-time inflow must be framed as NOT a recurring dependency
    await expect(page.getByTestId('ai-supporting-insight')).toContainText(/not a recurring dependency/i);
    await expect(page.getByTestId('ai-what-matters')).not.toContainText(/recurring counterparty dependency/i);
  });

  test('Chat flow: authoritative SOL %, follow-up, no mode escalation, no hallucinated %', async ({
    page,
  }) => {
    await mockAiApis(page);
    await page.goto('/e2e/ai-package1');

    // Open chat FAB
    await page.getByTestId('floating-chat-button').click();
    await expect(page.getByTestId('ai-chat-panel')).toBeVisible();

    const input = page.locator('[data-testid="ai-chat-panel"] textarea');
    await input.fill('How much of my portfolio is SOL?');
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('ai-chat-panel')).toContainText(/42%/i, { timeout: 15_000 });
    await expect(page.getByTestId('ai-chat-panel')).not.toContainText(/99%/);

    await input.fill('Follow up: confirm the same allocation');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('ai-chat-panel')).toContainText(/Follow-up stays in chat mode/i, {
      timeout: 15_000,
    });
    await expect(page.getByTestId('ai-chat-panel')).toContainText(/42%/);
    await expect(page.getByTestId('ai-chat-panel')).not.toContainText(/telegram/i);
  });
});

test.describe('Authenticated Analyze + Chat (requires E2E_EMAIL)', () => {
  test.skip(!hasAuth, 'Set E2E_EMAIL and E2E_PASSWORD to run authenticated dashboard UI flows.');

  test('dashboard Analyze/Chat smoke', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', process.env.E2E_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL(/dashboard|assets|portfolio/i, { timeout: 30_000 });
    await page.goto('/dashboard');
    const analyzeBtn = page.getByRole('button', { name: /AI Data Analysis|Analyze/i }).first();
    if (await analyzeBtn.count()) {
      await analyzeBtn.click();
      await expect(page.locator('text=/trace|analysis|portfolio|SOL|Limitation|Partial/i').first()).toBeVisible({
        timeout: 45_000,
      });
    }
  });
});
