import { NextResponse, type NextRequest } from 'next/server';
import { Role } from '@gmao/shared';

const ROLE_ROUTES: Array<{ prefix: string; roles: Role[] }> = [
  { prefix: '/admin', roles: [Role.ADMIN] },
  { prefix: '/supervisor', roles: [Role.SUPERVISOR] },
  { prefix: '/storekeeper', roles: [Role.STOREKEEPER] },
  { prefix: '/requester', roles: [Role.REQUESTER] },
  { prefix: '/technician', roles: [Role.TECHNICIAN] },
];

const ROLE_HOME: Partial<Record<Role, string>> = {
  [Role.ADMIN]: '/admin',
  [Role.SUPERVISOR]: '/supervisor',
  [Role.STOREKEEPER]: '/storekeeper',
  [Role.REQUESTER]: '/requester',
  [Role.TECHNICIAN]: '/technician',
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthPath =
    pathname.startsWith('/login') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/resend-setup') ||
    pathname.startsWith('/setup') ||
    pathname.startsWith('/auth/');

  if (isAuthPath || pathname.startsWith('/_next') || pathname.startsWith('/api')) {
    return NextResponse.next();
  }

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

  const hasWebRole = roles.some((role) => !!ROLE_HOME[role]);
  if (!hasWebRole) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('error', 'no_web_access');
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete('user_roles');
    return response;
  }

  if (pathname === '/') {
    const home = roles.map((r) => ROLE_HOME[r]).find((value): value is string => !!value) ?? '/login';
    return NextResponse.redirect(new URL(home, request.url));
  }

  for (const { prefix, roles: allowedRoles } of ROLE_ROUTES) {
    if (pathname.startsWith(prefix)) {
      const hasRole = allowedRoles.some((r) => roles.includes(r));
      if (!hasRole) {

        const home = roles.map((r) => ROLE_HOME[r]).find((value): value is string => !!value) ?? '/login';
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
