const fs = require("fs");
const path = require("path");
const vm = require("vm");

function makeClassList() {
  return {
    add() {},
    remove() {},
    toggle() {},
    contains() { return false; }
  };
}

function makeContext2D() {
  const gradient = { addColorStop() {} };
  return {
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    stroke() {},
    fill() {},
    clearRect() {},
    fillRect() {},
    strokeRect() {},
    rect() {},
    arc() {},
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    scale() {},
    setTransform() {},
    resetTransform() {},
    setLineDash() {},
    fillText() {},
    strokeText() {},
    measureText(text) { return { width: String(text).length * 7 }; },
    createLinearGradient() { return gradient; },
    createRadialGradient() { return gradient; }
  };
}

function makeWebGLContext() {
  const base = {
    TRIANGLES: 4,
    ARRAY_BUFFER: 34962,
    STATIC_DRAW: 35044,
    FLOAT: 5126,
    DEPTH_TEST: 2929,
    LEQUAL: 515,
    CULL_FACE: 2884,
    BACK: 1029,
    COLOR_BUFFER_BIT: 16384,
    DEPTH_BUFFER_BIT: 256,
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,
    createShader() { return {}; },
    shaderSource() {},
    compileShader() {},
    getShaderParameter() { return true; },
    getShaderInfoLog() { return ""; },
    createProgram() { return {}; },
    attachShader() {},
    linkProgram() {},
    getProgramParameter() { return true; },
    getProgramInfoLog() { return ""; },
    useProgram() {},
    getAttribLocation() { return 0; },
    getUniformLocation() { return {}; },
    createBuffer() { return {}; },
    bindBuffer() {},
    bufferData() {},
    enableVertexAttribArray() {},
    vertexAttribPointer() {},
    uniformMatrix4fv() {},
    uniform3fv() {},
    uniform4fv() {},
    uniform1f() {},
    viewport() {},
    clearColor() {},
    clearDepth() {},
    enable() {},
    disable() {},
    cullFace() {},
    depthFunc() {},
    clear() {},
    drawArrays() {}
  };
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === "string" && /^[A-Z0-9_]+$/.test(prop)) return 0;
      return () => {};
    }
  });
}

function makeElement(id = "") {
  const el = {
    id,
    value: "",
    textContent: "",
    innerHTML: "",
    hidden: false,
    disabled: false,
    checked: false,
    width: 800,
    height: 600,
    clientWidth: 800,
    clientHeight: 600,
    style: {},
    dataset: {},
    className: "",
    classList: makeClassList(),
    children: [],
    appendChild(child) { this.children.push(child); return child; },
    removeChild(child) { this.children = this.children.filter(x => x !== child); },
    replaceChildren(...children) { this.children = children; },
    setAttribute(name, value) { this[name] = value; },
    getAttribute(name) { return this[name]; },
    addEventListener() {},
    removeEventListener() {},
    focus() {},
    blur() {},
    select() {},
    click() {},
    querySelector() { return makeElement(); },
    querySelectorAll() { return []; },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight, right: this.clientWidth, bottom: this.clientHeight };
    },
    getContext(kind) {
      if (kind === "2d") return makeContext2D();
      if (kind === "webgl" || kind === "experimental-webgl") return makeWebGLContext();
      return null;
    }
  };
  return el;
}

function makeDocument() {
  const elements = new Map();
  return {
    body: makeElement("body"),
    documentElement: makeElement("documentElement"),
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement(id));
      return elements.get(id);
    },
    createElement(tag) { return makeElement(tag); },
    createElementNS(ns, tag) { return makeElement(tag); },
    querySelector() { return makeElement(); },
    querySelectorAll() { return []; },
    addEventListener() {},
    removeEventListener() {}
  };
}

function loadAppContext() {
  const document = makeDocument();
  const sandbox = {
    console,
    Math,
    Date,
    JSON,
    Number,
    String,
    Boolean,
    Array,
    Object,
    RegExp,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Promise,
    parseFloat,
    parseInt,
    isFinite,
    structuredClone,
    document,
    window: null,
    navigator: { clipboard: { writeText: async () => {}, readText: async () => "" } },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    performance: { now: () => 0 },
    Image: function Image() {},
    addEventListener() {},
    removeEventListener() {},
    matchMedia() { return { matches: false, addEventListener() {}, removeEventListener() {} }; },
    alert() {},
    confirm() { return true; },
    prompt() { return ""; },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const scripts = [
    path.join(__dirname, "..", "js", "examples.js"),
    path.join(__dirname, "..", "js", "app.js"),
    path.join(__dirname, "operator-tests.js"),
    path.join(__dirname, "camera-tests.js")
  ];
  for (const scriptPath of scripts) {
    const source = fs.readFileSync(scriptPath, "utf8");
    vm.runInContext(source, sandbox, { filename: scriptPath });
  }
  return sandbox;
}

function main() {
  const ctx = loadAppContext();
  const results = [
    ...ctx.runPopupOperatorTests(),
    ...ctx.runPopupCameraTests()
  ];
  const failures = results.filter(result => !result.ok);
  for (const result of results) {
    const detail = result.error || result.expectedError || "ok";
    console.log(`${result.ok ? "PASS" : "FAIL"}  ${result.name}  ${detail}`);
  }
  if (failures.length) {
    console.error(`\n${failures.length} test(s) failed.`);
    process.exit(1);
  }
  console.log(`\nAll ${results.length} tests passed.`);
}

main();
