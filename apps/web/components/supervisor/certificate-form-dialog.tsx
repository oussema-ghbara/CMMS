'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AxiosError } from 'axios';
import { Loader2, Paperclip, X } from 'lucide-react';
import { CertificateType } from '@gmao/shared';
import { assetsApi, type AssetCertificate } from '@/lib/assets.api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t('supervisorAssets.certificate.editTitle')
              : t('supervisorAssets.certificate.createTitle')}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? t('supervisorAssets.certificate.editDescription')
              : t('supervisorAssets.certificate.createDescription')}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4 py-1"
        >
          {/* Certificate type */}
          <div className="space-y-1.5">
            <Label htmlFor="cert-type">{t('supervisorAssets.certificate.form.type')}</Label>
            <select
              id="cert-type"
              {...register('certificateType')}
              className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              {CERT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`supervisorAssets.certificateType.${type}`)}
                </option>
              ))}
            </select>
          </div>

          {/* Other type (conditional) */}
          {certType === CertificateType.OTHER && (
            <div className="space-y-1.5">
              <Label htmlFor="cert-other-type">
                {t('supervisorAssets.certificate.form.otherType')}
              </Label>
              <Input
                id="cert-other-type"
                {...register('otherType')}
                placeholder={t('supervisorAssets.certificate.form.otherTypePlaceholder')}
                maxLength={100}
              />
              {errors.otherType && (
                <p className="text-xs text-destructive">
                  {t('supervisorAssets.certificate.validation.otherTypeRequired')}
                </p>
              )}
            </div>
          )}

          {/* Issuing authority */}
          <div className="space-y-1.5">
            <Label htmlFor="cert-authority">
              {t('supervisorAssets.certificate.form.issuingAuthority')}
            </Label>
            <Input
              id="cert-authority"
              {...register('issuingAuthority')}
              placeholder={t('supervisorAssets.certificate.form.issuingAuthorityPlaceholder')}
              maxLength={200}
            />
            {errors.issuingAuthority && (
              <p className="text-xs text-destructive">
                {t('supervisorAssets.certificate.validation.issuingAuthorityRequired')}
              </p>
            )}
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cert-issue-date">
                {t('supervisorAssets.certificate.form.issueDate')}
              </Label>
              <Input id="cert-issue-date" type="date" {...register('issueDate')} />
              {errors.issueDate && (
                <p className="text-xs text-destructive">
                  {t('supervisorAssets.certificate.validation.issueDateRequired')}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cert-expiry-date">
                {t('supervisorAssets.certificate.form.expirationDate')}
              </Label>
              <Input id="cert-expiry-date" type="date" {...register('expirationDate')} />
              {errors.expirationDate && (
                <p className="text-xs text-destructive">
                  {t('supervisorAssets.certificate.validation.expirationDateRequired')}
                </p>
              )}
            </div>
          </div>

          {/* File upload */}
          <div className="space-y-1.5">
            <Label>{t('supervisorAssets.certificate.form.file')}</Label>
            {selectedFile ? (
              <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="truncate flex-1">{selectedFile.name}</span>
                <button type="button" onClick={clearFile} className="shrink-0 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="mr-1.5 h-4 w-4" />
                  {t('supervisorAssets.certificate.form.attachFile')}
                </Button>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('supervisorAssets.certificate.form.fileHint')}
                </p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={handleFileChange}
            />
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
              {isEdit ? t('common.save') : t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
