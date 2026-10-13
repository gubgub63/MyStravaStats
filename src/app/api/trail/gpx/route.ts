import { NextResponse } from 'next/server';
import { privateHeaders } from '@/lib/auth/http';
import { fetchCatalogRace, publicText } from '@/lib/trail/providers';
export async function GET(request: Request) {
  try {
    const race = await fetchCatalogRace(new URL(request.url).searchParams.get('id') ?? '');
    if (!race.gpxUrl)
      throw new Error(
        'Aucun GPX publié sur la page organisateur. Importe un fichier lorsque la trace sera disponible.',
      );
    const xml = await publicText(race.gpxUrl, 20 * 1024 * 1024);
    if (!/<(?:\w+:)?gpx\b/.test(xml)) throw new Error('La source ne contient pas de GPX valide.');
    return new Response(xml, {
      headers: {
        ...privateHeaders,
        'Content-Type': 'application/gpx+xml',
        'Content-Disposition': `attachment; filename="UTLAC${race.format}K.gpx"`,
        'X-GPX-Source': race.gpxUrl,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : 'Trace indisponible.' },
      { status: 502, headers: privateHeaders },
    );
  }
}
