import type { PartCatalogItem } from './inventory.api';

export type LowStockSortField = 'deficit' | 'name' | 'currentStock';
export type SortDir = 'asc' | 'desc';

export function computeDeficit(part: Pick<PartCatalogItem, 'currentStock' | 'minimumStockThreshold'>): number {
  return part.minimumStockThreshold - part.currentStock;
}

export function sortLowStockParts(
  parts: PartCatalogItem[],
  field: LowStockSortField,
  dir: SortDir,
): PartCatalogItem[] {
  return [...parts].sort((a, b) => {
    let diff = 0;
    if (field === 'deficit') diff = computeDeficit(a) - computeDeficit(b);
    else if (field === 'currentStock') diff = a.currentStock - b.currentStock;
    else if (field === 'name') diff = a.name.localeCompare(b.name);
    return dir === 'asc' ? diff : -diff;
  });
}

export function toggleSortDir(current: SortDir): SortDir {
  return current === 'asc' ? 'desc' : 'asc';
}
