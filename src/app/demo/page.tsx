'use client';

import { useRouter } from 'next/navigation';
import { Dashboard } from '@/components/dashboard';

export default function DemoPage() {
  const router = useRouter();

  // The Dashboard renders its own demo banner (with a sign-in prompt) and empty
  // states. No sample/mock data is shown; sign-in routes to the real login flow.
  return <Dashboard onLogout={() => router.push('/login')} isDemo={true} />;
}
