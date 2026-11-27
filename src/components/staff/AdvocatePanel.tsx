"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { AdvocatePicker } from "@/components/complaint/AdvocatePicker";
import {
  linkAdvocateAction,
  setShareAction,
  type ActionState,
} from "@/app/[locale]/staff/(app)/cases/[caseNumber]/actions";

export interface AdvocatePanelProps {
  caseId: string;
  path: string;
  canWrite: boolean;
  stage: string;
  linked: { name: string; admissionNo: string; firm: string | null } | null;
  served: { on: string; method: string; due: string | null } | null;
  documents: { id: string; fileName: string; shared: boolean }[];
  responses: { id: string; text: string; late: boolean; createdAt: string }[];
}

const btn = "rounded-md bg-primary px-3 py-1.5 text-sm text-white transition-colors hover:bg-primary-hover disabled:opacity-60";
const field = "rounded-md border px-2 py-1.5 text-sm";

export function AdvocatePanel(p: AdvocatePanelProps) {
  const t = useTranslations("advocatePanel");
  const format = useFormatter();
  const router = useRouter();
  const [linkState, linkAct, linking] = useActionState(linkAdvocateAction, {} as ActionState);
  const [shared, setShared] = useState(() => Object.fromEntries(p.documents.map((d) => [d.id, d.shared])));
  const [, startShare] = useTransition();
  const [method, setMethod] = useState("hand");
  const [servedOn, setServedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [notifying, setNotifying] = useState(false);
  const [notifyError, setNotifyError] = useState<string | null>(null);
  const fmt = (d: string) => format.dateTime(new Date(d), { dateStyle: "medium", timeZone: "Africa/Nairobi" });
  const canNotify = p.canWrite && p.linked && (p.stage === "screening" || p.stage === "advocate_notified");

  function toggle(id: string, value: boolean) {
    setShared((s) => ({ ...s, [id]: value }));
    if (!p.served) return; // before notifying, the choice is sent with the notice
    const fd = new FormData();
    fd.set("documentId", id);
    fd.set("shared", String(value));
    startShare(() => setShareAction(fd));
  }

  async function notify() {
    setNotifying(true);
    setNotifyError(null);
    try {
      const res = await fetch(`/api/cases/${p.caseId}/notice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ servedOn, method, shareDocumentIds: Object.keys(shared).filter((k) => shared[k]) }),
      });
      if (!res.ok) {
        setNotifyError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "failed");
        return;
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "notice.pdf";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      router.refresh();
    } finally {
      setNotifying(false);
    }
  }

  return (
    <section aria-label={t("panel")} className="flex flex-col gap-3 rounded-lg border p-4 text-sm">
      <h3 className="font-medium">{t("panel")}</h3>

      {p.linked ? (
        <p>
          <span className="font-medium">{p.linked.name}</span> · {p.linked.admissionNo}
          {p.linked.firm ? ` · ${p.linked.firm}` : ""}
        </p>
      ) : (
        <>
          <p className="text-accent-ink">{t("notLinked")}</p>
          {p.canWrite && (
            <form action={linkAct} className="flex flex-col gap-2">
              <input type="hidden" name="caseId" value={p.caseId} />
              <input type="hidden" name="path" value={p.path} />
              <AdvocatePicker />
              {linkState.error && <p role="alert" className="text-red-700">{t(`errors.${linkState.error}`)}</p>}
              <button type="submit" disabled={linking} className={`${btn} self-start`}>
                {t("link")}
              </button>
            </form>
          )}
        </>
      )}

      {p.served && (
        <p data-testid="advocate-served" className="rounded bg-slate-50 px-2 py-1">
          {t("served", { date: fmt(p.served.on), method: t(`methods.${p.served.method}`) })}
          {p.served.due ? ` · ${t("due", { date: fmt(p.served.due) })}` : ""}
        </p>
      )}

      {p.documents.length > 0 && (
        <fieldset className="flex flex-col gap-1">
          <legend className="font-medium">{t("sharing")}</legend>
          {p.documents.map((d) => (
            <label key={d.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={shared[d.id] ?? false}
                disabled={!p.canWrite}
                onChange={(e) => toggle(d.id, e.target.checked)}
                aria-label={t("shareLabel", { name: d.fileName })}
              />
              {d.fileName}
            </label>
          ))}
        </fieldset>
      )}

      {canNotify && (
        <div className="flex flex-col gap-2 rounded border p-3">
          <label className="flex flex-col gap-1">
            {t("method")}
            <select value={method} onChange={(e) => setMethod(e.target.value)} aria-label={t("method")} className={field}>
              {["hand", "courier", "post", "email", "sms"].map((m) => (
                <option key={m} value={m}>
                  {t(`methods.${m}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            {t("servedOn")}
            <input type="date" value={servedOn} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setServedOn(e.target.value)} className={field} />
          </label>
          {notifyError && <p role="alert" className="text-red-700">{notifyError}</p>}
          <button type="button" onClick={notify} disabled={notifying} className={`${btn} self-start`}>
            {p.served ? t("renotify") : t("notify")}
          </button>
          <p className="text-xs text-slate-500">{t("notifyHint")}</p>
        </div>
      )}

      {p.responses.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="font-medium">{t("responses")}</p>
          {p.responses.map((r) => (
            <div key={r.id} className="rounded border bg-slate-50 p-2">
              <p className="text-xs text-slate-500">
                {fmt(r.createdAt)}
                {r.late ? ` · ${t("late")}` : ""}
              </p>
              <p className="whitespace-pre-wrap">{r.text}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
