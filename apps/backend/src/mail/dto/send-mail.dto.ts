export type MailTemplate = 'setup-account' | 'password-reset' | 'certificate-expiry';

export interface SendMailDto {
  to: string;
  template: MailTemplate;
  context: Record<string, string | number>;
}
