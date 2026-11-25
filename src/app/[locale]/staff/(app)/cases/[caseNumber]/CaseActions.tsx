"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  changeStageAction,
  addNoteAction,
  assignAction,
  triageAction,
  requestInfoAction,
  type ActionState,
} from "./actions";

type Option = { value: string; label: string };

function Feedback({ state }: { state: ActionState }) {
  const t = useTranslations("staffCase");
  if (!state.error) return null;
  return (
    <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
      {t(`errors.${state.error}`)}
    </p>
  );
}

function useResetOnSuccess(state: ActionState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return ref;
}

const box = "flex flex-col gap-2 rounded-lg border p-4";
const btn = "self-start rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-60";
const field = "rounded-md border px-2 py-1.5 text-sm";

export function CaseActions(props: {
  caseId: string;
  path: string;
  stage: string;
  nextStages: Option[];
  officers: Option[];
  assignedOfficerId: string | null;
  categories: Option[];
  category: string | null;
  priority: string;
  canWrite: boolean;
}) {
  const t = useTranslations("staffCase");
  const [stageState, stageAct, stagePending] = useActionState(changeStageAction, {});
  const [noteState, noteAct, notePending] = useActionState(addNoteAction, {});
  const [assignState, assignAct, assignPending] = useActionState(assignAction, {});
  const [triageState, triageAct, triagePending] = useActionState(triageAction, {});
  const [infoState, infoAct, infoPending] = useActionState(requestInfoAction, {});
  const [target, setTarget] = useState(props.nextStages[0]?.value ?? "");
  const noteRef = useResetOnSuccess(noteState);
  const infoRef = useResetOnSuccess(infoState);
  if (!props.canWrite) return <p className="text-sm text-slate-500">{t("readOnly")}</p>;

  const hidden = (
    <>
      <input type="hidden" name="caseId" value={props.caseId} />
      <input type="hidden" name="path" value={props.path} />
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      {props.nextStages.length > 0 && (
        <form action={stageAct} className={box}>
          {hidden}
          <input type="hidden" name="from" value={props.stage} />
          <h3 className="font-semibold">{t("stageTitle")}</h3>
          <label className="flex flex-col gap-1 text-sm">
            {t("moveTo")}
            <select name="to" value={target} onChange={(e) => setTarget(e.target.value)} aria-label={t("moveTo")} className={field}>
              {props.nextStages.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {target === "closed" && (
            <label className="flex flex-col gap-1 text-sm">
              {t("closeReason")}
              <textarea name="reason" required rows={2} className={field} />
            </label>
          )}
          <Feedback state={stageState} />
          <button type="submit" disabled={stagePending} className={btn}>
            {t("changeStage")}
          </button>
        </form>
      )}

      <form action={triageAct} className={box}>
        {hidden}
        <h3 className="font-semibold">{t("triageTitle")}</h3>
        <label className="flex flex-col gap-1 text-sm">
          {t("category")}
          <select name="category" defaultValue={props.category ?? ""} aria-label={t("category")} className={field}>
            <option value="">{t("noCategory")}</option>
            {props.categories.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("priority")}
          <select name="priority" defaultValue={props.priority} aria-label={t("priority")} className={field}>
            {["low", "normal", "high", "urgent"].map((p) => (
              <option key={p} value={p}>
                {t(`priorities.${p}`)}
              </option>
            ))}
          </select>
        </label>
        <Feedback state={triageState} />
        <button type="submit" disabled={triagePending} className={btn}>
          {t("saveTriage")}
        </button>
      </form>

      <form action={assignAct} className={box}>
        {hidden}
        <h3 className="font-semibold">{t("assignTitle")}</h3>
        <label className="flex flex-col gap-1 text-sm">
          {t("officer")}
          <select name="officerId" defaultValue={props.assignedOfficerId ?? ""} aria-label={t("officer")} className={field}>
            <option value="">{t("unassigned")}</option>
            {props.officers.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <Feedback state={assignState} />
        <button type="submit" disabled={assignPending} className={btn}>
          {t("assign")}
        </button>
      </form>

      <form action={noteAct} ref={noteRef} className={box}>
        {hidden}
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">{t("note")}</span>
          <textarea name="text" required maxLength={5000} rows={3} className={field} />
        </label>
        <Feedback state={noteState} />
        <button type="submit" disabled={notePending} className={btn}>
          {t("addNote")}
        </button>
      </form>

      <form action={infoAct} ref={infoRef} className={box}>
        {hidden}
        <h3 className="font-semibold">{t("infoTitle")}</h3>
        <label className="flex flex-col gap-1 text-sm">
          {t("infoMessage")}
          <textarea name="message" required minLength={5} maxLength={2000} rows={3} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("infoDays")}
          <input name="dueDays" type="number" min={1} max={60} defaultValue={7} className={`${field} w-24`} />
        </label>
        <Feedback state={infoState} />
        <button type="submit" disabled={infoPending} className={btn}>
          {t("requestInfo")}
        </button>
      </form>
    </div>
  );
}
