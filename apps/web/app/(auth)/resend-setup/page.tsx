import { Suspense } from 'react';
import ResendSetupContent from './resend-setup-content';

export default function ResendSetupPage() {
  return (
    <Suspense fallback={<ResendLoading />}>
      <ResendSetupContent />
    </Suspense>
  );
}

function ResendLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md">
        <div className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-lg">
          <div className="space-y-2">
            <div className="h-6 w-44 animate-pulse rounded bg-muted" />
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
          </div>
        </div>
      </div>
    </main>
  );
}