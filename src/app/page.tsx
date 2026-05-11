'use client';

import { LandingPage } from '@/components/landing';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Shield } from 'lucide-react';

export default function Home() {
  return (
    <LandingPage
      onGetStarted={() => window.location.href = '/login'}
      onDemo={() => window.location.href = '/demo'}
    />
  );
}
