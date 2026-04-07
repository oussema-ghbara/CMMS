import { SystemConfigPanel } from '@/components/admin/system-config-panel';

export default function SystemConfigPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuration système</h1>
        <p className="text-muted-foreground">
          Paramètres de sécurité et de comportement de l&apos;application.
        </p>
      </div>
      <SystemConfigPanel />
    </div>
  );
}
