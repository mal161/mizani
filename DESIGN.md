# DESIGN.md — Mizani

## Overview
- **Product / users / devices:** the case management system of Kenya's Advocates Complaints Commission. Members of the public (phones first, English or Kiswahili), advocates complained against, ACC officers and commissioners (desktop, all day).
- **One job per surface:** public pages get a person to the right task (file, track, respond) in one click; staff pages get an officer through a queue of cases without hunting.
- **Direction:** *Kenyan public-service portal* — institutional, task-first, plain. It should feel like it belongs next to eCitizen and the Judiciary, not like a startup.
- **References:**
  - eCitizen (ecitizen.go.ke): logo lockup with a vertical divider, task-first service row under the headline ("Apply for …").
  - Judiciary of Kenya (judiciary.go.ke): full-width dark navigation band, active item underlined, Roboto.
  - ODPC (odpc.go.ke): slim utility strip above the masthead, the organisation's name small above a direct headline, "File a complaint" as the first action.
- **Signature element (the one bold thing):** the **masthead lockup** — the Mizani balanced-scales mark, a 3px vertical Kenyan tricolour rule (black / red / green, white gaps), then the Commission's name. It appears in every portal's header and nowhere else. No national coat of arms (protected emblem; this is not an official government site).

## Colors
| Token | Value | Role |
|---|---|---|
| `primary` | `#1B2A4A` navy | masthead band, primary buttons, headings, links, case stamp, chart bars |
| `primary-hover` | `#26395F` | hover on primary |
| `primary-soft` | `#EEF1F7` | selected rows / tabs, soft panels |
| `accent` | `#E07A1F` orange | ≈5% of any view: current step in the case track, active nav underline, logo pivot and pans, focus ring. Never carries white text (3.0:1) |
| `accent-ink` | `#A8540D` | orange used as text on white (5.4:1) |
| `accent-soft` | `#FDF1E6` | "needs attention" panels (information requests, longest wait) |
| `bg` | `#F5F7FA` (slate-50) | page background |
| `surface` | `#FFFFFF` | panels, forms, tables |
| `text` | `#18233B` (slate-900) | body text (15:1) |
| `muted` | `#5E6A82` (slate-500) | secondary text (5.4:1) |
| `danger` | `#B42318` | errors, destructive |
| `success` | `#1E7A46` | confirmations |
| flag | `#000000` / `#BB0000` / `#006600` | the tricolour rule only |

The Tailwind `slate-*` ramp is re-pointed to navy-tinted neutrals in `src/app/globals.css`, so every existing `slate-*` class is on-brand. Dark mode: not offered (light only, `color-scheme: light`); the logo's navy swaps to `#E8ECF4` when placed on the navy band.

## Typography
- **Roboto** for everything (chosen by the user; also the Judiciary portal's face), **Roboto Mono** for case numbers, PINs and codes only.
- Sizes: 14 (tables, meta) / 16 (body, inputs) / 20 (section titles) / 30 (page titles) / 48 (home headline only, 36 on phones).
- Weights: 400 body, 500 labels, navigation and buttons, 700 page titles and the home headline. Nothing else.
- Line-height 1.5 body, 1.2 headings. Prose ≤ 65ch. Sentence case everywhere; no all-caps labels.

## Layout & spacing
- Scale: 4 8 12 16 24 32 48 64 96. Within a group ≤ half the gap between groups.
- Public shell: utility strip 36px (navy-900) → masthead 80px (white) → page → footer (navy). Content max 1152px; forms max 640px.
- App shell (staff, commission, advocate): one navy band 56px with the lockup, links (active = 3px orange underline), user and sign-out; content on `bg`, max 1280px.
- Density: public comfortable (controls 44px); staff compact tables (rows 40px, 14px text).

## Elevation & shapes
- Borders for structure: 1px `slate-200`. Shadows only for floating things (menus): `0 8px 24px rgb(15 23 42 / 0.08)`.
- Radius: 6px controls and buttons, 8px panels, 4px tags and the case stamp. No pills. Nested = outer − padding.

## Motion
- Hover and focus: colour only, 150ms `cubic-bezier(0.23,1,0.32,1)`. No entrance animations, no hover growth. `prefers-reduced-motion` needs nothing because nothing moves.

## Voice
- Buttons are verb + object ("File a complaint", "Check status", "Send answer"). No "Submit", no exclamation marks, no hype words.
- Plain English and plain Kiswahili; the Commission speaks as "the Commission".

## Components (code)
- `src/components/brand/Logo.tsx` — `Logo` (full mark with Advocate / Complainant labels and tagline) and `LogoMark` (scales only); `tone="light"` for the navy band.
- `src/components/brand/Lockup.tsx` — the signature lockup (mark · tricolour rule · Commission name).
- `src/components/shell/PublicShell.tsx` — utility strip, masthead, footer for public, complainant and advocate-activation pages.
- `src/components/shell/AppHeader.tsx` — the navy band for staff, commission and advocate portals.
- `src/components/case/CaseStamp.tsx`, `StageTrack.tsx` — case number stamp; case progress (current step in orange).

## Do's and don'ts
- Do: one primary (navy) button per view; orange only for the current step, the active nav item, the focus ring and the logo.
- Do: tables and rows for staff data; task links (not cards) on the public home.
- Don't: gradients, glows, emoji, icon tiles above headings, identical card grids, pill buttons, white text on orange, the coat of arms.
- Corrections log:
  - The logo's words are tiny relative to the scales: below ~450px wide use `textScale` (1.6–1.8) on `Logo`; the header `LogoMark` draws strokes 2.2× so the pan strings survive at 32–40px.
  - Attention states (information requests, minutes, unread alerts, clash warnings) use `accent-soft` with `accent-ink` text, never Tailwind amber/yellow.
  - Navigation never wraps on phones: one horizontally scrolling row.
