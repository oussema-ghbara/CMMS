import { redirect } from 'next/navigation';

type LegacyResetPageProps = {
  searchParams?: {
    token?: string;
  };
};

export default function LegacyAuthResetPasswordPage({ searchParams }: LegacyResetPageProps) {
  const token = searchParams?.token;
  const target = token ? `/reset-password?token=${encodeURIComponent(token)}` : '/reset-password';
  redirect(target);
}
