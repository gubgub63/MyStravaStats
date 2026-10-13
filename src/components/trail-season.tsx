'use client';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  Flag,
  Mountain,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
  UserRound,
  X,
} from 'lucide-react';
import { Header, Footer, Mountains } from './shell';
import {
  seasonSchema,
  profileSchema,
  raceSchema,
  resultSchema,
  emptySeason,
  type Season,
  type TrailRace,
  type TrailResult,
} from '@/lib/trail/types';
import {
  difficulty,
  duration,
  durationInput,
  effortKm,
  estimateField,
  parseDuration,
  predictTime,
} from '@/lib/trail/model';
import { parseFieldCsv, parseGpx } from '@/lib/trail/import';
import { catalog, type RaceCatalogItem } from '@/lib/trail/catalog';
import type { RunnerMatch } from '@/lib/trail/providers';
import { number, pace } from '@/lib/utils/units';

const ProgressChart = dynamic(() => import('./trail-charts').then((m) => m.ProgressChart), {
  ssr: false,
});
const ElevationChart = dynamic(() => import('./trail-charts').then((m) => m.ElevationChart), {
  ssr: false,
});
const RouteDrawing = dynamic(() => import('./trail-charts').then((m) => m.RouteDrawing), {
  ssr: false,
});
type Athlete = { id: number; firstname?: string; lastname?: string };
type View = 'plan' | 'progress' | 'profile';
const terrainNames = [
  'Roulant',
  'Sentier facile',
  'Mixte / irrégulier',
  'Rocheux / technique',
  'Très technique',
];
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const dateLabel = (s: string) =>
  new Date(s + 'T12:00:00').toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Une erreur est survenue.');
async function getJson(url: string) {
  const response = await fetch(url, { cache: 'no-store' });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? 'La source est indisponible.');
  return body;
}
function download(content: string, name: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function optionalNumber(data: FormData, key: string) {
  const value = String(data.get(key) ?? '').trim();
  return value ? Number(value) : null;
}
function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`trail-field${wide ? ' wide' : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}
function TerrainSelect({ value }: { value: number | null }) {
  return (
    <select name="terrain" defaultValue={value ?? ''}>
      <option value="">Non renseigné</option>
      {terrainNames.map((s, i) => (
        <option key={s} value={i}>
          {s}
        </option>
      ))}
    </select>
  );
}
function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="trail-modal" onCancel={close} aria-labelledby="trail-dialog-title">
      <div className="trail-modal-head">
        <h2 id="trail-dialog-title">{title}</h2>
        <button className="trail-icon-button" onClick={close} aria-label="Fermer">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function TrailSeason({
  athlete,
  stravaConfigured,
}: {
  athlete: Athlete | null;
  stravaConfigured: boolean;
}) {
  const [season, setSeason] = useState<Season>(() =>
    emptySeason(athlete?.firstname, athlete?.lastname),
  );
  const currentSeason = useRef(season);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<View>('plan');
  const [year, setYear] = useState(() => Number(today().slice(0, 4)) + 1);
  const [selected, setSelected] = useState('');
  const [modal, setModal] = useState<'race' | 'result' | null>(null);
  const [editRace, setEditRace] = useState<TrailRace | null>(null);
  const [editResult, setEditResult] = useState<TrailResult | null>(null);
  const [metric, setMetric] = useState<'speed' | 'utmb' | 'itra'>('speed');
  const [busy, setBusy] = useState('');
  const [matches, setMatches] = useState<RunnerMatch[]>([]);
  const [lookupName, setLookupName] = useState<{ firstname: string; lastname: string } | null>(
    null,
  );
  const backupRef = useRef<HTMLInputElement>(null);
  const key = `mystats.trail.v1.${athlete?.id ?? 'local'}`;
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const data = seasonSchema.parse(JSON.parse(stored));
        queueMicrotask(() => {
          currentSeason.current = data;
          setSeason(data);
          setReady(true);
        });
      } else queueMicrotask(() => setReady(true));
    } catch {
      queueMicrotask(() => {
        setNotice(
          'La sauvegarde locale est inaccessible ou invalide. Elle n’a pas été écrasée. Exporte tes nouvelles données pour les conserver.',
        );
        setReady(true);
      });
    }
  }, [key]);
  function commit(next: Season, success = '') {
    currentSeason.current = next;
    setSeason(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setNotice(success);
    } catch {
      setNotice(
        'Les changements restent dans cette page mais n’ont pas pu être sauvegardés. Exporte une sauvegarde avant de fermer.',
      );
    }
  }
  function updateRace(patch: Partial<TrailRace> & { id: string }, success = '') {
    const latest = currentSeason.current;
    commit(
      { ...latest, races: latest.races.map((r) => (r.id === patch.id ? { ...r, ...patch } : r)) },
      success,
    );
  }
  const races = season.races
    .filter((r) => r.date.startsWith(String(year)))
    .sort((a, b) => a.date.localeCompare(b.date));
  const race = races.find((r) => r.id === selected) ?? races[0];
  const results = season.results
    .filter((r) => r.date.startsWith(String(year)))
    .sort((a, b) => b.date.localeCompare(a.date));
  const priorities = races.filter((r) => r.priority === 'A');
  const years = [
    ...new Set([
      Number(today().slice(0, 4)),
      Number(today().slice(0, 4)) + 1,
      year,
      ...season.races.map((r) => Number(r.date.slice(0, 4))),
      ...season.results.map((r) => Number(r.date.slice(0, 4))),
    ]),
  ].sort((a, b) => a - b);
  async function restore(file: File) {
    try {
      if (file.size > 15 * 1024 * 1024) throw new Error('La sauvegarde dépasse 15 Mo.');
      const next = seasonSchema.parse(JSON.parse(await file.text()));
      commit(next, 'Sauvegarde restaurée.');
      setSelected('');
    } catch {
      setNotice('Sauvegarde invalide. Les données actuelles ont été conservées.');
    }
  }
  async function findRunner(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMatches([]);
    setNotice('');
    setBusy('runner');
    const data = new FormData(e.currentTarget);
    const name = {
      firstname: String(data.get('firstname') ?? '').trim(),
      lastname: String(data.get('lastname') ?? '').trim(),
    };
    setLookupName(name);
    try {
      const body = await getJson(`/api/trail/runners?${new URLSearchParams(name)}`);
      setMatches(body.runners);
      if (!body.runners.length)
        setNotice(
          'Aucun profil trouvé. Essaie une autre orthographe ou ouvre la recherche officielle.',
        );
    } catch (e) {
      setNotice(messageOf(e));
    } finally {
      setBusy('');
    }
  }
  async function importRunner(match: RunnerMatch) {
    setBusy('runner');
    setNotice('');
    try {
      const body = await getJson(`/api/trail/runners?uri=${encodeURIComponent(match.uri)}`);
      const latest = currentSeason.current;
      const incoming = new Map<string, TrailResult>(
        body.results.map((r: TrailResult) => [r.id, r]),
      );
      const merged = latest.results.map((r) => {
        const fresh = incoming.get(r.id);
        incoming.delete(r.id);
        return fresh
          ? { ...fresh, itra: r.itra, terrain: r.terrain, utmb: fresh.utmb ?? r.utmb }
          : r;
      });
      const next = seasonSchema.parse({
        ...latest,
        profile: {
          ...latest.profile,
          ...(lookupName ?? {}),
          utmb: body.utmb,
          utmbUrl: body.source,
          checkedAt: body.checkedAt,
        },
        results: [...merged, ...incoming.values()],
      });
      commit(
        next,
        `${body.results.length} résultats synchronisés depuis le profil de ${body.fullname}. Les scores non publics restent vides.`,
      );
      setMatches([]);
    } catch (e) {
      setNotice(messageOf(e));
    } finally {
      setBusy('');
    }
  }
  if (!ready)
    return (
      <>
        <Header season />
        <main id="main" className="container trail-loading" aria-busy="true">
          Ouverture de ta saison…
        </main>
      </>
    );
  return (
    <>
      <Header season />
      <main id="main" className="container trail-page">
        <div className="trail-heading">
          <div>
            <div className="eyebrow">
              <span className="trail-dot" /> TON PROCHAIN HORIZON
            </div>
            <h1>
              Ta saison, <span>à ton rythme.</span>
            </h1>
            <p>Des résultats aux prochains sommets. Un endroit pour tout relier.</p>
          </div>
          <Mountains className="trail-heading-mountains" />
        </div>
        <div className="trail-toolbar">
          <div className="trail-tabs" role="group" aria-label="Vue de la saison">
            {(
              [
                ['plan', 'Mes objectifs', Flag],
                ['progress', 'Ma progression', Mountain],
                ['profile', 'Mon profil', UserRound],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                className={view === id ? 'active' : ''}
                aria-pressed={view === id}
                onClick={() => setView(id)}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
          <label className="trail-year">
            <CalendarDays size={16} />
            <span className="sr-only">Saison</span>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => (
                <option key={y} value={y}>
                  Saison {y}
                </option>
              ))}
            </select>
          </label>
        </div>
        {notice && (
          <div className="trail-notice" role="status">
            <span>{notice}</span>
            <button onClick={() => setNotice('')} aria-label="Fermer le message">
              <X size={16} />
            </button>
          </div>
        )}
        <div className="trail-metrics">
          <div>
            <span>Objectifs principaux</span>
            <strong>
              {priorities.length}
              <small> / 3 conseillés</small>
            </strong>
          </div>
          <div>
            <span>Kilomètres au programme</span>
            <strong>
              {number(
                races.reduce((s, r) => s + r.distanceKm, 0),
                1,
              )}
              <small> km</small>
            </strong>
          </div>
          <div>
            <span>Sommets à aller chercher</span>
            <strong>
              {number(races.reduce((s, r) => s + r.ascentM, 0))}
              <small> m D+</small>
            </strong>
          </div>
          <div>
            <span>Index UTMB actuel</span>
            <strong>
              {season.profile.utmb ?? '—'}
              <small> / 1 000</small>
            </strong>
          </div>
        </div>
        {view === 'plan' && (
          <div className="trail-plan">
            <section className="trail-calendar">
              <div className="trail-section-heading">
                <div>
                  <span className="eyebrow">LE FIL DE TA SAISON</span>
                  <h2>Les rendez-vous.</h2>
                </div>
                <button
                  className="trail-icon-button filled"
                  aria-label="Ajouter une course"
                  onClick={() => {
                    setEditRace(null);
                    setModal('race');
                  }}
                >
                  <Plus size={20} />
                </button>
              </div>
              <p className="trail-helper">
                Deux ou trois temps forts. De la place pour le chemin entre les deux.
              </p>
              {races.length ? (
                <div className="trail-race-list">
                  {races.map((r) => (
                    <button
                      key={r.id}
                      className={`trail-race-card ${race?.id === r.id ? 'selected' : ''}`}
                      aria-pressed={race?.id === r.id}
                      onClick={() => setSelected(r.id)}
                    >
                      <div className="trail-date-block">
                        <span>
                          {new Date(r.date + 'T12:00:00')
                            .toLocaleDateString('fr-FR', { month: 'short' })
                            .replace('.', '')}
                        </span>
                        <strong>{r.date.slice(8)}</strong>
                      </div>
                      <div className="trail-race-card-body">
                        <span className={`trail-priority p-${r.priority}`}>
                          {r.priority === 'A'
                            ? 'Objectif principal'
                            : r.priority === 'B'
                              ? 'Préparation'
                              : 'Plaisir'}
                        </span>
                        <h3>{r.name}</h3>
                        <p>
                          {number(r.distanceKm, 1)} km <span>·</span> {number(r.ascentM)} m D+
                        </p>
                        <div className="trail-target-line">
                          <Flag size={12} />
                          {r.targetSeconds ? duration(r.targetSeconds) : 'Temps cible à définir'}
                        </div>
                      </div>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="trail-empty-calendar">
                  <Flag size={30} strokeWidth={1.2} />
                  <h3>Le départ est ici.</h3>
                  <p>
                    Choisis ton premier rendez-vous de {year}. Tu pourras ensuite construire la
                    suite.
                  </p>
                  <button
                    className="button trail-primary"
                    onClick={() => {
                      setEditRace(null);
                      setModal('race');
                    }}
                  >
                    <Plus size={16} /> Ajouter une course
                  </button>
                </div>
              )}
              <div className="trail-season-note">
                <span className="trail-dot" />
                <p>
                  {priorities.length > 3
                    ? 'Plus de trois objectifs principaux : pense à garder de la place pour la récupération.'
                    : 'A · objectif principal   B · préparation   C · plaisir'}
                </p>
              </div>
              <button
                className="trail-add-line"
                onClick={() => {
                  setEditRace(null);
                  setModal('race');
                }}
              >
                <Plus size={16} /> Un autre horizon
              </button>
            </section>
            {race ? (
              <RaceDetail
                key={race.id}
                race={race}
                results={season.results}
                busy={busy}
                setBusy={setBusy}
                notify={setNotice}
                update={updateRace}
                edit={() => {
                  setEditRace(race);
                  setModal('race');
                }}
                remove={() => {
                  commit(
                    { ...season, races: season.races.filter((r) => r.id !== race.id) },
                    'Course retirée de la saison.',
                  );
                  setSelected('');
                }}
              />
            ) : (
              <section className="trail-panel trail-start-panel">
                <div className="trail-panel-kicker">
                  <Mountain size={17} /> LE PROCHAIN SOMMET
                </div>
                <h2>
                  Et si tu prenais
                  <br />
                  la direction du lac de Côme ?
                </h2>
                <p>
                  Retrouve les formats UTLAC, leurs distances et leur dénivelé auprès de
                  l’organisateur. Importe ensuite la trace pour explorer le relief.
                </p>
                <Mountains className="trail-start-mountains" />
                <div className="trail-start-stats">
                  <span>5 formats</span>
                  <span>13,5 à 259 km</span>
                  <span>Italie</span>
                </div>
                <button
                  className="button trail-primary"
                  onClick={() => {
                    setEditRace(null);
                    setModal('race');
                  }}
                >
                  Explorer les courses <ArrowRight size={16} />
                </button>
                <a
                  className="trail-source-link"
                  href="https://www.utlactrail.com/en/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Voir l’organisateur <ArrowUpRight size={13} />
                </a>
              </section>
            )}
          </div>
        )}
        {view === 'progress' && (
          <>
            <section className="trail-panel trail-progression-panel">
              <div className="trail-section-heading">
                <div>
                  <span className="eyebrow">LE CHEMIN PARCOURU</span>
                  <h2>Un résultat après l’autre.</h2>
                </div>
                <button
                  className="button trail-primary"
                  onClick={() => {
                    setEditResult(null);
                    setModal('result');
                  }}
                >
                  <Plus size={16} /> Ajouter un résultat
                </button>
              </div>
              <div className="trail-chart-tabs" role="group" aria-label="Mesure de progression">
                {(
                  [
                    ['speed', 'Vitesse effort'],
                    ['utmb', 'Score UTMB'],
                    ['itra', 'Score ITRA'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    aria-pressed={metric === id}
                    className={metric === id ? 'active' : ''}
                    onClick={() => setMetric(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <ProgressChart results={results} metric={metric} />
              <p className="trail-helper">
                {metric === 'speed'
                  ? 'km-effort/h = (distance + D+/100) ÷ temps écoulé. Les terrains différents limitent la comparaison.'
                  : 'Scores de chaque course, saisis ou publiés. Cette courbe ne représente pas ton index général.'}{' '}
                Saison {year}.
              </p>
            </section>
            <section className="trail-panel trail-results-panel">
              <div className="trail-section-heading">
                <h2>Tes résultats.</h2>
                <button className="text-button" onClick={() => setView('profile')}>
                  Synchroniser UTMB <ArrowRight size={14} />
                </button>
              </div>
              {results.length ? (
                <div className="table-scroll">
                  <table>
                    <caption className="sr-only">Résultats de la saison {year}</caption>
                    <thead>
                      <tr>
                        <th>Course</th>
                        <th>Distance / D+</th>
                        <th>Temps</th>
                        <th>km-effort/h</th>
                        <th>Place</th>
                        <th>UTMB / ITRA</th>
                        <th>
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <strong>{r.name}</strong>
                            <span className="trail-table-date">
                              {dateLabel(r.date)}{' '}
                              {r.source && (
                                <a
                                  href={r.source}
                                  target="_blank"
                                  rel="noreferrer"
                                  aria-label={`Source de ${r.name}`}
                                >
                                  <ArrowUpRight size={12} />
                                </a>
                              )}
                            </span>
                          </td>
                          <td>
                            {number(r.distanceKm, 1)} km
                            <br />
                            <span className="trail-helper">{number(r.ascentM)} m</span>
                          </td>
                          <td>{r.status === 'dnf' ? 'Abandon' : duration(r.seconds)}</td>
                          <td>
                            {r.status === 'finished' && r.seconds
                              ? number(effortKm(r.distanceKm, r.ascentM) / (r.seconds / 3600), 2)
                              : '—'}
                          </td>
                          <td>{r.rank ? `${r.rank} / ${r.finishers ?? '?'}` : '—'}</td>
                          <td>
                            {r.utmb ?? '—'} / {r.itra ?? '—'}
                          </td>
                          <td>
                            <button
                              className="trail-icon-button"
                              aria-label={`Modifier le résultat ${r.name}`}
                              onClick={() => {
                                setEditResult(r);
                                setModal('result');
                              }}
                            >
                              <SlidersHorizontal size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="trail-results-empty">
                  <p>Aucun résultat pour {year}.</p>
                  <p className="trail-helper">
                    Ajoute une course terminée ou retrouve tes résultats depuis ton profil UTMB.
                  </p>
                </div>
              )}
            </section>
          </>
        )}
        {view === 'profile' && (
          <div className="trail-profile-grid">
            <section className="trail-panel">
              <span className="eyebrow">LES CHIFFRES QUI TE SUIVENT</span>
              <h2>Ton profil coureur.</h2>
              <p className="trail-helper">
                Retrouve ton profil UTMB par nom, puis confirme ton identité avant la
                synchronisation.
              </p>
              <form
                onSubmit={findRunner}
                className="trail-form"
                key={`lookup-${season.profile.firstname}-${season.profile.lastname}`}
              >
                <Field label="Prénom">
                  <input
                    name="firstname"
                    required
                    maxLength={100}
                    autoComplete="given-name"
                    defaultValue={season.profile.firstname}
                  />
                </Field>
                <Field label="Nom">
                  <input
                    name="lastname"
                    required
                    maxLength={100}
                    autoComplete="family-name"
                    defaultValue={season.profile.lastname}
                  />
                </Field>
                <button className="button trail-primary wide" disabled={!!busy}>
                  <Search size={16} />
                  {busy === 'runner' ? 'Recherche en cours…' : 'Rechercher mon profil UTMB'}
                </button>
              </form>
              {!!matches.length && (
                <div className="trail-runner-matches">
                  <p className="trail-helper">
                    La recherche peut proposer des homonymes. Sélectionne uniquement ton profil.
                  </p>
                  {matches.map((m) => (
                    <div key={m.id}>
                      <div>
                        <strong>{m.fullname}</strong>
                        <p>
                          {m.nationality} · {m.ageGroup} · index {m.ip ?? '—'}
                        </p>
                        <a
                          className="trail-source-link"
                          href={`https://utmb.world/runner/${m.uri}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Vérifier le profil <ArrowUpRight size={12} />
                        </a>
                      </div>
                      <button
                        className="button secondary"
                        disabled={!!busy}
                        onClick={() => importRunner(m)}
                      >
                        C’est moi <Check size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="trail-profile-indexes">
                <div>
                  <span>UTMB</span>
                  <strong>{season.profile.utmb ?? '—'}</strong>
                </div>
                <div>
                  <span>ITRA</span>
                  <strong>{season.profile.itra ?? '—'}</strong>
                </div>
              </div>
              {season.profile.checkedAt && (
                <p className="trail-helper">
                  UTMB synchronisé le{' '}
                  {new Date(season.profile.checkedAt).toLocaleDateString('fr-FR')}.
                </p>
              )}
              <div className="trail-external-search">
                <a
                  href="https://utmb.world/en/utmb-index/runner-search"
                  target="_blank"
                  rel="noreferrer"
                >
                  Recherche officielle UTMB <ArrowUpRight size={13} />
                </a>
                <a href="https://itra.run/Runners/FindARunner" target="_blank" rel="noreferrer">
                  Recherche officielle ITRA <ArrowUpRight size={13} />
                </a>
              </div>
              <details className="trail-method">
                <summary>Compléter mon profil et mon index ITRA</summary>
                <p>
                  L’import ITRA automatique est indisponible. Relève ton index sur ton profil
                  officiel et ajoute le lien source.
                </p>
                <form
                  className="trail-form"
                  key={JSON.stringify(season.profile)}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const d = new FormData(e.currentTarget);
                    const parsed = profileSchema.safeParse({
                      ...season.profile,
                      firstname: d.get('firstname'),
                      lastname: d.get('lastname'),
                      utmb: optionalNumber(d, 'utmb'),
                      itra: optionalNumber(d, 'itra'),
                      utmbUrl: d.get('utmbUrl'),
                      itraUrl: d.get('itraUrl'),
                    });
                    if (!parsed.success) {
                      setNotice('Vérifie les scores entre 0 et 1 000 et les liens HTTPS.');
                      return;
                    }
                    commit({ ...season, profile: parsed.data }, 'Profil enregistré.');
                  }}
                >
                  <Field label="Prénom">
                    <input
                      name="firstname"
                      maxLength={100}
                      defaultValue={season.profile.firstname}
                    />
                  </Field>
                  <Field label="Nom">
                    <input name="lastname" maxLength={100} defaultValue={season.profile.lastname} />
                  </Field>
                  <Field label="Index UTMB général">
                    <input
                      name="utmb"
                      type="number"
                      min={0}
                      max={1000}
                      defaultValue={season.profile.utmb ?? ''}
                    />
                  </Field>
                  <Field label="Index ITRA général">
                    <input
                      name="itra"
                      type="number"
                      min={0}
                      max={1000}
                      defaultValue={season.profile.itra ?? ''}
                    />
                  </Field>
                  <Field label="Lien du profil UTMB" wide>
                    <input
                      name="utmbUrl"
                      type="url"
                      placeholder="https://utmb.world/runner/…"
                      defaultValue={season.profile.utmbUrl}
                    />
                  </Field>
                  <Field label="Lien du profil ITRA" wide>
                    <input
                      name="itraUrl"
                      type="url"
                      placeholder="https://itra.run/…"
                      defaultValue={season.profile.itraUrl}
                    />
                  </Field>
                  <button className="button trail-primary wide">Enregistrer mon profil</button>
                </form>
              </details>
            </section>
            <section className="trail-panel trail-local-panel">
              <span className="eyebrow">TON ESPACE PERSONNEL</span>
              <h2>Tout commence ici.</h2>
              <p>
                Ta saison est enregistrée dans ce navigateur
                {athlete
                  ? `, pour ton compte Strava ${athlete.firstname ?? ''}`
                  : ', en mode local'}
                . Tu peux planifier sans connecter de service.
              </p>
              <div className="trail-connection">
                <div className="trail-connection-icon">
                  <UserRound size={22} />
                </div>
                <div>
                  <strong>
                    {athlete ? `${athlete.firstname ?? ''} ${athlete.lastname ?? ''}` : 'Strava'}
                  </strong>
                  <p>
                    {athlete
                      ? 'Connecté · activités disponibles'
                      : 'Relier tes entraînements au tableau de bord'}
                  </p>
                </div>
                {athlete ? (
                  <Link href="/dashboard" className="trail-source-link">
                    Voir <ArrowRight size={14} />
                  </Link>
                ) : (
                  <a href="/api/auth/strava" className="button secondary">
                    Connecter
                  </a>
                )}
              </div>
              {!stravaConfigured && (
                <p className="trail-helper">
                  La connexion Strava nécessite les paramètres de ton application dans .env.local.
                  Consulte le guide de configuration du projet.
                </p>
              )}
              <div className="trail-storage-note">
                <ArrowDownToLine size={20} />
                <div>
                  <strong>Garde une copie de ta saison.</strong>
                  <p>
                    Une suppression des données du navigateur efface cette sauvegarde. L’export
                    permet aussi de la transférer après connexion à Strava ou sur un autre appareil.
                  </p>
                </div>
              </div>
              <button
                className="button secondary trail-backup"
                onClick={() =>
                  download(
                    JSON.stringify(season, null, 2),
                    `mystats-saison-${today()}.json`,
                    'application/json',
                  )
                }
              >
                <ArrowDownToLine size={16} /> Exporter ma sauvegarde
              </button>
              <button className="trail-add-line" onClick={() => backupRef.current?.click()}>
                <Upload size={16} /> Restaurer une sauvegarde
              </button>
              <p className="trail-helper">
                La restauration remplace le profil, les courses et les résultats de cet espace.
              </p>
              <input
                ref={backupRef}
                className="sr-only"
                type="file"
                accept=".json,application/json"
                aria-label="Sauvegarde de saison"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void restore(file);
                  e.target.value = '';
                }}
              />
            </section>
          </div>
        )}
        <div className="trail-bottom-note">
          <span>
            <span className="trail-dot" /> {athlete ? 'Espace du compte Strava' : 'Espace local'} ·
            sauvegarde dans ce navigateur
          </span>
          <button onClick={() => setView('profile')}>
            Profil & sauvegarde <ArrowRight size={13} />
          </button>
        </div>
      </main>
      <Footer />
      {modal === 'race' && (
        <RaceEditor
          race={editRace}
          year={year}
          close={() => setModal(null)}
          save={(r) => {
            commit(
              {
                ...season,
                races: editRace
                  ? season.races.map((old) => (old.id === r.id ? r : old))
                  : [...season.races, r],
              },
              'Course enregistrée.',
            );
            setSelected(r.id);
            setYear(Number(r.date.slice(0, 4)));
            setModal(null);
          }}
        />
      )}
      {modal === 'result' && (
        <ResultEditor
          result={editResult}
          year={year}
          close={() => setModal(null)}
          save={(r) => {
            commit(
              {
                ...season,
                results: editResult
                  ? season.results.map((old) => (old.id === r.id ? r : old))
                  : [...season.results, r],
              },
              'Résultat enregistré.',
            );
            setYear(Number(r.date.slice(0, 4)));
            setModal(null);
          }}
          remove={
            editResult
              ? () => {
                  commit(
                    { ...season, results: season.results.filter((r) => r.id !== editResult.id) },
                    'Résultat supprimé.',
                  );
                  setModal(null);
                }
              : undefined
          }
        />
      )}
    </>
  );
}

function RaceDetail({
  race,
  results,
  update,
  edit,
  remove,
  busy,
  setBusy,
  notify,
}: {
  race: TrailRace;
  results: TrailResult[];
  update: (r: Partial<TrailRace> & { id: string }, message?: string) => void;
  edit: () => void;
  remove: () => void;
  busy: string;
  setBusy: (s: string) => void;
  notify: (s: string) => void;
}) {
  const [target, setTarget] = useState(durationInput(race.targetSeconds));
  const gpxRef = useRef<HTMLInputElement>(null),
    csvRef = useRef<HTMLInputElement>(null);
  const prediction = predictTime(race, results, today());
  const field = race.targetSeconds ? estimateField(race.targetSeconds, race.field) : null;
  const index = difficulty(race);
  async function importTrack(file?: File) {
    setBusy('gpx');
    try {
      let xml: string,
        filename: string,
        source = '';
      if (file) {
        if (file.size > 20 * 1024 * 1024) throw new Error('Le GPX dépasse 20 Mo.');
        xml = await file.text();
        filename = file.name;
      } else {
        const response = await fetch(
          `/api/trail/gpx?id=${encodeURIComponent(race.catalogId ?? '')}`,
        );
        if (!response.ok) throw new Error((await response.json()).message);
        xml = await response.text();
        filename = `${race.catalogId}.gpx`;
        source = response.headers.get('X-GPX-Source') ?? '';
      }
      const track = parseGpx(xml, filename, source);
      const next = raceSchema.parse({ ...race, track });
      update(
        { id: next.id, track: next.track },
        'Trace analysée. Les valeurs organisateur sont conservées pour les projections ; les mesures GPX sont affichées séparément.',
      );
    } catch (e) {
      notify(messageOf(e));
    } finally {
      setBusy('');
    }
  }
  return (
    <section className="trail-panel trail-detail">
      <div className="trail-detail-top">
        <span className="trail-panel-kicker">
          <Mountain size={16} /> FICHE OBJECTIF
        </span>
        <div>
          <button className="trail-icon-button" aria-label="Modifier la course" onClick={edit}>
            <SlidersHorizontal size={17} />
          </button>
          <button
            className="trail-icon-button"
            aria-label="Retirer la course de la saison"
            onClick={remove}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      <h2>{race.name}</h2>
      <p className="trail-detail-date">
        <CalendarDays size={14} /> {dateLabel(race.date)}
        {race.source && (
          <a href={race.source} target="_blank" rel="noreferrer">
            Organisateur <ArrowUpRight size={12} />
          </a>
        )}
      </p>
      <div className="trail-detail-specs">
        <div>
          <span>Distance</span>
          <strong>
            {number(race.distanceKm, 1)}
            <small> km</small>
          </strong>
        </div>
        <div>
          <span>Dénivelé</span>
          <strong>
            {number(race.ascentM)}
            <small> m D+</small>
          </strong>
        </div>
        <div>
          <span>Effort</span>
          <strong>
            {number(effortKm(race.distanceKm, race.ascentM), 1)}
            <small> km</small>
          </strong>
        </div>
        <div>
          <span>
            {race.track && race.terrain !== null ? 'Difficulté maison' : 'Difficulté partielle'}
          </span>
          <strong>
            {index}
            <small> / 100</small>
          </strong>
        </div>
      </div>
      {race.organizerTerrain && (
        <p className="trail-helper">
          Terrain annoncé par l’organisateur : {race.organizerTerrain}. Relevé le{' '}
          {new Date(race.sourceCheckedAt).toLocaleDateString('fr-FR')}.
        </p>
      )}
      <div className="trail-relief-head">
        <h3>Lire le terrain.</h3>
        {race.track && <span className="trail-tag">GPX analysé</span>}
      </div>
      {race.track ? (
        <>
          <div className="trail-track-grid">
            <ElevationChart track={race.track} />
            <RouteDrawing track={race.track} />
          </div>
          <p className="trail-helper">
            GPX : {number(race.track.distanceKm, 1)} km · {number(race.track.ascentM)} m D+ ·{' '}
            {number(race.track.descentM)} m D− · pentes marquées {race.track.slopeIndex}/100.
          </p>
          <p className="trail-helper">
            {race.track.filename} · relevé le{' '}
            {new Date(race.track.fetchedAt).toLocaleDateString('fr-FR')}
            {race.track.source && (
              <>
                {' '}
                ·{' '}
                <a href={race.track.source} target="_blank" rel="noreferrer">
                  source GPX ↗
                </a>
              </>
            )}
          </p>
          {(Math.abs(race.track.distanceKm / race.distanceKm - 1) > 0.05 ||
            (race.ascentM > 0 && Math.abs(race.track.ascentM / race.ascentM - 1) > 0.1)) && (
            <p className="trail-warning">
              Écart avec les valeurs organisateur : plus de 5 % en distance ou 10 % en D+. Le
              filtrage et l’édition du GPX peuvent l’expliquer ; vérifie la trace officielle.
            </p>
          )}
        </>
      ) : (
        <div className="trail-gpx-empty">
          <Mountain size={24} strokeWidth={1.2} />
          <div>
            <strong>Le relief attend sa trace.</strong>
            <p>
              Analyse les montées, les descentes et le profil de pente depuis un GPX avec altitudes.
            </p>
          </div>
        </div>
      )}
      <div className="trail-file-actions">
        {race.catalogId && (
          <button className="button secondary" disabled={!!busy} onClick={() => void importTrack()}>
            <ArrowDownToLine size={14} />
            {busy === 'gpx' ? 'Analyse…' : 'Récupérer le GPX'}
          </button>
        )}
        <button className="text-button" disabled={!!busy} onClick={() => gpxRef.current?.click()}>
          <Upload size={14} /> Importer un GPX
        </button>
        <input
          ref={gpxRef}
          type="file"
          accept=".gpx,application/gpx+xml"
          className="sr-only"
          aria-label="Trace GPX"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importTrack(file);
            e.target.value = '';
          }}
        />
      </div>
      <div className="trail-simulation">
        <div className="trail-section-heading">
          <div>
            <span className="eyebrow">DONNER UN CAP À L’EFFORT</span>
            <h3>Ton scénario de course.</h3>
          </div>
          <Flag size={20} />
        </div>
        <form
          className="trail-target-form"
          onSubmit={(e) => {
            e.preventDefault();
            const seconds = parseDuration(target);
            if (!seconds) {
              notify('Utilise un temps au format H:MM ou H:MM:SS, par exemple 24:00.');
              return;
            }
            update({ id: race.id, targetSeconds: seconds }, 'Temps cible enregistré.');
          }}
        >
          <label>
            <span>Temps total visé, pauses comprises</span>
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="24:00"
              required
              pattern="[0-9]{1,3}:[0-9]{2}(:[0-9]{2})?"
              inputMode="text"
              aria-describedby="target-help"
            />
          </label>
          <button className="button trail-primary">
            Actualiser <ArrowRight size={14} />
          </button>
        </form>
        <p id="target-help" className="trail-helper">
          Format heures:minutes. Exemple : 24:00 pour 24 heures.
        </p>
        {race.targetSeconds && (
          <>
            <div className="trail-scenario-values">
              <div>
                <span>Allure moyenne</span>
                <strong>
                  {pace(race.targetSeconds / race.distanceKm)}
                  <small> min/km</small>
                </strong>
              </div>
              <div>
                <span>Vitesse moyenne</span>
                <strong>
                  {number(race.distanceKm / (race.targetSeconds / 3600), 2)}
                  <small> km/h</small>
                </strong>
                <p>{number(race.distanceKm / (race.targetSeconds / 60), 3)} km/min</p>
              </div>
              <div>
                <span>Place historique estimée</span>
                <strong>{field ? `${field.rank}${field.rank === 1 ? 're' : 'e'}` : '—'}</strong>
                <p>
                  {field
                    ? `${field.lowRank}–${field.highRank}e pour ±10 % de temps · ${field.finishers} finishers`
                    : 'Importe un classement de référence'}
                </p>
              </div>
            </div>
            {race.cutoffHours && race.targetSeconds > race.cutoffHours * 3600 && (
              <p className="trail-warning">
                Ce temps dépasse la barrière finale de {duration(race.cutoffHours * 3600)}.
              </p>
            )}
            <div className="trail-score-estimates">
              <span>
                Scores de course estimés <small>· approximation</small>
              </span>
              <strong>
                UTMB {field?.utmb ?? '—'} <span>/</span> ITRA {field?.itra ?? '—'}
              </strong>
            </div>
            <p className="trail-helper">
              Trois scores connus proches du temps cible sont nécessaires par fournisseur. Le futur
              index général ne peut pas être déduit de ce seul temps.
            </p>
          </>
        )}
      </div>
      <div className="trail-prediction">
        <span className="trail-tag">Projection personnelle</span>
        <strong>
          {prediction
            ? `${duration(prediction.low)} – ${duration(prediction.high)}`
            : 'Ajoute tes résultats pour commencer.'}
        </strong>
        <p>
          {prediction
            ? `Centre : ${duration(prediction.central)} · ${prediction.references} course(s) récente(s). ${prediction.extrapolated ? 'Forte extrapolation de distance : marge élargie.' : 'Marge minimale de ±20 %, indicative.'}`
            : 'La projection utilise jusqu’à trois courses terminées au cours des trois dernières années.'}
        </p>
      </div>
      <details className="trail-method">
        <summary>Classement de référence & estimation des scores</summary>
        <p>
          Importe tous les finishers d’une édition comparable de cette même course. Le rang est une
          position dans ce classement passé, pas une prévision du futur peloton. Une liste partielle
          donne un classement partiel.
        </p>
        <p>
          CSV : <code>time,utmb,itra,status</code>. Temps en H:MM:SS ; scores facultatifs ; abandons
          avec status=dnf. Les scores doivent être ceux de la course.
        </p>
        <div className="trail-file-actions">
          <button className="button secondary" onClick={() => csvRef.current?.click()}>
            <Upload size={14} /> Importer le classement
          </button>
          <button
            className="text-button"
            onClick={() => download('time,utmb,itra,status\n', 'classement-modele.csv', 'text/csv')}
          >
            Modèle CSV <ArrowDownToLine size={13} />
          </button>
        </div>
        <input
          ref={csvRef}
          type="file"
          className="sr-only"
          accept=".csv,text/csv"
          aria-label="Classement historique CSV"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              if (file.size > 5 * 1024 * 1024) throw new Error('Le CSV dépasse 5 Mo.');
              const field = parseFieldCsv(await file.text());
              update(
                { id: race.id, field, fieldLabel: file.name },
                `${field.length} finishers importés.`,
              );
            } catch (e) {
              notify(messageOf(e));
            }
          }}
        />
        {!!race.field.length && (
          <p>
            {race.fieldLabel} · {race.field.length} finishers{' '}
            <button
              className="text-button"
              onClick={() =>
                update(
                  { id: race.id, field: [], fieldLabel: '' },
                  'Classement de référence retiré.',
                )
              }
            >
              Retirer
            </button>
          </p>
        )}
      </details>
      <details className="trail-method">
        <summary>Comprendre les calculs</summary>
        <p>
          Modèle myStats v1, indicatif et non validé. E = distance en km + D+ en m / 100. P = 100 ×
          (0,65 × part des kilomètres à |pente| &gt; 15 % + 0,35 × part à pente &lt; −20 %). Pentes
          mesurées par fenêtres d’au moins 30 m ; variations d’altitude inférieures à 3 m ignorées
          pour D+/D−.
        </p>
        <p>
          Difficulté = min(100, 40 × ln(1 + E/30) + 0,35 × P + 5 × T), où T est le terrain saisi de
          0 à 4. Sans GPX ou terrain renseigné, la difficulté est partielle. Le GPX ne renseigne ni
          rochers, ni boue, ni exposition.
        </p>
        <p>
          Temps = médiane des temps récents × (E cible / E référence)^1,06. Correction (1 + 0,06 × T
          cible) / (1 + 0,06 × T référence) uniquement si les deux terrains sont renseignés. Ni
          météo, altitude, nuit, fatigue ni stratégie de ravitaillement ne sont modélisées.
        </p>
        <p>
          Scores estimés = médiane(temps historique × score publié) / temps cible, limité à 1 000,
          sur au moins trois finishers entre temps cible / 1,5 et temps cible × 1,5. Il s’agit d’un
          étalonnage local, pas des formules officielles UTMB/ITRA.
        </p>
        <p>
          Terrain : {race.terrain === null ? 'non renseigné' : terrainNames[race.terrain]} ·{' '}
          {race.track ? 'GPX analysé' : 'sans GPX'} ·{' '}
          {race.cutoffHours
            ? `barrière finale ${duration(race.cutoffHours * 3600)}`
            : 'barrière finale non renseignée'}
          .
        </p>
      </details>
      {race.notes && (
        <div className="trail-race-notes">
          <span className="eyebrow">TES NOTES</span>
          <p>{race.notes}</p>
        </div>
      )}
    </section>
  );
}

function RaceEditor({
  race,
  year,
  close,
  save,
}: {
  race: TrailRace | null;
  year: number;
  close: () => void;
  save: (r: TrailRace) => void;
}) {
  const [query, setQuery] = useState('Lac de Côme');
  const [found, setFound] = useState<typeof catalog>([]);
  const [loaded, setLoaded] = useState<RaceCatalogItem | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [manual, setManual] = useState(!!race);
  async function search(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = await getJson(`/api/trail/races?q=${encodeURIComponent(query)}`);
      setFound(body.races);
      if (!body.races.length)
        setError(
          'Cette course n’est pas encore dans le catalogue connecté. Tu peux la renseigner et importer sa trace.',
        );
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  async function fetchRace(id: string) {
    setBusy(true);
    setError('');
    try {
      setLoaded(await getJson(`/api/trail/races?id=${encodeURIComponent(id)}`));
      setManual(true);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  const initial = race ?? loaded;
  return (
    <Modal title={race ? 'Ajuster ton objectif.' : 'Choisir le prochain horizon.'} close={close}>
      {!race && (
        <>
          <p className="trail-helper">
            Catalogue connecté : les cinq formats UTLAC au lac de Côme. Pour toute autre course,
            utilise la saisie manuelle.
          </p>
          <form className="trail-search-form" onSubmit={search}>
            <label className="sr-only" htmlFor="race-search">
              Nom de la course
            </label>
            <input
              id="race-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nom de la course"
              maxLength={150}
              required
            />
            <button className="button trail-primary" disabled={busy}>
              <Search size={16} /> Rechercher
            </button>
          </form>
          {found.length > 0 && (
            <div className="trail-search-results">
              {found.map((r) => (
                <button key={r.id} disabled={busy} onClick={() => void fetchRace(r.id)}>
                  <span>
                    <strong>{r.name}</strong>
                    <span>
                      {r.format}K · {r.location}
                    </span>
                  </span>
                  <Plus size={16} />
                </button>
              ))}
            </div>
          )}
          <button
            className="trail-add-line"
            onClick={() => {
              setManual(true);
              setLoaded(null);
            }}
          >
            <Plus size={14} /> Renseigner une course manuellement
          </button>
        </>
      )}
      {busy && (
        <p role="status" className="trail-helper">
          Lecture des données organisateur…
        </p>
      )}
      {error && (
        <p className="trail-warning" role="alert">
          {error}
        </p>
      )}
      {manual && (
        <form
          key={initial?.id ?? 'manual'}
          className="trail-form"
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            const target = String(d.get('target') ?? '').trim();
            if (target && !parseDuration(target)) {
              setError('Temps invalide : utilise H:MM ou H:MM:SS.');
              return;
            }
            const parsed = raceSchema.safeParse({
              id: race?.id ?? crypto.randomUUID(),
              name: d.get('name'),
              date: d.get('date'),
              distanceKm: Number(d.get('distanceKm')),
              ascentM: Number(d.get('ascentM')),
              priority: d.get('priority'),
              terrain: optionalNumber(d, 'terrain'),
              targetSeconds: target ? parseDuration(target) : null,
              notes: d.get('notes'),
              source: d.get('source'),
              catalogId: race?.catalogId ?? loaded?.id ?? null,
              track: race?.track ?? null,
              field: race?.field ?? [],
              fieldLabel: race?.fieldLabel ?? '',
              cutoffHours: optionalNumber(d, 'cutoffHours'),
              organizerTerrain: race?.organizerTerrain ?? loaded?.terrainDescription ?? '',
              sourceCheckedAt: race?.sourceCheckedAt ?? loaded?.checkedAt ?? '',
            });
            if (!parsed.success) {
              setError('Vérifie la date, les distances, le temps et le lien HTTPS.');
              return;
            }
            save(parsed.data);
          }}
        >
          {loaded && (
            <p className="trail-catalog-note wide">
              <Check size={14} /> Données organisateur relevées le{' '}
              {new Date(loaded.checkedAt).toLocaleDateString('fr-FR')}. Terrain annoncé :{' '}
              {loaded.terrainDescription || 'non renseigné'}.
            </p>
          )}
          <Field label="Nom de la course" wide>
            <input name="name" required maxLength={250} defaultValue={initial?.name} />
          </Field>
          <Field label="Date">
            <input
              type="date"
              name="date"
              required
              defaultValue={initial?.date ?? `${year}-06-01`}
            />
          </Field>
          <Field label="Priorité">
            <select name="priority" defaultValue={race?.priority ?? 'A'}>
              <option value="A">A · objectif principal</option>
              <option value="B">B · préparation</option>
              <option value="C">C · plaisir</option>
            </select>
          </Field>
          <Field label="Distance (km)">
            <input
              name="distanceKm"
              type="number"
              required
              min={0.1}
              max={1000}
              step="any"
              defaultValue={initial?.distanceKm}
            />
          </Field>
          <Field label="Dénivelé positif (m)">
            <input
              name="ascentM"
              type="number"
              required
              min={0}
              max={100000}
              defaultValue={initial?.ascentM}
            />
          </Field>
          <Field label="Temps cible (H:MM:SS)">
            <input
              name="target"
              placeholder="24:00:00"
              defaultValue={durationInput(race?.targetSeconds ?? null)}
            />
          </Field>
          <Field label="Barrière finale (heures)">
            <input
              name="cutoffHours"
              type="number"
              min={0.1}
              step="any"
              defaultValue={initial?.cutoffHours ?? ''}
            />
          </Field>
          <Field label="Terrain observé / documenté" wide>
            <TerrainSelect value={race?.terrain ?? null} />
          </Field>
          <Field label="Source organisateur (lien HTTPS)" wide>
            <input
              name="source"
              type="url"
              defaultValue={initial?.source ?? ''}
              placeholder="https://…"
            />
          </Field>
          <Field label="Notes de préparation" wide>
            <textarea
              name="notes"
              rows={3}
              maxLength={5000}
              placeholder="Ravitaillements, équipement, points à travailler…"
              defaultValue={race?.notes ?? ''}
            />
          </Field>
          <div className="trail-modal-actions wide">
            <button type="button" className="button secondary" onClick={close}>
              Annuler
            </button>
            <button className="button trail-primary">
              {race ? 'Enregistrer' : 'Ajouter à ma saison'} <ArrowRight size={14} />
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function ResultEditor({
  result,
  year,
  close,
  save,
  remove,
}: {
  result: TrailResult | null;
  year: number;
  close: () => void;
  save: (r: TrailResult) => void;
  remove?: () => void;
}) {
  const [error, setError] = useState('');
  return (
    <Modal title={result ? 'Ton résultat, en détail.' : 'Un nouveau repère.'} close={close}>
      <p className="trail-helper">
        Renseigne le temps écoulé officiel, pauses comprises. Les scores sont ceux de cette course.
      </p>
      <form
        className="trail-form"
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          const t = String(d.get('seconds') ?? '').trim();
          const status = String(d.get('status'));
          const seconds = t ? parseDuration(t) : null;
          if ((status === 'finished' && !seconds) || (t && !seconds)) {
            setError('Renseigne un temps au format H:MM ou H:MM:SS.');
            return;
          }
          const rank = optionalNumber(d, 'rank'),
            finishers = optionalNumber(d, 'finishers');
          if (rank && finishers && rank > finishers) {
            setError('La place doit être inférieure ou égale au nombre de finishers.');
            return;
          }
          const parsed = resultSchema.safeParse({
            id: result?.id ?? crypto.randomUUID(),
            name: d.get('name'),
            date: d.get('date'),
            distanceKm: Number(d.get('distanceKm')),
            ascentM: Number(d.get('ascentM')),
            seconds,
            status,
            rank,
            finishers,
            utmb: optionalNumber(d, 'utmb'),
            itra: optionalNumber(d, 'itra'),
            terrain: optionalNumber(d, 'terrain'),
            source: d.get('source'),
          });
          if (!parsed.success) {
            setError('Vérifie les valeurs et le lien source HTTPS.');
            return;
          }
          save(parsed.data);
        }}
      >
        <Field label="Course" wide>
          <input name="name" required maxLength={250} defaultValue={result?.name} />
        </Field>
        <Field label="Date">
          <input
            type="date"
            name="date"
            required
            max={today()}
            defaultValue={
              result?.date ?? (year <= Number(today().slice(0, 4)) ? `${year}-01-01` : today())
            }
          />
        </Field>
        <Field label="Statut">
          <select name="status" defaultValue={result?.status ?? 'finished'}>
            <option value="finished">Finisher</option>
            <option value="dnf">Abandon (DNF)</option>
          </select>
        </Field>
        <Field label="Distance officielle (km)">
          <input
            name="distanceKm"
            type="number"
            required
            min={0.1}
            max={1000}
            step="any"
            defaultValue={result?.distanceKm}
          />
        </Field>
        <Field label="D+ officiel (m)">
          <input
            name="ascentM"
            type="number"
            required
            min={0}
            max={100000}
            defaultValue={result?.ascentM}
          />
        </Field>
        <Field label="Temps écoulé (H:MM:SS)" wide>
          <input
            name="seconds"
            placeholder="06:30:00"
            defaultValue={durationInput(result?.seconds ?? null)}
          />
        </Field>
        <Field label="Place générale">
          <input name="rank" type="number" min={1} defaultValue={result?.rank ?? ''} />
        </Field>
        <Field label="Nombre de finishers">
          <input name="finishers" type="number" min={1} defaultValue={result?.finishers ?? ''} />
        </Field>
        <Field label="Score UTMB de la course">
          <input name="utmb" type="number" min={0} max={1000} defaultValue={result?.utmb ?? ''} />
        </Field>
        <Field label="Score ITRA de la course">
          <input name="itra" type="number" min={0} max={1000} defaultValue={result?.itra ?? ''} />
        </Field>
        <Field label="Terrain" wide>
          <TerrainSelect value={result?.terrain ?? null} />
        </Field>
        <Field label="Lien du résultat (HTTPS)" wide>
          <input name="source" type="url" defaultValue={result?.source ?? ''} />
        </Field>
        {error && (
          <p className="trail-warning wide" role="alert">
            {error}
          </p>
        )}
        <div className="trail-modal-actions wide">
          {remove && (
            <button type="button" className="text-button" onClick={remove}>
              <Trash2 size={14} /> Supprimer
            </button>
          )}
          <button type="button" className="button secondary" onClick={close}>
            Annuler
          </button>
          <button className="button trail-primary">
            Enregistrer <Check size={14} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
