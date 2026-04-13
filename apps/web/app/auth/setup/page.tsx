import { redirect } from 'next/navigation';

type LegacySetupPageProps = {
  searchParams?: {
    token?: string;
  };
};

export default function LegacyAuthSetupPage({ searchParams }: LegacySetupPageProps) {
  const token = searchParams?.token;
  const target = token ? `/setup?token=${encodeURIComponent(token)}` : '/setup';
  redirect(target);
}
