'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AxiosError } from 'axios';
import { Paperclip, X } from 'lucide-react';
import { DocumentType } from '@gmao/shared';
import { assetsApi } from '@/lib/assets.api';
import { FormField } from '@/components/ui/form-field';
import { SubmitButton } from '@/components/ui/submit-button';
import {
  FormDialog,
  CANCEL_BTN_STYLE,
  DIALOG_SELECT_STYLE,
  DIALOG_FOOTER_STYLE,
  FORM_DIALOG_MONO,
} from '@/components/ui/form-dialog';

const DOC_TYPES = Object.values(DocumentType).filter(
  (t) => t !== DocumentType.COMPLIANCE_CERTIFICATE,
);

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
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('supervisorAssets.document.uploadTitle')}
      description={t('supervisorAssets.document.uploadDescription')}
      maxWidth={440}
      isPending={mutation.isPending}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <FormField label={t('supervisorAssets.document.form.type')} htmlFor="doc-type">
          <select
            id="doc-type"
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value as DocumentType)}
            style={DIALOG_SELECT_STYLE}
          >
            {DOC_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`supervisorAssets.documentType.${type}`)}
              </option>
            ))}
          </select>
        </FormField>

        <FormField
          label={t('supervisorAssets.document.form.file')}
          required
          error={fileError ? t('supervisorAssets.document.validation.fileRequired') : undefined}
        >
          {selectedFile ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                border: '1px solid var(--sb-border)',
                borderRadius: 2,
                padding: '8px 10px',
                fontSize: 13,
                color: 'var(--sb-text-primary)',
              }}
            >
              <Paperclip style={{ width: 14, height: 14, color: 'var(--sb-text-tertiary)', flexShrink: 0 }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedFile.name}
              </span>
              <button
                type="button"
                onClick={clearFile}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  color: 'var(--sb-text-tertiary)',
                  display: 'flex',
                  flexShrink: 0,
                }}
              >
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: 'transparent',
                border: '1px solid var(--sb-border)',
                borderRadius: 2,
                padding: '6px 12px',
                fontFamily: FORM_DIALOG_MONO,
                fontSize: 10,
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                fontWeight: 500,
                color: 'var(--sb-text-secondary)',
                cursor: 'pointer',
              }}
            >
              <Paperclip style={{ width: 13, height: 13 }} />
              {t('supervisorAssets.document.form.chooseFile')}
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </FormField>

        <div style={DIALOG_FOOTER_STYLE}>
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => onOpenChange(false)}
            style={CANCEL_BTN_STYLE(mutation.isPending)}
          >
            {t('common.cancel')}
          </button>
          <SubmitButton isPending={mutation.isPending} isSuccess={mutation.isSuccess}>
            {t('supervisorAssets.document.form.upload')}
          </SubmitButton>
        </div>
      </form>
    </FormDialog>
  );
}
