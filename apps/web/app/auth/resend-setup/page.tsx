import { redirect } from 'next/navigation';

export default function LegacyAuthResendSetupPage() {
  redirect('/resend-setup');
}