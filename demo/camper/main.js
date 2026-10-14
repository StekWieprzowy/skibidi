import { THREE, createStage, outdoorEnvironment, flakeTexture, gridGeometry, canvasTexture, mesh, rod, tube, V, lerp } from '../common/stage.js';
import { buildUI } from '../common/ui.js';
import { RoundedBoxGeometry } from '../vendor/RoundedBoxGeometry.js';

/* Kamper typu van z wysokim dachem. x — przód +x, y — góra, z — prawa strona (drzwi przesuwne). */
const AX_F = 1.95, AX_R = -1.72, WR = 0.37, TRACK = 0.86, ARCH = 0.45;
const X0 = -2.96, X1 = 2.97;

const stage = createStage({
  views: {
    iso:   { label: { pl: '3/4', en: '3/4' },     pos: V(7.4, 2.6, 7.6),   target: V(0, 1.25, 0) },
    side:  { label: { pl: 'Bok', en: 'Side' },    pos: V(0.01, 1.7, 12.5), target: V(0, 1.3, 0) },
    rear:  { label: { pl: 'Tył', en: 'Rear' },    pos: V(-9.0, 2.4, 3.4),  target: V(0, 1.3, 0) },
    top:   { label: { pl: 'Góra', en: 'Top' },    pos: V(0.01, 13, 0.8),   target: V(0, 1.0, 0) },
  },
  fov: 30, minDistance: 4, maxDistance: 22, exposure: 0.34,
});
const { scene, renderer } = stage;
outdoorEnvironment(stage, { sunEl: 36, sunAz: 140, cloud: 0.38, grass: ['#384226', '#4d522c', '#6a603d'] });

function lookup(pts) {
  const c = new THREE.SplineCurve(pts.map(([a, b]) => new THREE.Vector2(a, b))).getPoints(600);
  return (x) => {
    if (x <= c[0].x) return c[0].y;
    if (x >= c[c.length - 1].x) return c[c.length - 1].y;
    let lo = 0, hi = c.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m].x <= x) lo = m; else hi = m; }
    return lerp(c[lo].y, c[hi].y, (x - c[lo].x) / Math.max(1e-9, c[hi].x - c[lo].x));
  };
}
const halfW = lookup([[X0, 0.97], [-2.8, 1.0], [2.2, 1.0], [2.7, 0.97], [2.9, 0.9], [X1, 0.82]]);
const topY = lookup([[X0, 2.62], [-2.86, 2.78], [0.9, 2.8], [1.3, 2.68], [1.58, 2.3], [2.0, 1.78], [2.42, 1.3], [2.75, 1.16], [2.9, 1.05], [X1, 0.86]]);
const botBase = lookup([[X0, 0.55], [-2.85, 0.42], [2.8, 0.42], [X1, 0.5]]);
const botY = (x) => {
  let y = botBase(x);
  for (const ax of [AX_F, AX_R]) { const d = Math.abs(x - ax); if (d < ARCH) y = Math.max(y, WR + Math.sqrt(ARCH * ARCH - d * d)); }
  return y;
};
function bodyPoint(x, th) {
  const W = halfW(x), yt = topY(x), yb = botY(x), yc = (yt + yb) / 2, H = (yt - yb) / 2;
  const c = Math.cos(th), s = Math.sin(th);
  const z = W * Math.sign(c) * Math.pow(Math.abs(c), 2 / 9);
  const y = yc + H * Math.sign(s) * Math.pow(Math.abs(s), 2 / (s > 0 ? 7 : 10));
  return [x, y, z];
}
// z na powierzchni boku dla (x, y)
function sideZ(x, y) {
  let best = 0, bd = 1e9;
  for (let i = 0; i <= 240; i++) { const p = bodyPoint(x, -Math.PI / 2 + (i / 240) * Math.PI); const d = Math.abs(p[1] - y); if (d < bd) { bd = d; best = p[2]; } }
  return best;
}

/* ------------------------------ materiały ------------------------------ */
const paint = new THREE.MeshPhysicalMaterial({ color: 0xe9e7e2, metalness: 0.1, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.04,
  normalMap: flakeTexture(), normalScale: new THREE.Vector2(0.06, 0.06), side: THREE.DoubleSide });
paint.onBeforeCompile = (sh) => {
  sh.uniforms.uLower = { value: new THREE.Color(0x2a2d31) };
  sh.uniforms.uSplit = { value: -1.0 };
  paint.userData.sh = sh;
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vY;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvY = position.y;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vY; uniform vec3 uLower; uniform float uSplit;')
    .replace('#include <color_fragment>', '#include <color_fragment>\nif (vY < uSplit) diffuseColor.rgb = uLower;');
};
const lower = { color: new THREE.Color(0x2a2d31), split: -1 };
paint.customProgramCacheKey = () => 'camper-paint';
const glass = new THREE.MeshPhysicalMaterial({ color: 0x06080a, roughness: 0.05, envMapIntensity: 1.0, side: THREE.DoubleSide });
const plastic = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.75, side: THREE.DoubleSide });
const gloss = new THREE.MeshPhysicalMaterial({ color: 0x0a0b0c, roughness: 0.2, clearcoat: 1, side: THREE.DoubleSide });
const alu = new THREE.MeshStandardMaterial({ color: 0xc9cdd1, metalness: 1, roughness: 0.3 });
const tyre = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.88 });
const rimMat = new THREE.MeshStandardMaterial({ color: 0x2b2e31, metalness: 0.8, roughness: 0.35 });
const led = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeaf2ff, emissiveIntensity: 4 });
const tail = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff0804, emissiveIntensity: 1.5 });
const awningTex = canvasTexture(renderer, 256, (g, S) => {
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#d9d6cf' : '#4f5a63'; g.fillRect((i * S) / 8, 0, S / 8, S); }
});
const fabric = new THREE.MeshStandardMaterial({ map: awningTex, roughness: 0.9, side: THREE.DoubleSide });
const solarTex = canvasTexture(renderer, 256, (g, S) => {
  g.fillStyle = '#0d1a2e'; g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(160,190,230,.35)'; g.lineWidth = 2;
  for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo((i * S) / 6, 0); g.lineTo((i * S) / 6, S); g.stroke(); }
  for (let i = 1; i < 10; i++) { g.beginPath(); g.moveTo(0, (i * S) / 10); g.lineTo(S, (i * S) / 10); g.stroke(); }
}, { repeat: false });
const solarMat = new THREE.MeshPhysicalMaterial({ map: solarTex, roughness: 0.1, metalness: 0.3, clearcoat: 1 });

/* ------------------------------ nadwozie ------------------------------ */
const van = new THREE.Group();
scene.add(van);
const NU = 240, NV = 120;
mesh(gridGeometry(NU, NV, (a, b) => bodyPoint(lerp(X0, X1, a), -Math.PI / 2 + b * Math.PI * 2), (p) => [p[0], p[1] + Math.abs(p[2])]), paint, van);
for (const x of [X0, X1]) {
  const pts = []; for (let i = 0; i <= NV; i++) pts.push(bodyPoint(x, -Math.PI / 2 + (i / NV) * Math.PI * 2));
  const pos = [x, (topY(x) + botY(x)) / 2, 0], idx = [];
  pts.forEach((p) => pos.push(...p));
  for (let i = 1; i <= NV; i++) idx.push(0, i, i + 1);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  mesh(g, paint, van);
}

// szyba czołowa (część powierzchni nadwozia, lekko odsunięta)
const surfPatch = (x0, x1, b0, b1, mat, off = 0.004, nu = 40, nv = 30) => mesh(gridGeometry(nu, nv, (a, b) => {
  const x = lerp(x0, x1, a), th = -Math.PI / 2 + lerp(b0, b1, b) * Math.PI * 2;
  const p = bodyPoint(x, th), yc = (topY(x) + botY(x)) / 2;
  const dz = p[2], dy = p[1] - yc, l = Math.hypot(dz, dy) || 1;
  return [p[0] + off * 0.6, p[1] + off * dy / l, p[2] + off * dz / l];
}), mat, van, { cast: false });
surfPatch(1.62, 2.38, 0.36, 0.64, glass);
// okna boczne (płaskie na boku)
const sidePane = (x0, x1, y0, y1, sd, mat = glass, r = 0.06) => {
  const g = gridGeometry(24, 10, (a, b) => {
    const x = lerp(x0, x1, a), y = lerp(y0, y1, b);
    return [x, y, sd * (sideZ(x, y) + 0.005)];
  });
  void r;
  return mesh(g, mat, van, { cast: false });
};
for (const sd of [-1, 1]) {
  sidePane(1.25, 1.66, 1.42, 1.98, sd);                 // okno kabiny
  sidePane(-2.45, -0.75, 1.55, 2.05, sd);               // okno tylne
}
sidePane(-0.45, 0.85, 1.55, 2.05, 1);                   // okno w drzwiach przesuwnych
sidePane(-0.45, 0.85, 1.55, 2.05, -1);
// tylne drzwi: dwa okna
for (const z of [-0.45, 0.45]) {
  const w = mesh(new THREE.PlaneGeometry(0.62, 0.5), glass, van, { cast: false });
  w.rotation.y = -Math.PI / 2; w.position.set(X0 - 0.005, 2.0, z);
}
// szczeliny drzwi
const seam = (pts) => tube(pts.map((p) => V(...p)), 0.004, plastic, van, 24);
for (const sd of [-1, 1]) {
  const xs = sd > 0 ? [1.2, 0.95, -0.55] : [1.2];
  for (const x of xs) { const pts = []; for (let i = 0; i <= 12; i++) { const y = lerp(0.6, 2.1, i / 12); pts.push([x, y, sd * (sideZ(x, y) + 0.002)]); } seam(pts); }
}
rod(V(X0 - 0.004, 0.6, 0), V(X0 - 0.004, 2.45, 0), 0.004, plastic, van);
// zderzaki, grill, reflektory, lusterka, światła
const bumperF = mesh(new RoundedBoxGeometry(0.2, 0.32, 1.98, 3, 0.06), plastic, van); bumperF.position.set(X1 - 0.04, 0.6, 0);
const bumperR = mesh(new RoundedBoxGeometry(0.18, 0.3, 1.96, 3, 0.06), plastic, van); bumperR.position.set(X0 + 0.02, 0.58, 0);
const grill = mesh(new RoundedBoxGeometry(0.05, 0.3, 1.0, 3, 0.04), gloss, van); grill.position.set(X1 - 0.01, 0.92, 0);
for (const sd of [-1, 1]) {
  const lamp = mesh(new RoundedBoxGeometry(0.06, 0.16, 0.36, 3, 0.04), gloss, van); lamp.position.set(X1 - 0.04, 1.0, sd * 0.68);
  const strip = mesh(new RoundedBoxGeometry(0.02, 0.025, 0.3, 2, 0.01), led, van); strip.position.set(X1 + 0.0, 1.06, sd * 0.68);
  const tl = mesh(new RoundedBoxGeometry(0.04, 0.5, 0.12, 2, 0.03), tail, van); tl.position.set(X0 - 0.01, 1.0, sd * 0.88);
  const mir = mesh(new RoundedBoxGeometry(0.12, 0.3, 0.2, 3, 0.05), plastic, van); mir.position.set(1.55, 1.85, sd * 1.18);
  rod(V(1.6, 1.75, sd * 1.0), V(1.56, 1.8, sd * 1.12), 0.02, plastic, van);
  const handle = mesh(new RoundedBoxGeometry(0.18, 0.04, 0.03, 2, 0.012), plastic, van);
  handle.position.set(1.0, 1.25, sd * (sideZ(1.0, 1.25) + 0.012));
  // listwa progowa
  const sill = []; for (let i = 0; i <= 20; i++) { const x = lerp(AX_R + ARCH, AX_F - ARCH, i / 20); sill.push(V(x, 0.5, sd * (sideZ(x, 0.5) + 0.008))); }
  tube(sill, 0.03, plastic, van, 40);
}
// okno dachowe (szyberdach) i reling
const skylight = mesh(new RoundedBoxGeometry(0.75, 0.12, 0.75, 3, 0.05), gloss, van); skylight.position.set(-1.6, 2.82, 0);

/* ------------------------------ koła ------------------------------ */
for (const ax of [AX_F, AX_R]) {
  const liner = mesh(new THREE.CylinderGeometry(ARCH - 0.005, ARCH - 0.005, 2.0, 40, 1, true, -Math.PI / 2, Math.PI), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1, side: THREE.BackSide }), van, { cast: false });
  liner.rotation.x = -Math.PI / 2; liner.position.set(ax, WR, 0);
}
const tyreGeo = (() => {
  const pts = [], r0 = 0.24, r1 = WR, w = 0.12;
  pts.push(new THREE.Vector2(r0, -w * 0.95));
  for (let i = 0; i <= 12; i++) { const a = -Math.PI / 2 + (i / 12) * Math.PI; pts.push(new THREE.Vector2(r1 - 0.06 + Math.cos(a) * 0.06, Math.sin(a) * w)); }
  pts.push(new THREE.Vector2(r0, w * 0.95));
  return new THREE.LatheGeometry(pts, 64).rotateX(Math.PI / 2);
})();
for (const ax of [AX_F, AX_R]) for (const sd of [-1, 1]) {
  const w = new THREE.Group(); w.position.set(ax, WR, sd * TRACK); van.add(w);
  mesh(tyreGeo, tyre, w);
  const face = mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.05, 40), rimMat, w); face.rotation.x = Math.PI / 2; face.position.z = sd * 0.06;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const hole = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.052, 16), gloss, w);
    hole.rotation.x = Math.PI / 2; hole.position.set(Math.cos(a) * 0.15, Math.sin(a) * 0.15, sd * 0.062);
  }
  const hub = mesh(new THREE.CylinderGeometry(0.06, 0.065, 0.06, 24), alu, w); hub.rotation.x = Math.PI / 2; hub.position.z = sd * 0.07;
}

/* ------------------------------ wyposażenie (opcje) ------------------------------ */
// markiza po prawej stronie
const awning = new THREE.Group(); van.add(awning);
{
  const xa = -2.25, xb = 0.95, yc = 2.62, z0 = 1.04, z1 = 3.3, y1 = 2.15;
  const cas = mesh(new RoundedBoxGeometry(xb - xa, 0.14, 0.14, 3, 0.04), alu, awning); cas.position.set((xa + xb) / 2, yc, z0 + 0.05);
  const cloth = mesh(gridGeometry(20, 10, (a, b) => { const x = lerp(xa + 0.05, xb - 0.05, a), z = lerp(z0 + 0.1, z1, b); return [x, lerp(yc - 0.05, y1, b) - 0.06 * Math.sin(Math.PI * b), z]; }, (p) => [p[0] * 0.5, p[2]]), fabric, awning);
  void cloth;
  rod(V(xa + 0.05, y1, z1), V(xb - 0.05, y1, z1), 0.025, alu, awning);
  for (const x of [xa + 0.1, xb - 0.1]) rod(V(x, y1, z1), V(x, 0, z1), 0.02, alu, awning);
}
// panele słoneczne
const solar = new THREE.Group(); van.add(solar);
for (const x of [-0.4, 0.55]) {
  const p = mesh(new THREE.BoxGeometry(0.85, 0.035, 1.5), solarMat, solar); p.position.set(x, 2.84, 0);
  const fr = mesh(new THREE.BoxGeometry(0.89, 0.03, 1.54), alu, solar); fr.position.set(x, 2.825, 0);
}
// bagażnik rowerowy z dwoma rowerami
const bikes = new THREE.Group(); van.add(bikes);
{
  const bx = X0 - 0.22;
  rod(V(X0 + 0.02, 0.95, -0.7), V(bx, 0.95, -0.7), 0.02, alu, bikes); rod(V(X0 + 0.02, 0.95, 0.7), V(bx, 0.95, 0.7), 0.02, alu, bikes);
  rod(V(bx, 0.95, -0.8), V(bx, 0.95, 0.8), 0.022, alu, bikes);
  rod(V(X0 + 0.02, 1.7, -0.7), V(bx + 0.05, 1.55, -0.7), 0.018, alu, bikes); rod(V(X0 + 0.02, 1.7, 0.7), V(bx + 0.05, 1.55, 0.7), 0.018, alu, bikes);
  const frameMats = [new THREE.MeshPhysicalMaterial({ color: 0x1f6b5c, roughness: 0.3, clearcoat: 1 }), new THREE.MeshPhysicalMaterial({ color: 0xb0322a, roughness: 0.3, clearcoat: 1 })];
  [-0.08, 0.1].forEach((dx, i) => {
    const b = new THREE.Group(); b.position.set(bx - 0.06 - i * 0.16, 1.0, 0); bikes.add(b);
    const fm = frameMats[i];
    for (const z of [-0.52, 0.52]) { const wh = mesh(new THREE.TorusGeometry(0.33, 0.025, 10, 40), tyre, b); wh.position.set(0, 0.33, z); wh.rotation.y = Math.PI / 2; rod(V(0, 0.33, z - 0.0), V(0, 0.33, z), 0.01, alu, b); }
    const P = { r: V(0, 0.33, -0.52), f: V(0, 0.33, 0.52), bb: V(0, 0.36, -0.08), seat: V(0, 0.95, -0.22), head: V(0, 0.9, 0.38), bar: V(0, 1.05, 0.33) };
    [[P.r, P.bb], [P.bb, P.seat], [P.seat, P.head], [P.bb, P.head], [P.r, P.seat], [P.head, P.f]].forEach(([a, c]) => rod(a, c, 0.018, fm, b));
    rod(P.head, P.bar, 0.015, alu, b); rod(V(0, 1.05, 0.33).setX(-0.22), V(0, 1.05, 0.33).setX(0.22), 0.012, plastic, b);
    const saddle = mesh(new RoundedBoxGeometry(0.1, 0.04, 0.24, 2, 0.02), plastic, b); saddle.position.set(0, 1.0, -0.24);
    void dx;
  });
}

/* ------------------------------ konfiguracja ------------------------------ */
const PAINTS = [
  { name: { pl: 'Biel kredowa', en: 'Chalk white' }, hex: '#e9e7e2', metal: 0.05, rough: 0.3 },
  { name: { pl: 'Szałwia', en: 'Sage' }, hex: '#8d9a86', metal: 0.2, rough: 0.35 },
  { name: { pl: 'Piasek', en: 'Sand' }, hex: '#c8b796', metal: 0.2, rough: 0.33 },
  { name: { pl: 'Błękit fiordu', en: 'Fjord blue' }, hex: '#4a6b82', metal: 0.4, rough: 0.3 },
  { name: { pl: 'Grafit', en: 'Graphite' }, hex: '#3b3f44', metal: 0.6, rough: 0.3 },
  { name: { pl: 'Terakota', en: 'Terracotta' }, hex: '#a65a3c', metal: 0.25, rough: 0.33 },
];
const LOWER = [
  { name: { pl: 'Bez pasa', en: 'Single colour' }, swatch: 'linear-gradient(135deg,#e9e7e2 50%,#e9e7e2 50%)', v: null },
  { name: { pl: 'Grafit', en: 'Graphite' }, swatch: '#2a2d31', v: '#2a2d31' },
  { name: { pl: 'Czerń', en: 'Black' }, swatch: '#0f1012', v: '#0f1012' },
  { name: { pl: 'Złamana biel', en: 'Off-white' }, swatch: '#e2ddd2', v: '#e2ddd2' },
];
function applyLower() { const sh = paint.userData.sh; if (sh) { sh.uniforms.uSplit.value = lower.split; sh.uniforms.uLower.value.copy(lower.color); } }
stage.onFrame(applyLower);
buildUI(stage, {
  title: { pl: 'Kamper Van', en: 'Camper Van' },
  subtitle: { pl: 'Konfigurator 3D', en: '3D configurator' },
  specs: [{ pl: 'Długość <b>5,93 m</b>', en: 'Length <b>5.93 m</b>' }, { pl: '4 miejsca do spania', en: 'Sleeps 4' }],
  groups: [
    { id: 'p', label: { pl: 'Kolor', en: 'Colour' }, items: PAINTS, apply: (c) => { paint.color.set(c.hex); paint.metalness = c.metal; paint.roughness = c.rough; } },
    { id: 'd', label: { pl: 'Dolny pas', en: 'Lower band' }, items: LOWER, default: 1, apply: (c) => { lower.split = c.v ? 0.98 : -1; if (c.v) lower.color.set(c.v); } },
  ],
  toggles: [
    { id: 'a', label: { pl: 'Markiza', en: 'Awning' }, value: true, apply: (on) => { awning.visible = on; } },
    { id: 's', label: { pl: 'Panele PV', en: 'Solar' }, value: true, apply: (on) => { solar.visible = on; } },
    { id: 'b', label: { pl: 'Rowery', en: 'Bikes' }, value: false, apply: (on) => { bikes.visible = on; } },
  ],
});
stage.start();
window.__demo = { stage };
