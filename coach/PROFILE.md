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
  must each be complete; Friday is a bonus day.

## Experience & preferences
- Solid technique with **dumbbells and machines**. **Wants to learn barbells**
  and "all of it" — he's just newer to the bar and worried about form, NOT
  uninterested. Barbell lifts are primary, with a "technique focus" flag +
  cues + a "groove it light first" note; DB/machine versions are swaps.
- Trains hard — dislikes being coddled.
- Liked about OTF: music, no thinking required, constant variety ("surprised my
  body"). → app should be low-decision and offer exercise variety (🎲 swap).
- Tracks calories in **LoseIt** → the app stays training + recovery only
  (no nutrition features).
- Has an Apple Watch (manual entry of HR/duration/calories — iOS can't sync to
  a web app), an OTbeat band (likely dies after OTF cancellation; ignore), and
  a home scale (manual bodyweight).

## Goals
1. Muscle & strength
2. Fat loss (driven by diet/steps, since in-session cardio is minimal)
3. Stay durable / reduce flare-ups

## Injuries & constraints (the program is built around these)
- **Leg-length discrepancy — THE top priority.** Causes progressive tightening
  of the right hip, leg, and back. He's "constantly trying to loosen it."
  Feels good after time off. → unilateral emphasis, loaded stretching for the
  right side, anti-lateral-flexion carries, daily "Loosen up" mobility routine,
  right-side-tightness tracker. **Recommend a professionally-fitted heel lift /
  orthotic — likely the single biggest fix; not yet evaluated as of intake.**
- **Right knee (meniscus).** Only really hurts at **deep loaded flexion**;
  otherwise robust, rarely flares (occasionally with running). Stable lately.
  → cap squat/press depth (box squats, limited-ROM leg press), build quad +
  posterior chain, no pivoting/twisting under load. Mid-range loads are fine to
  push hard.
- **Right shoulder (wear).** Upright rows have aggravated it. → neutral-grip /
  standard horizontal pressing OK (incl. barbell bench), big dose of rotator-
  cuff + scapular work. **No overhead pressing, upright rows, or behind-the-neck.**
- **Migraines.** Triggered by **very taxing sessions (onset ~5 h later) or
  alcohol.** He treats them (ibuprofen, massage) and **explicitly does NOT want
  the program watered down for them.** → program at normal hard intensity; the
  app logs whether a session triggered a migraine purely as *data* (one tap),
  never to gate a workout.

## Coaching loop (how Claude stays his trainer)
- Daily: he uses the PWA (check-in → lift → log). App auto-progresses loads.
- ~Every 4 weeks (or on a stall/pain): he taps **Settings → Coach report**,
  pastes the Markdown into a Claude chat, and asks for an update. Claude edits
  `js/program.js`, logs the change in `COACHING_LOG.md`, and pushes → the PWA
  updates via GitHub Pages.
- The app data lives only on his device; Claude cannot see it except via the
  pasted report. This repo is Claude's memory; the report is Tim's data feed.
