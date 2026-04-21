'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AxiosError } from 'axios';
import { Loader2, AlertTriangle, Download, Plus, Pencil, Trash2, Upload, Printer } from 'lucide-react';
import QRCode from 'react-qr-code';
import { openQrPrintWindow } from '@/lib/qr-print';
import { AssetStatus } from '@gmao/shared';
import {
  assetsApi,
  type AssetCertificate,
  type AssetDocument,
  type AssetListItem,
} from '@/lib/assets.api';
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
import { CertificateFormDialog } from './certificate-form-dialog';
import { DocumentUploadDialog } from './document-upload-dialog';

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
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  // Certificate dialog state
  const [certFormOpen, setCertFormOpen] = useState(false);
  const [editingCert, setEditingCert] = useState<AssetCertificate | null>(null);
  const [deletingCertId, setDeletingCertId] = useState<string | null>(null);

  // Document dialog state
  const [docUploadOpen, setDocUploadOpen] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  const { register: registerReason, handleSubmit: handleTransitionSubmit, reset: resetReason } =
    useForm<{ reason: string }>({ defaultValues: { reason: '' } });

  const { data: detail, isLoading, isError } = useQuery({
    queryKey: ['supervisor', 'assets', asset?.id, 'detail'],
    queryFn: () => assetsApi.getById(asset!.id),
    enabled: open && !!asset?.id,
  });

  const certificatesQuery = useQuery({
    queryKey: ['supervisor', 'assets', asset?.id, 'certificates'],
    queryFn: () => assetsApi.listCertificates(asset!.id),
    enabled: open && !!asset?.id,
  });

  const documentsQuery = useQuery({
    queryKey: ['supervisor', 'assets', asset?.id, 'documents'],
    queryFn: () => assetsApi.listDocuments(asset!.id),
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

  const deleteCertMutation = useMutation({
    mutationFn: (certId: string) => assetsApi.deleteCertificate(asset!.id, certId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supervisor', 'assets', asset?.id, 'certificates'] });
      void queryClient.invalidateQueries({ queryKey: ['supervisor', 'assets', asset?.id, 'detail'] });
      toast.success(t('supervisorAssets.certificate.toasts.deleteSuccess'));
      setDeletingCertId(null);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t('supervisorAssets.certificate.toasts.deleteError')));
      setDeletingCertId(null);
    },
  });

  const deleteDocMutation = useMutation({
    mutationFn: (docId: string) => assetsApi.deleteDocument(asset!.id, docId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supervisor', 'assets', asset?.id, 'documents'] });
      toast.success(t('supervisorAssets.document.toasts.deleteSuccess'));
      setDeletingDocId(null);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t('supervisorAssets.document.toasts.deleteError')));
      setDeletingDocId(null);
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

  const handleDownload = async (entry: AssetCertificate | AssetDocument, kind: 'certificate' | 'document') => {
    if (!asset?.id) return;

    const key = `${kind}:${entry.id}`;
    setDownloadingKey(key);

    try {
      const url =
        kind === 'certificate'
          ? await assetsApi.getCertificateDownloadUrl(asset.id, entry.id)
          : await assetsApi.getDocumentDownloadUrl(asset.id, entry.id);

      window.open(url, '_blank', 'noopener,noreferrer');
      toast.success(t('supervisorAssets.toasts.downloadStarted'));
    } catch (error) {
      toast.error(getErrorMessage(error, t('supervisorAssets.toasts.downloadError')));
    } finally {
      setDownloadingKey(null);
    }
  };

  const currentStatus = detail?.status ?? asset?.status;
  const isDecommissioned = currentStatus === AssetStatus.DECOMMISSIONED;
  const certificates = certificatesQuery.data ?? detail?.certificates ?? [];
  const documents = documentsQuery.data ?? [];

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
    <>
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
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground mb-2">{t('supervisorAssets.detail.qrCode')}</p>
                  <div className="flex items-start gap-4">
                    <div
                      id={`qr-svg-${detail.id}`}
                      className="rounded border p-2 bg-white"
                      aria-label={t('supervisorAssets.detail.qrCodeAriaLabel', { identifier: detail.qrCodeIdentifier })}
                    >
                      <QRCode
                        value={detail.qrCodeIdentifier}
                        size={120}
                        level="M"
                        style={{ display: 'block' }}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <p className="font-mono text-xs text-muted-foreground">{detail.qrCodeIdentifier}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => {
                          const svgEl = document.querySelector(`#qr-svg-${detail.id} svg`);
                          const svgMarkup = svgEl ? svgEl.outerHTML : '';
                          openQrPrintWindow(
                            { identifier: detail.qrCodeIdentifier, assetName: detail.name },
                            svgMarkup,
                          );
                        }}
                      >
                        <Printer className="h-3.5 w-3.5" />
                        {t('supervisorAssets.detail.printQrCode')}
                      </Button>
                    </div>
                  </div>
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
              <>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{t('supervisorAssets.detail.certificates')}</p>
                    {!isDecommissioned && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => { setEditingCert(null); setCertFormOpen(true); }}
                      >
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        {t('supervisorAssets.certificate.actions.add')}
                      </Button>
                    )}
                  </div>

                  {certificatesQuery.isLoading ? (
                    <div className="flex items-center justify-center rounded-md border px-3 py-6">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : certificates.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('supervisorAssets.detail.certificatesEmpty')}</p>
                  ) : (
                    <div className="space-y-2">
                      {certificates.map((cert) => {
                        const hasDocument = !!cert.documentId || !!cert.document;
                        const certDownloadKey = `certificate:${cert.id}`;
                        const isDeleting = deletingCertId === cert.id && deleteCertMutation.isPending;

                        return (
                          <div
                            key={cert.id}
                            className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
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
                            <div className="flex items-center gap-1.5 shrink-0">
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

                              {hasDocument && (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  title={t('supervisorAssets.actions.download')}
                                  onClick={() => handleDownload(cert, 'certificate')}
                                  disabled={downloadingKey === certDownloadKey}
                                >
                                  {downloadingKey === certDownloadKey ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Download className="h-4 w-4" />
                                  )}
                                </Button>
                              )}

                              {!isDecommissioned && (
                                <>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    title={t('common.edit')}
                                    onClick={() => { setEditingCert(cert); setCertFormOpen(true); }}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                    title={t('common.delete')}
                                    disabled={isDeleting}
                                    onClick={() => {
                                      setDeletingCertId(cert.id);
                                      deleteCertMutation.mutate(cert.id);
                                    }}
                                  >
                                    {isDeleting ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>

              {/* ── Documents ── */}
              <>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{t('supervisorAssets.detail.documents')}</p>
                    {!isDecommissioned && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setDocUploadOpen(true)}
                      >
                        <Upload className="mr-1.5 h-3.5 w-3.5" />
                        {t('supervisorAssets.document.actions.upload')}
                      </Button>
                    )}
                  </div>

                  {documentsQuery.isLoading ? (
                    <div className="flex items-center justify-center rounded-md border px-3 py-6">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : documents.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('supervisorAssets.detail.documentsEmpty')}</p>
                  ) : (
                    <div className="space-y-2">
                      {documents.map((doc) => {
                        const documentDownloadKey = `document:${doc.id}`;
                        const isDeleting = deletingDocId === doc.id && deleteDocMutation.isPending;

                        return (
                          <div
                            key={doc.id}
                            className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
                          >
                            <div className="min-w-0">
                              <p className="font-medium truncate">{doc.fileName}</p>
                              <p className="text-xs text-muted-foreground">
                                {t(`supervisorAssets.documentType.${doc.documentType}`)} — {doc.uploadedBy?.name ?? '—'} — {formatDateTime(doc.createdAt)}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                title={t('supervisorAssets.actions.download')}
                                onClick={() => handleDownload(doc, 'document')}
                                disabled={downloadingKey === documentDownloadKey}
                              >
                                {downloadingKey === documentDownloadKey ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Download className="h-4 w-4" />
                                )}
                              </Button>

                              {!isDecommissioned && (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  title={t('common.delete')}
                                  disabled={isDeleting}
                                  onClick={() => {
                                    setDeletingDocId(doc.id);
                                    deleteDocMutation.mutate(doc.id);
                                  }}
                                >
                                  {isDeleting ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>

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

      {/* Certificate form dialog (create / edit) */}
      {asset && (
        <CertificateFormDialog
          open={certFormOpen}
          onOpenChange={setCertFormOpen}
          assetId={asset.id}
          certificate={editingCert}
          onSuccess={() => setEditingCert(null)}
        />
      )}

      {/* Document upload dialog */}
      {asset && (
        <DocumentUploadDialog
          open={docUploadOpen}
          onOpenChange={setDocUploadOpen}
          assetId={asset.id}
          onSuccess={() => {}}
        />
      )}
    </>
  );
}
