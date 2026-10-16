'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { seasonSchema, type Season } from '@/lib/trail/types';
import { duration } from '@/lib/trail/model';
import { seasonStorageKey } from '@/lib/trail/storage';
type Workspace = { revision: number; season: Season | null; updatedAt: string | null };
type Meta = { revision: number; dirty: boolean };
export function markSeasonDirty(key: string) {
  const raw = localStorage.getItem(key + ':sync');
  if (raw) localStorage.setItem(key + ':sync', JSON.stringify({ ...JSON.parse(raw), dirty: true }));
}
export function SeasonSync({
  storageKey,
  season,
  ready,
  accept,
}: {
  storageKey: string;
  season: Season;
  ready: boolean;
  accept: (season: Season) => void;
}) {
  const latest = useRef(season);
  const acceptRef = useRef(accept);
  const [status, setStatus] = useState('Connexion à la synchronisation…');
  const [remote, setRemote] = useState<Workspace | null>(null);
  const [candidate, setCandidate] = useState<Season | null>(null);
  const [archive, setArchive] = useState<Season | null>(null);
  const candidateRef = useRef(candidate);
  const remoteRef = useRef(remote);
  useEffect(() => {
    latest.current = season;
    acceptRef.current = accept;
    candidateRef.current = candidate;
    remoteRef.current = remote;
  }, [season, accept, candidate, remote]);
  const busy = useRef(false);
  const mounted = useRef(true);
  const run = useCallback(
    async (choice?: 'local' | 'remote' | 'candidate') => {
      if (busy.current) return;
      busy.current = true;
      try {
        const response = await fetch('/api/v1/season', { cache: 'no-store' });
        if (response.status === 503) {
          setStatus('Saison locale · synchronisation non configurée');
          return;
        }
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? 'Synchronisation indisponible.');
        const server: Workspace = {
          ...data,
          season: data.season ? seasonSchema.parse(data.season) : null,
        };
        if (!mounted.current) return;
        if (choice && remoteRef.current && remoteRef.current.revision !== server.revision) {
          setRemote(server);
          setStatus('La version serveur a changé. Compare à nouveau avant de remplacer.');
          return;
        }
        const raw = localStorage.getItem(storageKey + ':sync');
        let meta: Meta | null = raw ? JSON.parse(raw) : null;
        if (!meta && !choice) {
          const stored = localStorage.getItem(storageKey);
          const local = stored ? seasonSchema.parse(JSON.parse(stored)) : null;
          const anonymous = localStorage.getItem(seasonStorageKey());
          const imported = !local && anonymous ? seasonSchema.parse(JSON.parse(anonymous)) : null;
          if (local || imported) {
            setCandidate(local ?? imported);
            setRemote(server);
            setStatus('Importer la saison locale ?');
            return;
          }
        }
        if (choice === 'remote' || (!choice && !meta?.dirty)) {
          if (server.season) {
            if (choice === 'remote') {
              localStorage.setItem(storageKey + ':before-sync', JSON.stringify(latest.current));
              setArchive(latest.current);
            }
            localStorage.setItem(
              storageKey + ':sync',
              JSON.stringify({ revision: server.revision, dirty: false }),
            );
            if (JSON.stringify(latest.current) !== JSON.stringify(server.season))
              acceptRef.current(server.season);
            setRemote(null);
            setCandidate(null);
            setStatus('Synchronisé');
            return;
          }
          meta = { revision: server.revision, dirty: false };
          localStorage.setItem(storageKey + ':sync', JSON.stringify(meta));
          setRemote(null);
          setCandidate(null);
          setStatus('Synchronisé');
          return;
        }
        if (!choice && meta?.revision !== server.revision) {
          setRemote(server);
          setStatus('Conflit à résoudre · brouillon local conservé');
          return;
        }
        const outgoing =
          choice === 'candidate' && candidateRef.current ? candidateRef.current : latest.current;
        const snapshot = JSON.stringify(outgoing);
        const put = await fetch('/api/v1/season', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            revision: choice ? server.revision : meta!.revision,
            season: outgoing,
          }),
        });
        const saved = await put.json();
        if (!mounted.current) return;
        if (put.status === 409) {
          setRemote(saved.workspace);
          setStatus('Conflit à résoudre · brouillon local conservé');
          return;
        }
        if (!put.ok) throw new Error(saved.message ?? 'Sauvegarde indisponible.');
        const persisted = localStorage.getItem(storageKey);
        const changed =
          choice !== 'candidate' &&
          (JSON.stringify(latest.current) !== snapshot ||
            (persisted !== null &&
              JSON.stringify(seasonSchema.parse(JSON.parse(persisted))) !== snapshot));
        localStorage.setItem(
          storageKey + ':sync',
          JSON.stringify({ revision: saved.revision, dirty: changed }),
        );
        if (choice === 'candidate') acceptRef.current(outgoing);
        setRemote(null);
        setCandidate(null);
        setStatus(changed ? 'En attente' : 'Synchronisé');
      } catch (error) {
        setStatus(
          `${error instanceof Error ? error.message : 'Hors ligne.'} Modifications conservées localement.`,
        );
      } finally {
        busy.current = false;
      }
    },
    [storageKey],
  );
  useEffect(() => {
    mounted.current = true;
    if (!ready) return;
    const timeout = setTimeout(() => {
      try {
        const saved = localStorage.getItem(storageKey + ':before-sync');
        if (saved) setArchive(seasonSchema.parse(JSON.parse(saved)));
      } catch {
        /* Keep any existing copy intact. */
      }
      void run();
    }, 900);
    const resume = () => void run();
    window.addEventListener('online', resume);
    window.addEventListener('focus', resume);
    return () => {
      mounted.current = false;
      clearTimeout(timeout);
      window.removeEventListener('online', resume);
      window.removeEventListener('focus', resume);
    };
  }, [ready, season, run, storageKey]);
  return (
    <aside className="trail-sync" aria-label="Synchronisation de la saison">
      <p role="status">{status}</p>
      {remote && (
        <div>
          <p>
            Sur le serveur : {remote.season?.races.length ?? 0} objectifs,{' '}
            {remote.season?.results.length ?? 0} résultats. Sur cet appareil :{' '}
            {(candidate ?? season).races.length} objectifs, {(candidate ?? season).results.length}{' '}
            résultats.
          </p>
          <details>
            <summary>Comparer les versions</summary>
            <div className="trail-sync-comparison">
              <SeasonSummary title="Sur cet appareil" season={candidate ?? season} />
              <SeasonSummary title="Sur le serveur" season={remote.season} />
            </div>
          </details>
          <button className="text-button" onClick={() => exportSeason(candidate ?? season)}>
            Exporter ma version avant remplacement
          </button>
          <button
            className="button secondary"
            onClick={() => void run(candidate ? 'candidate' : 'local')}
          >
            {candidate ? 'Importer cette saison locale' : 'Conserver ma version locale'}
          </button>{' '}
          <button className="button secondary" onClick={() => void run('remote')}>
            Utiliser la version du serveur
          </button>
          <p className="muted">
            Le remplacement est explicite. Une copie locale est conservée avant de charger la
            version serveur.
          </p>
        </div>
      )}
      {archive && (
        <button className="text-button" onClick={() => exportSeason(archive)}>
          Exporter la copie conservée avant synchronisation
        </button>
      )}
      {!remote && (
        <button className="text-button" onClick={() => void run()}>
          Synchroniser maintenant
        </button>
      )}
    </aside>
  );
}

function exportSeason(season: Season) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(season, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'myStats-saison-conservee.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function SeasonSummary({ title, season }: { title: string; season: Season | null }) {
  return (
    <section>
      <h3>{title}</h3>
      {season ? (
        <>
          <p>
            {season.profile.firstname} {season.profile.lastname} · UTMB {season.profile.utmb ?? '—'}{' '}
            · ITRA {season.profile.itra ?? '—'}
          </p>
          <ul>
            {season.races.map((r) => (
              <li key={r.id}>
                {r.name} · {r.date} · objectif {duration(r.targetSeconds)}
              </li>
            ))}
          </ul>
          <p>
            {season.results.length} résultats · {season.indexHistory.length} observations d’index
          </p>
        </>
      ) : (
        <p>Aucune saison enregistrée.</p>
      )}
    </section>
  );
}
