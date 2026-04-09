'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AxiosError } from 'axios';
import { Loader2, Paperclip, X } from 'lucide-react';
import { DocumentType } from '@gmao/shared';
import { assetsApi } from '@/lib/assets.api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

const DOC_TYPES = Object.values(DocumentType);

function getErrorMessage(error: unknown, fallback: string): string {
  const axiosError = error as AxiosError<{ message?: string | string[] }>;
  const rawMessage = axiosError.response?.data?.message;
  if (Array.isArray(rawMessage) && rawMessage.length > 0) return rawMessage[0] ?? fallback;
  if (typeof rawMessage === 'string' && rawMessage.trim()) return rawMessage;
  return fallback;
}

interface DocumentUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetId: string;
  onSuccess: () => void;
}

export function DocumentUploadDialog({
  open,
  onOpenChange,
  assetId,
  onSuccess,
}: DocumentUploadDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [documentType, setDocumentType] = useState<DocumentType>(DocumentType.TECHNICAL_MANUAL);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState(false);

  useEffect(() => {
    if (open) {
      setDocumentType(DocumentType.TECHNICAL_MANUAL);
      setSelectedFile(null);
      setFileError(false);
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!selectedFile) {
        throw new Error('no_file');
      }
      return assetsApi.uploadDocument(assetId, selectedFile, documentType);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supervisor', 'assets', assetId, 'documents'] });
      toast.success(t('supervisorAssets.document.toasts.uploadSuccess'));
      onSuccess();
      onOpenChange(false);
    },
    onError: (error) => {
      if ((error as Error).message === 'no_file') {
        setFileError(true);
        return;
      }
      toast.error(getErrorMessage(error, t('supervisorAssets.document.toasts.uploadError')));
    },
  });

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
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('supervisorAssets.document.uploadTitle')}</DialogTitle>
          <DialogDescription>{t('supervisorAssets.document.uploadDescription')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-1">
          {/* Document type */}
          <div className="space-y-1.5">
            <Label htmlFor="doc-type">{t('supervisorAssets.document.form.type')}</Label>
            <select
              id="doc-type"
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value as DocumentType)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              {DOC_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`supervisorAssets.documentType.${type}`)}
                </option>
              ))}
            </select>
          </div>

          {/* File */}
          <div className="space-y-1.5">
            <Label>{t('supervisorAssets.document.form.file')}</Label>
            {selectedFile ? (
              <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
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
                {t('supervisorAssets.document.form.chooseFile')}
              </Button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
              className="hidden"
              onChange={handleFileChange}
            />
            {fileError && (
              <p className="text-xs text-destructive">
                {t('supervisorAssets.document.validation.fileRequired')}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('supervisorAssets.document.form.upload')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
