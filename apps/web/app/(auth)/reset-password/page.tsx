'use client';

import { Suspense } from 'react';
import ResetPasswordContent from './reset-content';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetLoading />}>
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md">
        <div className="rounded-lg border border-border bg-card shadow-lg p-6 space-y-4">
          <div className="space-y-2">
            <div className="h-6 w-32 bg-muted rounded animate-pulse" />
            <div className="h-4 w-full bg-muted rounded animate-pulse" />
          </div>
        </div>
      </div>
    </main>
  );
}
