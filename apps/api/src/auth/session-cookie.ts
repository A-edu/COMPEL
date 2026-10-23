import type { CookieOptions, Request } from 'express';

export const SESSION_COOKIE = 'compel_session';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

// The browser's original host: behind the Next.js rewrite the API sees
// X-Forwarded-Host, so it is checked before Host.
function originalHostname(req: Request): string {
  const forwarded = req.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwarded || req.get('host') || '';
  return host.replace(/:\d+$/, '').toLowerCase();
}

export function sessionCookieOptions(req: Request): CookieOptions {
  return {
    httpOnly: true,
    secure: !LOCAL_HOSTS.has(originalHostname(req)),
    sameSite: 'lax',
    path: '/',
  };
}
