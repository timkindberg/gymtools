# Coaching log

Dated record of program decisions so any future Claude session can pick up the
thread. Newest entries at the top. When you change `js/program.js`, add an entry.

---

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
