export type MailTemplate =
  | 'setup-account'
  | 'password-reset'
  | 'certificate-expiry'
  | 'notification'
  | 'daily-summary';

export interface SendMailDto {
  to: string;
  template: MailTemplate;
  context: Record<string, unknown>;
}
