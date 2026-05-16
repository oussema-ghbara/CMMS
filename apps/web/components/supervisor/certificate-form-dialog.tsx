'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AxiosError } from 'axios';
import { Paperclip, X } from 'lucide-react';
import { CertificateType } from '@gmao/shared';
import { assetsApi, type AssetCertificate } from '@/lib/assets.api';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { SubmitButton } from '@/components/ui/submit-button';
import {
  FormDialog,
  CANCEL_BTN_STYLE,
  DIALOG_SELECT_STYLE,
  DIALOG_FOOTER_STYLE,
  FORM_DIALOG_MONO,
} from '@/components/ui/form-dialog';

const CERT_TYPES = Object.values(CertificateType);

const schema = z
  .object({
    certificateType: z.nativeEnum(CertificateType),
    otherType: z.string().trim().max(100).optional(),
    issuingAuthority: z.string().trim().min(1).max(200),
    issueDate: z.string().min(1),
    expirationDate: z.string().min(1),
  })
  .refine(
    (d) => d.certificateType !== CertificateType.OTHER || (d.otherType && d.otherType.length > 0),
    { message: 'otherTypeRequired', path: ['otherType'] },
  );

type FormValues = z.infer<typeof schema>;

function getErrorMessage(error: unknown, fallback: string): string {
  const axiosError = error as AxiosError<{ message?: string | string[] }>;
  const rawMessage = axiosError.response?.data?.message;
  if (Array.isArray(rawMessage) && rawMessage.length > 0) return rawMessage[0] ?? fallback;
  if (typeof rawMessage === 'string' && rawMessage.trim()) return rawMessage;
  return fallback;
}

function toIsoDate(value: string | null | undefined): string {
  if (!value) return '';
  return value.split('T')[0] ?? '';
}

interface CertificateFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetId: string;
  certificate: AssetCertificate | null;
  onSuccess: () => void;
}

export function CertificateFormDialog({
  open,
  onOpenChange,
  assetId,
  certificate,
  onSuccess,
}: CertificateFormDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const isEdit = !!certificate;

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      certificateType: CertificateType.PRESSURE_VESSEL,
      otherType: '',
      issuingAuthority: '',
      issueDate: '',
      expirationDate: '',
    },
  });

  useEffect(() => {
    if (open) {
      setSelectedFile(null);
      if (certificate) {
        reset({
          certificateType: certificate.certificateType as CertificateType,
          otherType: certificate.otherType ?? '',
          issuingAuthority: certificate.issuingAuthority,
          issueDate: toIsoDate(certificate.issueDate),
          expirationDate: toIsoDate(certificate.expirationDate),
        });
      } else {
        reset({
          certificateType: CertificateType.PRESSURE_VESSEL,
          otherType: '',
          issuingAuthority: '',
          issueDate: '',
          expirationDate: '',
        });
      }
    }
  }, [open, certificate, reset]);

  const certType = watch('certificateType');

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      if (isEdit) {
        return assetsApi.updateCertificate(
          assetId,
          certificate.id,
          {
            certificateType: values.certificateType,
            otherType: values.certificateType === CertificateType.OTHER ? values.otherType : undefined,
            issuingAuthority: values.issuingAuthority,
            issueDate: values.issueDate,
            expirationDate: values.expirationDate,
          },
          selectedFile ?? undefined,
        );
      }
      return assetsApi.createCertificate(
        assetId,
        {
          certificateType: values.certificateType,
          otherType: values.certificateType === CertificateType.OTHER ? values.otherType : undefined,
          issuingAuthority: values.issuingAuthority,
          issueDate: values.issueDate,
          expirationDate: values.expirationDate,
        },
        selectedFile ?? undefined,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supervisor', 'assets', assetId, 'certificates'] });
      void queryClient.invalidateQueries({ queryKey: ['supervisor', 'assets', assetId, 'detail'] });
      toast.success(
        isEdit
          ? t('supervisorAssets.certificate.toasts.updateSuccess')
          : t('supervisorAssets.certificate.toasts.createSuccess'),
      );
      onSuccess();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(
        getErrorMessage(
          error,
          isEdit
            ? t('supervisorAssets.certificate.toasts.updateError')
            : t('supervisorAssets.certificate.toasts.createError'),
        ),
      );
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(e.target.files?.[0] ?? null);
  };

  const clearFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? t('supervisorAssets.certificate.editTitle') : t('supervisorAssets.certificate.createTitle')}
      description={isEdit ? t('supervisorAssets.certificate.editDescription') : t('supervisorAssets.certificate.createDescription')}
      maxWidth={480}
      isPending={mutation.isPending}
    >
      <form
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <FormField label={t('supervisorAssets.certificate.form.type')} htmlFor="cert-type">
          <select id="cert-type" {...register('certificateType')} style={DIALOG_SELECT_STYLE}>
            {CERT_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`supervisorAssets.certificateType.${type}`)}
              </option>
            ))}
          </select>
        </FormField>

        {certType === CertificateType.OTHER && (
          <FormField
            label={t('supervisorAssets.certificate.form.otherType')}
            htmlFor="cert-other-type"
            required
            error={errors.otherType ? t('supervisorAssets.certificate.validation.otherTypeRequired') : undefined}
          >
            <Input
              id="cert-other-type"
              {...register('otherType')}
              placeholder={t('supervisorAssets.certificate.form.otherTypePlaceholder')}
              maxLength={100}
            />
          </FormField>
        )}

        <FormField
          label={t('supervisorAssets.certificate.form.issuingAuthority')}
          htmlFor="cert-authority"
          required
          error={errors.issuingAuthority ? t('supervisorAssets.certificate.validation.issuingAuthorityRequired') : undefined}
        >
          <Input
            id="cert-authority"
            {...register('issuingAuthority')}
            placeholder={t('supervisorAssets.certificate.form.issuingAuthorityPlaceholder')}
            maxLength={200}
          />
        </FormField>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField
            label={t('supervisorAssets.certificate.form.issueDate')}
            htmlFor="cert-issue-date"
            required
            error={errors.issueDate ? t('supervisorAssets.certificate.validation.issueDateRequired') : undefined}
          >
            <Input id="cert-issue-date" type="date" {...register('issueDate')} />
          </FormField>
          <FormField
            label={t('supervisorAssets.certificate.form.expirationDate')}
            htmlFor="cert-expiry-date"
            required
            error={errors.expirationDate ? t('supervisorAssets.certificate.validation.expirationDateRequired') : undefined}
          >
            <Input id="cert-expiry-date" type="date" {...register('expirationDate')} />
          </FormField>
        </div>

        <FormField label={t('supervisorAssets.certificate.form.file')}>
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
            <div>
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
                {t('supervisorAssets.certificate.form.attachFile')}
              </button>
              <p
                style={{
                  marginTop: 5,
                  fontFamily: FORM_DIALOG_MONO,
                  fontSize: 10,
                  color: 'var(--sb-text-tertiary)',
                  letterSpacing: '0.04em',
                }}
              >
                {t('supervisorAssets.certificate.form.fileHint')}
              </p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
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
            {isEdit ? t('common.save') : t('common.create')}
          </SubmitButton>
        </div>
      </form>
    </FormDialog>
  );
}
