import { Dashboard } from '@/components/dashboard';
import { demoData } from '@/lib/dashboard/demo';
export const metadata = { title: 'Aperçu interactif' };
export default function DemoPage() {
    return <Dashboard demo initialData={demoData()} />;
}
