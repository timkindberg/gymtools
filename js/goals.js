// =============================================================================
// goals.js — where a goal stands, and when it lands at the current pace.
//
// A goal is a target number on something the app already measures (a lift's
// estimated 1RM, the best reps on a bodyweight movement, weeks trained in
// full) plus the date it was promised for. The definitions live in program.js
// with the rest of the coaching; this file is only the arithmetic, kept pure
// so it can be tested without a store.
//
// The projection is deliberately modest: a straight line through the last
// eight weeks. It reads "at your recent pace", not "this is when it happens".
// The first weeks on a new lift are mostly finding the right weight, which is
// why the window is short and rolling: that early slope ages out by itself.
// =============================================================================

const DAY = 86400000;

export const PACE_WINDOW_DAYS = 56;   // the trend the projection reads
export const CURRENT_WINDOW_DAYS = 35; // "where you are" = best in the last 5 weeks
export const MIN_PACE_POINTS = 3;
export const MIN_PACE_SPAN_DAYS = 14;
const MAX_ETA_DAYS = 5 * 365;

const time = (d) => (typeof d === "number" ? d : Date.parse(d));

// Where the number stands as of `at`: the best non-deload value in the trailing
// window, or the latest one at all when the window is empty. One light day or
// a planned deload shouldn't read as losing ground.
export function standingAt(points, at) {
  const upTo = points.filter((p) => time(p.date) <= at);
  if (!upTo.length) return null;
  const recent = upTo.filter((p) => !p.deload && at - time(p.date) <= CURRENT_WINDOW_DAYS * DAY);
  if (recent.length) return Math.max(...recent.map((p) => p.value));
  return upTo[upTo.length - 1].value;
}

// Least-squares slope, in units per day, over the trailing window.
export function pacePerDay(points, now) {
  const pts = points.filter((p) => !p.deload && time(p.date) <= now && now - time(p.date) <= PACE_WINDOW_DAYS * DAY);
  if (pts.length < MIN_PACE_POINTS) return null;
  const xs = pts.map((p) => time(p.date) / DAY);
  if (Math.max(...xs) - Math.min(...xs) < MIN_PACE_SPAN_DAYS) return null;
  const ys = pts.map((p) => p.value);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0, den = 0;
  xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) ** 2; });
  return den ? num / den : null;
}

// points: [{ date, value, deload? }], oldest first.
// status: done | untracked (nothing logged) | overdue | no-trend (too little
//         recent data, or flat/falling) | on-track | behind
export function goalProgress(goal, points = [], { now = Date.now() } = {}) {
  const by = time(goal.by);
  // A goal set "on the 10th" starts from where he stood at the end of the 10th.
  const set = time(goal.set) + (/^\d{4}-\d{2}-\d{2}$/.test(String(goal.set)) ? DAY - 1 : 0);
  const hit = points.find((p) => p.value >= goal.target);
  const standing = standingAt(points, now);
  const from = standingAt(points, set) ?? goal.from ?? 0;
  const current = standing ?? goal.from ?? null;
  const base = { id: goal.id, title: goal.title, kind: goal.kind, target: goal.target, by: goal.by, from, current };

  if (hit) return { ...base, status: "done", pct: 100, achieved: hit.date, eta: null, perWeek: null, neededPerWeek: null };

  const span = goal.target - from;
  const pct = current == null || span <= 0 ? 0 : Math.max(0, Math.min(99, Math.round(((current - from) / span) * 100)));
  const weeksLeft = (by - now) / (7 * DAY);
  const neededPerWeek = current != null && weeksLeft > 0 ? (goal.target - current) / weeksLeft : null;
  const out = { ...base, pct, achieved: null, eta: null, perWeek: null, neededPerWeek };

  if (standing == null) return { ...out, status: "untracked" };
  if (now > by) return { ...out, status: "overdue" };

  const slope = pacePerDay(points, now);
  if (slope == null) return { ...out, status: "no-trend" };
  out.perWeek = slope * 7;
  if (slope <= 0) return { ...out, status: "no-trend" };
  const days = (goal.target - current) / slope;
  if (days > MAX_ETA_DAYS) return { ...out, status: "behind" };
  out.eta = new Date(now + days * DAY).toISOString();
  return { ...out, status: time(out.eta) <= by ? "on-track" : "behind" };
}

// A 1RM goal nobody should have to test: the same strength as a working set.
// Epley, run backwards, rounded to a weight that exists on a bar.
export function repEquivalents(target, reps = [5, 8], step = 5) {
  return reps.map((r) => ({ reps: r, weight: Math.round(target / (1 + r / 30) / step) * step }));
}

// Weeks trained in full, for the attendance goal. `weeks` is one row per
// calendar week since the goal was set: [{ sessions, current }].
export function weeksProgress(goal, weeks = []) {
  // The week in progress only counts once it's already complete: on a Monday
  // it is not a miss yet.
  const counted = weeks.filter((w) => !w.current || w.sessions >= goal.target);
  const hit = counted.filter((w) => w.sessions >= goal.target).length;
  return {
    id: goal.id, title: goal.title, kind: "weeks", target: goal.target,
    hit, total: counted.length,
    pct: counted.length ? Math.round((hit / counted.length) * 100) : 0,
    status: !counted.length ? "untracked" : hit === counted.length ? "on-track" : "behind",
  };
}
