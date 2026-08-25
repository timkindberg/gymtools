// =============================================================================
// ui.js — tiny DOM + rendering helpers. No framework, on purpose.
// =============================================================================

// el("div.card", {onclick}, [children]) style hyperscript.
export function el(tag, props = {}, children = []) {
  const [name, ...classes] = tag.split(".");
  const node = document.createElement(name || "div");
  if (classes.length) node.className = classes.join(" ");
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === "dataset") {
      Object.assign(node.dataset, v);
    } else if (k in node && k !== "list") {
      try { node[k] = v; } catch { node.setAttribute(k, v); }
    } else {
      node.setAttribute(k, v);
    }
  }
  appendChildren(node, children);
  return node;
}

function appendChildren(node, children) {
  const arr = Array.isArray(children) ? children : [children];
  for (const c of arr) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === "string" || typeof c === "number"
      ? document.createTextNode(String(c)) : c);
  }
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

export function fmtDate(iso, opts) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, opts || { weekday: "short", month: "short", day: "numeric" });
}
export function fmtDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
export function relDay(iso) {
  const days = Math.round((Date.now() - new Date(iso)) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.round(days / 7)}w ago`;
  return `${Math.round(days / 30)}mo ago`;
}

// ---- Simple SVG line chart --------------------------------------------------
// points: [{date, value}] ; returns an <svg> element.
export function lineChart(points, { color = "var(--accent)", height = 120, label = "", format = (v) => v, invertGood = false } = {}) {
  const w = 320, h = height, pad = { l: 30, r: 10, t: 12, b: 20 };
  const svg = svgEl("svg", { viewBox: `0 0 ${w} ${h}`, class: "chart", preserveAspectRatio: "none" });
  if (!points.length) {
    svg.appendChild(svgEl("text", { x: w / 2, y: h / 2, class: "chart-empty", "text-anchor": "middle" }, "No data yet"));
    return svg;
  }
  const values = points.map((p) => p.value);
  let min = Math.min(...values), max = Math.max(...values);
  if (min === max) { min -= 1; max += 1; }
  const innerW = w - pad.l - pad.r, innerH = h - pad.t - pad.b;
  const x = (i) => pad.l + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v) => pad.t + innerH - ((v - min) / (max - min)) * innerH;

  // gridlines (min / max)
  [min, max].forEach((v) => {
    svg.appendChild(svgEl("line", { x1: pad.l, x2: w - pad.r, y1: y(v), y2: y(v), class: "chart-grid" }));
    svg.appendChild(svgEl("text", { x: 2, y: y(v) + 3, class: "chart-axis" }, String(Math.round(v))));
  });

  const dAttr = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  svg.appendChild(svgEl("path", { d: dAttr, fill: "none", stroke: color, "stroke-width": 2.5, "stroke-linejoin": "round", "stroke-linecap": "round" }));
  points.forEach((p, i) => {
    svg.appendChild(svgEl("circle", { cx: x(i), cy: y(p.value), r: 3, fill: color }));
  });
  return svg;
}

// tiny inline sparkline-ish bar for symptom severity 0..10
export function severityBar(value, invert = false) {
  const v = Math.max(0, Math.min(10, Number(value) || 0));
  // for symptoms: high = bad (red). for energy/sleep (invert): high = good (green)
  const bad = invert ? 10 - v : v;
  const hue = 120 - (bad / 10) * 120; // 120 green -> 0 red
  const wrap = el("div.sev");
  wrap.appendChild(el("div.sev-fill", { style: `width:${v * 10}%;background:hsl(${hue} 70% 45%)` }));
  wrap.appendChild(el("span.sev-num", { text: String(v) }));
  return wrap;
}

function svgEl(name, attrs = {}, text) {
  const n = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
}

// ---- Hash router ------------------------------------------------------------
const routes = {};
let notFound = null;
export function route(path, handler) { routes[path] = handler; }
export function setNotFound(fn) { notFound = fn; }

export function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, "");
  const [path, ...rest] = hash.split("/");
  return { path: path || "today", param: rest.join("/") };
}

let lastPath = null;
let overrideScroll = false;
// A route handler can call this to take over scroll management for its render
// (e.g. the session view restores your position instead of jumping to top).
export function keepScroll() { overrideScroll = true; }

export function startRouter(onChange) {
  const go = () => {
    const { path, param } = currentRoute();
    const samePath = path === lastPath;
    const prevScroll = window.scrollY;
    overrideScroll = false;
    const handler = routes[path] || notFound;
    if (handler) handler(param);
    if (onChange) onChange(path, param);
    if (!overrideScroll) {
      // Same view re-rendering in place (swap, +set, delete…) keeps your spot;
      // navigating to a different view starts at the top.
      window.scrollTo(0, samePath ? prevScroll : 0);
    }
    lastPath = path;
  };
  window.addEventListener("hashchange", go);
  go();
}

export function navigate(to) {
  if (location.hash === "#/" + to) { window.dispatchEvent(new HashChangeEvent("hashchange")); }
  else location.hash = "/" + to;
}

// toast
let toastTimer = null;
export function toast(msg, ms = 2200) {
  let t = document.getElementById("toast");
  if (!t) {
    t = el("div", { id: "toast", class: "toast" });
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), ms);
}

// confirm dialog (promise)
export function confirmDialog(message, { okText = "OK", cancelText = "Cancel", danger = false } = {}) {
  return new Promise((resolve) => {
    const overlay = el("div.modal-overlay", { onclick: (e) => { if (e.target === overlay) done(false); } });
    const box = el("div.modal", {}, [
      el("p.modal-msg", { text: message }),
      el("div.modal-actions", {}, [
        el("button.btn.ghost", { text: cancelText, onclick: () => done(false) }),
        el("button", { class: "btn " + (danger ? "danger" : "primary"), text: okText, onclick: () => done(true) }),
      ]),
    ]);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    function done(v) { overlay.remove(); resolve(v); }
  });
}

// prompt dialog (promise) — resolves to the entered string, or null on cancel.
export function promptDialog(message, { value = "", okText = "Save", cancelText = "Cancel", inputmode = "numeric", suffix = "" } = {}) {
  return new Promise((resolve) => {
    const input = el("input.input", { type: "number", inputmode, value: value == null ? "" : String(value) });
    const overlay = el("div.modal-overlay", { onclick: (e) => { if (e.target === overlay) done(null); } });
    const box = el("div.modal", {}, [
      el("p.modal-msg", { text: message }),
      el("div.modal-field", {}, [input, suffix ? el("span.muted.small", { text: suffix }) : null]),
      el("div.modal-actions", {}, [
        el("button.btn.ghost", { text: cancelText, onclick: () => done(null) }),
        el("button.btn.primary", { text: okText, onclick: () => done(input.value === "" ? null : input.value) }),
      ]),
    ]);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    input.focus();
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") done(input.value === "" ? null : input.value); });
    function done(v) { overlay.remove(); resolve(v); }
  });
}
