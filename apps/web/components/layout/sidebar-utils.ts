import type { SidebarModuleItem, SidebarPageItem } from './sidebar-nav.config';

export function normalizePath(pathname: string) {
  if (!pathname) return '/';
  if (pathname === '/') return pathname;
  return pathname.replace(/\/+$/, '') || '/';
}

export function isPathActive(pathname: string, href: string, match: SidebarPageItem['match'] = 'prefix') {
  const normalizedPathname = normalizePath(pathname);
  const normalizedHref = normalizePath(href);

  if (match === 'exact') {
    return normalizedPathname === normalizedHref;
  }

  return normalizedPathname === normalizedHref || normalizedPathname.startsWith(`${normalizedHref}/`);
}

export function isModuleActive(pathname: string, module: SidebarModuleItem) {
  return module.items.some((item) => isPathActive(pathname, item.href, item.match));
}