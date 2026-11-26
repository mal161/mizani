import { getTranslations } from "next-intl/server";
import { requireStaff } from "@/lib/auth/staff";
import { loadWorkflowConfig } from "@/lib/cases/load-workflow";
import { STAGES } from "@/lib/cases/stages";
import type { Locale } from "@/i18n/routing";
import { SettingsForm } from "./SettingsForm";

export default async function SettingsAdmin({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale;
  await requireStaff(locale, ["admin"]);
  const cfg = await loadWorkflowConfig();
  const tStages = await getTranslations("stages");
  const t = await getTranslations("admin.settings");
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
      <h1 className="text-3xl font-bold text-primary">{t("title")}</h1>
      <SettingsForm
        path={`/${locale}/staff/admin/settings`}
        stages={STAGES.map((s) => ({ key: s, defaultName: tStages(s) }))}
        cfg={cfg}
      />
    </main>
  );
}
