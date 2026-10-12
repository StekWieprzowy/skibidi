import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';

/* ------------------------------------------------------------------ *
 *  Wymiary i funkcje kształtu kadłuba (x: rufa 0 → dziób L, y: góra, z: burta)
 * ------------------------------------------------------------------ */
const L = 8.35;
const HB = 1.25; // połowa szerokości

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

function halfBeam(s) {
  const mid = 0.42;
  if (s < mid) { const k = (mid - s) / mid; return HB * (1 - 0.13 * k * k); }
  const k = (s - mid) / (1 - mid);
  return HB * Math.pow(Math.max(0, 1 - Math.pow(k, 1.9)), 0.85);
}
const deckY = (s) => 0.68 + 0.1 * (1 - s) * (1 - s) + 0.46 * Math.pow(s, 3.2);
const keelY = (s) => {
  const yd = deckY(s);
  return -0.5 + (yd + 0.5) * Math.pow(smooth(0.5, 1.0, s), 1.7);
};

// przekrój poprzeczny: (z/b, (y-keel)/(deck-keel)) od stępki do krawędzi pokładu
const PROFILE = new THREE.SplineCurve([
  new THREE.Vector2(0, 0), new THREE.Vector2(0.26, 0.02), new THREE.Vector2(0.52, 0.07),
  new THREE.Vector2(0.75, 0.17), new THREE.Vector2(0.9, 0.36), new THREE.Vector2(0.97, 0.62),
  new THREE.Vector2(1, 1),
]);
const PROFILE_PTS = PROFILE.getPoints(14);
const PROFILE_FINE = PROFILE.getPoints(80);

// szerokość kadłuba (połowa) na stacji s, na wysokości y
function widthAt(s, y) {
  const yk = keelY(s), yd = deckY(s);
  const hf = clamp((y - yk) / (yd - yk), 0, 1);
  for (let i = 1; i < PROFILE_FINE.length; i++) {
    const a = PROFILE_FINE[i - 1], b = PROFILE_FINE[i];
    if (hf <= b.y) { const t = (hf - a.y) / Math.max(1e-6, b.y - a.y); return halfBeam(s) * lerp(a.x, b.x, t); }
  }
  return halfBeam(s);
}

/* ------------------------------------------------------------------ *
 *  Renderer, scena, kamera
 * ------------------------------------------------------------------ */
const canvas = document.getElementById('scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
} catch (e) {
  document.getElementById('error').style.display = 'grid';
  document.getElementById('loader').remove();
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 4000);

const TARGET = new THREE.Vector3(0, 0.85, 0);
const VIEWS = {
  iso:  { label: '3/4',  pos: new THREE.Vector3(6.4, 3.0, 7.4) },
  side: { label: 'Bok',  pos: new THREE.Vector3(0.01, 1.6, 15) },
  top:  { label: 'Góra', pos: new THREE.Vector3(0.01, 16, 0.9) },
  rear: { label: 'Rufa', pos: new THREE.Vector3(-13, 2.6, 2.2) },
};
// na wąskich ekranach (telefon) kamera startuje dalej, żeby cały jacht się mieścił
const NARROW = window.innerWidth / window.innerHeight < 0.8;
if (NARROW) Object.values(VIEWS).forEach((v) => v.pos.multiplyScalar(1.9));
camera.position.copy(VIEWS.iso.pos);

const controls = new OrbitControls(camera, canvas);
controls.target.copy(TARGET);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.enablePan = false;
controls.minDistance = 5;
controls.maxDistance = NARROW ? 45 : 32;
controls.maxPolarAngle = Math.PI * 0.495;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.9;

/* ------------------------------------------------------------------ *
 *  Niebo i woda (shadery)
 * ------------------------------------------------------------------ */
const SUN_DIR = new THREE.Vector3(0.6, 0.5, 0.45).normalize();
const C_HORIZON = new THREE.Color('#d6e6ee');
const C_ZENITH = new THREE.Color('#4f8fc0');
const C_DEEP = new THREE.Color('#0a3550');
const C_SHALLOW = new THREE.Color('#2c8aa0');

const skyChunk = /* glsl */`
  uniform vec3 uSun; uniform vec3 uHorizon; uniform vec3 uZenith; uniform vec3 uDeep;
  vec3 skyColor(vec3 d) {
    float h = clamp(d.y, 0.0, 1.0);
    vec3 c = mix(uHorizon, uZenith, pow(h, 0.5));
    float sd = max(dot(d, normalize(uSun)), 0.0);
    c += vec3(1.0, 0.92, 0.75) * (pow(sd, 700.0) * 6.0 + pow(sd, 18.0) * 0.18);
    if (d.y < 0.0) c = mix(c, uDeep, smoothstep(0.0, -0.25, d.y));
    return c;
  }`;
const sharedUniforms = () => ({
  uSun: { value: SUN_DIR }, uHorizon: { value: C_HORIZON }, uZenith: { value: C_ZENITH }, uDeep: { value: C_DEEP },
});

const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: sharedUniforms(),
  vertexShader: /* glsl */`varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`${skyChunk}
    varying vec3 vDir;
    void main(){ gl_FragColor = vec4(skyColor(normalize(vDir)), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
const skyGeo = new THREE.SphereGeometry(1800, 32, 16);
scene.add(new THREE.Mesh(skyGeo, skyMat));

// mapa otoczenia (odbicia na lakierze) z samego nieba
const envScene = new THREE.Scene();
envScene.add(new THREE.Mesh(skyGeo, skyMat));
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(envScene, 0.02).texture;

const waterMat = new THREE.ShaderMaterial({
  uniforms: { ...sharedUniforms(), uTime: { value: 0 }, uShallow: { value: C_SHALLOW } },
  vertexShader: /* glsl */`varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: /* glsl */`${skyChunk}
    uniform float uTime; uniform vec3 uShallow;
    varying vec3 vWorld;
    vec2 waveGrad(vec2 p, float t) {
      vec2 g = vec2(0.0);
      vec2 d; float k, a, w;
      d = normalize(vec2( 1.0, 0.3)); k = 0.55; a = 0.040; w = 1.1; g += d * a * k * cos(k * dot(d, p) + w * t);
      d = normalize(vec2(-0.6, 1.0)); k = 0.90; a = 0.040; w = 1.4; g += d * a * k * cos(k * dot(d, p) + w * t);
      d = normalize(vec2( 0.4,-1.0)); k = 1.70; a = 0.020; w = 1.9; g += d * a * k * cos(k * dot(d, p) + w * t);
      d = normalize(vec2(-1.0,-0.4)); k = 3.10; a = 0.010; w = 2.6; g += d * a * k * cos(k * dot(d, p) + w * t);
      d = normalize(vec2( 0.8, 0.9)); k = 6.00; a = 0.004; w = 3.4; g += d * a * k * cos(k * dot(d, p) + w * t);
      return g;
    }
    void main(){
      vec3 toCam = cameraPosition - vWorld;
      float dist = length(toCam);
      vec3 v = toCam / dist;
      vec2 g = waveGrad(vWorld.xz, uTime) * (1.0 - smoothstep(60.0, 400.0, dist) * 0.8);
      vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
      vec3 r = reflect(-v, n); r.y = abs(r.y);
      float fres = 0.03 + 0.97 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
      vec3 body = mix(uDeep, uShallow, clamp(0.35 + g.x * 2.0 + g.y * 1.5, 0.0, 1.0));
      vec3 col = mix(body, skyColor(r), fres);
      col = mix(col, uHorizon, smoothstep(120.0, 900.0, dist));
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
const water = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), waterMat);
water.rotation.x = -Math.PI / 2;
scene.add(water);

/* ------------------------------------------------------------------ *
 *  Światła
 * ------------------------------------------------------------------ */
scene.add(new THREE.HemisphereLight(0xe6f1f8, 0x3a7088, 1.0));
const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
sun.position.copy(SUN_DIR).multiplyScalar(30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 70 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun);

/* ------------------------------------------------------------------ *
 *  Materiały
 * ------------------------------------------------------------------ */
function teakTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#9a7650';
  g.fillRect(0, 0, 512, 512);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const planks = 8, ph = 512 / planks;
  for (let i = 0; i < planks; i++) {
    const y = i * ph;
    g.fillStyle = `hsl(${27 + rnd() * 5}, ${38 + rnd() * 8}%, ${40 + rnd() * 8}%)`;
    g.fillRect(0, y, 512, ph);
    for (let k = 0; k < 14; k++) {
      g.fillStyle = `rgba(20,12,6,${0.05 + rnd() * 0.07})`;
      g.fillRect(0, y + rnd() * ph, 512, 1);
    }
    g.fillStyle = 'rgba(20,14,8,0.9)';
    g.fillRect(0, y + ph - 2, 512, 2);
    g.fillRect(rnd() * 512, y, 2, ph);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const hullMat = new THREE.MeshPhysicalMaterial({
  vertexColors: true, roughness: 0.28, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, side: THREE.DoubleSide,
});
const paintMat = new THREE.MeshPhysicalMaterial({ color: 0xf3ead8, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, side: THREE.DoubleSide });
const teakMat = new THREE.MeshStandardMaterial({ map: teakTexture(), roughness: 0.75, side: THREE.DoubleSide });
const cushionMat = new THREE.MeshStandardMaterial({ color: 0xefe8d8, roughness: 0.65, side: THREE.DoubleSide });
const coverMat = new THREE.MeshStandardMaterial({ color: 0x5a6869, roughness: 0.85 });
const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe4e7ea, metalness: 0.55, roughness: 0.3 });
const trimMat = new THREE.MeshStandardMaterial({ color: 0xc4beb2, metalness: 0.5, roughness: 0.35 });
const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x9cc3d3, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false });
const fabricMat = new THREE.MeshStandardMaterial({ color: 0xf5f2ea, roughness: 0.9, transparent: true, opacity: 0.55, side: THREE.DoubleSide });

/* ------------------------------------------------------------------ *
 *  Geometria: pomocnicze funkcje
 * ------------------------------------------------------------------ */
const boat = new THREE.Group();     // kołysanie
const hullGroup = new THREE.Group(); // modele w układzie rufa=0
hullGroup.position.x = -L / 2;
boat.add(hullGroup);
scene.add(boat);

function addMesh(geo, mat, parent = hullGroup) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}

// siatka parametryczna fn(a,b) -> Vector3, a,b ∈ [0,1]
function gridGeo(nu, nv, fn, uv = [0.35, 1]) {
  const pos = [], uvs = [], idx = [];
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
    const p = fn(i / nu, j / nv);
    pos.push(p.x, p.y, p.z);
    uvs.push(p.x * uv[0], (p.z + p.y) * uv[1]);
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i * (nv + 1) + j, b = a + 1, c = a + nv + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// powierzchnia poziomo-podobna na całej szerokości: y(s,v), halfW(s)
function deckPatch(s0, s1, yFn, hwFn, mat, uv) {
  return addMesh(gridGeo(40, 10, (a, b) => {
    const s = lerp(s0, s1, a), v = lerp(-1, 1, b);
    return new THREE.Vector3(s * L, yFn(s, v), v * hwFn(s));
  }, uv), mat);
}

// ściana poprzeczna na stacji s od y0 do y1
function bulkhead(s, y0, y1, mat) {
  return addMesh(gridGeo(8, 12, (a, b) => {
    const y = lerp(y0, y1, a), v = lerp(-1, 1, b);
    return new THREE.Vector3(s * L, y, v * (widthAt(s, y) - 0.005));
  }), mat);
}

function rod(a, b, r, mat, parent = hullGroup) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 10), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  m.castShadow = true;
  parent.add(m);
  return m;
}

function tubeAlong(points, r, mat, parent = hullGroup) {
  const curve = new THREE.CatmullRomCurve3(points);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, points.length * 2, r, 8, false), mat);
  m.castShadow = true;
  parent.add(m);
  return m;
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* ------------------------------------------------------------------ *
 *  Kadłub
 * ------------------------------------------------------------------ */
const NS = 90;
const M = PROFILE_PTS.length * 2 - 1;
const hullGeo = (() => {
  const pos = [], idx = [];
  for (let i = 0; i <= NS; i++) {
    const s = 1 - Math.pow(1 - i / NS, 1.5);
    const yk = keelY(s), yd = deckY(s), b = halfBeam(s);
    const pt = (p, sign) => pos.push(s * L, yk + (yd - yk) * p.y, sign * b * p.x);
    for (let j = PROFILE_PTS.length - 1; j >= 1; j--) pt(PROFILE_PTS[j], -1);
    pt(PROFILE_PTS[0], 1);
    for (let j = 1; j < PROFILE_PTS.length; j++) pt(PROFILE_PTS[j], 1);
  }
  for (let i = 0; i < NS; i++) for (let j = 0; j < M - 1; j++) {
    const a = i * M + j, b = a + 1, c = a + M, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // pawęż (lustro rufowe)
  const centerIdx = pos.length / 3;
  let cy = 0;
  for (let j = 0; j < M; j++) cy += pos[j * 3 + 1];
  pos.push(0, cy / M, 0);
  for (let j = 0; j < M; j++) idx.push(centerIdx, j, (j + 1) % M);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
})();
addMesh(hullGeo, hullMat);

const ANTIFOUL = new THREE.Color('#14202a');
function paintHull(hex) {
  const c = new THREE.Color(hex);
  const p = hullGeo.attributes.position, col = hullGeo.attributes.color;
  const tmp = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    tmp.copy(ANTIFOUL).lerp(c, smooth(0.0, 0.07, p.getY(i)));
    col.setXYZ(i, tmp.r, tmp.g, tmp.b);
  }
  col.needsUpdate = true;
  paintMat.color.copy(c);
}

// reling burtowy + "swoosh" wzdłuż burty
for (const sign of [-1, 1]) {
  const gun = [], sw = [];
  for (let i = 0; i <= 60; i++) {
    const s = i / 60;
    gun.push(V(s * L, deckY(s) + 0.012, sign * halfBeam(s) * 0.998));
  }
  tubeAlong(gun, 0.022, trimMat);
  for (let i = 0; i <= 50; i++) {
    const s = lerp(0.03, 0.94, i / 50);
    const y = deckY(s) - 0.17 - 0.22 * (1 - smooth(0.1, 0.9, s));
    sw.push(V(s * L, y, sign * (widthAt(s, y) + 0.008)));
  }
  tubeAlong(sw, 0.016, trimMat);
}
rod(V(0.005, deckY(0) + 0.012, -halfBeam(0)), V(0.005, deckY(0) + 0.012, halfBeam(0)), 0.022, trimMat);

/* ------------------------------------------------------------------ *
 *  Pokład, kokpit
 * ------------------------------------------------------------------ */
// pokład dziobowy (teak) + ściana grodziowa
deckPatch(0.5, 1.0, (s, v) => deckY(s) + 0.006 + 0.05 * (1 - v * v), (s) => Math.max(0, halfBeam(s) - 0.08), teakMat, [0.4, 1.0]);
// pokład rufowy (teak)
deckPatch(0.0, 0.1, (s, v) => deckY(s) + 0.006 + 0.03 * (1 - v * v), (s) => halfBeam(s) - 0.07, teakMat, [0.4, 1.0]);
// leżanka rufowa
deckPatch(0.1, 0.28, (s, v) => deckY(s) - 0.07 + 0.05 * (1 - v * v), (s) => halfBeam(s) - 0.08, cushionMat);
bulkhead(0.28, 0.34, deckY(0.28) - 0.07, paintMat);
bulkhead(0.5, 0.34, deckY(0.5), paintMat);

// podłoga kokpitu + teakowy pas środkowy
deckPatch(0.28, 0.5, () => 0.34, (s) => widthAt(s, 0.34) - 0.01, cushionMat);
deckPatch(0.29, 0.49, () => 0.345, () => 0.3, teakMat, [0.4, 1.0]);

// siedziska burtowe
for (const sign of [-1, 1]) {
  const s0 = 0.31, s1 = 0.485, yS = 0.64, zIn = 0.48;
  const top = addMesh(gridGeo(24, 4, (a, b) => {
    const s = lerp(s0, s1, a);
    const z = lerp(zIn, widthAt(s, yS) - 0.01, b);
    return V(s * L, yS, sign * z);
  }), cushionMat);
  const front = addMesh(gridGeo(24, 2, (a, b) => V(lerp(s0, s1, a) * L, lerp(0.34, yS, b), sign * zIn)), cushionMat);
  const end = addMesh(gridGeo(4, 4, (a, b) => {
    const y = lerp(0.34, yS, a);
    return V(s1 * L, y, sign * lerp(zIn, widthAt(s1, y) - 0.01, b));
  }), cushionMat);
  void top; void front; void end;
}

// konsola sterowa + szyba
const consoleBox = addMesh(new THREE.BoxGeometry(0.55, 0.22, 2.1), paintMat);
consoleBox.position.set(4.42, 0.93, 0);
const dashTop = addMesh(new THREE.BoxGeometry(0.5, 0.03, 1.9), new THREE.MeshStandardMaterial({ color: 0x2b3036, roughness: 0.5 }));
dashTop.position.set(4.46, 1.045, 0);

const wind = new THREE.Group();
wind.position.set(4.34, 1.03, 0);
wind.rotation.z = 0.5;
hullGroup.add(wind);
const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.5), glassMat);
glass.rotation.y = Math.PI / 2;
glass.position.y = 0.25;
wind.add(glass);
const wz = 1.05;
for (const [a, b] of [[V(0, 0, -wz), V(0, 0, wz)], [V(0, 0.5, -wz), V(0, 0.5, wz)], [V(0, 0, -wz), V(0, 0.5, -wz)], [V(0, 0, wz), V(0, 0.5, wz)]]) rod(a, b, 0.014, chromeMat, wind);

// pokrowiec (szary) przed szybą
const cover = addMesh(new THREE.SphereGeometry(1, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2), coverMat);
cover.scale.set(0.85, 0.34, 0.96);
cover.position.set(5.3, deckY(0.63) + 0.01, 0);

// maszt flagi
rod(V(0.35, deckY(0.04), 0), V(0.35, deckY(0.04) + 0.95, 0), 0.01, chromeMat);
const flag = addMesh(new THREE.PlaneGeometry(0.34, 0.22), new THREE.MeshStandardMaterial({ color: 0xf6f6f2, side: THREE.DoubleSide, roughness: 0.9 }));
flag.rotation.y = Math.PI / 2;
flag.position.set(0.35, deckY(0.04) + 0.82, -0.17);

// knagi i zaczep dziobowy
for (const [x, sign] of [[6.9, -1], [6.9, 1], [1.2, -1], [1.2, 1]]) {
  const s = x / L;
  const c = addMesh(new THREE.CapsuleGeometry(0.025, 0.16, 4, 8), chromeMat);
  c.rotation.z = Math.PI / 2;
  c.position.set(x, deckY(s) + 0.05, sign * (halfBeam(s) - 0.17));
}
const roller = addMesh(new THREE.CylinderGeometry(0.035, 0.035, 0.26, 12), chromeMat);
roller.rotation.x = Math.PI / 2;
roller.position.set(L - 0.12, deckY(1) - 0.03, 0);

/* ------------------------------------------------------------------ *
 *  Bimini
 * ------------------------------------------------------------------ */
const bimini = new THREE.Group();
hullGroup.add(bimini);
{
  const x1 = 3.05, x2 = 5.55, w = 0.95, y1 = 2.2, y2 = 2.02;
  const corners = [V(x1, y1, -w), V(x1, y1, w), V(x2, y2, w), V(x2, y2, -w)];
  const mk = (a, b) => rod(a, b, 0.017, chromeMat, bimini);
  mk(corners[0], corners[1]); mk(corners[1], corners[2]); mk(corners[2], corners[3]); mk(corners[3], corners[0]);
  // nogi
  mk(corners[0], V(2.9, 0.72, -1.08));
  mk(corners[1], V(2.9, 0.72, 1.08));
  mk(corners[3], V(5.0, 0.8, -1.08));
  mk(corners[2], V(5.0, 0.8, 1.08));
  // poprzeczka w środku
  mk(V((x1 + x2) / 2, (y1 + y2) / 2, -w), V((x1 + x2) / 2, (y1 + y2) / 2, w));
  // płótno
  const g = new THREE.BufferGeometry();
  const cps = [corners[0], corners[1], corners[2], corners[3]];
  const arr = [];
  for (const i of [0, 1, 2, 0, 2, 3]) arr.push(cps[i].x, cps[i].y + 0.012, cps[i].z);
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  g.computeVertexNormals();
  bimini.add(new THREE.Mesh(g, fabricMat));
}

/* ------------------------------------------------------------------ *
 *  UI: kolory, widoki, bimini
 * ------------------------------------------------------------------ */
const COLORS = [
  { name: 'Krem',          hex: '#f1e6cf' },
  { name: 'Biel',          hex: '#f3f5f7' },
  { name: 'Granat',        hex: '#16294e' },
  { name: 'Burgund',       hex: '#6e1d2a' },
  { name: 'Butelkowa zieleń', hex: '#1d4a3a' },
  { name: 'Grafit',        hex: '#2b3036' },
  { name: 'Turkus',        hex: '#2f8f95' },
];
const swatchBox = document.getElementById('swatches');
const colorName = document.getElementById('colorName');
function selectColor(i, push = true) {
  const c = COLORS[i];
  paintHull(c.hex);
  colorName.textContent = c.name;
  [...swatchBox.children].forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
  if (push) { try { history.replaceState(null, '', '#c=' + i); } catch (e) { /* file:// */ } }
}
COLORS.forEach((c, i) => {
  const b = document.createElement('button');
  b.className = 'swatch'; b.style.setProperty('--c', c.hex);
  b.title = c.name; b.setAttribute('aria-label', 'Kolor kadłuba: ' + c.name);
  b.addEventListener('click', () => selectColor(i));
  swatchBox.appendChild(b);
});
const fromHash = parseInt((location.hash.match(/c=(\d+)/) || [])[1], 10);
selectColor(Number.isInteger(fromHash) && COLORS[fromHash] ? fromHash : 0, false);

document.getElementById('bimini').addEventListener('change', (e) => { bimini.visible = e.target.checked; });

// widoki kamery z płynnym przejściem
const viewsBox = document.getElementById('views');
let tween = null;
function goView(key) {
  const to = VIEWS[key].pos;
  tween = { t0: performance.now(), dur: 900, from: camera.position.clone(), to: to.clone() };
  autoOn = false; controls.autoRotate = false;
  [...viewsBox.children].forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.key === key)));
}
Object.entries(VIEWS).forEach(([key, v]) => {
  const b = document.createElement('button');
  b.className = 'chip'; b.textContent = v.label; b.dataset.key = key; b.setAttribute('aria-pressed', 'false');
  b.addEventListener('click', () => goView(key));
  viewsBox.appendChild(b);
});
const autoBtn = document.createElement('button');
autoBtn.className = 'chip'; autoBtn.textContent = 'Auto-obrót'; autoBtn.setAttribute('aria-pressed', 'true');
viewsBox.appendChild(autoBtn);

let autoOn = true, idleTimer = 0;
function setAuto(on) {
  autoOn = on; controls.autoRotate = on;
  autoBtn.setAttribute('aria-pressed', String(on));
  if (on) [...viewsBox.children].forEach((b) => b.dataset.key && b.setAttribute('aria-pressed', 'false'));
}
autoBtn.addEventListener('click', () => setAuto(!autoOn));
controls.addEventListener('start', () => {
  tween = null; clearTimeout(idleTimer); controls.autoRotate = false;
  document.getElementById('hint').classList.add('hide');
});
controls.addEventListener('end', () => {
  clearTimeout(idleTimer);
  if (autoOn) idleTimer = setTimeout(() => { controls.autoRotate = true; }, 5000);
});
setTimeout(() => document.getElementById('hint').classList.add('hide'), 7000);

/* ------------------------------------------------------------------ *
 *  Pętla
 * ------------------------------------------------------------------ */
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = NARROW ? 50 : 38;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
function frame() {
  const t = clock.getElapsedTime();
  waterMat.uniforms.uTime.value = t;
  boat.position.y = Math.sin(t * 1.1) * 0.022;
  boat.rotation.x = Math.sin(t * 0.9) * 0.010;
  boat.rotation.z = Math.sin(t * 0.7 + 1) * 0.007;

  if (tween) {
    const k = clamp((performance.now() - tween.t0) / tween.dur, 0, 1);
    camera.position.lerpVectors(tween.from, tween.to, ease(k));
    if (k >= 1) tween = null;
  }
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
document.getElementById('loader').classList.add('done');
setTimeout(() => document.getElementById('loader').remove(), 800);

// do testów / debugowania
window.__yacht = { camera, controls, selectColor, goView, THREE };
