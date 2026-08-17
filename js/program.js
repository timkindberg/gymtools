// =============================================================================
// program.js
// The training program + coaching knowledge, tailored to Tim from a full intake.
//
// PROFILE
//   44yo, 6'3", 235 lb. On Lexapro (SSRI). No blood-pressure / heart issues,
//   cleared to train. Decent lifter — strong technique with DUMBBELLS and
//   MACHINES, limited barbell / rack experience. Trains at Blue Ash Rec Center.
//   Goals: muscle & strength, fat loss (diet handled in LoseIt), stay durable.
//
// SCHEDULE
//   ~50 min, 3x/week at lunch. Mon & Wed are the anchors and each is a
//   complete full-body session. FRIDAY is a skippable bonus day (Tim's most-
//   skipped day), so nothing essential lives there — it's leg-length work,
//   single-leg, arms, and mobility. Miss it without guilt.
//
// CONSTRAINTS baked in
//   - Leg-length discrepancy = THE priority. Drives progressive tightening of
//     the right hip/leg/back. Answer: unilateral work, loaded stretching,
//     anti-lateral-flexion carries, and a daily-usable loosening routine.
//   - Right knee (meniscus): only hurts at DEEP loaded flexion -> cap squat /
//     press depth, keep controlled range; mid-range loading is fine and can be
//     challenged. No pivoting/twisting under load.
//   - Right shoulder (wear; upright rows have hurt it): neutral-grip horizontal
//     pressing, big dose of cuff + scap work. NO overhead press, upright rows,
//     or behind-the-neck.
//   - Migraines: triggered by VERY taxing sessions (hit ~5 h later) or alcohol.
//     Answer: cap effort at RPE 7-8, never grind to failure, no brutal
//     finishers, hydrate. The app logs whether a session triggered one so we
//     can learn your personal threshold.
//   - Dumbbell/machine first (Tim's strength + gentler on knee/shoulder);
//     barbell variants are marked optional.
//
//   Progression: double progression. Hit the top of the rep range on every
//   working set at or below the target RPE -> add load next time.
// =============================================================================

export const DISCLAIMER =
  "This app is a personal training aid, not medical advice. It was built " +
  "around the injuries you described, but it can't examine you. If anything " +
  "causes sharp, pinching, or radiating pain — stop, and check with your " +
  "doctor or physical therapist before continuing. Pain is data: log it.";

export const PRINCIPLES = [
  { t: "Mon & Wed are the anchors", d: "Each is a complete full-body session, so hitting just those two still covers everything. Friday is a bonus — make it when you can, skip it without guilt." },
  { t: "Dumbbells & machines first", d: "They play to your strengths and are gentler on the knee and shoulder than a loaded barbell. Barbell versions are marked 'optional' for when you want them." },
  { t: "Stay under your migraine line", d: "Effort caps at RPE 7–8 and we never grind to failure. Very taxing sessions can trigger a headache hours later, so we build steadily, not brutally. Hydrate well." },
  { t: "Leg length is the boss battle", d: "Unilateral lifts, loaded stretching, and a daily 'Loosen up' routine fight the progressive right-side tightening. Also worth getting a heel lift professionally evaluated — biggest ROI of all." },
  { t: "Own your depth", d: "Your knee only complains at deep loaded bends, so we cap squat and press depth and keep every rep controlled. Depth is earned, never forced." },
  { t: "Two taps beats guesswork", d: "Log your sets and your symptoms. The app tracks your strength, your joints, and what tends to set off a migraine — so we can adjust." },
];

// Small helper so exercise objects stay readable.
const ex = (o) => ({
  sets: 3, reps: "8–10", rpe: "7–8", rest: "90s", tempo: "controlled",
  alternatives: [], why: "", cues: [], flags: [], ...o,
});

// ---- Warm-ups / cool-downs (leg-length forward) ----------------------------
const PRIMER = [
  { name: "Bike — easy spin", detail: "4 min. Knee-friendly warm-up, no impact." },
  { name: "Half-kneeling hip-flexor stretch", detail: "45s right / 30s left. Attack the tight right side first." },
  { name: "90/90 hip switches", detail: "8/side. Restore hip rotation both ways." },
  { name: "Hip airplane (hold a rack)", detail: "5/side. Control + glute of the standing leg." },
  { name: "Glute bridge", detail: "2×12. Wake the glutes before they protect the knee." },
  { name: "Band cuff ER/IR", detail: "2×15/side, light. Prep the right shoulder." },
  { name: "Chin tucks", detail: "10 slow reps. Deep-neck-flexor primer." },
];
const RIGHT_SIDE_COOLDOWN = [
  { name: "Half-kneeling hip-flexor stretch", detail: "45s right / 30s left. The right hip is the ringleader — give it extra." },
  { name: "Supine hamstring strap stretch", detail: "45s right / 30s left." },
  { name: "Figure-4 glute stretch", detail: "30s/side." },
  { name: "Upper-trap + levator stretch", detail: "30s/side, gentle. Eases the right-side neck tension behind your headaches." },
  { name: "Chin tucks", detail: "5×10s. Reset the deep neck flexors." },
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
      focus: "Complete full-body: horizontal push, a pull, knee-safe legs",
      warmup: PRIMER,
      exercises: [
        ex({
          id: "a1", name: "Goblet Box Squat", target: "Quads / glutes",
          sets: 3, reps: "8–10", rest: "2 min", flags: ["knee"],
          why: "A box caps depth so the knee stays in its safe, pain-free arc while you still load the quad hard. Your knee only barks at deep bends — this keeps you out of that zone.",
          cues: ["Sit back to the box, don't crash onto it", "Knees track over toes, no caving in", "Drive up through mid-foot", "Exhale on the way up — no breath-holding"],
          barbellNote: "Optional once it feels easy: a barbell box squat. But goblet keeps you upright and is easier on the knee, so no rush.",
          alternatives: ["Leg Press (limited ROM)", "Hack Squat (partial)", "Belt Squat"],
        }),
        ex({
          id: "a2", name: "Neutral-Grip DB Bench Press", target: "Chest / triceps",
          sets: 3, reps: "8–10", rest: "90s", flags: ["shoulder"], ss: "S1",
          why: "Palms-in pressing keeps the worn right shoulder in its happiest position while you press real load. Supersetted with the row below to save time.",
          cues: ["Elbows ~45°, not flared to 90°", "Lower to the lower chest", "Don't over-arch or shrug", "Stop just short of any shoulder pinch"],
          alternatives: ["Machine Chest Press", "Floor Press", "Low-Incline Neutral DB Press"],
        }),
        ex({
          id: "a3", name: "Chest-Supported DB Row", target: "Mid-back / posture",
          sets: 3, reps: "10–12", rest: "75s", flags: ["posture", "shoulder"], ss: "S1",
          why: "The chest pad removes your low back and lets you pull hard into the muscles that unround your posture. Squeeze the shoulder blades.",
          cues: ["Pull elbows toward your hips", "Squeeze the blades together, pause", "Don't shrug toward your ears (protect the neck)"],
          alternatives: ["Seated Cable Row (neutral)", "Machine Row", "Seal Row"],
        }),
        ex({
          id: "a4", name: "DB Reverse Lunge (short step)", target: "Unilateral legs",
          sets: 3, reps: "8/side", rest: "75s", flags: ["knee", "leglength"],
          why: "Reverse lunges are gentler on the knee than forward ones, and single-leg work is your #1 tool against the leg-length imbalance. Even out left vs right.",
          cues: ["Step straight back, drop down", "Front shin near vertical", "Push through the front heel", "No twisting at the bottom"],
          alternatives: ["DB Step-up (low box)", "Split Squat to a box", "Bulgarian Split Squat (light)"],
        }),
        ex({
          id: "a5", name: "Face Pull", target: "Rear delts / cuff / posture",
          sets: 3, reps: "15", rest: "60s", flags: ["shoulder", "posture", "neck"], ss: "S2",
          why: "The best single exercise for your combo of shoulder wear, neck tension, and posture. Light and clean — no ego, no trap-shrugging.",
          cues: ["Pull the rope to eyes/forehead", "Thumbs point back (external rotation)", "Elbows high but DON'T shrug the traps"],
          alternatives: ["Band Face Pull", "Prone Rear-Delt Raise"],
        }),
        ex({
          id: "a6", name: "Half-Kneeling Pallof Press", target: "Anti-rotation core",
          sets: 3, reps: "10/side", rest: "45s", flags: ["posture", "leglength"], ss: "S2",
          why: "Half-kneeling adds a hip-flexor stretch on the down leg while you train the core to resist twisting — a two-for-one for your posture and pelvis.",
          cues: ["Hips square, ribs down", "Press straight out, don't let the cable rotate you", "Breathe normally"],
          alternatives: ["Standing Pallof", "Band Pallof", "Bird Dog"],
        }),
      ],
      cooldown: RIGHT_SIDE_COOLDOWN,
    },

    // ---------------------------------------------------------------- WEDNESDAY
    {
      id: "B",
      name: "Day B — Pull + Legs",
      dow: 3,
      focus: "Complete full-body: hip hinge, vertical pull, unilateral legs",
      warmup: PRIMER,
      exercises: [
        ex({
          id: "b1", name: "Dumbbell Romanian Deadlift", target: "Hamstrings / glutes",
          sets: 3, reps: "8–10", rest: "2 min", flags: ["hamstring", "leglength"],
          why: "Trains the hip hinge and loads the hamstrings through a controlled stretch. Keeping the hips level here is direct anti-tightening work for your right side.",
          cues: ["Soft knees, push the hips back", "DBs stay close to the legs", "Keep the hips square — don't hike the right", "Stop when hamstrings tension, before the back rounds"],
          barbellNote: "Optional: a barbell RDL lets you load heavier down the road. Dumbbells are easier to keep symmetric, which matters for you.",
          alternatives: ["45° Back Extension", "Cable Pull-Through", "Seated Good Morning (light)"],
        }),
        ex({
          id: "b2", name: "Lat Pulldown (neutral grip, to front)", target: "Lats / upper back",
          sets: 3, reps: "10–12", rest: "90s", flags: ["shoulder"], ss: "S1",
          why: "Vertical pulling done shoulder-safe — always to the FRONT, never behind the neck. Neutral grip is the friendliest for the right shoulder.",
          cues: ["Pull to the collarbone", "Drive the elbows down", "Control the way up", "Never behind the neck"],
          alternatives: ["Neutral-Grip Assisted Pull-up", "Straight-Arm Pulldown"],
        }),
        ex({
          id: "b3", name: "Neutral-Grip DB Incline Press", target: "Upper chest / shoulders",
          sets: 3, reps: "8–10", rest: "90s", flags: ["shoulder"], ss: "S1",
          why: "A low incline hits the shoulder-safe pressing angle and keeps upper-body pushing in the week without going overhead.",
          cues: ["Low incline (~30°)", "Elbows ~45°", "Lower under control", "No shrug at the top"],
          alternatives: ["Machine Incline Press", "Machine Chest Press"],
        }),
        ex({
          id: "b4", name: "Single-Leg Leg Press (limited ROM)", target: "Unilateral quad / glute",
          sets: 3, reps: "10/side", rest: "75s", flags: ["knee", "leglength"],
          why: "One leg at a time forces the weaker/tighter side to pull its weight, and the machine keeps the meniscus on a safe, guided track.",
          cues: ["Don't let the knee cave inward", "Stop before the knee bends past ~90°", "Push through the whole foot"],
          alternatives: ["DB Bulgarian Split Squat to box (shallow)", "Step-up (low box)"],
        }),
        ex({
          id: "b5", name: "Seated Leg Curl", target: "Hamstrings",
          sets: 3, reps: "10–12", rest: "60s", flags: ["hamstring"], ss: "S2",
          why: "Direct hamstring strength supports the knee and balances all the quad work.",
          cues: ["Smooth down, controlled up", "No jerking with the low back", "Full but pain-free range"],
          alternatives: ["Lying Leg Curl", "Stability-Ball Curl"],
        }),
        ex({
          id: "b6", name: "Cable External Rotation", target: "Rotator cuff (right shoulder)",
          sets: 3, reps: "12–15/side", rest: "45s", flags: ["shoulder"], ss: "S2",
          why: "Direct rotator-cuff strength for the worn shoulder — the daily insurance that keeps pressing pain-free.",
          cues: ["Elbow glued to your ribs, bent 90°", "Rotate the forearm out slowly", "Small range, no momentum"],
          alternatives: ["Side-Lying DB External Rotation", "Band External Rotation"],
        }),
        ex({
          id: "b7", name: "Suitcase Carry (optional if time)", target: "Anti-lateral-flexion core",
          sets: 2, reps: "40 yd/side", rpe: "7", rest: "60s", flags: ["leglength", "posture"],
          why: "Loading one side forces your trunk to stay level — the exact frontal-plane control your uneven pelvis needs. Skip it if you're short on time.",
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
          id: "c1", name: "Hip Thrust", target: "Glutes",
          sets: 3, reps: "10–12", rest: "90s", flags: ["knee", "posture"],
          why: "The most knee- and back-friendly way to build powerful glutes — and strong glutes are what protect your knee and pull your posture tall.",
          cues: ["Chin tucked, ribs down", "Drive through the heels", "Squeeze glutes at the top, pause", "Don't hyperextend the low back"],
          barbellNote: "Optional: barbell hip thrust (use a pad) once you want more load. A DB across the hips or a machine works great meanwhile.",
          alternatives: ["Machine Hip Thrust", "Glute Bridge", "45° Back Extension"],
        }),
        ex({
          id: "c2", name: "DB Lateral Lunge (comfortable depth)", target: "Adductors / frontal plane",
          sets: 3, reps: "8/side", rest: "75s", flags: ["knee", "leglength"],
          why: "Side-to-side loading trains the inner hip and frontal-plane control that a leg-length difference neglects. Stay shallow — you only need pain-free range.",
          cues: ["Sit into the bending hip, keep the other leg straight", "Only as deep as stays pain-free", "Push back to center through the heel", "No knee twisting"],
          alternatives: ["Adductor Machine + Hip Abduction Machine", "Cossack Squat (shallow, assisted)"],
        }),
        ex({
          id: "c3", name: "Single-Arm DB Row", target: "Unilateral back",
          sets: 3, reps: "10/side", rest: "60s", flags: ["posture", "leglength"],
          why: "Evens out left/right back strength and reinforces posture. Braced on a bench so the low back stays safe.",
          cues: ["Flat back, brace a hand on the bench", "Pull to the hip", "Don't rotate the torso to cheat the weight"],
          alternatives: ["Chest-Supported Row", "Seated Cable Row"],
        }),
        ex({
          id: "c4", name: "Single-Leg DB RDL (light)", target: "Unilateral hinge / balance",
          sets: 3, reps: "8/side", rest: "60s", flags: ["hamstring", "leglength"],
          why: "Loaded stretching for the right hamstring and glute plus a big balance and hip-control demand — a direct hit on the asymmetry. Keep it light and precise.",
          cues: ["Hinge on one leg, back leg reaches behind", "Hips stay level (don't let them open)", "Light DB — control beats load here"],
          alternatives: ["B-Stance RDL", "45° Back Extension"],
        }),
        ex({
          id: "c5", name: "Incline DB Curl", target: "Biceps",
          sets: 3, reps: "10–12", rest: "60s", ss: "S1",
          why: "Arms — the stretched position is joint-friendly. Supersetted with pushdowns.",
          cues: ["Slow negative", "No swinging"],
          alternatives: ["Cable Curl", "Hammer Curl"],
        }),
        ex({
          id: "c6", name: "Triceps Rope Pushdown", target: "Triceps",
          sets: 3, reps: "12–15", rest: "60s", ss: "S1",
          why: "Rounds out arm work, shoulder-friendly.",
          cues: ["Elbows pinned to your sides", "Full lockout, slow return"],
          alternatives: ["DB Skull-crusher", "Overhead Rope (if pain-free)"],
        }),
        ex({
          id: "c7", name: "Side Plank", target: "Anti-lateral-flexion core",
          sets: 2, reps: "20–30s/side", rpe: "7", rest: "45s", flags: ["leglength", "posture"],
          why: "Trains the side of the trunk to hold you level — frontal-plane core that supports the pelvis.",
          cues: ["Straight line head to heels", "Hips up, don't sag", "Breathe"],
          alternatives: ["Suitcase Hold", "Copenhagen Plank (easy)"],
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
  { id: "neck", label: "Neck / headache", hint: "Right-side tension or migraine warning signs?", invert: false },
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
  neck: "neck/migraine-sensitive",
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
