import { AuditLogTable } from '@/components/admin/audit-log-table';

export default function AuditLogPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Journal d&apos;audit</h1>
        <p className="text-muted-foreground">
          Historique de toutes les actions effectuées dans le système.
        </p>
      </div>
      <AuditLogTable />
    </div>
  );
}
