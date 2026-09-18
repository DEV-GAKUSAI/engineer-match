import { redirect } from "next/navigation";
import { MineAccountLinkCard } from "@/components/auth/MineAccountLinkCard";
import { getUserAccount } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

export default async function MineLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token?.trim();
  if (!token) {
    return <main className="p-8 text-center text-sm text-muted-foreground">連携用リンクが見つかりません。</main>;
  }

  const destination = `/mine-link?token=${encodeURIComponent(token)}`;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/login?next=${encodeURIComponent(destination)}`);

  const account = await getUserAccount(supabase, user.id);
  if (!account || account.role !== "ENGINEER" || account.status !== "ACTIVE") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl items-center px-5 py-12">
        <section className="w-full rounded-3xl border border-amber-200 bg-amber-50 p-7 text-sm leading-6 text-amber-900 shadow-sm">
          この連携には、有効なEngineer Matchエンジニアアカウントでのログインが必要です。
        </section>
      </main>
    );
  }

  return <MineAccountLinkCard token={token} />;
}
