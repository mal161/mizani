import { useTranslations } from "next-intl";
import { Logo } from "@/components/brand/Logo";
import { StaffLoginForm } from "./LoginForm";

export default function StaffLoginPage() {
  const t = useTranslations("staffLogin");
  const ts = useTranslations("shell");
  return (
    <main className="mx-auto my-10 flex max-w-md flex-col gap-6 rounded-lg border bg-white px-6 py-8 sm:my-12 sm:px-8">
      <Logo className="mx-auto w-72" textScale={1.7} labels={{ advocate: ts("logo.advocate"), complainant: ts("logo.complainant"), tagline: ts("tagline") }} />
      <h1 className="text-3xl font-bold text-primary">{t("title")}</h1>
      <p className="text-slate-600">{t("intro")}</p>
      <StaffLoginForm />
    </main>
  );
}
