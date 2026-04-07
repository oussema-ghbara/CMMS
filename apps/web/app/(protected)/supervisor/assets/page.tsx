import { AssetsBoard } from '@/components/supervisor/assets-board';

export default function SupervisorAssetsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Équipements</h1>
        <p className="text-muted-foreground">
          Gérez les équipements, leur criticité, leur statut et leur historique de maintenance.
        </p>
      </div>
      <AssetsBoard />
    </div>
  );
}
