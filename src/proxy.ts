import { NextRequest, NextResponse } from 'next/server';
export function proxy(request: NextRequest) {
    const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
    const dev = process.env.NODE_ENV !== 'production';
    const csp = `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.strava.com https://dgalywyr863hv.cloudfront.net; font-src 'self'; connect-src 'self'${dev ? ' ws: wss:' : ''}; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self';${dev ? '' : ' upgrade-insecure-requests;'}`;
    const headers = new Headers(request.headers);
    headers.set('x-nonce', nonce);
    headers.set('Content-Security-Policy', csp);
    const response = NextResponse.next({ request: { headers } });
    response.headers.set('Content-Security-Policy', csp);
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (!dev)
        response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    if (
        request.nextUrl.pathname.startsWith('/api/') ||
        request.nextUrl.pathname.startsWith('/dashboard')
    )
        response.headers.set('Cache-Control', 'private, no-store');
    return response;
}
export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg$|.*\\.png$).*)'],
};
/
