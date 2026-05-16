'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AxiosError } from 'axios';
import { Download, FileText, Loader2, Paperclip, Trash2, X } from 'lucide-react';
import { DocumentType } from '@gmao/shared';
import { Role } from '@gmao/shared';
import { useAuthStore } from '@/store/auth.store';
import { inventoryApi, type PartCatalogItem, type PartDocument } from '@/lib/inventory.api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { SubmitButton } from '@/components/ui/submit-button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const selectClass =
  'h-9 w-full rounded-[2px] border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2';

const PART_DOC_TYPES = [
  DocumentType.TECHNICAL_MANUAL,
  DocumentType.SAFETY_DATA_SHEET,
  DocumentType.SPECIFICATION_SHEET,
] as const;

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  const axiosError = error as AxiosError<{ message?: string | string[] }>;
  const rawMessage = axiosError.response?.data?.message;
  if (Array.isArray(rawMessage) && rawMessage.length > 0) return rawMessage[0] ?? fallback;
  if (typeof rawMessage === 'string' && rawMessage.trim()) return rawMessage;
  return fallback;
}

interface PartDocumentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  part: PartCatalogItem | null;
}

export function PartDocumentsDialog({ open, onOpenChange, part }: PartDocumentsDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [documentType, setDocumentType] = useState<DocumentType>(DocumentType.TECHNICAL_MANUAL);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const canManage =
    user?.roles.includes(Role.SUPERVISOR) || user?.roles.includes(Role.STOREKEEPER);

  const documentsQuery = useQuery({
    queryKey: ['storekeeper', 'parts', part?.id, 'documents'],
    queryFn: () => inventoryApi.listPartDocuments(part!.id),
    enabled: open && !!part,
  });

  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!selectedFile || !part) throw new Error('no_file');
      return inventoryApi.uploadPartDocument(part.id, selectedFile, documentType);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['storekeeper', 'parts', part?.id, 'documents'],
      });
      toast.success(t('storekeeperInventory.documents.toasts.uploadSuccess'));
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    onError: (error) => {
      if ((error as Error).message === 'no_file') {
        setFileError(true);
        return;
      }
      toast.error(getErrorMessage(error, t('storekeeperInventory.documents.toasts.uploadError')));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (docId: string) => inventoryApi.deletePartDocument(part!.id, docId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['storekeeper', 'parts', part?.id, 'documents'],
      });
      toast.success(t('storekeeperInventory.documents.toasts.deleteSuccess'));
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t('storekeeperInventory.documents.toasts.deleteError')));
    },
  });

  const handleDownload = async (doc: PartDocument) => {
    if (!part) return;
    setDownloadingId(doc.id);
    try {
      const url = await inventoryApi.getPartDocumentDownloadUrl(part.id, doc.id);
      window.open(url, '_blank');
    } catch {
      toast.error(t('storekeeperInventory.documents.toasts.downloadError'));
    } finally {
      setDownloadingId(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    if (file) setFileError(false);
  };

  const clearFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setFileError(true);
      return;
    }
    uploadMutation.mutate();
  };

  const documents = documentsQuery.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('storekeeperInventory.documents.dialogTitle', { name: part?.name ?? '' })}</DialogTitle>
          <DialogDescription>{t('storekeeperInventory.documents.dialogDescription')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {documentsQuery.isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : documents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {t('storekeeperInventory.documents.empty')}
            </p>
          ) : (
            <ul className="divide-y rounded-[2px] border">
              {documents.map((doc) => (
                <li key={doc.id} className="flex items-center gap-3 px-3 py-2.5">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{doc.fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {t(`storekeeperInventory.documents.documentType.${doc.documentType}`)} —{' '}
                      {formatFileSize(doc.fileSize)} — v{doc.version} —{' '}
                      {doc.uploadedBy?.name ?? '—'} — {formatDateTime(doc.createdAt)}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-xs">
                    v{doc.version}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void handleDownload(doc)}
                    disabled={downloadingId === doc.id}
                    title={t('storekeeperInventory.documents.actions.download')}
                  >
                    {downloadingId === doc.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                  </Button>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(doc.id)}
                      disabled={deleteMutation.isPending}
                      title={t('storekeeperInventory.documents.actions.delete')}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canManage && (
            <form onSubmit={handleSubmit} className="space-y-3 rounded-[2px] border p-3">
              <p className="text-sm font-medium">{t('storekeeperInventory.documents.uploadTitle')}</p>
              <p className="text-xs text-muted-foreground">{t('storekeeperInventory.documents.uploadHint')}</p>

              <FormField label={t('storekeeperInventory.documents.form.type')} htmlFor="part-doc-type">
                <select
                  id="part-doc-type"
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value as DocumentType)}
                  className={selectClass}
                >
                  {PART_DOC_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`storekeeperInventory.documents.documentType.${type}`)}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField
                label={t('storekeeperInventory.documents.form.file')}
                required
                error={fileError ? t('storekeeperInventory.documents.validation.fileRequired') : undefined}
              >
                {selectedFile ? (
                  <div className="flex items-center gap-2 rounded-[2px] border px-3 py-2 text-sm">
                    <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate flex-1">{selectedFile.name}</span>
                    <button
                      type="button"
                      onClick={clearFile}
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip className="mr-1.5 h-4 w-4" />
                    {t('storekeeperInventory.documents.form.chooseFile')}
                  </Button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </FormField>

              <div className="flex justify-end">
                <SubmitButton
                  isPending={uploadMutation.isPending}
                  isSuccess={uploadMutation.isSuccess}
                >
                  {t('storekeeperInventory.documents.form.upload')}
                </SubmitButton>
              </div>
            </form>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
