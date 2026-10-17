'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
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
import raceStyles from './race-detail.module.css';
import { RacePhoto } from './race-photo';
import { SeasonCalendar } from './season-calendar';
import { prepareRacePhoto } from '@/lib/trail/photo';
import { SeasonSync, markSeasonDirty } from './season-sync';
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
  type TrailProfile,
} from '@/lib/trail/types';
import {
  difficulty,
  duration,
  durationInput,
  effortKm,
  estimateField,
  estimateLevels,
  parseDuration,
  predictTime,
} from '@/lib/trail/model';
import { parseFieldCsv, parseGpx } from '@/lib/trail/import';
import { catalog, type RaceCatalogItem } from '@/lib/trail/catalog';
import type { RunnerMatch } from '@/lib/trail/providers';
import { uniqueExactRunner } from '@/lib/trail/identity';
import { comparableHistory, historicalRaces, historicalResponseSchema } from '@/lib/trail/history';
import { number, pace } from '@/lib/utils/units';
import { seasonStorageKey, TRAIL_STORAGE_EVENT } from '@/lib/trail/storage';
import { recordProfileIndexes } from '@/lib/trail/index-history';

const ElevationChart = dynamic(() => import('./trail-charts').then((m) => m.ElevationChart), {
  ssr: false,
});
const RouteDrawing = dynamic(() => import('./trail-charts').then((m) => m.RouteDrawing), {
  ssr: false,
});
type Athlete = { id: number; firstname?: string; lastname?: string };
type View = 'plan' | 'calendar' | 'profile';
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
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [year, setYear] = useState(() => Number(today().slice(0, 4)) + 1);
  const [selected, setSelected] = useState('');
  const [modal, setModal] = useState<'race' | 'result' | null>(null);
  const [newRaceDate, setNewRaceDate] = useState('');
  const [editRace, setEditRace] = useState<TrailRace | null>(null);
  const [editResult, setEditResult] = useState<TrailResult | null>(null);
  const [busy, setBusy] = useState('');
  const [matches, setMatches] = useState<RunnerMatch[]>([]);
  const [lookupName, setLookupName] = useState<{ firstname: string; lastname: string } | null>(
    null,
  );
  const backupRef = useRef<HTMLInputElement>(null);
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lookupGeneration = useRef(0);
  useEffect(
    () => () => {
      if (lookupTimer.current) clearTimeout(lookupTimer.current);
      lookupGeneration.current++;
    },
    [],
  );
  const key = seasonStorageKey(athlete?.id);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        let data = seasonSchema.parse(JSON.parse(stored));
        let saveFailed = false;
        // Older backups only contain the current profile. Start observing today,
        // without inventing historical race scores or an ITRA verification date.
        if (!data.indexHistory.length) {
          data = recordProfileIndexes(data, today());
          try {
            if (data.indexHistory.length) markSeasonDirty(key);
            localStorage.setItem(key, JSON.stringify(data));
          } catch {
            saveFailed = true;
          }
        }
        queueMicrotask(() => {
          currentSeason.current = data;
          setSeason(data);
          setReady(true);
          if (saveFailed)
            setNotice(
              'Tes données sont chargées, mais le suivi des index n’a pas pu être sauvegardé. Exporte une sauvegarde pour le conserver.',
            );
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
  useEffect(() => {
    const refreshLocal = (event: StorageEvent) => {
      if (event.key !== key || !event.newValue) return;
      try {
        const next = seasonSchema.parse(JSON.parse(event.newValue));
        currentSeason.current = next;
        setSeason(next);
        window.dispatchEvent(new Event(TRAIL_STORAGE_EVENT));
      } catch {
        /* Do not replace the current document with a corrupt tab update. */
      }
    };
    window.addEventListener('storage', refreshLocal);
    return () => window.removeEventListener('storage', refreshLocal);
  }, [key]);
  const commit = useCallback(
    (next: Season, success = '', fromServer = false) => {
      if (fromServer && !next.indexHistory.length) {
        next = recordProfileIndexes(next, today());
        if (next.indexHistory.length) fromServer = false;
      }
      currentSeason.current = next;
      setSeason(next);
      try {
        if (!fromServer) markSeasonDirty(key);
        localStorage.setItem(key, JSON.stringify(next));
        window.dispatchEvent(new Event(TRAIL_STORAGE_EVENT));
        setNotice(success);
      } catch {
        setNotice(
          'Les changements restent dans cette page mais n’ont pas pu être sauvegardés. Exporte une sauvegarde avant de fermer.',
        );
      }
    },
    [key],
  );
  const updateRace = useCallback(
    (patch: Partial<TrailRace> & { id: string }, success = '') => {
      const latest = currentSeason.current;
      commit(
        { ...latest, races: latest.races.map((r) => (r.id === patch.id ? { ...r, ...patch } : r)) },
        success,
      );
    },
    [commit],
  );
  const races = season.races
    .filter((r) => r.date.startsWith(String(year)))
    .sort((a, b) => a.date.localeCompare(b.date));
  const race = races.find((r) => r.id === selected) ?? races[0];
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
      let next = seasonSchema.parse(JSON.parse(await file.text()));
      if (!next.indexHistory.length) next = recordProfileIndexes(next, today());
      commit(next, 'Sauvegarde restaurée.');
      setSelected('');
    } catch {
      setNotice('Sauvegarde invalide. Les données actuelles ont été conservées.');
    }
  }
  async function findRunner(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    const requestId = ++lookupGeneration.current;
    setMatches([]);
    setNotice('');
    setBusy('runner');
    const data = new FormData(e.currentTarget);
    const name = {
      firstname: String(data.get('firstname') ?? '').trim(),
      lastname: String(data.get('lastname') ?? '').trim(),
    };
    setLookupName(name);
    const latest = currentSeason.current;
    commit({ ...latest, profile: { ...latest.profile, ...name } });
    try {
      const body = await getJson(`/api/trail/runners?${new URLSearchParams(name)}`);
      if (requestId !== lookupGeneration.current) return;
      const exact = uniqueExactRunner(body.runners as RunnerMatch[], name.firstname, name.lastname);
      if (exact) {
        await importRunner(exact, name, requestId);
        return;
      }
      setMatches(body.runners);
      if (!body.runners.length)
        setNotice(
          'Aucun profil trouvé. Essaie une autre orthographe ou ouvre la recherche officielle.',
        );
    } catch (e) {
      if (requestId === lookupGeneration.current) setNotice(messageOf(e));
    } finally {
      if (requestId === lookupGeneration.current) setBusy('');
    }
  }
  async function importRunner(
    match: RunnerMatch,
    name = lookupName,
    requestId = ++lookupGeneration.current,
  ) {
    setBusy('runner');
    setNotice('');
    try {
      const body = await getJson(`/api/trail/runners?uri=${encodeURIComponent(match.uri)}`);
      if (requestId !== lookupGeneration.current) return;
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
      const next = recordProfileIndexes(
        seasonSchema.parse({
          ...latest,
          profile: {
            ...latest.profile,
            ...(name ?? {}),
            utmb: body.utmb,
            utmbUrl: body.source,
            checkedAt: body.checkedAt,
          },
          results: [...merged, ...incoming.values()],
        }),
        today(),
        ['utmb'],
      );
      commit(
        next,
        `${body.results.length} résultats synchronisés depuis le profil de ${body.fullname}. Les scores non publics restent vides.`,
      );
      setMatches([]);
    } catch (e) {
      if (requestId === lookupGeneration.current) setNotice(messageOf(e));
    } finally {
      if (requestId === lookupGeneration.current) setBusy('');
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
            <h1>
              Ta saison, <span>à ton rythme.</span>
            </h1>
            <p>Des résultats aux prochains sommets. Un endroit pour tout relier.</p>
          </div>
          <button
            className="button trail-primary trail-heading-action"
            onClick={() => {
              setEditRace(null);
              setNewRaceDate('');
              setModal('race');
            }}
          >
            <Plus size={18} aria-hidden="true" /> Ajouter une course
          </button>
        </div>
        <div className="trail-toolbar">
          <div className="trail-tabs" role="group" aria-label="Vue de la saison">
            {(
              [
                ['plan', 'Mes objectifs', Flag],
                ['calendar', 'Calendrier', CalendarDays],
                ['profile', 'Mon profil', UserRound],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                className={view === id ? 'active' : ''}
                aria-pressed={view === id}
                onClick={() => setView(id)}
              >
                <Icon size={16} aria-hidden="true" />
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
        {athlete && (
          <SeasonSync
            storageKey={key}
            season={season}
            ready={ready}
            accept={(next) => commit(next, '', true)}
          />
        )}
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
        {view === 'calendar' && (
          <SeasonCalendar
            year={year}
            races={races}
            today={today()}
            goToday={() => setYear(Number(today().slice(0, 4)))}
            open={(r) => {
              setSelected(r.id);
              setView('plan');
            }}
            add={(date) => {
              setNewRaceDate(date);
              setEditRace(null);
              setModal('race');
            }}
          />
        )}
        {view === 'plan' && (
          <>
            <details className="trail-year-map">
              <summary className="trail-year-map-heading">
                Calendrier {year}
                <span>
                  {races.length} course{races.length > 1 ? 's' : ''} au programme
                </span>
              </summary>
              <div className="trail-months">
                {Array.from({ length: 12 }, (_, month) => {
                  const monthRaces = races.filter((r) => Number(r.date.slice(5, 7)) === month + 1);
                  const label = new Date(year, month, 1)
                    .toLocaleDateString('fr-FR', { month: 'short' })
                    .replace('.', '');
                  return (
                    <div
                      key={month}
                      className={`trail-month${monthRaces.some((r) => r.id === race?.id) ? ' current' : ''}`}
                    >
                      <span>{label}</span>
                      <div className="trail-month-dates">
                        {monthRaces.length ? (
                          monthRaces.map((r) => (
                            <button
                              key={r.id}
                              aria-label={`${r.name}, ${dateLabel(r.date)}`}
                              aria-pressed={race?.id === r.id}
                              title={r.name}
                              onClick={() => setSelected(r.id)}
                            >
                              <RacePhoto photo={r.photo} className="trail-year-photo" />
                              {r.date.slice(8)}
                              <small>{r.priority}</small>
                            </button>
                          ))
                        ) : (
                          <span className="trail-month-rest" aria-label="Aucune course">
                            —
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
            <div className="trail-plan">
              <section className="trail-calendar">
                <div className="trail-section-heading">
                  <div>
                    <h2>
                      Les rendez-vous<span className="trail-race-count">{races.length}</span>
                    </h2>
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
                          <RacePhoto photo={r.photo} className="trail-card-photo" />
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
                  profile={season.profile}
                  busy={busy}
                  setBusy={setBusy}
                  notify={setNotice}
                  update={updateRace}
                  addResult={() => {
                    setEditResult(null);
                    setModal('result');
                  }}
                  findRunner={() => setView('profile')}
                  editIndexes={() => {
                    setProfileEditorOpen(true);
                    setView('profile');
                  }}
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
          </>
        )}
        {view === 'profile' && (
          <div className="trail-profile-grid">
            <section className="trail-panel">
              <h2>Ton profil coureur.</h2>
              <p className="trail-helper">
                Renseigne ton prénom et ton nom : tes résultats remontent automatiquement si un seul
                profil correspond exactement. En cas d’homonymes, choisis le bon profil.
              </p>
              <form
                onSubmit={findRunner}
                onChange={(e) => {
                  if (lookupTimer.current) clearTimeout(lookupTimer.current);
                  lookupGeneration.current++;
                  setBusy('');
                  const form = e.currentTarget;
                  const values = new FormData(form);
                  if (
                    String(values.get('firstname') ?? '').trim().length >= 2 &&
                    String(values.get('lastname') ?? '').trim().length >= 2
                  )
                    lookupTimer.current = setTimeout(() => {
                      if (form.isConnected) form.requestSubmit();
                    }, 900);
                }}
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
              <details
                className="trail-method"
                open={profileEditorOpen}
                onToggle={(e) => setProfileEditorOpen(e.currentTarget.open)}
              >
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
                    commit(
                      recordProfileIndexes(
                        { ...currentSeason.current, profile: parsed.data },
                        today(),
                      ),
                      'Profil enregistré.',
                    );
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
          initialDate={newRaceDate}
          year={year}
          close={() => {
            setModal(null);
            setNewRaceDate('');
          }}
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
            setNewRaceDate('');
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
  addResult,
  findRunner,
  profile,
  editIndexes,
}: {
  race: TrailRace;
  results: TrailResult[];
  profile: TrailProfile;
  update: (r: Partial<TrailRace> & { id: string }, message?: string) => void;
  edit: () => void;
  remove: () => void;
  busy: string;
  setBusy: (s: string) => void;
  notify: (s: string) => void;
  addResult: () => void;
  findRunner: () => void;
  editIndexes: () => void;
}) {
  const [target, setTarget] = useState(durationInput(race.targetSeconds));
  const [targetError, setTargetError] = useState('');
  const targetRef = useRef<HTMLInputElement>(null);
  const gpxRef = useRef<HTMLInputElement>(null),
    csvRef = useRef<HTMLInputElement>(null);
  const prediction = predictTime(race, results, today());
  const levels = estimateLevels(race, results, profile, today());
  const compatible = comparableHistory(race);
  const field =
    race.targetSeconds && compatible ? estimateField(race.targetSeconds, race.field) : null;
  const supportsHistory = !!historicalRaces[race.catalogId ?? ''];
  const [historyLoading, setHistoryLoading] = useState(supportsHistory && !race.field.length);
  const [historyError, setHistoryError] = useState('');
  const [historyAttempt, setHistoryAttempt] = useState(0);
  const rankingRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!supportsHistory || race.field.length) return;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setHistoryLoading(true);
        setHistoryError('');
      }
    });
    void fetch(`/api/trail/history?id=${encodeURIComponent(race.catalogId ?? '')}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message ?? 'Classement indisponible.');
        const data = historicalResponseSchema.parse(body);
        if (
          !comparableHistory({
            distanceKm: race.distanceKm,
            ascentM: race.ascentM,
            fieldDistanceKm: data.distanceKm,
            fieldAscentM: data.ascentM,
          })
        )
          throw new Error(
            'Le parcours de référence diffère de ton objectif. Importe un classement comparable.',
          );
        if (!controller.signal.aborted) {
          setHistoryLoading(false);
          update({
            id: race.id,
            field: data.field,
            fieldLabel: data.label,
            fieldSource: data.source,
            fieldEdition: data.year,
            fieldDistanceKm: data.distanceKm,
            fieldAscentM: data.ascentM,
          });
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setHistoryError(messageOf(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryLoading(false);
      });
    return () => controller.abort();
  }, [
    race.id,
    race.catalogId,
    race.field.length,
    race.distanceKm,
    race.ascentM,
    supportsHistory,
    update,
    historyAttempt,
  ]);
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
    <section
      className={`trail-panel trail-detail ${raceStyles.workspace}`}
      aria-label={`Objectif ${race.name}`}
    >
      <RacePhoto photo={race.photo} className="trail-detail-photo" />
      <div className={`trail-detail-header ${raceStyles.header}`}>
        <div className="trail-detail-top">
          <span className={`trail-detail-priority p-${race.priority}`}>
            <Flag size={14} aria-hidden="true" />
            {race.priority === 'A'
              ? 'Objectif principal'
              : race.priority === 'B'
                ? 'Préparation'
                : 'Plaisir'}
          </span>
          <div>
            <button
              className={raceStyles.editButton}
              aria-label="Modifier la course"
              onClick={edit}
            >
              <SlidersHorizontal size={16} aria-hidden="true" />
              <span>Modifier</span>
            </button>
            <button
              className="trail-icon-button"
              aria-label="Retirer la course de la saison"
              onClick={() => {
                if (window.confirm(`Retirer « ${race.name} » de ta saison ?`)) remove();
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
        <h2>{race.name}</h2>
        <p className="trail-detail-date">
          <CalendarDays size={14} aria-hidden="true" /> {dateLabel(race.date)}
          {race.source && (
            <a href={race.source} target="_blank" rel="noreferrer">
              Organisateur <ArrowUpRight size={12} />
            </a>
          )}
        </p>
        <div className={raceStyles.courseFacts}>
          <div>
            <span>Distance</span>
            <strong>
              {number(race.distanceKm, 1)}
              <small> km</small>
            </strong>
          </div>
          <div>
            <span>Dénivelé positif</span>
            <strong>
              {number(race.ascentM)}
              <small> m D+</small>
            </strong>
          </div>
        </div>
        <div className={raceStyles.courseSecondary}>
          <span>
            Effort <b>{number(effortKm(race.distanceKm, race.ascentM), 1)} km</b>
          </span>
          <span>
            {race.track && race.terrain !== null ? 'Difficulté maison' : 'Difficulté partielle'}{' '}
            <b>{index}/100</b>
          </span>
        </div>
      </div>
      <section className={raceStyles.scenario} aria-labelledby="race-scenario-title">
        <div className={raceStyles.scenarioHeading}>
          <h3 id="race-scenario-title">Ton objectif de temps</h3>
          <p>Définis ton objectif, découvre ce qu’il représente.</p>
        </div>
        <div className={raceStyles.scenarioLayout}>
          <div>
            <form
              className={raceStyles.targetForm}
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                const seconds = parseDuration(target);
                if (!seconds || seconds > 30 * 86400) {
                  setTargetError(
                    'Utilise H:MM ou H:MM:SS, avec un temps supérieur à zéro et limité à 720 heures.',
                  );
                  targetRef.current?.focus();
                  return;
                }
                setTargetError('');
                update({ id: race.id, targetSeconds: seconds }, 'Temps cible enregistré.');
              }}
            >
              <label htmlFor="race-target">
                Temps visé <span>· pauses comprises</span>
              </label>
              <div className={raceStyles.targetControls}>
                <input
                  id="race-target"
                  ref={targetRef}
                  value={target}
                  onChange={(e) => {
                    setTarget(e.target.value);
                    setTargetError('');
                  }}
                  placeholder="18:30:00"
                  inputMode="text"
                  required
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={!!targetError}
                  aria-describedby={targetError ? 'race-target-error target-help' : 'target-help'}
                />
                <button
                  className="button trail-primary"
                  disabled={parseDuration(target) === race.targetSeconds && !!race.targetSeconds}
                >
                  {parseDuration(target) === race.targetSeconds && race.targetSeconds ? (
                    <>
                      <Check size={16} aria-hidden="true" /> À jour
                    </>
                  ) : (
                    <>
                      Enregistrer <ArrowRight size={16} aria-hidden="true" />
                    </>
                  )}
                </button>
              </div>
              <p id="target-help" className={raceStyles.hint}>
                Heures : minutes : secondes. Par exemple, 18:30:00 pour 18 h 30.
              </p>
              {targetError && (
                <p id="race-target-error" className={raceStyles.error} role="alert">
                  {targetError}
                </p>
              )}
            </form>
            {race.targetSeconds ? (
              <>
                <div
                  className={raceStyles.paceRow}
                  aria-label="Allure et vitesse pour le temps enregistré"
                >
                  <span>
                    <strong>{pace(race.targetSeconds / race.distanceKm)}</strong> min/km
                  </span>
                  <span>
                    <strong>{number(race.distanceKm / (race.targetSeconds / 3600), 2)}</strong> km/h
                    en moyenne
                  </span>
                </div>
                {parseDuration(target) !== race.targetSeconds && (
                  <p className={raceStyles.draftNotice} role="status">
                    Les repères correspondent encore au temps appliqué :{' '}
                    {duration(race.targetSeconds)}.
                  </p>
                )}
                {race.cutoffHours && race.targetSeconds > race.cutoffHours * 3600 && (
                  <p className="trail-warning">
                    Ce temps dépasse la barrière finale de {duration(race.cutoffHours * 3600)}.
                  </p>
                )}
              </>
            ) : (
              <p className={raceStyles.hint}>
                Enregistre un premier temps pour afficher ton allure et les niveaux associés.
              </p>
            )}
          </div>
          <section className={raceStyles.personal} aria-labelledby="race-prediction-title">
            <h4 id="race-prediction-title" className="sr-only">
              Ton repère personnel
            </h4>
            {prediction ? (
              <>
                <div className={raceStyles.predictionSummary}>
                  <div>
                    <span className={raceStyles.label}>Temps de référence estimé</span>
                    <strong>{duration(prediction.central)}</strong>
                  </div>
                  <div>
                    <span className={raceStyles.label}>Fourchette indicative</span>
                    <b>
                      {duration(prediction.low)} – {duration(prediction.high)}
                    </b>
                  </div>
                </div>
                <p className={raceStyles.hint}>
                  À partir de {prediction.references} course{prediction.references > 1 ? 's' : ''}{' '}
                  récente{prediction.references > 1 ? 's' : ''}.{' '}
                  {prediction.extrapolated
                    ? 'Distance éloignée de tes références : incertitude élevée.'
                    : 'Une marge d’au moins ±20 % reste à prévoir.'}
                </p>
              </>
            ) : (
              <div className={raceStyles.empty}>
                <p>Ajoute un résultat récent pour situer ton objectif.</p>
                <p className={raceStyles.hint}>
                  Une course terminée avec distance, dénivelé et temps, datant de moins de trois
                  ans.
                </p>
                <div className="trail-file-actions">
                  <button className="button secondary" onClick={addResult}>
                    <Plus size={16} aria-hidden="true" /> Ajouter un résultat
                  </button>
                  <button className="text-button" onClick={findRunner}>
                    Importer depuis UTMB <ArrowRight size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </section>

      {!!race.targetSeconds && (
        <section className={raceStyles.performance} aria-labelledby="race-performance-title">
          <div className={raceStyles.sectionTitle}>
            <Flag size={17} aria-hidden="true" />
            <h3 id="race-performance-title">Ce que représente ton objectif</h3>
          </div>
          <p className={raceStyles.hint}>
            Repères pour un temps de {duration(race.targetSeconds)}. Les niveaux ci-dessous sont
            indicatifs et ne prédisent pas ton futur index officiel.
          </p>
          <div className={raceStyles.performanceGrid}>
            {(['utmb', 'itra'] as const).map((key) => {
              const estimate = levels[key];
              return (
                <div className={raceStyles.metric} key={key}>
                  <span className={raceStyles.label}>
                    {estimate?.method === 'historical' ? 'Score' : 'Niveau'} {key.toUpperCase()}{' '}
                    estimé
                  </span>
                  {estimate ? (
                    <>
                      <strong>
                        {estimate.value}
                        <small> / 1 000</small>
                      </strong>
                      <p>
                        {estimate.method === 'personal'
                          ? `Index actuel : ${profile[key]}`
                          : `${estimate.references} scores publiés`}
                      </p>
                      {estimate.method === 'personal' && (
                        <span className={raceStyles.metricRange}>
                          Fourchette {estimate.low}–{estimate.high}
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <strong className={raceStyles.missing}>—</strong>
                      <button
                        className="text-button"
                        onClick={profile[key] === null ? editIndexes : addResult}
                      >
                        {profile[key] === null ? 'Renseigner mon index' : 'Ajouter un résultat'}{' '}
                        <ArrowRight size={14} aria-hidden="true" />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div className={raceStyles.history}>
            <div>
              <span className={raceStyles.label}>
                Dans le classement {race.fieldEdition ?? 'de référence'}
              </span>
              {field ? (
                <p className={raceStyles.rank}>
                  <strong>
                    {field.rank > field.finishers
                      ? 'Après'
                      : `${field.rank}${field.rank === 1 ? 'er' : 'e'}`}
                  </strong>
                  <span>
                    {field.rank > field.finishers
                      ? `les ${field.finishers} finishers`
                      : `sur ${field.finishers} finishers`}
                  </span>
                </p>
              ) : (
                <p className={raceStyles.hint}>
                  {historyLoading
                    ? 'Chargement du classement…'
                    : 'Classement de référence manquant'}
                </p>
              )}
            </div>
            <div className={raceStyles.historyContext}>
              {field ? (
                <>
                  <p>
                    {field.lowRank}–{field.highRank}e pour ±10 % de temps.
                  </p>
                  <p>Comparaison avec une édition passée, le peloton à venir sera différent.</p>
                  {race.fieldSource && (
                    <a href={race.fieldSource} target="_blank" rel="noreferrer">
                      Voir le classement <ArrowUpRight size={13} aria-hidden="true" />
                    </a>
                  )}
                </>
              ) : (
                !historyLoading && (
                  <button
                    className="text-button"
                    onClick={() => {
                      if (rankingRef.current) {
                        rankingRef.current.open = true;
                        rankingRef.current.scrollIntoView({
                          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                            ? 'instant'
                            : 'smooth',
                          block: 'start',
                        });
                        rankingRef.current.querySelector('summary')?.focus();
                      }
                    }}
                  >
                    Ajouter un classement <ArrowRight size={14} aria-hidden="true" />
                  </button>
                )
              )}
            </div>
          </div>
          {historyLoading && (
            <p className={raceStyles.hint} role="status">
              Récupération du classement officiel…
            </p>
          )}
          {historyError && (
            <div className="trail-warning" role="status">
              <p>{historyError}</p>
              <button className="text-button" onClick={() => setHistoryAttempt((n) => n + 1)}>
                Réessayer
              </button>
            </div>
          )}
          {!compatible && (
            <p className="trail-warning">
              Le parcours a changé. Importe un classement correspondant à la distance et au dénivelé
              de cet objectif.
            </p>
          )}
          <details className={raceStyles.disclosure}>
            <summary>
              Comment lire ces estimations ? <ChevronRight size={16} aria-hidden="true" />
            </summary>
            <p>
              Le temps de référence est une projection de tes résultats récents sur ce parcours,
              avec une fourchette d’incertitude. Il ne tient pas compte de la météo, de la nuit ou
              de la fatigue.
            </p>
            <p>
              Les niveaux personnels utilisent séparément ton index UTMB ou ITRA et le rapport entre
              le temps de référence et ton objectif. Lorsque des scores historiques suffisants
              existent, ils servent d’étalonnage. Ces estimations ne sont pas des scores officiels
              et ne prédisent pas la mise à jour de ton index.
            </p>
            <p>
              L’index ITRA doit être renseigné depuis ton profil ITRA. Un index UTMB n’est jamais
              converti en ITRA.
            </p>
          </details>
        </section>
      )}
      <section className="trail-terrain-section" aria-label="Terrain et trace GPX">
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
                Analyse les montées, les descentes et le profil de pente depuis un GPX avec
                altitudes.
              </p>
            </div>
          </div>
        )}
        <div className="trail-file-actions">
          {race.catalogId && (
            <button
              className="button secondary"
              disabled={!!busy}
              onClick={() => void importTrack()}
            >
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
      </section>
      <details ref={rankingRef} className={`trail-method ${raceStyles.method}`}>
        <summary>
          <span>Classement de référence & estimation des scores</span>
          <ChevronRight size={16} aria-hidden="true" />
        </summary>
        <p>
          {supportsHistory
            ? 'Le classement complet de l’UTLAC 120 de 2026 est récupéré automatiquement. Tu peux le remplacer par ton propre fichier. '
            : ''}
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
                {
                  id: race.id,
                  field,
                  fieldLabel: file.name,
                  fieldSource: '',
                  fieldEdition: null,
                  fieldDistanceKm: null,
                  fieldAscentM: null,
                },
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
            {!race.fieldSource && (
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
            )}
          </p>
        )}
      </details>
      <details className={`trail-method ${raceStyles.method}`}>
        <summary>
          <span>Comprendre les calculs</span>
          <ChevronRight size={16} aria-hidden="true" />
        </summary>
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
          En l’absence de scores historiques suffisants, le niveau personnel est calculé séparément
          pour chaque fournisseur : index actuel × temps central de la projection personnelle ÷
          temps visé. La fourchette applique la même formule aux bornes de la projection. Valeurs
          limitées à 0–1 000. Cet indicateur suppose que ton index actuel représente ton niveau sur
          le parcours et que la performance varie inversement au temps ; il est indicatif, non
          validé et ne calcule ni un score officiel ni une mise à jour de l’index général. Un index
          UTMB n’est jamais converti en index ITRA.
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
  initialDate,
  race,
  year,
  close,
  save,
}: {
  race: TrailRace | null;
  initialDate: string;
  year: number;
  close: () => void;
  save: (r: TrailRace) => void;
}) {
  const [photo, setPhoto] = useState<string | null>(race?.photo ?? null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoGeneration = useRef(0);
  const [query, setQuery] = useState('Lac de Côme');
  const [found, setFound] = useState<typeof catalog>([]);
  const [loaded, setLoaded] = useState<RaceCatalogItem | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [manual, setManual] = useState(!!race || !!initialDate);
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
            if (photoBusy) return;
            const d = new FormData(e.currentTarget);
            const target = String(d.get('target') ?? '').trim();
            if (target && !parseDuration(target)) {
              setError('Temps invalide : utilise H:MM ou H:MM:SS.');
              return;
            }
            const parsed = raceSchema.safeParse({
              id: race?.id ?? crypto.randomUUID(),
              photo,
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
              fieldSource: race?.fieldSource ?? '',
              fieldEdition: race?.fieldEdition ?? null,
              fieldDistanceKm: race?.fieldDistanceKm ?? null,
              fieldAscentM: race?.fieldAscentM ?? null,
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
          <div className="trail-photo-editor wide">
            <span>Photo de la course</span>
            <RacePhoto photo={photo} className="trail-photo-preview" />
            <p className="trail-helper">
              Retrouve ce repère visuel dans ton calendrier et tes objectifs. JPG, PNG ou WebP,
              jusqu’à 15 Mo.
            </p>
            <div className="trail-file-actions">
              <label className="button secondary">
                <Upload size={14} />{' '}
                {photoBusy ? 'Préparation…' : photo ? 'Changer la photo' : 'Ajouter une photo'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  aria-label="Photo de la course"
                  disabled={photoBusy}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    const generation = ++photoGeneration.current;
                    setPhotoBusy(true);
                    setError('');
                    try {
                      const next = await prepareRacePhoto(file);
                      if (generation === photoGeneration.current) setPhoto(next);
                    } catch (error) {
                      if (generation === photoGeneration.current) setError(messageOf(error));
                    } finally {
                      if (generation === photoGeneration.current) setPhotoBusy(false);
                    }
                  }}
                />
              </label>
              {photo && (
                <button
                  type="button"
                  className="text-button"
                  disabled={photoBusy}
                  onClick={() => setPhoto(null)}
                >
                  <Trash2 size={14} /> Retirer la photo
                </button>
              )}
            </div>
          </div>
          <Field label="Date">
            <input
              type="date"
              name="date"
              required
              defaultValue={initial?.date ?? (initialDate || `${year}-06-01`)}
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
            <button className="button trail-primary" disabled={photoBusy}>
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
