import { redirect } from 'next/navigation';
import { readSession } from '@/lib/auth/session';
import { Dashboard } from '@/components/dashboard';
export const metadata = { title: 'Ton tableau de bord', robots: { index: false, follow: false } };
export default async function DashboardPage() {
  if (!(await readSession())) redirect('/');
  return <Dashboard />;
}
