'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AxiosError } from 'axios';
import { AlertTriangle, Download, Loader2, Pencil, Printer, Trash2, Upload } from 'lucide-react';
import QRCode from 'react-qr-code';
import { openQrPrintWindow } from '@/lib/qr-print';
import { AssetStatus } from '@gmao/shared';
import {
  assetsApi,
  type AssetCertificate,
  type AssetDocument,
  type AssetListItem,
} from '@/lib/assets.api';
import { Mono } from '@/components/ui/mono';
import { CertificateFormDialog } from './certificate-form-dialog';
import { DocumentUploadDialog } from './document-upload-dialog';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getErrorMessage(error: unknown, fallback: string): string {
  const axiosError = error as AxiosError<{ message?: string | string[] }>;
  const rawMessage = axiosError.response?.data?.message;
  if (Array.isArray(rawMessage) && rawMessage.length > 0) return rawMessage[0] ?? fallback;
  if (typeof rawMessage === 'string' && rawMessage.trim()) return rawMessage;
  return fallback;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}

const MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,monospace';

const STATUS_COLOR: Record<AssetStatus, { dot: string; bg: string; border: string }> = {
  [AssetStatus.OPERATIONAL]:          { dot: 'var(--sb-s-done)',        bg: 'var(--sb-s-done-bg)',              border: 'var(--sb-s-done-border)'          },
  [AssetStatus.IN_MAINTENANCE]:       { dot: 'var(--sb-s-active)',      bg: 'var(--sb-s-active-bg)',            border: 'var(--sb-s-active-border)'        },
  [AssetStatus.MAINTENANCE_BLOCKED]:  { dot: 'var(--sb-p-high)',        bg: 'rgba(237,137,54,0.08)',            border: 'rgba(237,137,54,0.25)'            },
  [AssetStatus.OUT_OF_SERVICE]:       { dot: 'var(--sb-p-crit)',        bg: 'rgba(181,53,37,0.06)',             border: 'rgba(181,53,37,0.25)'             },
  [AssetStatus.DECOMMISSIONED]:       { dot: 'var(--sb-text-tertiary)', bg: 'transparent',                     border: 'var(--sb-border)'                 },
};

const CERT_STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  VALID:          { bg: 'var(--sb-s-done-bg)',   color: 'var(--sb-s-done)'   },
  EXPIRING_SOON:  { bg: 'var(--sb-s-wait-bg)',   color: 'var(--sb-s-wait)'   },
  EXPIRED:        { bg: 'var(--sb-p-crit-bg)',   color: 'var(--sb-p-crit)'   },
};

function AssetStatusChip({ status, label }: { status: AssetStatus; label: string }) {
  const cfg = STATUS_COLOR[status] ?? STATUS_COLOR[AssetStatus.DECOMMISSIONED];
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '2px 7px', borderRadius: 2,
        background: cfg.bg, border: `1px solid ${cfg.border}`,
        fontFamily: MONO, fontSize: 9, fontWeight: 600,
        color: cfg.dot, textTransform: 'uppercase', letterSpacing: '0.08em',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
      {label}
    </span>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    display: 'block',
    width: '100%',
    height: 28,
    padding: '0 8px',
    border: '1px solid var(--sb-border)',
    borderRadius: 2,
    fontFamily: 'inherit',
    fontSize: 12,
    color: 'var(--sb-text-primary)',
    background: 'var(--sb-bg)',
    outline: 'none',
    boxSizing: 'border-box',
  };
}

function btnPrimaryStyle(disabled = false): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    background: disabled ? 'var(--sb-border)' : 'var(--sb-text-primary)',
    color: disabled ? 'var(--sb-text-tertiary)' : 'var(--sb-bg)',
    border: 'none', borderRadius: 2, padding: '6px 14px',
    fontFamily: MONO, fontSize: 9, letterSpacing: '0.13em',
    textTransform: 'uppercase', fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0,
  };
}

function btnSecondaryStyle(disabled = false): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    background: 'transparent',
    color: disabled ? 'var(--sb-text-tertiary)' : 'var(--sb-text-secondary)',
    border: '1px solid var(--sb-border)', borderRadius: 2, padding: '6px 14px',
    fontFamily: MONO, fontSize: 9, letterSpacing: '0.13em',
    textTransform: 'uppercase', fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0,
  };
}

function btnDestructiveStyle(disabled = false): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    background: disabled ? 'var(--sb-border)' : 'var(--sb-p-crit)',
    color: disabled ? 'var(--sb-text-tertiary)' : '#fff',
    border: 'none', borderRadius: 2, padding: '6px 14px',
    fontFamily: MONO, fontSize: 9, letterSpacing: '0.13em',
    textTransform: 'uppercase', fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0,
  };
}

function btnIconStyle(disabled = false): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 24, height: 24, padding: 0,
    background: 'transparent', border: 'none', borderRadius: 2,
    color: disabled ? 'var(--sb-text-tertiary)' : 'var(--sb-text-secondary)',
    cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0,
  };
}

function SectionDivider() {
  return <div style={{ borderTop: '1px solid var(--sb-border)', margin: '16px 0' }} />;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type TransitionTarget = 'OUT_OF_SERVICE' | 'DECOMMISSIONED' | 'OPERATIONAL';
type PanelTab = 'detail' | 'actions';

interface AssetDetailPanelProps {
  asset: AssetListItem;
  onClose: () => void;
  onEdit: (asset: AssetListItem) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AssetDetailPanel({ asset, onClose, onEdit }: AssetDetailPanelProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<PanelTab>('detail');
  const [transitionTarget, setTransitionTarget] = useState<TransitionTarget | null>(null);
  const [decommissionConfirmed, setDecommissionConfirmed] = useState(false);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  const [certFormOpen, setCertFormOpen] = useState(false);
  const [editingCert, setEditingCert] = useState<AssetCertificate | null>(null);
  const [deletingCertId, setDeletingCertId] = useState<string | null>(null);

  const [docUploadOpen, setDocUploadOpen] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  const { register: registerReason, handleSubmit: handleTransitionSubmit, reset: resetReason } =
    useForm<{ reason: string }>({ defaultValues: { reason: '' } });

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: detail, isLoading, isError } = useQuery({
    queryKey: ['supervisor', 'assets', asset.id, 'detail'],
    queryFn: () => assetsApi.getById(asset.id),
  });

  const certificatesQuery = useQuery({
    queryKey: ['supervisor', 'assets', asset.id, 'certificates'],
    queryFn: () => assetsApi.listCertificates(asset.id),
  });

  const documentsQuery = useQuery({
    queryKey: ['supervisor', 'assets', asset.id, 'documents'],
    queryFn: () => assetsApi.listDocuments(asset.id),
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  function invalidateAsset() {
    void queryClient.invalidateQueries({ queryKey: ['supervisor', 'assets'] });
    void queryClient.invalidateQueries({ queryKey: ['supervisor', 'assets', asset.id] });
  }

  const transitionMutation = useMutation({
    mutationFn: ({ status, reason }: { status: AssetStatus; reason?: string }) =>
      assetsApi.transitionStatus(asset.id, { status, reason: reason || undefined }),
    onSuccess: () => {
      invalidateAsset();
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
    mutationFn: (certId: string) => assetsApi.deleteCertificate(asset.id, certId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supervisor', 'assets', asset.id, 'certificates'] });
      void queryClient.invalidateQueries({ queryKey: ['supervisor', 'assets', asset.id, 'detail'] });
      toast.success(t('supervisorAssets.certificate.toasts.deleteSuccess'));
      setDeletingCertId(null);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t('supervisorAssets.certificate.toasts.deleteError')));
      setDeletingCertId(null);
    },
  });

  const deleteDocMutation = useMutation({
    mutationFn: (docId: string) => assetsApi.deleteDocument(asset.id, docId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supervisor', 'assets', asset.id, 'documents'] });
      toast.success(t('supervisorAssets.document.toasts.deleteSuccess'));
      setDeletingDocId(null);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t('supervisorAssets.document.toasts.deleteError')));
      setDeletingDocId(null);
    },
  });

  const handleDownload = async (entry: AssetCertificate | AssetDocument, kind: 'certificate' | 'document') => {
    const key = `${kind}:${entry.id}`;
    setDownloadingKey(key);
    try {
      const url = kind === 'certificate'
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

  const submitTransition = ({ reason }: { reason: string }) => {
    if (!transitionTarget) return;
    transitionMutation.mutate({ status: AssetStatus[transitionTarget], reason });
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const currentStatus = (detail?.status ?? asset.status) as AssetStatus;
  const isDecommissioned = currentStatus === AssetStatus.DECOMMISSIONED;
  const certificates = certificatesQuery.data ?? detail?.certificates ?? [];
  const documents = documentsQuery.data ?? [];

  const canSetOutOfService = currentStatus !== AssetStatus.OUT_OF_SERVICE && !isDecommissioned;
  const canSetOperational = currentStatus === AssetStatus.OUT_OF_SERVICE;
  const canDecommission = !isDecommissioned;

  const transitionLabels: Record<TransitionTarget, { title: string; description: string }> = {
    OUT_OF_SERVICE: { title: t('supervisorAssets.statusTransition.setOutOfServiceTitle'), description: t('supervisorAssets.statusTransition.setOutOfServiceDescription') },
    DECOMMISSIONED: { title: t('supervisorAssets.statusTransition.decommissionTitle'),    description: t('supervisorAssets.statusTransition.decommissionDescription')    },
    OPERATIONAL:    { title: t('supervisorAssets.statusTransition.setOperationalTitle'),   description: t('supervisorAssets.statusTransition.setOperationalDescription')   },
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

        {/* Panel header */}
        <div
          style={{
            background: 'var(--sb-surface)',
            padding: '12px 16px 10px',
            borderBottom: '1px solid var(--sb-border)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--sb-text-primary)',
                letterSpacing: '-0.01em',
                marginBottom: asset.serialNumber ? 2 : 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {asset.name}
              </div>
              {asset.serialNumber && (
                <Mono size={9} color="var(--sb-text-tertiary)">
                  {asset.serialNumber}
                </Mono>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: '1px solid var(--sb-border)',
                padding: '2px 7px',
                cursor: 'pointer',
                flexShrink: 0,
                marginLeft: 8,
              }}
            >
              <Mono size={8} color="var(--sb-text-tertiary)">✕</Mono>
            </button>
          </div>
          <div style={{ display: 'flex', gap: 5 }}>
            <AssetStatusChip status={currentStatus} label={t(`supervisorAssets.status.${currentStatus}`)} />
          </div>
        </div>

        {/* Sub-tab navigation */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--sb-border)',
            background: 'var(--sb-surface)',
            flexShrink: 0,
          }}
        >
          {(['detail', 'actions'] as PanelTab[]).map((tab) => {
            const labels: Record<PanelTab, string> = { detail: 'DÉTAIL', actions: 'ACTIONS' };
            const isActive = activeTab === tab;
            const isActionsDisabled = tab === 'actions' && isDecommissioned;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => { if (!isActionsDisabled) setActiveTab(tab); }}
                disabled={!!isActionsDisabled}
                style={{
                  padding: '8px 14px', background: 'none', border: 'none',
                  borderBottom: isActive ? '2px solid var(--sb-text-primary)' : '2px solid transparent',
                  cursor: isActionsDisabled ? 'not-allowed' : 'pointer',
                  opacity: isActionsDisabled ? 0.4 : 1,
                  marginBottom: -1,
                }}
              >
                <Mono
                  size={9}
                  color={isActive ? 'var(--sb-text-primary)' : 'var(--sb-text-secondary)'}
                  tracking="0.12em"
                  weight={isActive ? 600 : 500}
                >
                  {labels[tab]}
                </Mono>
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>

          {isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
              <Loader2 style={{ width: 20, height: 20, color: 'var(--sb-text-tertiary)' }} className="animate-spin" />
            </div>
          ) : isError ? (
            <p style={{ fontSize: 13, color: 'var(--sb-p-crit)', textAlign: 'center', padding: '32px 0', margin: 0 }}>
              {t('supervisorAssets.states.detailError')}
            </p>
          ) : detail ? (
            <>
              {/* ── DÉTAIL tab ── */}
              {activeTab === 'detail' && (
                <div>

                  {/* Metadata grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--sb-border)', marginBottom: 16 }}>
                    <div style={{ background: 'var(--sb-bg)', padding: '9px 12px' }}>
                      <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 3 }}>{t('supervisorAssets.detail.category')}</Mono>
                      <span style={{ fontSize: 12, color: 'var(--sb-text-primary)', fontWeight: 500 }}>{detail.category.name}</span>
                    </div>
                    <div style={{ background: 'var(--sb-bg)', padding: '9px 12px' }}>
                      <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 3 }}>{t('supervisorAssets.detail.location')}</Mono>
                      <span style={{ fontSize: 12, color: 'var(--sb-text-primary)', fontWeight: 500 }}>{detail.location.fullPath}</span>
                    </div>
                    <div style={{ background: 'var(--sb-bg)', padding: '9px 12px' }}>
                      <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 3 }}>{t('supervisorAssets.detail.serialNumber')}</Mono>
                      <span style={{ fontSize: 12, color: 'var(--sb-text-primary)', fontWeight: 500 }}>
                        {detail.serialNumber || t('supervisorAssets.detail.noSerialNumber')}
                      </span>
                    </div>
                    <div style={{ background: 'var(--sb-bg)', padding: '9px 12px' }}>
                      <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 3 }}>{t('supervisorAssets.detail.manufacturer')}</Mono>
                      <span style={{ fontSize: 12, color: 'var(--sb-text-primary)', fontWeight: 500 }}>{detail.manufacturer || '—'}</span>
                    </div>
                    <div style={{ background: 'var(--sb-bg)', padding: '9px 12px' }}>
                      <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 3 }}>{t('supervisorAssets.detail.model')}</Mono>
                      <span style={{ fontSize: 12, color: 'var(--sb-text-primary)', fontWeight: 500 }}>{detail.model || '—'}</span>
                    </div>
                    <div style={{ background: 'var(--sb-bg)', padding: '9px 12px' }}>
                      <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 3 }}>{t('supervisorAssets.detail.installationDate')}</Mono>
                      <span style={{ fontSize: 12, color: 'var(--sb-text-primary)', fontWeight: 500, fontFamily: MONO }}>
                        {formatDate(detail.installationDate) === '—' ? t('supervisorAssets.detail.noInstallationDate') : formatDate(detail.installationDate)}
                      </span>
                    </div>
                    <div style={{ background: 'var(--sb-bg)', padding: '9px 12px', gridColumn: 'span 2' }}>
                      <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 3 }}>{t('supervisorAssets.detail.warrantyExpiration')}</Mono>
                      <span style={{ fontSize: 12, color: 'var(--sb-text-primary)', fontWeight: 500, fontFamily: MONO }}>
                        {formatDate(detail.warrantyExpiration) === '—' ? t('supervisorAssets.detail.noWarranty') : formatDate(detail.warrantyExpiration)}
                      </span>
                    </div>
                    {detail.parent && (
                      <div style={{ background: 'var(--sb-bg)', padding: '9px 12px', gridColumn: 'span 2' }}>
                        <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 3 }}>{t('supervisorAssets.detail.parent')}</Mono>
                        <span style={{ fontSize: 12, color: 'var(--sb-text-primary)', fontWeight: 500 }}>{detail.parent.name}</span>
                      </div>
                    )}
                    {detail.description && (
                      <div style={{ background: 'var(--sb-bg)', padding: '9px 12px', gridColumn: 'span 2' }}>
                        <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 3 }}>{t('common.description')}</Mono>
                        <p style={{ fontSize: 12, color: 'var(--sb-text-primary)', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                          {detail.description}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* QR Code */}
                  <div
                    style={{
                      border: '1px solid var(--sb-border)',
                      padding: '10px 12px',
                      background: 'var(--sb-hover)',
                      marginBottom: 16,
                    }}
                  >
                    <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 8 }}>
                      {t('supervisorAssets.detail.qrCode')}
                    </Mono>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <div
                        id={`qr-svg-${detail.id}`}
                        style={{ border: '1px solid var(--sb-border)', padding: 6, background: '#fff', flexShrink: 0 }}
                      >
                        <QRCode value={detail.qrCodeIdentifier} size={80} level="M" style={{ display: 'block' }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 2 }}>
                        <Mono size={9} color="var(--sb-text-secondary)">{detail.qrCodeIdentifier}</Mono>
                        <button
                          type="button"
                          style={btnSecondaryStyle()}
                          onClick={() => {
                            const svgEl = document.querySelector(`#qr-svg-${detail.id} svg`);
                            openQrPrintWindow(
                              { identifier: detail.qrCodeIdentifier, assetName: detail.name },
                              svgEl ? svgEl.outerHTML : '',
                            );
                          }}
                        >
                          <Printer size={11} />
                          {t('supervisorAssets.detail.printQrCode')}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Sub-components */}
                  {detail.children.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <SectionDivider />
                      <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 8 }}>
                        {t('supervisorAssets.detail.children')}
                      </Mono>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {detail.children.map((child) => (
                          <span
                            key={child.id}
                            style={{
                              display: 'inline-block',
                              border: '1px solid var(--sb-border)',
                              borderRadius: 2,
                              padding: '2px 8px',
                              fontSize: 11,
                              color: 'var(--sb-text-secondary)',
                            }}
                          >
                            {child.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Certificates */}
                  <SectionDivider />
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Mono size={8} color="var(--sb-text-tertiary)">{t('supervisorAssets.detail.certificates')}</Mono>
                      {!isDecommissioned && (
                        <button
                          type="button"
                          style={btnSecondaryStyle()}
                          onClick={() => { setEditingCert(null); setCertFormOpen(true); }}
                        >
                          {t('supervisorAssets.certificate.actions.add')}
                        </button>
                      )}
                    </div>

                    {certificatesQuery.isLoading ? (
                      <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
                        <Loader2 style={{ width: 16, height: 16, color: 'var(--sb-text-tertiary)' }} className="animate-spin" />
                      </div>
                    ) : certificates.length === 0 ? (
                      <p style={{ fontSize: 12, color: 'var(--sb-text-tertiary)', margin: 0 }}>
                        {t('supervisorAssets.detail.certificatesEmpty')}
                      </p>
                    ) : (
                      <div style={{ maxHeight: 192, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {certificates.map((cert) => {
                          const certKey = `certificate:${cert.id}`;
                          const isDeleting = deletingCertId === cert.id && deleteCertMutation.isPending;
                          const cs = CERT_STATUS_COLOR[cert.status] ?? { bg: 'var(--sb-surface)', color: 'var(--sb-text-tertiary)' };
                          return (
                            <div
                              key={cert.id}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                                border: '1px solid var(--sb-border)', padding: '7px 10px',
                              }}
                            >
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: 12, color: 'var(--sb-text-primary)', fontWeight: 500, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {cert.certificateType === 'OTHER' && cert.otherType
                                    ? cert.otherType
                                    : t(`supervisorAssets.certificateType.${cert.certificateType}`)}
                                </p>
                                <Mono size={9} color="var(--sb-text-tertiary)">
                                  {cert.issuingAuthority} — {formatDate(cert.expirationDate)}
                                </Mono>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                <span
                                  style={{
                                    display: 'inline-block', background: cs.bg,
                                    border: `1px solid ${cs.color}44`, borderRadius: 2, padding: '2px 7px',
                                  }}
                                >
                                  <Mono size={8} color={cs.color}>{t(`supervisorAssets.certificateStatus.${cert.status}`)}</Mono>
                                </span>
                                {!!cert.documentId && (
                                  <button
                                    type="button"
                                    disabled={downloadingKey === certKey}
                                    style={btnIconStyle(downloadingKey === certKey)}
                                    onClick={() => { void handleDownload(cert, 'certificate'); }}
                                  >
                                    {downloadingKey === certKey
                                      ? <Loader2 size={12} className="animate-spin" />
                                      : <Download size={12} />}
                                  </button>
                                )}
                                {!isDecommissioned && (
                                  <>
                                    <button
                                      type="button"
                                      style={btnIconStyle()}
                                      onClick={() => { setEditingCert(cert); setCertFormOpen(true); }}
                                    >
                                      <Pencil size={12} />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isDeleting}
                                      style={{ ...btnIconStyle(isDeleting), color: isDeleting ? 'var(--sb-text-tertiary)' : 'var(--sb-p-crit)' }}
                                      onClick={() => { setDeletingCertId(cert.id); deleteCertMutation.mutate(cert.id); }}
                                    >
                                      {isDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Documents */}
                  <SectionDivider />
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Mono size={8} color="var(--sb-text-tertiary)">{t('supervisorAssets.detail.documents')}</Mono>
                      {!isDecommissioned && (
                        <button
                          type="button"
                          style={btnSecondaryStyle()}
                          onClick={() => setDocUploadOpen(true)}
                        >
                          <Upload size={11} />
                          {t('supervisorAssets.document.actions.upload')}
                        </button>
                      )}
                    </div>

                    {documentsQuery.isLoading ? (
                      <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
                        <Loader2 style={{ width: 16, height: 16, color: 'var(--sb-text-tertiary)' }} className="animate-spin" />
                      </div>
                    ) : documents.length === 0 ? (
                      <p style={{ fontSize: 12, color: 'var(--sb-text-tertiary)', margin: 0 }}>
                        {t('supervisorAssets.detail.documentsEmpty')}
                      </p>
                    ) : (
                      <div style={{ maxHeight: 144, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {documents.map((doc) => {
                          const docKey = `document:${doc.id}`;
                          const isDeleting = deletingDocId === doc.id && deleteDocMutation.isPending;
                          return (
                            <div
                              key={doc.id}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                                border: '1px solid var(--sb-border)', padding: '7px 10px',
                              }}
                            >
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: 12, color: 'var(--sb-text-primary)', fontWeight: 500, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {doc.fileName}
                                </p>
                                <Mono size={9} color="var(--sb-text-tertiary)">
                                  {t(`supervisorAssets.documentType.${doc.documentType}`)} — {doc.uploadedBy?.name ?? '—'}
                                </Mono>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                <button
                                  type="button"
                                  disabled={downloadingKey === docKey}
                                  style={btnIconStyle(downloadingKey === docKey)}
                                  onClick={() => { void handleDownload(doc, 'document'); }}
                                >
                                  {downloadingKey === docKey
                                    ? <Loader2 size={12} className="animate-spin" />
                                    : <Download size={12} />}
                                </button>
                                {!isDecommissioned && (
                                  <button
                                    type="button"
                                    disabled={isDeleting}
                                    style={{ ...btnIconStyle(isDeleting), color: isDeleting ? 'var(--sb-text-tertiary)' : 'var(--sb-p-crit)' }}
                                    onClick={() => { setDeletingDocId(doc.id); deleteDocMutation.mutate(doc.id); }}
                                  >
                                    {isDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Status history */}
                  <SectionDivider />
                  <div style={{ marginBottom: 16 }}>
                    <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 8 }}>
                      {t('supervisorAssets.detail.statusHistory')}
                    </Mono>
                    {detail.statusLogs.length === 0 ? (
                      <p style={{ fontSize: 12, color: 'var(--sb-text-tertiary)', margin: 0 }}>
                        {t('supervisorAssets.states.historyEmpty')}
                      </p>
                    ) : (
                      <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {detail.statusLogs.map((log) => (
                          <div
                            key={log.id}
                            style={{
                              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
                              border: '1px solid var(--sb-border)', padding: '8px 10px',
                            }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginBottom: log.reason ? 4 : 0 }}>
                                {log.fromStatus && (
                                  <>
                                    <Mono size={9} color="var(--sb-text-secondary)">{t(`supervisorAssets.status.${log.fromStatus}`)}</Mono>
                                    <span style={{ color: 'var(--sb-text-tertiary)', fontSize: 10 }}>→</span>
                                  </>
                                )}
                                <Mono size={9} color="var(--sb-text-primary)" weight={600}>{t(`supervisorAssets.status.${log.toStatus}`)}</Mono>
                              </div>
                              {log.reason && (
                                <p style={{ fontSize: 11, color: 'var(--sb-text-secondary)', margin: 0, lineHeight: 1.5 }}>{log.reason}</p>
                              )}
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <Mono size={9} color="var(--sb-text-secondary)" block>{log.actor?.name ?? '—'}</Mono>
                              <Mono size={9} color="var(--sb-text-tertiary)" block style={{ marginTop: 2 }}>{formatDateTime(log.createdAt)}</Mono>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Edit button */}
                  {!isDecommissioned && (
                    <>
                      <SectionDivider />
                      <button
                        type="button"
                        style={btnSecondaryStyle()}
                        onClick={() => onEdit(asset)}
                      >
                        <Pencil size={11} />
                        {t('supervisorAssets.actions.edit')}
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* ── ACTIONS tab ── */}
              {activeTab === 'actions' && !isDecommissioned && (
                <div>
                  {transitionTarget ? (
                    <form
                      onSubmit={handleTransitionSubmit(submitTransition)}
                      style={{
                        border: '1px solid var(--sb-border)',
                        padding: '12px 14px',
                        background: 'var(--sb-surface)',
                      }}
                    >
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--sb-text-primary)', margin: '0 0 4px' }}>
                        {transitionLabels[transitionTarget].title}
                      </p>
                      <p style={{ fontSize: 12, color: 'var(--sb-text-secondary)', margin: '0 0 12px', lineHeight: 1.6 }}>
                        {transitionLabels[transitionTarget].description}
                      </p>

                      {transitionTarget !== 'OPERATIONAL' && (
                        <div style={{ marginBottom: 12 }}>
                          <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
                            {t('supervisorAssets.statusTransition.reasonLabel')}
                          </Mono>
                          <input
                            type="text"
                            placeholder={t('supervisorAssets.statusTransition.reasonPlaceholder')}
                            maxLength={500}
                            style={inputStyle()}
                            {...registerReason('reason')}
                          />
                        </div>
                      )}

                      {transitionTarget === 'DECOMMISSIONED' && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer', marginBottom: 12 }}>
                          <input
                            type="checkbox"
                            checked={decommissionConfirmed}
                            onChange={(e) => setDecommissionConfirmed(e.target.checked)}
                            style={{ width: 13, height: 13 }}
                          />
                          <span style={{ color: 'var(--sb-p-crit)', fontWeight: 500 }}>
                            {t('supervisorAssets.statusTransition.confirmDecommission')}
                          </span>
                        </label>
                      )}

                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          style={btnSecondaryStyle(transitionMutation.isPending)}
                          disabled={transitionMutation.isPending}
                          onClick={() => { setTransitionTarget(null); resetReason(); setDecommissionConfirmed(false); }}
                        >
                          {t('common.cancel')}
                        </button>
                        <button
                          type="submit"
                          style={transitionTarget === 'DECOMMISSIONED'
                            ? btnDestructiveStyle(transitionMutation.isPending || (transitionTarget === 'DECOMMISSIONED' && !decommissionConfirmed))
                            : btnPrimaryStyle(transitionMutation.isPending)}
                          disabled={transitionMutation.isPending || (transitionTarget === 'DECOMMISSIONED' && !decommissionConfirmed)}
                        >
                          {transitionMutation.isPending && (
                            <Loader2 size={11} className="animate-spin" />
                          )}
                          {t('common.confirm')}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {canSetOperational && (
                        <button
                          type="button"
                          style={btnSecondaryStyle()}
                          onClick={() => setTransitionTarget('OPERATIONAL')}
                        >
                          {t('supervisorAssets.actions.setOperational')}
                        </button>
                      )}
                      {canSetOutOfService && (
                        <button
                          type="button"
                          style={btnSecondaryStyle()}
                          onClick={() => setTransitionTarget('OUT_OF_SERVICE')}
                        >
                          {t('supervisorAssets.actions.setOutOfService')}
                        </button>
                      )}
                      {canDecommission && (
                        <button
                          type="button"
                          style={btnDestructiveStyle()}
                          onClick={() => setTransitionTarget('DECOMMISSIONED')}
                        >
                          <AlertTriangle size={11} />
                          {t('supervisorAssets.actions.decommission')}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>

      <CertificateFormDialog
        open={certFormOpen}
        onOpenChange={setCertFormOpen}
        assetId={asset.id}
        certificate={editingCert}
        onSuccess={() => setEditingCert(null)}
      />
      <DocumentUploadDialog
        open={docUploadOpen}
        onOpenChange={setDocUploadOpen}
        assetId={asset.id}
        onSuccess={() => {}}
      />
    </>
  );
}
