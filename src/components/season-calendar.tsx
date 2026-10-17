'use client';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Flag, Plus } from 'lucide-react';
import type { TrailRace } from '@/lib/trail/types';
import { monthDays } from '@/lib/trail/calendar';
import { number } from '@/lib/utils/units';
import { RacePhoto } from './race-photo';

export function SeasonCalendar({
  year,
  races,
  today,
  open,
  add,
  goToday,
}: {
  year: number;
  races: TrailRace[];
  today: string;
  goToday: () => void;
  open: (race: TrailRace) => void;
  add: (date: string) => void;
}) {
  const [month, setMonth] = useState(() => {
    const next = races.find((race) => race.date >= today) ?? races[0];
    return next ? Number(next.date.slice(5, 7)) - 1 : Number(today.slice(5, 7)) - 1;
  });
  const monthRaces = races.filter((race) => Number(race.date.slice(5, 7)) === month + 1);
  const label = new Date(year, month, 1, 12).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });
  return (
    <section className="trail-season-calendar" aria-label={`Calendrier de la saison ${year}`}>
      <div className="trail-calendar-months" aria-label="Choisir un mois">
        {Array.from({ length: 12 }, (_, index) => (
          <button key={index} aria-pressed={index === month} onClick={() => setMonth(index)}>
            {new Date(year, index, 1, 12)
              .toLocaleDateString('fr-FR', { month: 'short' })
              .replace('.', '')}
            <span>
              {races.filter((race) => Number(race.date.slice(5, 7)) === index + 1).length || '—'}
            </span>
          </button>
        ))}
      </div>
      <div className="trail-calendar-heading">
        <div>
          <span className="eyebrow">TA SAISON AU FIL DES MOIS</span>
          <h2 aria-live="polite">{label}</h2>
        </div>
        <div className="trail-calendar-controls">
          <button
            className="text-button"
            onClick={() => {
              setMonth(Number(today.slice(5, 7)) - 1);
              goToday();
            }}
          >
            Ce mois-ci
          </button>
          <button
            className="trail-icon-button"
            aria-label="Mois précédent"
            disabled={month === 0}
            onClick={() => setMonth(month - 1)}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            className="trail-icon-button"
            aria-label="Mois suivant"
            disabled={month === 11}
            onClick={() => setMonth(month + 1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <div className="trail-calendar-layout">
        <div className="trail-calendar-grid" aria-label={label}>
          {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((day) => (
            <div key={day} className="trail-calendar-weekday">
              {day}
            </div>
          ))}
          {monthDays(year, month).map((date, index) => {
            const events = date ? monthRaces.filter((race) => race.date === date) : [];
            return (
              <div
                key={date ?? `empty-${index}`}
                className={`trail-calendar-day${date === today ? ' is-today' : ''}${date ? '' : ' is-empty'}`}
              >
                {date && (
                  <>
                    <button
                      className="trail-calendar-day-number"
                      aria-label={`Ajouter une course le ${new Date(date + 'T12:00:00').toLocaleDateString('fr-FR')}`}
                      aria-current={date === today ? 'date' : undefined}
                      onClick={() => add(date)}
                    >
                      {Number(date.slice(8))}
                    </button>
                    {events.map((race) => (
                      <button
                        key={race.id}
                        className={`trail-calendar-event p-${race.priority}`}
                        onClick={() => open(race)}
                        title={race.name}
                      >
                        <RacePhoto photo={race.photo} />
                        <span>{race.name}</span>
                        <small>{race.priority}</small>
                      </button>
                    ))}
                  </>
                )}
              </div>
            );
          })}
        </div>
        <aside className="trail-calendar-agenda" aria-label="Courses du mois">
          <h3>
            {monthRaces.length} course{monthRaces.length > 1 ? 's' : ''} ce mois-ci
          </h3>
          <p className="trail-helper">A · objectif principal · B · préparation · C · plaisir</p>
          {monthRaces.map((race) => (
            <button key={race.id} className="trail-agenda-race" onClick={() => open(race)}>
              <RacePhoto photo={race.photo} />
              <span>
                <small>
                  {Number(race.date.slice(8))}{' '}
                  {new Date(year, month, 1, 12).toLocaleDateString('fr-FR', { month: 'long' })} ·{' '}
                  {race.priority}
                </small>
                <strong>{race.name}</strong>
                <small>
                  {number(race.distanceKm, 1)} km · {number(race.ascentM)} m D+
                </small>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
          {!monthRaces.length && (
            <div className="trail-calendar-rest">
              <Flag size={24} />
              <p>Un peu d’espace pour s’entraîner, récupérer ou choisir le prochain départ.</p>
            </div>
          )}
          <button
            className="trail-add-line"
            onClick={() => add(`${year}-${String(month + 1).padStart(2, '0')}-01`)}
          >
            <Plus size={16} /> Ajouter une course
          </button>
        </aside>
      </div>
    </section>
  );
}
