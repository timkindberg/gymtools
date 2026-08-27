# Coaching log

Dated record of program decisions so any future Claude session can pick up the
thread. Newest entries at the top. When you change `js/program.js`, add an entry.

---

## 2026-08-27 — Capturing the two signals we were throwing away (chunk 2)

Issues #5 and #6 of the suggestion-engine rewrite (#13). No program content
changed; the app now collects two things it was prescribing but never recording.

- **RPE / reps in reserve** (#5). New `js/effort.js`. The last working set of
  each exercise gets a one-tap chip row — `0 · 1 · 2 · 3 · 4+ left` — asked as
  "reps left in the tank" and stored as `rpe` on the set (Zourdos RIR scale:
  10 = failure, 9 = one left, 8 = two). It's optional and it never blocks
  saving; with no RPE the engine falls back to exactly its old reps-only
  behaviour. The chips appear only once a set has something in it, so an RPE
  can't be parked on a blank row and dropped at save.
  - The three misses from the issue's evidence table are now right:
    **a4 Reverse Lunge 30×8** with "could maybe handle 5 more on each side"
    goes from *repeat 30* to **35, and 40 if that's still easy**;
    **b2 Lat Pulldown 160×8** at failure stops being told to *add reps at 160*
    and is told to hold it; **a1 165×8** at RPE 8 adds load as before, but at
    RPE 10 holds instead.
  - Effort now rides along in the coach report ("last working set RPE 8
    (2 left)"), in the session log (`165×8 @8`), and in the suggestion's basis
    line, so a stall and a set with three reps in the tank stop looking alike.
- **Which side gave out first** (#6, cut down). Tim pushed back on full per-side
  logging and he's right: he loads both sides the same and matches reps to the
  weaker one, so per-side weights and reps would read identical every session —
  a metric that can only ever say "level". I built it, then took it out
  (`js/sides.js`, split rows, the asymmetry index, and a roll-up that quietly
  redefined `set.weight` as the weaker side's number — a permanent tax on the
  data model for a toggle he'd never switch on).
  - What replaced it: **one optional tap per unilateral exercise, L or R, for
    the side that gave out first** — the observation he actually makes ("right
    side could have done more, left had a harder time"). It rides next to the
    RPE chips, shows on the exercise card ("left side was the harder one last
    time"), tags the session log, and gets a **Harder side** section in the
    report counting how often each side is flagged out of how many sessions.
  - It is deliberately qualitative and touches no numbers: no suggestion
    changes because of it. If a side gets flagged session after session, that's
    my cue to look at it in a review — which is the right place for that call,
    not the load engine.
  - Issue #6 stays open with this reasoning. If a rehab block ever calls for
    genuinely different loads per side, the full version is in the PR history.
- No data migration needed: both fields are optional and additive, so the store
  stays at version 5. 78 unit tests, plus a browser pass over the whole flow —
  log sets, rate one, flag a side, save, read it back in history and the report.

For the next report: I'm looking for RPE on the top sets. Without it, #7's real
engine is still guessing on every "should he add weight or add reps" call.

## 2026-08-26 — Swap lists must match the muscle group

Tim's rule, from finding an incline barbell press offered in the shoulder-press
slot: **every alternative in a slot works the same muscle group as the slot.**
Audited all 20 slots against it — 16 already passed.

- **b3 Seated DB Shoulder Press**: dropped Neutral-Grip DB Incline Press (a
  chest press). Now swaps to Machine Shoulder Press or Barbell Overhead Press.
- **a2 Barbell Bench Press**: gained the DB incline press, where it belongs.
- **c6 Triceps Rope Pushdown**: dropped Dips (assisted) — a compound chest and
  triceps press, not an elbow-extension isolation, and it loads his right
  shoulder in a stretched position. Now swaps to DB Skull-crusher or Overhead
  Rope.
- Not changed, because they only violated my pattern LABELS and not his rule:
  b4's split squats standing in for a single-leg press (all unilateral
  knee-dominant), b7/c7 trading a carry for a side plank (both anti-lateral-
  flexion core), c2's adductor machine under the lateral lunge (both adductors
  / frontal plane).
- Enforced rather than re-audited by hand: `swapGroup()` in movements.js maps
  the fine-grained `pattern` onto the coarser "does this train the same thing"
  question, `validateProgram()` fails on any mismatch, and a test asserts it.
  Adding a swap that doesn't fit the slot now breaks the build.

b3 and c6 are down to two alternatives each, which is thin for a program whose
whole pitch is variety. Candidates to add if he wants them: b3 — Landmine Press
(shoulder-friendly) or Half-Kneeling Single-Arm DB Press (doubles as core /
leg-length work); c6 — Overhead DB Extension or Single-Arm Cable Pushdown.
Dips could move to a2 as a chest alternative on the same reasoning. Not added —
these are program-content calls and he hasn't asked for them.

## 2026-08-25 — Data model rebuilt for the progression engine (chunk 1)

Issues #2, #3, #4 of the suggestion-engine rewrite (#13). No program content
changed — this is the foundation the new engine gets built on.

- **History keys on the movement, not the slot** (#2). New `js/movements.js`
  registry: every exercise is a stable slug carrying `implement`, `loadMode`
  (total / per-hand / per-side), `measure` and `pattern`. `js/program.js` slots
  and their `alternatives` now reference slugs; entries persist `movementId`.
  This kills the cross-implement quirk logged on 2026-08-19: his Barbell Incline
  Press logged in the b3 slot no longer prescribes 135 for a per-dumbbell
  Seated DB Shoulder Press, and the same holds for a3 (Barbell Row) and c6
  (DB Skull-crusher). The b3 slot now correctly shows "first time on this one",
  with a context line naming what he actually did in that slot last week.
  Resolved 2026-08-26: he confirmed a barbell incline CHEST press does not
  belong in a shoulder-press slot, so it stays a registry movement (for history)
  and out of b3's swap list. The reason it was ever offered: on 2026-08-19 the
  b3 slot itself was "Neutral-Grip DB Incline Press", which listed Barbell
  Incline Press as an alternative, and his phone was on that cached build.
  The DB incline press was dropped from b3 for the same reason on 2026-08-26 —
  see the entry above.
- **Set roles: ramp / work / back-off** (#3). Inferred as he logs (sets below
  the session's heaviest that precede it are ramps; those that follow are
  back-offs), overridable with one tap on the set row, and never overwritten
  once he sets one by hand. Progression, charts and e1RM read working sets only,
  so his ramps (every barbell lift is one) stop counting as work.
- **Failed top sets** are detected on two independent signals, so the rule holds
  up past the one case in the issue. (1) The reps: the top set missed the BOTTOM
  of its prescribed range and he came down afterwards — this catches a failure
  anywhere in the sequence, including after a ramp, which is the shape most of
  his barbell lifts are logged in. (2) The shape: he opened with his single
  heaviest set and spent the rest of the exercise underneath it — unless he
  topped the range on it, which makes dropping the weight afterwards read as a
  deliberate back-off instead. c5's 30 / 25 / 25 resolves to a working weight of
  25 either way; a ramp-then-miss (95, 135×3, 115, 115) now resolves to 115
  instead of "repeat 135". A planned top-set-then-back-off is left alone.
  Sessions now record the prescription they were held to, so a later program
  change can't retroactively reinterpret an old session's roles.
- **Typed measures + validation** (#4). Movements declare reps / time /
  distance, prescriptions are structural (`{measure, min, max, perSide}`) rather
  than scraped out of "8–10/side", and the set row labels its columns (`lb`,
  `lb/hand`, `lb/side` × `reps`, `sec`, `yd`). Suitcase Carry and Side Plank no
  longer report an estimated 1RM — e1RM is gated to loaded rep work at or below
  15 reps. Entry-time checks warn (never block, always one tap to override) on
  30+ reps, 600+ lb, or a >3× jump on that movement's own history.
- **The 140 × 120 hip thrust** is migrated as flagged, not silently kept. It's
  excluded from charts, bests and the report until resolved; History shows a
  "1 logged set to check" card with Fix / It's right. Worth doing on his phone.
- **Migrations** are versioned (data v1 → v5), sequential and idempotent; the
  in-flight draft upgrades too, so an app update mid-workout is safe.
  Attribution order for old entries: explicit `variant` → the `name` the entry
  recorded → the frozen `(slot → movement)` map in store.js. The recorded name
  beats the map on purpose: b3 has been a Neutral-Grip DB Incline Press AND a
  Seated DB Shoulder Press, so the slot map is a guess where the stored name is
  a fact. Never edit an existing line in that map, only append.
- **Tests**: `npm test` (node's built-in runner, no deps) — 52 cases over the
  registry, role inference, measures and the migrations, run against a v1 backup
  fixture rebuilt from the evidence tables in #2/#3/#4. His real 2026-08-25
  export becomes the fixture for the engine itself (#7). CI runs them on push.

Note for cloud sync: the stored blob is now v4. An older installed copy of the
app pulling it would misread sets (the `reps` key is now `amount`); the service
worker force-reloads stale clients, so in practice update the app on any device
before logging on it.

Still not readable from the numbers alone: a set ground out at the same weight
(135×8, 135×3, 135×2). Those classify correctly as three working sets and the
suggestion refuses to add load, but nothing marks how close to failure it was —
that needs RPE (#5), which is the point of chunk 2.

NEXT (chunk 2, #5/#6): capture RPE per set and per-side logging. The suggestion
heuristic itself is still the old flat +5/+10 — deliberately untouched here, and
replaced in #7.

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
