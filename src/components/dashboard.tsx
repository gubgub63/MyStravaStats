'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  ArrowUpRight,
  RefreshCw,
  Route,
  Mountain,
  Clock3,
  Activity,
  LogOut,
} from 'lucide-react';
import { Header, Footer } from './shell';
import { number, pace, secondsToDuration, localDate } from '@/lib/utils/units';
import { aggregate, isRunning } from '@/lib/dashboard/aggregate';
import type { DashboardData } from '@/lib/dashboard/types';
import {
  resolvePeriod,
  periodQuery,
  type DashboardPeriod,
  type DateRange,
} from '@/lib/dashboard/period';
import { demoData } from '@/lib/dashboard/demo';
import type { Metric } from './charts';
const WeeklyChart = dynamic(() => import('./charts'), {
  ssr: false,
  loading: () => <div className="chart-container skeleton" />,
});
const sportNames: Record<string, string> = {
  Run: 'Course à pied',
  TrailRun: 'Trail',
  Ride: 'Vélo',
  VirtualRun: 'Course virtuelle',
  VirtualRide: 'Vélo virtuel',
  Walk: 'Marche',
  Hike: 'Randonnée',
  Swim: 'Natation',
  WeightTraining: 'Musculation',
};
const sportLabel = (sport: string) => sportNames[sport] ?? sport;
export function Dashboard({
  demo = false,
  initialData,
}: {
  demo?: boolean;
  initialData?: DashboardData;
}) {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(initialData ?? null);
  const [selectedPeriod, setSelectedPeriod] = useState<DashboardPeriod>(90);
  const [dateInputs, setDateInputs] = useState<DateRange>(() => {
    const range = initialData?.range ?? resolvePeriod(90);
    return { from: range.from, to: range.to };
  });
  const [sport, setSport] = useState('all');
  const [metric, setMetric] = useState<Metric>('distanceKm');
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState('');
  const [retryAt, setRetryAt] = useState(0);
  const [visible, setVisible] = useState(10);
  const active = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const load = useCallback(
    async (period: DashboardPeriod) => {
      if (demo) {
        setData(demoData(period));
        setVisible(10);
        setError('');
        setLoading(false);
        return;
      }
      active.current?.abort();
      const controller = new AbortController();
      active.current = controller;
      const requestId = ++generation.current;
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`/api/dashboard?${periodQuery(period)}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const body = await response.json();
        if (response.status === 401) {
          router.replace('/?error=NOT_AUTHENTICATED');
          return;
        }
        if (!response.ok) {
          if (body.retryAfter) setRetryAt(Date.now() + body.retryAfter * 1000);
          throw new Error(body.message ?? 'Impossible de charger les activités.');
        }
        if (requestId === generation.current) {
          setData(body);
          setVisible(10);
        }
      } catch (e) {
        if (!controller.signal.aborted && requestId === generation.current)
          setError(e instanceof Error ? e.message : 'Impossible de charger les activités.');
      } finally {
        if (requestId === generation.current) setLoading(false);
      }
    },
    [demo, router],
  );
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!demo) void load(selectedPeriod);
    }, 0);
    return () => {
      clearTimeout(timer);
      active.current?.abort();
    };
  }, [selectedPeriod, demo, load]);
  function period(value: DashboardPeriod) {
    setSelectedPeriod(value);
    setSport('all');
    setVisible(10);
    if (demo) void load(value);
  }
  const matching =
    data?.recentActivities.filter(
      (a) =>
        sport === 'all' || (sport === 'running' ? isRunning(a.sportType) : a.sportType === sport),
    ) ?? [];
  const stats =
    data && sport !== 'all' ? aggregate(matching, data.range.from, data.range.to) : data;
  const cachedUntil = data ? new Date(data.cacheExpiresAt).getTime() : 0;
  return (
    <>
      <Header />
      <main id="main" className="container dashboard-main">
        {demo && (
          <div className="demo-banner">
            <span>Aperçu interactif · Toutes les données sont fictives.</span>
            <a href="/api/auth/strava">
              Afficher mes activités <ArrowRight size={14} />
            </a>
          </div>
        )}
        <div className="dashboard-heading">
          <div>
            <span className="eyebrow">TON CARNET DE MOUVEMENT</span>
            <h1>
              {data?.athlete.firstname
                ? `Bonjour ${data.athlete.firstname}.`
                : 'Ton tableau de bord.'}
            </h1>
            <p className="muted">Un peu de recul sur tes dernières sorties.</p>
          </div>
          <div className="dashboard-actions">
            {data?.athlete.profile?.startsWith('https://') && (
              <Image
                width={34}
                height={34}
                unoptimized
                className="avatar"
                src={data.athlete.profile}
                alt="Photo de profil Strava"
                referrerPolicy="no-referrer"
              />
            )}
            <button
              className="button secondary"
              onClick={() => {
                if (Date.now() >= retryAt) void load(selectedPeriod);
              }}
              disabled={loading}
              aria-label="Actualiser les statistiques"
            >
              <RefreshCw size={15} className={loading ? 'spin' : ''} />
              <span>Actualiser</span>
            </button>
            {!demo && (
              <form action="/api/auth/logout" method="post">
                <button className="icon-button" title="Se déconnecter" aria-label="Se déconnecter">
                  <LogOut size={17} />
                </button>
              </form>
            )}
          </div>
        </div>
        <div className="dashboard-toolbar">
          <div className="segmented" aria-label="Période">
            {[
              [90, '3 mois'],
              [180, '6 mois'],
              [365, '1 an'],
            ].map(([value, label]) => (
              <button
                key={value}
                aria-pressed={selectedPeriod === value}
                className={selectedPeriod === value ? 'selected' : ''}
                disabled={loading}
                onClick={() => period(Number(value))}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="sport-select">
            <span className="sr-only">Filtrer par sport</span>
            <select
              value={sport}
              onChange={(e) => {
                setSport(e.target.value);
                setVisible(10);
              }}
            >
              <option value="all">Tous les sports</option>
              <option value="running">Course & trail</option>
              {data?.sports.map((s) => (
                <option key={s.sport} value={s.sport}>
                  {sportLabel(s.sport)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <form
          className="date-range-form"
          onSubmit={(event) => {
            event.preventDefault();
            try {
              resolvePeriod(dateInputs);
            } catch (error) {
              setError(error instanceof Error ? error.message : 'Choisis des dates valides.');
              return;
            }
            setError('');
            period({ ...dateInputs });
          }}
        >
          <div className="date-range-fields">
            <label>
              Du
              <input
                type="date"
                required
                min="1970-01-01"
                value={dateInputs.from}
                onChange={(e) => setDateInputs((v) => ({ ...v, from: e.target.value }))}
              />
            </label>
            <label>
              Au
              <input
                type="date"
                required
                min={dateInputs.from || '1970-01-01'}
                value={dateInputs.to}
                onChange={(e) => setDateInputs((v) => ({ ...v, to: e.target.value }))}
              />
            </label>
            <button className="button secondary" type="submit" disabled={loading}>
              Appliquer
            </button>
          </div>
          <span className="date-range-note">Dates incluses</span>
        </form>
        {error && (
          <div className="notice error" role="alert">
            {error}
            {retryAt > 0 && (
              <span> Réessaie après {new Date(retryAt).toLocaleTimeString('fr-FR')}.</span>
            )}
          </div>
        )}
        {data?.partial && (
          <p className="notice" role="status">
            Cette période dépasse 1 000 activités : les statistiques sont partielles. Choisis une
            période plus courte.
          </p>
        )}
        {loading ? (
          <div role="status" aria-label="Chargement des activités">
            <div className="kpi-grid">
              {[1, 2, 3, 4].map((i) => (
                <div className="kpi skeleton" key={i} />
              ))}
            </div>
            <div className="chart-panel skeleton" style={{ height: 330, marginTop: 24 }} />
            <span className="sr-only">Chargement de tes activités Strava…</span>
          </div>
        ) : stats && data ? (
          <>
            <div className="kpi-grid">
              {[
                {
                  label: 'Distance',
                  value: number(stats.summary.distanceKm, 1),
                  unit: 'km',
                  icon: Route,
                },
                {
                  label: 'Dénivelé positif',
                  value: number(stats.summary.elevationGainM),
                  unit: 'm',
                  icon: Mountain,
                },
                {
                  label: 'Temps en mouvement',
                  value: secondsToDuration(stats.summary.movingTimeSeconds),
                  unit: '',
                  icon: Clock3,
                },
                {
                  label: 'Activités',
                  value: number(stats.summary.activityCount),
                  unit: 'sorties',
                  icon: Activity,
                },
              ].map((k) => (
                <div className="kpi" key={k.label}>
                  <div className="kpi-label">
                    {k.label}
                    <k.icon size={17} strokeWidth={1.5} />
                  </div>
                  <p>
                    {k.value} <small>{k.unit}</small>
                  </p>
                  <span className="kpi-note">
                    {typeof selectedPeriod === 'number'
                      ? `Sur les ${data.days} derniers jours`
                      : `Du ${data.range.from.split('-').reverse().join('/')} au ${data.range.to.split('-').reverse().join('/')}`}
                  </span>
                </div>
              ))}
            </div>
            {stats.summary.activityCount === 0 && (
              <div className="empty-state">
                <Mountain size={30} />
                <h2>Le chemin commence ici.</h2>
                <p>
                  Aucune activité visible sur cette période. Essaie une période plus longue ou un
                  autre sport.
                </p>
                <p className="muted">
                  Les activités « Moi uniquement » ne sont pas incluses dans les permissions
                  demandées.
                </p>
              </div>
            )}
            <div className="chart-grid">
              <section className="chart-panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">LE FIL DES SEMAINES</span>
                    <h2>Ton rythme.</h2>
                  </div>
                  <select
                    aria-label="Métrique hebdomadaire"
                    value={metric}
                    onChange={(e) => setMetric(e.target.value as Metric)}
                  >
                    <option value="distanceKm">Distance · km</option>
                    <option value="elevationGainM">Dénivelé · m</option>
                    <option value="movingTimeSeconds">Temps · h</option>
                  </select>
                </div>
                <WeeklyChart weekly={stats.weekly} metric={metric} />
              </section>
              <section className="chart-panel sports-panel">
                <span className="eyebrow">À CHACUN SON TERRAIN</span>
                <h2>Tes pratiques.</h2>
                <p className="panel-subtitle">Répartition du temps en mouvement</p>
                <div className="sport-bars">
                  {stats.sports.map((s, i) => {
                    const share = stats.summary.movingTimeSeconds
                      ? (s.movingTimeSeconds / stats.summary.movingTimeSeconds) * 100
                      : 0;
                    return (
                      <div className="sport-row" key={s.sport}>
                        <div>
                          <span>
                            <i style={{ opacity: 1 - Math.min(i, 4) * 0.16 }} />
                            {sportLabel(s.sport)}
                          </span>
                          <strong>{number(share)} %</strong>
                        </div>
                        <div className="bar-track">
                          <div style={{ width: `${share}%`, opacity: 1 - Math.min(i, 4) * 0.16 }} />
                        </div>
                        <p>
                          {s.count} sorties · {secondsToDuration(s.movingTimeSeconds)}
                        </p>
                      </div>
                    );
                  })}
                  {stats.sports.length === 0 && (
                    <p className="muted">Aucune activité sur cette période.</p>
                  )}
                </div>
              </section>
            </div>
            {stats.running.count > 0 && (
              <section className="running-panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">COURSE & TRAIL</span>
                    <h2>Un peu plus loin.</h2>
                  </div>
                  <Mountain size={25} strokeWidth={1.3} />
                </div>
                <div className="running-grid">
                  <div>
                    <span>Allure moyenne</span>
                    <p>
                      {pace(stats.running.paceSecondsPerKm)} <small>/km</small>
                    </p>
                  </div>
                  <div>
                    <span>Vitesse moyenne</span>
                    <p>
                      {number(stats.running.speedKmH ?? 0, 1)} <small>km/h</small>
                    </p>
                    <small>{number(stats.running.speedKmMin ?? 0, 3)} km/min</small>
                  </div>
                  <div>
                    <span>Plus longue sortie</span>
                    <p>
                      {number(stats.running.longestRunKm, 1)} <small>km</small>
                    </p>
                  </div>
                  <div>
                    <span>Plus grand D+</span>
                    <p>
                      {number(stats.running.highestElevationM)} <small>m</small>
                    </p>
                  </div>
                  <div>
                    <span>Allure effort estimée</span>
                    <p>
                      {pace(stats.running.effortPace)} <small>/km effort</small>
                    </p>
                  </div>
                </div>
                <p className="running-note">
                  {stats.running.count} sorties · {number(stats.running.distanceKm, 1)} km ·{' '}
                  {number(stats.running.elevationGainM)} m D+ ·{' '}
                  {secondsToDuration(stats.running.movingTimeSeconds)}. Charge hebdomadaire : temps
                  d’activité dans le graphique. L’allure effort utilise 1 km supplémentaire pour 100
                  m D+. Estimation indicative, indépendante de la VAP Strava.{' '}
                  <Link href="/privacy#calculs">Méthode ↗</Link>
                </p>
              </section>
            )}
            <section className="activities-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">LES PAS QUI COMPTENT</span>
                  <h2>Tes dernières sorties.</h2>
                </div>
                <span className="muted">{matching.length} activités</span>
              </div>
              <div className="table-scroll">
                <table className="activities-table">
                  <caption className="sr-only">Activités Strava récentes</caption>
                  <thead>
                    <tr>
                      <th>Activité</th>
                      <th>Date</th>
                      <th>Distance</th>
                      <th>D+</th>
                      <th>Durée</th>
                      <th>Allure / vitesse</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matching.slice(0, visible).map((a) => (
                      <tr key={a.id}>
                        <td>
                          <a
                            href={
                              demo
                                ? '/api/auth/strava'
                                : `https://www.strava.com/activities/${a.id}`
                            }
                            target={demo ? undefined : '_blank'}
                            rel="noreferrer"
                          >
                            <span className="activity-icon">
                              {isRunning(a.sportType) ? (
                                <Mountain size={17} />
                              ) : (
                                <Route size={17} />
                              )}
                            </span>
                            <span>
                              <strong>{a.name}</strong>
                              <small>{sportLabel(a.sportType)}</small>
                            </span>
                            <ArrowUpRight size={13} className="activity-arrow" />
                          </a>
                        </td>
                        <td data-label="Date">{localDate(a.localDate)}</td>
                        <td data-label="Distance">
                          {number(a.distanceKm, 1)} <span>km</span>
                        </td>
                        <td data-label="D+">
                          {number(a.elevationGainM)} <span>m</span>
                        </td>
                        <td data-label="Durée">{secondsToDuration(a.movingTimeSeconds)}</td>
                        <td data-label="Allure / vitesse">
                          {isRunning(a.sportType)
                            ? `${pace(a.paceSecondsPerKm)} /km`
                            : `${number(a.averageSpeedMps * 3.6, 1)} km/h`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {matching.length > visible && (
                <button className="text-button load-more" onClick={() => setVisible((v) => v + 20)}>
                  Voir plus de sorties <ArrowRight size={15} />
                </button>
              )}
            </section>
            <div className="data-footer">
              <span>
                {demo
                  ? 'Données de démonstration'
                  : `Synchronisé à ${new Date(data.fetchedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · Cache privé 10 min`}
                {!demo &&
                  cachedUntil > 0 &&
                  ` · Nouvelle lecture possible après ${new Date(cachedUntil).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}
              </span>
              {!demo && (
                <form
                  action="/api/auth/disconnect"
                  method="post"
                  onSubmit={(e) => {
                    if (
                      !window.confirm(
                        'Révoquer l’accès de myStats à Strava et supprimer ta session ?',
                      )
                    )
                      e.preventDefault();
                  }}
                >
                  <button className="quiet-link">Révoquer l’accès Strava</button>
                </form>
              )}
            </div>
          </>
        ) : (
          !loading && (
            <div className="empty-state">
              <h2>Les données n’ont pas pu être chargées.</h2>
              <button className="button secondary" onClick={() => void load(selectedPeriod)}>
                Réessayer
              </button>
            </div>
          )
        )}
      </main>
      <Footer />
    </>
  );
}
