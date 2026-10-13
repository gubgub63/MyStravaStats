export const catalog = [
  {
    id: 'utlac-120',
    format: '120',
    name: 'UTLAC · Lake Como Ultra Trail',
    location: 'Menaggio → Lecco',
  },
  {
    id: 'utlac-250',
    format: '250',
    name: 'UTLAC · Lake Como Endurance Trail',
    location: 'Lecco → Lecco',
  },
  { id: 'utlac-60', format: '60', name: 'UTLAC · Lake Como Gran Trail', location: 'Como → Lecco' },
  { id: 'utlac-30', format: '30', name: 'UTLAC · Lake Como Trail', location: 'Bellagio → Lecco' },
  { id: 'utlac-15', format: '15', name: 'UTLAC · Lake Como Short Trail', location: 'Lecco' },
];
export type RaceCatalogItem = (typeof catalog)[number] & {
  date: string;
  distanceKm: number;
  ascentM: number;
  cutoffHours: number | null;
  source: string;
  gpxUrl: string;
  terrainDescription: string;
  checkedAt: string;
};
export function searchCatalog(query: string) {
  const q = query
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  if (!q) return [];
  const lake = /utlac|como|come|lago|lac/.test(q);
  const distance = q.match(/\b(250|120|60|30|15)\b/)?.[1];
  return catalog.filter(
    (r) => (lake || r.name.toLowerCase().includes(q)) && (!distance || r.format === distance),
  );
}
