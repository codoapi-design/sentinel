import { notFound } from 'next/navigation';
import { Package3E2eFixture } from './fixture-client';
export const dynamic = 'force-dynamic';
export default function Package3E2ePage() {
  if (process.env.ENABLE_E2E_FIXTURES !== '1') notFound();
  return <main className="min-h-screen bg-[#0a0b0c] p-6 text-[#f7f8f8]" data-testid="e2e-ai-package3"><h1 className="mb-4 text-lg font-semibold">Package 3 AI E2E Fixture</h1><Package3E2eFixture /></main>;
}
