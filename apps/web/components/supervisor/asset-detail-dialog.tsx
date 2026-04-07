'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AxiosError } from 'axios';
import { Loader2, AlertTriangle } from 'lucide-react';
import { AssetStatus } from '@gmao/shared';
import { assetsApi, type AssetListItem } from '@/lib/assets.api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

function getErrorMessage(error: unknown, fallback: string): string {
  const axiosError = error as AxiosError<{ message?: string | string[] }>;
  const rawMessage = axiosError.response?.data?.message;
  if (Array.isArray(rawMessage) && rawMessage.length > 0) return rawMessage[0] ?? fallback;
  if (typeof rawMessage === 'string' && rawMessage.trim()) return rawMessage;
  return fallback;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function getStatusBadgeVariant(
  status: AssetStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' {
  if (status === AssetStatus.OPERATIONAL) return 'success';
  if (status === AssetStatus.IN_MAINTENANCE) return 'warning';
  if (status === AssetStatus.MAINTENANCE_BLOCKED) return 'warning';
  if (status === AssetStatus.OUT_OF_SERVICE) return 'destructive';
  if (status === AssetStatus.DECOMMISSIONED) return 'secondary';
  return 'secondary';
}

function getCriticalityBadgeVariant(
  criticality: string,
): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' {
  if (criticality === 'CRITICAL') return 'destructive';
  if (criticality === 'STANDARD') return 'secondary';
  return 'outline';
}

type TransitionTarget = 'OUT_OF_SERVICE' | 'DECOMMISSIONED' | 'OPERATIONAL';

interface AssetDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: AssetListItem | null;
  onEdit: (asset: AssetListItem) => void;
}

export function AssetDetailDialog({ open, onOpenChange, asset, onEdit }: AssetDetailDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [transitionTarget, setTransitionTarget] = useState<TransitionTarget | null>(null);
  const [decommissionConfirmed, setDecommissionConfirmed] = useState(false);

  const { register: registerReason, handleSubmit: handleTransitionSubmit, reset: resetReason } =
    useForm<{ reason: string }>({ defaultValues: { reason: '' } });

  const { data: detail, isLoading, isError } = useQuery({
    queryKey: ['supervisor', 'assets', asset?.id, 'detail'],
    queryFn: () => assetsApi.getById(asset!.id),
    enabled: open && !!asset?.id,
  });

  const transitionMutation = useMutation({
    mutationFn: ({ status, reason }: { status: AssetStatus; reason?: string }) =>
      assetsApi.transitionStatus(asset!.id, { status, reason: reason || undefined }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supervisor', 'assets'] });
      void queryClient.invalidateQueries({ queryKey: ['supervisor', 'assets', asset?.id] });
      toast.success(t('supervisorAssets.toasts.statusSuccess'));
      setTransitionTarget(null);
      setDecommissionConfirmed(false);
      resetReason();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t('supervisorAssets.toasts.statusError')));
    },
  });

  const openTransition = (target: TransitionTarget) => {
    setTransitionTarget(target);
    setDecommissionConfirmed(false);
    resetReason();
  };

  const submitTransition = ({ reason }: { reason: string }) => {
    if (!transitionTarget) return;
    transitionMutation.mutate({ status: AssetStatus[transitionTarget], reason });
  };

  const currentStatus = detail?.status ?? asset?.status;
  const isDecommissioned = currentStatus === AssetStatus.DECOMMISSIONED;

  const canSetOutOfService =
    currentStatus !== AssetStatus.OUT_OF_SERVICE &&
    currentStatus !== AssetStatus.DECOMMISSIONED;

  const canSetOperational = currentStatus === AssetStatus.OUT_OF_SERVICE;

  const canDecommission = currentStatus !== AssetStatus.DECOMMISSIONED;

  // Transition panel labels
  const transitionLabels: Record<TransitionTarget, { title: string; description: string }> = {
    OUT_OF_SERVICE: {
      title: t('supervisorAssets.statusTransition.setOutOfServiceTitle'),
      description: t('supervisorAssets.statusTransition.setOutOfServiceDescription'),
    },
    DECOMMISSIONED: {
      title: t('supervisorAssets.statusTransition.decommissionTitle'),
      description: t('supervisorAssets.statusTransition.decommissionDescription'),
    },
    OPERATIONAL: {
      title: t('supervisorAssets.statusTransition.setOperationalTitle'),
      description: t('supervisorAssets.statusTransition.setOperationalDescription'),
    },
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('supervisorAssets.detail.title')}</DialogTitle>
          {asset && (
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <span className="text-sm font-medium text-foreground">{asset.name}</span>
              {currentStatus && (
                <Badge variant={getStatusBadgeVariant(currentStatus as AssetStatus)}>
                  {t(`supervisorAssets.status.${currentStatus}`)}
                </Badge>
              )}
              {asset.criticality && (
                <Badge variant={getCriticalityBadgeVariant(asset.criticality)}>
                  {t(`supervisorAssets.criticality.${asset.criticality}`)}
                </Badge>
              )}
            </div>
          )}
        </DialogHeader>

        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <p className="py-8 text-center text-sm text-destructive">
            {t('supervisorAssets.states.detailError')}
          </p>
        ) : detail ? (
          <div className="space-y-6">
            {/* ── General info ── */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">{t('supervisorAssets.detail.category')}</p>
                <p className="font-medium">{detail.category.name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('supervisorAssets.detail.location')}</p>
                <p className="font-medium">{detail.location.fullPath}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('supervisorAssets.detail.qrCode')}</p>
                <p className="font-mono text-xs">{detail.qrCodeIdentifier}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('supervisorAssets.detail.serialNumber')}</p>
                <p className="font-medium">{detail.serialNumber || t('supervisorAssets.detail.noSerialNumber')}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('supervisorAssets.detail.manufacturer')}</p>
                <p className="font-medium">{detail.manufacturer || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('supervisorAssets.detail.model')}</p>
                <p className="font-medium">{detail.model || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('supervisorAssets.detail.installationDate')}</p>
                <p className="font-medium">{formatDate(detail.installationDate) === '—' ? t('supervisorAssets.detail.noInstallationDate') : formatDate(detail.installationDate)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('supervisorAssets.detail.warrantyExpiration')}</p>
                <p className="font-medium">{formatDate(detail.warrantyExpiration) === '—' ? t('supervisorAssets.detail.noWarranty') : formatDate(detail.warrantyExpiration)}</p>
              </div>
              {detail.parent && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">{t('supervisorAssets.detail.parent')}</p>
                  <p className="font-medium">{detail.parent.name}</p>
                </div>
              )}
              {detail.description && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">{t('common.description')}</p>
                  <p>{detail.description}</p>
                </div>
              )}
            </div>

            {/* ── Sub-components ── */}
            {detail.children.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('supervisorAssets.detail.children')}</p>
                  <div className="flex flex-wrap gap-2">
                    {detail.children.map((child) => (
                      <Badge key={child.id} variant="outline">
                        {child.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ── Certificates ── */}
            {detail.certificates.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('supervisorAssets.detail.certificates')}</p>
                  <div className="space-y-2">
                    {detail.certificates.map((cert) => (
                      <div
                        key={cert.id}
                        className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                      >
                        <div>
                          <p className="font-medium">
                            {cert.certificateType === 'OTHER' && cert.otherType
                              ? cert.otherType
                              : t(`supervisorAssets.certificateType.${cert.certificateType}`)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {cert.issuingAuthority} — {t('supervisorAssets.detail.warrantyExpiration')}: {formatDate(cert.expirationDate)}
                          </p>
                        </div>
                        <Badge
                          variant={
                            cert.status === 'EXPIRED'
                              ? 'destructive'
                              : cert.status === 'EXPIRING_SOON'
                              ? 'warning'
                              : 'success'
                          }
                        >
                          {t(`supervisorAssets.certificateStatus.${cert.status}`)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ── Status transitions ── */}
            {!isDecommissioned && (
              <>
                <Separator />
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium">{t('supervisorAssets.detail.statusTransitions')}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('supervisorAssets.detail.statusTransitionsDescription')}
                    </p>
                  </div>

                  {transitionTarget ? (
                    <form onSubmit={handleTransitionSubmit(submitTransition)} className="space-y-3 rounded-md border p-3">
                      <div>
                        <p className="text-sm font-medium">{transitionLabels[transitionTarget].title}</p>
                        <p className="text-xs text-muted-foreground">{transitionLabels[transitionTarget].description}</p>
                      </div>

                      {transitionTarget !== 'OPERATIONAL' && (
                        <div className="space-y-1.5">
                          <Label htmlFor="transition-reason">
                            {t('supervisorAssets.statusTransition.reasonLabel')}
                          </Label>
                          <Input
                            id="transition-reason"
                            placeholder={t('supervisorAssets.statusTransition.reasonPlaceholder')}
                            {...registerReason('reason')}
                            maxLength={500}
                          />
                        </div>
                      )}

                      {transitionTarget === 'DECOMMISSIONED' && (
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={decommissionConfirmed}
                            onChange={(e) => setDecommissionConfirmed(e.target.checked)}
                            className="h-4 w-4"
                          />
                          <span className="text-destructive font-medium">
                            {t('supervisorAssets.statusTransition.confirmDecommission')}
                          </span>
                        </label>
                      )}

                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setTransitionTarget(null);
                            resetReason();
                          }}
                          disabled={transitionMutation.isPending}
                        >
                          {t('common.cancel')}
                        </Button>
                        <Button
                          type="submit"
                          size="sm"
                          variant={transitionTarget === 'DECOMMISSIONED' ? 'destructive' : 'default'}
                          disabled={
                            transitionMutation.isPending ||
                            (transitionTarget === 'DECOMMISSIONED' && !decommissionConfirmed)
                          }
                        >
                          {transitionMutation.isPending && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                          {t('common.confirm')}
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {canSetOperational && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => openTransition('OPERATIONAL')}
                        >
                          {t('supervisorAssets.actions.setOperational')}
                        </Button>
                      )}
                      {canSetOutOfService && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => openTransition('OUT_OF_SERVICE')}
                        >
                          {t('supervisorAssets.actions.setOutOfService')}
                        </Button>
                      )}
                      {canDecommission && (
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => openTransition('DECOMMISSIONED')}
                        >
                          <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
                          {t('supervisorAssets.actions.decommission')}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── Status history ── */}
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('supervisorAssets.detail.statusHistory')}</p>
              <p className="text-xs text-muted-foreground">
                {t('supervisorAssets.detail.statusHistoryDescription')}
              </p>
              {detail.statusLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('supervisorAssets.states.historyEmpty')}</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {detail.statusLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-start justify-between rounded-md border px-3 py-2 text-xs gap-3"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {log.fromStatus && (
                            <>
                              <Badge variant={getStatusBadgeVariant(log.fromStatus as AssetStatus)} className="text-[10px] px-1.5 py-0">
                                {t(`supervisorAssets.status.${log.fromStatus}`)}
                              </Badge>
                              <span className="text-muted-foreground">→</span>
                            </>
                          )}
                          <Badge variant={getStatusBadgeVariant(log.toStatus as AssetStatus)} className="text-[10px] px-1.5 py-0">
                            {t(`supervisorAssets.status.${log.toStatus}`)}
                          </Badge>
                        </div>
                        {log.reason && (
                          <p className="text-muted-foreground">{log.reason}</p>
                        )}
                      </div>
                      <div className="text-right text-muted-foreground shrink-0">
                        <p>{log.actor?.name ?? '—'}</p>
                        <p>{formatDateTime(log.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}

        <DialogFooter className="mt-2">
          {asset && !isDecommissioned && (
            <Button type="button" variant="outline" onClick={() => onEdit(asset)}>
              {t('supervisorAssets.actions.edit')}
            </Button>
          )}
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
