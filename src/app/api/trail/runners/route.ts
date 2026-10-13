import { NextResponse } from 'next/server';
import { fetchRunner, searchRunners } from '@/lib/trail/providers';
import { privateHeaders } from '@/lib/auth/http';
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  try {
    const uri = q.get('uri');
    if (uri) return NextResponse.json(await fetchRunner(uri), { headers: privateHeaders });
    const firstname = q.get('firstname')?.trim() ?? '',
      lastname = q.get('lastname')?.trim() ?? '';
    if (!firstname || !lastname || firstname.length > 100 || lastname.length > 100)
      return NextResponse.json(
        { message: 'Renseigne ton prénom et ton nom.' },
        { status: 400, headers: privateHeaders },
      );
    return NextResponse.json(
      { runners: await searchRunners(firstname, lastname) },
      { headers: privateHeaders },
    );
  } catch {
    return NextResponse.json(
      {
        message:
          'La recherche UTMB est indisponible ou son format a changé. Réessaie ou utilise le site officiel.',
      },
      { status: 502, headers: privateHeaders },
    );
  }
}
