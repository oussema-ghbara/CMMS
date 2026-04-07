import { UsersTable } from '@/components/admin/users-table';

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Gestion des utilisateurs</h1>
        <p className="text-muted-foreground">
          Créez, modifiez et gérez les comptes utilisateurs du système.
        </p>
      </div>
      <UsersTable />
    </div>
  );
}
