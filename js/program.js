// =============================================================================
// program.js
// The training program + coaching knowledge, tailored to Tim from a full intake.
//
// PROFILE (full detail in /coach/PROFILE.md)
//   44yo, 6'3", 235 lb. On Lexapro. No BP/heart issues, cleared to train.
//   Solid with DUMBBELLS and MACHINES; wants to learn BARBELLS (the big lifts
//   are in, with technique support) — just less bar experience so far.
//   Trains at Blue Ash Rec Center. Goals: muscle & strength, fat loss (diet in
//   LoseIt), stay durable. Trains hard — no coddling.
//
// SCHEDULE
//   ~50 min, 3x/week at lunch. Mon & Wed are complete anchor sessions; FRIDAY
//   is a skippable bonus day (Tim's most-skipped). Nothing essential on Friday.
//
// CONSTRAINTS baked in
//   - Leg-length discrepancy = THE priority (progressive right-side tightening).
//     Unilateral work, loaded stretching, carries, daily mobility routine.
//   - Right knee (meniscus): only hurts at DEEP loaded flexion -> cap depth,
//     controlled range; mid-range loads hard. No pivoting/twisting under load.
//   - Right shoulder (wear). The confirmed aggravator is the UPRIGHT ROW
//     (standing, elbows flared, pulling to the chin) — that stays OUT. Overhead
//     pressing is OK (Tim cleared it): warm the cuff, keep form clean,
//     autoregulate on bad days. Still no behind-the-neck. Lots of cuff + scap
//     work stays.
//   - Migraines: Tim treats them and does NOT want the program watered down.
//     We train hard and progress normally; the app still LOGS whether a session
//     triggered one, purely as data.
//
//   Progression: double progression. Hit the top of the rep range on every
//   working set at target RPE -> add load next time. Push the top sets.
// =============================================================================

export const DISCLAIMER =
  "This app is a personal training aid, not medical advice. It was built " +
  "around the injuries you described, but it can't examine you. If anything " +
  "causes sharp, pinching, or radiating pain — stop, and check with your " +
  "doctor or physical therapist before continuing. Pain is data: log it.";

export const PRINCIPLES = [
  { t: "The vision: strong, balanced, durable", d: "We're building an athletic, symmetrical, hard-to-break body — not babying you. Every week hits three jobs: one big strength lift, balancing work for the right side, and bulletproofing (cuff, core, carries, mobility)." },
  { t: "Variety on purpose — a rotating hybrid", d: "Barbells, dumbbells, machines, and single-leg work are all tools; none is 'the program.' The big lift's tool rotates block to block, and reps/tempos/exercises change every few weeks so your body keeps adapting and you stay engaged. Hit 🎲 anytime you want to shuffle a lift." },
  { t: "Progressive overload is the engine", d: "Add a rep or a little weight whenever you can. The app remembers every set and tells you when to bump the load — your job is to keep beating last time. Push top sets to a real RPE 8–9; take safe accessories to failure." },
  { t: "New lift? Groove it first", d: "When a movement is new to you (the app flags these 🎥), spend a week or two light to own the pattern, watch the form video, and film a set to check yourself. Then load it up." },
  { t: "Balance the right side", d: "Your heel lift handles the structural leg-length base; on top of it we train the balance — single-leg work everywhere, loaded stretching, carries, and the daily 'Loosen up' routine so the tight right side stops running the show." },
  { t: "Own your depth", d: "Your knee only complains at deep loaded bends, so we cap squat and press depth and keep every rep controlled. Everything else, load it up." },
  { t: "Log it so your trainer can coach it", d: "Your sets, symptoms, and notes are how Claude reviews your progress between blocks. Keep it fed, and every few weeks send the coach report for a program update." },
];

// Small helper so exercise objects stay readable.
const ex = (o) => ({
  sets: 3, reps: "8–10", rpe: "8", rest: "90s", tempo: "controlled",
  alternatives: [], why: "", cues: [], flags: [], ...o,
});

// ---- Warm-ups / cool-downs (leg-length forward) ----------------------------
const PRIMER = [
  { name: "Bike — easy spin", detail: "4 min. Knee-friendly warm-up, no impact." },
  { name: "Half-kneeling hip-flexor stretch", detail: "45s right / 30s left. Attack the tight right side first." },
  { name: "90/90 hip switches", detail: "8/side. Restore hip rotation both ways." },
  { name: "Hip airplane (hold a rack)", detail: "5/side. Control + glute of the standing leg." },
  { name: "Glute bridge", detail: "2×12. Wake the glutes before they load." },
  { name: "Band cuff ER/IR", detail: "2×15/side, light. Prep the right shoulder." },
  { name: "Ramp-up sets", detail: "On the first big lift, do 2–3 progressively heavier sets before your working weight." },
];
const RIGHT_SIDE_COOLDOWN = [
  { name: "Half-kneeling hip-flexor stretch", detail: "45s right / 30s left. The right hip is the ringleader — give it extra." },
  { name: "Supine hamstring strap stretch", detail: "45s right / 30s left." },
  { name: "Figure-4 glute stretch", detail: "30s/side." },
  { name: "Upper-trap + levator stretch", detail: "30s/side, gentle." },
];

// ---- Standalone mobility routine (open any day) -----------------------------
export const MOBILITY_ROUTINE = {
  name: "Loosen up",
  blurb: "5–8 minutes. Your front-line defense against the progressive right-side tightening. Do it daily-ish — especially on off days — and give the right side extra time. No weights, no gym required.",
  steps: [
    { name: "90/90 hip switches", detail: "8/side, slow. Reclaim hip rotation." },
    { name: "Half-kneeling hip-flexor stretch", detail: "45s right / 30s left. Tall spine, squeeze the down-glute." },
    { name: "Figure-4 / standing glute stretch", detail: "30s/side." },
    { name: "Supine hamstring strap stretch", detail: "45s right / 30s left. Ease into the tight side." },
    { name: "Hip airplane", detail: "5/side. Balance + hip control." },
    { name: "Adductor rock-backs", detail: "8 slow reps. Opens the inner hip." },
    { name: "Open-book thoracic rotation", detail: "8/side. Rotate from the mid-back, not the neck." },
    { name: "Upper-trap + levator stretch", detail: "30s/side. Right-side neck de-load." },
    { name: "Chin tucks", detail: "10 slow reps." },
  ],
};

export const PROGRAM = {
  name: "Tim's Rebuild — MWF Full Body",
  updated: "2026-08-17",
  days: [
    // ---------------------------------------------------------------- MONDAY
    {
      id: "A",
      name: "Day A — Push + Legs",
      dow: 1,
      focus: "Complete full-body: a squat, horizontal push + pull, unilateral legs",
      warmup: PRIMER,
      exercises: [
        ex({
          id: "a1", name: "Barbell Box Squat", target: "Quads / glutes", start: 95,
          sets: 4, reps: "5–8", rpe: "8", rest: "2–3 min", flags: ["knee"], learn: true,
          why: "The box gives you a consistent depth target (keeping the knee out of the deep range it hates) and is the friendliest way to learn to squat under a bar. Load it up above the box.",
          cues: ["Set the box to just-above-parallel", "Sit back to the box under control, stay tight (don't flop)", "Knees track over toes", "Drive up through mid-foot, exhale"],
          techNote: "New to bar squats? Start with just the bar for 1–2 sessions to own the groove, then add weight. Use the rack's safety pins.",
          alternatives: ["Goblet Box Squat", "Leg Press (limited ROM)", "Hack Squat (partial)", "Safety-Bar Box Squat"],
        }),
        ex({
          id: "a2", name: "Barbell Bench Press", target: "Chest / triceps / shoulders", start: 135,
          sets: 4, reps: "5–8", rpe: "8", rest: "2 min", flags: ["shoulder"], ss: "S1", learn: true,
          why: "The classic upper-body strength builder, and the bar lets you load heavier than dumbbells. We keep the shoulder happy with grip width and bar path, not by avoiding the lift.",
          cues: ["Grip so forearms are vertical at the bottom", "Elbows ~45–75°, not flared to 90°", "Touch the lower chest, drive up", "Shoulder blades pinned back and down"],
          techNote: "Use a spotter or the rack safeties. If the shoulder's cranky that day, 🎲 swap to the neutral-grip DB bench.",
          alternatives: ["Neutral-Grip DB Bench Press", "Machine Chest Press", "Floor Press"],
        }),
        ex({
          id: "a3", name: "Chest-Supported DB Row", target: "Mid-back / posture", start: 50,
          sets: 3, reps: "8–12", rpe: "9", rest: "75s", flags: ["posture", "shoulder"], ss: "S1",
          why: "The chest pad takes your low back out of it so you can pull hard into the muscles that fix rounded posture. Great non-competing superset partner for bench.",
          cues: ["Pull elbows toward your hips", "Squeeze the blades together, pause", "Don't shrug toward your ears"],
          alternatives: ["Barbell Row", "Seated Cable Row (neutral)", "Machine Row"],
        }),
        ex({
          id: "a4", name: "DB Reverse Lunge", target: "Unilateral legs", start: 30,
          sets: 3, reps: "8–10/side", rpe: "8", rest: "75s", flags: ["knee", "leglength"],
          why: "Reverse lunges are gentler on the knee than forward ones, and single-leg work is your #1 tool against the leg-length imbalance.",
          cues: ["Step straight back, drop down", "Front shin near vertical", "Push through the front heel", "No twisting at the bottom"],
          alternatives: ["Bulgarian Split Squat", "DB Step-up (low box)", "Walking Lunge"],
        }),
        ex({
          id: "a5", name: "Face Pull", target: "Rear delts / cuff / posture", start: 40,
          sets: 3, reps: "15–20", rpe: "9", rest: "60s", flags: ["shoulder", "posture", "neck"], ss: "S2",
          why: "The best insurance for your shoulder and posture. High reps, take it near failure — it's low-risk.",
          cues: ["Pull the rope to eyes/forehead", "Thumbs point back (external rotation)", "Elbows high, don't shrug the traps"],
          alternatives: ["Band Face Pull", "Reverse Pec-Deck"],
        }),
        ex({
          id: "a6", name: "Half-Kneeling Pallof Press", target: "Anti-rotation core",
          sets: 3, reps: "10/side", rpe: "8", rest: "45s", flags: ["posture", "leglength"], ss: "S2",
          why: "Half-kneeling stretches the down-leg hip flexor while you train the core to resist twisting — a two-for-one for your posture and pelvis.",
          cues: ["Hips square, ribs down", "Press straight out, resist the rotation", "Breathe normally"],
          alternatives: ["Standing Pallof", "Cable Chop", "Bird Dog"],
        }),
      ],
      cooldown: RIGHT_SIDE_COOLDOWN,
    },

    // ---------------------------------------------------------------- WEDNESDAY
    {
      id: "B",
      name: "Day B — Pull + Legs",
      dow: 3,
      focus: "Complete full-body: a hinge, vertical pull, unilateral legs",
      warmup: PRIMER,
      exercises: [
        ex({
          id: "b1", name: "Barbell Romanian Deadlift", target: "Hamstrings / glutes / back", start: 135,
          sets: 4, reps: "6–8", rpe: "8", rest: "2–3 min", flags: ["hamstring", "leglength"], learn: true,
          why: "The big posterior-chain builder and a fantastic hinge to learn. Keeping the hips level here is direct anti-tightening work for your right side.",
          cues: ["Soft knees, push the hips back", "Bar drags close to the legs", "Hips stay square — don't hike the right", "Flat back; stop when hamstrings tension, before the back rounds"],
          techNote: "Start moderate and own the hinge before chasing load — this is where form matters most. 🎲 DB RDL is a fine substitute.",
          alternatives: ["DB Romanian Deadlift", "45° Back Extension", "Cable Pull-Through"],
        }),
        ex({
          id: "b2", name: "Pull-up / Lat Pulldown", target: "Lats / upper back", start: 120,
          sets: 4, reps: "6–10", rpe: "8", rest: "90s", flags: ["shoulder"], ss: "S1",
          why: "Vertical pulling for a wide back — always to the FRONT, never behind the neck. Use assisted or the pulldown to hit the rep range cleanly.",
          cues: ["Full hang, pull the collarbone to the bar", "Drive the elbows down", "Control the way up", "Neutral or shoulder-width grip"],
          alternatives: ["Neutral-Grip Lat Pulldown", "Assisted Pull-up", "Weighted Pull-up"],
        }),
        ex({
          id: "b3", name: "Seated DB Shoulder Press", target: "Shoulders / triceps",
          sets: 3, reps: "8–10", rpe: "8", rest: "90s", flags: ["shoulder"], ss: "S1", start: 35,
          why: "Overhead pressing is back on the menu — you cleared it. This builds the delts and balances the horizontal bench on Day A. (The upright row is the move we skip, not this.)",
          cues: ["Warm the cuff + a face-pull set first", "Press up, don't let the elbows flare way back", "Ribs down, don't overarch", "Stop just short of any pinch"],
          techNote: "Your press strength fades fast when the shoulder's tired — on a rough day, 🎲 swap to the incline press instead of grinding.",
          alternatives: ["Neutral-Grip DB Incline Press", "Machine Shoulder Press", "Barbell Overhead Press"],
        }),
        ex({
          id: "b4", name: "Single-Leg Leg Press (limited ROM)", target: "Unilateral quad / glute", start: 100,
          sets: 3, reps: "10–12/side", rpe: "8", rest: "75s", flags: ["knee", "leglength"],
          why: "One leg at a time forces your weaker/tighter side to pull its weight, and the machine keeps the meniscus on a safe, guided track — the convenient, sit-down way to hammer the asymmetry hard.",
          cues: ["Don't let the knee cave inward", "Stop before the knee bends past ~90°", "Push through the whole foot", "Match reps and effort side to side"],
          alternatives: ["Bulgarian Split Squat", "DB Step-up (low box)", "Split Squat to box"],
        }),
        ex({
          id: "b5", name: "Seated Leg Curl", target: "Hamstrings",
          sets: 3, reps: "10–12", rpe: "9", rest: "60s", flags: ["hamstring"], ss: "S2", start: 150,
          why: "Direct hamstring strength supports the knee and balances all the quad work. Take these close to failure.",
          cues: ["Smooth down, controlled up", "No jerking with the low back", "Full but pain-free range"],
          alternatives: ["Lying Leg Curl", "Nordic Curl (negatives)"],
        }),
        ex({
          id: "b6", name: "Cable External Rotation", target: "Rotator cuff (right shoulder)", start: 10,
          sets: 3, reps: "12–15/side", rpe: "8", rest: "45s", flags: ["shoulder"], ss: "S2",
          why: "Direct rotator-cuff strength — the daily insurance that keeps heavy pressing pain-free.",
          cues: ["Elbow glued to your ribs, bent 90°", "Rotate the forearm out slowly", "Small range, no momentum"],
          alternatives: ["Side-Lying DB External Rotation", "Band External Rotation"],
        }),
        ex({
          id: "b7", name: "Suitcase Carry (optional if time)", target: "Anti-lateral-flexion core", start: 50,
          sets: 2, reps: "40 yd/side", rpe: "8", rest: "60s", flags: ["leglength", "posture"],
          why: "Loading one side forces your trunk to stay level — the exact frontal-plane control your uneven pelvis needs. Go heavy.",
          cues: ["Stand tall, shoulders level", "Don't lean away from the weight", "Slow, even steps"],
          alternatives: ["Suitcase Hold (isometric)", "Side Plank"],
        }),
      ],
      cooldown: RIGHT_SIDE_COOLDOWN,
    },

    // ---------------------------------------------------------------- FRIDAY
    {
      id: "C",
      name: "Day C — Bonus: Mobility, Single-Leg & Arms",
      dow: 5,
      optional: true,
      note: "The skip-friendly day. Mon + Wed already cover the essentials — Friday is where you chip away at the leg-length asymmetry, hit arms, and loosen everything up. Make it when you can; no guilt when you can't.",
      focus: "Leg-length weak points, glutes, arms, and a long loosen-out",
      warmup: PRIMER,
      exercises: [
        ex({
          id: "c1", name: "Barbell Hip Thrust", target: "Glutes", start: 135,
          sets: 3, reps: "8–12", rpe: "9", rest: "90s", flags: ["knee", "posture"], learn: true,
          why: "The most knee- and back-friendly way to build powerful glutes — which protect your knee and pull your posture tall. Load it heavy.",
          cues: ["Upper back on the bench, pad the bar", "Chin tucked, ribs down", "Drive through the heels, squeeze at the top", "Don't hyperextend the low back"],
          techNote: "Get the bench height and bar pad set before loading. 🎲 machine or DB hip thrust works too.",
          alternatives: ["Machine Hip Thrust", "DB Hip Thrust", "Glute Bridge"],
        }),
        ex({
          id: "c2", name: "DB Lateral Lunge", target: "Adductors / frontal plane", start: 25,
          sets: 3, reps: "8/side", rpe: "8", rest: "75s", flags: ["knee", "leglength"],
          why: "Side-to-side loading trains the inner hip and frontal-plane control that a leg-length difference neglects. Stay in a pain-free depth.",
          cues: ["Sit into the bending hip, keep the other leg straight", "Only as deep as stays pain-free", "Push back to center through the heel"],
          alternatives: ["Adductor Machine + Hip Abduction Machine", "Cossack Squat (shallow)"],
        }),
        ex({
          id: "c3", name: "Single-Arm DB Row", target: "Unilateral back", start: 55,
          sets: 3, reps: "10/side", rpe: "9", rest: "60s", flags: ["posture", "leglength"],
          why: "Evens out left/right back strength and reinforces posture. Braced on a bench so the low back stays safe.",
          cues: ["Flat back, brace a hand on the bench", "Pull to the hip", "Don't rotate the torso to cheat"],
          alternatives: ["Chest-Supported Row", "Seated Cable Row"],
        }),
        ex({
          id: "c4", name: "Single-Leg DB RDL", target: "Unilateral hinge / balance", start: 35,
          sets: 3, reps: "8/side", rpe: "8", rest: "60s", flags: ["hamstring", "leglength"],
          why: "Loaded stretching for the right hamstring and glute plus a big balance and hip-control demand — a direct hit on the asymmetry.",
          cues: ["Hinge on one leg, back leg reaches behind", "Hips stay level (don't let them open)", "Control beats load here"],
          alternatives: ["B-Stance RDL", "45° Back Extension"],
        }),
        ex({
          id: "c5", name: "Incline DB Curl", target: "Biceps", start: 30,
          sets: 3, reps: "10–12", rpe: "10", rest: "60s", ss: "S1",
          why: "Arms — the stretched position is joint-friendly. Take them to failure, supersetted with pushdowns.",
          cues: ["Slow negative", "No swinging"],
          alternatives: ["Cable Curl", "Hammer Curl", "Barbell Curl"],
        }),
        ex({
          id: "c6", name: "Triceps Rope Pushdown", target: "Triceps", start: 40,
          sets: 3, reps: "12–15", rpe: "10", rest: "60s", ss: "S1",
          why: "Rounds out arm work, shoulder-friendly. Failure is fine here.",
          cues: ["Elbows pinned to your sides", "Full lockout, slow return"],
          alternatives: ["DB Skull-crusher", "Overhead Rope (if pain-free)", "Dips (assisted)"],
        }),
        ex({
          id: "c7", name: "Side Plank", target: "Anti-lateral-flexion core",
          sets: 2, reps: "30–45s/side", rpe: "8", rest: "45s", flags: ["leglength", "posture"],
          why: "Trains the side of the trunk to hold you level — frontal-plane core that supports the pelvis.",
          cues: ["Straight line head to heels", "Hips up, don't sag", "Breathe"],
          alternatives: ["Suitcase Hold", "Copenhagen Plank"],
        }),
      ],
      cooldown: [
        ...MOBILITY_ROUTINE.steps.slice(0, 6),
        { name: "Upper-trap + levator stretch", detail: "30s/side." },
        { name: "Chin tucks", detail: "10 slow reps." },
      ],
    },
  ],
};

// Symptom trackers shown before each session. 0 = none/great, 10 = worst.
export const SYMPTOMS = [
  { id: "knee", label: "Right knee", hint: "Meniscus — any pain, catching, swelling?", invert: false },
  { id: "tightness", label: "Right-side tightness", hint: "Hip / leg / back — how locked up is the right side today?", invert: false },
  { id: "shoulder", label: "Right shoulder", hint: "Wear — pinch, ache, weakness?", invert: false },
  { id: "neck", label: "Neck / headache", hint: "Right-side tension? (data only — won't change today's plan)", invert: false },
  { id: "energy", label: "Energy", hint: "How's the tank today? 10 = fully charged", invert: true },
  { id: "sleep", label: "Sleep", hint: "Last night. 10 = slept great", invert: true },
];

// Optional post-workout metrics you read off your Apple Watch and punch in.
export const WATCH_METRICS = [
  { id: "durationMin", label: "Duration", unit: "min", placeholder: "50" },
  { id: "avgHr", label: "Avg HR", unit: "bpm", placeholder: "115" },
  { id: "peakHr", label: "Peak HR", unit: "bpm", placeholder: "148" },
  { id: "activeCal", label: "Active cal", unit: "kcal", placeholder: "380" },
];

// Map a symptom id to the exercise flags it should warn about.
export const FLAG_LABELS = {
  knee: "knee-sensitive",
  shoulder: "shoulder-sensitive",
  neck: "neck-related",
  hamstring: "hamstring/mobility",
  posture: "posture",
  leglength: "leg-length / asymmetry",
};

// The rotation: which day template to run on the Nth workout.
export function dayForDate(date, sessions) {
  const dow = date.getDay();
  const byDow = PROGRAM.days.find((d) => d.dow === dow);
  if (byDow) return byDow;
  const n = sessions ? sessions.length : 0;
  return PROGRAM.days[n % PROGRAM.days.length];
}
