import { NextResponse } from 'next/server';
import { privateHeaders } from '@/lib/auth/http';
import { fetchHistoricalField } from '@/lib/trail/providers';
export async function GET(request: Request) {
  try {
    const data = await fetchHistoricalField(new URL(request.url).searchParams.get('id') ?? '');
    return NextResponse.json(data, { headers: privateHeaders });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'Classement indisponible. Réessaie ou importe un CSV.',
      },
      { status: 502, headers: privateHeaders },
    );
  }
}
