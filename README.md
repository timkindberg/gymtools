# gymtools 🏋️ — your pocket personal trainer

An installable, offline-first **Progressive Web App** that acts as a personal
trainer: it comes with an **injury-aware training program** built for Tim's
specific body, and it tracks everything a good trainer would track — every set,
rep, weight, and, just as importantly, how your knee / shoulder / neck feel each
session.

No accounts, no servers, no data leaving your device. Just a web page you install
to your home screen.

[**Live app:**](https://timkindberg.github.io/gymtools/)` *(after first deploy — see below)*

---

## What it does

- **Today** — shows the day's workout, a last-session recap, quick stats
  (weekly consistency, streak), and a one-tap **"Loosen up"** shortcut to the
  mobility routine.
- **Guided sessions** — a quick symptom check-in first (right knee, right-side
  tightness, shoulder, neck/headache, energy, sleep) plus a **"did a migraine
  follow your last workout?"** prompt. If something's flaring, the app warns you
  and points to the safer swaps. Then it's **one lift at a time**: the session is
  a focus stack, so everything but the exercise you're on collapses to a line
  (name, what it asks for, a dot per set), with a progress bar and a **Next lift**
  button. A ⇄ **superset** pair opens together.

  The open card leads with the **prescription** — load × rep range, then sets /
  RPE / rest, then the terms of the deal in one line: *"Clear 8 today. Every set
  at 12 takes you to 160 lb."* Double progression only makes sense if both ends
  are on screen. Under it: the engine's verdict, with the full reasoning and the
  sets it counted one tap behind a **?** — including holding back on a flare day,
  prescribing a deload when a lift stalls, and an **estimated start** for a lift
  you've never done, worked back from a related one you have. A chip strip opens,
  one at a time, the **warm-up ramp** into heavy barbell compounds (bar → ~50% →
  ~70% → ~85%, logged as ramp sets that never count toward progression), the
  **plate math**, your **last performance**, and the coach's notes, cues and
  injury flags. A **⋯** menu holds the rare stuff: 🎲 swap for variety, how-to
  video, remove a set.

  Then the set grid, a built-in **rest timer** (sound + vibration), and one tap on
  the last working set to record **how many reps you had left in the tank** (RPE),
  which is what lets the app tell "that was too light" from "that was your limit".
  Unilateral exercises get one more tap — **which side was the harder one** — so a
  side that keeps giving out first shows up in the coach report. Optional Apple
  Watch metrics (duration, HR, calories) at the end.
- **Loosen up** — a standalone 5–8 min mobility routine (right-side focus) you
  can pull up any day, especially rest days.
- **Program** — browse the full A/B/C program with the reasoning behind every
  exercise choice.
- **Progress** — strength charts (estimated 1-rep-max & volume) per exercise,
  **symptom trend lines**, a **migraine-threshold** insight (compares training
  load on days that triggered a migraine vs. days that didn't), cardio/HR
  charts, and your full session log.
- **Settings** — units (lb/kg), bodyweight tracking, rest-timer prefs,
  **coach adjustments** (paste back what your review decided), and
  **export/import** your data as JSON (your backup — do this regularly!).

## The program (why it looks the way it does)

Full-body, ~50 min, 3×/week. **Mon and Wed are complete anchor sessions;
Friday is a skippable bonus day** (leg-length work, single-leg, arms, mobility)
— so missing Friday, the most-skipped day, costs you nothing essential. It's a
**rotating hybrid** — machines, dumbbells, and barbells are all tools, none is
"the program"; the emphasis changes block to block to keep the body adapting and
the training interesting. Barbell lifts carry a 🎥 *technique focus* flag with
cues; any lift can be swapped to a machine/DB version with 🎲. Trained at normal
hard intensity (top sets RPE 8–9). Designed around the constraints from the intake:

| Constraint | How the program responds |
|---|---|
| **Leg-length discrepancy** (the priority — drives progressive right-side tightening) | Unilateral lifts throughout, loaded stretching for the right side, anti-lateral-flexion carries, a daily mobility routine, and a right-side-tightness tracker |
| Crooked / asymmetric posture | Heavy horizontal pulling, scapular control, anti-rotation core |
| Tight hamstrings | Hip-hinge patterning, hips-square cueing, mobility work |
| Right shoulder wear | Cuff + face pulls in volume; overhead pressing is fine (warm the cuff, autoregulate) — the move to avoid is the **upright row** (and behind-the-neck) |
| Right knee (meniscus, hurts only at deep loaded flexion) | Depth-capped box squats & limited-ROM single-leg work, quad focus, strong posterior chain, no deep loaded flexion or twisting |
| Migraines (triggered by very taxing sessions or alcohol) | **Not** programmed around — trained normally; the app just logs whether a session triggered one, as data |

> ⚠️ **Not medical advice.** This app was built around the injuries you
> described but can't examine you. Sharp, pinching, or radiating pain means
> stop and check with your doctor or physical therapist. Pain is data — log it.

Programming choices were grounded in current evidence-based practice
([meniscus rehab](https://pmc.ncbi.nlm.nih.gov/articles/PMC12283527/) —
quad strength & limited ROM; shoulder impingement —
[avoid overhead/behind-neck, prioritize scapular + cuff work](https://www.chicagospineandsports.com/blog/how-to-exercise-when-managing-shoulder-impingement-syndrome-a-guide-to-safe-and-effective-workouts);
cervicogenic headache — [low-load deep-neck-flexor training](https://theprehabguys.com/cervicogenic-headache-exercises/)).

## How the coaching loop works

The app is your **daily** coach; Claude is your **programming** coach between
blocks. They connect through a report you paste into a Claude conversation —
because your data lives only on your device (nothing syncs to a server).

| Cadence | You | The app | Claude |
|---|---|---|---|
| Daily | Check in, lift, log | Auto-progresses loads, rest timer, swaps | — |
| Weekly | Glance at Progress | Trends, stalls, symptom lines | — |
| ~Every 4 weeks | **Settings → Coach report → Copy**, paste into a Claude chat, ask for an update | Generates the report | Reviews it, edits `js/program.js`, pushes → your app updates |
| Same conversation | Paste Claude's adjustment block into **Settings → Coach adjustments** | Applies it to each lift's next session | Hands back `Barbell Bench Press: 155 x 8 — take the jump` |
| Anytime | Stall or pain? Send the report | | Reacts |

The report leads with **what the app will prescribe next session** for every
lift, with the reasoning and which sets it counted, then the last three sessions
set by set — roles, RPE and your per-exercise notes included. That's the part a
review corrects. Corrections come back as one line per movement, apply to that
lift's **next session only**, and are recorded next to what the app had proposed:
if the review keeps pushing a number up, the report says the increments are too
small.

Claude's memory of you lives in [`coach/PROFILE.md`](coach/PROFILE.md) and the
[`coach/COACHING_LOG.md`](coach/COACHING_LOG.md), so any future session is
instantly up to speed on your intake and every past program decision.

## Deploying to GitHub Pages

This is a plain static site — no build step.

1. Merge this branch into `main`.
2. In the repo: **Settings → Pages → Build and deployment → Source: “GitHub Actions”.**
3. The included workflow (`.github/workflows/deploy.yml`) deploys on every push
   to `main`. The app will be live at `https://timkindberg.github.io/gymtools/`.
4. On your phone, open that URL in Chrome/Safari and **Add to Home Screen** —
   it installs like a native app and works fully offline.

## Tech

Vanilla JS (ES modules), no framework, no runtime dependencies. Data in
`localStorage`. Offline via a service worker (`sw.js`) that precaches the app
shell. Injury-aware program + coaching content lives in
[`js/program.js`](js/program.js) — that's the file to edit when it's time to
change the program.

The data model underneath it:

| file | what it owns |
|---|---|
| [`js/movements.js`](js/movements.js) | the movement registry — every exercise as a stable slug with its implement, load mode (total / per-hand / per-side), measure and pattern. **History keys on the movement, not the program slot**, so a 🎲 swap never hands one implement's weight to another. |
| [`js/measures.js`](js/measures.js) | what the second column counts (reps / seconds / yards), structured prescriptions, the estimated-1RM guard, and the entry-time sanity checks. |
| [`js/sets.js`](js/sets.js) | set roles — ramp-up, working, back-off — inferred as you log and overridable with a tap. Load suggestions read working sets only. |
| [`js/effort.js`](js/effort.js) | RPE / reps in reserve, plus which side gave out first on unilateral work. One tap each on the last working set, asked as "reps left in the tank" and stored on the RPE scale the program prescribes in. Optional everywhere: no RPE falls back to the reps-only behaviour. |
| [`js/engine.js`](js/engine.js) | the progression engine — what to lift next, and why. Percentage-based increments rounded to what the gym actually has, RPE gating, pain and symptom guard rails, stall detection and deloads, its own comparator for timed, bodyweight and carry work, the warm-up ramp, the cross-implement seed for a lift with no history, and the sentence stating what topping the rep range earns. |
| [`js/plates.js`](js/plates.js) | what goes on the bar, and in what order. A ramp isn't a set of percentages, it's a sequence of loads you have to build: every step above the first is a prefix of the working set's stack, so plates go on and stay on. Where one bridge step has to come back off, the ramp says so. |
| [`js/store.js`](js/store.js) | persistence, versioned migrations, movement history, the coach report, and the review's corrections coming back in. |

These six are pure modules — no DOM, no storage — which is what makes them
testable.

### How the load suggestion is made

`nextPrescription()` reads only the sets that were **work** (a ramp-up isn't a
data point, and a weight you failed out of isn't your working weight), and
decides in this order:

1. **Pain flagged here last time** → hold the load. Twice in a row → swap the
   lift out.
2. **Today's check-in flares a joint this lift leans on** (or the tank is empty)
   → hold. Keep the pattern, skip the PR.
3. **A deload is due** — stalled twice, or four straight trained weeks — → drop
   about 10%, cut a set, rebuild.
4. **You failed out of the top set** → repeat the weight you settled at.
5. **You topped the rep range on every working set** → add load, sized to the
   lift and gated on how hard the last set was.
6. **Anything else** → hold the load and chase the reps.

The increment is a percentage of the working load — 5–10% on a lower-body
barbell or machine, 2.5–5% on upper-body, dumbbell and cable work — rounded to
the smallest step the gym has, and never more than 10% in a session. **When that
smallest step is bigger than the target percentage** (a 5 lb dumbbell jump is
17% of a 30 lb lunge; 2.5 lb is 20% of a 12.5 lb cuff cable) **the reps go up
first**, and the load waits until the rep range is used up. Every suggestion
says which sets it counted and why it picked the number.

## Running locally

```bash
# any static server works, e.g.
python3 -m http.server 8000
# then open http://localhost:8000
```

## Tests

```bash
npm test   # node --test, no dependencies to install
```

Unit tests cover the data model and the engine against a checked-in backup
fixture (`test/fixtures/`): movement attribution, set-role inference, typed
measures, effort-aware progression, stalls and deloads, and the migrations that
bring an old export forward. The fixture is run through the engine with an
expected answer written down for **all 20 movements**, so a rule change that
moves a number has to move it on purpose.

## Backups

Your data lives only on the device you use. Use **Settings → Export backup**
regularly, and import it if you switch phones or clear your browser.
