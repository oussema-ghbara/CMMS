export type MailTemplate = 'setup-account' | 'password-reset';

export interface SendMailDto {
  to: string;
  template: MailTemplate;
  context: Record<string, string>;
}
