'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ChevronRight, Clock, Layers, Loader2, TrendingUp } from 'lucide-react';
import type { PartConsumptionBreakdown } from '@/lib/inventory.api';
import { inventoryApi } from '@/lib/inventory.api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function formatNumber(value: number): string {
  return new Intl.NumberFormat('fr-FR').format(value);
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value)} %`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(value);
}

const DEFAULT_PERIOD_DAYS = 30;
const DEFAULT_DEAD_STOCK_DAYS = 90;
const DEFAULT_LONG_WAITING_HOURS = 24;

export function StockAnalyticsBoard() {
  const { t } = useTranslation();

  const [periodInput, setPeriodInput] = useState(String(DEFAULT_PERIOD_DAYS));
  const [deadStockInput, setDeadStockInput] = useState(String(DEFAULT_DEAD_STOCK_DAYS));
  const [longWaitingInput, setLongWaitingInput] = useState(String(DEFAULT_LONG_WAITING_HOURS));
  const [periodDays, setPeriodDays] = useState(DEFAULT_PERIOD_DAYS);
  const [deadStockDays, setDeadStockDays] = useState(DEFAULT_DEAD_STOCK_DAYS);
  const [longWaitingThresholdHours, setLongWaitingThresholdHours] = useState(DEFAULT_LONG_WAITING_HOURS);

  const queryParams = useMemo(
    () => ({ periodDays, deadStockDays, longWaitingThresholdHours }),
    [periodDays, deadStockDays, longWaitingThresholdHours],
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: ['storekeeper', 'analytics', queryParams],
    queryFn: () => inventoryApi.getAnalytics(queryParams),
  });

  const handleApply = () => {
    const parsedPeriod = Math.max(1, Number.parseInt(periodInput, 10) || DEFAULT_PERIOD_DAYS);
    const parsedDeadStock = Math.max(1, Number.parseInt(deadStockInput, 10) || DEFAULT_DEAD_STOCK_DAYS);
    const parsedLongWaiting = Math.max(1, Number.parseInt(longWaitingInput, 10) || DEFAULT_LONG_WAITING_HOURS);

    setPeriodInput(String(parsedPeriod));
    setDeadStockInput(String(parsedDeadStock));
    setLongWaitingInput(String(parsedLongWaiting));
    setPeriodDays(parsedPeriod);
    setDeadStockDays(parsedDeadStock);
    setLongWaitingThresholdHours(parsedLongWaiting);
  };

  const handleReset = () => {
    setPeriodInput(String(DEFAULT_PERIOD_DAYS));
    setDeadStockInput(String(DEFAULT_DEAD_STOCK_DAYS));
    setLongWaitingInput(String(DEFAULT_LONG_WAITING_HOURS));
    setPeriodDays(DEFAULT_PERIOD_DAYS);
    setDeadStockDays(DEFAULT_DEAD_STOCK_DAYS);
    setLongWaitingThresholdHours(DEFAULT_LONG_WAITING_HOURS);
  };

  const topByQuantity = data?.consumption.topByQuantity ?? [];
  const topByCost = data?.consumption.topByCost ?? [];
  const consumptionBreakdown: PartConsumptionBreakdown[] = data?.consumptionBreakdown ?? [];
  const replenishment = data?.replenishment ?? [];
  const deadStock = data?.deadStock ?? [];
  const costTrend = data?.costTrend ?? [];
  const longWaitingRequests = data?.longWaitingRequests ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground" htmlFor="analytics-period-days">
              {t('storekeeperAnalytics.filters.periodDays')}
            </label>
            <Input
              id="analytics-period-days"
              type="number"
              min={1}
              value={periodInput}
              onChange={(event) => setPeriodInput(event.target.value)}
              className="w-24"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground" htmlFor="analytics-dead-stock-days">
              {t('storekeeperAnalytics.filters.deadStockDays')}
            </label>
            <Input
              id="analytics-dead-stock-days"
              type="number"
              min={1}
              value={deadStockInput}
              onChange={(event) => setDeadStockInput(event.target.value)}
              className="w-24"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground" htmlFor="analytics-long-waiting-hours">
              {t('storekeeperAnalytics.filters.longWaitingHours')}
            </label>
            <Input
              id="analytics-long-waiting-hours"
              type="number"
              min={1}
              value={longWaitingInput}
              onChange={(event) => setLongWaitingInput(event.target.value)}
              className="w-24"
            />
          </div>

          <Button type="button" variant="outline" onClick={handleApply}>
            {t('storekeeperAnalytics.filters.apply')}
          </Button>
          <Button type="button" variant="ghost" onClick={handleReset}>
            {t('storekeeperAnalytics.filters.reset')}
          </Button>
        </div>

        <Badge variant="secondary">
          {t('storekeeperAnalytics.labels.windowSummary', {
            periodDays,
            deadStockDays,
          })}
        </Badge>
      </div>

      {isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {t('storekeeperAnalytics.states.error')}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>{t('storekeeperAnalytics.kpi.totalRequests')}</CardDescription>
            <CardTitle className="text-2xl">{isLoading ? '...' : formatNumber(data?.requests.total ?? 0)}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>{t('storekeeperAnalytics.kpi.fulfilmentRate')}</CardDescription>
            <CardTitle className="text-2xl">
              {isLoading ? '...' : formatPercent(data?.requests.fulfilmentRate ?? 0)}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>{t('storekeeperAnalytics.kpi.avgProcessingMinutes')}</CardDescription>
            <CardTitle className="text-2xl">
              {isLoading
                ? '...'
                : data?.requests.avgProcessingMinutes == null
                  ? t('storekeeperAnalytics.labels.notAvailable')
                  : formatNumber(data.requests.avgProcessingMinutes)}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>{t('storekeeperAnalytics.kpi.deadStockCount')}</CardDescription>
            <CardTitle className="text-2xl">{isLoading ? '...' : formatNumber(deadStock.length)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {isLoading ? (
        <div className="rounded-md border bg-card py-14">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('storekeeperAnalytics.sections.topConsumption')}</CardTitle>
                <CardDescription>{t('storekeeperAnalytics.sections.topConsumptionDescription')}</CardDescription>
              </CardHeader>
              <CardContent>
                {topByQuantity.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('storekeeperAnalytics.states.empty')}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('storekeeperAnalytics.columns.part')}</TableHead>
                        <TableHead>{t('storekeeperAnalytics.columns.reference')}</TableHead>
                        <TableHead className="text-right">{t('storekeeperAnalytics.columns.quantity')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topByQuantity.map((row, index) => (
                        <TableRow key={`${row.part?.id ?? 'unknown'}-${index}`}>
                          <TableCell>{row.part?.name ?? t('storekeeperAnalytics.labels.unknownPart')}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {row.part?.referenceCode ?? t('storekeeperAnalytics.labels.notAvailable')}
                          </TableCell>
                          <TableCell className="text-right">{formatNumber(row.totalQuantity)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('storekeeperAnalytics.sections.topCost')}</CardTitle>
                <CardDescription>{t('storekeeperAnalytics.sections.topCostDescription')}</CardDescription>
              </CardHeader>
              <CardContent>
                {topByCost.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('storekeeperAnalytics.states.empty')}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('storekeeperAnalytics.columns.part')}</TableHead>
                        <TableHead>{t('storekeeperAnalytics.columns.reference')}</TableHead>
                        <TableHead className="text-right">{t('storekeeperAnalytics.columns.cost')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topByCost.map((row, index) => (
                        <TableRow key={`${row.part?.id ?? 'unknown'}-${index}`}>
                          <TableCell>{row.part?.name ?? t('storekeeperAnalytics.labels.unknownPart')}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {row.part?.referenceCode ?? t('storekeeperAnalytics.labels.notAvailable')}
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(row.totalCost)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          {/* §10.6 — Consumption breakdown by asset category and WO type */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Layers className="h-5 w-5" />
                {t('storekeeperAnalytics.sections.consumptionBreakdown')}
              </CardTitle>
              <CardDescription>{t('storekeeperAnalytics.sections.consumptionBreakdownDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              {consumptionBreakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('storekeeperAnalytics.states.empty')}</p>
              ) : (
                <div className="space-y-4">
                  {consumptionBreakdown.map((part) => (
                    <div key={part.partId} className="rounded-md border">
                      <div className="flex items-center justify-between px-4 py-2 bg-muted/40 rounded-t-md">
                        <span className="font-medium text-sm">{part.partName}</span>
                        <span className="text-xs text-muted-foreground font-mono">{part.partReference}</span>
                      </div>
                      <div className="px-4 py-2">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t('storekeeperAnalytics.columns.assetCategory')}</TableHead>
                              <TableHead>{t('storekeeperAnalytics.columns.woType')}</TableHead>
                              <TableHead className="text-right">{t('storekeeperAnalytics.columns.quantity')}</TableHead>
                              <TableHead className="text-right">{t('storekeeperAnalytics.columns.cost')}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {part.byAssetCategory.flatMap((cat) =>
                              cat.byWoType.map((entry, idx) => (
                                <TableRow key={`${cat.categoryId ?? 'none'}-${entry.woType ?? 'none'}-${idx}`}>
                                  {idx === 0 ? (
                                    <TableCell rowSpan={cat.byWoType.length} className="align-top font-medium text-sm">
                                      {cat.categoryName ?? t('storekeeperAnalytics.labels.noCategory')}
                                    </TableCell>
                                  ) : null}
                                  <TableCell>
                                    <Badge variant={entry.woType === 'CORRECTIVE' ? 'destructive' : entry.woType === 'PREVENTIVE' ? 'secondary' : 'outline'} className="text-xs">
                                      {entry.woType
                                        ? t(`storekeeperAnalytics.labels.woType.${entry.woType}`)
                                        : t('storekeeperAnalytics.labels.woType.NONE')}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right">{formatNumber(entry.quantity)}</TableCell>
                                  <TableCell className="text-right">{formatCurrency(entry.cost)}</TableCell>
                                </TableRow>
                              )),
                            )}
                            <TableRow className="bg-muted/20 font-semibold">
                              <TableCell colSpan={2}>{t('storekeeperAnalytics.labels.total')}</TableCell>
                              <TableCell className="text-right">{formatNumber(part.totalQuantity)}</TableCell>
                              <TableCell className="text-right">{formatCurrency(part.totalCost)}</TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('storekeeperAnalytics.sections.requestBreakdown')}</CardTitle>
                <CardDescription>{t('storekeeperAnalytics.sections.requestBreakdownDescription')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-md border p-3">
                    <p className="text-muted-foreground">{t('storekeeperAnalytics.requests.fulfilled')}</p>
                    <p className="mt-1 text-lg font-semibold">{formatNumber(data?.requests.fulfilled ?? 0)}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-muted-foreground">{t('storekeeperAnalytics.requests.partiallyFulfilled')}</p>
                    <p className="mt-1 text-lg font-semibold">
                      {formatNumber(data?.requests.partiallyFulfilled ?? 0)}
                    </p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-muted-foreground">{t('storekeeperAnalytics.requests.rejected')}</p>
                    <p className="mt-1 text-lg font-semibold">{formatNumber(data?.requests.rejected ?? 0)}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-muted-foreground">{t('storekeeperAnalytics.requests.pending')}</p>
                    <p className="mt-1 text-lg font-semibold">{formatNumber(data?.requests.pending ?? 0)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('storekeeperAnalytics.sections.replenishment')}</CardTitle>
                <CardDescription>{t('storekeeperAnalytics.sections.replenishmentDescription')}</CardDescription>
              </CardHeader>
              <CardContent>
                {replenishment.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('storekeeperAnalytics.states.empty')}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('storekeeperAnalytics.columns.part')}</TableHead>
                        <TableHead>{t('storekeeperAnalytics.columns.reference')}</TableHead>
                        <TableHead className="text-right">{t('storekeeperAnalytics.columns.timesTriggered')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {replenishment.map((row) => (
                        <TableRow key={row.partId}>
                          <TableCell>{row.partName}</TableCell>
                          <TableCell className="text-muted-foreground">{row.partReference}</TableCell>
                          <TableCell className="text-right">{formatNumber(row.timesTriggered)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('storekeeperAnalytics.sections.deadStock')}</CardTitle>
              <CardDescription>{t('storekeeperAnalytics.sections.deadStockDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              {deadStock.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('storekeeperAnalytics.states.empty')}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('storekeeperAnalytics.columns.part')}</TableHead>
                      <TableHead>{t('storekeeperAnalytics.columns.reference')}</TableHead>
                      <TableHead className="text-right">{t('storekeeperAnalytics.columns.stock')}</TableHead>
                      <TableHead className="text-right">{t('storekeeperAnalytics.columns.minimum')}</TableHead>
                      <TableHead className="text-right">{t('storekeeperAnalytics.columns.unitCost')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deadStock.map((part) => (
                      <TableRow key={part.id}>
                        <TableCell>{part.name}</TableCell>
                        <TableCell className="text-muted-foreground">{part.referenceCode}</TableCell>
                        <TableCell className="text-right">{formatNumber(part.currentStock)}</TableCell>
                        <TableCell className="text-right">{formatNumber(part.minimumStockThreshold)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(Number(part.unitCost))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {!isLoading && (
        <div className="space-y-4">
          {/* §3.1 — Cost trend */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                {t('storekeeperAnalytics.sections.costTrend')}
              </CardTitle>
              <CardDescription>{t('storekeeperAnalytics.sections.costTrendDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              {costTrend.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('storekeeperAnalytics.states.empty')}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('storekeeperAnalytics.columns.month')}</TableHead>
                      <TableHead className="text-right">{t('storekeeperAnalytics.columns.totalSpending')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {costTrend.map((row) => (
                      <TableRow key={row.month}>
                        <TableCell className="font-mono">{row.month}</TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(row.totalCost)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* §3.2 — Long-waiting requests on ON_HOLD WOs */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5" />
                {t('storekeeperAnalytics.sections.longWaitingRequests')}
                {longWaitingRequests.length > 0 && (
                  <Badge variant="destructive" className="ml-1">
                    {longWaitingRequests.length}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {t('storekeeperAnalytics.sections.longWaitingRequestsDescription', {
                  hours: data?.longWaitingThresholdHours ?? longWaitingThresholdHours,
                })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {longWaitingRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('storekeeperAnalytics.states.noLongWaiting')}</p>
              ) : (
                <>
                  <div className="mb-3 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {t('storekeeperAnalytics.labels.longWaitingWarning', {
                      count: longWaitingRequests.length,
                      hours: data?.longWaitingThresholdHours ?? longWaitingThresholdHours,
                    })}
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('storekeeperAnalytics.columns.workOrder')}</TableHead>
                        <TableHead>{t('storekeeperAnalytics.columns.part')}</TableHead>
                        <TableHead className="text-right">{t('storekeeperAnalytics.columns.quantity')}</TableHead>
                        <TableHead className="text-right">{t('storekeeperAnalytics.columns.waitingHours')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {longWaitingRequests.map((req) => (
                        <TableRow key={req.id}>
                          <TableCell className="font-mono text-xs">{req.woReference}</TableCell>
                          <TableCell>
                            {req.partName ?? req.offCatalogDescription ?? t('storekeeperAnalytics.labels.offCatalog')}
                            {req.partReference && (
                              <span className="ml-1 text-xs text-muted-foreground">({req.partReference})</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{formatNumber(req.quantityRequested)}</TableCell>
                          <TableCell className="text-right font-semibold text-destructive">
                            {formatNumber(req.waitingHours)} h
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="rounded-md border bg-card p-3 text-sm text-muted-foreground flex items-center gap-2">
        <ChevronRight className="h-4 w-4" />
        {t('storekeeperAnalytics.labels.endpointNote')}
      </div>
    </div>
  );
}
