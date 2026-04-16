import { redirect } from 'next/navigation';

type LegacyResetPageProps = {
  searchParams?: Promise<{
    token?: string;
  }>;
};

export default async function LegacyAuthResetPasswordPage({
  searchParams,
}: LegacyResetPageProps) {
  const params = await searchParams;
  const token = params?.token;
  const target = token ? `/reset-password?token=${encodeURIComponent(token)}` : '/reset-password';
  redirect(target);
}
