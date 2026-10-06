import Link from 'next/link';
import { Activity, ArrowUpRight } from 'lucide-react';
import { ThemeToggle } from './theme-toggle';
export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="MyStats, accueil">
      <Activity size={23} strokeWidth={1.8} />
      <span>
        my<span className="brand-light">stats</span>
        <span className="brand-dot">.</span>
      </span>
    </Link>
  );
}
export function Header() {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Brand />
        <nav aria-label="Navigation principale">
          <Link href="/demo" className="quiet-link">
            Aperçu
          </Link>
          <a
            className="quiet-link github-link"
            href="https://github.com/gubgub63/MyStravaStats"
            target="_blank"
            rel="noreferrer"
          >
            Open source <ArrowUpRight size={14} />
          </a>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="container footer">
      <span>myStats · Toujours en mouvement.</span>
      <div>
        <Link href="/privacy">Confidentialité</Link>
        <a href="https://github.com/gubgub63/MyStravaStats" target="_blank" rel="noreferrer">
          GitHub ↗
        </a>
        <span className="powered">Powered by Strava</span>
      </div>
    </footer>
  );
}
export function Mountains({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 600 200" fill="none" aria-hidden="true">
      <path
        d="M0 170L63 142L90 155L158 70L190 104L223 86L276 148L350 37L393 92L417 77L497 155L538 123L600 164"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M0 189L104 171L168 141L236 177L326 139L387 165L453 131L600 181"
        stroke="currentColor"
        strokeWidth=".8"
        opacity=".35"
      />
      <path
        d="M317 81L350 37L370 64L351 61L341 75L330 69Z"
        stroke="currentColor"
        strokeWidth=".8"
      />
      <path d="M138 95L158 70L177 91L158 85L149 95Z" stroke="currentColor" strokeWidth=".8" />
    </svg>
  );
}
