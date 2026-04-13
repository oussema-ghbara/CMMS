import { redirect } from 'next/navigation';

export default function LegacyAuthForgotPasswordPage() {
  redirect('/forgot-password');
}
