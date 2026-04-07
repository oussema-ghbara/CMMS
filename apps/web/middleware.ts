import { NextResponse, type NextRequest } from 'next/server';
import { Role } from '@gmao/shared';

const ROLE_ROUTES: Array<{ prefix: string; roles: Role[] }> = [
  { prefix: '/admin', roles: [Role.ADMIN] },
  { prefix: '/supervisor', roles: [Role.SUPERVISOR] },
  { prefix: '/storekeeper', roles: [Role.STOREKEEPER] },
];

const ROLE_HOME: Record<Role, string> = {
  [Role.ADMIN]: '/admin',
  [Role.SUPERVISOR]: '/supervisor',
  [Role.STOREKEEPER]: '/storekeeper',
  [Role.TECHNICIAN]: '/',
  [Role.REQUESTER]: '/',
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Public paths: always allow ──────────────────────────────────────────────
  if (pathname.startsWith('/login') || pathname.startsWith('/_next') || pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  // ── Auth check: require user_roles cookie ───────────────────────────────────
  const userRolesCookie = request.cookies.get('user_roles');

  if (!userRolesCookie?.value) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  let roles: Role[] = [];
  try {
    roles = JSON.parse(userRolesCookie.value) as Role[];
  } catch {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // ── Root redirect: send to the first matching role's home ───────────────────
  if (pathname === '/') {
    const home = roles.map((r) => ROLE_HOME[r]).find(Boolean) ?? '/login';
    return NextResponse.redirect(new URL(home, request.url));
  }

  // ── Role-based access: reject unauthorized role routes ─────────────────────
  for (const { prefix, roles: allowedRoles } of ROLE_ROUTES) {
    if (pathname.startsWith(prefix)) {
      const hasRole = allowedRoles.some((r) => roles.includes(r));
      if (!hasRole) {
        // Redirect to the user's own dashboard
        const home = roles.map((r) => ROLE_HOME[r]).find((h) => h && h !== '/') ?? '/login';
        return NextResponse.redirect(new URL(home, request.url));
      }
      break;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
