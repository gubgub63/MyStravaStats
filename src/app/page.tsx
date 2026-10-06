import Link from 'next/link';
import { ArrowRight, Mountain, LockKeyhole, ChartNoAxesCombined } from 'lucide-react';
import { Header, Footer, Mountains } from '@/components/shell';
import { messages } from '@/lib/utils/errors';
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = typeof params.error === 'string' ? messages[params.error] : null;
  return (
    <>
      <Header />
      <main id="main">
        <section className="container hero">
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          {params.revocation === 'failed' && (
            <p className="notice" role="alert">
              Ta session locale a été supprimée. La révocation a échoué : retire l’accès dans les
              applications autorisées de Strava.
            </p>
          )}
          {params.disconnected && (
            <p className="notice" role="status">
              L’accès Strava a été révoqué et ta session supprimée.
            </p>
          )}
          <div className="eyebrow">
            <span className="status-dot" /> LE MOUVEMENT, EN PERSPECTIVE
          </div>
          <h1>
            Chaque sortie compte.
            <br />
            <span className="muted">Vois le chemin parcouru.</span>
          </h1>
          <p className="hero-description">
            Des kilomètres aux sommets, retrouve tes activités Strava
            <br className="desktop-break" /> dans un tableau de bord qui va à l’essentiel.
          </p>
          <div className="hero-actions">
            <a href="/api/auth/strava" className="button primary strava-connect">
              Connect with <strong>STRAVA</strong>
              <ArrowRight size={17} />
            </a>
            <Link href="/demo" className="text-button">
              Découvrir un aperçu <ArrowRight size={16} />
            </Link>
          </div>
          <p className="hero-note">
            <LockKeyhole size={13} /> Lecture seule · Sans compte supplémentaire
          </p>
          <Mountains className="hero-mountains" />
        </section>
        <section
          className="container landing-preview"
          aria-label="Exemple de statistiques, données fictives"
        >
          <div className="preview-top">
            <div>
              <span className="eyebrow">UN PEU DE RECUL SUR TES EFFORTS</span>
              <h2>Les dernières semaines, en un regard.</h2>
            </div>
            <span className="tag">Aperçu · données fictives</span>
          </div>
          <div className="preview-stats">
            <div>
              <span>Distance parcourue</span>
              <p>
                248,6 <small>km</small>
              </p>
            </div>
            <div>
              <span>Dénivelé positif</span>
              <p>
                6 420 <small>m</small>
              </p>
            </div>
            <div>
              <span>En mouvement</span>
              <p>
                28 <small>h</small> 14 <small>min</small>
              </p>
            </div>
            <div>
              <span>Sorties</span>
              <p>24</p>
            </div>
          </div>
          <div className="mini-chart" aria-hidden="true">
            {[28, 40, 34, 58, 45, 69, 52, 79, 62, 92, 73, 84].map((height, i) => (
              <div key={i} style={{ height: `${height}%` }}>
                <span />
              </div>
            ))}
          </div>
          <div className="chart-caption">
            <span>12 semaines de mouvement</span>
            <span>Un rythme qui se dessine.</span>
          </div>
        </section>
        <section className="container principles">
          <div>
            <ChartNoAxesCombined size={23} />
            <h3>Une vue d’ensemble.</h3>
            <p>Volume, régularité, allure. Les chiffres utiles pour comprendre ton entraînement.</p>
          </div>
          <div>
            <Mountain size={23} />
            <h3>Du bitume aux sommets.</h3>
            <p>Course, trail, vélo. Chaque pratique trouve sa place dans ta progression.</p>
          </div>
          <div>
            <LockKeyhole size={23} />
            <h3>Tes données, pour toi.</h3>
            <p>
              Une connexion directe à Strava. Aucun mot de passe à créer, aucune activité publiée.
            </p>
          </div>
        </section>
        <section className="container closing">
          <span className="eyebrow">LA SUITE COMMENCE À TA PROCHAINE SORTIE</span>
          <h2>Prends un peu de hauteur.</h2>
          <a href="/api/auth/strava" className="text-button">
            Connecter mon Strava <ArrowRight size={16} />
          </a>
        </section>
      </main>
      <Footer />
    </>
  );
}
