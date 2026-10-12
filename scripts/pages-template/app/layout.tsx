import type { Metadata } from 'next';
import '@/app/globals.css';

export const metadata: Metadata = {
  title: { default: 'myStats — Aperçu public', template: '%s · myStats' },
  description:
    'Découvre myStats : statistiques de course, trail et vélo avec des données fictives. Projet open source à auto-héberger pour connecter Strava.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
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
