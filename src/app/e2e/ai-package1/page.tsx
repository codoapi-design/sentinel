/**
 * Controlled E2E fixture page (Package 1).
 * Only available when ENABLE_E2E_FIXTURES=1.
 * Labeled fixture — not a production surface.
 */

import { notFound } from 'next/navigation';
import { Package1E2eFixture } from './fixture-client';

export const dynamic = 'force-dynamic';

export default function Package1E2ePage() {
  if (process.env.ENABLE_E2E_FIXTURES !== '1') {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[#0a0b0c] text-[#f7f8f8] p-6" data-testid="e2e-ai-package1">
      <h1 className="text-lg font-semibold mb-2">Package 1 AI E2E Fixture</h1>
      <p className="text-xs text-[#8a8f98] mb-6">
        Controlled fixture page — mocks Analyze/Chat HTTP responses via Playwright routes.
      </p>
      <Package1E2eFixture />
    </main>
  );
}
