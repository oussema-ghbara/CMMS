'use client';

import { Badge } from '@/components/ui/badge';

export function NotificationBadge({ count, isLoading }: { count: number; isLoading: boolean }) {
  if (isLoading && count <= 0) {
    return (
      <span
        className="absolute right-0 top-0 h-2.5 w-2.5 -translate-y-1/2 translate-x-1/2 rounded-full bg-muted"
        aria-hidden="true"
      />
    );
  }

  if (count <= 0) {
    return null;
  }

  const display = count > 99 ? '99+' : String(count);

  return (
    <Badge
      variant="destructive"
      className="absolute right-0 top-0 flex h-5 min-w-5 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full px-1 text-[10px] leading-none"
    >
      {display}
    </Badge>
  );
}
