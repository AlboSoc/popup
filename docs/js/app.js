"use strict";

const examples = window.POPUP_EXAMPLES || {};

function isDesignShape(obj) {
  return !!obj && Array.isArray(obj.widths) && Array.isArray(obj.strips);
}

function pretty(obj) {
  if (!isDesignShape(obj)) return JSON.stringify(obj, null, 2);
  const widths = obj.widths.map(x => clean(x)).join(", ");
  const strips = obj.strips.map(strip => `    [${strip.map(x => clean(x)).join(", ")}]`).join(",\n");
  return `{
  "widths": [${widths}],
  "strips": [
${strips}
  ]
}`;
}
function sum(a) { return a.reduce((x, y) => x + y, 0); }
function clone(x) { return structuredClone(x); }
function hsum(strip) { let s = 0; for (let j = 0; j < strip.length; j += 2) s += strip[j]; return s; }
function vsum(strip) { let s = 0; for (let j = 1; j < strip.length; j += 2) s += strip[j]; return s; }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c])); }

const CAMERA_ANIMATION_MS = 1500;
const INTRO_CAMERA_ANIMATION_MS = 1800;
const INTRO_SPIN_TURNS = 3;
const FLICK_DECAY_MS = 950;
const FLICK_START_THRESHOLD = 0.0024;
const IDLE_DELAY_MS = 3500;
const IDLE_FORCE_START_MS = 15000;
const IDLE_ORBIT_ZOOM_TRIGGER = 3;
const IDLE_ZOOM_RETURN_MS = 2200;
const IDLE_SPIN_AXIS = [1, Math.SQRT2, (1 + Math.sqrt(5)) / 2];
const IDLE_PRECESS_BASE_SPEED = 0.00005;
const IDLE_PRECESS_SPEED_SWELL = 0.00042;
const IDLE_BODY_SPIN_BASE_SPEED = 0.00008;
const IDLE_BODY_SPIN_SPEED_SWELL = 0.0019;
const MIN_CAMERA_ZOOM = 24;
const MAX_CAMERA_ZOOM = 360;

function quatNormalize(q) {
  const m = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / m, q[1] / m, q[2] / m, q[3] / m];
}

function quatMultiplyRaw(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
  ];
}

function quatMultiply(a, b) {
  return quatNormalize(quatMultiplyRaw(a, b));
}

function quatConjugate(q) {
  return [-q[0], -q[1], -q[2], q[3]];
}

function quatFromAxisAngle(axis, angle) {
  const [ax, ay, az] = vecNorm(axis);
  const half = angle / 2;
  const s = Math.sin(half);
  return quatNormalize([ax * s, ay * s, az * s, Math.cos(half)]);
}

function quatFromEuler(rx, ry, rz) {
  return quatMultiply(
    quatFromAxisAngle([0, 0, 1], rz),
    quatMultiply(
      quatFromAxisAngle([0, 1, 0], ry),
      quatFromAxisAngle([1, 0, 0], rx)
    )
  );
}

function quatRotateVec(q, v) {
  const p = [v[0], v[1], v[2], 0];
  const qp = quatMultiplyRaw(quatMultiplyRaw(q, p), quatConjugate(q));
  return [qp[0], qp[1], qp[2]];
}

function quatNlerp(a, b, t) {
  let qb = b;
  if (a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0) qb = [-b[0], -b[1], -b[2], -b[3]];
  return quatNormalize([
    a[0] * (1 - t) + qb[0] * t,
    a[1] * (1 - t) + qb[1] * t,
    a[2] * (1 - t) + qb[2] * t,
    a[3] * (1 - t) + qb[3] * t
  ]);
}

function quatAngleBetween(a, b) {
  const dot = Math.min(1, Math.max(-1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])));
  return 2 * Math.acos(dot);
}

function cameraPose(view = {}) {
  return {
    quat: quatNormalize(view.quat ? view.quat.slice() : quatFromEuler(0.24, 0.32, 0.08)),
    zoom: Number.isFinite(view.zoom) ? view.zoom : 116,
    panX: Number.isFinite(view.panX) ? view.panX : 0,
    panY: Number.isFinite(view.panY) ? view.panY : 0
  };
}

const defaultCam = cameraPose();

const panes = document.getElementById("panes");
const dataEl = document.getElementById("data");
const varNameEl = document.getElementById("varName");
const varDescEl = document.getElementById("varDesc");
const varKindEl = document.getElementById("varKind");
const controlFieldsEl = document.getElementById("controlFields");
const controlValueEl = document.getElementById("controlValue");
const controlMinEl = document.getElementById("controlMin");
const controlMaxEl = document.getElementById("controlMax");
const controlStepEl = document.getElementById("controlStep");
const controlSliderEl = document.getElementById("controlSlider");
const statusEl = document.getElementById("status");
const opStatusEl = document.getElementById("opStatus");
const varListEl = document.getElementById("varList");
const pattern = document.getElementById("pattern");
const canvas = document.getElementById("view3d");
const glCanvas = document.getElementById("view3dgl");
const ctx = canvas.getContext("2d");
const gl = glCanvas.getContext("webgl", { antialias: true, alpha: true, premultipliedAlpha: true });
const cubeCanvas = document.getElementById("viewCube");
const cubeCtx = cubeCanvas.getContext("2d");
const pane3dEl = document.getElementById("pane3d");
const idleOrbitEl = document.getElementById("idleOrbit");

let selected = 0;
let displayedDesign = 0;
let cam = cameraPose(defaultCam);
let camTarget = cameraPose(defaultCam);
let camAnimHandle = 0;
let camAnimation = null;
let inertiaHandle = 0;
let angularVelocity = [0, 0, 0];
let inertiaLastTime = 0;
let lastInteractionTime = performance.now();
let idleOrbitHandle = 0;
let idleOrbitLastTime = 0;
let idleOrbitActive = false;
let idleOrbitStartedAt = 0;
let idleOrbitAxis = vecNorm(IDLE_SPIN_AXIS);
let paneWeights = [20, 22, 26, 32];
let hover3D = { active: false, x: 0, y: 0, mode: "rotate" };
let view3DHotkeysActive = false;
let viewCubeTargets = [];
let pointers = new Map();
let lastSingle = null;
let lastPinch = null;
let dragGutter = null;
let vars = [];
let viewTheme = "dark-webgl";
let webglState = null;

function validate(d) {
  if (!d || !Array.isArray(d.widths) || !Array.isArray(d.strips)) return "Expected { widths:[...], strips:[[...], ...] }";
  if (d.widths.length !== d.strips.length) return "widths.length must equal strips.length.";
  if (!d.widths.every(x => Number.isFinite(x) && x > 0)) return "Every width must be positive.";
  if (d.strips.length === 0) return "Need at least one strip.";
  const H = hsum(d.strips[0]);
  const V = vsum(d.strips[0]);
  if (H <= 0 || V <= 0) return "First strip needs positive horizontal and vertical sums.";
  if (Math.abs(H - V) > 1e-6) return `First strip endpoint mismatch: horizontal ${H.toFixed(3)}, vertical ${V.toFixed(3)}.`;
  for (let i = 0; i < d.strips.length; i++) {
    const s = d.strips[i];
    if (!Array.isArray(s) || s.length < 2) return `Strip ${i} needs at least [horizontal, vertical].`;
    if (!s.every(x => Number.isFinite(x) && x >= 0)) return `Strip ${i} has a non-number or negative length.`;
    const hs = hsum(s);
    const vs = vsum(s);
    if (Math.abs(hs - H) > 1e-6 || Math.abs(vs - H) > 1e-6) {
      return `Strip ${i} endpoint invariants fail: horizontal ${hs.toFixed(3)}, vertical ${vs.toFixed(3)}, expected both ${H.toFixed(3)}.`;
    }
  }
  return "";
}

function paperParams(d = currentDesign()) {
  return { W: sum(d.widths), H: hsum(d.strips[0]), twoH: 2 * hsum(d.strips[0]) };
}

function currentDesign() {
  return vars[displayedDesign].value;
}

function isDesignVar(v) {
  return (v.kind || "design") === "design";
}

function isControlVar(v) {
  return (v.kind || "design") === "control";
}

function defaultControlSpec() {
  return { mode: "slider", value: 0.5, min: 0, max: 1, step: 0.05 };
}

function sanitizeControl(control = {}) {
  const min = Number.isFinite(Number(control.min)) ? Number(control.min) : 0;
  const maxRaw = Number.isFinite(Number(control.max)) ? Number(control.max) : 1;
  const max = maxRaw >= min ? maxRaw : min + 1;
  const step = Number.isFinite(Number(control.step)) && Number(control.step) > 0 ? Number(control.step) : 0.05;
  let value = Number.isFinite(Number(control.value)) ? Number(control.value) : min;
  value = Math.max(min, Math.min(max, value));
  return { mode: "slider", min, max, step, value };
}

function makeControlVar(name, description, control = defaultControlSpec()) {
  const spec = sanitizeControl(control);
  return { kind: "control", name, description, source: "", control: spec, value: spec.value };
}

function findFirstDesignIndex(start = 0) {
  for (let i = start; i < vars.length; i++) if (isDesignVar(vars[i])) return i;
  for (let i = 0; i < start; i++) if (isDesignVar(vars[i])) return i;
  return -1;
}

function countDesignVars() {
  return vars.filter(isDesignVar).length;
}

function nextVarName() {
  let i = 1;
  while (vars.some(v => v.name === `var${i}`)) i++;
  return `var${i}`;
}

function validateVarName(name, index = selected) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return "Variable name must be a valid JavaScript identifier.";
  const clash = vars.findIndex((v, i) => i !== index && v.name === name);
  if (clash !== -1) return `Variable name '${name}' is already in use.`;
  return "";
}

function setOpStatus(msg, bad = false) {
  opStatusEl.className = bad ? "bad" : "";
  opStatusEl.textContent = msg;
}

function syncViewTheme() {
  document.body.dataset.viewTheme = viewTheme;
  const webglMode = viewTheme === "dark-webgl";
  glCanvas.style.display = webglMode ? "block" : "none";
}

function nearlyEqual(a, b, eps = 1e-6) {
  return Math.abs(a - b) <= eps;
}

function showStatus(msg, bad = false) {
  statusEl.className = bad ? "bad" : "";
  statusEl.textContent = msg;
}

function setSelected(index) {
  const priorDisplayed = displayedDesign;
  selected = index;
  if (isDesignVar(vars[index])) {
    displayedDesign = index;
    if (displayedDesign !== priorDisplayed) startPlotSelectionAnimation();
  }
}

function compatible(a, b) {
  const na = normalizeSugaredDesign(a);
  const nb = normalizeSugaredDesign(b);
  const ea = validate(na), eb = validate(nb);
  if (ea) throw Error("A invalid: " + ea);
  if (eb) throw Error("B invalid: " + eb);
  if (na.widths.length !== nb.widths.length) throw Error("Operator requires equal number of strips.");
  for (let i = 0; i < na.widths.length; i++) {
    if (Math.abs(na.widths[i] - nb.widths[i]) > 1e-6) throw Error("Operator requires equal strip widths.");
  }
  if (Math.abs(hsum(na.strips[0]) - hsum(nb.strips[0])) > 1e-6) throw Error("Operator requires equal H.");
  return { a: na, b: nb, H: hsum(na.strips[0]) };
}

function stripBreakpoints(strip) {
  let u = 0, y = 0;
  const pts = [{ u, y }];
  for (let j = 0; j < strip.length; j++) {
    const L = strip[j];
    if (j % 2 === 0) u += L; else y += L;
    pts.push({ u, y });
  }
  return pts;
}

function yAt(strip, u) {
  let curU = 0, curY = 0;
  for (let j = 0; j < strip.length; j++) {
    const L = strip[j];
    if (j % 2 === 0) {
      const nextU = curU + L;
      if (u < nextU - 1e-9) return curY;
      curU = nextU;
    } else {
      curY += L;
    }
  }
  return curY;
}

function clean(x) { return Math.abs(x) < 1e-10 ? 0 : Number(x.toFixed(10)); }

function canonicalizeStrip(strip) {
  const segments = [];
  for (let i = 0; i < strip.length; i++) {
    const value = clean(strip[i]);
    if (value <= 0) continue;
    const axis = i % 2;
    const last = segments[segments.length - 1];
    if (last && last.axis === axis) last.value = clean(last.value + value);
    else segments.push({ axis, value });
  }
  if (!segments.length) return [0, 0];
  const out = [];
  if (segments[0].axis === 1) out.push(0);
  for (const seg of segments) out.push(seg.value);
  return out;
}

function normalizeDesign(design) {
  if (!isDesignShape(design)) return design;
  return {
    widths: design.widths.map(clean),
    strips: design.strips.map(canonicalizeStrip)
  };
}

function canonicalizeSugaredDesign(design) {
  if (!isDesignShape(design)) return design;
  return {
    widths: design.widths.map(clean),
    strips: design.strips.map(canonicalizeStrip)
  };
}

function validateSugaredDesign(design) {
  if (!design || !Array.isArray(design.widths) || !Array.isArray(design.strips)) return "Expected { widths:[...], strips:[[...], ...] }";
  if (design.widths.length !== design.strips.length) return "widths.length must equal strips.length.";
  if (design.strips.length === 0) return "Need at least one strip.";
  if (!design.widths.every(x => Number.isFinite(x))) return "Every width must be numeric.";
  const H = hsum(design.strips[0]);
  const V = vsum(design.strips[0]);
  if (H <= 0 || V <= 0) return "First strip needs positive horizontal and vertical sums.";
  if (Math.abs(H - V) > 1e-6) return `First strip endpoint mismatch: horizontal ${H.toFixed(3)}, vertical ${V.toFixed(3)}.`;
  for (let i = 0; i < design.strips.length; i++) {
    const s = design.strips[i];
    if (!Array.isArray(s) || s.length < 2) return `Strip ${i} needs at least [horizontal, vertical].`;
    if (!s.every(x => Number.isFinite(x) && x >= 0)) return `Strip ${i} has a non-number or negative length.`;
    const hs = hsum(s);
    const vs = vsum(s);
    if (Math.abs(hs - H) > 1e-6 || Math.abs(vs - H) > 1e-6) {
      return `Strip ${i} endpoint invariants fail: horizontal ${hs.toFixed(3)}, vertical ${vs.toFixed(3)}, expected both ${H.toFixed(3)}.`;
    }
  }
  return "";
}

function mergeStripsMax(strips, H) {
  let merged = canonicalizeStrip([clean(H), clean(H)]);
  for (const strip of strips) merged = combineStrip(merged, strip, H, (a, b) => Math.max(a, b));
  return merged;
}

function normalizeSugaredDesign(design) {
  if (!isDesignShape(design)) return design;
  const sugared = canonicalizeSugaredDesign(design);
  const err = validateSugaredDesign(sugared);
  if (err) throw Error(err);
  const H = hsum(sugared.strips[0]);
  const spans = [];
  const boundaries = [];
  let x = 0;
  for (let i = 0; i < sugared.widths.length; i++) {
    const nextX = clean(x + sugared.widths[i]);
    const left = clean(Math.min(x, nextX));
    const right = clean(Math.max(x, nextX));
    if (right - left > 1e-9) {
      spans.push({ left, right, strip: sugared.strips[i] });
      boundaries.push(left, right);
    }
    x = nextX;
  }
  if (!spans.length) throw Error("Need at least one non-zero strip width.");
  boundaries.sort((a, b) => a - b);
  const xs = [];
  for (const value of boundaries) {
    if (!xs.length || Math.abs(value - xs[xs.length - 1]) > 1e-9) xs.push(value);
  }
  const out = { widths: [], strips: [] };
  for (let i = 0; i < xs.length - 1; i++) {
    const xa = xs[i];
    const xb = xs[i + 1];
    if (xb <= xa + 1e-9) continue;
    const covering = spans
      .filter(span => span.left < xb - 1e-9 && span.right > xa + 1e-9)
      .map(span => span.strip);
    out.widths.push(clean(xb - xa));
    out.strips.push(covering.length ? mergeStripsMax(covering, H) : canonicalizeStrip([clean(H), clean(H)]));
  }
  const normalized = normalizeDesign(out);
  const normalizedErr = validate(normalized);
  if (normalizedErr) throw Error(normalizedErr);
  return normalized;
}

function clamp01Height(y, H) {
  return clean(Math.max(0, Math.min(H, y)));
}

function combineStrip(sa, sb, H, combineFn, forceMonotone = true) {
  const set = new Set([0, H]);
  for (const p of stripBreakpoints(sa)) set.add(clean(p.u));
  for (const p of stripBreakpoints(sb)) set.add(clean(p.u));
  const us = [...set].filter(x => x >= -1e-9 && x <= H + 1e-9).sort((x, y) => x - y);

  const out = [];
  function pushHorizontal(length) {
    const value = clean(length);
    if (value <= 0) return;
    if (!out.length) {
      out.push(value);
      return;
    }
    if (out.length % 2 === 1) out[out.length - 1] = clean(out[out.length - 1] + value);
    else out.push(value);
  }
  function pushVertical(length) {
    const value = clean(length);
    if (value <= 0) return;
    if (!out.length) out.push(0);
    if (out.length % 2 === 0) out[out.length - 1] = clean(out[out.length - 1] + value);
    else out.push(value);
  }

  let currentY = 0;
  for (let i = 0; i < us.length - 1; i++) {
    const u = us[i];
    const nextU = us[i + 1];
    let targetY = clamp01Height(combineFn(yAt(sa, u), yAt(sb, u), H), H);
    if (forceMonotone && targetY < currentY) targetY = currentY;
    if (targetY > currentY + 1e-9) pushVertical(targetY - currentY);
    currentY = targetY;
    if (nextU > u + 1e-9) pushHorizontal(nextU - u);
  }
  if (currentY < H - 1e-9) pushVertical(H - currentY);
  return canonicalizeStrip(out);
}

function combineDesigns(a, b, label, combineFn, forceMonotone = true) {
  const { a: na, b: nb, H } = compatible(a, b);
  const out = { widths: clone(na.widths), strips: [] };
  for (let i = 0; i < na.strips.length; i++) {
    const sa = na.strips[i], sb = nb.strips[i];
    out.strips.push(combineStrip(sa, sb, H, combineFn, forceMonotone));
  }
  const normalized = normalizeDesign(out);
  const err = validate(normalized);
  if (err) throw Error(`${label} produced invalid result: ${err}`);
  return normalized;
}

function max(a, b) { return combineDesigns(a, b, "max", (ya, yb) => Math.max(ya, yb)); }
function min(a, b) { return combineDesigns(a, b, "min", (ya, yb) => Math.min(ya, yb)); }
function add(a, b) { return combineDesigns(a, b, "add", (ya, yb, H) => Math.min(H, ya + yb)); }
function sub(a, b) { return combineDesigns(a, b, "sub", (ya, yb) => Math.max(0, ya - yb)); }
function intersection(a, b) { return min(a, b); }
function union(a, b) { return max(a, b); }
function blend(a, b, t = 0.5) {
  const alpha = Number(t);
  if (!Number.isFinite(alpha)) throw Error("blend(a, b, t) needs a numeric t.");
  return combineDesigns(a, b, "blend", (ya, yb) => ya * (1 - alpha) + yb * alpha);
}
function clamp(design, lower, upper) { return max(lower, min(design, upper)); }
function mirror(design) {
  const out = clone(normalizeSugaredDesign(design));
  out.widths.reverse();
  out.strips.reverse();
  return normalizeDesign(out);
}
function pad(design, start = 0, end = start) {
  if (![start, end].every(v => Number.isFinite(v) && v >= 0)) throw Error("pad(design, start, end) needs non-negative numeric padding.");
  const out = clone(normalizeSugaredDesign(design));
  out.strips = out.strips.map(strip => {
    const next = [];
    if (start > 1e-9) next.push(clean(start), clean(start));
    next.push(...strip.map(clean));
    if (end > 1e-9) next.push(clean(end), clean(end));
    return next;
  });
  const normalized = normalizeDesign(out);
  const err = validate(normalized);
  if (err) throw Error("pad produced invalid result: " + err);
  return normalized;
}
function repeat(design, n) {
  design = normalizeSugaredDesign(design);
  const times = Math.floor(Number(n));
  if (!Number.isFinite(times) || times < 1) throw Error("repeat(design, n) needs n >= 1.");
  const out = { widths: [], strips: [] };
  for (let i = 0; i < times; i++) {
    out.widths.push(...design.widths.map(clean));
    out.strips.push(...design.strips.map(strip => strip.map(clean)));
  }
  return normalizeDesign(out);
}

function ensureSameH(a, b, label) {
  const Ha = hsum(a.strips[0]);
  const Hb = hsum(b.strips[0]);
  if (Math.abs(Ha - Hb) > 1e-6) throw Error(`${label} requires equal H.`);
  return Ha;
}

function widthsArg(spec, label) {
  if (Array.isArray(spec)) {
    const out = spec.map(clean);
    if (!out.length || !out.every(v => Number.isFinite(v) && Math.abs(v) > 1e-9)) {
      throw Error(`${label} widths must be non-zero finite numbers.`);
    }
    return out;
  }
  const value = clean(Number(spec));
  if (!Number.isFinite(value) || Math.abs(value) <= 1e-9) throw Error(`${label} width must be non-zero.`);
  return [value];
}

function concat(...designs) {
  if (designs.length < 1) throw Error("concat(...) needs at least one design.");
  const out = { widths: [], strips: [] };
  let H = null;
  for (const design of designs) {
    if (!isDesignShape(design)) throw Error("concat(...) arguments must be designs.");
    const sugared = canonicalizeSugaredDesign(design);
    const err = validateSugaredDesign(sugared);
    if (err) throw Error(`concat input invalid: ${err}`);
    const thisH = hsum(sugared.strips[0]);
    if (H == null) H = thisH;
    else if (Math.abs(H - thisH) > 1e-6) throw Error("concat(...) requires equal H.");
    out.widths.push(...sugared.widths.map(clean));
    out.strips.push(...sugared.strips.map(strip => strip.map(clean)));
  }
  const normalized = normalizeSugaredDesign(out);
  const err = validate(normalized);
  if (err) throw Error(`concat produced invalid result: ${err}`);
  return normalized;
}

function offset(design, before, after = 0) {
  if (!isDesignShape(design)) throw Error("offset(design, before, after) needs a design as its first argument.");
  const sugared = canonicalizeSugaredDesign(design);
  const err = validateSugaredDesign(sugared);
  if (err) throw Error(`offset input invalid: ${err}`);
  const leftWidths = before === 0 ? [] : widthsArg(before, "offset(before)");
  const rightWidths = after === 0 ? [] : widthsArg(after, "offset(after)");
  const H = hsum(sugared.strips[0]);
  const filler = [clean(H), clean(H)];
  return canonicalizeSugaredDesign({
    widths: [...leftWidths, ...sugared.widths.map(clean), ...rightWidths],
    strips: [
      ...leftWidths.map(() => filler.slice()),
      ...sugared.strips.map(strip => strip.map(clean)),
      ...rightWidths.map(() => filler.slice())
    ]
  });
}

function foldedDesign(widths, H) {
  return normalizeDesign({
    widths: widths.map(clean),
    strips: widths.map(() => [clean(H), clean(H)])
  });
}

function plateauDesign(widths, H, x0, x1, u0, level) {
  const xs = [0];
  for (const w of widths) xs.push(xs[xs.length - 1] + w);
  const strips = [];
  for (let i = 0; i < widths.length; i++) {
    const cx = (xs[i] + xs[i + 1]) / 2;
    if (cx < x0 - 1e-9 || cx > x1 + 1e-9) {
      strips.push([clean(H), clean(H)]);
      continue;
    }
    strips.push(canonicalizeStrip([clean(u0), clean(level), clean(H - u0), clean(H - level)]));
  }
  return normalizeDesign({ widths: widths.map(clean), strips });
}

function recursiveCornerCubes({
  levels = 4,
  paperWidth = 2,
  H = 2,
  rootSize = 1,
  xCenter = 1
} = {}) {
  const depth = Math.max(1, Math.floor(Number(levels)));
  const sizes = [];
  for (let i = 0; i < depth; i++) sizes.push(clean(rootSize / (2 ** i)));
  if (sum(sizes) > H + 1e-9) throw Error(`recursiveCornerCubes levels exceed H=${H}.`);
  const boundaries = new Set([0, paperWidth]);
  for (const size of sizes) {
    boundaries.add(clean(xCenter - size / 2));
    boundaries.add(clean(xCenter + size / 2));
  }
  const xs = [...boundaries].filter(x => x >= -1e-9 && x <= paperWidth + 1e-9).sort((a, b) => a - b);
  const widths = [];
  for (let i = 0; i < xs.length - 1; i++) widths.push(clean(xs[i + 1] - xs[i]));

  const cubes = [];
  function addCube(level, backU, baseY) {
    const size = sizes[level];
    if (!Number.isFinite(size) || size <= 0) return;
    cubes.push({
      x0: clean(xCenter - size / 2),
      x1: clean(xCenter + size / 2),
      u0: clean(backU - size),
      u1: clean(backU),
      top: clean(baseY + size)
    });
    if (level + 1 >= sizes.length) return;
    const nextSize = sizes[level + 1];
    addCube(level + 1, clean(backU), clean(baseY + size));
    addCube(level + 1, clean(backU - size), clean(baseY));
  }

  addCube(0, clean(H), 0);

  function activeHeight(cx, u) {
    let y = 0;
    for (const cube of cubes) {
      if (cx < cube.x0 - 1e-9 || cx > cube.x1 + 1e-9) continue;
      if (u < cube.u0 - 1e-9 || u > cube.u1 + 1e-9) continue;
      y = Math.max(y, cube.top);
    }
    return clean(Math.min(H, y));
  }

  function profileForX(cx) {
    const points = new Set([0, H]);
    for (const cube of cubes) {
      if (cx < cube.x0 - 1e-9 || cx > cube.x1 + 1e-9) continue;
      points.add(clean(Math.max(0, Math.min(H, cube.u0))));
      points.add(clean(Math.max(0, Math.min(H, cube.u1))));
    }
    const us = [...points].sort((a, b) => a - b);
    const out = [];
    let currentY = 0;
    for (let i = 0; i < us.length - 1; i++) {
      const u0 = us[i];
      const u1 = us[i + 1];
      if (u1 <= u0 + 1e-9) continue;
      const mid = clean((u0 + u1) / 2);
      const targetY = activeHeight(cx, mid);
      if (targetY > currentY + 1e-9) out.push(clean(targetY - currentY));
      out.push(clean(u1 - u0));
      currentY = targetY;
    }
    if (currentY < H - 1e-9) out.push(clean(H - currentY));
    return canonicalizeStrip(out);
  }

  const strips = [];
  for (let i = 0; i < widths.length; i++) {
    const cx = clean((xs[i] + xs[i + 1]) / 2);
    strips.push(profileForX(cx));
  }
  return normalizeDesign({ widths, strips });
}

function stripsFromHeightfield(widths, columns, H, depthSteps = 1) {
  const totalH = clean(H);
  if (!Array.isArray(widths) || !Array.isArray(columns) || widths.length !== columns.length) {
    throw Error("stripsFromHeightfield(widths, columns, H) needs one height column per strip width.");
  }
  if (!Number.isFinite(totalH) || totalH <= 0) throw Error("stripsFromHeightfield(...) needs H > 0.");
  const steps = Array.isArray(depthSteps)
    ? depthSteps.map(clean)
    : (() => {
        const step = clean(depthSteps);
        if (!Number.isFinite(step) || step <= 0) throw Error("stripsFromHeightfield(...) needs depthStep > 0.");
        const depthCount = clean(totalH / step);
        if (Math.abs(depthCount - Math.round(depthCount)) > 1e-6) {
          throw Error("H must be an integer multiple of depthStep.");
        }
        return Array(Math.round(depthCount)).fill(step);
      })();
  if (!steps.length || !steps.every(s => Number.isFinite(s) && s > 0)) {
    throw Error("stripsFromHeightfield(...) needs positive depth steps.");
  }
  if (Math.abs(sum(steps) - totalH) > 1e-6) {
    throw Error("Depth steps must sum to H.");
  }

  const strips = columns.map(column => {
    if (!Array.isArray(column) || column.length !== steps.length) {
      throw Error(`Each height column must contain exactly ${steps.length} samples.`);
    }
    const out = [];
    function pushHorizontal(length) {
      const value = clean(length);
      if (value <= 0) return;
      if (!out.length) {
        out.push(value);
        return;
      }
      if (out.length % 2 === 1) out[out.length - 1] = clean(out[out.length - 1] + value);
      else out.push(value);
    }
    function pushVertical(length) {
      const value = clean(length);
      if (value <= 0) return;
      if (!out.length) out.push(0);
      if (out.length % 2 === 0) out[out.length - 1] = clean(out[out.length - 1] + value);
      else out.push(value);
    }
    let currentY = 0;
    for (let i = 0; i < column.length; i++) {
      const sampled = clamp01Height(column[i], totalH);
      const targetY = clean(Math.max(currentY, sampled));
      if (targetY > currentY + 1e-9) pushVertical(targetY - currentY);
      pushHorizontal(steps[i]);
      currentY = targetY;
    }
    if (currentY < totalH - 1e-9) pushVertical(totalH - currentY);
    return canonicalizeStrip(out);
  });
  return normalizeDesign({ widths: widths.map(clean), strips });
}

function subdivisionGrid({ count = null, total = 1, levels = null, minSpacing = null } = {}) {
  const parsedTotal = Number(total);
  if (!Number.isFinite(parsedTotal) || parsedTotal <= 0) throw Error("subdivisionGrid(...) needs total > 0.");
  let cells = null;
  if (count != null) {
    const parsedCount = Math.floor(Number(count));
    if (!Number.isFinite(parsedCount) || parsedCount < 1) throw Error("subdivisionGrid(...) count must be >= 1.");
    cells = parsedCount;
  } else if (levels != null) {
    const parsedLevels = Math.floor(Number(levels));
    if (!Number.isFinite(parsedLevels) || parsedLevels < 0) throw Error("subdivisionGrid(...) levels must be >= 0.");
    cells = 2 ** parsedLevels;
  } else if (minSpacing != null) {
    const spacing = Number(minSpacing);
    if (!Number.isFinite(spacing) || spacing <= 0) throw Error("subdivisionGrid(...) minSpacing must be > 0.");
    cells = 1;
    while (parsedTotal / cells > spacing + 1e-9) cells *= 2;
  } else {
    cells = 1;
  }
  const step = clean(parsedTotal / cells);
  const edges = [0];
  for (let i = 1; i <= cells; i++) edges.push(clean(i * step));
  const centers = [];
  for (let i = 0; i < cells; i++) centers.push(clean((edges[i] + edges[i + 1]) / 2));
  return {
    count: cells,
    step,
    sizes: Array(cells).fill(step),
    edges,
    centers
  };
}

function subdivisionLevelsFromGrid(grid) {
  const levels = Math.round(Math.log2(grid.count));
  if (2 ** levels !== grid.count) throw Error("Subdivision grid count must be a power of two.");
  return levels;
}

function sampledSurface({
  xCount = 11,
  zCount = 10,
  paperWidth = null,
  H = null,
  xDomain = [-1, 1],
  zDomain = [-1, 1],
  sampler
} = {}) {
  const nx = Math.max(1, Math.floor(Number(xCount)));
  const nz = Math.max(1, Math.floor(Number(zCount)));
  const parsedH = H == null ? NaN : Number(H);
  const parsedW = paperWidth == null ? NaN : Number(paperWidth);
  const totalH = Number.isFinite(parsedH) ? parsedH : nz;
  const totalW = Number.isFinite(parsedW) ? parsedW : nx;
  if (typeof sampler !== "function") throw Error("sampledSurface(...) needs a sampler(x, z, ix, iz).");
  if (!Array.isArray(xDomain) || xDomain.length !== 2 || !xDomain.every(Number.isFinite)) {
    throw Error("sampledSurface(...) needs xDomain = [min, max].");
  }
  if (!Array.isArray(zDomain) || zDomain.length !== 2 || !zDomain.every(Number.isFinite)) {
    throw Error("sampledSurface(...) needs zDomain = [min, max].");
  }
  const widths = Array(nx).fill(clean(totalW / nx));
  const columns = [];
  for (let ix = 0; ix < nx; ix++) {
    const tx = (ix + 0.5) / nx;
    const x = clean(xDomain[0] + tx * (xDomain[1] - xDomain[0]));
    const samples = [];
    for (let iz = 0; iz < nz; iz++) {
      const tz = (iz + 0.5) / nz;
      const z = clean(zDomain[0] + tz * (zDomain[1] - zDomain[0]));
      samples.push(clean(Number(sampler(x, z, ix, iz)) * totalH));
    }
    columns.push(samples);
  }
  return stripsFromHeightfield(widths, columns, totalH, totalH / nz);
}

function subdividedSurface({
  xLevels = null,
  zLevels = null,
  minSpacing = null,
  xMinSpacing = null,
  zMinSpacing = null,
  paperWidth = 10,
  H = 10,
  xDomain = [-1, 1],
  zDomain = [-1, 1],
  sampler
} = {}) {
  if (typeof sampler !== "function") throw Error("subdividedSurface(...) needs a sampler(x, z, ix, iz).");
  if (!Array.isArray(xDomain) || xDomain.length !== 2 || !xDomain.every(Number.isFinite)) {
    throw Error("subdividedSurface(...) needs xDomain = [min, max].");
  }
  if (!Array.isArray(zDomain) || zDomain.length !== 2 || !zDomain.every(Number.isFinite)) {
    throw Error("subdividedSurface(...) needs zDomain = [min, max].");
  }
  const xGrid = subdivisionGrid({
    levels: xLevels,
    minSpacing: xMinSpacing == null ? minSpacing : xMinSpacing,
    total: paperWidth
  });
  const zGrid = subdivisionGrid({
    levels: zLevels,
    minSpacing: zMinSpacing == null ? minSpacing : zMinSpacing,
    total: H
  });
  const widths = xGrid.sizes.slice();
  const columns = [];
  for (let ix = 0; ix < xGrid.count; ix++) {
    const tx = xGrid.centers[ix] / paperWidth;
    const x = clean(xDomain[0] + tx * (xDomain[1] - xDomain[0]));
    const samples = [];
    for (let iz = 0; iz < zGrid.count; iz++) {
      const tz = zGrid.centers[iz] / H;
      const z = clean(zDomain[0] + tz * (zDomain[1] - zDomain[0]));
      samples.push(clean(Number(sampler(x, z, ix, iz, xGrid, zGrid)) * H));
    }
    columns.push(samples);
  }
  return stripsFromHeightfield(widths, columns, H, zGrid.sizes);
}

function progressiveSubdividedSurface({
  xLevels = null,
  zLevels = null,
  minSpacing = null,
  xMinSpacing = null,
  zMinSpacing = null,
  paperWidth = 10,
  H = 10,
  xDomain = [-1, 1],
  zDomain = [-1, 1],
  sampler
} = {}) {
  if (typeof sampler !== "function") throw Error("progressiveSubdividedSurface(...) needs a sampler(x, z, ix, iz).");
  if (!Array.isArray(xDomain) || xDomain.length !== 2 || !xDomain.every(Number.isFinite)) {
    throw Error("progressiveSubdividedSurface(...) needs xDomain = [min, max].");
  }
  if (!Array.isArray(zDomain) || zDomain.length !== 2 || !zDomain.every(Number.isFinite)) {
    throw Error("progressiveSubdividedSurface(...) needs zDomain = [min, max].");
  }

  const finalX = subdivisionGrid({
    levels: xLevels,
    minSpacing: xMinSpacing == null ? minSpacing : xMinSpacing,
    total: paperWidth
  });
  const finalZ = subdivisionGrid({
    levels: zLevels,
    minSpacing: zMinSpacing == null ? minSpacing : zMinSpacing,
    total: H
  });
  const finalXLevels = subdivisionLevelsFromGrid(finalX);
  const finalZLevels = subdivisionLevelsFromGrid(finalZ);
  const stageCount = Math.max(finalXLevels, finalZLevels) + 1;
  const widths = finalX.sizes.slice();
  let out = foldedDesign(widths, H);

  for (let stage = 0; stage < stageCount; stage++) {
    const coarseXLevels = Math.min(stage, finalXLevels);
    const coarseZLevels = Math.min(stage, finalZLevels);
    const coarseX = subdivisionGrid({ levels: coarseXLevels, total: paperWidth });
    const coarseZ = subdivisionGrid({ levels: coarseZLevels, total: H });
    const pointColumns = Array.from({ length: finalX.count }, () => Array(finalZ.count).fill(0));

    for (let ix = 0; ix < coarseX.count; ix++) {
      const tx = coarseX.centers[ix] / paperWidth;
      const x = clean(xDomain[0] + tx * (xDomain[1] - xDomain[0]));
      const fineIx = Math.min(finalX.count - 1, Math.max(0, Math.floor(coarseX.centers[ix] / finalX.step)));
      for (let iz = 0; iz < coarseZ.count; iz++) {
        const tz = coarseZ.centers[iz] / H;
        const z = clean(zDomain[0] + tz * (zDomain[1] - zDomain[0]));
        const fineIz = Math.min(finalZ.count - 1, Math.max(0, Math.floor(coarseZ.centers[iz] / finalZ.step)));
        pointColumns[fineIx][fineIz] = clean(Math.max(
          pointColumns[fineIx][fineIz],
          Number(sampler(x, z, ix, iz, coarseX, coarseZ, stage)) * H
        ));
      }
    }

    out = max(out, stripsFromHeightfield(widths, pointColumns, H, finalZ.sizes));
  }

  return out;
}

function sampledSphere(options = {}) {
  const radius = Number.isFinite(Number(options.radius)) ? Number(options.radius) : 1;
  return sampledSurface({
    ...options,
    xDomain: options.xDomain || [-1, 1],
    zDomain: options.zDomain || [0, 1],
    sampler: (x, z) => {
      const rr = radius * radius;
      const dz = 1 - z;
      const d2 = x * x + dz * dz;
      return d2 >= rr ? 0 : Math.sqrt(rr - d2) / radius;
    }
  });
}

function sampledCone(options = {}) {
  const radius = Number.isFinite(Number(options.radius)) ? Number(options.radius) : 1;
  return sampledSurface({
    ...options,
    xDomain: options.xDomain || [-1, 1],
    zDomain: options.zDomain || [0, 1],
    sampler: (x, z) => {
      const dz = 1 - z;
      const r = Math.sqrt(x * x + dz * dz);
      return Math.max(0, 1 - r / radius);
    }
  });
}

function sampledRidge(options = {}) {
  const center = Number.isFinite(Number(options.center)) ? Number(options.center) : 0;
  const halfWidth = Number.isFinite(Number(options.halfWidth)) ? Number(options.halfWidth) : 1.15;
  const sharpness = Number.isFinite(Number(options.sharpness)) ? Number(options.sharpness) : 1.2;
  return sampledSurface({
    ...options,
    xDomain: options.xDomain || [-1, 1],
    zDomain: options.zDomain || [0, 1],
    sampler: (x, z) => {
      const band = Math.max(0, 1 - Math.abs((x - center) / halfWidth));
      return z * Math.pow(band, sharpness);
    }
  });
}

function offsetSampledSurface({
  xCount = 11,
  zCount = 10,
  paperWidth = null,
  H = null,
  xDomain = [-1, 1],
  zDomain = [-1, 1],
  xOffset = 0.5,
  zOffset = 0.5,
  sampler
} = {}) {
  const nx = Math.max(1, Math.floor(Number(xCount)));
  const nz = Math.max(1, Math.floor(Number(zCount)));
  const parsedH = H == null ? NaN : Number(H);
  const parsedW = paperWidth == null ? NaN : Number(paperWidth);
  const totalH = Number.isFinite(parsedH) ? parsedH : nz;
  const totalW = Number.isFinite(parsedW) ? parsedW : nx;
  if (typeof sampler !== "function") throw Error("offsetSampledSurface(...) needs a sampler(x, z, ix, iz).");
  if (!Array.isArray(xDomain) || xDomain.length !== 2 || !xDomain.every(Number.isFinite)) {
    throw Error("offsetSampledSurface(...) needs xDomain = [min, max].");
  }
  if (!Array.isArray(zDomain) || zDomain.length !== 2 || !zDomain.every(Number.isFinite)) {
    throw Error("offsetSampledSurface(...) needs zDomain = [min, max].");
  }
  const dx = Number(xOffset);
  const dz = Number(zOffset);
  const widths = Array(nx).fill(clean(totalW / nx));
  const columns = [];
  for (let ix = 0; ix < nx; ix++) {
    const tx = (ix + dx) / nx;
    const wrappedX = tx - Math.floor(tx);
    const x = clean(xDomain[0] + wrappedX * (xDomain[1] - xDomain[0]));
    const samples = [];
    for (let iz = 0; iz < nz; iz++) {
      const tz = (iz + dz) / nz;
      const wrappedZ = tz - Math.floor(tz);
      const z = clean(zDomain[0] + wrappedZ * (zDomain[1] - zDomain[0]));
      samples.push(clean(Number(sampler(x, z, ix, iz)) * totalH));
    }
    columns.push(samples);
  }
  return stripsFromHeightfield(widths, columns, totalH, totalH / nz);
}

function interleavedSampledSurface({
  xCount = 11,
  zCount = 10,
  paperWidth = null,
  H = null,
  xDomain = [-1, 1],
  zDomain = [-1, 1],
  sampler
} = {}) {
  const nx = Math.max(1, Math.floor(Number(xCount)));
  const nz = Math.max(1, Math.floor(Number(zCount)));
  const parsedH = H == null ? NaN : Number(H);
  const parsedW = paperWidth == null ? NaN : Number(paperWidth);
  const totalH = Number.isFinite(parsedH) ? parsedH : nz;
  const totalW = Number.isFinite(parsedW) ? parsedW : nx;
  if (typeof sampler !== "function") throw Error("interleavedSampledSurface(...) needs a sampler(x, z, ix, iz).");
  if (!Array.isArray(xDomain) || xDomain.length !== 2 || !xDomain.every(Number.isFinite)) {
    throw Error("interleavedSampledSurface(...) needs xDomain = [min, max].");
  }
  if (!Array.isArray(zDomain) || zDomain.length !== 2 || !zDomain.every(Number.isFinite)) {
    throw Error("interleavedSampledSurface(...) needs zDomain = [min, max].");
  }

  const fineNx = Math.max(1, 2 * nx - 1);
  const fineNz = Math.max(1, 2 * nz - 1);
  const widths = Array(fineNx).fill(clean(totalW / fineNx));
  const columns = Array.from({ length: fineNx }, () => Array(fineNz).fill(0));

  for (let ix = 0; ix < nx; ix++) {
    const tx = (ix + 0.5) / nx;
    const x = clean(xDomain[0] + tx * (xDomain[1] - xDomain[0]));
    for (let iz = 0; iz < nz; iz++) {
      const tz = (iz + 0.5) / nz;
      const z = clean(zDomain[0] + tz * (zDomain[1] - zDomain[0]));
      columns[2 * ix][2 * iz] = clean(Number(sampler(x, z, ix, iz)) * totalH);
    }
  }

  for (let ix = 0; ix < nx - 1; ix++) {
    const tx = (ix + 1) / nx;
    const x = clean(xDomain[0] + tx * (xDomain[1] - xDomain[0]));
    for (let iz = 0; iz < nz - 1; iz++) {
      const tz = (iz + 1) / nz;
      const z = clean(zDomain[0] + tz * (zDomain[1] - zDomain[0]));
      columns[2 * ix + 1][2 * iz + 1] = clean(Math.max(
        columns[2 * ix + 1][2 * iz + 1],
        Number(sampler(x, z, ix, iz)) * totalH
      ));
    }
  }

  return stripsFromHeightfield(widths, columns, totalH, totalH / fineNz);
}

function subdividedSphere(options = {}) {
  const radius = Number.isFinite(Number(options.radius)) ? Number(options.radius) : 1;
  return subdividedSurface({
    ...options,
    xDomain: options.xDomain || [-1, 1],
    zDomain: options.zDomain || [0, 1],
    sampler: (x, z) => {
      const rr = radius * radius;
      const dz = 1 - z;
      const d2 = x * x + dz * dz;
      return d2 >= rr ? 0 : Math.sqrt(rr - d2) / radius;
    }
  });
}

function subdividedCone(options = {}) {
  const radius = Number.isFinite(Number(options.radius)) ? Number(options.radius) : 1;
  return subdividedSurface({
    ...options,
    xDomain: options.xDomain || [-1, 1],
    zDomain: options.zDomain || [0, 1],
    sampler: (x, z) => {
      const dz = 1 - z;
      const r = Math.sqrt(x * x + dz * dz);
      return Math.max(0, 1 - r / radius);
    }
  });
}

function subdividedRidge(options = {}) {
  const center = Number.isFinite(Number(options.center)) ? Number(options.center) : 0;
  const halfWidth = Number.isFinite(Number(options.halfWidth)) ? Number(options.halfWidth) : 1.15;
  const sharpness = Number.isFinite(Number(options.sharpness)) ? Number(options.sharpness) : 1.2;
  return subdividedSurface({
    ...options,
    xDomain: options.xDomain || [-1, 1],
    zDomain: options.zDomain || [0, 1],
    sampler: (x, z) => {
      const band = Math.max(0, 1 - Math.abs((x - center) / halfWidth));
      return z * Math.pow(band, sharpness);
    }
  });
}

function interleavedSampledSphere(options = {}) {
  const radius = Number.isFinite(Number(options.radius)) ? Number(options.radius) : 1;
  return interleavedSampledSurface({
    ...options,
    xDomain: options.xDomain || [-1, 1],
    zDomain: options.zDomain || [0, 1],
    sampler: (x, z) => {
      const rr = radius * radius;
      const dz = 1 - z;
      const d2 = x * x + dz * dz;
      return d2 >= rr ? 0 : Math.sqrt(rr - d2) / radius;
    }
  });
}

function interleavedSampledCone(options = {}) {
  const radius = Number.isFinite(Number(options.radius)) ? Number(options.radius) : 1;
  return interleavedSampledSurface({
    ...options,
    xDomain: options.xDomain || [-1, 1],
    zDomain: options.zDomain || [0, 1],
    sampler: (x, z) => {
      const dz = 1 - z;
      const r = Math.sqrt(x * x + dz * dz);
      return Math.max(0, 1 - r / radius);
    }
  });
}

function interleavedSampledRidge(options = {}) {
  const center = Number.isFinite(Number(options.center)) ? Number(options.center) : 0;
  const halfWidth = Number.isFinite(Number(options.halfWidth)) ? Number(options.halfWidth) : 1.15;
  const sharpness = Number.isFinite(Number(options.sharpness)) ? Number(options.sharpness) : 1.2;
  return interleavedSampledSurface({
    ...options,
    xDomain: options.xDomain || [-1, 1],
    zDomain: options.zDomain || [0, 1],
    sampler: (x, z) => {
      const band = Math.max(0, 1 - Math.abs((x - center) / halfWidth));
      return z * Math.pow(band, sharpness);
    }
  });
}

function progressiveSubdividedSphere(options = {}) {
  const radius = Number.isFinite(Number(options.radius)) ? Number(options.radius) : 1;
  return progressiveSubdividedSurface({
    ...options,
    xDomain: options.xDomain || [-1, 1],
    zDomain: options.zDomain || [0, 1],
    sampler: (x, z) => {
      const rr = radius * radius;
      const dz = 1 - z;
      const d2 = x * x + dz * dz;
      return d2 >= rr ? 0 : Math.sqrt(rr - d2) / radius;
    }
  });
}

function progressiveSubdividedCone(options = {}) {
  const radius = Number.isFinite(Number(options.radius)) ? Number(options.radius) : 1;
  return progressiveSubdividedSurface({
    ...options,
    xDomain: options.xDomain || [-1, 1],
    zDomain: options.zDomain || [0, 1],
    sampler: (x, z) => {
      const dz = 1 - z;
      const r = Math.sqrt(x * x + dz * dz);
      return Math.max(0, 1 - r / radius);
    }
  });
}

function progressiveSubdividedRidge(options = {}) {
  const center = Number.isFinite(Number(options.center)) ? Number(options.center) : 0;
  const halfWidth = Number.isFinite(Number(options.halfWidth)) ? Number(options.halfWidth) : 1.15;
  const sharpness = Number.isFinite(Number(options.sharpness)) ? Number(options.sharpness) : 1.2;
  return progressiveSubdividedSurface({
    ...options,
    xDomain: options.xDomain || [-1, 1],
    zDomain: options.zDomain || [0, 1],
    sampler: (x, z) => {
      const band = Math.max(0, 1 - Math.abs((x - center) / halfWidth));
      return z * Math.pow(band, sharpness);
    }
  });
}

function buildEvalContext() {
  const ctx = {
    max, min, add, sub, intersection, union, blend, clamp, mirror, pad, repeat, concat, offset,
    foldedDesign, plateauDesign, recursiveCornerCubes,
    stripsFromHeightfield, subdivisionGrid, sampledSurface, offsetSampledSurface, interleavedSampledSurface,
    subdividedSurface, progressiveSubdividedSurface,
    sampledSphere, sampledCone,
    sampledRidge,
    interleavedSampledSphere, interleavedSampledCone,
    interleavedSampledRidge,
    subdividedSphere, subdividedCone,
    subdividedRidge,
    progressiveSubdividedSphere, progressiveSubdividedCone,
    progressiveSubdividedRidge,
    clone
  };
  for (let i = 0; i < vars.length; i++) ctx[`v${i + 1}`] = vars[i].value;
  for (const v of vars) ctx[v.name] = v.value;
  return ctx;
}

window.POPUP_TEST_API = {
  examples,
  max,
  min,
  add,
  sub,
  intersection,
  union,
  blend,
  clamp,
  mirror,
  pad,
  repeat,
  concat,
  offset,
  recursiveCornerCubes,
  sampledSphere,
  subdividedSphere,
  progressiveSubdividedSphere,
  interleavedSampledSphere,
  sampledCone,
  sampledRidge,
  normalizeSugaredDesign,
  validate,
  pretty,
  clone,
  hsum,
  sum,
  quatNormalize,
  quatMultiply,
  quatFromAxisAngle,
  quatRotateVec,
  quatNlerp,
  quatAngleBetween,
  easeOutQuint
};

function evaluateSource(source) {
  const trimmed = String(source).trim();
  if (!trimmed) throw Error("Expression is empty.");

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const obj = normalizeSugaredDesign(JSON.parse(trimmed));
      const err = validate(obj);
      if (!err) return obj;
    } catch (_) {
      // fall through to JS evaluation
    }
  }

  const ctx = buildEvalContext();
  const names = Object.keys(ctx);
  const values = Object.values(ctx);
  const body = /\breturn\b/.test(trimmed) || /[\n;]/.test(trimmed)
    ? `"use strict";\n${trimmed}`
    : `"use strict";\nreturn (${trimmed});`;
  const result = normalizeSugaredDesign(Function(...names, body)(...values));
  const err = validate(result);
  if (err) throw Error(err);
  return result;
}

function makeVar(name, description, source) {
  try {
    return { kind: "design", name, description, source, value: evaluateSource(source) };
  } catch (err) {
    throw Error(`${name}: ${err.message}`);
  }
}

function modelPayload() {
  return {
    variables: vars.map(v => ({
      kind: v.kind || "design",
      name: v.name,
      description: v.description,
      source: v.source,
      control: v.control
    }))
  };
}

function serializeModel(prettyPrint = true) {
  return JSON.stringify(modelPayload(), null, prettyPrint ? 2 : 0);
}

function refreshUI() {
  const current = vars[selected];
  const kind = current.kind || "design";
  varKindEl.value = kind;
  varNameEl.value = current.name;
  varDescEl.value = current.description || "";
  dataEl.value = current.source || "";
  const showControl = kind === "control";
  controlFieldsEl.hidden = !showControl;
  dataEl.hidden = showControl;
  document.getElementById("designHelp").hidden = showControl;
  if (showControl) {
    const spec = sanitizeControl(current.control);
    current.control = spec;
    current.value = spec.value;
    controlValueEl.value = spec.value;
    controlMinEl.value = spec.min;
    controlMaxEl.value = spec.max;
    controlStepEl.value = spec.step;
    controlSliderEl.min = String(spec.min);
    controlSliderEl.max = String(spec.max);
    controlSliderEl.step = String(spec.step);
    controlSliderEl.value = String(spec.value);
  }

  varListEl.innerHTML = "";
  for (let i = 0; i < vars.length; i++) {
    const v = vars[i];
    const row = document.createElement("div");
    row.className = `varRow${i === selected ? " selected" : ""}${i === displayedDesign ? " displayed" : ""}`;
    const err = isDesignVar(v) ? validate(v.value) : "";
    const dims = isControlVar(v)
      ? `slider ${v.control.value} [${v.control.min}..${v.control.max}] step ${v.control.step}`
      : err ? "invalid" : `W=${paperParams(v.value).W.toFixed(2)} H=${paperParams(v.value).H.toFixed(2)}`;
    row.innerHTML = `<div class="rowMain">
      <div class="varName">${escapeHtml(v.name)}</div>
      <div class="varDesc">${escapeHtml(v.description || "no description")}</div>
      <div class="rowStats">${dims} · ${isControlVar(v) ? "control" : (v.source.trim().startsWith("{") ? "json" : "expression/js")}</div>
    </div>
    <div class="varMeta">${i === selected ? "selected" : i === displayedDesign ? "shown" : `v${i + 1}`}</div>`;
    row.addEventListener("click", () => {
      setSelected(i);
      refreshUI();
      renderAll();
    });
    varListEl.appendChild(row);
  }
}

function recomputeAllDesigns() {
  for (let i = 0; i < vars.length; i++) {
    if (isDesignVar(vars[i])) vars[i].value = evaluateSource(vars[i].source);
    else vars[i].value = sanitizeControl(vars[i].control).value;
  }
  const firstDesign = findFirstDesignIndex(displayedDesign);
  if (firstDesign === -1) throw Error("At least one design variable is required.");
  displayedDesign = firstDesign;
}

function applyEditor() {
  const newName = varNameEl.value.trim();
  const nameErr = validateVarName(newName);
  if (nameErr) {
    showStatus(nameErr, true);
    return;
  }
  try {
    const kind = varKindEl.value;
    if (kind === "control") {
      const control = sanitizeControl({
        value: Number(controlValueEl.value),
        min: Number(controlMinEl.value),
        max: Number(controlMaxEl.value),
        step: Number(controlStepEl.value)
      });
      vars[selected] = makeControlVar(newName, varDescEl.value.trim(), control);
    } else {
      vars[selected] = makeVar(newName, varDescEl.value.trim(), dataEl.value);
    }
    recomputeAllDesigns();
    if (isDesignVar(vars[selected])) displayedDesign = selected;
    refreshUI();
    renderAll();
  } catch (e) {
    showStatus(e.message, true);
  }
}

function addVarRecord() {
  vars.push(makeVar(nextVarName(), "new variable", pretty(examples.step)));
  setSelected(vars.length - 1);
  refreshUI();
  renderAll();
}

function removeVarRecord() {
  if (vars.length <= 1) {
    setOpStatus("Keep at least one variable in the list.", true);
    return;
  }
  if (isDesignVar(vars[selected]) && countDesignVars() <= 1) {
    setOpStatus("Keep at least one design variable in the list.", true);
    return;
  }
  vars.splice(selected, 1);
  selected = Math.min(selected, vars.length - 1);
  recomputeAllDesigns();
  if (isDesignVar(vars[selected])) displayedDesign = selected;
  else displayedDesign = findFirstDesignIndex(displayedDesign);
  refreshUI();
  renderAll();
}

async function writeClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  ta.remove();
}

async function readClipboard() {
  if (navigator.clipboard && navigator.clipboard.readText) {
    return navigator.clipboard.readText();
  }
  throw Error("Clipboard read is not available here. Paste manually into the model input.");
}

function sanitizeImportedVariables(items) {
  const out = [];
  const names = new Set();
  for (let i = 0; i < items.length; i++) {
    const raw = items[i];
    const baseName = raw.name && /^[A-Za-z_][A-Za-z0-9_]*$/.test(raw.name) ? raw.name : `v${i + 1}`;
    let name = baseName;
    let suffix = 2;
    while (names.has(name)) {
      name = `${baseName}_${suffix}`;
      suffix += 1;
    }
    names.add(name);
    if ((raw.kind || "design") === "control") {
      const control = raw.control || (typeof raw.value === "number" ? { value: raw.value } : defaultControlSpec());
      out.push(makeControlVar(name, raw.description || "", control));
    } else {
      const source = typeof raw.source === "string"
        ? raw.source
        : raw.value
          ? pretty(raw.value)
          : pretty(examples.step);
      out.push(makeVar(name, raw.description || "", source));
    }
  }
  return out;
}

function loadModelFromText(text) {
  try {
    const parsed = JSON.parse(text);
    let items;
    if (Array.isArray(parsed)) items = parsed;
    else if (parsed && Array.isArray(parsed.variables)) items = parsed.variables;
    else if (parsed && typeof parsed === "object") items = [parsed];
    else throw Error("Expected a variable object, an array of variables, or { variables:[...] }.");
    if (!items.length) throw Error("Model input is empty.");
    vars = sanitizeImportedVariables(items);
    selected = 0;
    recomputeAllDesigns();
    displayedDesign = findFirstDesignIndex(0);
    refreshUI();
    renderAll();
    setOpStatus(`Loaded ${vars.length} variable${vars.length === 1 ? "" : "s"} from clipboard.`);
  } catch (e) {
    setOpStatus(e.message, true);
  }
}

function initialVars() {
  const specs = [
    ["folded", "simplest folded page", pretty(examples.folded)],
    ["step", "single central step cuboid", pretty(examples.step)],
    ["terrace", "stepped terrace profile", pretty(examples.terrace)],
    ["saw", "asymmetric sawtooth profile", pretty(examples.saw)],
    ["saw2", "unit-cube diagonal lattice with growing interlocked teeth", pretty(examples.saw2)],
    ["saw_overlap", "saw mirrored back into itself using negative-width overlap sugar", `concat(saw, offset(mirror(saw), -2, 0))`],
    ["saw2_union", "max(saw2, mirror(saw2)) builds a symmetric interlocked hill", `max(saw2, mirror(saw2))`],
    ["saw2_intersection", "min(saw2, mirror(saw2)) keeps the symmetric shared core", `min(saw2, mirror(saw2))`],
    ["sphere_relief", "sphere surface sampled over an (X, Z) grid as a stepped relief", `sampledSphere({ xCount: 15, zCount: 10 })`],
    ["sphere_interleaved", "two equal sphere samplings merged, with the second offset into the centers of the first grid cells", `interleavedSampledSphere({ xCount: 15, zCount: 10 })`],
    ["sphere_subdivided", "sphere relief sampled by progressive dyadic subdivision down to a minimum spacing", `subdividedSphere({ paperWidth: 10, H: 10, minSpacing: 1 })`],
    ["sphere_progressive", "sphere relief built by merging coarse-to-fine dyadic samplings", `progressiveSubdividedSphere({ paperWidth: 10, H: 10, minSpacing: 1 })`],
    ["cone_relief", "cone surface sampled over an (X, Z) grid as a stepped relief", `sampledCone({ xCount: 15, zCount: 10 })`],
    ["cone_interleaved", "two equal cone samplings merged, with the second offset into the centers of the first grid cells", `interleavedSampledCone({ xCount: 15, zCount: 10 })`],
    ["cone_subdivided", "cone relief sampled by dyadic subdivision down to a minimum spacing", `subdividedCone({ paperWidth: 10, H: 10, minSpacing: 1 })`],
    ["cone_progressive", "cone relief built by merging coarse-to-fine dyadic samplings", `progressiveSubdividedCone({ paperWidth: 10, H: 10, minSpacing: 1 })`],
    ["ridge_relief", "off-center ridge rising toward the back wall on a regular grid", `sampledRidge({ xCount: 15, zCount: 10 })`],
    ["ridge_interleaved", "off-center ridge with two interleaved equal-resolution samplings", `interleavedSampledRidge({ xCount: 15, zCount: 10 })`],
    ["ridge_subdivided", "off-center ridge sampled by dyadic subdivision down to a minimum spacing", `subdividedRidge({ paperWidth: 10, H: 10, minSpacing: 1 })`],
    ["ridge_progressive", "off-center ridge built by merging coarse-to-fine dyadic samplings", `progressiveSubdividedRidge({ paperWidth: 10, H: 10, minSpacing: 1 })`],
    ["gate", "portal-like inner opening", pretty(examples.gate)],
    ["twin", "tall paired slabs", pretty(examples.twin)],
    ["nested", "nested inward-outward steps", pretty(examples.nested)],
    ["skyline", "broad skyline silhouette", pretty(examples.skyline)],
    ["buttress", "wide buttressed massing", pretty(examples.buttress)],
    ["richA", "dense alternating profile for operator tests", pretty(examples.richA)],
    ["richB", "paired companion profile for operator tests", pretty(examples.richB)],
    ["mirrored_step", "mirror() reverses the strip ordering", `mirror(step)`],
    ["padded_gate", "pad() adds extra edge clearance while preserving widths", `pad(gate, 0.2, 0.35)`],
    ["js_variant_gate", "inline helper function that derives a new design from an existing one", `return (() => {
  const out = clone(gate);
  out.strips[2] = [0.5, 1.1, 1.0, 0.25, 0.5, 0.65];
  return out;
})();`],
    { kind: "control", name: "mix_t", description: "slider driving blended examples", control: { value: 0.4, min: 0, max: 1, step: 0.05 } },
    ["control_blend", "design driven by the mix_t slider control", `blend(gate, js_variant_gate, mix_t)`],
    ["step_triptych", "repeat() tiles a motif across the page width", `repeat(step, 3)`],
    ["recursive_cubes", "recursive corner-cube tower on a 2x2 folded page", `recursiveCornerCubes({ levels: 5 })`],
    ["js_colonnade", "generated entirely from inline JavaScript", `return (() => {
  const widths = [0.7, 0.8, 0.9, 0.8, 0.7];
  const strips = widths.map((_, i) => {
    if (i === 0 || i === widths.length - 1) return [2, 2];
    const a = 1.5 - 0.25 * i;
    const b = 2 - a;
    return [a, b, b, a];
  });
  return { widths, strips };
})();`],
    ["js_progressive_steps", "symmetric progressive interior strips generated from inline JavaScript", `var N = 10;
var widths = Array(N + 1).fill(1);
var strips = [[N, N]];
for (var i = 1; i < N; i++) {
  strips.push([i, i, N - i, N - i]);
}
strips.push([N, N]);
return { widths, strips };`],
    ["js_doublewide_steps", "each conceptual progressive strip is doubled in width, then expanded into real unit-width strips", `var N = 10;
var widthScale = 2;
var conceptualWidths = Array(N + 1).fill(widthScale);
var conceptualStrips = [[N, N]];
for (var i = 1; i < N; i++) {
  conceptualStrips.push([i, i, N - i, N - i]);
}
conceptualStrips.push([N, N]);

var widths = [];
var strips = [];
for (var s = 0; s < conceptualWidths.length; s++) {
  for (var k = 0; k < conceptualWidths[s]; k++) {
    widths.push(1);
    strips.push(conceptualStrips[s].slice());
  }
}
return { widths, strips };`],
    ["js_squashed_steps", "overlapping widened steps, compressed so neighboring steps intersect", `var N = 10;
function profile(i) {
  if (i <= 0 || i >= N) return [N, N];
  return [i, i, N - i, N - i];
}
function oneStrip(i) {
  return { widths: [1], strips: [profile(i)] };
}

var widths = Array(N).fill(1);
var strips = [];
for (var k = 0; k < N; k++) {
  var i = k + 1;
  var a = oneStrip(i);
  var b = oneStrip(Math.max(0, i - 1));
  strips.push(max(a, b).strips[0]);
}
return {
  widths: [1].concat(widths, [1]),
  strips: [[N, N]].concat(strips, [[N, N]])
};`],
    ["js_combo", "multiline JavaScript using intermediate values", `const variant = (() => {
  const out = clone(gate);
  out.strips[2] = [0.5, 1.1, 1.0, 0.25, 0.5, 0.65];
  return out;
})();
const upper = max(gate, variant);
const lower = min(gate, variant);
return sub(upper, lower);`],
    ["js_blend_clamp", "inline JavaScript using blend() and clamp()", `const variant = pad(mirror(gate), 0.2, 0.35);
const lo = min(padded_gate, variant);
const hi = max(padded_gate, variant);
return clamp(blend(lo, hi, 0.4), lo, hi);`]
  ];

  const seeded = [];
  const priorVars = vars;
  vars = seeded;
  try {
    for (const spec of specs) {
      const v = Array.isArray(spec)
        ? makeVar(spec[0], spec[1], spec[2])
        : makeControlVar(spec.name, spec.description, spec.control);
      seeded.push(v);
    }
  } finally {
    vars = priorVars;
  }
  return seeded;
}

vars = initialVars();
displayedDesign = findFirstDesignIndex(0);

function renderAll() {
  const err = validate(currentDesign());
  if (err) {
    showStatus(err, true);
    return;
  }
  const { W, H } = paperParams();
  showStatus(`Showing ${vars[displayedDesign].name}. OK. W=${W.toFixed(3)}, H=${H.toFixed(3)}. Start edge y=-H maps to z=H.`);
  drawPattern();
  draw3D();
}

function drawPattern() {
  const d = currentDesign();
  const { W, H, twoH } = paperParams(d);
  const r = pattern.getBoundingClientRect();
  const width = r.width, height = r.height;
  pattern.setAttribute("viewBox", `0 0 ${width} ${height}`);
  pattern.innerHTML = "";
  const margin = 42;
  const s = Math.min((width - 2 * margin) / W, (height - 2 * margin) / twoH);
  const ox = (width - W * s) / 2, oy = height / 2;

  function el(n) { return document.createElementNS("http://www.w3.org/2000/svg", n); }
  function line(x1, y1, x2, y2, stroke, dash = "", lw = 1.4) {
    const e = el("line");
    e.setAttribute("x1", x1);
    e.setAttribute("y1", y1);
    e.setAttribute("x2", x2);
    e.setAttribute("y2", y2);
    e.setAttribute("stroke", stroke);
    e.setAttribute("stroke-width", lw);
    e.setAttribute("stroke-linecap", "round");
    if (dash) e.setAttribute("stroke-dasharray", dash);
    pattern.appendChild(e);
  }
  function rect(x, y, w, h, fill, stroke = "#ddd", lw = 1, rx = 0) {
    const e = el("rect");
    e.setAttribute("x", x);
    e.setAttribute("y", y);
    e.setAttribute("width", w);
    e.setAttribute("height", h);
    if (rx) {
      e.setAttribute("rx", rx);
      e.setAttribute("ry", rx);
    }
    e.setAttribute("fill", fill);
    e.setAttribute("stroke", stroke);
    e.setAttribute("stroke-width", lw);
    pattern.appendChild(e);
  }
  function text(x, y, t) {
    const e = el("text");
    e.setAttribute("x", x);
    e.setAttribute("y", y);
    e.setAttribute("font-size", "11");
    e.setAttribute("fill", "#555");
    e.textContent = t;
    pattern.appendChild(e);
  }

  const top = oy - H * s, bottom = oy + H * s;
  rect(ox, top, W * s, twoH * s, "rgba(255,255,252,.97)", "#8d8578", 1.6, 1.5);

  function cumulativeTs(strip) {
    const out = [0];
    let t = 0;
    for (const len of strip) {
      t += len;
      out.push(clean(t));
    }
    return out;
  }
  function screenYFromT(t) {
    return oy - (-H + t) * s;
  }
  function stripStateAt(strip, t) {
    let acc = 0, y = 0, z = H;
    for (let j = 0; j < strip.length; j++) {
      const len = strip[j];
      const next = acc + len;
      const local = Math.min(t, next) - acc;
      if (j % 2 === 0) {
        if (t < next - 1e-9) return { y, z: clean(z - local), axis: "z", seg: j };
        z = clean(z - len);
      } else {
        if (t < next - 1e-9) return { y: clean(y + local), z, axis: "y", seg: j };
        y = clean(y + len);
      }
      acc = next;
    }
    return { y, z, axis: "end", seg: strip.length };
  }

  const xs = stripXPositions(d);
  for (let i = 0; i < d.strips.length; i++) {
    const x0 = ox + xs[i] * s;
    const x1 = ox + xs[i + 1] * s;
    const ts = cumulativeTs(d.strips[i]);
    for (let j = 1; j < ts.length - 1; j++) {
      const t = ts[j];
      const valley = Math.abs(t - H) < 1e-9 || (j - 1) % 2 === 0;
      line(x0, screenYFromT(t), x1, screenYFromT(t), valley ? "#2874a6" : "#b04a2d", valley ? "7 5" : "2 5", 1.5);
    }
  }

  for (let i = 1; i < xs.length - 1; i++) {
    const x = ox + xs[i] * s;
    const left = d.strips[i - 1];
    const right = d.strips[i];
    const ts = [...new Set([...cumulativeTs(left), ...cumulativeTs(right), clean(H)])].sort((a, b) => a - b);
    for (let j = 0; j < ts.length - 1; j++) {
      const t0 = ts[j], t1 = ts[j + 1];
      if (t1 <= t0 + 1e-9) continue;
      const eps = Math.min(1e-5, (t1 - t0) * 0.25);
      const a0 = stripStateAt(left, t0 + eps);
      const a1 = stripStateAt(left, t1 - eps);
      const b0 = stripStateAt(right, t0 + eps);
      const b1 = stripStateAt(right, t1 - eps);
      const continuous =
        nearlyEqual(a0.y, b0.y) &&
        nearlyEqual(a0.z, b0.z) &&
        nearlyEqual(a1.y, b1.y) &&
        nearlyEqual(a1.z, b1.z) &&
        a0.axis === b0.axis &&
        a1.axis === b1.axis;
      if (!continuous) {
        line(x, screenYFromT(t0), x, screenYFromT(t1), "#111", "", 2.05);
      }
    }
  }

  line(ox, top, ox, bottom, "#444", "", 2.1);
  line(ox + W * s, top, ox + W * s, bottom, "#444", "", 2.1);
  line(ox, top, ox + W * s, top, "#444", "", 2.1);
  line(ox, bottom, ox + W * s, bottom, "#444", "", 2.1);
}

function stripXPositions(d = currentDesign()) {
  const xs = [0];
  for (const w of d.widths) xs.push(xs[xs.length - 1] + w);
  return xs;
}

function buildQuads() {
  const d = currentDesign();
  const { H } = paperParams(d);
  const xs = stripXPositions(d);
  const quads = [];
  for (let i = 0; i < d.strips.length; i++) {
    const x0 = xs[i], x1 = xs[i + 1];
    let y = 0, z = H;
    for (let j = 0; j < d.strips[i].length; j++) {
      const L = d.strips[i][j];
      if (j % 2 === 0) {
        const z2 = z - L;
        if (L > 1e-9) quads.push({ pts: [[x0, y, z], [x1, y, z], [x1, y, z2], [x0, y, z2]], kind: "strip" });
        z = z2;
      } else {
        const y2 = y + L;
        if (L > 1e-9) quads.push({ pts: [[x0, y, z], [x1, y, z], [x1, y2, z], [x0, y2, z]], kind: "strip" });
        y = y2;
      }
    }
  }
  return quads;
}

function rotatePoint(p, quat = cam.quat) {
  let [x, y, z] = p;
  const { W, H } = paperParams();
  x -= W / 2;
  y -= H / 2;
  z -= H / 2;
  return quatRotateVec(quat, [x, y, z]);
}

function projectPoint(q, rect) {
  const persp = 750 / (750 + q[2] * cam.zoom * 0.035);
  return [rect.width / 2 + cam.panX + q[0] * cam.zoom * persp, rect.height / 2 + cam.panY - q[1] * cam.zoom * persp, q[2]];
}

function project(p) {
  const rect = canvas.getBoundingClientRect();
  return projectPoint(rotatePoint(p, cam.quat), rect);
}

function vecSub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function vecCross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function vecDot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function vecNorm(a) { const m = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / m, a[1] / m, a[2] / m]; }

function triangleFill(rotPts) {
  const n = vecNorm(vecCross(vecSub(rotPts[1], rotPts[0]), vecSub(rotPts[2], rotPts[0])));
  const light = vecNorm([-0.45, 0.88, 0.3]);
  if (viewTheme === "dark") {
    const intensity = 0.78 + 0.12 * Math.abs(vecDot(n, light)) + 0.04 * Math.abs(n[1]);
    const tone = Math.max(205, Math.min(238, Math.round(255 * intensity)));
    return `rgb(${tone},${tone},${Math.max(198, tone - 6)})`;
  }
  const intensity = 0.9 + 0.08 * Math.abs(vecDot(n, light)) + 0.03 * Math.abs(n[1]);
  const tone = Math.max(232, Math.min(248, Math.round(255 * intensity)));
  return `rgb(${tone},${tone},${Math.max(220, tone - 2)})`;
}

function quadLighting(rotPts) {
  const n = vecNorm(vecCross(vecSub(rotPts[1], rotPts[0]), vecSub(rotPts[2], rotPts[0])));
  const light = vecNorm([-0.45, 0.88, 0.3]);
  const facing = Math.abs(vecDot(n, light));
  const bias = Math.max(-0.65, Math.min(0.65, n[0] * 0.65 - n[1] * 0.35 + n[2] * 0.25));
  return { facing, bias };
}

function toneColor(tone) {
  return `rgb(${tone},${tone},${Math.max(198, tone - 4)})`;
}

function quadFill(projected, rotPts) {
  const lighting = quadLighting(rotPts);
  const darkTheme = viewTheme === "dark";
  const base = darkTheme ? 214 : 238;
  const span = darkTheme ? 20 : 12;
  const toneA = Math.max(darkTheme ? 196 : 226, Math.min(248, Math.round(base + span * (lighting.facing + lighting.bias * 0.6))));
  const toneB = Math.max(darkTheme ? 192 : 223, Math.min(246, Math.round(base + span * (lighting.facing - lighting.bias * 0.6))));
  const x0 = (projected[0][0] + projected[3][0]) / 2;
  const y0 = (projected[0][1] + projected[3][1]) / 2;
  const x1 = (projected[1][0] + projected[2][0]) / 2;
  const y1 = (projected[1][1] + projected[2][1]) / 2;
  const grad = ctx.createLinearGradient(x0, y0, x1, y1);
  grad.addColorStop(0, toneColor(toneA));
  grad.addColorStop(1, toneColor(toneB));
  return grad;
}

function drawProjectedQuad(projected, fill) {
  ctx.beginPath();
  ctx.moveTo(projected[0][0], projected[0][1]);
  for (let i = 1; i < projected.length; i++) ctx.lineTo(projected[i][0], projected[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawProjectedPolyline(points, stroke = "rgba(80,80,80,.82)", lw = 1) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  ctx.stroke();
}

function drawLine3(a, b, stroke = "#333", lw = 1.4, dash = []) {
  const pa = project(a), pb = project(b);
  ctx.save();
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(pa[0], pa[1]);
  ctx.lineTo(pb[0], pb[1]);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  ctx.stroke();
  ctx.restore();
}

function mat4Identity() {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]);
}

function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] =
        a[0 * 4 + row] * b[col * 4 + 0] +
        a[1 * 4 + row] * b[col * 4 + 1] +
        a[2 * 4 + row] * b[col * 4 + 2] +
        a[3 * 4 + row] * b[col * 4 + 3];
    }
  }
  return out;
}

function mat4Translate(tx, ty, tz) {
  const m = mat4Identity();
  m[12] = tx;
  m[13] = ty;
  m[14] = tz;
  return m;
}

function mat4Scale(sx, sy, sz) {
  const m = mat4Identity();
  m[0] = sx;
  m[5] = sy;
  m[10] = sz;
  return m;
}

function mat4RotateX(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([
    1, 0, 0, 0,
    0, c, s, 0,
    0, -s, c, 0,
    0, 0, 0, 1
  ]);
}

function mat4RotateY(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([
    c, 0, -s, 0,
    0, 1, 0, 0,
    s, 0, c, 0,
    0, 0, 0, 1
  ]);
}

function mat4RotateZ(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([
    c, s, 0, 0,
    -s, c, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]);
}

function mat4FromQuat(q) {
  const [x, y, z, w] = quatNormalize(q);
  const xx = x * x, yy = y * y, zz = z * z;
  const xy = x * y, xz = x * z, yz = y * z;
  const wx = w * x, wy = w * y, wz = w * z;
  return new Float32Array([
    1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy), 0,
    2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx), 0,
    2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy), 0,
    0, 0, 0, 1
  ]);
}

function mat4Perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0
  ]);
}

function mat3FromMat4Rotation(m) {
  return new Float32Array([
    m[0], m[1], m[2],
    m[4], m[5], m[6],
    m[8], m[9], m[10]
  ]);
}

function mat3FromQuat(q) {
  return mat3FromMat4Rotation(mat4FromQuat(q));
}

function glCompileShader(glCtx, type, source) {
  const shader = glCtx.createShader(type);
  glCtx.shaderSource(shader, source);
  glCtx.compileShader(shader);
  if (!glCtx.getShaderParameter(shader, glCtx.COMPILE_STATUS)) {
    const err = glCtx.getShaderInfoLog(shader);
    glCtx.deleteShader(shader);
    throw Error(err || "Shader compilation failed.");
  }
  return shader;
}

function ensureWebGLState() {
  if (!gl) return null;
  if (webglState) return webglState;
  const vs = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    uniform mat4 uMatrix;
    uniform mat3 uNormalMatrix;
    varying vec3 vNormal;
    varying vec3 vPosition;
    void main() {
      vNormal = normalize(uNormalMatrix * aNormal);
      vPosition = aPosition;
      gl_Position = uMatrix * vec4(aPosition, 1.0);
    }
  `;
  const fs = `
    precision mediump float;
    varying vec3 vNormal;
    varying vec3 vPosition;
    uniform vec3 uLight;
    uniform vec3 uBaseA;
    uniform vec3 uBaseB;
    uniform vec3 uAmbient;
    void main() {
      vec3 n = normalize(vNormal);
      float diffuse = abs(dot(n, normalize(uLight)));
      float sweep = clamp(0.5 + 0.35 * dot(normalize(vec3(1.0, -0.4, 0.6)), normalize(vPosition + vec3(0.001, 0.001, 0.001))), 0.0, 1.0);
      vec3 base = mix(uBaseA, uBaseB, sweep);
      vec3 color = base * (uAmbient + diffuse * 0.72);
      gl_FragColor = vec4(color, 1.0);
    }
  `;
  const program = gl.createProgram();
  const vert = glCompileShader(gl, gl.VERTEX_SHADER, vs);
  const frag = glCompileShader(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program) || "Program link failed.");
  webglState = {
    program,
    attribs: {
      position: gl.getAttribLocation(program, "aPosition"),
      normal: gl.getAttribLocation(program, "aNormal")
    },
    uniforms: {
      matrix: gl.getUniformLocation(program, "uMatrix"),
      normalMatrix: gl.getUniformLocation(program, "uNormalMatrix"),
      light: gl.getUniformLocation(program, "uLight"),
      baseA: gl.getUniformLocation(program, "uBaseA"),
      baseB: gl.getUniformLocation(program, "uBaseB"),
      ambient: gl.getUniformLocation(program, "uAmbient")
    },
    positionBuffer: gl.createBuffer(),
    normalBuffer: gl.createBuffer()
  };
  return webglState;
}

function buildWebGLMesh() {
  const d = currentDesign();
  const { W, H } = paperParams(d);
  const center = [W / 2, H / 3, H / 3];
  const positions = [];
  const normals = [];
  for (const quad of buildQuads()) {
    const pts = quad.pts.map(([x, y, z]) => [x - center[0], y - center[1], z - center[2]]);
    const n = vecNorm(vecCross(vecSub(pts[1], pts[0]), vecSub(pts[2], pts[0])));
    const order = [0, 1, 2, 0, 2, 3];
    for (const idx of order) {
      positions.push(pts[idx][0], pts[idx][1], pts[idx][2]);
      normals.push(n[0], n[1], n[2]);
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    count: positions.length / 3
  };
}

function drawWebGL3D() {
  const state = ensureWebGLState();
  if (!state) return false;
  const rect = glCanvas.getBoundingClientRect();
  const aspect = Math.max(0.1, rect.width / Math.max(1, rect.height));
  const { W, H } = paperParams();
  const extent = Math.max(W, H * 2, 1);
  const scale = (cam.zoom / 122) * (2.45 / extent);
  const model = mat4Multiply(mat4FromQuat(cam.quat), mat4Scale(scale, scale, scale));
  const view = mat4Translate(cam.panX / 125, -cam.panY / 125, -4.8);
  const proj = mat4Perspective(Math.PI / 4.2, aspect, 0.1, 100);
  const matrix = mat4Multiply(proj, mat4Multiply(view, model));
  const normalMatrix = mat3FromQuat(cam.quat);
  const mesh = buildWebGLMesh();

  gl.viewport(0, 0, glCanvas.width, glCanvas.height);
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.clearColor(0.05, 0.08, 0.11, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(state.program);

  gl.bindBuffer(gl.ARRAY_BUFFER, state.positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(state.attribs.position);
  gl.vertexAttribPointer(state.attribs.position, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, state.normalBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(state.attribs.normal);
  gl.vertexAttribPointer(state.attribs.normal, 3, gl.FLOAT, false, 0, 0);

  gl.uniformMatrix4fv(state.uniforms.matrix, false, matrix);
  gl.uniformMatrix3fv(state.uniforms.normalMatrix, false, normalMatrix);
  gl.uniform3f(state.uniforms.light, -0.35, 0.92, 0.42);
  gl.uniform3f(state.uniforms.baseA, 0.90, 0.91, 0.90);
  gl.uniform3f(state.uniforms.baseB, 0.98, 0.98, 0.97);
  gl.uniform3f(state.uniforms.ambient, 0.38, 0.39, 0.41);
  gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
  return true;
}

function draw3D() {
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  if (!drawWebGL3D()) {
    ctx.fillStyle = "rgba(239,244,249,.88)";
    ctx.font = "14px -apple-system,BlinkMacSystemFont,sans-serif";
    ctx.fillText("WebGL is unavailable here.", 14, 28);
  }

  drawRotationHalo();
  drawViewCube();
}

function angleWrap(a) {
  while (a <= -Math.PI) a += 2 * Math.PI;
  while (a > Math.PI) a -= 2 * Math.PI;
  return a;
}

function screenMetrics() {
  const quads = buildQuads();
  const rect = canvas.getBoundingClientRect();
  const { W, H } = paperParams();
  const [cx, cy] = projectPoint(rotatePoint([W / 2, H / 2, H / 2]), rect);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const q of quads) {
    for (const p of q.pts) {
      const [sx, sy] = project(p);
      minX = Math.min(minX, sx);
      minY = Math.min(minY, sy);
      maxX = Math.max(maxX, sx);
      maxY = Math.max(maxY, sy);
    }
  }
  let radius = 1;
  for (const q of quads) {
    for (const p of q.pts) {
      const [sx, sy] = project(p);
      radius = Math.max(radius, Math.hypot(sx - cx, sy - cy));
    }
  }
  const viewRadius = Math.max(40, Math.min(rect.width, rect.height) * 0.46);
  const objectRadius = radius;
  const rollStart = Math.min(objectRadius * 1.35, viewRadius - 16);
  return {
    cx,
    cy,
    rx: radius,
    ry: radius,
    rollStart: Math.max(24, rollStart),
    outer: viewRadius
  };
}

function drawRotationHalo() {
  if (!hover3D.active || pointers.size > 0) return;
  const m = screenMetrics();
  const dist = Math.hypot(hover3D.x - m.cx, hover3D.y - m.cy);
  const inOrbitBand = dist >= m.rollStart;
  const outerRadius = m.outer;
  const rollRadius = m.rollStart;
  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = inOrbitBand ? "rgba(40,116,166,.75)" : "rgba(23,32,42,.18)";
  ctx.beginPath();
  ctx.arc(m.cx, m.cy, rollRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([3, 7]);
  ctx.strokeStyle = inOrbitBand ? "rgba(192,57,43,.55)" : "rgba(23,32,42,.10)";
  ctx.beginPath();
  ctx.arc(m.cx, m.cy, Math.max(10, rollRadius - 18), 0, Math.PI * 2);
  ctx.stroke();
  if (inOrbitBand) {
    const angle = Math.atan2(hover3D.y - m.cy, hover3D.x - m.cx);
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(40,116,166,.14)";
    ctx.beginPath();
    ctx.arc(m.cx, m.cy, outerRadius, angle - 0.22, angle + 0.22);
    ctx.arc(m.cx, m.cy, rollRadius, angle + 0.22, angle - 0.22, true);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(40,116,166,.85)";
    ctx.font = "12px -apple-system,BlinkMacSystemFont,sans-serif";
    ctx.fillText("roll", m.cx + 12, m.cy - rollRadius - 8);
  }
  ctx.restore();
}

function cubeRotatePoint(p, quat = cam.quat) {
  return quatRotateVec(quat, p);
}

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function polygonArea(poly) {
  let area = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    area += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  }
  return area / 2;
}

function cubeTargetContains(target, x, y) {
  if (Number.isFinite(target.r)) return Math.hypot(x - target.x, y - target.y) <= target.r;
  if (target.poly) return pointInPoly(x, y, target.poly);
  return false;
}

function cameraSettled(a, b = camTarget) {
  return quatAngleBetween(a.quat, b.quat) < 1e-4
    && Math.abs(a.zoom - b.zoom) < 0.05
    && Math.abs(a.panX - b.panX) < 0.05
    && Math.abs(a.panY - b.panY) < 0.05;
}

function syncCameraTarget() {
  camTarget = cameraPose(cam);
}

function stopCameraAnimation() {
  if (camAnimHandle) cancelAnimationFrame(camAnimHandle);
  camAnimHandle = 0;
  camAnimation = null;
}

function easeOutQuint(t) {
  return 1 - Math.pow(1 - t, 5);
}

function animateCameraStep(now) {
  if (!camAnimation) {
    camAnimHandle = 0;
    return;
  }
  if (camAnimation.startTime == null) camAnimation.startTime = now;
  const elapsed = Math.max(0, now - camAnimation.startTime);
  const progress = Math.min(1, elapsed / camAnimation.duration);
  const eased = easeOutQuint(progress);
  const start = camAnimation.start;
  const baseQuat = quatNlerp(start.quat, camTarget.quat, eased);
  if (camAnimation.spinTurns) {
    const spinAngle = Math.PI * 2 * camAnimation.spinTurns * (1 - eased);
    cam.quat = quatMultiply(quatFromAxisAngle(camAnimation.spinAxis || [0, 1, 0], spinAngle), baseQuat);
  } else {
    cam.quat = baseQuat;
  }
  cam.zoom = start.zoom + (camTarget.zoom - start.zoom) * eased;
  cam.panX = start.panX + (camTarget.panX - start.panX) * eased;
  cam.panY = start.panY + (camTarget.panY - start.panY) * eased;
  draw3D();
  if (progress >= 1 || cameraSettled(cam, camTarget)) {
    cam = cameraPose(camTarget);
    camAnimation = null;
    camAnimHandle = 0;
    draw3D();
    return;
  }
  camAnimHandle = requestAnimationFrame(animateCameraStep);
}

function ensureCameraAnimation() {
  camAnimation = {
    start: cameraPose(cam),
    startTime: null,
    duration: CAMERA_ANIMATION_MS
  };
  if (camAnimHandle) cancelAnimationFrame(camAnimHandle);
  camAnimHandle = requestAnimationFrame(animateCameraStep);
}

function setCameraView(view, options = {}) {
  const next = cameraPose({ ...camTarget, ...view });
  camTarget = next;
  stopInertia();
  noteCameraInteraction();
  if (options.immediate) {
    stopCameraAnimation();
    cam = cameraPose(next);
    draw3D();
    return;
  }
  ensureCameraAnimation();
}

function startPlotSelectionAnimation() {
  const target = cameraPose(defaultCam);
  stopCameraAnimation();
  stopInertia();
  cam = cameraPose({
    ...target,
    quat: target.quat,
    zoom: target.zoom * 0.42,
    panX: target.panX,
    panY: target.panY + 8
  });
  camTarget = target;
  noteCameraInteraction();
  draw3D();
  camAnimation = {
    start: cameraPose(cam),
    startTime: null,
    duration: INTRO_CAMERA_ANIMATION_MS,
    spinAxis: [0, 1, 0],
    spinTurns: INTRO_SPIN_TURNS
  };
  camAnimHandle = requestAnimationFrame(animateCameraStep);
}

function resetCameraView(options = {}) {
  setCameraView(defaultCam, options);
}

function noteCameraInteraction() {
  lastInteractionTime = performance.now();
  idleOrbitActive = false;
  idleOrbitStartedAt = 0;
}

function stopInertia() {
  if (inertiaHandle) cancelAnimationFrame(inertiaHandle);
  inertiaHandle = 0;
  angularVelocity = [0, 0, 0];
  inertiaLastTime = 0;
}

function applyAngularStep(velocity, dt) {
  const magnitude = Math.hypot(velocity[0], velocity[1], velocity[2]);
  if (magnitude < 1e-8 || dt <= 0) return;
  const q = quatFromAxisAngle(velocity, magnitude * dt);
  cam.quat = quatMultiply(q, cam.quat);
  syncCameraTarget();
}

function inertiaStep(now) {
  if (!inertiaLastTime) inertiaLastTime = now;
  const dt = Math.min(40, Math.max(0, now - inertiaLastTime));
  inertiaLastTime = now;
  applyAngularStep(angularVelocity, dt);
  const decay = Math.exp(-dt / FLICK_DECAY_MS);
  angularVelocity = angularVelocity.map(v => v * decay);
  draw3D();
  if (Math.hypot(...angularVelocity) < 0.000025) {
    stopInertia();
    noteCameraInteraction();
    return;
  }
  inertiaHandle = requestAnimationFrame(inertiaStep);
}

function startInertia(velocity) {
  stopCameraAnimation();
  stopInertia();
  angularVelocity = velocity.slice();
  if (Math.hypot(...angularVelocity) < FLICK_START_THRESHOLD) return;
  inertiaHandle = requestAnimationFrame(inertiaStep);
}

function idleOrbitStep(now) {
  if (!idleOrbitLastTime) idleOrbitLastTime = now;
  const dt = Math.min(40, Math.max(0, now - idleOrbitLastTime));
  idleOrbitLastTime = now;
  const idle = now - lastInteractionTime;
  const zoomRatio = cam.zoom / Math.max(1e-9, defaultCam.zoom);
  const idleZoomTriggered = zoomRatio >= IDLE_ORBIT_ZOOM_TRIGGER || zoomRatio <= 1 / IDLE_ORBIT_ZOOM_TRIGGER;
  const longIdleTriggered = idle >= IDLE_FORCE_START_MS;
  const canIdleOrbit = idleOrbitEl.checked && idle >= IDLE_DELAY_MS && pointers.size === 0 && !camAnimHandle && !inertiaHandle;
  if (!canIdleOrbit) {
    idleOrbitActive = false;
    idleOrbitStartedAt = 0;
  } else if (!idleOrbitActive && (idleZoomTriggered || longIdleTriggered)) {
    idleOrbitActive = true;
    idleOrbitStartedAt = now;
    const sessionTwist = quatRotateVec(cam.quat, IDLE_SPIN_AXIS);
    idleOrbitAxis = vecNorm([
      sessionTwist[0],
      sessionTwist[1] * 0.9 + IDLE_SPIN_AXIS[1] * 0.35,
      sessionTwist[2] * 1.1 + IDLE_SPIN_AXIS[2] * 0.25
    ]);
  }
  if (idleOrbitActive && canIdleOrbit) {
    const elapsed = Math.max(0, now - idleOrbitStartedAt);
    const phase = elapsed * 0.001;
    const energy =
      0.56
      + 0.46 * Math.sin(phase * 0.17 - 0.7)
      + 0.31 * Math.sin(phase * 0.061 + 1.8)
      + 0.19 * Math.sin(phase * 0.43 - 0.2);
    const surge = Math.pow(Math.max(0.03, energy), 1.35);
    const precessSpeed =
      IDLE_PRECESS_BASE_SPEED
      + IDLE_PRECESS_SPEED_SWELL * (0.25 + 0.75 * Math.pow(Math.sin(phase * 0.11 + 0.4), 2));
    const bodySpinSpeed = IDLE_BODY_SPIN_BASE_SPEED + IDLE_BODY_SPIN_SPEED_SWELL * surge;
    const bodyZAxis = quatRotateVec(cam.quat, [0, 0, 1]);
    const bodyXAxis = quatRotateVec(cam.quat, [1, 0, 0]);
    const driftSpeed = 0.00012 * Math.sin(phase * 0.23 + 0.9) + 0.00005 * Math.sin(phase * 0.71 - 0.3);
    const velocity = [
      idleOrbitAxis[0] * precessSpeed + bodyZAxis[0] * bodySpinSpeed + bodyXAxis[0] * driftSpeed,
      idleOrbitAxis[1] * precessSpeed + bodyZAxis[1] * bodySpinSpeed + bodyXAxis[1] * driftSpeed,
      idleOrbitAxis[2] * precessSpeed + bodyZAxis[2] * bodySpinSpeed + bodyXAxis[2] * driftSpeed
    ];
    applyAngularStep(velocity, dt);
    const zoomTarget = defaultCam.zoom * (
      1
      + 0.16 * Math.sin(phase * 0.29 + 1.1)
      + 0.07 * Math.sin(phase * 0.73 - 0.8)
    );
    const zoomBlend = 1 - Math.exp(-dt / IDLE_ZOOM_RETURN_MS);
    cam.zoom += (zoomTarget - cam.zoom) * zoomBlend;
    cam.zoom = Math.max(MIN_CAMERA_ZOOM, Math.min(MAX_CAMERA_ZOOM, cam.zoom));
    syncCameraTarget();
    draw3D();
  }
  idleOrbitHandle = requestAnimationFrame(idleOrbitStep);
}

function namedView(key) {
  const k = String(key).toUpperCase();
  if (k === "F") return { quat: quatFromEuler(0, 0, 0) };
  if (k === "B") return { quat: quatFromEuler(0, Math.PI, 0) };
  // Side views are named for the direction you look from to see that face.
  if (k === "R") return { quat: quatFromEuler(0, -Math.PI / 2, 0) };
  if (k === "L") return { quat: quatFromEuler(0, Math.PI / 2, 0) };
  if (k === "T") return { quat: quatFromEuler(Math.PI / 2, 0, 0) };
  if (k === "D") return { quat: quatFromEuler(-Math.PI / 2, 0, 0) };
  return null;
}

function drawViewCube() {
  cubeCtx.clearRect(0, 0, cubeCanvas.width, cubeCanvas.height);
  const cx = cubeCanvas.width / 2, cy = cubeCanvas.height / 2 + 3, scale = 22;
  const verts = [
    [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
    [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]
  ];
  const projected = verts.map(v => {
    const r = cubeRotatePoint(v, cam.quat);
    return { p: [cx + r[0] * scale, cy - r[1] * scale], z: r[2], raw: v };
  });
  const faces = [
    { name: "front", label: "F", idx: [4, 5, 6, 7], view: namedView("F"), labelPos: [0, 0, 1.3] },
    { name: "back", label: "B", idx: [0, 1, 2, 3], view: namedView("B"), labelPos: [0, 0, -1.3] },
    { name: "right", label: "R", idx: [1, 5, 6, 2], view: namedView("R"), labelPos: [1.28, 0, 0] },
    { name: "left", label: "L", idx: [0, 4, 7, 3], view: namedView("L"), labelPos: [-1.28, 0, 0] },
    { name: "top", label: "T", idx: [3, 2, 6, 7], view: namedView("T"), labelPos: [0, 1.26, 0] },
    { name: "bottom", label: "D", idx: [0, 1, 5, 4], view: namedView("D"), labelPos: [0, -1.26, 0] }
  ];
  viewCubeTargets = [];
  const light = vecNorm([-0.35, 0.82, 0.44]);
  const renderedFaces = faces
    .map(face => {
      const rp = face.idx.map(i => cubeRotatePoint(verts[i], cam.quat));
      const normal = vecNorm(vecCross(vecSub(rp[1], rp[0]), vecSub(rp[2], rp[0])));
      return { ...face, normal, avgZ: rp.reduce((s, p) => s + p[2], 0) / 4 };
    })
    .sort((a, b) => a.avgZ - b.avgZ);
  renderedFaces.forEach(face => {
      const poly = face.idx.map(i => projected[i].p);
      const intensity = 0.42 + 0.1 * Math.max(0, vecDot(face.normal, light));
      const tone = Math.round(255 * intensity);
      cubeCtx.beginPath();
      cubeCtx.moveTo(poly[0][0], poly[0][1]);
      for (let i = 1; i < poly.length; i++) cubeCtx.lineTo(poly[i][0], poly[i][1]);
      cubeCtx.closePath();
      cubeCtx.fillStyle = `rgb(${tone},${tone},${Math.max(102, tone - 8)})`;
      cubeCtx.fill();
      cubeCtx.strokeStyle = "rgba(120,150,176,.26)";
      cubeCtx.lineWidth = 1.1;
      cubeCtx.stroke();
      const labelRot = cubeRotatePoint(face.labelPos, cam.quat);
      const lx = cx + labelRot[0] * scale;
      const ly = cy - labelRot[1] * scale;
      cubeCtx.lineWidth = 3.2;
      cubeCtx.strokeStyle = "rgba(24, 38, 56, 0.92)";
      cubeCtx.font = "10px -apple-system,BlinkMacSystemFont,sans-serif";
      cubeCtx.textAlign = "center";
      cubeCtx.textBaseline = "middle";
      cubeCtx.strokeText(face.label, lx, ly);
      cubeCtx.fillStyle = "rgba(248,248,250,.96)";
      cubeCtx.fillText(face.label, lx, ly);
      if (face.normal[2] >= -0.35) {
        viewCubeTargets.push({ type: "face", poly, view: face.view });
        viewCubeTargets.push({ type: "label", x: lx, y: ly, r: 9, view: face.view });
      }
    });
  const zMin = Math.min(...projected.map(v => v.z));
  const zMax = Math.max(...projected.map(v => v.z));
  const zSpan = Math.max(1e-6, zMax - zMin);
  for (const v of projected.map((v, i) => ({ i, ...v })).sort((a, b) => a.z - b.z)) {
    const visibility = (v.z - zMin) / zSpan;
    if (visibility < 0.16) continue;
    const alpha = 0.2 + visibility * 0.75;
    const radius = 1.6 + visibility * 1.8;
    cubeCtx.beginPath();
    cubeCtx.arc(v.p[0], v.p[1], radius, 0, Math.PI * 2);
    cubeCtx.fillStyle = `rgba(40,116,166,${alpha.toFixed(3)})`;
    cubeCtx.fill();
    cubeCtx.strokeStyle = `rgba(255,255,255,${Math.min(0.95, alpha + 0.08).toFixed(3)})`;
    cubeCtx.lineWidth = 1;
    cubeCtx.stroke();
    const [sx, sy, sz] = v.raw;
    viewCubeTargets.push({
      type: "corner",
      x: v.p[0],
      y: v.p[1],
      r: Math.max(6, radius + 3.8),
      view: cameraPose({
        quat: quatFromEuler(sy > 0 ? -0.68 : 0.68, sx > 0 ? 0.82 : -0.82, sz > 0 ? 0 : Math.PI)
      })
    });
  }
}

function pointerModeAt(clientX, clientY, baseMode) {
  if (baseMode !== "rotate") return baseMode;
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left, y = clientY - rect.top;
  const m = screenMetrics();
  const dist = Math.hypot(x - m.cx, y - m.cy);
  return dist >= m.rollStart ? "orbitZ" : "rotate";
}

function updateHover3D(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  hover3D.active = true;
  hover3D.x = clientX - rect.left;
  hover3D.y = clientY - rect.top;
  hover3D.mode = pointerModeAt(clientX, clientY, "rotate");
  canvas.style.cursor = hover3D.mode === "orbitZ" ? "crosshair" : "grab";
}

function pinchState() {
  const ps = [...pointers.values()], a = ps[0], b = ps[1];
  return { dist: Math.hypot(b.x - a.x, b.y - a.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
}

function endCanvasPointer(ev) {
  const released = pointers.get(ev.pointerId);
  pointers.delete(ev.pointerId);
  lastSingle = pointers.size === 1 ? { ...[...pointers.values()][0] } : null;
  lastPinch = pointers.size === 2 ? pinchState() : null;
  if (released && pointers.size === 0 && (released.mode === "rotate" || released.mode === "orbitZ")) {
    startInertia(released.velocity || [0, 0, 0]);
  }
  noteCameraInteraction();
  if (ev.pointerType === "mouse") {
    if (pointers.size === 0) {
      updateHover3D(ev.clientX, ev.clientY);
      canvas.style.cursor = hover3D.mode === "orbitZ" ? "crosshair" : "grab";
    }
    draw3D();
  }
}

function applyPaneWeights() {
  const isNarrow = window.matchMedia("(max-width: 950px)").matches;
  const parts = [
    `minmax(46px, ${paneWeights[0]}fr)`, "8px",
    `minmax(46px, ${paneWeights[1]}fr)`, "8px",
    `minmax(46px, ${paneWeights[2]}fr)`, "8px",
    `minmax(46px, ${paneWeights[3]}fr)`
  ].join(" ");
  if (isNarrow) panes.style.gridTemplateRows = parts;
  else panes.style.gridTemplateColumns = parts;
  resize();
}

function resetPanes() {
  paneWeights = [20, 22, 26, 32];
  cam = cameraPose(defaultCam);
  camTarget = cameraPose(defaultCam);
  stopCameraAnimation();
  for (const id of ["paneData", "paneOps", "panePattern", "pane3d"]) {
    const p = document.getElementById(id);
    p.classList.remove("collapsed");
    p.querySelector("button[data-collapse]").textContent = "hide";
  }
  applyPaneWeights();
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  glCanvas.width = Math.max(1, Math.floor(rect.width * dpr));
  glCanvas.height = Math.max(1, Math.floor(rect.height * dpr));
  if (gl) gl.viewport(0, 0, glCanvas.width, glCanvas.height);
  renderAll();
}

document.querySelectorAll(".gutter").forEach(g => {
  g.addEventListener("pointerdown", ev => {
    g.setPointerCapture(ev.pointerId);
    dragGutter = { idx: Number(g.dataset.gutter), startX: ev.clientX, startY: ev.clientY, weights: paneWeights.slice() };
  });
  g.addEventListener("pointermove", ev => {
    if (!dragGutter) return;
    const isNarrow = window.matchMedia("(max-width: 950px)").matches;
    const delta = isNarrow ? ev.clientY - dragGutter.startY : ev.clientX - dragGutter.startX;
    const rect = panes.getBoundingClientRect();
    const totalPixels = isNarrow ? rect.height : rect.width;
    const deltaFr = delta / Math.max(1, totalPixels) * sum(dragGutter.weights);
    const i = dragGutter.idx;
    paneWeights = dragGutter.weights.slice();
    paneWeights[i] = Math.max(5, dragGutter.weights[i] + deltaFr);
    paneWeights[i + 1] = Math.max(5, dragGutter.weights[i + 1] - deltaFr);
    applyPaneWeights();
  });
  g.addEventListener("pointerup", () => { dragGutter = null; });
  g.addEventListener("pointercancel", () => { dragGutter = null; });
});

document.querySelectorAll("button[data-collapse]").forEach(b => b.addEventListener("click", () => {
  const id = b.dataset.collapse;
  const idx = ["paneData", "paneOps", "panePattern", "pane3d"].indexOf(id);
  const pane = document.getElementById(id);
  const collapsed = !pane.classList.contains("collapsed");
  pane.classList.toggle("collapsed", collapsed);
  b.textContent = collapsed ? "show" : "hide";
  paneWeights[idx] = collapsed ? 5 : [20, 22, 26, 32][idx];
  applyPaneWeights();
}));

canvas.addEventListener("contextmenu", ev => ev.preventDefault());
canvas.addEventListener("mouseenter", () => { view3DHotkeysActive = true; });
canvas.addEventListener("pointerenter", ev => { if (ev.pointerType === "mouse") { updateHover3D(ev.clientX, ev.clientY); draw3D(); } });
canvas.addEventListener("pointerdown", ev => {
  if (ev.pointerType === "mouse" && ev.button !== 0 && ev.button !== 2) return;
  canvas.setPointerCapture(ev.pointerId);
  stopCameraAnimation();
  stopInertia();
  noteCameraInteraction();
  syncCameraTarget();
  let mode = ev.pointerType === "mouse" && ev.button === 2 ? "pan" : "rotate";
  mode = pointerModeAt(ev.clientX, ev.clientY, mode);
  const point = { x: ev.clientX, y: ev.clientY, mode, time: performance.now(), velocity: [0, 0, 0] };
  if (mode === "orbitZ") {
    const rect = canvas.getBoundingClientRect();
    const m = screenMetrics();
    point.orbitCx = m.cx;
    point.orbitCy = m.cy;
    point.orbitStartAngle = Math.atan2(ev.clientY - rect.top - m.cy, ev.clientX - rect.left - m.cx);
    point.orbitStartQuat = cam.quat.slice();
  }
  pointers.set(ev.pointerId, point);
  if (pointers.size === 1) lastSingle = { ...point };
  if (pointers.size === 2) lastPinch = pinchState();
  canvas.style.cursor = mode === "pan" ? "move" : (mode === "orbitZ" ? "crosshair" : "grabbing");
});
canvas.addEventListener("pointermove", ev => {
  if (ev.pointerType === "mouse" && pointers.size === 0) {
    updateHover3D(ev.clientX, ev.clientY);
    draw3D();
    return;
  }
  if (!pointers.has(ev.pointerId)) return;
  const prev = pointers.get(ev.pointerId);
  const nowTime = performance.now();
  pointers.set(ev.pointerId, { ...prev, x: ev.clientX, y: ev.clientY, time: nowTime });
  if (pointers.size === 1 && lastSingle) {
    const p = [...pointers.values()][0];
    const dx = p.x - lastSingle.x, dy = p.y - lastSingle.y;
    const dt = Math.max(1, p.time - lastSingle.time);
    let nextVelocity = [0, 0, 0];
    if (p.mode === "pan") {
      cam.panX += dx;
      cam.panY += dy;
    } else if (p.mode === "orbitZ") {
      const rect = canvas.getBoundingClientRect();
      const a1 = Math.atan2(p.y - rect.top - p.orbitCy, p.x - rect.left - p.orbitCx);
      const a0 = Math.atan2(lastSingle.y - rect.top - p.orbitCy, lastSingle.x - rect.left - p.orbitCx);
      cam.quat = quatMultiply(quatFromAxisAngle([0, 0, 1], -(a1 - p.orbitStartAngle)), p.orbitStartQuat);
      nextVelocity = [0, 0, -angleWrap(a1 - a0) / dt];
    } else {
      const qYaw = quatFromAxisAngle([0, 1, 0], dx * 0.008);
      const qPitch = quatFromAxisAngle([1, 0, 0], dy * 0.008);
      cam.quat = quatMultiply(quatMultiply(qYaw, qPitch), cam.quat);
      nextVelocity = [dy * 0.008 / dt, dx * 0.008 / dt, 0];
    }
    p.velocity = p.velocity.map((v, i) => v * 0.58 + nextVelocity[i] * 0.42);
    pointers.set(ev.pointerId, p);
    syncCameraTarget();
    noteCameraInteraction();
    lastSingle = { ...p };
    draw3D();
  } else if (pointers.size === 2 && lastPinch) {
    const now = pinchState();
    cam.zoom *= now.dist / Math.max(1, lastPinch.dist);
    cam.zoom = Math.max(MIN_CAMERA_ZOOM, Math.min(MAX_CAMERA_ZOOM, cam.zoom));
    cam.panX += now.cx - lastPinch.cx;
    cam.panY += now.cy - lastPinch.cy;
    syncCameraTarget();
    noteCameraInteraction();
    lastPinch = now;
    draw3D();
  }
});
canvas.addEventListener("pointerup", endCanvasPointer);
canvas.addEventListener("pointercancel", endCanvasPointer);
canvas.addEventListener("pointerleave", ev => {
  view3DHotkeysActive = false;
  if (ev.pointerType === "mouse" && pointers.size === 0) {
    hover3D.active = false;
    canvas.style.cursor = "default";
    draw3D();
  }
});
canvas.addEventListener("wheel", ev => {
  ev.preventDefault();
  stopCameraAnimation();
  stopInertia();
  noteCameraInteraction();
  const factor = Math.exp(-ev.deltaY * 0.0015);
  cam.zoom *= factor;
  cam.zoom = Math.max(MIN_CAMERA_ZOOM, Math.min(MAX_CAMERA_ZOOM, cam.zoom));
  syncCameraTarget();
  draw3D();
}, { passive: false });

cubeCanvas.addEventListener("mousemove", ev => {
  view3DHotkeysActive = true;
  const rect = cubeCanvas.getBoundingClientRect();
  const x = (ev.clientX - rect.left) * (cubeCanvas.width / rect.width);
  const y = (ev.clientY - rect.top) * (cubeCanvas.height / rect.height);
  const hit = viewCubeTargets.find(t => cubeTargetContains(t, x, y));
  cubeCanvas.style.cursor = hit ? "pointer" : "default";
});
cubeCanvas.addEventListener("click", ev => {
  view3DHotkeysActive = true;
  noteCameraInteraction();
  const rect = cubeCanvas.getBoundingClientRect();
  const x = (ev.clientX - rect.left) * (cubeCanvas.width / rect.width);
  const y = (ev.clientY - rect.top) * (cubeCanvas.height / rect.height);
  for (let i = viewCubeTargets.length - 1; i >= 0; i--) {
    const t = viewCubeTargets[i];
    if (cubeTargetContains(t, x, y)) {
      setCameraView(t.view);
      break;
    }
  }
});

pane3dEl.addEventListener("mouseenter", () => { view3DHotkeysActive = true; });
pane3dEl.addEventListener("mouseleave", () => { view3DHotkeysActive = false; });
idleOrbitEl.addEventListener("change", () => {
  noteCameraInteraction();
  if (!idleOrbitEl.checked) draw3D();
});
window.addEventListener("keydown", ev => {
  if (!view3DHotkeysActive) return;
  if (ev.key === "Escape") {
    ev.preventDefault();
    resetCameraView();
    return;
  }
  const view = namedView(ev.key);
  if (view) {
    ev.preventDefault();
    setCameraView(view);
  }
});

document.getElementById("apply").addEventListener("click", applyEditor);
document.getElementById("addVar").addEventListener("click", () => {
  addVarRecord();
  setOpStatus(`Added ${vars[selected].name}.`);
});
document.getElementById("removeVar").addEventListener("click", removeVarRecord);
document.getElementById("saveModel").addEventListener("click", async () => {
  try {
    const text = serializeModel(true);
    await writeClipboard(text);
    setOpStatus("Saved the full model to the clipboard.");
  } catch (e) {
    setOpStatus(e.message, true);
  }
});
document.getElementById("loadModel").addEventListener("click", async () => {
  try {
    loadModelFromText(await readClipboard());
  } catch (e) {
    setOpStatus(e.message, true);
  }
});
controlSliderEl.addEventListener("input", () => {
  if (!isControlVar(vars[selected])) return;
  controlValueEl.value = controlSliderEl.value;
  applyControlPreview();
});
varKindEl.addEventListener("change", () => {
  const switchingToControl = varKindEl.value === "control";
  controlFieldsEl.hidden = !switchingToControl;
  dataEl.hidden = switchingToControl;
  document.getElementById("designHelp").hidden = switchingToControl;
});
function applyControlPreview() {
  if (!isControlVar(vars[selected])) return;
  try {
    vars[selected].control = sanitizeControl({
      value: Number(controlValueEl.value),
      min: Number(controlMinEl.value),
      max: Number(controlMaxEl.value),
      step: Number(controlStepEl.value)
    });
    vars[selected].value = vars[selected].control.value;
    controlSliderEl.min = String(vars[selected].control.min);
    controlSliderEl.max = String(vars[selected].control.max);
    controlSliderEl.step = String(vars[selected].control.step);
    controlSliderEl.value = String(vars[selected].control.value);
    recomputeAllDesigns();
    refreshUI();
    renderAll();
  } catch (e) {
    showStatus(e.message, true);
  }
}
controlValueEl.addEventListener("change", applyControlPreview);
controlMinEl.addEventListener("change", applyControlPreview);
controlMaxEl.addEventListener("change", applyControlPreview);
controlStepEl.addEventListener("change", applyControlPreview);
controlSliderEl.addEventListener("change", applyControlPreview);
document.getElementById("resetPanes").addEventListener("click", resetPanes);
window.addEventListener("resize", applyPaneWeights);

syncViewTheme();
refreshUI();
applyPaneWeights();
startPlotSelectionAnimation();
idleOrbitHandle = requestAnimationFrame(idleOrbitStep);
