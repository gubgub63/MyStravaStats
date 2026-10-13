import { NextResponse } from 'next/server';
import { privateHeaders } from '@/lib/auth/http';
import { searchCatalog } from '@/lib/trail/catalog';
import { fetchCatalogRace } from '@/lib/trail/providers';
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  try {
    const id = q.get('id');
    if (id) return NextResponse.json(await fetchCatalogRace(id), { headers: privateHeaders });
    const query = q.get('q') ?? '';
    if (query.length > 150)
      return NextResponse.json(
        { message: 'Recherche trop longue.' },
        { status: 400, headers: privateHeaders },
      );
    return NextResponse.json({ races: searchCatalog(query) }, { headers: privateHeaders });
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : 'La course est indisponible.' },
      { status: 502, headers: privateHeaders },
    );
  }
}
