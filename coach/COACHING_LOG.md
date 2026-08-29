# Coaching log

Dated record of program decisions so any future Claude session can pick up the
thread. Newest entries at the top. When you change `js/program.js`, add an entry.

---

## 2026-08-29 — Deadlifts have a home now

Mid-session, Tim asked if he could deadlift — he'd started Day B by accident and
wanted to pull. Answer was yes (nothing in his constraint set rules it out; the
setup isn't deep loaded flexion), but the registry had no deadlift, so the only
way to log it was to pollute the `barbell-rdl` slot's history — the same
cross-implement quirk that bit the b3 slot in session 1.

- Added `trap-bar-deadlift` and `barbell-deadlift` to the registry (hinge →
  posterior-chain), and both to the **b1 RDL slot's 🎲 alternatives**, trap bar
  FIRST. At 6'3" with tight hamstrings, the trap bar is the better default: more
  upright torso, less lumbar shear, and far easier to keep the hips square,
  which matters more than usual for him.
- Seed links: deadlift ≈ 1.25 × his RDL, trap bar ≈ 1.05 × straight bar. So a
  first-time pull gets a suggested load off his logged RDL instead of nothing.
- Guidance given: deadlift INSTEAD of the RDL on Day B, never both — 8 heavy
  hinge sets in one session is a hole he'd spend the week climbing out of.
- Flagged as data, not a veto (per his standing instruction): heavy pulls are
  the most systemically taxing thing he can do, and his migraines follow very
  taxing sessions by ~5 h. Log the migraine prompt honestly and the app's
  threshold insight will eventually have something to say about it.
- v32 → v33.

If deadlifts stick, the question for the next block is whether they replace the
RDL as Day B's hinge or rotate with it. Waiting on data.

## 2026-08-29 — Day C rewritten: the missing press, and an optional leg slot

Tim asked whether consistency alone would deliver, or whether the program needed
changing. Volume audit of a guaranteed-Friday week found the real hole: **chest
was 4 sets/week** (Monday's bench, full stop) while hamstrings/glutes ran ~13
and back ~10 — and Day C, the "bonus" day, had **no press at all** and four of
eight slots on lower body, stacked on top of two already leg-heavy days.

He scoped the fix himself: rewrite C only, add the press, make the least
important leg movement optional. **A and B untouched.** Friday remains a
possible skip.

- **New slot `c9` — Neutral-Grip DB Incline Press**, 4×8–12 @ RPE 8, start 45
  (per-hand, from the OTF incline seed). Placed FIRST on the day so it gets
  fresh effort. Takes chest from 4 → 8 sets on a week he trains Friday, and adds
  a second weekly pressing exposure at a different angle. Neutral grip + ~30°
  incline for the right shoulder; 🎲 to barbell incline (he chose it in session
  1 and may prefer it), machine chest press, or flat neutral DB.
- **`c2` DB Lateral Lunge → "(optional if time)" and moved LAST.** His heel lift
  is back in and the right-side symptoms have settled, so frontal-plane adductor
  work is the least urgent thing on the day; Monday's reverse lunge and
  Wednesday's single-leg press already carry single-leg strength. Sitting last
  means a lunch-break Friday drops this, not the press — and he can run it on a
  weekend when he has more time. Follows the existing `b7` convention (name
  suffix), so no UI change was needed.
- Day renamed **"Day C — Bonus: Press, Glutes & Arms"**; note rewritten from
  pure leftovers ("no guilt") to "still skippable, but it holds your second
  press of the week." Day order is now c9, c1, c3, c4, c5+c6 (S1), c7, c8, c2.
- `c4` Single-Leg DB RDL explicitly kept despite the heel-lift improvement — his
  hamstrings are tight independent of the leg-length issue.
- **Slot ids are permanent.** Logged entries carry `exerciseId`, and
  `store.lastPerformanceInSlot()` / overrides read it, so c1–c8 were NOT
  renumbered to match the new order; the new press is c9, out of sequence, with
  a comment in the file saying why.
- v31 → v32 (version.js + sw.js cache). `validateProgram()` clean, 138 tests pass.

Next report to watch: whether Friday actually happens, whether chest starts
moving now that it has two exposures, right-shoulder response to the added
pressing volume, and whether right-side tightness stays down with the lateral
lunge demoted (reinstate it if the trend turns).

## 2026-08-28 — A ramp you can load

`js/plates.js`, and the first thing in the app that knows a bar is *loaded*
rather than dialled. The percentage ramp was arithmetically correct and
practically annoying: 50 / 70 / 85% of 150 is 75 / 105 / 127.5, which means
stripping the bar twice on the way up.

The rule that makes a ramp loadable is that every step above the first is a
**prefix of the working set's plate stack**. Load the big plates first and from
there you only add — the 45s go on and stay on, then the 5s, then the 2.5s.
Where the jump from the empty bar to that first prefix is too big to be a
warm-up, one bridge step gets built from smaller plates, and those come back
off. That swap is real, so it is shown rather than hidden, and it happens once,
early, with the lightest plates in the ramp:

```
 45   empty bar          × 5
 95   + 25               × 5
135   ⇄ 25 off, 45 on    × 3
145   + 5                × 2
150   + 2.5              work
```

`rampLadder()` guarantees the ramp rises, starts at the bar, stops below the
working set, is at most four sets, and strips the bar at most once — all of
that is pinned by tests across loads from 95 to 315. A machine or a cable stack
keeps the percentage ramp, because a pin genuinely is dialled and there are no
plates to talk about.

The chip carries the loads (`🔥 45 · 95 · 135 · 145`) since that's what you
glance at between sets; the drawer carries the plate order and ends with the
working set's full stack, which retired the separate 🏋️ Plates chip wherever a
ramp exists. The old inline plate helper moved into the module, so the Program
view and the session card now do their plate math the same way.

Two smaller things from the same pass: the chip is labelled **Cues** rather than
Notes, since that's what's in it; and tapping a set's role badge now says what
it did — "Ramp-up — ignored by the next suggestion". The role decides whether a
set feeds the engine at all, which is too consequential to convey by relabelling
a button silently.

---

## 2026-08-28 — The session card, rebuilt around the three moments

The card had absorbed eight features across four chunks and showed all of them
at once, in one flat stack of ten equally-weighted zones. Nothing on it was
wrong; the problem was that everything had the same weight, so the number you
came for competed with the paragraph explaining it. Rebuilt around what the card
is actually for at any given second:

- **Decide** (~8× a session) — the prescription, now one block at the top.
- **Log** (~30× a session) — the grid, moved directly under it, ~120px higher.
- **Consult** (a few × a month) — why, cues, plates, ramp, history, the engine's
  reasoning, swap, video. All of it folded behind one chip strip and a ⋯ menu.

**The bug this exposed, and the real fix.** The card led with a single target
rep count — `150 lb × 8` — while the prescription was a *range* of 8–12. That
reads as "stop at 8", and there was nothing anywhere in the app saying that 12
on every set is what releases the next plate. Double progression only makes
sense if both ends are on screen. So the prescription block now shows **load ×
range**, a three-cell strip for **sets / RPE ("2 in the tank") / rest**, and one
generated line stating the terms:

> Clear 8 today. Every set at 12 takes you to 160 lb.

That sentence is `progressionTerms()` in the engine, not copy in the view, so it
stays true for a hold ("Every set to 12 — that's what takes you to 160"), a
coarse dumbbell rack ("14 is what earns the 5 lb jump"), a deload, and a lift
held back by pain, where nothing is dangled at all. `jumpPreview()` is the new
pure function underneath it — what topping the range would earn.

Also new on the engine's return value: `headline`, a verdict short enough to sit
under the load without wrapping ("Load goes up"), with the full sentence and the
basis line one tap behind a `?`; and `range`, so the card can never again show a
target without the range it was read against.

**The session is a focus stack.** Six open cards is a session-level problem no
amount of card-level tidying fixes, so everything but the lift you're on
collapses to a line — name, what it asks for (or, once done, what you actually
did), and a dot per set. A progress bar replaces counting cards, **Next lift ›**
advances, and the active lift is remembered in the draft, so closing the app
mid-session brings you back to where you were. A ⇄ superset opens as a pair in
one tinted container: alternating between the two is the entire point of the
pairing, so hiding one of them would break it.

Not taken, deliberately: tap-to-log a pre-filled load. It's the fastest thing on
the table, but the data model rests on the athlete typing the number, and a tap
meaning "yes, exactly that" is different evidence. Worth deciding on purpose
rather than drifting into.

---

## 2026-08-28 — The coaching model (chunk 4), and a decision about 5/3/1

Issues #11 and #12 of the rewrite (#13). **#10 — opt-in 5/3/1 wave mode — was
deliberately not built.** The reasoning, so nobody re-opens it by accident:

- The ramp-to-a-top-set shape in his log was **not intentional** — it was him
  dialling in weights on lifts he'd just started. Building a whole percentage
  template on top of a pattern the athlete didn't mean to create is
  data-fitting, not coaching.
- On the merits, 5/3/1 is a well-earned template for an intermediate who has
  **stalled** on linear progression and needs sub-maximal work, slow training-max
  growth and scheduled deloads. Tim is currently beating his numbers session to
  session. Its Training Max march (+5 upper / +10 lower per four weeks) is
  *slower* than what he's banking, so adopting it now would cost him progress to
  buy structure he doesn't yet need.
- Fit is poor besides: it assumes four days around squat/bench/deadlift/OHP; he
  trains three with Friday skippable, hinges with an RDL (a bad AMRAP lift), and
  a meniscus that has no business near a 1+ single on a box squat.
- The mechanisms that make 5/3/1 work are already in the engine and stay there:
  a training-max ceiling, percentage increments, RPE as the autoregulation
  signal, stall detection, and a scheduled deload.

**Ramping itself is worth doing on purpose**, independent of any template —
warming up into a heavy compound rehearses the groove under rising load and gets
a 44-year-old knee and shoulder through their first reps submaximal. So the app
now *prescribes* the ramp (`warmupRamp`) on heavy barbell and machine compounds
— bar, ~50%, ~70%, ~85% — collapsed on the card, marked as ramp sets, and
ignored by the engine. Isolation work gets none: a 12.5 lb cuff cable **is** the
warm-up.

**Revisit #10** when the engine reports a genuine stall (2+ consecutive) on the
main barbell lifts and a deload hasn't cleared it. That's the trigger; until
then it stays closed-in-spirit and open on the tracker.

What did ship:

- **Coach report v2 (#11).** It now leads with **what the app will prescribe
  next session** for every movement, with the engine's rationale and which sets
  it counted — the thing a review has to correct *before* he trains. Below that:
  the last three sessions set by set with roles (`[ramp]`, `[fail]`), logged
  RPE, and the **per-exercise notes**, which is where all his real effort signal
  lives ("could probably have done 2-3 more"). The v1 report kept only the best
  set per movement, so a failed 30 followed by two back-off sets at 25 read as
  "top set 30". Est. 1RM is labelled an Epley estimate everywhere it appears.
- **The weekly loop closes (#11).** The report ends by asking for a fenced block
  of adjustment lines (`Barbell Bench Press: 155 x 8 — take the jump`); Settings
  → **Coach adjustments** parses them into per-movement overrides. An override
  steers exactly one session and then retires itself once that lift has been
  trained again — a week-old correction never outlives its evidence. Every
  override is recorded alongside what the engine had proposed, and the report
  tallies the direction: three corrections up and none down means the increment
  band is too small, and says so.
- **Cross-implement seeding (#12).** A movement with no history is seeded from a
  cousin that has some — his own numbers say a 60/hand single-arm row and a 125
  barbell row are the same job. Ratios live in one table of reciprocal links in
  `js/movements.js`, rounded **down** to a real increment (a first set too light
  costs one set; too heavy costs a week), shown in a distinct style with "worked
  back from…", and structurally barred from history, bests, charts and training
  maxes. Machines are almost absent from the table on purpose: a lever arm can
  make the number on the stack mean anything.

---

## 2026-08-27 — The progression engine (chunk 3)

Issues #7, #8 and #9 of the rewrite (#13). `suggestion()`'s fifteen lines are
gone; `js/engine.js` is a pure function — `nextPrescription({ movement,
prescription, history, symptoms, flags, scheduledDeload })` — with no DOM, no
storage and no clock, unit-tested against the backup fixture with an expected
answer written down for **all 20 movements**.

- **Increments are a percentage of the working load** (#7), rounded to the
  smallest step that lift can actually take: 5–10% on a lower-body barbell or
  machine, 2.5–5% on everything upper-body, dumbbell and cable; 5 lb on a bar
  or a dumbbell, 2.5 on the cable stack. Nothing may add more than 10% in one
  session.
  - **When the smallest step in the gym is bigger than the target percentage,
    reps come first.** That single rule kills the +40% jump on the 12.5 lb cuff
    cable and the +17–20% jumps on the dumbbell lunges, without special-casing
    any of them. The rep range stretches (12–15 becomes 17), and the load step
    waits until it's spent — at which point the reps reset to the bottom of the
    range to absorb it. That reset is the *only* licensed exception to the 10%
    cap, because 30×12 → 35×8 is the same work rearranged, not an overload.
  - **RPE gates the step** (from #5). Four-plus left at the top of the range
    jumps two increments (capped); at failure it holds. No RPE degrades to the
    reps-only reading, never to anything worse.
  - **Pain and symptoms finally do something.** `entry.pain` was stored and
    never read: one flag holds the load, two in a row suggests a 🎲 swap. A
    check-in score over threshold on a joint the lift leans on (knee ≥ 4,
    shoulder ≥ 4, tightness ≥ 5) holds it for the day, as does an empty tank
    (energy or sleep ≤ 3). Keep the pattern, skip the PR.
  - **Training max ceiling** (5/3/1's idea, as a guard rail): never ask for a
    load past what his best set demonstrates for the prescribed reps, plus one
    increment. Stops a lift he ramps to a single top set running away.
- **There is now an exit from "repeat"** (#8). A stall is *reps and load*, not
  e1RM: consecutive sessions with no gain, at RIR ≤ 1, not counting a session
  that topped its range (that's a completed range waiting for load) or one he
  left reps in. One stall prompts; two deload to ~90% and rebuild. The report
  and the engine now share that one definition — the old `STALLED` tag read
  e1RM, which drifts on high-rep work and doesn't exist for a carry or a plank.
  - **Scheduled deloads**: every 4 consecutive *trained* weeks (configurable in
    Settings, 0 = off, with a rolling trigger if knee/tightness/shoulder average
    ≥ 5 across a week). Counted in weeks he actually trained, so a skipped week
    is its own rest — right for a man whose Friday is explicitly optional. The
    deload week drops ~10% and takes a set off each card, and is **recorded on
    the entry**, so the chart and the report call it a planned reset instead of
    a regression.
- **Everything that isn't loaded reps got a comparator** (#9). Side Plank
  (45s + 45s at the ceiling) finally produces "take it to 55s, or add a
  dumbbell". Carries progress distance to target, then load, and never report an
  estimated 1RM. Assist stacks invert — progress is a *smaller* number on the
  pin, and the engine reads a drop in assistance as progress, not a regression.
- **Program change:** added **c8 Dead Hang** (2 × 20–45s) to Friday. He was
  already doing them off-program ("Dead hang for 25 seconds. I need more
  callouses.", 2026-08-24) with nowhere to log them; grip is what his carries
  and rows run out of first, and the shoulder likes the hang.

102 unit tests, plus a browser pass: a symptom flare holding the squat, a
four-week deload week banner, the trimmed set, and the deload flag reading back
off the saved session.

For the next report: the engine is only as good as the RPE. Tap the chip on the
top set — that's what separates "too light" from "that was your limit".

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
