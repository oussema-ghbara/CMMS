'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { z } from 'zod';
import { Loader2, ScanLine, XCircle, MessageSquarePlus, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AssetStatus, UrgencyPerception } from '@gmao/shared';
import { assetsApi, type AssetListItem, type AssetDetail } from '@/lib/assets.api';
import { reportsApi, type ReportDetailItem } from '@/lib/reports.api';
import { useAuthStore } from '@/store/auth.store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mono } from '@/components/ui/mono';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { TableLoading } from '@/components/ui/table-loading';
import { TableEmpty } from '@/components/ui/table-empty';
import { TableError } from '@/components/ui/table-error';
import { StatusPill } from '@/components/ui/status-pill';
import { MasterDetail } from '@/components/ui/master-detail';
import { FormField } from '@/components/ui/form-field';
import { SubmitButton } from '@/components/ui/submit-button';

const REPORT_PAGE_LIMIT = 12;

const reportSchema = z.object({
  assetId: z.string().min(1, 'Sélectionnez un actif'),
  description: z.string().trim().min(10, 'La description doit contenir au moins 10 caractères').max(4000),
  urgencyPerception: z.nativeEnum(UrgencyPerception),
  submittedDespiteWarning: z.boolean().default(false),
});

type ReportFormValues = z.infer<typeof reportSchema>;
type SearchResultAsset = AssetListItem;

function getErrorMessage(error: unknown, fallback: string): string {
  const axiosError = error as AxiosError<{ message?: string | string[] }>;
  const rawMessage = axiosError.response?.data?.message;
  if (Array.isArray(rawMessage) && rawMessage.length > 0) return rawMessage[0] ?? fallback;
  if (typeof rawMessage === 'string' && rawMessage.trim()) return rawMessage;
  return fallback;
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

function normalizeSearch(text: string) {
  return text.trim();
}

function urgencyLabel(urgency: UrgencyPerception) {
  switch (urgency) {
    case UrgencyPerception.MACHINE_STOPPED:
      return 'Machine arrêtée';
    case UrgencyPerception.ABNORMAL_BEHAVIOR:
      return 'Comportement anormal';
    case UrgencyPerception.MINOR_ISSUE:
      return 'Problème mineur';
  }
}

const textareaStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  minHeight: 120,
  padding: '10px 12px',
  border: '1px solid var(--sb-border)',
  borderRadius: 6,
  background: 'var(--sb-bg)',
  color: 'var(--sb-text-primary)',
  fontFamily: 'inherit',
  fontSize: 14,
  lineHeight: 1.6,
  resize: 'vertical',
  outline: 'none',
  boxSizing: 'border-box',
};

export function RequesterReportsBoard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [searchText, setSearchText] = useState('');
  const [qrText, setQrText] = useState('');
  const [selectedAsset, setSelectedAsset] = useState<SearchResultAsset | AssetDetail | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [commentText, setCommentText] = useState('');

  const form = useForm<ReportFormValues>({
    resolver: zodResolver(reportSchema),
    defaultValues: {
      assetId: '',
      description: '',
      urgencyPerception: UrgencyPerception.MINOR_ISSUE,
      submittedDespiteWarning: false,
    },
    mode: 'onSubmit',
  });

  const reportQuery = useQuery({
    queryKey: ['requester', 'reports', user?.id, page],
    queryFn: () => reportsApi.list({ reporterId: user?.id, page, limit: REPORT_PAGE_LIMIT }),
    enabled: !!user?.id,
  });

  const detailQuery = useQuery({
    queryKey: ['requester', 'report', selectedReportId],
    queryFn: () => reportsApi.getOne(selectedReportId as string),
    enabled: !!selectedReportId,
  });

  const assetSearchQuery = useQuery({
    queryKey: ['requester', 'asset-search', searchText],
    queryFn: () => assetsApi.list({ search: normalizeSearch(searchText), limit: 8 }),
    enabled: normalizeSearch(searchText).length >= 2,
  });

  const qrLookupQuery = useMutation({
    mutationFn: (qrCode: string) => assetsApi.lookupByQrCode(qrCode),
    onSuccess: (asset) => {
      setSelectedAsset(asset);
      form.setValue('assetId', asset.id, { shouldValidate: true });
    },
  });

  const submitMutation = useMutation({
    mutationFn: (payload: ReportFormValues) =>
      reportsApi.submit({
        assetId: payload.assetId,
        description: payload.description,
        urgencyPerception: payload.urgencyPerception,
        submittedDespiteWarning: payload.submittedDespiteWarning,
      }),
    onSuccess: () => {
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ['requester', 'reports', user?.id] });
      setPage(1);
      form.reset({
        assetId: '',
        description: '',
        urgencyPerception: UrgencyPerception.MINOR_ISSUE,
        submittedDespiteWarning: false,
      });
      setSelectedAsset(null);
      setSearchText('');
      setQrText('');
    },
  });

  const commentMutation = useMutation({
    mutationFn: (content: string) => reportsApi.addComment(selectedReportId as string, { content }),
    onSuccess: () => {
      setCommentText('');
      queryClient.invalidateQueries({ queryKey: ['requester', 'report', selectedReportId] });
    },
  });

  const reports = reportQuery.data?.data ?? [];
  const totalReports = reportQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalReports / REPORT_PAGE_LIMIT));
  const detail = detailQuery.data as ReportDetailItem | undefined;
  const selectedAssetDisplay = selectedAsset as SearchResultAsset | AssetDetail | null;
  const assetSearchResults = assetSearchQuery.data?.data ?? [];
  const assetSearchError = assetSearchQuery.isError ? getErrorMessage(assetSearchQuery.error, 'Impossible de rechercher les actifs') : null;

  const assetSelectionMessage = useMemo(() => {
    if (!selectedAssetDisplay) return t('requester.submit.assetState.selectHint');
    if (selectedAssetDisplay.status === AssetStatus.DECOMMISSIONED) return t('requester.submit.assetState.decommissioned');
    if (selectedAssetDisplay.status === AssetStatus.IN_MAINTENANCE) return t('requester.submit.assetState.maintenance');
    if (selectedAssetDisplay.status === AssetStatus.OUT_OF_SERVICE) return t('requester.submit.assetState.activeWo');
    return null;
  }, [selectedAssetDisplay, t]);

  const duplicateWorkOrders = detail?.asset.workOrders ?? [];
  const duplicateBannerVisible = duplicateWorkOrders.length > 0;

  const panel = detail ? (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ padding: 16, borderBottom: '1px solid var(--sb-border)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <Mono size={10} color="var(--sb-text-tertiary)" tracking="0.18em">
              {detail.referenceNumber}
            </Mono>
            <h2 style={{ margin: '6px 0 4px', fontSize: 20, lineHeight: 1.15 }}>{t('requester.reports.detail.title')}</h2>
            <p style={{ margin: 0, color: 'var(--sb-text-secondary)', lineHeight: 1.5 }}>{detail.description}</p>
          </div>
          <button type="button" onClick={() => setSelectedReportId(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--sb-text-secondary)' }}>
            <XCircle size={18} />
          </button>
        </div>
      </div>

      <div style={{ overflow: 'auto', padding: 16, display: 'grid', gap: 14 }}>
        <Card>
          <CardHeader>
            <CardTitle>{t('requester.reports.detail.summary')}</CardTitle>
            <CardDescription>{t('requester.reports.detail.status')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span>{t('requester.reports.detail.asset')}</span>
                <span>{detail.asset.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span>{t('requester.reports.detail.reporter')}</span>
                <span>{detail.reporter.name}</span>
              </div>
              {detail.processedBy && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span>{t('requester.reports.detail.processedBy')}</span>
                  <span>{detail.processedBy.name}</span>
                </div>
              )}
              {detail.processedAt && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span>{t('requester.reports.detail.processedAt')}</span>
                  <span>{formatDateTime(detail.processedAt)}</span>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span>{t('requester.reports.columns.status')}</span>
                <StatusPill status={detail.status} />
              </div>
            </div>
          </CardContent>
        </Card>

        {duplicateBannerVisible && (
          <Card>
            <CardHeader>
              <CardTitle>{t('requester.reports.detail.duplicateBanner')}</CardTitle>
              <CardDescription>{detail.asset.location.fullPath}</CardDescription>
            </CardHeader>
            <CardContent>
              <div style={{ display: 'grid', gap: 8 }}>
                {duplicateWorkOrders.map((workOrder) => (
                  <div key={workOrder.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <span>{workOrder.referenceNumber}</span>
                    <StatusPill status={workOrder.status} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{t('requester.reports.detail.comments')}</CardTitle>
            <CardDescription>{t('requester.reports.detail.commentsDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div style={{ display: 'grid', gap: 10 }}>
              {detail.comments.length === 0 ? (
                <TableEmpty label={t('requester.reports.states.commentsEmpty')} />
              ) : (
                detail.comments.map((comment) => (
                  <div key={comment.id} style={{ border: '1px solid var(--sb-border)', borderRadius: 6, padding: 12, background: 'var(--sb-surface)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <strong>{comment.author.name}</strong>
                      <Mono size={9} color="var(--sb-text-tertiary)">{formatDateTime(comment.createdAt)}</Mono>
                    </div>
                    <p style={{ margin: '8px 0 0', lineHeight: 1.5 }}>{comment.content}</p>
                  </div>
                ))
              )}
            </div>
            <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
              <textarea
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                placeholder={t('requester.reports.detail.commentPlaceholder')}
                rows={4}
                style={textareaStyle}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  type="button"
                  onClick={() => commentMutation.mutate(commentText.trim())}
                  disabled={!commentText.trim() || commentMutation.isPending}
                >
                  {commentMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <MessageSquarePlus size={14} />}
                  {t('requester.reports.detail.commentSubmit')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  ) : null;

  return (
    <MasterDetail
      panelOpen={!!selectedReportId}
      panel={panel}
      list={
        <div style={{ height: '100%', minHeight: 0, overflow: 'auto', padding: 24 }}>
          <div style={{ display: 'grid', gap: 14, marginBottom: 20 }}>
            <div>
              <Mono size={10} color="var(--sb-text-tertiary)" tracking="0.18em">{t('roles.REQUESTER')}</Mono>
              <h1 style={{ margin: '8px 0 6px', fontSize: 28, lineHeight: 1.1, fontWeight: 700 }}>{t('requester.reports.title')}</h1>
              <p style={{ margin: 0, color: 'var(--sb-text-secondary)', maxWidth: 820, lineHeight: 1.6 }}>{t('requester.reports.subtitle')}</p>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>{t('requester.submit.title')}</CardTitle>
                <CardDescription>{t('requester.submit.subtitle')}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={form.handleSubmit((values) => submitMutation.mutate(values))}>
                  <div style={{ display: 'grid', gap: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10 }}>
                      <FormField label={t('requester.submit.searchLabel')} htmlFor="requester-asset-search">
                        <Input id="requester-asset-search" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder={t('requester.submit.searchPlaceholder')} />
                      </FormField>
                      <FormField label={t('requester.submit.qrLabel')} htmlFor="requester-asset-qr">
                        <Input id="requester-asset-qr" value={qrText} onChange={(event) => setQrText(event.target.value)} placeholder={t('requester.submit.qrPlaceholder')} />
                      </FormField>
                      <div style={{ display: 'flex', alignItems: 'end', gap: 8 }}>
                        <Button type="button" onClick={() => { const qr = qrText.trim(); if (!qr) return; qrLookupQuery.mutate(qr); }} disabled={qrLookupQuery.isPending || !qrText.trim()} variant="secondary">
                          <ScanLine size={14} />
                          {t('requester.submit.lookup')}
                        </Button>
                      </div>
                    </div>

                    {normalizeSearch(searchText).length >= 2 && (
                      <div style={{ border: '1px solid var(--sb-border)', borderRadius: 6, padding: 12, background: 'var(--sb-surface)' }}>
                        {assetSearchQuery.isLoading ? (
                          <TableLoading height={100} label={t('common.loading')} />
                        ) : assetSearchError ? (
                          <TableError label={assetSearchError} />
                        ) : assetSearchResults.length === 0 ? (
                          <TableEmpty label={t('requester.submit.assetState.notFound')} />
                        ) : (
                          <div style={{ display: 'grid', gap: 8 }}>
                            {assetSearchResults.map((asset) => (
                              <button
                                type="button"
                                key={asset.id}
                                onClick={() => {
                                  setSelectedAsset(asset);
                                  form.setValue('assetId', asset.id, { shouldValidate: true });
                                }}
                                style={{
                                  border: '1px solid var(--sb-border)',
                                  borderRadius: 6,
                                  padding: 10,
                                  background: selectedAsset?.id === asset.id ? 'var(--sb-s-active-bg)' : 'var(--sb-bg)',
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                                  <strong>{asset.name}</strong>
                                  <Badge variant="outline">{asset.status}</Badge>
                                </div>
                                <p style={{ margin: '6px 0 0', color: 'var(--sb-text-secondary)' }}>{asset.location.fullPath}</p>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, border: '1px solid var(--sb-border)', borderRadius: 6, padding: 12 }}>
                      <div>
                        <Mono size={9} color="var(--sb-text-tertiary)" tracking="0.14em">{t('requester.submit.selectedAsset')}</Mono>
                        <p style={{ margin: '6px 0 0', color: 'var(--sb-text-primary)' }}>
                          {selectedAssetDisplay ? `${selectedAssetDisplay.name} — ${selectedAssetDisplay.location.fullPath}` : t('requester.submit.assetState.selectHint')}
                        </p>
                        {assetSelectionMessage && <p style={{ margin: '6px 0 0', color: 'var(--sb-p-high)' }}>{assetSelectionMessage}</p>}
                      </div>
                      <Button type="button" variant="ghost" onClick={() => { setSelectedAsset(null); form.setValue('assetId', '', { shouldValidate: true }); }} disabled={!selectedAsset}>
                        {t('requester.submit.clearAsset')}
                      </Button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 14 }}>
                      <FormField label={t('requester.submit.descriptionLabel')} htmlFor="requester-report-description" required>
                        <textarea
                          id="requester-report-description"
                          {...form.register('description')}
                          placeholder={t('requester.submit.descriptionPlaceholder')}
                          rows={6}
                          style={textareaStyle}
                        />
                      </FormField>
                      <FormField label={t('requester.submit.urgencyLabel')} htmlFor="requester-report-urgency" required>
                        <select
                          id="requester-report-urgency"
                          {...form.register('urgencyPerception')}
                          style={{ display: 'block', width: '100%', height: 40, padding: '0 8px', border: '1px solid var(--sb-border)', borderRadius: 6, background: 'var(--sb-bg)' }}
                        >
                          {Object.values(UrgencyPerception).map((urgency) => <option key={urgency} value={urgency}>{urgencyLabel(urgency)}</option>)}
                        </select>
                      </FormField>
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <input type="checkbox" {...form.register('submittedDespiteWarning')} />
                      {t('requester.submit.duplicateWarning')}
                    </label>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {submitted && <Badge variant="success">{t('requester.submit.success')}</Badge>}
                        {duplicateBannerVisible && <Badge variant="warning">{t('requester.submit.duplicateWarning')}</Badge>}
                      </div>
                      <SubmitButton isPending={submitMutation.isPending} isSuccess={submitted} disabled={!selectedAsset || !form.formState.isValid}>
                        {t('requester.submit.submit')}
                      </SubmitButton>
                    </div>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>

          <div style={{ display: 'grid', gap: 14 }}>
            <Card>
              <CardHeader>
                <CardTitle>{t('requester.reports.title')}</CardTitle>
                <CardDescription>{t('requester.reports.subtitle')}</CardDescription>
              </CardHeader>
              <CardContent>
                {reportQuery.isLoading ? (
                  <TableLoading height={180} label={t('requester.reports.states.loading')} />
                ) : reportQuery.isError ? (
                  <TableError label={t('requester.reports.states.error')} />
                ) : reports.length === 0 ? (
                  <TableEmpty label={t('requester.reports.states.empty')} />
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {reports.map((report) => (
                      <button
                        type="button"
                        key={report.id}
                        onClick={() => setSelectedReportId(report.id)}
                        style={{
                          border: '1px solid var(--sb-border)',
                          borderRadius: 6,
                          padding: 12,
                          background: selectedReportId === report.id ? 'var(--sb-s-active-bg)' : 'var(--sb-bg)',
                          textAlign: 'left',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                              <Mono size={10} color="var(--sb-text-secondary)" tracking="0.12em">{report.referenceNumber}</Mono>
                              <StatusPill status={report.status} />
                            </div>
                            <p style={{ margin: '8px 0 0', color: 'var(--sb-text-primary)', fontWeight: 600 }}>{report.asset.name}</p>
                            <p style={{ margin: '4px 0 0', color: 'var(--sb-text-secondary)', lineHeight: 1.45 }}>{report.description}</p>
                          </div>
                          <div style={{ textAlign: 'right', color: 'var(--sb-text-tertiary)', fontSize: 12, flexShrink: 0 }}>
                            <div>{formatDateTime(report.createdAt)}</div>
                            <div style={{ marginTop: 6 }}>{urgencyLabel(report.urgencyPerception)}</div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
                  <PaginationControls page={page} totalPages={totalPages} onPrevious={() => setPage((current) => Math.max(1, current - 1))} onNext={() => setPage((current) => Math.min(totalPages, current + 1))} />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      }
    />
  );
}
