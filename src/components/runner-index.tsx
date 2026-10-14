'use client';
import Link from 'next/link';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { readRunnerProfile, TRAIL_STORAGE_EVENT } from '@/lib/trail/storage';
import type { TrailProfile } from '@/lib/trail/types';

function subscribe(listener: () => void) {
  window.addEventListener('storage', listener);
  window.addEventListener('focus', listener);
  window.addEventListener(TRAIL_STORAGE_EVENT, listener);
  return () => {
    window.removeEventListener('storage', listener);
    window.removeEventListener('focus', listener);
    window.removeEventListener(TRAIL_STORAGE_EVENT, listener);
  };
}
const serverSnapshot = () => null;
export default function RunnerIndex({
  athlete,
  demo = false,
}: {
  athlete?: { id: number; firstname?: string; lastname?: string };
  demo?: boolean;
}) {
  const snapshot = useCallback(() => {
    try {
      const profile = readRunnerProfile(localStorage, athlete);
      return profile ? JSON.stringify(profile) : null;
    } catch {
      return null;
    }
  }, [athlete]);
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const profile = useMemo<TrailProfile | null>(() => (raw ? JSON.parse(raw) : null), [raw]);
  if (profile?.utmb === null || profile?.utmb === undefined) return null;
  return (
    <Link
      href="/season"
      className="dashboard-runner-index"
      aria-label={`Index UTMB de ${profile.firstname} ${profile.lastname} : ${profile.utmb} sur 1 000`}
    >
      {demo && (
        <span>
          {profile.firstname} {profile.lastname} ·
        </span>
      )}
      <span>Index UTMB</span>
      <strong>{profile.utmb}</strong>
      <span>/ 1 000</span>
    </Link>
  );
}
