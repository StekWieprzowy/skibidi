import { THREE, createStage, outdoorEnvironment, canvasTexture, makeRand, mesh, rod, V, HQ } from '../common/stage.js';
import { buildUI } from '../common/ui.js';
import { RoundedBoxGeometry } from '../vendor/RoundedBoxGeometry.js';

/* Sauna ogrodowa typu beczka. Oś beczki = x, front (drzwi, zadaszony ganek) po stronie +x. */
const R = 1.05;          // promień zewnętrzny
const CY = R + 0.14;     // wysokość osi nad ziemią (na legarach)
const STAVE_T = 0.045;   // grubość klepki
const PORCH = 0.55;      // głębokość zadaszonego ganku

const stage = createStage({
  views: {
    iso:   { label: { pl: '3/4', en: '3/4' },        pos: V(5.6, 2.6, 6.2),  target: V(0, 1.0, 0) },
    front: { label: { pl: 'Front', en: 'Front' },    pos: V(7.5, 1.6, 0.4),  target: V(0, 1.1, 0) },
    side:  { label: { pl: 'Bok', en: 'Side' },       pos: V(0.01, 1.7, 8.5), target: V(0, 1.0, 0) },
    top:   { label: { pl: 'Góra', en: 'Top' },       pos: V(0.01, 9.5, 0.8), target: V(0, 0.6, 0) },
  },
  fov: 30, minDistance: 3, maxDistance: 18, exposure: 0.34,
});
const { scene, renderer } = stage;
const env = outdoorEnvironment(stage, { sunEl: 34, sunAz: 125, cloud: 0.42, grass: ['#384226', '#4d522c', '#6a603d'] });

/* ------------------------------ materiały ------------------------------ */
const woodTex = canvasTexture(renderer, 1024, (g, S) => {
  const rnd = makeRand(4);
  g.fillStyle = '#d9b48a'; g.fillRect(0, 0, S, S);
  for (let k = 0; k < 260; k++) {
    const y = rnd() * S, amp = rnd() * 6, f = 0.002 + rnd() * 0.01, p = rnd() * 6;
    g.strokeStyle = rnd() < 0.6 ? `rgba(120,70,30,${0.05 + rnd() * 0.12})` : `rgba(255,235,200,${0.05 + rnd() * 0.1})`;
    g.lineWidth = 0.6 + rnd() * 2.2;
    g.beginPath();
    for (let x = 0; x <= S; x += 24) { const yy = y + Math.sin(x * f + p) * amp; if (x === 0) g.moveTo(x, yy); else g.lineTo(x, yy); }
    g.stroke();
  }
  for (let k = 0; k < 7; k++) { // sęki
    const x = rnd() * S, y = rnd() * S, rx = 6 + rnd() * 10;
    const grd = g.createRadialGradient(x, y, 0, x, y, rx * 1.6);
    grd.addColorStop(0, 'rgba(70,35,12,.85)'); grd.addColorStop(0.5, 'rgba(110,60,25,.4)'); grd.addColorStop(1, 'rgba(110,60,25,0)');
    g.fillStyle = grd; g.beginPath(); g.ellipse(x, y, rx * 2.2, rx, 0, 0, Math.PI * 2); g.fill();
  }
});
const woodTexV = woodTex.clone(); // deski pionowe na ścianach czołowych
woodTexV.center.set(0.5, 0.5); woodTexV.rotation = Math.PI / 2; woodTexV.repeat.set(1, 6); woodTexV.needsUpdate = true;
const boardTex = canvasTexture(renderer, 512, (g, S) => {
  const rnd = makeRand(8), n = 8, w = S / n;
  for (let i = 0; i < n; i++) {
    g.fillStyle = `hsl(28, ${10 + rnd() * 8}%, ${44 + rnd() * 10}%)`; g.fillRect(0, i * w, S, w);
    for (let k = 0; k < 20; k++) { g.fillStyle = `rgba(40,30,20,${0.05 + rnd() * 0.08})`; g.fillRect(0, i * w + rnd() * w, S, 1); }
    g.fillStyle = 'rgba(20,15,10,.8)'; g.fillRect(0, i * w + w - 4, S, 4);
  }
});
const shingleTex = canvasTexture(renderer, 512, (g, S) => {
  const rnd = makeRand(12), rows = 10, h = S / rows, w = S / 6;
  g.fillStyle = '#222'; g.fillRect(0, 0, S, S);
  for (let r = 0; r < rows; r++) for (let c = -1; c < 7; c++) {
    const x = c * w + (r % 2) * w / 2, y = r * h;
    g.fillStyle = `hsl(0,0%,${14 + rnd() * 7}%)`;
    g.beginPath(); g.moveTo(x + 2, y); g.lineTo(x + w - 2, y); g.lineTo(x + w - 2, y + h * 0.7); g.lineTo(x + w / 2, y + h - 2); g.lineTo(x + 2, y + h * 0.7); g.closePath(); g.fill();
    for (let k = 0; k < 30; k++) { g.fillStyle = `rgba(255,255,255,${rnd() * 0.06})`; g.fillRect(x + rnd() * w, y + rnd() * h, 2, 2); }
  }
});

const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.78, color: 0xffffff });
const wallMat = new THREE.MeshStandardMaterial({ map: woodTexV, roughness: 0.78 });
const benchMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.7, color: 0xf2dcc0 });
const deckMat = new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.85 });
const steelMat = new THREE.MeshStandardMaterial({ color: 0x1c1d1f, metalness: 0.8, roughness: 0.4 });
const inoxMat = new THREE.MeshStandardMaterial({ color: 0xe4e6e8, metalness: 1, roughness: 0.22 });
const shingleMat = new THREE.MeshStandardMaterial({ map: shingleTex, roughness: 0.9, side: THREE.DoubleSide });
const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x3a2818, roughness: 0.03, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.6 });
const stoneMat = new THREE.MeshStandardMaterial({ color: 0x55585a, roughness: 0.9 });
const stoveMat = new THREE.MeshStandardMaterial({ color: 0x17181a, metalness: 0.6, roughness: 0.5 });
const glowMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffb36b, emissiveIntensity: 0 });

/* ------------------------------ budowa ------------------------------ */
const sauna = new THREE.Group();
scene.add(sauna);
const interiorLight = new THREE.PointLight(0xffa860, 0, 6, 1.6);
interiorLight.position.set(0, CY + 0.35, 0);
const state = { len: 3.0, wood: 0, front: 'door', stove: 'wood', roof: true, glow: false };

// taras pod sauną (stały)
const deck = mesh(new THREE.BoxGeometry(5.6, 0.08, 3.4), deckMat, scene);
deck.position.set(0.3, 0.04, 0);
{ const uv = deck.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * 2); }

function build() {
  sauna.clear();
  sauna.add(interiorLight);
  const L = state.len, x0 = -L / 2, x1 = L / 2, xWall = x1 - PORCH;
  const rnd = makeRand(31);

  // klepki: InstancedMesh z delikatną różnicą odcienia
  const N = 52;
  const sw = (2 * Math.PI * (R - STAVE_T / 2)) / N - 0.004;
  const staveGeo = new RoundedBoxGeometry(L, STAVE_T, sw, 2, 0.008);
  { const uv = staveGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L / 2.2, uv.getY(i) * 0.25 + 0.0); }
  const staves = new THREE.InstancedMesh(staveGeo, woodMat, N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    e.set(a, 0, 0); q.setFromEuler(e);
    m.compose(V(0, CY + Math.cos(a) * (R - STAVE_T / 2), Math.sin(a) * (R - STAVE_T / 2)), q, V(1, 1, 1));
    staves.setMatrixAt(i, m);
    const v = 0.88 + rnd() * 0.2;
    staves.setColorAt(i, col.setRGB(v, v * (0.97 + rnd() * 0.04), v * (0.94 + rnd() * 0.06)));
  }
  staves.castShadow = staves.receiveShadow = true;
  sauna.add(staves);

  // ściany czołowe z prawdziwymi otworami (Shape + holes)
  const rIn = R - STAVE_T + 0.002;
  const wallFromShape = (x, holes) => {
    const sh = new THREE.Shape();
    sh.absarc(0, 0, rIn, 0, Math.PI * 2, false);
    holes.forEach((h) => sh.holes.push(h));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false, curveSegments: 48 });
    g.rotateY(Math.PI / 2);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5 + 0.5, uv.getY(i) * 0.5 + 0.5);
    const w = mesh(g, wallMat, sauna);
    w.position.set(x - 0.025, CY, 0);
    return w;
  };
  const rectHole = (z0, z1, y0, y1) => { const p = new THREE.Path(); p.moveTo(z0, y0); p.lineTo(z1, y0); p.lineTo(z1, y1); p.lineTo(z0, y1); p.closePath(); return p; };
  const circHole = (z, y, r) => { const p = new THREE.Path(); p.absarc(z, y, r, 0, Math.PI * 2, true); return p; };
  // tył: okrągłe okienko
  wallFromShape(x0 + 0.06, [circHole(0, 0.25, 0.2)]);
  const rw = mesh(new THREE.CircleGeometry(0.2, 40), glassMat, sauna, { cast: false });
  rw.rotation.y = -Math.PI / 2; rw.position.set(x0 + 0.06, CY + 0.25, 0);
  const rwr = mesh(new THREE.TorusGeometry(0.2, 0.025, 10, 40), woodMat, sauna);
  rwr.rotation.y = Math.PI / 2; rwr.position.set(x0 + 0.03, CY + 0.25, 0);

  // ściana frontowa
  if (state.front === 'door') {
    const dw = 0.68, dh = 1.75, dy = -0.82; // względem osi
    wallFromShape(xWall, [rectHole(-dw / 2, dw / 2, dy, dy + dh), rectHole(-0.72, -0.5, -0.15, 0.45), rectHole(0.5, 0.72, -0.15, 0.45)]);
    const door = mesh(new THREE.BoxGeometry(0.02, dh, dw), glassMat, sauna, { cast: false });
    door.position.set(xWall, CY + dy + dh / 2, 0);
    const xf = xWall + 0.035;
    const fr = (a, b) => rod(a, b, 0.028, benchMat, sauna, 8);
    fr(V(xf, CY + dy, -dw / 2), V(xf, CY + dy + dh, -dw / 2)); fr(V(xf, CY + dy, dw / 2), V(xf, CY + dy + dh, dw / 2));
    fr(V(xf, CY + dy + dh, -dw / 2), V(xf, CY + dy + dh, dw / 2));
    const handle = mesh(new RoundedBoxGeometry(0.05, 0.42, 0.05, 2, 0.015), benchMat, sauna);
    handle.position.set(xf + 0.05, CY + dy + 1.0, dw / 2 - 0.1);
    for (const s of [-1, 1]) {
      const w = mesh(new THREE.BoxGeometry(0.02, 0.6, 0.22), glassMat, sauna, { cast: false });
      w.position.set(xWall, CY + 0.15, s * 0.61);
    }
  } else {
    // pełne przeszklenie z drzwiami w środku
    const rr = rIn - 0.01;
    const ring = mesh(new THREE.TorusGeometry(rr, 0.035, 12, 64), benchMat, sauna);
    ring.rotation.y = Math.PI / 2; ring.position.set(xWall, CY, 0);
    const gl = mesh(new THREE.CircleGeometry(rr, 64), glassMat, sauna, { cast: false });
    gl.rotation.y = Math.PI / 2; gl.position.set(xWall, CY, 0);
    const xf = xWall + 0.02;
    for (const z of [-0.36, 0.36]) { const h = Math.sqrt(rr * rr - z * z); rod(V(xf, CY - h, z), V(xf, CY + h, z), 0.025, benchMat, sauna, 8); }
    rod(V(xf, CY + 0.72, -0.36), V(xf, CY + 0.72, 0.36), 0.025, benchMat, sauna, 8);
    const handle = mesh(new RoundedBoxGeometry(0.05, 0.42, 0.05, 2, 0.015), benchMat, sauna);
    handle.position.set(xf + 0.06, CY, 0.26);
  }
  // podłoga ganku
  const porchFloor = mesh(new THREE.BoxGeometry(PORCH, 0.04, 2 * Math.sqrt(R * R - 0.85 * 0.85) * 0.98), benchMat, sauna);
  porchFloor.position.set(xWall + PORCH / 2, CY - 0.85, 0);

  // obręcze stalowe
  for (const x of [x0 + 0.25, x1 - 0.25, ...(L > 2.6 ? [0] : [])]) {
    const band = mesh(new THREE.TorusGeometry(R + 0.004, 0.012, 8, 96), steelMat, sauna);
    band.rotation.y = Math.PI / 2; band.position.set(x, CY, 0);
  }
  // legary
  for (const x of [x0 + 0.4, x1 - 0.4]) {
    const c = mesh(new THREE.BoxGeometry(0.14, 0.42, 1.7), benchMat, sauna);
    c.position.set(x, 0.08 + 0.21, 0);
  }

  // dach z gontu
  if (state.roof) {
    const arc = Math.PI * 0.62;
    const roof = mesh(new THREE.CylinderGeometry(R + 0.03, R + 0.03, L + 0.06, 64, 1, true, Math.PI / 2 - arc / 2, arc), shingleMat, sauna);
    roof.rotation.z = Math.PI / 2; roof.rotation.y = 0; roof.position.set(0, CY, 0);
    roof.rotation.x = 0;
    { const uv = roof.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * L * 1.6); }
    // kalenica
    rod(V(x0 - 0.03, CY + R + 0.04, 0), V(x1 + 0.03, CY + R + 0.04, 0), 0.03, steelMat, sauna, 10);
  }

  // wnętrze: ławki dwupoziomowe + piec
  const wIn = R - STAVE_T;
  for (const [h, d] of [[-0.35, 0.55], [0.1, 0.45]]) {
    const y = CY + h, zMax = Math.sqrt(wIn * wIn - h * h) - 0.02;
    const bench = mesh(new THREE.BoxGeometry(xWall - x0 - 0.6, 0.05, d), benchMat, sauna);
    bench.position.set((x0 + 0.3 + xWall - 0.3) / 2, y, -zMax + d / 2 + 0.02);
    const bench2 = bench.clone(); bench2.position.z *= -1; sauna.add(bench2);
  }
  const inFloor = mesh(new THREE.BoxGeometry(xWall - x0 - 0.1, 0.04, 1.2), benchMat, sauna);
  inFloor.position.set((x0 + xWall) / 2, CY - 0.82, 0);
  if (state.stove === 'wood') {
    const stove = mesh(new RoundedBoxGeometry(0.42, 0.75, 0.42, 3, 0.03), stoveMat, sauna);
    stove.position.set(x0 + 0.42, CY - 0.82 + 0.37, 0);
    const fire = mesh(new THREE.PlaneGeometry(0.24, 0.18), glowMat, sauna, { cast: false });
    fire.rotation.y = Math.PI / 2; fire.position.set(x0 + 0.635, CY - 0.6, 0);
    // komin ze stali nierdzewnej przez dach
    const cx = x0 + 0.42, top = CY + R + 0.75;
    rod(V(cx, CY - 0.1, 0), V(cx, top, 0), 0.075, inoxMat, sauna, 24);
    const cap = mesh(new THREE.ConeGeometry(0.16, 0.12, 24), inoxMat, sauna);
    cap.position.set(cx, top + 0.12, 0);
    rod(V(cx, top, 0), V(cx, top + 0.07, 0), 0.08, inoxMat, sauna, 24);
  } else {
    const stove = mesh(new RoundedBoxGeometry(0.4, 0.6, 0.3, 3, 0.02), inoxMat, sauna);
    stove.position.set(x0 + 0.38, CY - 0.5, 0);
  }
  // kamienie na piecu
  for (let i = 0; i < 9; i++) {
    const s = mesh(new THREE.IcosahedronGeometry(0.05 + rnd() * 0.03, 1), stoneMat, sauna);
    s.position.set(x0 + 0.32 + rnd() * 0.2, CY - (state.stove === 'wood' ? 0.06 : 0.17), -0.12 + rnd() * 0.24);
  }
  applyWood();
  applyGlow();
}

const WOODS = [
  { name: { pl: 'Świerk naturalny', en: 'Natural spruce' }, hex: '#c9995f', tint: 0xffffff, swatch: '#c9995f' },
  { name: { pl: 'Thermo', en: 'Thermowood' }, hex: '#7b4a2a', tint: 0x9a6a48, swatch: '#7b4a2a' },
  { name: { pl: 'Grafit', en: 'Graphite' }, hex: '#2b2825', tint: 0x3a3836, swatch: '#2b2825' },
  { name: { pl: 'Szara patyna', en: 'Silver patina' }, hex: '#9c968c', tint: 0xb9b6b0, swatch: '#9c968c' },
];
function applyWood() {
  const w = WOODS[state.wood];
  woodMat.color.set(w.tint); wallMat.color.set(w.tint);
}
function applyGlow() {
  interiorLight.intensity = state.glow ? 9 : 0;
  glowMat.emissiveIntensity = state.glow ? 6 : 0.4;
  glassMat.emissive = new THREE.Color(state.glow ? 0x3a1e08 : 0x000000);
}

build();
buildUI(stage, {
  title: { pl: 'Sauna Beczka', en: 'Barrel Sauna' },
  subtitle: { pl: 'Konfigurator 3D', en: '3D configurator' },
  specs: [{ pl: 'Średnica <b>2,1 m</b>', en: 'Diameter <b>2.1 m</b>' }, { pl: 'Ganek zadaszony · do 6 osób', en: 'Covered porch · up to 6 people' }],
  groups: [
    { id: 'w', label: { pl: 'Drewno', en: 'Wood' }, items: WOODS, apply: (it, i) => { state.wood = i; applyWood(); } },
    { id: 'l', label: { pl: 'Długość', en: 'Length' }, default: 2,
      items: [2.0, 2.5, 3.0, 4.0].map((l, i) => ({ name: { pl: `${String(l).replace('.', ',')} m`, en: `${l} m` }, swatch: ['#d6d6d6', '#bdbdbd', '#a3a3a3', '#8a8a8a'][i], len: l })),
      apply: (it) => { if (state.len !== it.len) { state.len = it.len; build(); } } },
    { id: 'f', label: { pl: 'Front', en: 'Front' },
      items: [{ name: { pl: 'Drzwi szklane', en: 'Glass door' }, swatch: '#6d5a48', v: 'door' }, { name: { pl: 'Pełne przeszklenie', en: 'Full glass' }, swatch: '#3d2a1c', v: 'glass' }],
      apply: (it) => { if (state.front !== it.v) { state.front = it.v; build(); } } },
    { id: 's', label: { pl: 'Piec', en: 'Heater' },
      items: [{ name: { pl: 'Opalany drewnem', en: 'Wood-fired' }, swatch: '#1b1b1d', v: 'wood' }, { name: { pl: 'Elektryczny', en: 'Electric' }, swatch: '#d9dcdf', v: 'electric' }],
      apply: (it) => { if (state.stove !== it.v) { state.stove = it.v; build(); } } },
  ],
  toggles: [
    { id: 'r', label: { pl: 'Gont', en: 'Shingles' }, value: true, apply: (on) => { if (state.roof !== on) { state.roof = on; build(); } } },
    { id: 'g', label: { pl: 'Podświetlenie', en: 'Interior light' }, value: false, apply: (on) => { state.glow = on; applyGlow(); } },
  ],
});
stage.start();
window.__demo = { stage, state };
void HQ; void env;
