/* eslint-disable @next/next/no-img-element */
import { getTranslations } from "next-intl/server";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isStaffRole, staffHome } from "@/lib/auth/staff-gate";
import { redirect, type Locale } from "@/i18n/routing";
import { MfaForm } from "./MfaForm";

export default async function MfaPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const user = await getCurrentUser();
  if (!user || !isStaffRole(user.role)) return redirect({ href: "/staff/login", locale });

  const supabase = await createServerClient();
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") return redirect({ href: staffHome(user.role), locale });

  const t = await getTranslations("mfa");
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = factors?.totp.find((f) => f.status === "verified");

  let factorId = verified?.id;
  let enrolment: { qr: string; secret: string } | null = null;
  if (!verified) {
    // Remove abandoned enrolments, then start a fresh one.
    for (const f of factors?.all ?? []) {
      if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Mizani ${Date.now()}` });
    if (data) {
      factorId = data.id;
      enrolment = { qr: data.totp.qr_code, secret: data.totp.secret };
    }
  }

  return (
    <main className="mx-auto my-10 flex max-w-md flex-col gap-6 rounded-lg border bg-white px-6 py-8 sm:my-12 sm:px-8">
      <h1 className="text-3xl font-bold text-primary">{enrolment ? t("enrolTitle") : t("title")}</h1>
      {enrolment ? (
        <section className="flex flex-col gap-3">
          <p className="text-slate-600">{t("enrolIntro")}</p>
          <img src={enrolment.qr} alt={t("qrAlt")} width={200} height={200} className="self-center rounded border bg-white p-2" />
          <p className="text-xs text-slate-500">
            {t("manualKey")} <code className="break-all font-mono">{enrolment.secret}</code>
          </p>
        </section>
      ) : (
        <p className="text-slate-600">{t("intro")}</p>
      )}
      {factorId && <MfaForm factorId={factorId} />}
    </main>
  );
}
