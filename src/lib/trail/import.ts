import { analyzePoints, parseDuration, type TrackPoint } from './model';
import { fieldSchema, type HistoricalField, type TrackAnalysis } from './types';

export function parseGpx(xml: string, filename: string, source = ''): TrackAnalysis {
  if (xml.length > 20 * 1024 * 1024) throw new Error('Le GPX dépasse 20 Mo.');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Ce format XML n’est pas pris en charge.');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'gpx')
    throw new Error('Fichier GPX invalide.');
  let segments = Array.from(doc.getElementsByTagNameNS('*', 'trkseg'));
  if (!segments.length) segments = Array.from(doc.getElementsByTagNameNS('*', 'rte'));
  const points: TrackPoint[] = [];
  for (const [segment, node] of segments.entries()) {
    const nodes = Array.from(node.children).filter(
      (n) => n.localName === 'trkpt' || n.localName === 'rtept',
    );
    for (const p of nodes) {
      const ele = Array.from(p.children).find((n) => n.localName === 'ele')?.textContent;
      const lat = p.getAttribute('lat'),
        lon = p.getAttribute('lon');
      if (!ele?.trim() || !lat?.trim() || !lon?.trim())
        throw new Error(
          'Chaque point doit avoir des coordonnées et une altitude pour analyser le dénivelé.',
        );
      points.push({ lat: Number(lat), lon: Number(lon), elevation: Number(ele), segment });
    }
  }
  return { ...analyzePoints(points), filename, source, fetchedAt: new Date().toISOString() };
}

function csvRows(text: string): string[][] {
  const delimiter =
    (text.split(/\r?\n/, 1)[0].match(/;/g)?.length ?? 0) >
    (text.split(/\r?\n/, 1)[0].match(/,/g)?.length ?? 0)
      ? ';'
      : ',';
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false;
  const input = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') {
      if (quoted && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === delimiter || c === '\n')) {
      row.push(cell.trim());
      cell = '';
      if (c === '\n') {
        if (row.some(Boolean)) rows.push(row);
        row = [];
      }
    } else cell += c;
  }
  if (quoted) throw new Error('Guillemet CSV non fermé.');
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
export function parseFieldCsv(text: string): HistoricalField {
  if (text.length > 5 * 1024 * 1024) throw new Error('Le CSV dépasse 5 Mo.');
  const [headers, ...rows] = csvRows(text);
  if (!headers || !rows.length)
    throw new Error('Le CSV doit contenir un en-tête et des finishers.');
  const h = headers.map((s) => s.toLowerCase());
  const ti = h.findIndex((s) => ['time', 'temps', 'duration'].includes(s));
  const si = h.indexOf('status');
  if (ti < 0) throw new Error('Colonne time ou temps requise (format H:MM:SS).');
  const index = (row: string[], key: string) => {
    const cell = row[h.indexOf(key)];
    return cell?.trim() ? Number(cell.replace(',', '.')) : null;
  };
  const field = rows.flatMap((row, i) => {
    if (si >= 0 && /^(dnf|dns|dsq|abandon)$/i.test(row[si])) return [];
    const seconds = parseDuration(row[ti] ?? '');
    if (!seconds)
      throw new Error(`Temps invalide à la ligne ${i + 2}. Les abandons doivent avoir status=dnf.`);
    return [{ seconds, utmb: index(row, 'utmb'), itra: index(row, 'itra') }];
  });
  const parsed = fieldSchema.safeParse(field);
  if (!parsed.success || !field.length)
    throw new Error('Classement invalide : vérifie les temps et les scores entre 0 et 1 000.');
  return parsed.data;
}
