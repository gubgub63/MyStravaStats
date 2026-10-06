import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';
export const metadata: Metadata = {
    title: { default: 'myStats — Ton sport, en perspective.', template: '%s · myStats' },
    description:
        'Tes statistiques Strava, simplement. Course, trail et vélo dans un tableau de bord privé, sans compte supplémentaire.',
    robots: { index: true, follow: true },
};
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    await headers();
    return (
        <html lang="fr" suppressHydrationWarning>
            <body>
                <a className="skip-link" href="#main">
                    Aller au contenu
                </a>
                {children}
            </body>
        </html>
    );
}
