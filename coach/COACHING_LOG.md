# Coaching log

Dated record of program decisions so any future Claude session can pick up the
thread. Newest entries at the top. When you change `js/program.js`, add an entry.

---

## 2026-08-20 — Cloud sync live (Supabase)

Shipped optional Supabase cloud sync and Tim confirmed sign-in + sync works.
- Architecture: single `app_state` row per user (whole app-state JSON),
  last-write-wins by timestamp; email-OTP (6-digit) auth; vendored UMD SDK
  (js/vendor/supabase.umd.js, no CDN dep); all sign-in-gated so local-only
  behavior is unchanged. Config/keys in js/config.js (publishable key, safe).
- Supabase project ref: nkzwschaooasinmxknip (Tim's account). Table + RLS
  ("own state", auth.uid() = user_id) created and verified.
- Hardening TODO (optional): disable public signups in Supabase Auth now that
  his account exists, and set sync.js sendCode shouldCreateUser:false.
- Unlocks a future automated coaching loop (a scheduled session could read his
  data directly) — not built yet; coach report is still the current mechanism.

## 2026-08-19 — Session 1 review (Day B)

First real workout, went well. Actual weights (he beat my conservative seeds
on most — recalibrate upward via the app's history, no manual reseed needed):
- Barbell RDL 165×? (seed was 135), Lat Pulldown 160 (seed 120), Single-Leg
  Leg Press 130 (seed 100), Seated Leg Curl 150 (matched), Cable ER 12.5
  (seed 10), Suitcase Carry 60 (seed 50).
- Swapped the b3 slot (Seated DB Shoulder Press) → **Barbell Incline Press @135**
  via 🎲. He may prefer incline; offered to make it the default. NOTE: logging a
  barbell-incline weight under the b3 (DB shoulder press) slot means the slot's
  next "last time"/suggestion will read 135 — cross-implement history quirk.
- Symptoms all clean: knee 0, tightness 2, shoulder 1, neck 0, energy/sleep 7.
  No migraine (first session). Body tolerated it well.
- Duration ~1:10 (target ~50); he attributes it to learning the app/movements
  and was happy with it. Expect it to compress as logging/movements get automatic.
- Reminder: e1RM figures are rough Epley estimates, inflated at high reps and
  meaningless for the carry — treat as trend lines only.
- Fixed coachReport()'s "Coach, please" text: it was emitting the stale
  "shoulder no overhead" rule. Now points to PROFILE.md as the living source.

NEXT DIRECTION (his ask): move to a proper DB-backed app (Supabase leaning),
developed IN TANDEM so the GitHub Pages localStorage version keeps working for
his next workout. Plan: one codebase, storage-adapter seam, cloud sync additive
behind sign-in; default stays local/offline. Awaiting him to create a Supabase
project (URL + anon key) — the one thing only he can do.

## 2026-08-18 — Shoulder: overhead press cleared; upright row is the culprit

Tim clarified the shoulder aggravator is the **upright row** (standing, elbows
flared, pulling to the chin), NOT overhead pressing. Overhead press is fine.
- Removed the blanket "no overhead press" constraint everywhere (kept: no
  upright row, no behind-the-neck).
- Day B `b3` changed from Neutral-Grip DB Incline Press → **Seated DB Shoulder
  Press** (start 35; incline is now the 🎲 swap). Gives vertical-press balance
  (Day A horizontal bench / Day B vertical press). Emphasized cuff warm-up +
  autoregulation — his OHP strength drops fast when the shoulder's tired.
- Also seeded per-exercise `start` weights from his OTF dumbbell numbers and
  added a barbell plate-loading helper (see git log).

## 2026-08-17 — Vision reframe + machine-forward hybrid

Tim asked Claude to own the vision ("you're the boss") and stop making him
choose; wants a hybrid that changes up, "nothing '-first'." Also reported his
first solo session — a big machine circuit he loved — and confirmed a heel lift
is incoming.

- **Principles rewritten** around a rotating-hybrid vision (strong/balanced/
  durable; variety on purpose; barbells/DBs/machines all tools, none primary).
  Removed "-first" language everywhere (program, README, PR).
- **Machines promoted to a featured tool** (he loves the sit-down convenience &
  fast weight changes; also safe-to-failure solo and joint-friendly). Flipped
  Day B's unilateral leg slot to **Single-Leg Leg Press** as the default
  (was Bulgarian split squat, now the swap). Kept barbell box squat / bench /
  RDL / hip thrust so he still builds bar skill he wants.
- **Supersets made explicitly optional** with an in-app hint — he found holding
  two machines impractical (others poach the empty one). Guidance: pair a
  machine with DBs/bench, or just do straight sets.
- **Heel lift confirmed incoming** → leg-length work is now "build balance on top
  of the fix," not damage control.
- Logged his baseline machine numbers in PROFILE.md for starting-load reference.

Next block: once he's logged ~2–4 real weeks in the app, lean further into what
he actually enjoys/adheres to; watch shoulder-press/overhead tolerance (he did
machine shoulder press this session — monitor).

## 2026-08-17 — Block 1 finalized (post-intake)

Third pass, after a full intake conversation. Net changes:

- **Barbells promoted to primary.** Tim clarified he wants the full toolbox and
  is only *less experienced* with the bar, not uninterested. Big lifts are now
  barbell-first with a `learn: true` "technique focus" flag, `techNote` form
  guidance, and a "groove it light for 1–2 weeks" instruction. DB/machine
  versions remain as 🎲 swaps.
  - Day A: Barbell Box Squat, Barbell Bench Press.
  - Day B: Barbell RDL, Pull-up/Pulldown, Barbell/DB Incline.
  - Day C: Barbell Hip Thrust.
- **Stopped pandering to migraines.** Removed the RPE cap / sub-failure framing
  and the migraine/fatigue "back off" alerts. Intensity is now normal-hard:
  top sets RPE 8–9, accessories to failure. Kept the migraine follow-up prompt
  as *data only*. Injury alerts remain for knee/shoulder/tightness only.
- **Structure:** Mon & Wed are complete anchors; Friday is an explicit skippable
  bonus day (leg-length, single-leg, arms, mobility). ~50 min via supersets.
- **Leg length** remains the organizing theme (unilateral, loaded stretching,
  carries, standalone mobility routine, tightness tracker).
- **Built the coaching bridge:** `store.coachReport()` + Settings → "Coach
  report" generates a paste-ready Markdown summary (progress per lift with stall
  detection, symptoms, migraine count, pain flags, bodyweight, notes). Added
  `coach/PROFILE.md` as persistent memory.

Open follow-ups for next block:
- Confirm whether a heel lift / orthotic got evaluated (biggest ROI for the
  leg-length issue).
- Once ~4 weeks of data exist, check the migraine-vs-load insight and the
  right-side-tightness trend; adjust volume/exercise selection accordingly.
- Watch the barbell lifts for form-limited stalls vs true strength stalls.

## 2026-08-17 — Blocks 0/0.5 (initial build + first revision)

- Initial build: injury-aware DB/machine full-body PWA (tracking, progression,
  symptom check-ins, PWA offline, GitHub Pages deploy).
- First revision from partial intake: added Watch metrics, restructured toward
  Friday-optional, added leg-length focus. Superseded by the Block 1 pass above.
