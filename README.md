# gymtools 🏋️ — your pocket personal trainer

An installable, offline-first **Progressive Web App** that acts as a personal
trainer: it comes with an **injury-aware training program** built for Tim's
specific body, and it tracks everything a good trainer would track — every set,
rep, weight, and, just as importantly, how your knee / shoulder / neck feel each
session.

No accounts, no servers, no data leaving your device. Just a web page you install
to your home screen.

**Live app:** `https://timkindberg.github.io/gymtools/` *(after first deploy — see below)*

---

## What it does

- **Today** — shows the day's workout, a last-session recap, quick stats
  (weekly consistency, streak), and a one-tap **"Loosen up"** shortcut to the
  mobility routine.
- **Guided sessions** — a quick symptom check-in first (right knee, right-side
  tightness, shoulder, neck/headache, energy, sleep) plus a **"did a migraine
  follow your last workout?"** prompt. If something's flaring, the app warns you
  and points to the safer swaps. Then you go exercise-by-exercise: coach's
  notes, cues, injury flags, **superset** pairings, your **last performance**,
  an **auto-progression suggestion**, a **🎲 swap** button to rotate the
  exercise for variety, a set grid to log weight × reps, and a built-in **rest
  timer** (sound + vibration). Optional Apple Watch metrics (duration, HR,
  calories) at the end.
- **Loosen up** — a standalone 5–8 min mobility routine (right-side focus) you
  can pull up any day, especially rest days.
- **Program** — browse the full A/B/C program with the reasoning behind every
  exercise choice.
- **Progress** — strength charts (estimated 1-rep-max & volume) per exercise,
  **symptom trend lines**, a **migraine-threshold** insight (compares training
  load on days that triggered a migraine vs. days that didn't), cardio/HR
  charts, and your full session log.
- **Settings** — units (lb/kg), bodyweight tracking, rest-timer prefs, and
  **export/import** your data as JSON (your backup — do this regularly!).

## The program (why it looks the way it does)

Full-body, ~50 min, 3×/week. **Mon and Wed are complete anchor sessions;
Friday is a skippable bonus day** (leg-length work, single-leg, arms, mobility)
— so missing Friday, the most-skipped day, costs you nothing essential.
**Barbell-first** (barbell squat, bench, RDL, hip thrust) with a 🎥 *technique
focus* flag, form cues, and a "groove it light first" note on the bar lifts;
dumbbell/machine versions are one 🎲-tap away. Trained at normal hard intensity
(top sets RPE 8–9). Designed around the constraints from the intake:

| Constraint | How the program responds |
|---|---|
| **Leg-length discrepancy** (the priority — drives progressive right-side tightening) | Unilateral lifts throughout, loaded stretching for the right side, anti-lateral-flexion carries, a daily mobility routine, and a right-side-tightness tracker |
| Crooked / asymmetric posture | Heavy horizontal pulling, scapular control, anti-rotation core |
| Tight hamstrings | Hip-hinge patterning, hips-square cueing, mobility work |
| Right shoulder wear | Cuff + face pulls in volume; standard/neutral horizontal pressing — **no** overhead press, upright rows, or behind-the-neck |
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
| Anytime | Stall or pain? Send the report | | Reacts |

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

Vanilla JS (ES modules), no framework, no dependencies. Data in `localStorage`.
Offline via a service worker (`sw.js`) that precaches the app shell. Injury-aware
program + coaching content lives in [`js/program.js`](js/program.js) — that's the
file to edit when it's time to change the program.

## Running locally

```bash
# any static server works, e.g.
python3 -m http.server 8000
# then open http://localhost:8000
```

## Backups

Your data lives only on the device you use. Use **Settings → Export backup**
regularly, and import it if you switch phones or clear your browser.
