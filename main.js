import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';
import { Reflector } from './vendor/Reflector.js';
import { Sky } from './vendor/jsm/objects/Sky.js';
import { EffectComposer } from './vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from './vendor/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from './vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/jsm/postprocessing/OutputPass.js';

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
// parametry adresu do strojenia światła: ?exp=0.3&sun=22&az=38&el=34
const QP = new URLSearchParams(location.search);
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
renderer.toneMappingExposure = +(QP.get('exp') || 0.34);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 30000);

// skala jasności dla elementów sceny o stałych kolorach (woda, wzgórza), dopasowana do ekspozycji
const SCENE_LIGHT = 2.4;
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
 *  Niebo: fizyczny model atmosfery (Preetham) + chmury
 * ==================================================================== */
const SUN_EL = +(QP.get('el') || 30), SUN_AZ = +(QP.get('az') || 110);
const SUN_DIR = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - SUN_EL), THREE.MathUtils.degToRad(SUN_AZ));
const sky = new Sky();
sky.scale.setScalar(10000);
{
  const u = sky.material.uniforms;
  u.turbidity.value = 1.6;
  u.rayleigh.value = 2.4;
  u.mieCoefficient.value = 0.003;
  u.mieDirectionalG.value = 0.82;
  u.cloudCover.value = 0.4;
  u.sunPosition.value.copy(SUN_DIR);
}

// odległe wzgórza wokół jeziora (perspektywa powietrzna: im wyżej i dalej, tym bardziej zamglone)
const hills = (() => {
  const N = 720, R = 2600, pos = [], idx = [], hh = [];
  const rnd = makeRand(77), oct = [[3, 0.5], [7, 0.28], [17, 0.14], [41, 0.06], [97, 0.025]].map(([f, a]) => [f, a, rnd() * 6.28, rnd() * 6.28]);
  for (let i = 0; i <= N; i++) {
    const th = (i / N) * Math.PI * 2;
    let h = 0;
    for (const [f, a, p1, p2] of oct) h += a * (Math.sin(th * f + p1) * 0.6 + Math.sin(th * f * 1.7 + p2) * 0.4);
    h = 70 + 190 * Math.max(0, h + 0.35);
    hh.push(h);
    const x = Math.cos(th) * R, z = Math.sin(th) * R;
    pos.push(x, -20, z, x, h, z);
  }
  for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return new THREE.Mesh(g, new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uNear: { value: new THREE.Color('#4f7356').multiplyScalar(SCENE_LIGHT * 1.15) }, uFar: { value: new THREE.Color('#b9c9d5').multiplyScalar(SCENE_LIGHT * 1.2) } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 uNear; uniform vec3 uFar; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        float ang = atan(vW.z, vW.x) * 400.0;
        float tex = n(vec2(ang, vW.y * 0.08)) * 0.5 + n(vec2(ang * 3.1, vW.y * 0.25)) * 0.3 + n(vec2(ang * 9.0, vW.y * 0.7)) * 0.2;
        float haze = 0.55 + 0.35 * smoothstep(0.0, 260.0, vW.y);
        vec3 c = mix(uNear * (0.75 + 0.5 * tex), uFar, haze);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
})();
scene.add(hills);

// mapa otoczenia do odbić: niebo + wzgórza + tafla wody poniżej horyzontu
let waterNormalsEnv = null;
function buildEnvironment() {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(sky);
  envScene.add(hills);
  // woda w odbiciach: jasna przy horyzoncie (odbija niebo), ciemna pod spodem, z pasmami fal
  const sea = new THREE.Mesh(new THREE.CircleGeometry(8000, 96).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uNormals: { value: null }, uDeep: { value: new THREE.Color('#071a26').multiplyScalar(SCENE_LIGHT) }, uHorizon: { value: new THREE.Color('#9fb6c4').multiplyScalar(SCENE_LIGHT) } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform sampler2D uNormals; uniform vec3 uDeep; uniform vec3 uHorizon; varying vec3 vW;
      void main(){
        vec3 d = normalize(vW - cameraPosition);
        float t = smoothstep(0.0, 0.35, -d.y);
        vec3 n = texture2D(uNormals, vW.xz / 4.0).rgb * 2.0 - 1.0;
        float streak = 0.55 + 0.9 * clamp(n.x * 0.5 + 0.5, 0.0, 1.0);
        vec3 c = mix(uHorizon * 0.75, uDeep, t);
        c = mix(c, c * streak, 1.0 - t * 0.6);
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  sea.material.uniforms.uNormals.value = waterNormalsEnv;
  envScene.add(sea);
  const prev = scene.environment;
  sky.material.uniforms.sunDiskScale.value = 0; // słońce jest światłem kierunkowym — nie licz go drugi raz
  scene.environment = pmrem.fromScene(envScene, 0.0, 0.1, 30000).texture;
  sky.material.uniforms.sunDiskScale.value = 1;
  if (prev) prev.dispose();
  pmrem.dispose();
  scene.add(sky);
  scene.add(hills);
}

/* ==================================================================== *
 *  Woda: lustrzane odbicie + prawdziwa mapa normalnych fal + cień jachtu
 * ==================================================================== */
const waterNormals = new THREE.TextureLoader().load('./assets/waternormals.jpg', () => { waterNormalsEnv = waterNormals; buildEnvironment(); });
waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping;
buildEnvironment(); // wstępnie, bez tekstury fal

const waterShader = {
  name: 'LakeWater',
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.lights, {
    color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
    uNormals: { value: null }, uTime: { value: 0 },
    uSun: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color() },
    uDeep: { value: new THREE.Color('#06141d') }, uScatter: { value: new THREE.Color('#14495a') },
  }]),
  vertexShader: /* glsl */`
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec4 worldPosition;
    #include <common>
    #include <shadowmap_pars_vertex>
    void main() {
      worldPosition = modelMatrix * vec4(position, 1.0);
      vUv = textureMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
      #include <beginnormal_vertex>
      #include <defaultnormal_vertex>
      #include <shadowmap_vertex>
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform sampler2D uNormals; uniform float uTime;
    uniform vec3 uSun; uniform vec3 uSunColor; uniform vec3 uDeep; uniform vec3 uScatter;
    varying vec4 vUv; varying vec4 worldPosition;
    #include <common>
    #include <packing>
    #include <bsdfs>
    #include <lights_pars_begin>
    #include <shadowmap_pars_fragment>
    #include <shadowmask_pars_fragment>
    vec3 waterNormal(vec2 p, float dist) {
      float t = uTime;
      vec3 n = texture2D(uNormals, p / 7.0 + vec2(t / 41.0, t / 57.0)).rgb
             + texture2D(uNormals, p / 4.6 - vec2(t / -47.0, t / 31.0)).rgb
             + texture2D(uNormals, p / 19.0 + vec2(t / 97.0, -t / 83.0)).rgb
             + texture2D(uNormals, p / 1.9 - vec2(t / 23.0, t / -29.0)).rgb * 0.5;
      n = n / 3.5 * 2.0 - 1.0;
      float k = mix(0.42, 0.1, smoothstep(8.0, 220.0, dist));
      return normalize(vec3(n.x * k, 1.0, n.y * k));
    }
    void main() {
      vec3 toEye = cameraPosition - worldPosition.xyz;
      float dist = length(toEye);
      vec3 v = toEye / dist;
      vec3 n = waterNormal(worldPosition.xz, dist);
      vec3 sunDir = normalize(uSun);

      vec4 uv = vUv;
      uv.xy += n.xz * (0.22 / (1.0 + dist * 0.12)) * uv.w;
      vec3 refl = texture2DProj(tDiffuse, uv).rgb;

      float cosT = max(dot(n, v), 0.0);
      float fres = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
      float shadow = getShadowMask();

      vec3 body = uDeep + uScatter * (0.25 + 0.75 * max(dot(n, sunDir), 0.0)) * mix(0.3, 1.0, shadow);
      float e = length(vec2(worldPosition.x / 4.3, worldPosition.z / 1.4));
      body *= mix(0.5, 1.0, smoothstep(0.92, 1.6, e));

      vec3 col = mix(body, refl, fres);
      vec3 r = reflect(-v, n);
      float sd = max(dot(r, sunDir), 0.0);
      col += uSunColor * (pow(sd, 1200.0) * 40.0 + pow(sd, 120.0) * 0.8) * shadow;
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};
const HQ = !NARROW && !/Mobi|Android/i.test(navigator.userAgent);
const water = new Reflector(new THREE.PlaneGeometry(20000, 20000), {
  shader: waterShader, clipBias: 0.002, multisample: HQ ? 4 : 0,
  textureWidth: Math.round(window.innerWidth * DPR * 0.6), textureHeight: Math.round(window.innerHeight * DPR * 0.6),
});
water.material.lights = true;
water.material.uniforms.uNormals.value = waterNormals;
water.material.uniforms.uSun.value.copy(SUN_DIR);
water.material.uniforms.uSunColor.value.set(0xfff1dc).multiplyScalar(SCENE_LIGHT);
water.material.uniforms.uDeep.value.multiplyScalar(SCENE_LIGHT);
water.material.uniforms.uScatter.value.multiplyScalar(SCENE_LIGHT);
water.rotation.x = -Math.PI / 2;
water.receiveShadow = true;
// nie renderuj odbicia podczas przebiegów pomocniczych (np. normalne dla GTAO)
{
  const mirrorRender = water.onBeforeRender;
  water.onBeforeRender = function (r, s, c, ...rest) { if (s.overrideMaterial) return; mirrorRender.call(this, r, s, c, ...rest); };
}
scene.add(water);

/* ==================================================================== *
 *  Światła
 * ==================================================================== */
scene.add(new THREE.HemisphereLight(0xdfeaf2, 0x0d2633, 0.15));
const sun = new THREE.DirectionalLight(0xfff1dc, +(QP.get('sun') || 22));
sun.position.copy(SUN_DIR).multiplyScalar(30);
sun.castShadow = true;
sun.shadow.mapSize.set(HQ ? 4096 : 2048, HQ ? 4096 : 2048);
Object.assign(sun.shadow.camera, { left: -5.8, right: 5.8, top: 5.8, bottom: -5.8, near: 5, far: 60 });
sun.shadow.bias = -0.0002;
sun.shadow.normalBias = 0.015;
sun.shadow.radius = 3;
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
// okresowy szum wartości — do bezszwowych tekstur
function periodicNoise(size, cells, rnd) {
  const g = Float32Array.from({ length: cells * cells }, () => rnd());
  const at = (i, j) => g[(((j % cells) + cells) % cells) * cells + (((i % cells) + cells) % cells)];
  return (x, y) => {
    const fx = (x / size) * cells, fy = (y / size) * cells;
    const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    return lerp(lerp(at(ix, iy), at(ix + 1, iy), sx), lerp(at(ix, iy + 1), at(ix + 1, iy + 1), sx), sy);
  };
}
// mapa normalnych z mapy wysokości (bezszwowa)
function normalTex(size, heightFn, strength, repeat = 1) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = heightFn(x, y);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = h[y * size + ((x + 1) % size)] - h[y * size + ((x - 1 + size) % size)];
    const dy = h[((y + 1) % size) * size + x] - h[((y - 1 + size) % size) * size + x];
    let nx = -dx * strength, ny = -dy * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * size + x) * 4;
    img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

// metaliczne drobinki w lakierze
const flakeTex = (() => {
  const rnd = makeRand(3), S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const nx = (rnd() - 0.5) * 1.2, ny = (rnd() - 0.5) * 1.2, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    img.data[i * 4] = (nx * 0.5 + 0.5) * 255; img.data[i * 4 + 1] = (ny * 0.5 + 0.5) * 255; img.data[i * 4 + 2] = (nz * 0.5 + 0.5) * 255; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
})();
// ziarno skóry
const leatherNormal = (() => {
  const rnd = makeRand(21), n1 = periodicNoise(512, 96, rnd), n2 = periodicNoise(512, 32, rnd), n3 = periodicNoise(512, 192, rnd);
  return normalTex(512, (x, y) => {
    const cell = Math.abs(n1(x, y) - 0.5) * 2;
    return (1 - cell) * 0.6 + n2(x, y) * 0.25 + n3(x, y) * 0.15;
  }, 5, 3);
})();
// splot tkaniny
const fabricNormal = normalTex(256, (x, y) => {
  const wx = Math.sin((x / 256) * Math.PI * 2 * 48), wy = Math.sin((y / 256) * Math.PI * 2 * 48);
  return (((Math.floor(x / (256 / 96)) + Math.floor(y / (256 / 96))) % 2) ? wx : wy) * 0.5 + 0.5;
}, 1.6, 6);

// mahoń z jasnymi (klonowymi) fugami — klasyczny pokład Riva, wysoki połysk
const mahoganyTex = canvasTex(2048, (g, S) => {
  const rnd = makeRand(11), planks = 14, ph = S / planks;
  for (let i = 0; i < planks; i++) {
    const y = i * ph;
    const hue = 11 + rnd() * 6, sat = 55 + rnd() * 12, lig = 19 + rnd() * 6;
    const grd = g.createLinearGradient(0, y, 0, y + ph);
    grd.addColorStop(0, `hsl(${hue},${sat}%,${lig + 2}%)`);
    grd.addColorStop(0.5, `hsl(${hue + 1},${sat + 4}%,${lig + 4}%)`);
    grd.addColorStop(1, `hsl(${hue},${sat}%,${lig}%)`);
    g.fillStyle = grd;
    g.fillRect(0, y, S, ph);
    // słoje: długie, lekko faliste linie
    for (let k = 0; k < 90; k++) {
      const yy = y + 4 + rnd() * (ph - 8), amp = rnd() * 3, freq = 0.002 + rnd() * 0.006, ph0 = rnd() * 6;
      g.strokeStyle = rnd() < 0.55 ? `rgba(40,10,3,${0.06 + rnd() * 0.14})` : `rgba(170,80,40,${0.05 + rnd() * 0.1})`;
      g.lineWidth = 0.6 + rnd() * 1.8;
      g.beginPath();
      for (let x = 0; x <= S; x += 32) { const yv = yy + Math.sin(x * freq + ph0) * amp; if (x === 0) g.moveTo(x, yv); else g.lineTo(x, yv); }
      g.stroke();
    }
    // poprzeczne "płomienie" (figura drewna)
    for (let k = 0; k < 40; k++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? '255,170,120' : '30,8,2'},${0.03 + rnd() * 0.04})`;
      g.fillRect(rnd() * S, y + 3, 6 + rnd() * 30, ph - 6);
    }
    g.fillStyle = '#e9d9b2';
    g.fillRect(0, y + ph - 5, S, 5);
    g.fillStyle = 'rgba(60,30,10,0.5)';
    g.fillRect(0, y + ph - 6, S, 1);
  }
});
const teakTex = canvasTex(1024, (g, S) => {
  const rnd = makeRand(5), planks = 8, ph = S / planks;
  for (let i = 0; i < planks; i++) {
    const y = i * ph;
    g.fillStyle = `hsl(${30 + rnd() * 5}, ${34 + rnd() * 8}%, ${44 + rnd() * 8}%)`;
    g.fillRect(0, y, S, ph);
    for (let k = 0; k < 50; k++) { g.fillStyle = `rgba(${rnd() < 0.6 ? '70,40,15' : '210,170,120'},${0.05 + rnd() * 0.1})`; g.fillRect(0, y + rnd() * ph, S, 1 + rnd() * 2); }
    g.fillStyle = '#17110b'; g.fillRect(0, y + ph - 6, S, 6);
    g.fillRect(rnd() * S, y, 5, ph);
  }
});

// lakier kadłuba: biały pas dna poniżej linii wody, reszta w wybranym kolorze; metaliczne drobinki pod lakierem bezbarwnym
const hullMat = new THREE.MeshPhysicalMaterial({
  color: 0x2f5075, metalness: 0.3, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.012,
  normalMap: flakeTex, normalScale: new THREE.Vector2(0.18, 0.18),
});
hullMat.onBeforeCompile = (sh) => {
  sh.uniforms.uBottom = { value: new THREE.Color('#d9d8d2') };
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying float vLocalY;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocalY = position.y;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vLocalY;\nuniform vec3 uBottom;')
    .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(uBottom, diffuseColor.rgb, smoothstep(0.05, 0.062, vLocalY));');
};
hullMat.customProgramCacheKey = () => 'hull-bottom';

const deckMat = new THREE.MeshPhysicalMaterial({ color: 0xd8d1c0, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06 });
const mahoganyMat = new THREE.MeshPhysicalMaterial({ map: mahoganyTex, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.025, side: THREE.DoubleSide });
const teakMat = new THREE.MeshStandardMaterial({ map: teakTex, roughness: 0.82, side: THREE.DoubleSide });
const floorMat = new THREE.MeshStandardMaterial({ color: 0x323d48, roughness: 0.8, normalMap: fabricNormal, normalScale: new THREE.Vector2(0.4, 0.4), side: THREE.DoubleSide });
const leatherMat = new THREE.MeshPhysicalMaterial({ color: 0x4d6f96, roughness: 0.48, normalMap: leatherNormal, normalScale: new THREE.Vector2(0.35, 0.35), clearcoat: 0.15, clearcoatRoughness: 0.5 });
const cushionMat = new THREE.MeshPhysicalMaterial({ color: 0xd3cbb9, roughness: 0.85, sheen: 1, sheenRoughness: 0.55, sheenColor: 0xffffff, normalMap: fabricNormal, normalScale: new THREE.Vector2(0.5, 0.5) });
const pillowMat = new THREE.MeshPhysicalMaterial({ color: 0x8d9195, roughness: 0.95, sheen: 1, sheenRoughness: 0.5, sheenColor: 0xd0d4d8, normalMap: fabricNormal, normalScale: new THREE.Vector2(0.9, 0.9) });
const dashMat = new THREE.MeshPhysicalMaterial({ color: 0x1b2026, roughness: 0.5, normalMap: leatherNormal, normalScale: new THREE.Vector2(0.3, 0.3) });
const greyMat = new THREE.MeshPhysicalMaterial({ color: 0x56636a, roughness: 0.4, clearcoat: 0.6, side: THREE.DoubleSide });
const platformMat = new THREE.MeshPhysicalMaterial({ color: 0xc4c8c9, roughness: 0.3, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide });
const chromeMat = new THREE.MeshStandardMaterial({ color: 0xf4f6f8, metalness: 1, roughness: 0.06 });
const satinMat = new THREE.MeshStandardMaterial({ color: 0xd2d6da, metalness: 1, roughness: 0.18, side: THREE.DoubleSide });
const frameMat = new THREE.MeshPhysicalMaterial({ color: 0x15191d, roughness: 0.25, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 });
const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0x0c161d, metalness: 0.0, roughness: 0.02, clearcoat: 1, clearcoatRoughness: 0.0, transparent: true, opacity: 0.6,
  side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.8,
});
const screenMat = new THREE.MeshPhysicalMaterial({ color: 0x05070a, roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02 }); // ekran wyłączony
const fabricMat = new THREE.MeshPhysicalMaterial({ color: 0x2f3a46, roughness: 0.9, sheen: 1, sheenRoughness: 0.6, sheenColor: 0x9aa4ad, normalMap: fabricNormal, side: THREE.DoubleSide });
const flagMat = new THREE.MeshPhysicalMaterial({ color: 0xd8d8d4, roughness: 0.9, sheen: 0.6, side: THREE.DoubleSide });

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
      if (typeof uvScale === 'function') uv.push(...uvScale(p[0], p[1], p[2])); else uv.push(p[0] * uvScale[0], side * p[2] * uvScale[1]);
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
  hullPatch(0, 1, 0, U2, hullMat, side, (x, y, z) => [x * 3, (y + z) * 3]);
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
  const strakeOff = (s) => 0.022 * (1 - smooth(0.3, sEnd, s));
  const strakeH = (s) => HH * Math.pow(1 - smooth(0.12, sEnd, s), 0.35);
  // listwa wzdłuż burty, zanikająca ku przodowi
  for (const side of [-1, 1]) {
    gridMesh(80, 12, (a, b) => {
      const s = lerp(0, sEnd, a), th = lerp(-Math.PI / 2, Math.PI / 2, b);
      const y = yC + strakeH(s) * Math.sin(th);
      const z = widthAt(s, y) - 0.003 + strakeOff(s) * Math.pow(Math.cos(th), 0.12);
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
  const lamp = addMesh(new THREE.SphereGeometry(0.022, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e0, emissiveIntensity: 0.4, roughness: 0.2 }));
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
  dashTop.rotation.z = 0.35; // górna płyta pochylona w stronę sternika
  // ekrany (wyłączone) wpuszczone w górną płytę deski, z ramką
  for (const z of [-0.22, 0.36]) {
    const bezel = rbox(0.22, 0.012, 0.36, 0.005, frameMat, 0, 0.042, z, dashTop);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.33, 0.19), screenMat);
    scr.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    scr.position.set(0, 0.0065, 0);
    bezel.add(scr);
  }
  // kierownica (prawa strona): oś skierowana do sternika, kolumna wchodzi w deskę
  const wheel = new THREE.Group();
  wheel.position.set(dx0 - 0.1, FLOOR + 0.6, 0.36);
  wheel.rotation.z = -0.55;
  hullGroup.add(wheel);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.015, 14, 56), frameMat);
  rim.rotation.y = Math.PI / 2;
  rim.castShadow = true;
  wheel.add(rim);
  for (let k = 0; k < 3; k++) {
    const ang = k * Math.PI * 2 / 3 - Math.PI / 2;
    rod(V(0.02, 0, 0), V(0, Math.sin(ang) * 0.162, Math.cos(ang) * 0.162), 0.009, chromeMat, wheel);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.04, 24), chromeMat);
  hub.rotation.z = Math.PI / 2; hub.position.x = 0.01; hub.castShadow = true;
  wheel.add(hub);
  rod(V(0.02, 0, 0), V(0.26, 0, 0), 0.02, frameMat, wheel);
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
  const xa = 2.75, xb = 5.35, xm = (xa + xb) / 2, half = (xb - xa) / 2, W = 1.0;
  // plan z zaokrąglonymi narożnikami, wypukły przekrój, lekki spadek ku przodowi
  const wAt = (x) => W * Math.pow(1 - Math.pow(Math.abs(x - xm) / half, 6), 1 / 6);
  const yTop = (x, z) => 1.98 - 0.1 * ((x - xa) / (xb - xa)) - 0.13 * (z / W) * (z / W);
  const canvasPt = (a, b, off = 0) => { const x = lerp(xa, xb, a), w = wAt(x), z = lerp(-w, w, b); return [x, yTop(x, z) + off, z]; };
  gridMesh(40, 20, (a, b) => canvasPt(a, b), fabricMat, [1, 1], bimini);
  // obszyty brzeg
  const hem = [];
  for (let i = 0; i <= 120; i++) {
    const t = (i / 120) * Math.PI * 2, c = Math.cos(t), sn = Math.sin(t);
    const x = xm + half * Math.sign(c) * Math.pow(Math.abs(c), 1 / 3) * 0.999;
    const z = W * Math.sign(sn) * Math.pow(Math.abs(sn), 1 / 3) * 0.999;
    hem.push(V(x, yTop(x, z) - 0.008, z));
  }
  tube(hem, 0.016, fabricMat, 240, bimini, true);
  // pałąki: łuk pod płótnem przechodzący w nogi do mocowań na pokładzie
  const mount = (s, side) => { const z = side * (halfBeam(s) - 0.09); return V(s * LH, deckSurfY(s, z) + 0.03, z); };
  const bows = [[xa + 0.12, 0.33], [xm, 0.4], [xb - 0.12, 0.47]];
  for (const [x, ms] of bows) {
    const pts = [];
    const mL = mount(ms, -1), mR = mount(ms, 1), w = wAt(x) - 0.03;
    pts.push(mL, V(lerp(mL.x, x, 0.55), lerp(mL.y, yTop(x, w), 0.6), -w * 1.02));
    for (let i = 0; i <= 12; i++) { const z = lerp(-w, w, i / 12); pts.push(V(x, yTop(x, z) - 0.03, z)); }
    pts.push(V(lerp(mR.x, x, 0.55), lerp(mR.y, yTop(x, w), 0.6), w * 1.02), mR);
    tube(pts, 0.014, satinMat, 120, bimini);
  }
  // podstawy mocowań
  for (const ms of [0.33, 0.4, 0.47]) for (const side of [-1, 1]) {
    const m = mount(ms, side);
    const base = addMesh(new THREE.CylinderGeometry(0.03, 0.035, 0.03, 20), chromeMat, bimini);
    base.position.set(m.x, m.y - 0.02, m.z);
  }
}

/* ==================================================================== *
 *  Konfigurator
 * ==================================================================== */
const HULL_COLORS = [
  { name: 'Błękit stalowy', hex: '#2f5075', metal: 0.3, rough: 0.38 },
  { name: 'Kość słoniowa',  hex: '#ece2cb', metal: 0.0,  rough: 0.22 },
  { name: 'Srebrny',        hex: '#a9b0b6', metal: 0.55, rough: 0.32 },
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
  hullMat.color.set(c.hex); hullMat.metalness = c.metal; hullMat.roughness = c.rough; hullMat.normalScale.setScalar(c.metal > 0.3 ? 0.18 : 0);
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
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: HQ ? 4 : 0 }));
composer.addPass(new RenderPass(scene, camera));
let gtao = null;
if (HQ) {
  gtao = new GTAOPass(scene, camera, 1, 1);
  gtao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.6, thickness: 1.2, scale: 1.0, samples: 16, distanceFallOff: 1.0, screenSpaceRadius: false });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, radiusExponent: 1, rings: 2, samples: 16 });
  gtao.blendIntensity = 0.9;
  composer.addPass(gtao);
}
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.1, 0.4, 2.2);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = NARROW ? 44 : 30;
  camera.updateProjectionMatrix();
  water.getRenderTarget().setSize(Math.round(w * DPR * 0.6), Math.round(h * DPR * 0.6));
  composer.setPixelRatio(DPR);
  composer.setSize(w, h);
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
  composer.render();
  requestAnimationFrame(frame);
}
frame();
const loader = document.getElementById('loader');
loader.classList.add('done');
setTimeout(() => loader.remove(), 800);

window.__yacht = { camera, controls, goView, THREE, renderer, sun, sky, bloom, gtao, water, scene, hullMat, composer };
