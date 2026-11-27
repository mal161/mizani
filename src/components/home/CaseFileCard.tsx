import { getTranslations } from "next-intl/server";

/**
 * An example case file drawn as a manila registry docket: punched hole, case number, labelled rows and a red
 * "Received" rubber stamp. Synthetic data, labelled as an example; only shows what Mizani really records.
 */
export async function CaseFileCard() {
  const t = await getTranslations("home.file.card");
  const tCat = await getTranslations("categories");
  const tStages = await getTranslations("stages");
  const rows: [string, string][] = [
    [t("filedLabel"), t("filed")],
    [t("aboutLabel"), t("about")],
    [t("categoryLabel"), tCat("withheld_funds")],
    [t("stageLabel"), tStages("investigation")],
    [t("responseLabel"), t("response")],
  ];
  return (
    <figure className="relative mx-auto w-full max-w-md rotate-[1.5deg] rounded-md border border-[#d8cba6] bg-[#f3ead2] px-7 pt-10 pb-8 text-[#2b2416] shadow-[0_12px_32px_rgb(15_23_42/0.14)]">
      {/* Punched hole for the registry tag string. */}
      <span aria-hidden className="absolute top-4 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full border border-[#cdbf96] bg-slate-50 shadow-[inset_0_1px_2px_rgb(0_0_0/0.15)]" />

      <div className="flex items-end justify-between gap-4 border-b-2 border-[#2b2416] pb-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-[#6b5d3f]">{t("label")}</span>
          <span className="font-mono text-2xl leading-none font-medium tabular-nums text-primary sm:text-3xl">ACC/2026/000231</span>
        </div>
        <span className="text-right text-sm leading-tight font-medium">{t("office")}</span>
      </div>

      <dl className="divide-y divide-[#d8cba6]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-6 py-2.5 text-sm">
            <dt className="shrink-0 text-[#6b5d3f]">{k}</dt>
            <dd className="text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex flex-col gap-1 pr-24">
        <span className="text-sm text-[#6b5d3f]">{t("nextLabel")}</span>
        <p className="text-base leading-6">{t("next")}</p>
      </div>

      {/* Rubber stamp in the flag red. */}
      <span
        aria-hidden
        className="absolute right-5 bottom-6 flex -rotate-[8deg] flex-col items-center rounded-sm border-[3px] border-flag-red px-2.5 py-1 text-flag-red opacity-85"
      >
        <span className="text-base leading-none font-bold">{t("stamp")}</span>
        <span className="mt-0.5 text-xs leading-none font-bold">{t("stampDate")}</span>
      </span>
      <figcaption className="sr-only">{t("caption")}</figcaption>
    </figure>
  );
}
