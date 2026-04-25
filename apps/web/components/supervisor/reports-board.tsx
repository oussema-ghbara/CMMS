'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AxiosError } from 'axios';
import {
  AlertTriangle,
  Archive,
  ArrowRightLeft,
  Clock3,
  Eye,
  History,
  Loader2,
  MessageSquare,
  PlusCircle,
  Search,
  Send,
  ShieldAlert,
  Undo2,
} from 'lucide-react';
import {
  ProblemReportStatus,
  ReportArchiveReason,
  ReportRejectionReason,
  UrgencyPerception,
  WorkOrderPriority,
  WorkOrderStatus,
} from '@gmao/shared';
import { reportsApi, type ReportDetailItem, type ReportListItem, type ReportAssetActiveWO, type ReportAssetCertAlert, type ReportAssetInterventionHistoryItem } from '@/lib/reports.api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTranslation } from 'react-i18next';

const LIMIT = 10;

const STATUS_OPTIONS = [
  ProblemReportStatus.PENDING,
  ProblemReportStatus.CONVERTED,
  ProblemReportStatus.REJECTED,
  ProblemReportStatus.DEFERRED,
  ProblemReportStatus.ARCHIVED,
] as const;

const URGENCY_OPTIONS = [
  UrgencyPerception.MACHINE_STOPPED,
  UrgencyPerception.ABNORMAL_BEHAVIOR,
  UrgencyPerception.MINOR_ISSUE,
] as const;

const PRIORITY_OPTIONS = [
  WorkOrderPriority.CRITICAL,
  WorkOrderPriority.HIGH,
  WorkOrderPriority.MEDIUM,
  WorkOrderPriority.LOW,
] as const;

const REJECTION_REASON_OPTIONS = [
  ReportRejectionReason.INVALID_REPORT,
  ReportRejectionReason.UNSUPPORTED_EQUIPMENT,
  ReportRejectionReason.ALREADY_ADDRESSED,
  ReportRejectionReason.DUPLICATE_EXISTING_WO,
  ReportRejectionReason.OUT_OF_MAINTENANCE_SCOPE,
] as const;

const ARCHIVE_REASON_OPTIONS = [
  ReportArchiveReason.RESOLVED_SPONTANEOUSLY,
  ReportArchiveReason.EQUIPMENT_DECOMMISSIONED,
  ReportArchiveReason.SUBMITTED_IN_ERROR,
  ReportArchiveReason.REPLACED_BY_OTHER_WO,
  ReportArchiveReason.MANAGEMENT_DECISION,
] as const;

function getErrorMessage(error: unknown, fallback: string) {
  const axiosError = error as AxiosError<{ message?: string | string[] }>;
  const rawMessage = axiosError.response?.data?.message;
  if (Array.isArray(rawMessage) && rawMessage.length > 0) return rawMessage[0] ?? fallback;
  if (typeof rawMessage === 'string' && rawMessage.trim()) return rawMessage;
  return fallback;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function getStatusVariant(status: ProblemReportStatus) {
  switch (status) {
    case ProblemReportStatus.PENDING:
      return 'warning';
    case ProblemReportStatus.CONVERTED:
      return 'success';
    case ProblemReportStatus.REJECTED:
      return 'destructive';
    case ProblemReportStatus.DEFERRED:
      return 'secondary';
    case ProblemReportStatus.ARCHIVED:
      return 'outline';
  }
}

function getUrgencyVariant(urgency: UrgencyPerception) {
  switch (urgency) {
    case UrgencyPerception.MACHINE_STOPPED:
      return 'destructive';
    case UrgencyPerception.ABNORMAL_BEHAVIOR:
      return 'warning';
    case UrgencyPerception.MINOR_ISSUE:
      return 'secondary';
  }
}

function getWorkOrderStatusVariant(status: WorkOrderStatus) {
  switch (status) {
    case WorkOrderStatus.DRAFT:
    case WorkOrderStatus.OPEN:
      return 'secondary';
    case WorkOrderStatus.ASSIGNED:
    case WorkOrderStatus.IN_PROGRESS:
      return 'warning';
    case WorkOrderStatus.ON_HOLD:
      return 'outline';
    case WorkOrderStatus.PENDING_VALIDATION:
      return 'warning';
    case WorkOrderStatus.CLOSED:
      return 'success';
    case WorkOrderStatus.CANCELLED:
      return 'destructive';
  }
}

/** Returns aging info for a DEFERRED report based on elapsed time since deferral. */
function getDeferredAgingTier(
  deferredAt: string | null,
): { label: string; variant: 'warning' | 'destructive' } | null {
  if (!deferredAt) return null;
  const elapsedHours =
    (Date.now() - new Date(deferredAt).getTime()) / (1000 * 60 * 60);
  if (elapsedHours >= 336) return { label: 'tier14d', variant: 'destructive' };
  if (elapsedHours >= 168) return { label: 'tier7d', variant: 'warning' };
  if (elapsedHours >= 48) return { label: 'tier48h', variant: 'warning' };
  return null;
}

function FieldValue({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-foreground">{children}</p>;
}

function ActionCard({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-dashed">
      <CardHeader className="space-y-2 pb-4">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-muted p-2 text-muted-foreground">
            <Icon className="h-4 w-4" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

export function ReportsBoard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ProblemReportStatus | ''>('');
  const [urgency, setUrgency] = useState<UrgencyPerception | ''>('');
  const [page, setPage] = useState(1);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [commentContent, setCommentContent] = useState('');
  const [convertPriority, setConvertPriority] = useState<WorkOrderPriority>(WorkOrderPriority.MEDIUM);
  const [convertDescription, setConvertDescription] = useState('');
  const [convertInternalNotes, setConvertInternalNotes] = useState('');
  const [convertEstimatedDuration, setConvertEstimatedDuration] = useState('');
  const [convertDueDate, setConvertDueDate] = useState('');
  const [rejectReason, setRejectReason] = useState<ReportRejectionReason>(ReportRejectionReason.INVALID_REPORT);
  const [rejectDetail, setRejectDetail] = useState('');
  const [deferNote, setDeferNote] = useState('');
  const [archiveReason, setArchiveReason] = useState<ReportArchiveReason>(ReportArchiveReason.MANAGEMENT_DECISION);

  const queryParams = {
    page,
    limit: LIMIT,
    ...(search ? { search } : {}),
    ...(status ? { status } : {}),
    ...(urgency ? { urgencyPerception: urgency } : {}),
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ['supervisor', 'reports', page, search, status, urgency],
    queryFn: () => reportsApi.list(queryParams),
  });

  const selectedReportSummary = data?.data.find((report) => report.id === selectedReportId) ?? null;

  const detailQuery = useQuery({
    queryKey: ['supervisor', 'reports', selectedReportId],
    queryFn: () => reportsApi.getOne(selectedReportId!),
    enabled: !!selectedReportId,
  });

  const selectedReport = (detailQuery.data ?? selectedReportSummary) as ReportDetailItem | ReportListItem | null;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;
  const isDetailOpen = !!selectedReportId;
  const reportDetail = detailQuery.data;

  useEffect(() => {
    if (!selectedReport) return;
    setCommentContent('');
    setConvertPriority(WorkOrderPriority.MEDIUM);
    setConvertDescription(selectedReport.description);
    setConvertInternalNotes('');
    setConvertEstimatedDuration('');
    setConvertDueDate('');
    setRejectReason(ReportRejectionReason.INVALID_REPORT);
    setRejectDetail('');
    setDeferNote('');
    setArchiveReason(ReportArchiveReason.MANAGEMENT_DECISION);
  }, [selectedReportId, selectedReport?.description]);

  const invalidateReports = () => {
    void queryClient.invalidateQueries({ queryKey: ['supervisor', 'reports'] });
  };

  const commentMutation = useMutation({
    mutationFn: (payload: { reportId: string; content: string }) =>
      reportsApi.addComment(payload.reportId, { content: payload.content }),
    onSuccess: (_, variables) => {
      toast.success(t('supervisorReports.toasts.commentAdded'));
      setCommentContent('');
      void queryClient.invalidateQueries({ queryKey: ['supervisor', 'reports', variables.reportId] });
      invalidateReports();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t('supervisorReports.toasts.commentAddError')));
    },
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (payload: { reportId: string; commentId: string }) =>
      reportsApi.acknowledgeComment(payload.reportId, payload.commentId),
    onSuccess: (_, variables) => {
      toast.success(t('supervisorReports.toasts.commentAcknowledged'));
      void queryClient.invalidateQueries({ queryKey: ['supervisor', 'reports', variables.reportId] });
      invalidateReports();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t('supervisorReports.toasts.commentAcknowledgeError')));
    },
  });

  const convertMutation = useMutation({
    mutationFn: (payload: { reportId: string; body: Parameters<typeof reportsApi.convert>[1] }) =>
      reportsApi.convert(payload.reportId, payload.body),
    onSuccess: (_, variables) => {
      toast.success(t('supervisorReports.toasts.convertSuccess'));
      void queryClient.invalidateQueries({ queryKey: ['supervisor', 'reports', variables.reportId] });
      invalidateReports();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t('supervisorReports.toasts.convertError')));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (payload: { reportId: string; body: Parameters<typeof reportsApi.reject>[1] }) =>
      reportsApi.reject(payload.reportId, payload.body),
    onSuccess: (_, variables) => {
      toast.success(t('supervisorReports.toasts.rejectSuccess'));
      void queryClient.invalidateQueries({ queryKey: ['supervisor', 'reports', variables.reportId] });
      invalidateReports();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t('supervisorReports.toasts.rejectError')));
    },
  });

  const deferMutation = useMutation({
    mutationFn: (payload: { reportId: string; body: Parameters<typeof reportsApi.defer>[1] }) =>
      reportsApi.defer(payload.reportId, payload.body),
    onSuccess: (_, variables) => {
      toast.success(t('supervisorReports.toasts.deferSuccess'));
      void queryClient.invalidateQueries({ queryKey: ['supervisor', 'reports', variables.reportId] });
      invalidateReports();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t('supervisorReports.toasts.deferError')));
    },
  });

  const reopenMutation = useMutation({
    mutationFn: (reportId: string) => reportsApi.reopen(reportId),
    onSuccess: (_, reportId) => {
      toast.success(t('supervisorReports.toasts.reopenSuccess'));
      void queryClient.invalidateQueries({ queryKey: ['supervisor', 'reports', reportId] });
      invalidateReports();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t('supervisorReports.toasts.reopenError')));
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (payload: { reportId: string; body: Parameters<typeof reportsApi.archive>[1] }) =>
      reportsApi.archive(payload.reportId, payload.body),
    onSuccess: (_, variables) => {
      toast.success(t('supervisorReports.toasts.archiveSuccess'));
      void queryClient.invalidateQueries({ queryKey: ['supervisor', 'reports', variables.reportId] });
      invalidateReports();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t('supervisorReports.toasts.archiveError')));
    },
  });

  const handleApplyFilters = () => {
    setSearch(searchInput.trim());
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearchInput('');
    setSearch('');
    setStatus('');
    setUrgency('');
    setPage(1);
  };

  const handleOpenReport = (reportId: string) => {
    setSelectedReportId(reportId);
  };

  const handleCloseDetail = (open: boolean) => {
    if (!open) {
      setSelectedReportId(null);
    }
  };

  const handleCommentSubmit = () => {
    if (!selectedReportId) return;
    const content = commentContent.trim();
    if (!content) {
      toast.error(t('supervisorReports.validation.commentRequired'));
      return;
    }
    commentMutation.mutate({ reportId: selectedReportId, content });
  };

  const handleConvert = () => {
    if (!selectedReportId) return;
    const description = convertDescription.trim();
    if (!description) {
      toast.error(t('supervisorReports.validation.convertDescriptionRequired'));
      return;
    }

    const payload: Parameters<typeof reportsApi.convert>[1] = {
      priority: convertPriority,
      description,
      internalNotes: convertInternalNotes.trim() || undefined,
      estimatedDurationMinutes: convertEstimatedDuration.trim() ? Number(convertEstimatedDuration.trim()) : undefined,
      dueDate: convertDueDate || undefined,
    };

    if (
      payload.estimatedDurationMinutes !== undefined &&
      (!Number.isInteger(payload.estimatedDurationMinutes) || payload.estimatedDurationMinutes <= 0)
    ) {
      toast.error(t('supervisorReports.validation.estimatedDurationInvalid'));
      return;
    }

    convertMutation.mutate({ reportId: selectedReportId, body: payload });
  };

  const handleReject = () => {
    if (!selectedReportId) return;
    rejectMutation.mutate({
      reportId: selectedReportId,
      body: {
        reason: rejectReason,
        detail: rejectDetail.trim() || undefined,
      },
    });
  };

  const handleDefer = () => {
    if (!selectedReportId) return;
    deferMutation.mutate({
      reportId: selectedReportId,
      body: { note: deferNote.trim() || undefined },
    });
  };

  const handleArchive = () => {
    if (!selectedReportId) return;
    archiveMutation.mutate({
      reportId: selectedReportId,
      body: { archiveReason },
    });
  };

  const isActionPending =
    commentMutation.isPending ||
    acknowledgeMutation.isPending ||
    convertMutation.isPending ||
    rejectMutation.isPending ||
    deferMutation.isPending ||
    reopenMutation.isPending ||
    archiveMutation.isPending;

  return (
    <>
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid gap-1">
              <CardTitle>{t('supervisorReports.title')}</CardTitle>
              <CardDescription>{t('supervisorReports.subtitle')}</CardDescription>
            </div>
            <div className="flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
              <ShieldAlert className="h-3.5 w-3.5" />
              <span>{t('supervisorReports.total', { count: data?.total ?? 0 })}</span>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1.5fr_0.8fr_0.8fr_auto_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleApplyFilters();
                  }
                }}
                placeholder={t('supervisorReports.filters.searchPlaceholder')}
                className="pl-9"
              />
            </div>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as ProblemReportStatus | '');
                setPage(1);
              }}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">{t('supervisorReports.filters.allStatuses')}</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {t(`supervisorReports.status.${option}`)}
                </option>
              ))}
            </select>
            <select
              value={urgency}
              onChange={(event) => {
                setUrgency(event.target.value as UrgencyPerception | '');
                setPage(1);
              }}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">{t('supervisorReports.filters.allUrgencies')}</option>
              {URGENCY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {t(`supervisorReports.urgency.${option}`)}
                </option>
              ))}
            </select>
            <Button type="button" onClick={handleApplyFilters} variant="outline">
              {t('supervisorReports.filters.apply')}
            </Button>
            <Button type="button" onClick={handleResetFilters} variant="ghost">
              {t('supervisorReports.filters.reset')}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('supervisorReports.columns.createdAt')}</TableHead>
                  <TableHead>{t('supervisorReports.columns.reference')}</TableHead>
                  <TableHead>{t('supervisorReports.columns.asset')}</TableHead>
                  <TableHead>{t('supervisorReports.columns.reporter')}</TableHead>
                  <TableHead>{t('supervisorReports.columns.urgency')}</TableHead>
                  <TableHead>{t('supervisorReports.columns.status')}</TableHead>
                  <TableHead>{t('supervisorReports.columns.workOrder')}</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-28 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : isError ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-28 text-center text-muted-foreground">
                      {t('supervisorReports.states.error')}
                    </TableCell>
                  </TableRow>
                ) : data?.data.length ? (
                  data.data.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDateTime(report.createdAt)}
                      </TableCell>
                      <TableCell className="font-medium">{report.referenceNumber}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium">{report.asset.name}</p>
                          <p className="text-xs text-muted-foreground">{report.asset.location.fullPath}</p>
                        </div>
                      </TableCell>
                      <TableCell>{report.reporter.name}</TableCell>
                      <TableCell>
                        <Badge variant={getUrgencyVariant(report.urgencyPerception)}>
                          {t(`supervisorReports.urgency.${report.urgencyPerception}`)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <Badge variant={getStatusVariant(report.status)}>
                            {t(`supervisorReports.status.${report.status}`)}
                          </Badge>
                          {report.status === ProblemReportStatus.DEFERRED &&
                            (() => {
                              const aging = getDeferredAgingTier(report.deferredAt);
                              return aging ? (
                                <Badge
                                  variant={aging.variant}
                                  className="text-[10px] px-1.5 py-0"
                                  title={t('supervisorReports.aging.deferredFor', {
                                    duration: report.deferredAt
                                      ? (() => {
                                          const h = Math.floor(
                                            (Date.now() - new Date(report.deferredAt).getTime()) /
                                              (1000 * 60 * 60),
                                          );
                                          return h >= 24
                                            ? t('supervisorReports.aging.days_other', {
                                                count: Math.floor(h / 24),
                                              })
                                            : t('supervisorReports.aging.hours_other', {
                                                count: h,
                                              });
                                        })()
                                      : '',
                                  })}
                                >
                                  {t(`supervisorReports.aging.${aging.label}`)}
                                </Badge>
                              ) : null;
                            })()}
                        </div>
                      </TableCell>
                      <TableCell>
                        {report.replacedByWorkOrderRef ? (
                          <Badge variant="secondary">{report.replacedByWorkOrderRef}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button type="button" variant="ghost" size="sm" onClick={() => handleOpenReport(report.id)}>
                          <Eye className="h-4 w-4" />
                          {t('supervisorReports.actions.view')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="h-28 text-center text-muted-foreground">
                      {t('supervisorReports.states.empty')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <PaginationControls
            page={page}
            totalPages={totalPages}
            onPrevious={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
          />
        </CardContent>
      </Card>

      <Dialog open={isDetailOpen} onOpenChange={handleCloseDetail}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t('supervisorReports.detail.title')}
              {selectedReport ? ` · ${selectedReport.referenceNumber}` : ''}
            </DialogTitle>
            <DialogDescription>
              {selectedReport ? t(`supervisorReports.status.${selectedReport.status}`) : t('supervisorReports.states.detailLoading')}
            </DialogDescription>
          </DialogHeader>

          {!reportDetail || detailQuery.isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : detailQuery.isError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {t('supervisorReports.states.detailError')}
            </div>
          ) : (
            (() => {
              const report = reportDetail;
              if (!report) return null;

              return (
            <div className="space-y-6">

              {/* §9.1: Duplicate active WO banner — shown when the asset already has active WOs */}
              {(report as ReportDetailItem).asset?.workOrders?.length > 0 && (
                <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950/30">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="space-y-1.5">
                    <p className="font-medium text-amber-800 dark:text-amber-300">
                      {t('supervisorReports.detail.duplicateWoBannerTitle')}
                    </p>
                    <ul className="space-y-0.5 text-xs text-amber-700 dark:text-amber-400">
                      {(report as ReportDetailItem).asset.workOrders.map((wo: ReportAssetActiveWO) => (
                        <li key={wo.id} className="flex items-center gap-2">
                          <Badge
                            variant={getWorkOrderStatusVariant(wo.status as WorkOrderStatus)}
                            className="text-[10px] py-0 px-1.5"
                          >
                            {wo.status}
                          </Badge>
                          <span className="font-mono">{wo.referenceNumber}</span>
                          {wo.description && <span className="truncate text-muted-foreground">— {wo.description}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader className="space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <CardTitle className="text-base">{t('supervisorReports.detail.summary')}</CardTitle>
                        <CardDescription>{t('supervisorReports.detail.report')}</CardDescription>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={getStatusVariant(report.status)}>
                          {t(`supervisorReports.status.${report.status}`)}
                        </Badge>
                        <Badge variant={getUrgencyVariant(report.urgencyPerception)}>
                          {t(`supervisorReports.urgency.${report.urgencyPerception}`)}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('supervisorReports.detail.asset')}</p>
                        <FieldValue>{report.asset.name}</FieldValue>
                        <p className="text-xs text-muted-foreground">{report.asset.location.fullPath}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('supervisorReports.detail.reporter')}</p>
                        <FieldValue>{report.reporter.name}</FieldValue>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('common.date')}</p>
                        <FieldValue>{formatDateTime(report.createdAt)}</FieldValue>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('supervisorReports.detail.processedAt')}</p>
                        <FieldValue>{formatDateTime(report.processedAt)}</FieldValue>
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('common.description')}</p>
                      <p className="rounded-md bg-muted/50 p-3 leading-6">{report.description}</p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('supervisorReports.detail.processedBy')}</p>
                        <FieldValue>{report.processedBy?.name ?? '—'}</FieldValue>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('supervisorReports.detail.linkedWorkOrder')}</p>
                        <FieldValue>{report.replacedByWorkOrderRef ?? '—'}</FieldValue>
                      </div>
                    </div>

                    {(report.rejectionReason || report.rejectionDetail) && (
                      <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('supervisorReports.detail.rejectedReason')}</p>
                        <FieldValue>{report.rejectionReason ? t(`supervisorReports.rejectionReasons.${report.rejectionReason}`) : '—'}</FieldValue>
                        {report.rejectionDetail && <p className="text-sm text-muted-foreground">{report.rejectionDetail}</p>}
                      </div>
                    )}

                    {(report.deferNote || report.deferredAt) && (
                      <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('supervisorReports.detail.deferNote')}</p>
                        <FieldValue>{report.deferNote ?? '—'}</FieldValue>
                        <p className="text-xs text-muted-foreground">{formatDateTime(report.deferredAt)}</p>
                      </div>
                    )}

                    {(report.archiveReason || report.status === ProblemReportStatus.ARCHIVED) && (
                      <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('supervisorReports.detail.archiveReason')}</p>
                        <FieldValue>{report.archiveReason ? t(`supervisorReports.archiveReasons.${report.archiveReason}`) : '—'}</FieldValue>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t('supervisorReports.detail.comments')}</CardTitle>
                    <CardDescription>{t('supervisorReports.detail.commentsDescription')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      {report.comments.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t('supervisorReports.states.commentsEmpty')}</p>
                      ) : (
                        report.comments.map((comment) => (
                          <div key={comment.id} className="rounded-md border p-3 space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium">{comment.author.name}</p>
                                <p className="text-xs text-muted-foreground">{formatDateTime(comment.createdAt)}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                {comment.acknowledgedBySupervisor && (
                                  <Badge variant="success">{t('supervisorReports.detail.commentAcknowledged')}</Badge>
                                )}
                                {!comment.acknowledgedBySupervisor && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => acknowledgeMutation.mutate({ reportId: report.id, commentId: comment.id })}
                                    disabled={isActionPending}
                                  >
                                    {t('supervisorReports.actions.acknowledge')}
                                  </Button>
                                )}
                              </div>
                            </div>
                            <p className="text-sm leading-6 text-foreground">{comment.content}</p>
                          </div>
                        ))
                      )}
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Label htmlFor="report-comment">{t('supervisorReports.detail.addCommentTitle')}</Label>
                      <textarea
                        id="report-comment"
                        value={commentContent}
                        onChange={(event) => setCommentContent(event.target.value)}
                        className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        placeholder={t('supervisorReports.detail.commentPlaceholder')}
                      />
                    </div>

                    <div className="flex justify-end">
                      <Button type="button" onClick={handleCommentSubmit} disabled={commentMutation.isPending}>
                        {commentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                        {t('supervisorReports.actions.addComment')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t('supervisorReports.detail.linkedWorkOrders')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {report.derivedWorkOrders.length > 0 ? (
                      report.derivedWorkOrders.map((workOrder) => (
                        <div key={workOrder.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                          <div>
                            <p className="text-sm font-medium">{workOrder.referenceNumber}</p>
                            <p className="text-xs text-muted-foreground">{formatDateTime(workOrder.createdAt)}</p>
                          </div>
                          <Badge variant={getWorkOrderStatusVariant(workOrder.status)}>{workOrder.status}</Badge>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">{t('supervisorReports.states.workOrdersEmpty')}</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t('supervisorReports.detail.actions')}</CardTitle>
                    <CardDescription>{t('supervisorReports.detail.actionsDescription')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {report.status === ProblemReportStatus.PENDING && (
                      <ActionCard
                        title={t('supervisorReports.detail.convertTitle')}
                        description={t('supervisorReports.detail.convertDescription')}
                        icon={Send}
                      >
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="convert-priority">{t('supervisorReports.detail.priority')}</Label>
                            <select
                              id="convert-priority"
                              value={convertPriority}
                              onChange={(event) => setConvertPriority(event.target.value as WorkOrderPriority)}
                              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                            >
                              {PRIORITY_OPTIONS.map((priority) => (
                                <option key={priority} value={priority}>
                                  {t(`supervisorReports.priorities.${priority}`)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="convert-duration">{t('supervisorReports.detail.estimatedDurationMinutes')}</Label>
                            <Input
                              id="convert-duration"
                              type="number"
                              min={1}
                              value={convertEstimatedDuration}
                              onChange={(event) => setConvertEstimatedDuration(event.target.value)}
                            />
                          </div>
                          <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor="convert-description">{t('supervisorReports.detail.description')}</Label>
                            <Input
                              id="convert-description"
                              value={convertDescription}
                              onChange={(event) => setConvertDescription(event.target.value)}
                            />
                          </div>
                          <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor="convert-notes">{t('supervisorReports.detail.internalNotes')}</Label>
                            <textarea
                              id="convert-notes"
                              value={convertInternalNotes}
                              onChange={(event) => setConvertInternalNotes(event.target.value)}
                              className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                            />
                          </div>
                          <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor="convert-due-date">{t('supervisorReports.detail.dueDate')}</Label>
                            <Input
                              id="convert-due-date"
                              type="date"
                              value={convertDueDate}
                              onChange={(event) => setConvertDueDate(event.target.value)}
                            />
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <Button type="button" onClick={handleConvert} disabled={convertMutation.isPending}>
                            {convertMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
                            {t('supervisorReports.actions.convert')}
                          </Button>
                        </div>
                      </ActionCard>
                    )}

                    {report.status === ProblemReportStatus.PENDING && (
                      <ActionCard
                        title={t('supervisorReports.detail.rejectTitle')}
                        description={t('supervisorReports.detail.rejectDescription')}
                        icon={ShieldAlert}
                      >
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="reject-reason">{t('supervisorReports.detail.reason')}</Label>
                            <select
                              id="reject-reason"
                              value={rejectReason}
                              onChange={(event) => setRejectReason(event.target.value as ReportRejectionReason)}
                              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                            >
                              {REJECTION_REASON_OPTIONS.map((reason) => (
                                <option key={reason} value={reason}>
                                  {t(`supervisorReports.rejectionReasons.${reason}`)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="reject-detail">{t('supervisorReports.detail.detail')}</Label>
                            <Input id="reject-detail" value={rejectDetail} onChange={(event) => setRejectDetail(event.target.value)} />
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <Button type="button" variant="destructive" onClick={handleReject} disabled={rejectMutation.isPending}>
                            {rejectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
                            {t('supervisorReports.actions.reject')}
                          </Button>
                        </div>
                      </ActionCard>
                    )}

                    {report.status === ProblemReportStatus.PENDING && (
                      <ActionCard
                        title={t('supervisorReports.detail.deferTitle')}
                        description={t('supervisorReports.detail.deferDescription')}
                        icon={Clock3}
                      >
                        <div className="space-y-2">
                          <Label htmlFor="defer-note">{t('supervisorReports.detail.note')}</Label>
                          <textarea
                            id="defer-note"
                            value={deferNote}
                            onChange={(event) => setDeferNote(event.target.value)}
                            className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                          />
                        </div>
                        <div className="flex justify-end">
                          <Button type="button" variant="outline" onClick={handleDefer} disabled={deferMutation.isPending}>
                            {deferMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock3 className="h-4 w-4" />}
                            {t('supervisorReports.actions.defer')}
                          </Button>
                        </div>
                      </ActionCard>
                    )}

                    {(report.status === ProblemReportStatus.PENDING || report.status === ProblemReportStatus.DEFERRED) && (
                      <ActionCard
                        title={t('supervisorReports.detail.archiveTitle')}
                        description={t('supervisorReports.detail.archiveDescription')}
                        icon={Archive}
                      >
                        <div className="space-y-2">
                          <Label htmlFor="archive-reason">{t('supervisorReports.detail.archiveReasonLabel')}</Label>
                          <select
                            id="archive-reason"
                            value={archiveReason}
                            onChange={(event) => setArchiveReason(event.target.value as ReportArchiveReason)}
                            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          >
                            {ARCHIVE_REASON_OPTIONS.map((reason) => (
                              <option key={reason} value={reason}>
                                {t(`supervisorReports.archiveReasons.${reason}`)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex justify-end">
                          <Button type="button" variant="outline" onClick={handleArchive} disabled={archiveMutation.isPending}>
                            {archiveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                            {t('supervisorReports.actions.archive')}
                          </Button>
                        </div>
                      </ActionCard>
                    )}

                    {report.status === ProblemReportStatus.DEFERRED && (
                      <ActionCard
                        title={t('supervisorReports.detail.reopenTitle')}
                        description={t('supervisorReports.detail.reopenDescription')}
                        icon={Undo2}
                      >
                        <div className="flex justify-end">
                          <Button type="button" variant="outline" onClick={() => reopenMutation.mutate(report.id)} disabled={reopenMutation.isPending}>
                            {reopenMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
                            {t('supervisorReports.actions.reopen')}
                          </Button>
                        </div>
                      </ActionCard>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* §9.1: Asset context sidebar — intervention history + certificate alerts */}
              {(() => {
                const detail = report as ReportDetailItem;
                const history: ReportAssetInterventionHistoryItem[] = detail.assetInterventionHistory ?? [];
                const certs: ReportAssetCertAlert[] = detail.asset?.certificates ?? [];
                if (history.length === 0 && certs.length === 0) return null;
                return (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <History className="h-4 w-4" />
                        {t('supervisorReports.detail.assetSidebarTitle')}
                      </CardTitle>
                      <CardDescription>{t('supervisorReports.detail.assetSidebarDescription')}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm">
                      {certs.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {t('supervisorReports.detail.assetCertAlerts')}
                          </p>
                          <div className="space-y-1.5">
                            {certs.map((cert: ReportAssetCertAlert) => (
                              <div key={cert.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                                <div>
                                  <p className="font-medium">
                                    {cert.otherType ?? cert.certificateType}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {cert.issuingAuthority} · {t('supervisorReports.detail.certExpiry', { date: formatDateTime(cert.expirationDate) })}
                                  </p>
                                </div>
                                <Badge variant={cert.status === 'EXPIRED' ? 'destructive' : 'warning'} className="shrink-0 text-[10px]">
                                  {cert.status}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {history.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {t('supervisorReports.detail.assetInterventionHistory')}
                          </p>
                          <div className="space-y-1.5">
                            {history.map((item: ReportAssetInterventionHistoryItem) => (
                              <div key={item.id} className="rounded-md border px-3 py-2 space-y-0.5">
                                <div className="flex items-center justify-between gap-3">
                                  <p className="font-medium">{item.referenceNumber}</p>
                                  <Badge variant="secondary" className="shrink-0 text-[10px] py-0">
                                    {item.type}
                                  </Badge>
                                </div>
                                {item.description && (
                                  <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                  {item.principalTechnician?.name && `${item.principalTechnician.name} · `}
                                  {formatDateTime(item.closedAt)}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })()}
            </div>
              );
            })()
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleCloseDetail(false)}>
              {t('common.cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}