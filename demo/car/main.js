import { THREE, createStage, studioEnvironment, V } from '../common/stage.js';
import { buildUI } from '../common/ui.js';
import { GLTFLoader } from '../vendor/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '../vendor/jsm/libs/meshopt_decoder.module.js';

/* Konfigurator auta na prawdziwym modelu glTF.
   Model: „Car Concept”, Eric Chadwick / Darmstadt Graphics Group GmbH, CC BY 4.0
   (na bazie modelu CC0 autorstwa Unity Fan). Logotypy Khronos usunięte, tekstury skompresowane. */

const stage = createStage({
  views: {
    iso:      { label: { pl: '3/4', en: '3/4' },          pos: V(5.6, 1.7, 5.4),    target: V(0, 0.55, 0) },
    side:     { label: { pl: 'Bok', en: 'Side' },         pos: V(0.01, 1.0, 9.2),   target: V(0, 0.6, 0) },
    front:    { label: { pl: 'Przód', en: 'Front' },      pos: V(7.4, 1.0, 1.4),    target: V(0, 0.55, 0) },
    rear:     { label: { pl: 'Tył', en: 'Rear' },         pos: V(-6.4, 1.5, -3.2),  target: V(0, 0.55, 0) },
  },
  fov: 30, minDistance: 2.6, maxDistance: 14, exposure: 1.0, maxPolar: 0.48,
});
const { scene, renderer } = stage;
studioEnvironment(stage, { floor: '#2f3136', bg: '#3a3d42', reflect: 0.2, radius: 5 });

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

const gltf = await loader.loadAsync('../assets/car-concept.glb');
const car = gltf.scene;

// Normalizacja: długość wzdłuż osi x, koła na podłodze, środek w (0, 0).
let box = new THREE.Box3().setFromObject(car);
const size = box.getSize(new THREE.Vector3());
if (size.z > size.x) car.rotation.y = Math.PI / 2;
car.updateMatrixWorld(true);
box = new THREE.Box3().setFromObject(car);
const c = box.getCenter(new THREE.Vector3());
car.position.x -= c.x; car.position.z -= c.z; car.position.y -= box.min.y;
const holder = new THREE.Group();
holder.add(car);
holder.rotation.y = +(new URLSearchParams(location.search).get('flip') || 0) ? Math.PI : 0;
scene.add(holder);

const M = {};
car.traverse((o) => {
  if (!o.isMesh) return;
  o.castShadow = true; o.receiveShadow = true;
  const mats = Array.isArray(o.material) ? o.material : [o.material];
  mats.forEach((m) => { if (m && m.name) M[m.name] = m; m.envMapIntensity = 1.0; });
});
renderer.compile(scene, stage.camera);

// Materiały konfigurowalne
const paint = M['Paint 1 Carmine'];
const accent = M['Paint 2 Carmine'];
const seats = M['Interior 3 Carmine'];
const rimA = M['Rim2'], rimB = M['Rim1'];
const brake = M['Brake'];
const lights = ['Headlight', 'Brakelight', 'Signallight'].map((n) => M[n]).filter(Boolean);
const lightBase = lights.map((m) => ({ m, color: m.emissive.clone(), i: m.emissiveIntensity }));

const PAINTS = [
  { name: { pl: 'Czerwień Carmine', en: 'Carmine red' }, hex: '#9e0b0b', metal: 0.6, rough: 0.35 },
  { name: { pl: 'Grafit', en: 'Graphite' }, hex: '#2b2e33', metal: 0.75, rough: 0.32 },
  { name: { pl: 'Biel perłowa', en: 'Pearl white' }, hex: '#e9e7e2', metal: 0.2, rough: 0.28 },
  { name: { pl: 'Czerń', en: 'Black' }, hex: '#0a0b0c', metal: 0.4, rough: 0.25 },
  { name: { pl: 'Zieleń brytyjska', en: 'British green' }, hex: '#0f3a2a', metal: 0.6, rough: 0.32 },
  { name: { pl: 'Błękit nocy', en: 'Midnight blue' }, hex: '#13284e', metal: 0.65, rough: 0.3 },
  { name: { pl: 'Srebro', en: 'Silver' }, hex: '#a9aeb3', metal: 0.85, rough: 0.28 },
  { name: { pl: 'Pomarańcz', en: 'Orange' }, hex: '#d0561a', metal: 0.45, rough: 0.3 },
];
const ACCENTS = [
  { name: { pl: 'Czarny połysk', en: 'Gloss black' }, hex: '#0b0c0d' },
  { name: { pl: 'Kolor nadwozia', en: 'Body colour' }, hex: null, swatch: 'conic-gradient(#9e0b0b 0 50%, #0b0c0d 0)' },
  { name: { pl: 'Karbon', en: 'Carbon grey' }, hex: '#24272b' },
];
const INTERIORS = [
  { name: { pl: 'Czerwone', en: 'Red' }, hex: '#7a0a08' },
  { name: { pl: 'Kość słoniowa', en: 'Ivory' }, hex: '#d9d2c3' },
  { name: { pl: 'Koniak', en: 'Cognac' }, hex: '#7a4524' },
  { name: { pl: 'Czarne', en: 'Black' }, hex: '#121314' },
];
const RIMS = [
  { name: { pl: 'Czarne', en: 'Black' }, hex: '#141516', metal: 0.5, rough: 0.35 },
  { name: { pl: 'Srebrne', en: 'Silver' }, hex: '#c9cdd1', metal: 1, rough: 0.18 },
  { name: { pl: 'Grafitowe', en: 'Graphite' }, hex: '#43474c', metal: 0.9, rough: 0.3 },
  { name: { pl: 'Brąz', en: 'Bronze' }, hex: '#7a5a38', metal: 1, rough: 0.28 },
];
const CALIPERS = [
  { name: { pl: 'Czerwone', en: 'Red' }, hex: '#c41616' },
  { name: { pl: 'Żółte', en: 'Yellow' }, hex: '#e8b416' },
  { name: { pl: 'Niebieskie', en: 'Blue' }, hex: '#1d4fb8' },
  { name: { pl: 'Czarne', en: 'Black' }, hex: '#15161a' },
];

let accentFollowsBody = false;
function setPaint(c) {
  paint.color.set(c.hex);
  paint.metalness = c.metal; paint.roughness = c.rough;
  if ('clearcoat' in paint) { paint.clearcoat = 1; paint.clearcoatRoughness = 0.03; }
  if (accentFollowsBody) accent.color.copy(paint.color);
}
function setAccent(c) {
  accentFollowsBody = !c.hex;
  accent.color.copy(c.hex ? new THREE.Color(c.hex) : paint.color);
}

buildUI(stage, {
  title: { pl: 'Concept GT', en: 'Concept GT' },
  subtitle: { pl: 'Konfigurator 3D', en: '3D configurator' },
  specs: [{ pl: 'Model 3D: Car Concept, E. Chadwick / DGG, CC BY 4.0', en: '3D model: Car Concept, E. Chadwick / DGG, CC BY 4.0' }],
  groups: [
    { id: 'p', label: { pl: 'Lakier', en: 'Paint' }, items: PAINTS, apply: setPaint },
    { id: 'a', label: { pl: 'Dach i progi', en: 'Roof & sills' }, items: ACCENTS, apply: setAccent },
    { id: 'i', label: { pl: 'Wnętrze', en: 'Interior' }, items: INTERIORS, apply: (c) => seats && seats.color.set(c.hex) },
    { id: 'r', label: { pl: 'Felgi', en: 'Wheels' }, items: RIMS, apply: (c) => {
      for (const m of [rimA, rimB]) if (m) { m.color.set(c.hex); m.metalness = c.metal; m.roughness = c.rough; }
    } },
    { id: 'c', label: { pl: 'Zaciski', en: 'Calipers' }, items: CALIPERS, apply: (c) => brake && brake.color.set(c.hex) },
  ],
  toggles: [
    { id: 'l', label: { pl: 'Światła', en: 'Lights' }, value: true, apply: (on) => lightBase.forEach(({ m, color, i }) => {
      m.emissive.copy(on ? (color.getHex() ? color : new THREE.Color(1, 1, 1)) : new THREE.Color(0, 0, 0)); m.emissiveIntensity = on ? Math.max(i, 1) : 0;
    }) },
  ],
});
stage.start();
window.__demo = { stage, M, car };
