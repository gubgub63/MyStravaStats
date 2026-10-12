import { Dashboard } from '@/components/dashboard';
import { demoData } from '@/lib/dashboard/demo';

export default function PublicPreview() {
  return <Dashboard demo publicPreview initialData={demoData()} />;
}
