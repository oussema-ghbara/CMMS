import { redirect } from 'next/navigation';

type LegacySetupPageProps = {
  searchParams?: Promise<{
    token?: string;
  }>;
};

export default async function LegacyAuthSetupPage({ searchParams }: LegacySetupPageProps) {
  const params = await searchParams;
  const token = params?.token;
  const target = token ? `/setup?token=${encodeURIComponent(token)}` : '/setup';
  redirect(target);
}
