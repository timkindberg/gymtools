// =============================================================================
// orientation.js — keep the app portrait on phones, no matter how you hold it.
// =============================================================================
// The manifest asks for portrait, and Android honours that (plus the lock()
// below) for the installed app. iOS ignores both, so there we counter-rotate:
// when a phone tips into landscape, <html> gets .rot-ccw / .rot-cw and the CSS
// turns <body> back upright relative to the device. In that mode the page no
// longer scrolls the window — #app does — so all scroll reads/writes go
// through scrollY()/scrollToY() here.

const PHONE_LANDSCAPE = "(orientation: landscape) and (max-height: 500px) and (pointer: coarse)";
const root = () => document.documentElement;

function rotated() {
  return root().classList.contains("rot-ccw") || root().classList.contains("rot-cw");
}
function scroller() {
  return rotated() ? document.getElementById("app") : null;
}

export function scrollY() {
  const s = scroller();
  return s ? s.scrollTop : window.scrollY;
}
export function scrollToY(top, behavior = "auto") {
  const s = scroller();
  (s || window).scrollTo({ top, behavior });
}

// Device angle: 90 = turned counter-clockwise, 270 (or -90) = clockwise.
function angle() {
  if (typeof window.orientation === "number") return (window.orientation + 360) % 360;
  return (screen.orientation && screen.orientation.angle) || 0;
}

export function initPortraitLock() {
  try { screen.orientation?.lock?.("portrait")?.catch(() => {}); } catch (e) { /* unsupported */ }

  const mq = window.matchMedia(PHONE_LANDSCAPE);
  const apply = () => {
    const y = scrollY();
    const on = mq.matches;
    const a = angle();
    root().classList.toggle("rot-ccw", on && a !== 270);
    root().classList.toggle("rot-cw", on && a === 270);
    scrollToY(y); // carry your place across the switch
  };
  mq.addEventListener?.("change", apply);
  window.addEventListener("orientationchange", () => setTimeout(apply, 50));
  screen.orientation?.addEventListener?.("change", apply);
  apply();
}
