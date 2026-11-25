import { requireStaff } from "@/lib/auth/staff";
import { createServerClient } from "@/lib/supabase/server";
import { StaffNav } from "@/components/staff/StaffNav";
import type { Locale } from "@/i18n/routing";

export default async function StaffAppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const locale = (await params).locale as Locale;
  const user = await requireStaff(locale);
  const supabase = await createServerClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);
  return (
    <>
      <StaffNav user={user} locale={locale} unread={count ?? 0} />
      {children}
    </>
  );
}
