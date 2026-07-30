import { redirect } from 'next/navigation';

/** Demo mode removed — send visitors to the marketing landing page. */
export default function DemoPage() {
  redirect('/');
}
