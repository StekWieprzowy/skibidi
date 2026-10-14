// Wspólny silnik scen konfiguratorów: renderer, kamera, post-processing, otoczenie (studio / plener).
import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { Reflector } from '../vendor/Reflector.js';
import { RoomEnvironment } from '../vendor/jsm/RoomEnvironment.js';
import { Sky } from '../vendor/jsm/objects/Sky.js';
import { EffectComposer } from '../vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from '../vendor/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from '../vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/jsm/postprocessing/OutputPass.js';

export { THREE };
export const QP = new URLSearchParams(location.search);
export const EMBED = QP.has('embed');
export const LANG = (QP.get('lang') || 'pl').toLowerCase() === 'en' ? 'en' : 'pl';
export const t = (o) => (typeof o === 'string' ? o : (o[LANG] ?? o.pl));
export const NARROW = window.innerWidth / window.innerHeight < 0.8;
export const HQ = !NARROW && !/Mobi|Android/i.test(navigator.userAgent);

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
export const V = (x, y, z) => new THREE.Vector3(x, y, z);
export function makeRand(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }

if (EMBED) document.body.classList.add('embed');
if (QP.has('nopanel')) document.body.classList.add('nopanel');
if (LANG === 'en') document.documentElement.lang = 'en';

// W osadzeniu na stronie przesuwamy obraz tak, by model nie wchodził pod nagłówek strony-matki.
export function frameOffset(camera, w, h) {
  if (!EMBED) { camera.clearViewOffset(); return; }
  if (w >= 900) camera.setViewOffset(w, h, -w * 0.11, h * 0.07, w, h);
  else camera.setViewOffset(w, h, 0, -h * 0.06, w, h);
}

/* ------------------------------------------------------------------ */
export function createStage({ views, fov = 30, minDistance = 3, maxDistance = 25, maxPolar = 0.49, exposure = 1, narrowScale = 1.8 }) {
  const canvas = document.getElementById('scene');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    document.getElementById('error').style.display = 'grid';
    document.getElementById('loader')?.remove();
    throw e;
  }
  const DPR = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(DPR);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = +(QP.get('exp') || exposure);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 30000);
  if (NARROW) Object.values(views).forEach((v) => v.pos.sub(v.target).multiplyScalar(narrowScale).add(v.target));
  else if (EMBED) Object.values(views).forEach((v) => v.pos.sub(v.target).multiplyScalar(1.22).add(v.target));
  const first = Object.values(views)[0];
  camera.position.copy(first.pos);

  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(first.target);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.07, enablePan: false, minDistance, maxDistance: NARROW ? maxDistance * 1.5 : maxDistance,
    maxPolarAngle: Math.PI * maxPolar, autoRotate: true, autoRotateSpeed: 0.7 });
  if (EMBED) controls.enableZoom = false; // kółko myszy przewija stronę, nie przybliża

  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: HQ ? 4 : 0 }));
  composer.addPass(new RenderPass(scene, camera));
  let gtao = null;
  if (HQ) {
    gtao = new GTAOPass(scene, camera, 1, 1);
    gtao.updateGtaoMaterial({ radius: 0.4, distanceExponent: 1.6, thickness: 1.2, scale: 1.0, samples: 16, distanceFallOff: 1.0, screenSpaceRadius: false });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, radiusExponent: 1, rings: 2, samples: 16 });
    gtao.blendIntensity = 0.9;
    composer.addPass(gtao);
  }
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.1, 0.4, 2.2);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const resizers = [];
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = NARROW ? fov * 1.45 : fov;
    frameOffset(camera, w, h);
    camera.updateProjectionMatrix();
    composer.setPixelRatio(DPR);
    composer.setSize(w, h);
    resizers.forEach((f) => f(w, h, DPR));
  }
  window.addEventListener('resize', resize);

  const frameFns = [];
  let tween = null, paused = false;
  const clock = new THREE.Clock();
  const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  function goView(key) {
    const v = views[key];
    tween = { t0: performance.now(), dur: 1100, p0: camera.position.clone(), p1: v.pos.clone(), q0: controls.target.clone(), q1: v.target.clone() };
  }
  let raf = 0;
  function frame() {
    raf = 0;
    if (paused) return; // pętla stoi całkowicie — zero pracy w tle
    raf = requestAnimationFrame(frame);
    const time = clock.getElapsedTime();
    frameFns.forEach((f) => f(time));
    if (tween) {
      const k = clamp((performance.now() - tween.t0) / tween.dur, 0, 1), e = ease(k);
      camera.position.lerpVectors(tween.p0, tween.p1, e);
      controls.target.lerpVectors(tween.q0, tween.q1, e);
      if (k >= 1) tween = null;
    }
    controls.update();
    composer.render();
  }
  controls.addEventListener('start', () => { tween = null; });
  // strona-matka może wstrzymać demo, gdy nie jest widoczne
  window.__pause = (p) => { paused = p; if (!p && !raf) { clock.getDelta(); raf = requestAnimationFrame(frame); } };

  function start() {
    resize();
    frame();
    const loader = document.getElementById('loader');
    if (loader) { loader.classList.add('done'); setTimeout(() => loader.remove(), 800); }
  }

  return { renderer, scene, camera, controls, composer, bloom, gtao, views, goView, start,
    onFrame: (f) => frameFns.push(f), onResize: (f) => resizers.push(f), stopTween: () => { tween = null; } };
}

/* ------------------------------------------------------------------ *
 *  Studio fotograficzne: miękkie światło, ciemna lustrzana podłoga
 * ------------------------------------------------------------------ */
export function studioEnvironment(stage, { floor = '#0d0e10', bg = '#141619', reflect = 0.22, radius = 7 } = {}) {
  const { renderer, scene } = stage;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.03).texture;
  pmrem.dispose();
  const bgCol = new THREE.Color(bg);

  // tło: pionowy gradient (cyklorama)
  const backdrop = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uTop: { value: new THREE.Color(bg).multiplyScalar(0.55) }, uMid: { value: bgCol } },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uTop; uniform vec3 uMid; varying vec3 vP; void main(){ float h = normalize(vP).y;
      gl_FragColor = vec4(mix(uMid, uTop, smoothstep(0.0, 0.6, h)), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  }));
  scene.add(backdrop);

  // podłoga z odbiciem, cieniem i łagodnym przejściem w tło
  const floorShader = {
    name: 'StudioFloor',
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.lights, {
      color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
      uFloor: { value: new THREE.Color(floor) }, uBg: { value: bgCol }, uReflect: { value: reflect }, uRadius: { value: radius },
    }]),
    vertexShader: `uniform mat4 textureMatrix; varying vec4 vUv; varying vec4 worldPosition;
      #include <common>
      #include <shadowmap_pars_vertex>
      void main(){ worldPosition = modelMatrix * vec4(position, 1.0); vUv = textureMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
        #include <beginnormal_vertex>
        #include <defaultnormal_vertex>
        #include <shadowmap_vertex>
      }`,
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec3 uFloor; uniform vec3 uBg; uniform float uReflect; uniform float uRadius;
      varying vec4 vUv; varying vec4 worldPosition;
      #include <common>
      #include <packing>
      #include <bsdfs>
      #include <lights_pars_begin>
      #include <shadowmap_pars_fragment>
      #include <shadowmask_pars_fragment>
      void main(){
        float d = length(worldPosition.xz);
        vec3 refl = texture2DProj(tDiffuse, vUv).rgb;
        float shadow = getShadowMask();
        vec3 c = uFloor * mix(0.35, 1.0, shadow) * (1.0 + 0.6 * (1.0 - smoothstep(0.0, uRadius, d)));
        c += refl * uReflect * (1.0 - smoothstep(uRadius * 0.4, uRadius * 1.3, d));
        c = mix(c, uBg, smoothstep(uRadius, uRadius * 3.2, d));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  };
  const floorMesh = new Reflector(new THREE.CircleGeometry(60, 96), {
    shader: floorShader, clipBias: 0.003, multisample: HQ ? 4 : 0,
    textureWidth: Math.round(window.innerWidth * 0.6), textureHeight: Math.round(window.innerHeight * 0.6),
  });
  floorMesh.material.lights = true;
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.receiveShadow = true;
  const mirror = floorMesh.onBeforeRender;
  floorMesh.onBeforeRender = function (r, s, c, ...rest) { if (s.overrideMaterial) return; mirror.call(this, r, s, c, ...rest); };
  scene.add(floorMesh);
  stage.onResize((w, h, dpr) => floorMesh.getRenderTarget().setSize(Math.round(w * dpr * 0.6), Math.round(h * dpr * 0.6)));

  // światło główne z góry (miękkie cienie) + boczne wypełnienie
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2, 10, 3);
  key.castShadow = true;
  key.shadow.mapSize.set(HQ ? 4096 : 2048, HQ ? 4096 : 2048);
  Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 30 });
  key.shadow.radius = 8; key.shadow.bias = -0.0002; key.shadow.normalBias = 0.02;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xdfe8ff, 0.8);
  rim.position.set(-6, 3, -5);
  scene.add(rim);
  return { key, floor: floorMesh };
}

/* ------------------------------------------------------------------ *
 *  Plener: fizyczne niebo, wzgórza, łąka, drzewa, słońce
 * ------------------------------------------------------------------ */
export function outdoorEnvironment(stage, { sunEl = 32, sunAz = 120, sunIntensity = 22, cloud = 0.4, grass = ['#3f5a2a', '#6b7a3a', '#8a7a4c'], haze = '#b9c9d5', trees = true } = {}) {
  const { renderer, scene } = stage;
  const SCENE_LIGHT = 2.4;
  const el = +(QP.get('el') || sunEl), az = +(QP.get('az') || sunAz);
  const SUN = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - el), THREE.MathUtils.degToRad(az));

  const sky = new Sky();
  sky.scale.setScalar(10000);
  const u = sky.material.uniforms;
  u.turbidity.value = 1.8; u.rayleigh.value = 2.2; u.mieCoefficient.value = 0.003; u.mieDirectionalG.value = 0.82;
  u.cloudCover.value = cloud; u.sunPosition.value.copy(SUN);

  const hazeCol = new THREE.Color(haze).multiplyScalar(SCENE_LIGHT * 1.1);
  scene.fog = new THREE.Fog(hazeCol, 60, 700);

  const hills = makeHills(SCENE_LIGHT);

  // łąka: kolor generowany z pozycji w świecie (bez tekstur)
  const groundMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.97 });
  groundMat.onBeforeCompile = (sh) => {
    sh.uniforms.uG0 = { value: new THREE.Color(grass[0]) };
    sh.uniforms.uG1 = { value: new THREE.Color(grass[1]) };
    sh.uniforms.uG2 = { value: new THREE.Color(grass[2]) };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWP; uniform vec3 uG0; uniform vec3 uG1; uniform vec3 uG2;
      float gh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(gh(i), gh(i + vec2(1, 0)), f.x), mix(gh(i + vec2(0, 1)), gh(i + vec2(1, 1)), f.x), f.y); }
      float gf(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * gn(p); p *= 2.07; a *= 0.5; } return v; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      vec2 gp = vWP.xz;
      float big = gf(gp * 0.06), mid = gf(gp * 0.45), fine = gn(gp * 14.0) * 0.5 + gn(gp * 37.0) * 0.5;
      vec3 g = mix(uG0, uG1, smoothstep(0.35, 0.7, big * 0.7 + mid * 0.3));
      g = mix(g, uG2, smoothstep(0.62, 0.82, gf(gp * 0.03 + 7.0)) * 0.6);
      g *= 0.82 + 0.3 * fine;
      diffuseColor.rgb = g;`);
  };
  const ground = new THREE.Mesh(new THREE.CircleGeometry(2400, 96).rotateX(-Math.PI / 2), groundMat);
  ground.receiveShadow = true;
  scene.add(ground);

  // drzewa iglaste w oddali (we mgle), wielowarstwowe, z różną wysokością i odcieniem
  if (trees) {
    const rnd = makeRand(9);
    const cone = new THREE.ConeGeometry(1, 1, 7);
    cone.translate(0, 0.5, 0);
    const treeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
    const LAYERS = 6, N = 900;
    const inst = new THREE.InstancedMesh(cone, treeMat, N * LAYERS);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    let k = 0;
    for (let i = 0; i < N; i++) {
      const ang = rnd() * Math.PI * 2, r = 150 + Math.pow(rnd(), 0.9) * 300;
      const h = 14 + rnd() * 16, w = h * (0.22 + rnd() * 0.06);
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
      const shade = 0.75 + rnd() * 0.4;
      for (let j = 0; j < LAYERS; j++) {
        const f = 1 - j / LAYERS;
        e.set((rnd() - 0.5) * 0.08, rnd() * 6, (rnd() - 0.5) * 0.08); q.setFromEuler(e);
        p.set(x, h * (0.12 + j * 0.14), z);
        sc.set(w * f * (0.9 + rnd() * 0.2), h * 0.3, w * f * (0.9 + rnd() * 0.2));
        m.compose(p, q, sc);
        inst.setMatrixAt(k, m);
        inst.setColorAt(k++, col.setRGB(0.035 * shade, 0.06 * shade, 0.035 * shade));
      }
    }
    inst.count = k;
    scene.add(inst);
  }

  // mapa otoczenia: niebo + wzgórza + ziemia, bez tarczy słońca
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  env.add(sky); env.add(hills);
  const disk = new THREE.Mesh(new THREE.CircleGeometry(8000, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(grass[0]).multiplyScalar(SCENE_LIGHT * 0.5) }));
  disk.position.y = -1; env.add(disk);
  u.sunDiskScale.value = 0;
  scene.environment = pmrem.fromScene(env, 0.0, 0.1, 30000).texture;
  u.sunDiskScale.value = 1;
  pmrem.dispose();
  scene.add(sky); scene.add(hills);

  scene.add(new THREE.HemisphereLight(0xdfeaf2, 0x2b3a20, 0.15));
  const sun = new THREE.DirectionalLight(0xfff1dc, +(QP.get('sun') || sunIntensity));
  sun.position.copy(SUN).multiplyScalar(30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(HQ ? 4096 : 2048, HQ ? 4096 : 2048);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 5, far: 70 });
  sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.015; sun.shadow.radius = 3;
  scene.add(sun);
  return { sun, sky, ground, SCENE_LIGHT };
}

function makeHills(SCENE_LIGHT) {
  const N = 720, R = 2600, pos = [], idx = [];
  const rnd = makeRand(77), oct = [[3, 0.5], [7, 0.28], [17, 0.14], [41, 0.06], [97, 0.025]].map(([f, a]) => [f, a, rnd() * 6.28, rnd() * 6.28]);
  for (let i = 0; i <= N; i++) {
    const th = (i / N) * Math.PI * 2;
    let h = 0;
    for (const [f, a, p1, p2] of oct) h += a * (Math.sin(th * f + p1) * 0.6 + Math.sin(th * f * 1.7 + p2) * 0.4);
    h = 60 + 170 * Math.max(0, h + 0.35);
    const x = Math.cos(th) * R, z = Math.sin(th) * R;
    pos.push(x, -20, z, x, h, z);
  }
  for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return new THREE.Mesh(g, new THREE.ShaderMaterial({
    side: THREE.DoubleSide, fog: false,
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
        gl_FragColor = vec4(mix(uNear * (0.75 + 0.5 * tex), uFar, haze), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
}

/* ------------------------------------------------------------------ *
 *  Proceduralne tekstury
 * ------------------------------------------------------------------ */
export function canvasTexture(renderer, size, draw, { srgb = true, repeat = true } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const tx = new THREE.CanvasTexture(c);
  if (repeat) tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  if (srgb) tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tx;
}
export function flakeTexture() {
  const rnd = makeRand(3), S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const nx = (rnd() - 0.5) * 1.2, ny = (rnd() - 0.5) * 1.2, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    img.data[i * 4] = (nx * 0.5 + 0.5) * 255; img.data[i * 4 + 1] = (ny * 0.5 + 0.5) * 255; img.data[i * 4 + 2] = (nz * 0.5 + 0.5) * 255; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tx = new THREE.CanvasTexture(c);
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  return tx;
}

/* ------------------------------------------------------------------ *
 *  Geometria parametryczna
 * ------------------------------------------------------------------ */
// siatka fn(a,b) -> [x,y,z]; normalne liczone z geometrii
export function gridGeometry(nu, nv, fn, uvFn) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
    const p = fn(i / nu, j / nv);
    pos.push(p[0], p[1], p[2]);
    uv.push(...(uvFn ? uvFn(p, i / nu, j / nv) : [i / nu, j / nv]));
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i * (nv + 1) + j, b = a + 1, c = a + nv + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
export function rod(a, b, r, mat, parent, seg = 12) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), seg), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
export function tube(points, r, mat, parent, segs = 64, closed = false) {
  const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, closed, 'centripetal'), segs, r, 10, closed), mat);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
export function mesh(geo, mat, parent, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast; m.receiveShadow = receive;
  parent.add(m);
  return m;
}
