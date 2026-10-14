import { THREE, createStage, studioEnvironment, flakeTexture, gridGeometry, mesh, rod, tube, V, lerp, smooth, clamp } from '../common/stage.js';
import { buildUI } from '../common/ui.js';
import { RoundedBoxGeometry } from '../vendor/RoundedBoxGeometry.js';

/* Sportowe GT (bez marki). Układ: x — przód +x, y — góra, z — prawa strona. */
const AX_F = 1.38, AX_R = -1.37, WR = 0.345, TRACK = 0.81, ARCH = 0.405;

const stage = createStage({
  views: {
    iso:   { label: { pl: '3/4', en: '3/4' },       pos: V(5.4, 1.6, 5.2),   target: V(0.1, 0.55, 0) },
    side:  { label: { pl: 'Bok', en: 'Side' },      pos: V(0.01, 1.0, 9.5),  target: V(0, 0.55, 0) },
    front: { label: { pl: 'Przód', en: 'Front' },   pos: V(7.2, 1.0, 1.2),   target: V(0, 0.55, 0) },
    rear:  { label: { pl: 'Tył', en: 'Rear' },      pos: V(-6.4, 1.5, -3.2), target: V(0, 0.55, 0) },
    top:   { label: { pl: 'Góra', en: 'Top' },      pos: V(0.01, 9.5, 0.6),  target: V(0, 0.2, 0) },
  },
  fov: 30, minDistance: 3.2, maxDistance: 16, exposure: 1.0, maxPolar: 0.48,
});
const { scene } = stage;
studioEnvironment(stage, { floor: '#3b3e43', bg: '#4a4e54', reflect: 0.22, radius: 6 });

/* --------------------------- profile nadwozia --------------------------- */
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
const X0 = -2.32, X1 = 2.32;
const halfW = lookup([[X0, 0.7], [-2.24, 0.86], [-2.0, 0.93], [-1.4, 0.955], [-0.6, 0.93], [0.4, 0.92], [1.3, 0.935], [1.95, 0.89], [2.2, 0.8], [2.29, 0.66], [X1, 0.52]]);
const topY = lookup([[X0, 0.66], [-2.27, 0.8], [-2.05, 0.86], [-1.5, 0.87], [-0.6, 0.85], [0.4, 0.83], [0.9, 0.79], [1.6, 0.7], [2.1, 0.63], [2.27, 0.57], [X1, 0.46]]);
const botBase = lookup([[X0, 0.3], [-2.2, 0.2], [-1.9, 0.15], [1.9, 0.14], [2.2, 0.17], [X1, 0.24]]);
function botY(x) {
  let y = botBase(x);
  for (const ax of [AX_F, AX_R]) {
    const d = Math.abs(x - ax);
    if (d < ARCH) y = Math.max(y, WR + Math.sqrt(ARCH * ARCH - d * d));
  }
  return Math.min(y, topY(x) - 0.06);
}
// przekrój: superelipsa, płaskie dno, z delikatnym przetłoczeniem na boku
function bodyPoint(x, th) {
  const W = halfW(x), yt = topY(x), yb = botY(x);
  const yc = lerp(yb, yt, 0.42), Hup = yt - yc, Hdn = yc - yb;
  const c = Math.cos(th), s = Math.sin(th);
  const nz = 5.0, nup = 3.0, ndn = 7;
  let z = W * Math.sign(c) * Math.pow(Math.abs(c), 2 / nz) * (1 - 0.07 * Math.pow(Math.max(0, s), 1.5));
  const y = s >= 0 ? yc + Hup * Math.pow(s, 2 / nup) : yc - Hdn * Math.pow(-s, 2 / ndn);
  // linia charakteru (przetłoczenie) na wysokości ~0.74
  z += Math.sign(c) * 0.01 * Math.exp(-Math.pow((y - 0.66) / 0.03, 2)) * smooth(-2.1, -1.6, x) * (1 - smooth(1.7, 2.1, x));
  // tylne "biodra" nad kołem
  z += Math.sign(c) * 0.02 * Math.exp(-Math.pow((x - AX_R) / 0.55, 2)) * Math.exp(-Math.pow((y - 0.68) / 0.16, 2));
  return [x, y, z];
}
const NU = 220, NV = 96;
const xs = (a) => lerp(X0, X1, a);
const bodyGeo = gridGeometry(NU, NV, (a, b) => bodyPoint(xs(a), -Math.PI / 2 + b * Math.PI * 2), (p) => [p[0] * 2, (p[1] + Math.abs(p[2])) * 2]);

/* --------------------------- materiały --------------------------- */
const paint = new THREE.MeshPhysicalMaterial({ color: 0x8a1c1c, metalness: 0.5, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.02,
  normalMap: flakeTexture(), normalScale: new THREE.Vector2(0.15, 0.15), side: THREE.DoubleSide });
const roofBlack = new THREE.MeshPhysicalMaterial({ color: 0x0b0c0e, metalness: 0.2, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03, side: THREE.DoubleSide });
const glass = new THREE.MeshPhysicalMaterial({ color: 0x050607, metalness: 0, roughness: 0.04, envMapIntensity: 0.9, side: THREE.DoubleSide });
const trim = new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 0.55, side: THREE.DoubleSide });
const gloss = new THREE.MeshPhysicalMaterial({ color: 0x0a0b0c, roughness: 0.15, clearcoat: 1, side: THREE.DoubleSide });
const chrome = new THREE.MeshStandardMaterial({ color: 0xf0f2f4, metalness: 1, roughness: 0.1 });
const tyre = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.85 });
const rimMat = new THREE.MeshPhysicalMaterial({ color: 0xc8ccd0, metalness: 1, roughness: 0.22, clearcoat: 0.6 });
const discMat = new THREE.MeshStandardMaterial({ color: 0x6a6d70, metalness: 0.9, roughness: 0.45 });
const caliperMat = new THREE.MeshPhysicalMaterial({ color: 0xc81e1e, roughness: 0.35, clearcoat: 1 });
const ledMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeaf4ff, emissiveIntensity: 6 });
const tailMat = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff0804, emissiveIntensity: 3 });
const lensMat = new THREE.MeshPhysicalMaterial({ color: 0x111317, roughness: 0.05, metalness: 0.2, clearcoat: 1 });

const car = new THREE.Group();
scene.add(car);
mesh(bodyGeo, paint, car);

// zamknięcie przodu i tyłu nadwozia
for (const x of [X0, X1]) {
  const pts = []; for (let i = 0; i <= NV; i++) pts.push(bodyPoint(x, -Math.PI / 2 + (i / NV) * Math.PI * 2));
  const pos = [x, (topY(x) + botY(x)) / 2, 0], idx = [];
  pts.forEach((p) => pos.push(...p));
  for (let i = 1; i <= NV; i++) idx.push(0, i, i + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(x > 0 ? idx : idx.map((v, k) => (k % 3 === 1 ? idx[k + 1] : k % 3 === 2 ? idx[k - 1] : v)));
  g.computeVertexNormals();
  mesh(g, paint, car);
}

/* --------------------------- kabina (szyby + dach) --------------------------- */
const GX0 = -1.42, GX1 = 0.8;
const roofY = lookup([[GX0, 0.0], [-1.05, 0.2], [-0.6, 0.39], [-0.2, 0.46], [0.1, 0.45], [0.42, 0.28], [GX1, 0.0]]);
function cabinPoint(x, b, out = 0) {
  const base = topY(x) - 0.015, h = Math.max(0, roofY(x));
  const Wb = halfW(x) - 0.1, Wt = Wb - 0.2;
  const th = b * Math.PI, c = Math.cos(th), s = Math.sin(th);
  const k = Math.pow(Math.abs(s), 2 / 3.2);
  const W = lerp(Wb, Wt, k);
  return [x, base + (h + out) * k + out * 0.2, (W + out) * Math.sign(c) * Math.pow(Math.abs(c), 2 / 3.2)];
}
mesh(gridGeometry(120, 48, (a, b) => cabinPoint(lerp(GX0, GX1, a), b)), glass, car);
// dach (w kolorze nadwozia lub czarny) — środkowa część kabiny
const roof = mesh(gridGeometry(80, 30, (a, b) => cabinPoint(lerp(-0.72, 0.14, a), lerp(0.2, 0.8, b), 0.004)), paint, car);
// słupki A i C oraz listwa wokół szyb bocznych
for (const sd of [0.2, 0.8]) {
  const line = []; for (let i = 0; i <= 40; i++) line.push(V(...cabinPoint(lerp(GX0 + 0.05, GX1 - 0.04, i / 40), sd, 0.004)));
  tube(line, 0.012, gloss, car, 120);
}
for (const b of [0.03, 0.97]) {
  const line = []; for (let i = 0; i <= 40; i++) line.push(V(...cabinPoint(lerp(GX0 + 0.02, GX1 - 0.02, i / 40), b, 0.002)));
  tube(line, 0.008, chrome, car, 120);
}

/* --------------------------- detale nadwozia --------------------------- */
const onBody = (x, y, side, out = 0.004) => {
  // znajdź z na powierzchni dla (x,y) po stronie side
  let best = null, bd = 1e9;
  for (let i = 0; i <= 200; i++) {
    const th = -Math.PI / 2 + (i / 200) * Math.PI; // prawa połowa
    const p = bodyPoint(x, th);
    const d = Math.abs(p[1] - y);
    if (d < bd) { bd = d; best = p; }
  }
  return V(x, y, side * (Math.abs(best[2]) + out));
};
// reflektory LED (wąskie paski) i soczewki
for (const sd of [-1, 1]) {
  const pts = []; for (let i = 0; i <= 16; i++) { const x = lerp(1.88, 2.24, i / 16); pts.push(onBody(x, lerp(0.62, 0.53, i / 16), sd, 0.003)); }
  tube(pts, 0.009, ledMat, car, 40);
  const lens = []; for (let i = 0; i <= 16; i++) { const x = lerp(1.9, 2.22, i / 16); lens.push(onBody(x, lerp(0.585, 0.5, i / 16), sd, 0.002)); }
  tube(lens, 0.024, lensMat, car, 40);
}
// tylna listwa świetlna przez całą szerokość
{
  const pts = []; const x = -2.245;
  for (let i = 0; i <= 40; i++) { const b = i / 40; const p = bodyPoint(x, lerp(-0.42, 0.42, b) + 0); pts.push(V(p[0] - 0.005, 0.8, p[2])); }
  const pts2 = []; for (let i = 0; i <= 40; i++) { const z = lerp(-0.6, 0.6, i / 40); pts2.push(V(X0 - 0.006, 0.575, z)); }
  tube(pts2, 0.012, tailMat, car, 80);
  void pts;
}
// grill i dyfuzor
{
  // wlot powietrza: ciemna elipsa wpuszczona w czoło nadwozia
  {
    const pts = []; for (let i = 0; i <= NV; i++) pts.push(bodyPoint(X1, -Math.PI / 2 + (i / NV) * Math.PI * 2));
    const cy = (topY(X1) + botY(X1)) / 2 - 0.01;
    const pos = [X1 + 0.004, cy, 0], idx = [];
    pts.forEach((p) => pos.push(X1 + 0.004, cy + (p[1] - cy) * 0.72, p[2] * 0.8));
    for (let i = 1; i <= NV; i++) idx.push(0, i, i + 1);
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    gg.setIndex(idx); gg.computeVertexNormals();
    mesh(gg, gloss, car);
  }
  const d = mesh(new THREE.BoxGeometry(0.25, 0.08, 1.4), trim, car); d.position.set(X0 + 0.15, 0.24, 0);
  for (const z of [-0.45, 0.45]) {
    const ex = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.12, 24, 1, true), chrome, car);
    ex.rotation.z = Math.PI / 2; ex.position.set(X0 + 0.02, 0.28, z);
  }
}
// progi (czarne), lusterka, klamki, linie drzwi
for (const sd of [-1, 1]) {
  const sill = []; for (let i = 0; i <= 30; i++) { const x = lerp(AX_R + ARCH + 0.02, AX_F - ARCH - 0.02, i / 30); sill.push(onBody(x, 0.22, sd, 0.0)); }
  tube(sill, 0.03, gloss, car, 60);
  const mirror = mesh(new RoundedBoxGeometry(0.2, 0.1, 0.16, 3, 0.04), paint, car);
  mirror.position.set(0.52, 0.9, sd * (halfW(0.52) - 0.02));
  rod(V(0.6, 0.86, sd * (halfW(0.6) - 0.1)), V(0.55, 0.89, sd * (halfW(0.52) - 0.08)), 0.015, gloss, car);
  const handle = mesh(new RoundedBoxGeometry(0.16, 0.025, 0.02, 2, 0.008), gloss, car);
  handle.position.copy(onBody(-0.35, 0.72, sd, 0.006));
  for (const x of [0.62, -0.72]) {
    const seam = []; for (let i = 0; i <= 12; i++) { const y = lerp(0.28, 0.84, i / 12); seam.push(onBody(x + (y - 0.3) * (x > 0 ? -0.05 : 0.08), y, sd, 0.001)); }
    tube(seam, 0.0035, trim, car, 24);
  }
}

/* --------------------------- koła --------------------------- */
// osłony nadkoli (czarne)
for (const ax of [AX_F, AX_R]) {
  const liner = mesh(new THREE.CylinderGeometry(ARCH - 0.005, ARCH - 0.005, 1.8, 40, 1, true, -Math.PI / 2, Math.PI), trim, car, { cast: false });
  liner.rotation.x = -Math.PI / 2; liner.position.set(ax, WR, 0);
  liner.material = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1, side: THREE.BackSide });
}
const tyreGeo = (() => {
  const pts = [];
  const r0 = 0.252, r1 = WR, w = 0.13;
  pts.push(new THREE.Vector2(r0, -w * 0.92));
  for (let i = 0; i <= 12; i++) { const a = -Math.PI / 2 + (i / 12) * Math.PI; pts.push(new THREE.Vector2(r1 - 0.045 + Math.cos(a) * 0.045, Math.sin(a) * w)); }
  pts.push(new THREE.Vector2(r0, w * 0.92));
  const g = new THREE.LatheGeometry(pts, 72);
  g.rotateX(Math.PI / 2);
  return g;
})();
const wheels = [];
const spokeGeo = new RoundedBoxGeometry(0.2, 0.034, 0.028, 2, 0.01);
for (const ax of [AX_F, AX_R]) for (const sd of [-1, 1]) {
  const w = new THREE.Group();
  w.position.set(ax, WR, sd * TRACK);
  car.add(w);
  const tyreM = mesh(tyreGeo, tyre, w);
  void tyreM;
  // felga: rant, szprychy (5 podwójnych), piasta
  const lip = mesh(new THREE.TorusGeometry(0.243, 0.012, 10, 72), rimMat, w);
  lip.position.z = sd * 0.1;
  const barrel = mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.2, 48, 1, true), new THREE.MeshStandardMaterial({ color: 0x2a2c2e, metalness: 0.8, roughness: 0.4, side: THREE.DoubleSide }), w);
  barrel.rotation.x = Math.PI / 2;
  const face = new THREE.Group(); face.position.z = sd * 0.085; w.add(face);
  for (let k = 0; k < 10; k++) {
    const a = (k / 5) * Math.PI + (k % 2 ? 0.16 : -0.16) + Math.floor(k / 2) * 0;
    const ang = Math.floor(k / 2) * (Math.PI * 2 / 5) + (k % 2 ? 0.13 : -0.13);
    const sp = mesh(spokeGeo, rimMat, face);
    sp.position.set(Math.cos(ang) * 0.135, Math.sin(ang) * 0.135, 0);
    sp.rotation.z = ang;
    void a;
  }
  const hub = mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.04, 32), rimMat, face);
  hub.rotation.x = Math.PI / 2;
  const cap = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.045, 24), gloss, face);
  cap.rotation.x = Math.PI / 2;
  // tarcza i zacisk
  const disc = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 48), discMat, w);
  disc.rotation.x = Math.PI / 2; disc.position.z = sd * 0.03;
  const cal = mesh(new RoundedBoxGeometry(0.1, 0.16, 0.06, 2, 0.02), caliperMat, w);
  cal.position.set(ax > 0 ? -0.15 : 0.15, 0.05, sd * 0.05);
  wheels.push(w);
}

/* --------------------------- konfiguracja --------------------------- */
const PAINTS = [
  { name: { pl: 'Czerwień Rosso', en: 'Rosso red' }, hex: '#8f1515', metal: 0.45, rough: 0.32 },
  { name: { pl: 'Grafit metalik', en: 'Graphite metallic' }, hex: '#3a3d42', metal: 0.7, rough: 0.3 },
  { name: { pl: 'Biel perłowa', en: 'Pearl white' }, hex: '#e8e6e1', metal: 0.15, rough: 0.25 },
  { name: { pl: 'Czerń', en: 'Black' }, hex: '#0b0c0e', metal: 0.3, rough: 0.2 },
  { name: { pl: 'Zieleń brytyjska', en: 'British green' }, hex: '#123a2c', metal: 0.5, rough: 0.3 },
  { name: { pl: 'Błękit nocy', en: 'Midnight blue' }, hex: '#13284a', metal: 0.55, rough: 0.3 },
  { name: { pl: 'Srebro', en: 'Silver' }, hex: '#a8adb2', metal: 0.8, rough: 0.28 },
  { name: { pl: 'Pomarańcz', en: 'Orange' }, hex: '#d0561a', metal: 0.3, rough: 0.28 },
];
const RIMS = [
  { name: { pl: 'Srebrne', en: 'Silver' }, hex: '#c8ccd0', metal: 1, rough: 0.22 },
  { name: { pl: 'Grafitowe', en: 'Graphite' }, hex: '#3b3e42', metal: 0.9, rough: 0.3 },
  { name: { pl: 'Czarne', en: 'Black' }, hex: '#121314', metal: 0.4, rough: 0.25 },
  { name: { pl: 'Brąz', en: 'Bronze' }, hex: '#7a5a38', metal: 1, rough: 0.3 },
];
const CALIPERS = [
  { name: { pl: 'Czerwone', en: 'Red' }, hex: '#c81e1e' },
  { name: { pl: 'Żółte', en: 'Yellow' }, hex: '#e8b416' },
  { name: { pl: 'Niebieskie', en: 'Blue' }, hex: '#1d4fb8' },
  { name: { pl: 'Czarne', en: 'Black' }, hex: '#15161a' },
];
buildUI(stage, {
  title: { pl: 'GT Coupé', en: 'GT Coupé' },
  subtitle: { pl: 'Konfigurator 3D', en: '3D configurator' },
  specs: [{ pl: 'Długość <b>4,64 m</b>', en: 'Length <b>4.64 m</b>' }, { pl: 'Felgi 20"', en: '20" wheels' }],
  groups: [
    { id: 'p', label: { pl: 'Lakier', en: 'Paint' }, items: PAINTS, apply: (c) => { paint.color.set(c.hex); paint.metalness = c.metal; paint.roughness = c.rough; } },
    { id: 'r', label: { pl: 'Felgi', en: 'Wheels' }, items: RIMS, apply: (c) => { rimMat.color.set(c.hex); rimMat.metalness = c.metal; rimMat.roughness = c.rough; } },
    { id: 'c', label: { pl: 'Zaciski', en: 'Calipers' }, items: CALIPERS, apply: (c) => caliperMat.color.set(c.hex) },
  ],
  toggles: [
    { id: 'b', label: { pl: 'Czarny dach', en: 'Black roof' }, value: false, apply: (on) => { roof.material = on ? roofBlack : paint; } },
    { id: 'l', label: { pl: 'Światła', en: 'Lights' }, value: true, apply: (on) => { ledMat.emissiveIntensity = on ? 6 : 0; tailMat.emissiveIntensity = on ? 3 : 0.2; } },
  ],
});
stage.start();
window.__demo = { stage };
void clamp; void wheels;
