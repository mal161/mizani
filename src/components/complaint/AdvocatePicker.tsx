"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { searchAdvocates, type AdvocateOption } from "@/lib/advocates/search-action";

/** Name field with live search of the advocates roll; free text is kept if no match is chosen. */
export function AdvocatePicker({ defaultName = "", invalid = false }: { defaultName?: string; invalid?: boolean }) {
  const t = useTranslations("file");
  const listId = useId();
  const [name, setName] = useState(defaultName);
  const [selected, setSelected] = useState<AdvocateOption | null>(null);
  const [options, setOptions] = useState<AdvocateOption[]>([]);

  useEffect(() => {
    if (selected && selected.full_name === name) return;
    const handle = setTimeout(async () => setOptions(await searchAdvocates(name)), 250);
    return () => clearTimeout(handle);
  }, [name, selected]);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="advocateNameGiven" className="text-sm font-medium">
        {t("advocate")}
      </label>
      <input
        id="advocateNameGiven"
        name="advocateNameGiven"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setSelected(null);
        }}
        role="combobox"
        aria-expanded={options.length > 0}
        aria-controls={listId}
        aria-invalid={invalid}
        autoComplete="off"
        required
        className="rounded-md border px-3 py-2.5"
      />
      <input type="hidden" name="advocateId" value={selected?.id ?? ""} />
      <p className="text-xs text-slate-500">{t("advocateHint")}</p>
      {options.length > 0 && (
        <ul id={listId} role="listbox" className="rounded-md border bg-white shadow-sm">
          {options.map((o) => (
            <li
              key={o.id}
              role="option"
              aria-selected={selected?.id === o.id}
              onClick={() => {
                setSelected(o);
                setName(o.full_name);
                setOptions([]);
              }}
              className="cursor-pointer px-3 py-2 text-sm hover:bg-slate-100"
            >
              {o.full_name} · {o.admission_no}
              {o.firm ? ` · ${o.firm}` : ""}
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <p className="text-xs text-green-700">
          {t("advocateMatched", { admission: selected.admission_no })}
        </p>
      )}
    </div>
  );
}
