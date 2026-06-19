'use client';

import { Suspense } from 'react';
import SetupContent from './setup-content';

export default function SetupPage() {
  return (
    <Suspense fallback={<SetupLoading />}>
      <SetupContent />
    </Suspense>
  );
}

function SetupLoading() {
  return (
    <div className="w-full max-w-md">
      <div className="rounded-lg border border-border bg-card shadow-lg p-6 space-y-4">
        <div className="space-y-2">
          <div className="h-6 w-32 bg-muted rounded animate-pulse" />
          <div className="h-4 w-full bg-muted rounded animate-pulse" />
        </div>
      </div>
    </div>
  );
}
