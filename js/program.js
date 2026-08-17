// =============================================================================
// program.js
// The training program + coaching knowledge, designed for Tim's specific body.
//
// Design brief (built from evidence-based practice, see README for sources):
//   Schedule: ~60 min, 3x/week (Mon / Wed / Fri), lunchtime, full commercial gym.
//   Style:    Full-body each day (A/B/C rotation) for high frequency + time
//             efficiency, with each day carrying a different emphasis.
//
//   Injuries / constraints this program is built around:
//     - Leg-length discrepancy  -> favor UNILATERAL lower work, controlled
//       bilateral lifts, no ego-loaded axial max attempts, add anti-lateral-
//       flexion carries to train the frontal-plane trunk.
//     - Crooked / asymmetric posture -> heavy dose of horizontal pulling,
//       scapular control, thoracic mobility, anti-rotation core.
//     - Tight hamstrings -> hip-hinge patterning, start hinges light, progress
//       range slowly; mobility in warmup/cooldown.
//     - Right shoulder wear -> NO heavy overhead pressing, NO upright rows,
//       NO behind-the-neck work. Prefer neutral-grip horizontal pressing,
//       landmine angles, and a big dose of rotator-cuff + scapular work.
//     - Right knee torn meniscus -> limit deep LOADED knee flexion, no
//       pivoting/twisting under load, build the quad (esp. VMO) and posterior
//       chain to protect the joint, keep box/limited ROM on squats.
//     - Cervicogenic migraines (right neck/shoulder) -> NO heavy trap loading
//       (heavy shrugs / upright rows), avoid breath-holding grinders; train
//       deep neck flexors (chin tucks) and cervico-scapular muscles low-load.
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
  { t: "Full body, 3x/week", d: "Each muscle trained ~3x weekly beats a body-part split for time-crunched training and joint health." },
  { t: "Leave 1–3 reps in the tank", d: "Target RPE 7–8. Grinding max singles isn't the goal — sustainable strength is, and it keeps pressure off your neck and knee." },
  { t: "Unilateral first", d: "Single-leg and single-arm work evens out your leg-length and posture asymmetries and keeps the meniscus in a safe, controlled path." },
  { t: "Horizontal over vertical", d: "For your shoulder and neck we press and pull mostly horizontally, and skip overhead pressing, upright rows, and heavy shrugs." },
  { t: "Own the range you use", d: "Box-limited squats and controlled tempo keep the knee in a safe arc. Depth is earned, never forced." },
  { t: "Breathe, don't brace-and-grind", d: "Exhale through the hard part. Avoid long breath-holds — they spike neck/head pressure and can trigger migraines." },
  { t: "Log your symptoms", d: "Knee, shoulder, and neck/head scores before each session tell us when to push and when to back off. This is the most important data here." },
];

// Small helper so exercise objects stay readable.
const ex = (o) => ({
  sets: 3, reps: "8–10", rpe: "7–8", rest: "90s", tempo: "controlled",
  alternatives: [], why: "", cues: [], flags: [], ...o,
});

// Warmup / cooldown are shared-ish but tailored per day.
const HINGE_WARMUP = [
  { name: "Bike — easy spin", detail: "5 min, knee-friendly. Get blood to the legs without impact." },
  { name: "World's greatest stretch", detail: "5/side. Opens hips, hamstrings, T-spine." },
  { name: "Glute bridge", detail: "2×12. Wake up the glutes before they have to protect the knee." },
  { name: "Quad sets / TKEs", detail: "2×15. Tighten the quad (VMO) — direct meniscus support." },
  { name: "Chin tucks", detail: "10 slow reps. Deep-neck-flexor primer for your neck/migraine." },
];
const UPPER_WARMUP = [
  { name: "Bike or row — easy", detail: "5 min to raise core temp." },
  { name: "Band pull-aparts", detail: "2×20. Scapular + rear-delt wake up." },
  { name: "Cuff ER/IR with band", detail: "2×15/side, light. Prep the right shoulder." },
  { name: "Scapular push-ups", detail: "2×10. Serratus / scap control." },
  { name: "Thoracic openers", detail: "8/side. Rotate from the mid-back, not the neck." },
  { name: "Chin tucks", detail: "10 slow reps. Neck primer." },
];
const NECK_COOLDOWN = [
  { name: "Upper-trap stretch", detail: "30s/side, gentle. Ear toward shoulder — the big one for your right-side headaches." },
  { name: "Levator scapulae stretch", detail: "30s/side. Nose toward armpit, light hand assist." },
  { name: "Chin tuck holds", detail: "5×10s. Finish by re-setting the deep neck flexors." },
];
const LEG_COOLDOWN = [
  { name: "Supine hamstring stretch", detail: "30s/side with a strap. Ease into the tight hamstrings." },
  { name: "Figure-4 glute stretch", detail: "30s/side." },
  ...NECK_COOLDOWN,
];

export const PROGRAM = {
  name: "Tim's Rebuild — MWF Full Body",
  updated: "2026-08-17",
  days: [
    // ---------------------------------------------------------------- DAY A
    {
      id: "A",
      name: "Day A — Lower & Core",
      dow: 1, // Monday
      focus: "Knee-safe legs + anti-rotation core",
      warmup: HINGE_WARMUP,
      exercises: [
        ex({
          id: "a1", name: "Goblet Box Squat", target: "Quads / glutes",
          sets: 3, reps: "8–10", rest: "2 min",
          why: "A box caps depth so the knee stays in a safe, repeatable arc while you still load the quad hard — exactly what a torn meniscus wants.",
          cues: ["Sit back to the box, don't crash", "Knees track over toes, no caving in", "Stand up through mid-foot", "Exhale on the way up"],
          flags: ["knee"],
          alternatives: ["Leg Press (limited ROM)", "Belt Squat", "Hack Squat (partial)"],
        }),
        ex({
          id: "a2", name: "Dumbbell Romanian Deadlift", target: "Hamstrings / glutes",
          sets: 3, reps: "8–10", rest: "90s",
          why: "Trains the hip hinge and lengthens tight hamstrings under control. Start lighter than you think and add range as you loosen up.",
          cues: ["Soft knees, push hips back", "Bar/DBs close to legs", "Stop when hamstrings tension — not when back rounds", "Flat back throughout"],
          flags: ["hamstring"],
          alternatives: ["45° Back Extension", "Cable Pull-Through", "Seated Good Morning (light)"],
        }),
        ex({
          id: "a3", name: "Reverse Lunge (short step)", target: "Unilateral legs",
          sets: 3, reps: "8/side", rest: "90s",
          why: "Reverse (not forward) lunges are gentler on the knee and the short step keeps shear low. Unilateral work evens out your leg-length difference.",
          cues: ["Step back, drop straight down", "Front shin near vertical", "Push through the front heel", "No twisting at the bottom"],
          flags: ["knee", "leglength"],
          alternatives: ["Step-ups (low box)", "Split Squat to box", "Bulgarian Split Squat (light)"],
        }),
        ex({
          id: "a4", name: "Seated Leg Curl", target: "Hamstrings",
          sets: 3, reps: "10–12", rest: "75s",
          why: "Direct hamstring strength supports the knee and balances all the quad work. Machine = zero balance demand on the joint.",
          cues: ["Smooth down, controlled up", "No jerking with the low back", "Full but pain-free range"],
          flags: ["hamstring"],
          alternatives: ["Lying Leg Curl", "Stability-Ball Curl", "Nordic negatives (advanced)"],
        }),
        ex({
          id: "a5", name: "Terminal Knee Extension (band) or partial Leg Extension", target: "Quad / VMO",
          sets: 3, reps: "12–15", rest: "60s",
          why: "Builds the VMO (inner quad) that stabilizes the kneecap. Keep leg-extension range shallow (0–45°) if the machine pinches.",
          cues: ["Squeeze the quad hard at lockout", "Slow negatives", "Stop short of any pinch"],
          flags: ["knee"],
          alternatives: ["Wall-sit isometrics", "Spanish Squat (band)", "Step-down (low)"],
        }),
        ex({
          id: "a6", name: "Standing Calf Raise", target: "Calves",
          sets: 3, reps: "12–15", rest: "60s",
          why: "Strong calves absorb landing forces and take load off the knee.",
          cues: ["Full stretch at the bottom", "Pause at the top"],
          alternatives: ["Seated Calf Raise", "Leg-Press Calf Raise"],
        }),
        ex({
          id: "a7", name: "Pallof Press", target: "Anti-rotation core",
          sets: 3, reps: "10/side", rest: "45s",
          why: "Anti-rotation core is the antidote to a crooked posture and an uneven pelvis. Resist the twist — don't create it.",
          cues: ["Press straight out, hips square", "Don't let the cable rotate you", "Breathe normally"],
          flags: ["posture", "leglength"],
          alternatives: ["Band Pallof", "Half-Kneeling Pallof"],
        }),
        ex({
          id: "a8", name: "Dead Bug", target: "Anti-extension core",
          sets: 3, reps: "8/side", rest: "45s",
          why: "Teaches the core to keep the spine neutral — foundational for posture and a happy low back.",
          cues: ["Low back stays glued to the floor", "Slow opposite arm/leg", "Exhale as you extend"],
          flags: ["posture"],
          alternatives: ["Bird Dog", "Hollow-body hold"],
        }),
      ],
      cooldown: LEG_COOLDOWN,
    },

    // ---------------------------------------------------------------- DAY B
    {
      id: "B",
      name: "Day B — Upper & Posture",
      dow: 3, // Wednesday
      focus: "Shoulder-safe push/pull + rotator cuff + posture",
      warmup: UPPER_WARMUP,
      exercises: [
        ex({
          id: "b1", name: "Neutral-Grip DB Bench Press (flat/low incline)", target: "Chest / triceps",
          sets: 3, reps: "8–10", rest: "2 min",
          why: "A neutral (palms-in) grip keeps the right shoulder in its happiest, most open position while you still press real load.",
          cues: ["Elbows ~45°, not flared to 90°", "Lower to lower chest", "Don't over-arch or shrug", "Stop just short of shoulder pinch"],
          flags: ["shoulder"],
          alternatives: ["Machine Chest Press", "Floor Press", "Neutral-grip Incline"],
        }),
        ex({
          id: "b2", name: "Chest-Supported Row", target: "Mid-back / scapula",
          sets: 3, reps: "10–12", rest: "90s",
          why: "The chest pad removes the low back and lets you pull hard into the muscles that fix rounded posture. Squeeze the shoulder blades.",
          cues: ["Pull elbows to hips", "Squeeze blades together, pause", "Don't shrug toward your ears (protect the neck)"],
          flags: ["posture", "shoulder"],
          alternatives: ["Seal Row", "Seated Cable Row (neutral)"],
        }),
        ex({
          id: "b3", name: "Landmine Press", target: "Shoulders (safe angle)",
          sets: 3, reps: "8–10/side", rest: "90s",
          why: "Presses on an incline angle instead of straight overhead — you get pressing strength without jamming the worn shoulder or loading the neck.",
          cues: ["Press up and slightly forward", "Ribs down, don't lean back", "Keep the neck long and relaxed"],
          flags: ["shoulder", "neck"],
          alternatives: ["Low Incline Machine Press", "Half-Kneeling 1-Arm DB Press (to eye level only)"],
        }),
        ex({
          id: "b4", name: "Lat Pulldown (front, neutral/wide)", target: "Lats / upper back",
          sets: 3, reps: "10–12", rest: "90s",
          why: "Vertical pull done safely — to the FRONT of the chest, never behind the neck.",
          cues: ["Pull to the collarbone", "Drive elbows down", "Control the way up", "No behind-the-neck, ever"],
          flags: ["shoulder"],
          alternatives: ["Neutral-Grip Assisted Pull-up", "Straight-Arm Pulldown"],
        }),
        ex({
          id: "b5", name: "Face Pull", target: "Rear delts / cuff / posture",
          sets: 3, reps: "15", rest: "60s",
          why: "The single best exercise for your combo of shoulder wear, neck tension, and posture. Light weight, high reps, no ego.",
          cues: ["Pull rope to the eyes/forehead", "Externally rotate — thumbs back", "Elbows high, but DON'T shrug the traps"],
          flags: ["shoulder", "posture", "neck"],
          alternatives: ["Band Face Pull", "Prone Rear-Delt Raise"],
        }),
        ex({
          id: "b6", name: "Cable External Rotation", target: "Rotator cuff (right shoulder)",
          sets: 3, reps: "12–15/side", rest: "60s",
          why: "Direct rotator-cuff strength for the worn right shoulder. Elbow pinned to your side, light and precise.",
          cues: ["Elbow glued to ribs, 90°", "Rotate the forearm out slowly", "Small range, no momentum"],
          flags: ["shoulder"],
          alternatives: ["Side-Lying DB ER", "Band ER"],
        }),
        ex({
          id: "b7", name: "Incline DB Curl", target: "Biceps",
          sets: 2, reps: "10–12", rest: "60s",
          why: "Arms, and the stretched position is easy on the joints.",
          cues: ["Slow negative", "No swinging"],
          alternatives: ["Cable Curl", "Hammer Curl"],
        }),
        ex({
          id: "b8", name: "Triceps Rope Pushdown", target: "Triceps",
          sets: 2, reps: "12–15", rest: "60s",
          why: "Rounds out pressing strength, shoulder-friendly.",
          cues: ["Elbows pinned", "Full lockout, slow return"],
          alternatives: ["Overhead Rope Ext (if pain-free)", "Close-grip push-up"],
        }),
      ],
      cooldown: [
        { name: "Gentle doorway pec stretch", detail: "30s/side, elbow BELOW shoulder height to protect the right shoulder." },
        ...NECK_COOLDOWN,
      ],
    },

    // ---------------------------------------------------------------- DAY C
    {
      id: "C",
      name: "Day C — Full Body & Posterior Chain",
      dow: 5, // Friday
      focus: "Glute/posterior strength + carries + optional Zone-2",
      warmup: HINGE_WARMUP,
      exercises: [
        ex({
          id: "c1", name: "Hip Thrust", target: "Glutes",
          sets: 3, reps: "8–10", rest: "2 min",
          why: "The most knee- and back-friendly way to build powerful glutes — and strong glutes are what protect your knee and pull your posture upright.",
          cues: ["Chin tucked, ribs down", "Drive through heels", "Squeeze glutes at the top, pause", "Don't hyperextend the low back"],
          flags: ["knee", "posture"],
          alternatives: ["Machine Hip Thrust", "Glute Bridge", "Cable Pull-Through"],
        }),
        ex({
          id: "c2", name: "Single-Leg Leg Press (limited ROM)", target: "Unilateral quad/glute",
          sets: 3, reps: "10/side", rest: "90s",
          why: "One leg at a time fixes side-to-side imbalances from your leg-length difference, and the machine keeps the meniscus on a safe track.",
          cues: ["Don't let the knee cave in", "Stop before the knee bends past ~90°", "Push through the whole foot"],
          flags: ["knee", "leglength"],
          alternatives: ["Step-up (low box)", "Split Squat to box"],
        }),
        ex({
          id: "c3", name: "Incline DB Press (neutral grip)", target: "Upper chest / shoulders",
          sets: 3, reps: "8–10", rest: "90s",
          why: "Low-incline pressing hits the shoulder-safe angle and keeps upper-body pushing in the week.",
          cues: ["Elbows ~45°", "Lower under control", "No shrug at the top"],
          flags: ["shoulder"],
          alternatives: ["Machine Incline Press", "Landmine Press"],
        }),
        ex({
          id: "c4", name: "Single-Arm DB Row", target: "Unilateral back",
          sets: 3, reps: "10/side", rest: "75s",
          why: "Evens out left/right back strength and reinforces posture. Bench-supported so the low back is safe.",
          cues: ["Flat back, brace on the bench", "Pull to the hip", "Don't rotate the torso to cheat"],
          flags: ["posture"],
          alternatives: ["Chest-Supported Row", "Seated Cable Row"],
        }),
        ex({
          id: "c5", name: "Cable Pull-Through", target: "Hamstrings / glutes",
          sets: 3, reps: "12", rest: "75s",
          why: "A hip hinge with the load in front — very low-back-friendly, great for grooving the hinge with your tight hamstrings.",
          cues: ["Hips back, arms stay straight", "Snap hips forward, squeeze glutes", "Neutral spine"],
          flags: ["hamstring"],
          alternatives: ["DB RDL (light)", "45° Back Extension"],
        }),
        ex({
          id: "c6", name: "Suitcase Carry", target: "Anti-lateral-flexion core",
          sets: 3, reps: "30–40 yd/side", rest: "60s",
          why: "Carrying a load on one side forces the trunk to stay level — directly trains the frontal-plane control your uneven pelvis needs.",
          cues: ["Stand tall, shoulders level", "Don't lean away from the weight", "Slow, controlled steps"],
          flags: ["leglength", "posture"],
          alternatives: ["Suitcase Hold (isometric)", "Side Plank"],
        }),
        ex({
          id: "c7", name: "Pallof Press", target: "Anti-rotation core",
          sets: 2, reps: "10/side", rest: "45s",
          why: "More anti-rotation to close out the week.",
          cues: ["Hips square", "Resist the twist"],
          flags: ["posture", "leglength"],
          alternatives: ["Band Pallof", "Bird Dog"],
        }),
        ex({
          id: "c8", name: "Optional: Zone-2 finisher", target: "Conditioning (knee-safe)",
          sets: 1, reps: "8–10 min", rpe: "conversational", rest: "—",
          why: "A nod to your Orange Theory cardio, kept knee-friendly. Incline walk or bike at a pace where you can still talk.",
          cues: ["Nose-breathing pace", "Incline walk or bike — no running/jumping", "Optional — skip if short on time"],
          flags: ["knee"],
          alternatives: ["Incline treadmill walk", "Stationary bike", "Elliptical"],
        }),
      ],
      cooldown: LEG_COOLDOWN,
    },
  ],
};

// Symptom trackers shown before each session. 0 = none/great, 10 = worst.
export const SYMPTOMS = [
  { id: "knee", label: "Right knee", hint: "Meniscus — any pain, catching, swelling?", invert: false },
  { id: "shoulder", label: "Right shoulder", hint: "Wear — pinch, ache, weakness?", invert: false },
  { id: "neck", label: "Neck / headache", hint: "Right-side tension, migraine warning signs?", invert: false },
  { id: "energy", label: "Energy", hint: "How's the tank today? 10 = fully charged", invert: true },
  { id: "sleep", label: "Sleep", hint: "Last night. 10 = slept great", invert: true },
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
  // Prefer day-of-week mapping (Mon=A, Wed=B, Fri=C); otherwise rotate by count.
  const dow = date.getDay();
  const byDow = PROGRAM.days.find((d) => d.dow === dow);
  if (byDow) return byDow;
  const n = sessions ? sessions.length : 0;
  return PROGRAM.days[n % PROGRAM.days.length];
}
