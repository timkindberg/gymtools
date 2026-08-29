# Athlete profile — Tim

> This file is Claude's persistent memory of Tim between sessions. Any Claude
> session working on this repo should read it first, then `js/program.js` and
> `coach/COACHING_LOG.md`, before changing the program. Update it when facts change.

## Basics
- 44yo, 6'3", 235 lb (as of 2026-08).
- On Lexapro (SSRI). No blood-pressure or heart issues. Cleared to train.
- Coming from Orange Theory; switching to a regular gym.
- Trains at **Blue Ash Rec Center**, Ohio. Lunchtime, **~50 min**, 3×/week
  (Mon / Wed / Fri). **Friday is the day he most often skips** — so Mon & Wed
  must each be complete; Friday is a bonus day. Confirmed again 2026-08-29:
  Friday stays a possible skip, so nothing essential may move onto it. He does
  sometimes make it up on a weekend, when he has more time than a lunch break.

## Experience & preferences
- Solid technique with **dumbbells and machines**. Interested in **all of it**,
  including barbells ("all of it") — just newer to the bar and form. Barbells
  are a tool he wants to build skill in, NOT the required centerpiece.
- **LOVES machines** (discovered on his first solo session, 2026-08). Reasons he
  named: sit down, pick a weight fast, adjust in a second, do the work. Fits his
  low-friction / no-thinking style and is safe to push hard solo. → machines are
  a **featured tool**, not a fallback.
- **Coaching style he wants:** Claude is "the boss." Have a vision, don't make
  him choose between options. He likes a **hybrid that changes things up** —
  "nothing '-first'." Variety keeps him (and his body) engaged.
- **Superset constraint:** in a busy rec center, tying up two machines at once
  fails — people poach the empty one. → don't program machine-to-machine
  supersets; make supersets optional and pair a machine with DBs/bench/bodyweight
  kept at the station, or just straight sets.
- Trains hard — dislikes being coddled.
- Liked about OTF: music, no thinking required, constant variety ("surprised my
  body"). → app should be low-decision and offer exercise variety (🎲 swap).
- Tracks calories in **LoseIt** → the app stays training + recovery only
  (no nutrition features).
- Has an Apple Watch (manual entry of HR/duration/calories — iOS can't sync to
  a web app), an OTbeat band (likely dies after OTF cancellation; ignore), and
  a home scale (manual bodyweight).

## Baseline — first self-run machine session (2026-08, pre-app)
Did a big machine circuit (enjoyed it a lot). Approx numbers, useful as starting
reference (machine stacks are NOT comparable across machines or to free weights —
progress each machine against itself):
- Leg press ~200 lb × 12 (3–4 sets); leg extension & leg curl ~150 × 12 (2 sets each)
- Lat pulldown 2×12; a rope/"rope-climb" pulldown variation too
- Shoulder press 2–3×12 **(overhead — the one to monitor for the right shoulder)**
- Chest fly 2, chest press 2, rear-delt fly 2, low row 2–3, high row 2
- Back extensions, crunches
- Finisher: stair climber ~16 floors
Takeaways: high work capacity, comfortable at 12-rep machine volume, minimal joint
complaints reported. Program can start near these loads and push.

## Strength reference — OTF dumbbell picks (self-reported, sub-failure)
Tim does NOT train to failure, so these are comfortable working weights (per
dumbbell unless noted). Used to seed the program's `start` weights.
- Chest press: 55–60 (60s ~3×12 fresh, no failure); 70s → failure at 6–10
- Bent/standing DB row: 55–60 (60s 3×8, 50s 3×12)
- Shoulder press: 40 fresh (3×8–12, may fail late); drops fast to 30–35, even 20–25 when shoulders tapped
- Single-DB deadlift: ~90 (one 90 DB, 3×8–12, challenging)
- Split-squat / lunge: 25–30 each (3×8–12)
- Single-leg step-up: 35–40 each (grip-limited before legs)
- High row: 25–30 (2–3×8–12)
- Chest fly: 30 (3×10–12)
- Rear fly: 12–15 (2–3×8–12)
- Goblet/DB squat: 35–40 each (2–3×8–12)

Seeded `start` weights in js/program.js (per-DB for DB lifts; stack for machines;
barbells deliberately conservative for technique): box squat 95, bench 135,
chest-supported row 50, reverse lunge 30, face pull 40, barbell RDL 135,
pulldown 120, DB incline 45, single-leg leg press 100, seated leg curl 150,
external rotation 10, suitcase carry 50, hip thrust 135, lateral lunge 25,
single-arm row 55, single-leg RDL 35, incline curl 30, triceps pushdown 40.
These are STARTING anchors — expect to adjust session 1, then double-progression
takes over. No biceps/triceps DB data given; those were estimated.

## Goals
1. Muscle & strength
2. Fat loss (driven by diet/steps, since in-session cardio is minimal)
3. Stay durable / reduce flare-ups

## Injuries & constraints (the program is built around these)
- **Leg-length discrepancy — THE top priority.** Causes progressive tightening
  of the right hip, leg, and back. He's "constantly trying to loosen it."
  Feels good after time off. → unilateral emphasis, loaded stretching for the
  right side, anti-lateral-flexion carries, daily "Loosen up" mobility routine,
  right-side-tightness tracker. **Heel lift: in use, and working
  (confirmed 2026-08-29 — "my leg length problems have not been so bad since I
  started wearing my heel lift again").** That handles the structural base, so
  training now builds balance ON TOP of it (unilateral work, carries, mobility)
  rather than damage-control. Frontal-plane/adductor work has been de-prioritized
  accordingly (Day C lateral lunge is now optional); if the tightness trend turns
  back up in the coach report, that's the first thing to reinstate.
- **Right knee (meniscus).** Only really hurts at **deep loaded flexion**;
  otherwise robust, rarely flares (occasionally with running). Stable lately.
  → cap squat/press depth (box squats, limited-ROM leg press), build quad +
  posterior chain, no pivoting/twisting under load. Mid-range loads are fine to
  push hard.
- **Right shoulder (wear).** The confirmed aggravator is the **UPRIGHT ROW**
  (standing, elbows flared out, pulling the weight up to the chin/shoulders) —
  keep that OUT. **Overhead pressing is OK** (Tim cleared it, 2026-08): warm the
  cuff, keep form clean, autoregulate (his shoulder-press strength drops fast
  when the shoulder's tired — 40s fresh → 20–25 when tapped). No behind-the-neck.
  Keep the big dose of rotator-cuff + scapular work.
- **Migraines.** Triggered by **very taxing sessions (onset ~5 h later) or
  alcohol.** He treats them (ibuprofen, massage) and **explicitly does NOT want
  the program watered down for them.** → program at normal hard intensity; the
  app logs migraines purely as *data*, never to gate a workout. He flags them
  himself, after the fact, on the session that caused one (one tap on its recap
  card) — the app does not ask about the last workout before the next one. A
  session left unflagged a day out counts as migraine-free.

## Coaching loop (how Claude stays his trainer)
- Daily: he uses the PWA (check-in → lift → log). App auto-progresses loads.
- ~Every 4 weeks (or on a stall/pain): he taps **Settings → Coach report**,
  pastes the Markdown into a Claude chat, and asks for an update. Claude edits
  `js/program.js`, logs the change in `COACHING_LOG.md`, and pushes → the PWA
  updates via GitHub Pages.
- The app data lives only on his device; Claude cannot see it except via the
  pasted report. This repo is Claude's memory; the report is Tim's data feed.
