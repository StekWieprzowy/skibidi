import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';
import { Reflector } from './vendor/Reflector.js';

/* ==================================================================== *
 *  Kształt kadłuba.  Układ: x — od pawęży (0) do dziobu (LH), y — w górę
 *  (0 = linia wody), z — w prawo (prawa burta). s = x / LH.
 *  Proporcje wzięte z rysunku bocznego i planu pokładu (LOA 8,35 m,
 *  LH 8,21 m, szerokość 2,5 m).
 * ==================================================================== */
const LH = 8.21;    // długość kadłuba
const PLAT = 0.14;  // platforma rufowa wystająca za pawęż (LOA = LH + PLAT)
const FLOOR = 0.30; // podłoga kokpitu
const CK_A = 0.315, CK_B = 0.655; // kokpit (od-do, w s)
const SIDE = 0.36;  // szerokość pokładów bocznych przy kokpicie
const WOOD_FROM = 0.505; // od tej stacji pokład jest mahoniowy

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function lookup1D(pts) {
  const curve = new THREE.SplineCurve(pts.map(([a, b]) => new THREE.Vector2(a, b)));
  const P = curve.getPoints(900);
  return (x) => {
    if (x <= P[0].x) return P[0].y;
    if (x >= P[P.length - 1].x) return P[P.length - 1].y;
    let lo = 0, hi = P.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m].x <= x) lo = m; else hi = m; }
    const a = P[lo], b = P[hi];
    return a.y + (b.y - a.y) * (x - a.x) / Math.max(1e-9, b.x - a.x);
  };
}

// połowa szerokości (plan pokładu)
const beamRaw = lookup1D([[0, 1.13], [0.08, 1.21], [0.25, 1.25], [0.45, 1.25], [0.62, 1.19], [0.75, 1.08],
  [0.85, 0.92], [0.92, 0.68], [0.96, 0.44], [0.99, 0.16], [1, 0]]);
// linia pokładu (sheer)
const sheerRaw = lookup1D([[0, 0.74], [0.25, 0.8], [0.5, 0.86], [0.75, 0.92], [0.92, 0.97], [1, 1.0]]);
// linia stępki i dziobnicy
const keelY = lookup1D([[0, -0.36], [0.2, -0.44], [0.5, -0.46], [0.68, -0.4], [0.8, -0.26], [0.9, -0.02],
  [0.95, 0.38], [0.985, 0.78], [1, 0.97]]);

function halfBeam(s) {
  const x = s * LH, R = 0.32; // zaokrąglone narożniki rufy (w planie)
  let b = beamRaw(s);
  if (x < R) b -= R - Math.sqrt(R * R - (R - x) * (R - x));
  return Math.max(0, b);
}
function sheer(s) {
  const x = s * LH, R = 0.2; // zaokrąglona krawędź pawęży (w profilu)
  let y = sheerRaw(s);
  if (x < R) y -= R - Math.sqrt(R * R - (R - x) * (R - x));
  return y;
}
const crown = (s) => 0.025 + 0.045 * smooth(0.5, 0.85, s);
function deckSurfY(s, z, b = halfBeam(s)) {
  const q = b > 1e-5 ? z / b : 0;
  return sheer(s) + crown(s) * (1 - q * q);
}
function cockpitW(s) {
  if (s <= CK_A || s >= CK_B) return 0;
  const q = Math.abs(2 * (s - (CK_A + CK_B) / 2) / (CK_B - CK_A));
  return Math.max(0, halfBeam(s) - SIDE) * Math.pow(1 - Math.pow(q, 5), 0.2);
}

// przekrój poprzeczny dna i burty (z/b, wysokość względna) — od stępki do krawędzi
const PROF = new THREE.SplineCurve([
  new THREE.Vector2(0, 0), new THREE.Vector2(0.3, 0.08), new THREE.Vector2(0.62, 0.17), new THREE.Vector2(0.8, 0.24),
  new THREE.Vector2(0.87, 0.3), new THREE.Vector2(0.935, 0.45), new THREE.Vector2(0.98, 0.7), new THREE.Vector2(1, 1),
]).getSpacedPoints(240);
function profAt(t) {
  const f = clamp(t, 0, 1) * (PROF.length - 1), i = Math.min(PROF.length - 2, Math.floor(f)), k = f - i;
  return [lerp(PROF[i].x, PROF[i + 1].x, k), lerp(PROF[i].y, PROF[i + 1].y, k)];
}

/* Jedna ciągła powierzchnia: dno → burta → zaokrąglenie → pokład → krawędź kokpitu → ścianka kokpitu */
const U1 = 0.5, U2 = 0.6, U3 = 0.86;
function section(s) {
  s = clamp(s, 0, 1);
  const b = halfBeam(s), yd = sheer(s);
  const yk = Math.min(keelY(s), yd - 0.001);
  const r = Math.max(0, Math.min(0.08, b * 0.45, (yd - yk) * 0.35));
  const win = cockpitW(s);
  return { s, x: s * LH, b, yk, r, yfe: deckSurfY(s, b - r, b), win, rl: 0.035 * smooth(0, 0.1, win) };
}
function sectionPoint(S, u) {
  const { x, b, yk, r, yfe, win, rl } = S;
  if (u <= U1) { const [pz, py] = profAt(u / U1); return [x, yk + (yfe - r - yk) * py, b * pz]; }
  if (u <= U2) { const th = (u - U1) / (U2 - U1) * Math.PI / 2; return [x, yfe - r + r * Math.sin(th), b - r + r * Math.cos(th)]; }
  if (u <= U3) { const z = lerp(b - r, win, (u - U2) / (U3 - U2)); return [x, deckSurfY(S.s, z, b), z]; }
  const t = (u - U3) / (1 - U3), yIn = deckSurfY(S.s, win, b);
  if (t < 0.4) { const th = Math.PI / 2 + (t / 0.4) * Math.PI / 2; return [x, yIn - rl + rl * Math.sin(th), win + rl * Math.cos(th)]; }
  const bottom = win > 1e-4 ? FLOOR : yIn - rl;
  return [x, lerp(yIn - rl, bottom, (t - 0.4) / 0.6), win - rl];
}
// połowa szerokości kadłuba na wysokości y (zewnętrzna powierzchnia)
function widthAt(s, y) {
  const S = section(s);
  let prev = sectionPoint(S, 0);
  for (let i = 1; i <= 60; i++) {
    const p = sectionPoint(S, (i / 60) * U2);
    if (p[1] >= y) { const k = (y - prev[1]) / Math.max(1e-6, p[1] - prev[1]); return lerp(prev[2], p[2], clamp(k, 0, 1)); }
    prev = p;
  }
  return prev[2];
}

// siatki parametrów
const STATIONS = (() => {
  const set = new Set();
  for (let i = 0; i <= 340; i++) set.add(+(i / 340).toFixed(6));
  [CK_A, CK_B, WOOD_FROM].forEach((v) => set.add(v));
  for (let k = 1; k <= 4; k++) { set.add(+(CK_A + 0.0008 * k).toFixed(6)); set.add(+(CK_B - 0.0008 * k).toFixed(6)); }
  return [...set].sort((a, b) => a - b);
})();
const US = (() => {
  const out = [];
  const seg = (a, b, n) => { for (let i = 0; i < n; i++) out.push(a + (b - a) * i / n); };
  seg(0, U1, 30); seg(U1, U2, 10); seg(U2, U3, 16);
  seg(U3, U3 + (1 - U3) * 0.4, 6); seg(U3 + (1 - U3) * 0.4, 1, 2);
  out.push(1);
  return out;
})();

/* ==================================================================== *
 *  Renderer, scena, kamera
 * ==================================================================== */
const canvas = document.getElementById('scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
} catch (e) {
  document.getElementById('error').style.display = 'grid';
  document.getElementById('loader').remove();
  throw e;
}
const DPR = Math.min(window.devicePixelRatio, 2);
renderer.setPixelRatio(DPR);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.setClearColor(0xd4e2ea);
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 6000);

const NARROW = window.innerWidth / window.innerHeight < 0.8;
const VIEWS = {
  iso:     { label: '3/4',    pos: V(6.6, 2.7, 7.4),     target: V(0, 0.55, 0) },
  side:    { label: 'Bok',    pos: V(0.01, 1.2, 14.5),   target: V(0, 0.55, 0) },
  top:     { label: 'Góra',   pos: V(0.01, 15.5, 0.6),   target: V(0, 0.2, 0) },
  rear:    { label: 'Rufa',   pos: V(-11.5, 2.5, 4.2),   target: V(0, 0.55, 0) },
  cockpit: { label: 'Kokpit', pos: V(-3.6, 3.4, 0.001),  target: V(1.3, 0.55, 0) },
};
if (NARROW) Object.values(VIEWS).forEach((v) => v.pos.sub(v.target).multiplyScalar(1.85).add(v.target));
camera.position.copy(VIEWS.iso.pos);

const controls = new OrbitControls(camera, canvas);
controls.target.copy(VIEWS.iso.target);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.enablePan = false;
controls.minDistance = 3.5;
controls.maxDistance = NARROW ? 40 : 28;
controls.maxPolarAngle = Math.PI * 0.49;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.7;

/* ==================================================================== *
 *  Niebo (z chmurami) + mapa otoczenia do odbić
 * ==================================================================== */
const SUN_DIR = V(0.5, 0.42, 0.62).normalize();
const C_HORIZON = new THREE.Color('#dbe7ee');
const C_ZENITH = new THREE.Color('#3f7fb8');
const C_DEEP = new THREE.Color('#0d2a3d');
const C_SHALLOW = new THREE.Color('#2a6e83');

const skyChunk = /* glsl */`
  uniform vec3 uSun; uniform vec3 uHorizon; uniform vec3 uZenith; uniform vec3 uDeep;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
  float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
  vec3 skyColor(vec3 d) {
    float h = max(d.y, 0.0);
    vec3 c = mix(uHorizon, uZenith, pow(h, 0.45));
    if (d.y > 0.0) {
      vec2 p = d.xz / (d.y + 0.1) * 1.3;
      float cl = smoothstep(0.52, 0.86, fbm(p + vec2(4.0, 1.5)));
      cl *= smoothstep(0.0, 0.15, d.y);
      c = mix(c, vec3(1.02, 1.02, 1.0), cl * 0.8);
    }
    float sd = max(dot(d, normalize(uSun)), 0.0);
    c += vec3(1.0, 0.93, 0.78) * (pow(sd, 900.0) * 8.0 + pow(sd, 22.0) * 0.22);
    if (d.y < 0.0) c = mix(uHorizon * 0.85, uDeep, smoothstep(0.0, -0.1, d.y));
    return c;
  }`;
const skyUniforms = () => ({ uSun: { value: SUN_DIR }, uHorizon: { value: C_HORIZON }, uZenith: { value: C_ZENITH }, uDeep: { value: C_DEEP } });

const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  uniforms: skyUniforms(),
  vertexShader: /* glsl */`varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`${skyChunk}
    varying vec3 vDir;
    void main(){ gl_FragColor = vec4(skyColor(normalize(vDir)), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
const skyGeo = new THREE.SphereGeometry(2500, 48, 24);
scene.add(new THREE.Mesh(skyGeo, skyMat));

const envScene = new THREE.Scene();
envScene.add(new THREE.Mesh(skyGeo, skyMat));
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(envScene, 0.015, 0.1, 6000).texture;

/* ==================================================================== *
 *  Woda: lustrzane odbicie (Reflector) + fale w shaderze
 * ==================================================================== */
const waterShader = {
  name: 'Water',
  uniforms: {
    color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
    uTime: { value: 0 }, uShallow: { value: C_SHALLOW }, ...skyUniforms(),
  },
  vertexShader: /* glsl */`
    uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vWorld;
    void main(){ vUv = textureMatrix * vec4(position, 1.0); vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec3 color; uniform float uTime; uniform vec3 uShallow;
    uniform vec3 uSun; uniform vec3 uHorizon; uniform vec3 uDeep;
    varying vec4 vUv; varying vec3 vWorld;
    vec2 waveGrad(vec2 p, float t) {
      vec2 g = vec2(0.0); vec2 d; float k, a, w;
      d = normalize(vec2( 1.0, 0.3)); k = 0.45; a = 0.050; w = 0.9; g += d * a * k * cos(k * dot(d, p) + w * t);
      d = normalize(vec2(-0.6, 1.0)); k = 0.80; a = 0.032; w = 1.3; g += d * a * k * cos(k * dot(d, p) + w * t);
      d = normalize(vec2( 0.4,-1.0)); k = 1.60; a = 0.016; w = 1.8; g += d * a * k * cos(k * dot(d, p) + w * t);
      d = normalize(vec2(-1.0,-0.4)); k = 3.20; a = 0.008; w = 2.5; g += d * a * k * cos(k * dot(d, p) + w * t);
      d = normalize(vec2( 0.8, 0.9)); k = 6.30; a = 0.004; w = 3.4; g += d * a * k * cos(k * dot(d, p) + w * t);
      d = normalize(vec2(-0.3,-0.9)); k = 11.0; a = 0.002; w = 4.4; g += d * a * k * cos(k * dot(d, p) + w * t);
      return g;
    }
    void main(){
      vec3 toCam = cameraPosition - vWorld; float dist = length(toCam); vec3 v = toCam / dist;
      vec2 g = waveGrad(vWorld.xz, uTime) * (1.0 - smoothstep(40.0, 300.0, dist) * 0.85);
      vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
      vec4 uv = vUv; uv.xy += n.xz * 0.9 * uv.w * (1.0 - smoothstep(30.0, 160.0, dist));
      vec3 refl = texture2DProj(tDiffuse, uv).rgb;
      float fres = 0.03 + 0.97 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
      vec3 body = mix(uDeep, uShallow, clamp(0.3 + g.x * 3.0 + g.y * 2.0, 0.0, 1.0));
      // cień kontaktowy pod jachtem
      float e = length(vec2(vWorld.x / 4.4, vWorld.z / 1.45));
      body *= mix(0.45, 1.0, smoothstep(0.85, 1.7, e));
      vec3 col = mix(body, refl, clamp(fres * 1.1 + 0.12, 0.0, 1.0));
      vec3 r = reflect(-v, n);
      col += vec3(1.0, 0.95, 0.85) * pow(max(dot(r, normalize(uSun)), 0.0), 600.0) * 4.0;
      col = mix(col, uHorizon, smoothstep(150.0, 1400.0, dist));
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};
const water = new Reflector(new THREE.PlaneGeometry(5000, 5000), {
  shader: waterShader, clipBias: 0.002, multisample: 0,
  textureWidth: Math.round(window.innerWidth * DPR * 0.5), textureHeight: Math.round(window.innerHeight * DPR * 0.5),
});
water.rotation.x = -Math.PI / 2;
scene.add(water);

/* ==================================================================== *
 *  Światła
 * ==================================================================== */
scene.add(new THREE.HemisphereLight(0xe3eff7, 0x2a5a70, 0.7));
const sun = new THREE.DirectionalLight(0xfff2de, 2.5);
sun.position.copy(SUN_DIR).multiplyScalar(30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 70 });
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.02;
scene.add(sun);

/* ==================================================================== *
 *  Tekstury i materiały
 * ==================================================================== */
function makeRand(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }
function canvasTex(size, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
// mahoń z jasnymi (klonowymi) fugami — klasyczny pokład Riva
const mahoganyTex = canvasTex(1024, (g, S) => {
  const rnd = makeRand(11), planks = 14, ph = S / planks;
  for (let i = 0; i < planks; i++) {
    const y = i * ph;
    g.fillStyle = `hsl(${12 + rnd() * 6}, ${52 + rnd() * 10}%, ${21 + rnd() * 6}%)`;
    g.fillRect(0, y, S, ph);
    for (let k = 0; k < 26; k++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? '30,8,2' : '140,60,30'},${0.05 + rnd() * 0.08})`;
      const yy = y + rnd() * ph;
      g.fillRect(0, yy, S, 1 + rnd() * 2);
    }
    g.fillStyle = '#e4d3ab';
    g.fillRect(0, y + ph - 3, S, 3);
  }
});
const teakTex = canvasTex(512, (g, S) => {
  const rnd = makeRand(5), planks = 8, ph = S / planks;
  for (let i = 0; i < planks; i++) {
    const y = i * ph;
    g.fillStyle = `hsl(${30 + rnd() * 5}, ${36 + rnd() * 8}%, ${46 + rnd() * 8}%)`;
    g.fillRect(0, y, S, ph);
    for (let k = 0; k < 14; k++) { g.fillStyle = `rgba(60,35,15,${0.05 + rnd() * 0.08})`; g.fillRect(0, y + rnd() * ph, S, 1); }
    g.fillStyle = '#1b140e'; g.fillRect(0, y + ph - 3, S, 3);
  }
});
const screenTex = canvasTex(256, (g, S) => {
  const grd = g.createLinearGradient(0, 0, 0, S);
  grd.addColorStop(0, '#0d2236'); grd.addColorStop(1, '#03070c');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  g.strokeStyle = '#4fc3e8'; g.lineWidth = 6;
  g.beginPath(); g.arc(S * 0.32, S * 0.55, S * 0.2, Math.PI * 0.8, Math.PI * 2.2); g.stroke();
  g.fillStyle = '#9fe3f5'; g.font = `bold ${S * 0.12}px sans-serif`; g.fillText('25 kn', S * 0.58, S * 0.5);
  g.fillStyle = 'rgba(160,220,240,.6)'; g.fillRect(S * 0.58, S * 0.6, S * 0.3, S * 0.03); g.fillRect(S * 0.58, S * 0.7, S * 0.22, S * 0.03);
}, false);

// lakier kadłuba: biały pas dna poniżej linii wody, reszta w wybranym kolorze
const hullMat = new THREE.MeshPhysicalMaterial({ color: 0x33557a, metalness: 0.45, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03 });
hullMat.onBeforeCompile = (sh) => {
  sh.uniforms.uBottom = { value: new THREE.Color('#f1f0eb') };
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying float vLocalY;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocalY = position.y;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vLocalY;\nuniform vec3 uBottom;')
    .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(uBottom, diffuseColor.rgb, smoothstep(0.05, 0.065, vLocalY));');
};
hullMat.customProgramCacheKey = () => 'hull-bottom';

const deckMat = new THREE.MeshPhysicalMaterial({ color: 0xeee6d4, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.2 });
const mahoganyMat = new THREE.MeshPhysicalMaterial({ map: mahoganyTex, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide });
const teakMat = new THREE.MeshStandardMaterial({ map: teakTex, roughness: 0.8 });
const floorMat = new THREE.MeshStandardMaterial({ color: 0x37434f, roughness: 0.85, side: THREE.DoubleSide });
const leatherMat = new THREE.MeshStandardMaterial({ color: 0x4d6f96, roughness: 0.55 });
const cushionMat = new THREE.MeshStandardMaterial({ color: 0xece5d6, roughness: 0.7 });
const pillowMat = new THREE.MeshStandardMaterial({ color: 0x8f9396, roughness: 0.95 });
const dashMat = new THREE.MeshStandardMaterial({ color: 0x1d232a, roughness: 0.45 });
const greyMat = new THREE.MeshStandardMaterial({ color: 0x56636a, roughness: 0.55, side: THREE.DoubleSide });
const platformMat = new THREE.MeshPhysicalMaterial({ color: 0xd9dcdc, roughness: 0.35, metalness: 0.15, clearcoat: 0.7, side: THREE.DoubleSide });
const chromeMat = new THREE.MeshStandardMaterial({ color: 0xf2f4f6, metalness: 1, roughness: 0.12 });
const satinMat = new THREE.MeshStandardMaterial({ color: 0xc9cdd1, metalness: 0.9, roughness: 0.28, side: THREE.DoubleSide });
const frameMat = new THREE.MeshStandardMaterial({ color: 0x1a1f24, roughness: 0.3, metalness: 0.3 });
const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0x0f1a22, metalness: 0.1, roughness: 0.04, clearcoat: 1, transparent: true, opacity: 0.66,
  side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.6,
});
const screenMat = new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false });
const fabricMat = new THREE.MeshStandardMaterial({ color: 0x4e5963, roughness: 0.9, side: THREE.DoubleSide });
const flagMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f2, roughness: 0.9, side: THREE.DoubleSide });

/* ==================================================================== *
 *  Budowa geometrii
 * ==================================================================== */
const boat = new THREE.Group();
const hullGroup = new THREE.Group();
hullGroup.position.x = -(LH - PLAT) / 2;
boat.add(hullGroup);
scene.add(boat);

function addMesh(geo, mat, parent = hullGroup, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow; m.receiveShadow = true;
  parent.add(m);
  return m;
}

// geometria z siatki punktów + normalnych; kolejność trójkątów dobierana do normalnych
function geoFromGrid(rows, cols, pos, nor, uv) {
  const idx = [];
  for (let i = 0; i < rows - 1; i++) for (let j = 0; j < cols - 1; j++) {
    const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  if (nor) {
    let score = 0;
    const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3();
    for (let t = 0; t < idx.length; t += 3) {
      A.fromArray(pos, idx[t] * 3); B.fromArray(pos, idx[t + 1] * 3); C.fromArray(pos, idx[t + 2] * 3);
      N.subVectors(B, A).cross(C.sub(A));
      score += N.x * nor[idx[t] * 3] + N.y * nor[idx[t] * 3 + 1] + N.z * nor[idx[t] * 3 + 2];
    }
    if (score < 0) for (let t = 0; t < idx.length; t += 3) { const k = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = k; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  if (nor) g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  else g.computeVertexNormals();
  return g;
}

// fragment powierzchni kadłuba dla zakresu stacji i parametru u; side = ±1
const secCache = new Map();
const secAt = (s) => { let S = secCache.get(s); if (!S) { S = section(s); secCache.set(s, S); } return S; };
function hullPatch(s0, s1, u0, u1, mat, side, uvScale = [1, 1]) {
  const ss = STATIONS.filter((s) => s >= s0 - 1e-9 && s <= s1 + 1e-9);
  const us = US.filter((u) => u >= u0 - 1e-9 && u <= u1 + 1e-9);
  const pos = [], nor = [], uv = [];
  const dS = 0.0015, dU = 0.002;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), n = new THREE.Vector3();
  for (const s of ss) {
    const S = secAt(s), Sm = section(Math.max(0, s - dS)), Sp = section(Math.min(1, s + dS));
    for (const u of us) {
      const p = sectionPoint(S, u);
      const pm = sectionPoint(Sm, u), pp = sectionPoint(Sp, u);
      const qm = sectionPoint(S, Math.max(0, u - dU)), qp = sectionPoint(S, Math.min(1, u + dU));
      a.set(pp[0] - pm[0], pp[1] - pm[1], pp[2] - pm[2]);
      b.set(qp[0] - qm[0], qp[1] - qm[1], qp[2] - qm[2]);
      n.crossVectors(a, b);
      if (n.lengthSq() < 1e-14) n.set(1, 0, 0); else n.normalize();
      pos.push(p[0], p[1], side * p[2]);
      nor.push(n.x, n.y, side * n.z);
      uv.push(p[0] * uvScale[0], side * p[2] * uvScale[1]);
    }
  }
  return addMesh(geoFromGrid(ss.length, us.length, pos, nor, uv), mat);
}

// ogólna siatka parametryczna fn(a,b) -> [x,y,z]
function gridMesh(nu, nv, fn, mat, uvScale = [1, 1], parent = hullGroup) {
  const pos = [], uv = [];
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
    const p = fn(i / nu, j / nv);
    pos.push(p[0], p[1], p[2]);
    uv.push(p[0] * uvScale[0], p[2] * uvScale[1]);
  }
  return addMesh(geoFromGrid(nu + 1, nv + 1, pos, null, uv), mat, parent);
}

function rod(a, b, r, mat, parent = hullGroup) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 12), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
  m.castShadow = true;
  parent.add(m);
  return m;
}
function tube(points, r, mat, segs = points.length * 3, parent = hullGroup, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
  return addMesh(new THREE.TubeGeometry(curve, segs, r, 10, closed), mat, parent);
}
function rbox(w, h, d, r, mat, x, y, z, parent = hullGroup) {
  const m = addMesh(new RoundedBoxGeometry(w, h, d, 4, r), mat, parent);
  m.position.set(x, y, z);
  return m;
}

/* ---------- kadłub i pokład ---------- */
for (const side of [1, -1]) {
  hullPatch(0, 1, 0, U2, hullMat, side);
  hullPatch(0, WOOD_FROM, U2, U3, deckMat, side);
  hullPatch(WOOD_FROM, 1, U2, U3, mahoganyMat, side, [0.25, 1]);
  hullPatch(0, 1, U3, 1, deckMat, side);
}
// pawęż
{
  const S = section(0);
  const ring = US.filter((u) => u <= U3).map((u) => sectionPoint(S, u));
  const pts = [...ring.map((p) => [p[0], p[1], p[2]]), ...ring.slice().reverse().map((p) => [p[0], p[1], -p[2]])];
  const pos = [0, 0.15, 0], idx = [];
  pts.forEach((p) => pos.push(p[0], p[1], p[2]));
  for (let i = 1; i < pts.length; i++) idx.push(0, i + 1, i);
  {
    // znajdź niezdegenerowany trójkąt i sprawdź kierunek normalnej
    const P = (k) => V(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
    for (let t = 0; t < idx.length; t += 3) {
      const n = P(idx[t + 1]).sub(P(idx[t])).cross(P(idx[t + 2]).sub(P(idx[t])));
      if (n.lengthSq() > 1e-8) { if (n.x > 0) for (let k = 0; k < idx.length; k += 3) { const q = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = q; } break; }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill(0).flatMap(() => [-1, 0, 0]), 3));
  g.setIndex(idx);
  addMesh(g, hullMat);
}

/* ---------- chromowany odbojnik wzdłuż krawędzi pokładu ---------- */
{
  const railPt = (s, side) => {
    const S = section(s), th = 0.75;
    const cz = S.b - S.r, cy = S.yfe - S.r;
    const R = S.r + 0.012;
    return V(S.x, cy + R * Math.sin(th), side * (cz + R * Math.cos(th)));
  };
  const pts = [];
  for (let i = 0; i <= 120; i++) pts.push(railPt(0.993 * (1 - i / 120), -1));
  const S0 = section(0), zEdge = S0.b - S0.r * 0.4;
  for (let i = 1; i < 12; i++) { const z = lerp(-zEdge, zEdge, i / 12); pts.push(V(-0.012, deckSurfY(0, z) - 0.03, z)); }
  for (let i = 0; i <= 120; i++) pts.push(railPt(0.993 * (i / 120), 1));
  tube(pts, 0.017, chromeMat, 900);
}

/* ---------- przetłoczenie (pas ze stali) na burtach ---------- */
const swooshY = lookup1D([[0.085, 0.27], [0.1, 0.42], [0.14, 0.52], [0.25, 0.6], [0.45, 0.68], [0.7, 0.77], [0.9, 0.86], [0.982, 0.93]]);
for (const side of [-1, 1]) {
  gridMesh(180, 4, (a, b) => {
    const s = lerp(0.085, 0.982, a);
    const v = lerp(-1, 1, b);
    const y = swooshY(s) + v * 0.022;
    const z = widthAt(s, y) + 0.003 + 0.005 * (1 - v * v);
    return [s * LH, y, side * z];
  }, satinMat);
}

/* ---------- platforma rufowa i pas przy linii wody ---------- */
{
  const yC = 0.165, HH = 0.085, sEnd = 0.42;
  const strakeOff = (s) => 0.05 * (1 - smooth(0.18, sEnd, s));
  const strakeH = (s) => HH * Math.sqrt(1 - smooth(0.22, sEnd, s));
  // listwa wzdłuż burty, zanikająca ku przodowi
  for (const side of [-1, 1]) {
    gridMesh(80, 12, (a, b) => {
      const s = lerp(0, sEnd, a), th = lerp(-Math.PI / 2, Math.PI / 2, b);
      const y = yC + strakeH(s) * Math.sin(th);
      const z = widthAt(s, y) - 0.004 + strakeOff(s) * Math.pow(Math.cos(th), 0.35);
      return [s * LH, y, side * z];
    }, platformMat);
  }
  // platforma kąpielowa za pawężą
  const zS = widthAt(0, yC) + strakeOff(0) - 0.01, Rc = 0.12, xF = 0.08;
  const shape = new THREE.Shape();
  shape.moveTo(xF, zS);
  shape.lineTo(-PLAT + Rc, zS);
  shape.absarc(-PLAT + Rc, zS - Rc, Rc, Math.PI / 2, Math.PI, false);
  shape.lineTo(-PLAT, -(zS - Rc));
  shape.absarc(-PLAT + Rc, -(zS - Rc), Rc, Math.PI, Math.PI * 1.5, false);
  shape.lineTo(xF, -zS);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 2 * HH - 0.03, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 4, curveSegments: 16 });
  g.rotateX(Math.PI / 2);
  g.translate(0, yC + HH - 0.015, 0);
  addMesh(g, platformMat);
  // teakowa nakładka
  const t = new THREE.Shape();
  const zt = zS - 0.03, rt = 0.09;
  t.moveTo(0.0, zt);
  t.lineTo(-PLAT + 0.03 + rt, zt);
  t.absarc(-PLAT + 0.03 + rt, zt - rt, rt, Math.PI / 2, Math.PI, false);
  t.lineTo(-PLAT + 0.03, -(zt - rt));
  t.absarc(-PLAT + 0.03 + rt, -(zt - rt), rt, Math.PI, Math.PI * 1.5, false);
  t.lineTo(0.0, -zt);
  t.closePath();
  const tg = new THREE.ShapeGeometry(t, 12);
  tg.rotateX(-Math.PI / 2);
  tg.translate(0, yC + HH + 0.0015, 0);
  const tuv = tg.attributes.uv, tp = tg.attributes.position;
  for (let i = 0; i < tuv.count; i++) tuv.setXY(i, tp.getX(i) * 0.6, tp.getZ(i) * 1.2);
  tg.computeVertexNormals();
  addMesh(tg, teakMat);
}

/* ---------- dziobnica i okucia dziobowe ---------- */
{
  const pts = [];
  for (let i = 0; i <= 30; i++) { const s = lerp(0.885, 0.998, i / 30); pts.push(V(s * LH + 0.004, keelY(s), 0)); }
  tube(pts, 0.016, chromeMat, 80);
  const fitting = rbox(0.34, 0.05, 0.1, 0.02, chromeMat, LH - 0.2, sheer(0.975) + 0.035, 0);
  fitting.rotation.z = -0.08;
  rod(V(LH - 0.08, sheer(0.99) + 0.02, 0), V(LH - 0.08, sheer(0.99) + 0.11, 0), 0.012, chromeMat);
  const lamp = addMesh(new THREE.SphereGeometry(0.03, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x777766, roughness: 0.2 }));
  lamp.position.set(LH - 0.08, sheer(0.99) + 0.13, 0);
}

/* ---------- szary pas (luk) na pokładzie dziobowym ---------- */
{
  const s0 = 0.765, s1 = 0.975;
  gridMesh(50, 8, (a, b) => {
    const s = lerp(s0, s1, a);
    const w = 0.19 * Math.sqrt(Math.min(1, a / 0.08)) * Math.pow(1 - a * 0.85, 1.2);
    const z = lerp(-w, w, b);
    return [s * LH, deckSurfY(s, z) + 0.008, z];
  }, greyMat);
  const cleat = addMesh(new THREE.CapsuleGeometry(0.022, 0.16, 4, 10), chromeMat);
  cleat.rotation.z = Math.PI / 2;
  cleat.position.set(0.8 * LH, deckSurfY(0.8, 0) + 0.04, 0);
  rod(V(0.8 * LH - 0.05, deckSurfY(0.8, 0), 0), V(0.8 * LH - 0.05, deckSurfY(0.8, 0) + 0.04, 0), 0.012, chromeMat);
  rod(V(0.8 * LH + 0.05, deckSurfY(0.8, 0), 0), V(0.8 * LH + 0.05, deckSurfY(0.8, 0) + 0.04, 0), 0.012, chromeMat);
}

/* ---------- knagi, wywietrzniki ---------- */
for (const [s, side] of [[0.07, 1], [0.07, -1], [0.71, 1], [0.71, -1]]) {
  const z = side * (halfBeam(s) - 0.13);
  const c = addMesh(new THREE.CapsuleGeometry(0.018, 0.13, 4, 10), chromeMat);
  c.rotation.z = Math.PI / 2;
  c.position.set(s * LH, deckSurfY(s, z) + 0.035, z);
}
for (const [s, side] of [[0.15, 1], [0.15, -1], [0.25, 1], [0.25, -1]]) {
  const z = side * (halfBeam(s) - 0.17);
  const vent = rbox(0.3, 0.03, 0.07, 0.014, greyMat, s * LH, deckSurfY(s, z) + 0.01, z);
  vent.rotation.y = side * 0.06;
}

/* ---------- leżanka rufowa ---------- */
{
  const x0 = 0.45, x1 = 2.3, xc = (x0 + x1) / 2, len = x1 - x0;
  const y0 = sheer(0.17) + 0.02;
  for (const side of [-1, 1]) {
    rbox(len, 0.07, 0.9, 0.03, leatherMat, xc, y0 + 0.03, side * 0.47);
    rbox(len - 0.04, 0.09, 0.86, 0.045, cushionMat, xc, y0 + 0.1, side * 0.47);
  }
  // oparcie / zagłówek przy kokpicie (garb widoczny w profilu)
  const back = rbox(0.32, 0.26, 1.9, 0.08, cushionMat, 2.42, sheer(0.29) + 0.16, 0);
  back.rotation.z = -0.25;
  rbox(0.18, 0.16, 1.95, 0.05, leatherMat, 2.52, sheer(0.3) + 0.05, 0);
}

/* ---------- maszt bandery ---------- */
const FLAG_BASE = V(0.25, sheer(0.03) + 0.02, 0);
rod(FLAG_BASE, V(0.18, FLAG_BASE.y + 1.05, 0), 0.011, chromeMat);
const flagGeo = new THREE.PlaneGeometry(0.38, 0.25, 12, 4);
flagGeo.translate(-0.19, 0, 0);
const flag = addMesh(flagGeo, flagMat);
flag.position.set(0.18, FLAG_BASE.y + 0.92, 0);
const flagBase = Float32Array.from(flagGeo.attributes.position.array);

/* ---------- kokpit ---------- */
{
  // podłoga + mahoniowy pas środkowy
  gridMesh(60, 12, (a, b) => {
    const s = lerp(CK_A, CK_B, a);
    const S = secAt(s);
    const w = Math.max(0, S.win - S.rl);
    return [s * LH, FLOOR, lerp(-w, w, b)];
  }, floorMat);
  gridMesh(20, 4, (a, b) => [lerp(0.36, 0.585, a) * LH, FLOOR + 0.004, lerp(-0.2, 0.2, b)], mahoganyMat, [0.25, 1]);

  // ławka rufowa (w poprzek)
  const xa = 0.318 * LH, xb = 0.37 * LH;
  rbox(xb - xa + 0.1, 0.28, 1.7, 0.03, leatherMat, (xa + xb) / 2 - 0.05, FLOOR + 0.14, 0);
  rbox(xb - xa - 0.02, 0.09, 1.5, 0.04, cushionMat, (xa + xb) / 2 + 0.01, FLOOR + 0.32, 0);
  const aftBack = rbox(0.12, 0.3, 1.45, 0.05, cushionMat, xa + 0.04, FLOOR + 0.52, 0);
  aftBack.rotation.z = -0.18;

  // sofy burtowe
  const s0 = 0.37, s1 = 0.555, x0 = s0 * LH, x1 = s1 * LH, len = x1 - x0, xc = (x0 + x1) / 2;
  for (const side of [-1, 1]) {
    rbox(len, 0.27, 0.62, 0.03, leatherMat, xc, FLOOR + 0.135, side * 0.62);
    rbox(len - 0.03, 0.09, 0.5, 0.04, cushionMat, xc, FLOOR + 0.31, side * 0.56);
    const back = rbox(len - 0.06, 0.3, 0.11, 0.05, leatherMat, xc, FLOOR + 0.5, side * 0.79);
    back.rotation.x = side * 0.14;
    const p1 = rbox(0.36, 0.32, 0.1, 0.07, pillowMat, x0 + 0.45, FLOOR + 0.52, side * 0.68);
    p1.rotation.x = side * 0.3; p1.rotation.y = side * 0.15;
    const p2 = rbox(0.34, 0.3, 0.1, 0.07, cushionMat, x1 - 0.5, FLOOR + 0.51, side * 0.69);
    p2.rotation.x = side * 0.3; p2.rotation.y = -side * 0.1;
  }

  // deska rozdzielcza pod szybą
  const dx0 = 0.565 * LH, dx1 = 0.66 * LH;
  rbox(dx1 - dx0, 0.5, 1.7, 0.04, deckMat, (dx0 + dx1) / 2, FLOOR + 0.25, 0);
  const dashTop = rbox(0.42, 0.08, 1.66, 0.035, dashMat, dx0 + 0.24, FLOOR + 0.53, 0);
  dashTop.rotation.z = 0.35;
  for (const z of [-0.18, 0.36]) {
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.2), screenMat);
    scr.position.set(dx0 + 0.13, FLOOR + 0.56, z);
    scr.rotation.set(0, -Math.PI / 2, 0);
    scr.rotateX(-0.35);
    hullGroup.add(scr);
  }
  // kierownica (prawa strona)
  const wheel = new THREE.Group();
  wheel.position.set(dx0 - 0.08, FLOOR + 0.6, 0.36);
  wheel.rotation.z = 0.45;
  hullGroup.add(wheel);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.014, 12, 48), frameMat);
  rim.rotation.y = Math.PI / 2;
  rim.castShadow = true;
  wheel.add(rim);
  for (let k = 0; k < 3; k++) {
    const ang = k * Math.PI * 2 / 3 + Math.PI / 2;
    rod(V(0, 0, 0), V(0, Math.sin(ang) * 0.165, Math.cos(ang) * 0.165), 0.008, chromeMat, wheel);
  }
  rod(V(0, 0, 0), V(0.16, 0, 0), 0.018, chromeMat, wheel);
}

/* ---------- przyciemniana szyba (kopuła) ---------- */
{
  const XR = WOOD_FROM * LH, XF = 0.765 * LH, XTR = XR + 0.03, XTF = 0.675 * LH, n = 2.6;
  const sb = (phi) => { const c = Math.cos(phi), s = Math.sin(phi); return [Math.sign(c) * Math.pow(Math.abs(c), 2 / n), Math.pow(Math.abs(s), 2 / n)]; };
  const baseW = halfBeam(WOOD_FROM) - 0.13, topW = baseW * 0.92;
  const topY0 = deckSurfY(WOOD_FROM, baseW);
  const base = (phi) => { const [zN, xN] = sb(phi); const x = lerp(XR, XF, xN); const s = x / LH; const z = zN * (halfBeam(s) - 0.13); return V(x, deckSurfY(s, z) + 0.004, z); };
  const top = (phi) => { const [zN, xN] = sb(phi); return V(lerp(XTR, XTF, xN), topY0 + lerp(0.5, 0.4, xN), zN * topW); };
  const point = (phi, h) => {
    const B = base(phi), T = top(phi);
    const C = V(lerp(B.x, T.x, 0.22), lerp(B.y, T.y, 0.85), lerp(B.z, T.z, 0.22));
    return V(0, 0, 0).addScaledVector(B, (1 - h) * (1 - h)).addScaledVector(C, 2 * h * (1 - h)).addScaledVector(T, h * h);
  };
  const glass = gridMesh(80, 14, (a, b) => { const p = point(a * Math.PI, b); return [p.x, p.y, p.z]; }, glassMat);
  glass.castShadow = false;
  glass.renderOrder = 2;
  const rimPts = []; for (let i = 0; i <= 80; i++) rimPts.push(top((i / 80) * Math.PI));
  tube(rimPts, 0.02, frameMat, 200);
  for (const phi of [0, Math.PI]) {
    const edge = []; for (let i = 0; i <= 14; i++) edge.push(point(phi, i / 14));
    tube(edge, 0.016, frameMat, 40);
  }
  const basePts = []; for (let i = 0; i <= 80; i++) basePts.push(base((i / 80) * Math.PI));
  tube(basePts, 0.012, chromeMat, 200);
}

/* ---------- bimini (opcja) ---------- */
const bimini = new THREE.Group();
bimini.visible = false;
hullGroup.add(bimini);
{
  const xa = 2.9, xb = 5.45, H = 1.95, W = 1.02;
  const yTop = (x, z) => H + 0.08 * (1 - (x - xa) / (xb - xa)) - 0.07 * (z / W) * (z / W);
  gridMesh(16, 12, (a, b) => { const x = lerp(xa, xb, a), z = lerp(-W, W, b); return [x, yTop(x, z), z]; }, fabricMat, [1, 1], bimini);
  for (const x of [xa, xb]) {
    const arc = []; for (let i = 0; i <= 16; i++) { const z = lerp(-W, W, i / 16); arc.push(V(x, yTop(x, z) - 0.015, z)); }
    tube(arc, 0.016, chromeMat, 40, bimini);
  }
  for (const side of [-1, 1]) {
    const zd = (s) => side * (halfBeam(s) - 0.1);
    rod(V(xa, yTop(xa, W) - 0.02, side * W), V(xa - 0.1, deckSurfY(0.34, zd(0.34)), zd(0.34)), 0.016, chromeMat, bimini);
    rod(V(xb, yTop(xb, W) - 0.02, side * W), V(xb - 0.75, deckSurfY(0.57, zd(0.57)) + 0.02, zd(0.57)), 0.016, chromeMat, bimini);
  }
}

/* ==================================================================== *
 *  Konfigurator
 * ==================================================================== */
const HULL_COLORS = [
  { name: 'Błękit stalowy', hex: '#33557a', metal: 0.45, rough: 0.3 },
  { name: 'Kość słoniowa',  hex: '#ece2cb', metal: 0.0,  rough: 0.22 },
  { name: 'Srebrny',        hex: '#b9c0c6', metal: 0.65, rough: 0.28 },
  { name: 'Grafit',         hex: '#2c3137', metal: 0.5,  rough: 0.3 },
  { name: 'Czarny',         hex: '#0f1114', metal: 0.2,  rough: 0.2 },
  { name: 'Zieleń',         hex: '#244a40', metal: 0.4,  rough: 0.3 },
  { name: 'Bordo',          hex: '#5a1a25', metal: 0.4,  rough: 0.3 },
];
const UPHOLSTERY = [
  { name: 'Niebieska', hex: '#4d6f96' },
  { name: 'Szara',     hex: '#7a8086' },
  { name: 'Kremowa',   hex: '#d9cfbb' },
  { name: 'Koniak',    hex: '#8a5634' },
];
const state = { c: 0, u: 0 };
const readHash = () => {
  const h = new URLSearchParams(location.hash.slice(1));
  const c = parseInt(h.get('c'), 10), u = parseInt(h.get('u'), 10);
  if (HULL_COLORS[c]) state.c = c;
  if (UPHOLSTERY[u]) state.u = u;
};
const writeHash = () => { try { history.replaceState(null, '', `#c=${state.c}&u=${state.u}`); } catch (e) { /* file:// */ } };

function buildSwatches(boxId, nameId, list, key, apply) {
  const box = document.getElementById(boxId), label = document.getElementById(nameId);
  const select = (i, push = true) => {
    state[key] = i; apply(list[i]); label.textContent = list[i].name;
    [...box.children].forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
    if (push) writeHash();
  };
  list.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'swatch'; b.style.setProperty('--c', c.hex);
    b.title = c.name; b.setAttribute('aria-label', c.name);
    b.addEventListener('click', () => select(i));
    box.appendChild(b);
  });
  return select;
}
readHash();
const selectHull = buildSwatches('swatches', 'colorName', HULL_COLORS, 'c', (c) => {
  hullMat.color.set(c.hex); hullMat.metalness = c.metal; hullMat.roughness = c.rough;
});
const selectUph = buildSwatches('uphSwatches', 'uphName', UPHOLSTERY, 'u', (c) => leatherMat.color.set(c.hex));
selectHull(state.c, false);
selectUph(state.u, false);

document.getElementById('bimini').addEventListener('change', (e) => { bimini.visible = e.target.checked; });

const viewsBox = document.getElementById('views');
let tween = null, autoOn = true, idleTimer = 0;
function goView(key) {
  const v = VIEWS[key];
  tween = { t0: performance.now(), dur: 1100, p0: camera.position.clone(), p1: v.pos.clone(), t0v: controls.target.clone(), t1v: v.target.clone() };
  setAuto(false);
  [...viewsBox.children].forEach((b) => b.dataset.key && b.setAttribute('aria-pressed', String(b.dataset.key === key)));
}
Object.entries(VIEWS).forEach(([key, v]) => {
  const b = document.createElement('button');
  b.className = 'chip'; b.textContent = v.label; b.dataset.key = key; b.setAttribute('aria-pressed', 'false');
  b.addEventListener('click', () => goView(key));
  viewsBox.appendChild(b);
});
const autoBtn = document.createElement('button');
autoBtn.className = 'chip'; autoBtn.textContent = 'Auto-obrót';
viewsBox.appendChild(autoBtn);
function setAuto(on) {
  autoOn = on; controls.autoRotate = on; clearTimeout(idleTimer);
  autoBtn.setAttribute('aria-pressed', String(on));
  if (on) [...viewsBox.children].forEach((b) => b.dataset.key && b.setAttribute('aria-pressed', 'false'));
}
setAuto(true);
autoBtn.addEventListener('click', () => setAuto(!autoOn));
const hint = document.getElementById('hint');
controls.addEventListener('start', () => { tween = null; clearTimeout(idleTimer); controls.autoRotate = false; hint && hint.classList.add('hide'); });
controls.addEventListener('end', () => { clearTimeout(idleTimer); if (autoOn) idleTimer = setTimeout(() => { controls.autoRotate = true; }, 5000); });
setTimeout(() => hint && hint.classList.add('hide'), 7000);

/* ==================================================================== *
 *  Pętla renderowania
 * ==================================================================== */
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = NARROW ? 48 : 36;
  camera.updateProjectionMatrix();
  water.getRenderTarget().setSize(Math.round(w * DPR * 0.5), Math.round(h * DPR * 0.5));
}
window.addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const flagPos = flagGeo.attributes.position;
function frame() {
  const t = clock.getElapsedTime();
  water.material.uniforms.uTime.value = t;
  boat.position.y = Math.sin(t * 1.0) * 0.018;
  boat.rotation.x = Math.sin(t * 0.8) * 0.008;
  boat.rotation.z = Math.sin(t * 0.6 + 1) * 0.005;

  for (let i = 0; i < flagPos.count; i++) {
    const x = flagBase[i * 3];
    flagPos.setZ(i, Math.sin(x * 14 + t * 6) * 0.035 * (-x / 0.38));
  }
  flagPos.needsUpdate = true;

  if (tween) {
    const k = clamp((performance.now() - tween.t0) / tween.dur, 0, 1), e = ease(k);
    camera.position.lerpVectors(tween.p0, tween.p1, e);
    controls.target.lerpVectors(tween.t0v, tween.t1v, e);
    if (k >= 1) tween = null;
  }
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
const loader = document.getElementById('loader');
loader.classList.add('done');
setTimeout(() => loader.remove(), 800);

window.__yacht = { camera, controls, goView, THREE };
