import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BREADS } from './data.js';
import { initUI } from './ui.js';
import * as T from './textures.js';
import * as P from './parts.js';
import { createHeroFX, sampleText } from './hero.js';

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, l, dt) => lerp(a, b, 1 - Math.exp(-l * dt));
const easeOutBack = (x) => { const c = 1.5; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const N = BREADS.length;
const isTouch = matchMedia('(pointer: coarse)').matches;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let curIdx = 0;
let targetIdx = 0;
let lastGo = 0;
let detailOpen = false;
const secs = {};

const ui = initUI({ goLineup, setDetail });

function goLineup(i) {
  i = Math.max(0, Math.min(N - 1, i));
  targetIdx = i;
  lastGo = performance.now();
  const s = secs.lineup;
  if (!s) return;
  const top = s.top + (i / (N - 1)) * (s.h - innerHeight);
  window.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
}

function setDetail(open) {
  detailOpen = open;
  ui.setDetailUI(open);
  if (open) goLineup(curIdx);
}

function measure() {
  const y = window.scrollY;
  for (const id of ['hero', 'story', 'lineup', 'combo', 'menu', 'visit']) {
    const r = document.getElementById(id).getBoundingClientRect();
    secs[id] = { top: r.top + y, h: r.height };
  }
}

function secState(id, sy) {
  const s = secs[id];
  const vh = innerHeight;
  const top = s.top - sy;
  const bottom = top + s.h;
  let off = 0;
  if (top > 0) off = top / vh;
  else if (bottom < vh) off = (bottom - vh) / vh;
  const p = s.h > vh ? clamp01(-top / (s.h - vh)) : 0;
  return { off, p, top, bottom };
}

let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gl'), antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (e) {
  renderer = null;
}

if (!renderer) {
  document.documentElement.classList.add('no-gl');
  measure();
  ui.loaded();
} else {
  boot().catch((err) => {
    console.error(err);
    document.documentElement.classList.add('no-gl');
    ui.loaded();
  });
}

async function boot() {
  const dpr = Math.min(window.devicePixelRatio || 1, isTouch ? 1.6 : 1.8);
  renderer.setPixelRatio(dpr);
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 60);
  camera.position.set(0, 0, 8);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.32;

  const hemi = new THREE.HemisphereLight('#ffd7a8', '#1a0a04', 0.7);
  const key = new THREE.DirectionalLight('#ffdcb0', 2.2);
  key.position.set(-3, 5, 6);
  const rim = new THREE.DirectionalLight('#ff7a1a', 3.2);
  rim.position.set(4, 2.5, -5);
  scene.add(hemi, key, rim);

  const bg = P.makeBackground();
  scene.add(bg);
  const embers = P.makeEmbers(isTouch ? 260 : 520);
  scene.add(embers);

  // ------------------------------------------------------------ textures
  const steps = N + 5;
  let done = 0;
  const tick = async () => { done++; ui.setLoad(done / steps); await nextFrame(); };

  await Promise.race([
    Promise.all([
      document.fonts.load('700 92px "Noto Nastaliq Urdu"', 'انعام ناشتہ'),
      document.fonts.load('30px Anton', 'SHAHI'),
      document.fonts.load('600 20px Manrope', 'INAAM'),
    ]).catch(() => {}),
    wait(3000),
  ]);
  await tick();

  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const bigTS = isTouch ? 768 : 1024;
  const smallTS = isTouch ? 512 : 768;
  const dots = T.makeDots(bigTS, 101);
  const toTex = (painted) => ({ map: T.toTexture(painted.color, true, aniso), bump: T.toTexture(painted.bump, false, aniso) });

  const breads = [];
  for (let i = 0; i < N; i++) {
    const b = BREADS[i];
    const seed = i * 17 + 5;
    const size = b.id === 'sheermaal' ? bigTS : smallTS;
    const painted = T.paintBread(b.id, size, seed, b.id === 'sheermaal' ? dots : null);
    const tex = toTex(painted);
    const geo = P.breadGeometry({ ...b.geo, seed }, painted.bubbles, b.id === 'sheermaal');
    breads.push({ b, tex, geo });
    await tick();
  }
  const rawPlain = T.toTexture(T.paintBread('rawPlain', bigTS, 7, dots).color, true, aniso);
  const rawDots = T.toTexture(T.paintBread('rawDots', bigTS, 7, dots).color, true, aniso);
  await tick();

  const glowTex = T.toTexture(T.glowTexture(), true);
  const flameTex = T.toTexture(T.flameTexture(), true);
  const steamTex = T.toTexture(T.steamTexture(), true);
  const clayTex = T.toTexture(T.clayTexture(21, '#a85a35'), true, aniso);
  const foamTex = T.toTexture(T.foamTexture(), true);
  const lidTex = T.toTexture(T.boxLidTexture(), true, aniso);
  const frontTex = T.toTexture(T.boxFrontTexture(), true, aniso);
  await tick();

  // ------------------------------------------------------------ hero / story bread
  const sheer = breads[0];
  const storyMat = P.storyBreadMaterial(sheer.tex, rawPlain, rawDots, sheer.b.mat);
  storyMat.emissive = new THREE.Color(1, 0.38, 0.08);
  const heroHolder = new THREE.Object3D();
  heroHolder.rotation.order = 'YXZ';
  const heroMesh = new THREE.Mesh(sheer.geo, storyMat);
  heroHolder.add(heroMesh);
  scene.add(heroHolder);
  // Invisible low-poly stand-in for raycasts (the real mesh has 13k vertices and a morph target).
  const heroProxy = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.42, 24), new THREE.MeshBasicMaterial());
  heroProxy.visible = false;
  heroMesh.add(heroProxy);

  const saffronMat = new THREE.MeshStandardMaterial({ color: '#a51d0c', emissive: '#4a0802', emissiveIntensity: 0.5, roughness: 0.45 });
  const saffronGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.09, 0, 0), new THREE.Vector3(-0.03, 0.008, 0.012), new THREE.Vector3(0.03, -0.006, -0.012), new THREE.Vector3(0.09, 0.006, 0),
  ]), 12, 0.0055, 5, false);
  const strands = [];
  {
    const R = T.rng(77);
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(saffronGeo, saffronMat);
      const r = Math.sqrt(R()) * 0.55, a = R() * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const surf = 0.17 * (1 + 0.28 * (1 - r * r)) + 0.012;
      m.userData = { x, z, surf, ry: R() * Math.PI, delay: i * 0.035, sway: R() * 6 };
      m.rotation.y = m.userData.ry;
      heroMesh.add(m);
      strands.push(m);
    }
  }

  const storyGroup = new THREE.Group();
  scene.add(storyGroup);
  const tandoor = P.makeTandoor(clayTex, glowTex, flameTex);
  tandoor.rotation.x = 0.32;
  storyGroup.add(tandoor);
  const tandoorLight = tandoor.userData.light;
  scene.add(tandoorLight);
  const ingredients = P.makeIngredients();
  storyGroup.add(ingredients);

  // ------------------------------------------------------------ lineup
  const lineupGroup = new THREE.Group();
  scene.add(lineupGroup);
  const items = breads.map(({ b, tex, geo }, i) => {
    const holder = new THREE.Object3D();
    holder.rotation.order = 'YXZ';
    const mat = P.breadMaterial(tex, b.mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.index = i;
    mesh.rotation.y = i * 0.9;
    holder.add(mesh);
    lineupGroup.add(holder);
    return { holder, mesh, mat, b };
  });
  const pedestal = P.makePedestal(glowTex);
  pedestal.rotation.x = 0.2;
  lineupGroup.add(pedestal);

  // ------------------------------------------------------------ hero extras
  // fonts.check() is true for an undeclared family too, so also require the face to exist.
  const urduLoaded = [...document.fonts].some((f) => f.family.replace(/["']/g, '') === 'Noto Nastaliq Urdu')
    && document.fonts.check('700 340px "Noto Nastaliq Urdu"', 'انعام');
  const calliCount = isTouch ? 5000 : 12000;
  const sample = (urduLoaded && sampleText('انعام', '700 340px "Noto Nastaliq Urdu"', calliCount, 3))
    || sampleText('INAAM', '300px Anton, Impact, sans-serif', calliCount, 3);
  const heroFX = createHeroFX({ breads: breads.slice(1), glowTex, steamTex, isTouch, sample });
  scene.add(heroFX.root);
  scene.add(heroFX.cursorLight);
  const heroSection = document.getElementById('hero');
  const accentCol = new THREE.Color(BREADS[0].theme.accent);
  const glowCol = new THREE.Color(BREADS[0].theme.glow);

  // ------------------------------------------------------------ combo
  const comboGroup = new THREE.Group();
  scene.add(comboGroup);
  const box = P.makeBox(lidTex, frontTex);
  comboGroup.add(box);
  const comboMatS = P.breadMaterial(sheer.tex, sheer.b.mat);
  const kul = breads.find((x) => x.b.id === 'kulcha');
  const comboMatK = P.breadMaterial(kul.tex, kul.b.mat);
  const mkItem = (geo, mat, s) => {
    const h = new THREE.Object3D();
    const m = new THREE.Mesh(geo, mat);
    h.add(m);
    h.scale.setScalar(s);
    box.add(h);
    return h;
  };
  const kulhad = P.makeKulhad(clayTex, foamTex, steamTex);
  box.add(kulhad);
  const comboItems = [
    { h: mkItem(sheer.geo, comboMatS, 0.5), a: [-0.6, 0.12, 0.3, 0.05], b: [-0.95, 1.55, 0.35, 0.65], spin: 0.3 },
    { h: mkItem(sheer.geo, comboMatS, 0.5), a: [-0.35, 0.22, -0.3, -0.08], b: [0.0, 2.15, -0.1, 0.7], spin: -0.25 },
    { h: mkItem(kul.geo, comboMatK, 0.5), a: [0.45, 0.16, -0.35, 0.06], b: [0.95, 1.5, 0.0, 0.6], spin: 0.35 },
    { h: kulhad, a: [0.78, 0.045, 0.45, 0], b: [1.05, 0.5, 0.75, 0.12], spin: 0 },
  ];

  // ------------------------------------------------------------ post
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.55, 0.9);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // ------------------------------------------------------------ layout
  let L;
  function layout() {
    const aspect = innerWidth / innerHeight;
    const Hw = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const Ww = Hw * aspect;
    const mobile = aspect < 0.85;
    L = {
      Hw, Ww, mobile,
      hero: { x: Ww * 0.24, y: 0.05, s: Math.min(1.3, Ww * 0.12, innerHeight < 560 ? 0.95 : 9) },
      story: mobile ? { x: 0, y: Hw * 0.22, s: Math.min(0.85, Ww * 0.3) } : { x: Ww * 0.2, y: 0.15, s: Math.min(1.15, Ww * 0.11) },
      ring: mobile ? { R: 2.2, sx: 0.85, y: 0.85, front: 0.58, z: 0.6 } : { R: 4.0, sx: 1.25, y: 0.72, front: 0.8, z: 0.8 },
      detail: mobile ? { x: 0, y: Hw * 0.25, s: 0.82 } : { x: -Ww * 0.17, y: 0.05, s: 1.5 },
      box: mobile ? { x: 0, y: Hw * 0.08, s: 0.6, pop: 0.72 } : { x: Ww * 0.2, y: -0.35, s: 0.95, pop: 1 },
      tandoorS: mobile ? 0.55 : 0.72,
    };
    bg.material.uniforms.uAspect.value = aspect;
    if (mobile) {
      // Portrait: fit bread, ring and calligraphy between the nav and the hero copy.
      const eyebrow = document.querySelector('.hero .eyebrow');
      const pxPerUnit = innerHeight / Hw;
      const topPx = 70;
      const availPx = Math.max(150, (eyebrow ? eyebrow.offsetTop : innerHeight * 0.4) - topPx - 8);
      const budget = availPx / pxPerUnit;
      const s = Math.min(0.78, Ww * 0.27, budget * 0.42);
      L.hero = { x: 0, y: Hw / 2 - (topPx + availPx / 2) / pxPerUnit, s };
      L.orbitR = Math.min(Ww * 0.38, s * 1.5);
      L.miniS = 0.2 * s;
      // The calligraphy is ~0.92 as tall as it is wide, so w = budget keeps it inside the gap.
      L.calli = { x: 0, y: L.hero.y, w: Math.min(Ww * 0.72, budget), size: 2.0 };
    } else {
      // Keep the ring and the hovered (enlarged) minis inside the right edge.
      L.orbitR = Math.min(1.55 * L.hero.s, (Ww / 2 - L.hero.x - 0.45) / 0.96);
      L.miniS = 0.25 * Math.min(1.1, L.hero.s);
      L.calli = { x: L.hero.x, y: L.hero.y + 0.05, w: Math.min(3.4, Ww * 0.36, Hw * 0.62), size: 2.3 };
    }
  }

  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
    embers.material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
    heroFX.setPixelRatio(renderer.getPixelRatio());
    layout();
    measure();
  }
  resize();
  window.addEventListener('resize', resize);
  new ResizeObserver(() => measure()).observe(document.body);

  // ------------------------------------------------------------ input
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    mouse.tx = (e.clientX / innerWidth) * 2 - 1;
    mouse.ty = -((e.clientY / innerHeight) * 2 - 1);
  });

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const luSticky = document.querySelector('#lineup .sticky');
  let down = null;
  luSticky.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, a, .detail')) return;
    down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
  });
  window.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - down.x;
    if (Math.abs(dx) > 8 || Math.abs(e.clientY - down.y) > 8) down.moved = true;
    if (Math.abs(dx) > 60) {
      const base = performance.now() - lastGo < 900 ? targetIdx : curIdx;
      goLineup(base + (dx < 0 ? 1 : -1));
      down.x = e.clientX;
    }
  });
  window.addEventListener('pointercancel', () => { down = null; });
  window.addEventListener('pointerup', (e) => {
    if (!down) return;
    const click = !down.moved && performance.now() - down.t < 500;
    down = null;
    if (!click) return;
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(items.map((it) => it.mesh), false)[0];
    if (!hit) return;
    const i = hit.object.userData.index;
    if (i === curIdx) setDetail(!detailOpen);
    else goLineup(i);
  });

  // Hero: hover/tap the orbiting breads, drag to spin the sheermaal, cursor sparks.
  const hp = { x: 0, y: 0, active: false, moved: false, mouse: false, lastEmit: 0, lastPick: 0 };
  const zPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const cursorWorld = new THREE.Vector3(0, 0, 1.2);
  const mouseLocal = new THREE.Vector2(99, 99);
  const hitTmp = new THREE.Vector3();
  let hoverIdx = -1;
  let heroLive = true;
  let spinVel = 0;
  let spin = null;
  let heroTap = null;
  window.addEventListener('pointermove', (e) => {
    hp.x = e.clientX; hp.y = e.clientY; hp.moved = true;
    hp.active = true; hp.mouse = e.pointerType === 'mouse';
    if (spin) {
      const now = performance.now();
      const dx = e.clientX - spin.x;
      spin.x = e.clientX;
      spin.add += dx * 0.012;
      spinVel = Math.max(-25, Math.min(25, (dx * 0.012) / Math.max((now - spin.t) / 1000, 0.008)));
      if (Math.abs(dx) > 0) spin.lastMove = now;
      spin.t = now;
      if (Math.abs(e.clientX - spin.x0) > 6) spin.dragged = true;
    }
    if (heroTap && Math.hypot(e.clientX - heroTap.x, e.clientY - heroTap.y) > 10) heroTap = null;
  });
  document.documentElement.addEventListener('pointerleave', () => { hp.active = false; });
  window.addEventListener('pointercancel', () => {
    heroTap = null;
    if (spin) { spin = null; heroSection.style.cursor = ''; }
  });
  function heroRay(cx, cy) {
    ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
  }
  // Nearest of the hero bread and the minis, so a mini hidden behind the bread is not picked.
  const pickList = [heroProxy, ...heroFX.pickables];
  function heroPick() {
    const hit = raycaster.intersectObjects(pickList, false)[0];
    if (!hit) return { mini: -1, bread: false };
    return hit.object === heroProxy ? { mini: -1, bread: true } : { mini: hit.object.userData.orbitIndex, bread: false };
  }
  window.addEventListener('pointerdown', (e) => {
    if (!heroLive || document.body.classList.contains('cart-open')) return;
    if (!e.target.closest('#hero') || e.target.closest('a, button')) return;
    heroRay(e.clientX, e.clientY);
    const downPick = heroPick();
    heroTap = { x: e.clientX, y: e.clientY, mini: downPick.mini };
    if (downPick.bread) {
      const now = performance.now();
      spin = { x: e.clientX, x0: e.clientX, t: now, lastMove: now, add: 0, dragged: false };
      heroSection.style.cursor = 'grabbing';
    }
  });
  let hop = 0;
  window.addEventListener('pointerup', (e) => {
    if (spin) {
      // Held still before letting go: no fling.
      if (performance.now() - spin.lastMove > 90) spinVel = 0;
      if (!spin.dragged && heroLive) {
        hop = 1;
        spinVel = Math.min(25, spinVel + 14);
        heroFX.pulse(heroHolder.position.x, heroHolder.position.y);
      }
      spin = null;
      heroSection.style.cursor = '';
    }
    if (!heroTap || !heroLive) { heroTap = null; return; }
    const downMini = heroTap.mini;
    heroTap = null;
    heroRay(e.clientX, e.clientY);
    const pick = heroPick();
    const mini = pick.mini >= 0 ? pick.mini : downMini;
    if (mini >= 0) goLineup(mini + 1);
  });

  let lineupPinned = false;
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && detailOpen) setDetail(false);
    if (!lineupPinned) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); goLineup(curIdx + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); goLineup(curIdx - 1); }
  });

  // ------------------------------------------------------------ thumbnails for the menu
  function renderThumbs() {
    const h = Math.floor(Math.min(300, innerWidth / 1.3, innerHeight * 0.8));
    const w = Math.round(h * 1.3);
    const pr = renderer.getPixelRatio();
    const glCanvas = renderer.domElement;
    const out = document.createElement('canvas');
    out.width = Math.round(w * pr); out.height = Math.round(h * pr);
    const ctx = out.getContext('2d');
    const ts = new THREE.Scene();
    ts.environment = envTex;
    ts.environmentIntensity = 0.55;
    ts.add(hemi.clone(), key.clone(), rim.clone());
    const cam = new THREE.PerspectiveCamera(30, w / h, 0.1, 50);
    cam.position.set(0, 0.15, 4.7);
    cam.lookAt(0, 0, 0);
    renderer.setScissorTest(true);
    renderer.setViewport(0, 0, w, h);
    renderer.setScissor(0, 0, w, h);
    const shot = (obj, id) => {
      ts.add(obj);
      renderer.clear();
      renderer.render(ts, cam);
      ctx.clearRect(0, 0, out.width, out.height);
      ctx.drawImage(glCanvas, 0, glCanvas.height - out.height, out.width, out.height, 0, 0, out.width, out.height);
      ui.setThumb(id, out.toDataURL('image/webp', 0.86));
      ts.remove(obj);
    };
    items.forEach(({ b, mat }) => {
      const hld = new THREE.Object3D();
      hld.rotation.set(0.82, 0.35, -0.12, 'YXZ');
      const m = new THREE.Mesh(breads.find((x) => x.b.id === b.id).geo, mat);
      m.rotation.y = 0.6;
      hld.add(m);
      shot(hld, b.id);
    });
    const parent = comboGroup;
    parent.remove(box);
    const bh = new THREE.Object3D();
    bh.add(box);
    box.rotation.set(0.62, -0.55, 0);
    box.userData.lid.rotation.x = -1.9;
    bh.scale.setScalar(0.88);
    bh.position.y = -0.35;
    shot(bh, 'nashta');
    bh.remove(box);
    parent.add(box);
    const k2 = P.makeKulhad(clayTex, foamTex, steamTex);
    k2.scale.setScalar(3.3);
    k2.position.y = -0.95;
    k2.rotation.x = 0.35;
    shot(k2, 'chai');
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, innerWidth, innerHeight);
  }

  // ------------------------------------------------------------ compile + reveal
  try {
    if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
    else renderer.compile(scene, camera);
  } catch (e) { /* compile lazily on first frame */ }
  await tick();
  try { renderThumbs(); } catch (e) { console.warn('thumbnails skipped', e); }
  await tick();
  measure();
  ui.loaded();

  // ------------------------------------------------------------ frame loop
  const timer = new THREE.Timer();
  // Opened below the hero (reload, deep link): no intro, everything already in place.
  const introStart = performance.now() - (window.scrollY > innerHeight * 0.5 ? 10000 : 0);
  let sy = window.scrollY;
  let detailT = 0;
  // Adaptive quality: slow GPUs drop to 1x pixels, very slow ones also lose bloom.
  let perfFrames = 0, perfTime = 0;
  const cBase = new THREE.Color(), cGlow = new THREE.Color(), cFloor = new THREE.Color();
  const tBase = new THREE.Color(), tGlow = new THREE.Color(), tFloor = new THREE.Color();
  const tCenter = new THREE.Vector2();
  const bgU = bg.material.uniforms;
  cBase.copy(bgU.uBase.value); cGlow.copy(bgU.uGlow.value); cFloor.copy(bgU.uFloor.value);
  const tmpC = new THREE.Color();
  const v3 = new THREE.Vector3();

  function screenUV(x, y, z, target) {
    v3.set(x, y, z).project(camera);
    return target.set(v3.x * 0.5 + 0.5, v3.y * 0.5 + 0.5);
  }

  function frame() {
    requestAnimationFrame(frame);
    timer.update();
    const rawDt = timer.getDelta();
    const dt = Math.min(rawDt, 0.05);
    if (perfFrames < 150) {
      perfFrames++;
      if (perfFrames > 30) perfTime += rawDt;
      if (perfFrames === 150) {
        const avg = perfTime / 120;
        if (avg > 1 / 34 && renderer.getPixelRatio() > 1) {
          renderer.setPixelRatio(1);
          composer.setPixelRatio(1);
          embers.material.uniforms.uPixelRatio.value = 1;
          heroFX.setPixelRatio(1);
        }
        if (avg > 1 / 20) bloom.enabled = false;
      }
    }
    const t = timer.getElapsed();
    sy = damp(sy, window.scrollY, 10, dt);
    if (Math.abs(sy - window.scrollY) < 0.5) sy = window.scrollY;
    mouse.x = damp(mouse.x, mouse.tx, 4, dt);
    mouse.y = damp(mouse.y, mouse.ty, 4, dt);
    camera.position.x = mouse.x * 0.22;
    camera.position.y = mouse.y * 0.14;
    camera.lookAt(0, 0, 0);

    const H = secState('hero', sy), S = secState('story', sy), LU = secState('lineup', sy);
    const C = secState('combo', sy), M = secState('menu', sy), V = secState('visit', sy);
    const it = reduceMotion ? 10 : (performance.now() - introStart) / 1000;
    const intro = clamp01((it - 1.8) / 1.2);

    // ---------------------------------------------------- hero + story bread
    const p = S.p;
    const rewind = smooth(0.0, 0.08, p);
    const flatten = smooth(0.47, 0.56, p);
    const ballness = rewind * (1 - flatten);
    const bake = p < 0.3 ? 1 - rewind : smooth(0.66, 0.78, p);
    const prick = Math.max(1 - smooth(0.02, 0.08, p), smooth(0.55, 0.61, p));
    const enterIng = smooth(0.02, 0.15, p);
    const converge = smooth(0.3, 0.4, p);
    const knead = smooth(0.31, 0.36, p) * (1 - smooth(0.44, 0.48, p));
    const rise = smooth(0.58, 0.65, p) * (1 - smooth(0.8, 0.88, p));
    const dip = smooth(0.65, 0.7, p) * (1 - smooth(0.76, 0.81, p));
    const heat = smooth(0.6, 0.68, p) * (1 - smooth(0.8, 0.88, p));
    const glow = smooth(0.66, 0.7, p) * (1 - smooth(0.74, 0.8, p));
    const glaze = smooth(0.86, 0.95, p);
    const step = p < 0.26 ? 0 : p < 0.47 ? 1 : p < 0.61 ? 2 : p < 0.84 ? 3 : 4;
    ui.setStory(p, step);

    const k = smooth(0, 1, 1 - clamp01(S.off));
    let bx = lerp(L.hero.x, L.story.x, k);
    let by = lerp(L.hero.y, L.story.y, k);
    const bs = lerp(L.hero.s, L.story.s, k);
    const scrollUp = S.off < 0 ? -S.off * L.Hw : 0;
    by += scrollUp;
    const storyLive = S.off > -1.3;
    heroHolder.visible = storyLive;
    storyGroup.visible = storyLive;
    if (!storyLive) tandoorLight.intensity = 0;
    if (storyLive) {
      const tsc = L.tandoorS;
      const mouthY = L.story.y - 1.05 + scrollUp;
      const tandoorY = mouthY - 1.1 * tsc - (1 - rise) * 6;
      tandoor.position.set(L.story.x, tandoorY, -0.3);
      tandoor.scale.setScalar(tsc);
      tandoor.visible = rise > 0.001;
      if (tandoor.visible) {
        P.updateTandoor(tandoor, t, heat);
        tandoorLight.position.set(tandoor.position.x, tandoor.position.y + 1.6 * tsc, tandoor.position.z + 0.4);
      } else {
        tandoorLight.intensity = 0;
      }

      hop = Math.max(0, hop - dt * 1.7);
      const bob = Math.sin(t * 1.2) * 0.06 * (1 - dip) + Math.sin((1 - hop) * Math.PI) * (hop > 0 ? 0.55 * bs : 0);
      const introY = -(1 - easeOutBack(intro)) * 4.2;
      by = lerp(by + bob + introY, mouthY + 0.62, dip);
      heroHolder.position.set(bx, by, 0);
      const s = bs * (0.35 + 0.65 * smooth(0, 0.5, intro)) * (1 - dip * 0.18);
      heroHolder.scale.setScalar(Math.max(s, 0.001));
      const tiltBase = lerp(0.95, 1.15, flatten * (1 - bake));
      heroHolder.rotation.x = lerp(tiltBase, 0.62, dip) + mouse.y * 0.12;
      heroHolder.rotation.y = mouse.x * 0.2;
      heroHolder.rotation.z = -0.12 + mouse.x * 0.08;
      if (spin) { heroMesh.rotation.y += spin.add; spin.add = 0; } else spinVel *= Math.exp(-1.6 * dt);
      heroMesh.rotation.y += dt * (0.32 + ballness * 0.9 + knead * 2.5 + (1 - intro) * 9 + (spin ? 0 : spinVel));
      const ks = Math.sin(t * 7) * 0.13 * knead;
      heroMesh.scale.set(1 + ks, 1 - ks * 1.2, 1 + ks);
      heroMesh.morphTargetInfluences[0] = ballness;

      const u = storyMat.userData.u;
      u.uBake.value = bake;
      u.uPrick.value = prick;
      const sa = Math.max(1 - rewind, glaze);
      storyMat.clearcoat = Math.max(0.001, 0.75 * sa);
      storyMat.roughness = lerp(0.8, 0.42, bake);
      storyMat.bumpScale = 2.2 * Math.max(prick, bake) * (1 - ballness * 0.8);
      storyMat.emissiveIntensity = glow * 0.55 + heat * 0.12 * dip;

      strands.forEach((m) => {
        const d = m.userData;
        const f = clamp01((sa - d.delay) / (1 - d.delay * 2));
        const fe = 1 - Math.pow(1 - f, 3);
        m.visible = f > 0.001;
        m.position.set(d.x, lerp(2.2, d.surf, fe), d.z);
        m.rotation.x = (1 - fe) * Math.sin(t * 2 + d.sway) * 1.2;
      });

      ingredients.visible = enterIng > 0.001 && converge < 0.999;
      if (ingredients.visible) {
        ingredients.position.set(bx, by, 0);
        ingredients.scale.setScalar(bs);
        P.updateIngredients(ingredients, t, enterIng, converge);
      }
    }

    // ---------------------------------------------------- hero extras
    heroLive = k < 0.6 && S.off > 0;
    const nowMs = performance.now();
    const resting = hp.active && hp.mouse && nowMs - hp.lastPick > 120;
    if ((hp.moved || resting) && nowMs - hp.lastPick > 33 && (heroLive || it < 3)) {
      hp.moved = false;
      hp.lastPick = nowMs;
      heroRay(hp.x, hp.y);
      zPlane.constant = -1.2;
      raycaster.ray.intersectPlane(zPlane, cursorWorld);
      zPlane.constant = 0;
      if (raycaster.ray.intersectPlane(zPlane, hitTmp)) mouseLocal.set(hitTmp.x - L.calli.x, hitTmp.y - L.calli.y);
      let h = -1;
      if (hp.mouse && heroLive) {
        const pick = heroPick();
        h = pick.mini;
        if (!spin) heroSection.style.cursor = h >= 0 ? 'pointer' : pick.bread ? 'grab' : '';
        if (!reduceMotion && !resting && nowMs - hp.lastEmit > 16) {
          hp.lastEmit = nowMs;
          heroFX.sparks.emit(cursorWorld.x, cursorWorld.y, cursorWorld.z, 2, 0.06);
        }
      }
      if (h !== hoverIdx) { hoverIdx = h; ui.setTip(h >= 0 ? BREADS[h + 1] : null); }
      if (h >= 0) ui.moveTip(hp.x, hp.y);
    }
    if (!heroLive && hoverIdx >= 0) { hoverIdx = -1; ui.setTip(null); heroSection.style.cursor = ''; }
    heroFX.update({
      t, dt, it, k, L, reduce: reduceMotion,
      hero: { x: heroHolder.position.x, y: heroHolder.position.y, s: bs },
      calli: L.calli, textPos: L.calli, orbitR: L.orbitR, miniS: L.miniS,
      mouse, mouseLocal, cursorWorld, hoverIdx,
      pointerActive: hp.active && hp.mouse && heroLive,
    });

    // ---------------------------------------------------- lineup
    const luLive = Math.abs(LU.off) < 1.4;
    lineupGroup.visible = luLive;
    lineupPinned = LU.off === 0;
    if (detailOpen && Math.abs(LU.off) > 0.35) setDetail(false);
    detailT = damp(detailT, detailOpen ? 1 : 0, 5, dt);
    if (luLive) {
      const fi = LU.p * (N - 1);
      const base = Math.round(fi), d = fi - base;
      const fiM = base + 0.5 * Math.sign(d) * Math.pow(Math.abs(2 * d), 1.8);
      const idx = Math.max(0, Math.min(N - 1, base));
      if (idx !== curIdx) { curIdx = idx; ui.setLineup(idx); }
      const stepA = (Math.PI * 2) / N;
      const ringAngle = -fiM * stepA;
      lineupGroup.position.y = -LU.off * L.Hw;
      const R = L.ring;
      items.forEach((it, i) => {
        let a = i * stepA + ringAngle;
        a = ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        const c = Math.max(0, 1 - Math.abs(a) / stepA);
        let x = Math.sin(a) * R.R * R.sx;
        let z = Math.cos(a) * R.R - R.R + R.z;
        let y = R.y - (1 - Math.cos(a)) * 0.3 + Math.sin(t * 1.1 + i * 1.3) * 0.05;
        let s = lerp(0.6, 1, c) * R.front;
        let tilt = lerp(1.32, 1.08, c);
        let yaw = -a * 0.55;
        const sel = i === curIdx ? detailT : 0;
        if (i === curIdx) {
          x = lerp(x, L.detail.x, detailT);
          y = lerp(y, L.detail.y, detailT);
          z = lerp(z, 0.6, detailT);
          s = lerp(s, L.detail.s, detailT);
          tilt = lerp(tilt, 0.92, detailT);
          yaw = lerp(yaw, 0.25, detailT);
        } else {
          s *= 1 - detailT;
          y -= detailT * 0.8;
        }
        it.holder.visible = s > 0.005;
        it.holder.position.set(x, y, z);
        it.holder.rotation.set(tilt + mouse.y * 0.1, yaw + mouse.x * 0.15, 0);
        it.holder.scale.setScalar(Math.max(s, 0.001));
        it.mesh.rotation.y += dt * (0.22 + c * 0.35);
        const bright = lerp(0.3, 1, Math.pow(c, 0.7)) * (Math.cos(a) > -0.3 ? 1 : 0.55);
        it.mat.color.setScalar(lerp(bright, 1, sel));
      });
      const th = BREADS[curIdx].theme;
      accentCol.lerp(tmpC.set(th.accent), 1 - Math.exp(-6 * dt));
      glowCol.lerp(tmpC.set(th.glow), 1 - Math.exp(-6 * dt));
      const pu = pedestal.userData;
      pu.ringMat.color.copy(accentCol).multiplyScalar(3.2);
      pu.halo.material.color.copy(glowCol);
      pu.beamMat.uniforms.uColor.value.copy(glowCol);
      const ps = R.front * 0.95 * (1 - detailT);
      pedestal.visible = ps > 0.01;
      pu.topRing.visible = !L.mobile;
      pedestal.position.set(0, R.y - 1.02 * R.front - 0.1, R.z);
      pedestal.scale.setScalar(Math.max(ps, 0.001));
    }

    // ---------------------------------------------------- combo
    const cp = C.p;
    const coLive = Math.abs(C.off) < 1.3;
    comboGroup.visible = coLive;
    ui.setCombo(cp);
    if (coLive) {
      comboGroup.position.set(L.box.x, L.box.y - C.off * L.Hw, 0);
      comboGroup.scale.setScalar(L.box.s);
      box.rotation.set(0.45 + mouse.y * 0.06, lerp(-0.8, -0.32, cp) + C.off * 0.6 + mouse.x * 0.1, 0);
      box.userData.lid.rotation.x = -smooth(0.1, 0.36, cp) * 1.95;
      const pop = smooth(0.32, 0.58, cp) * (1 - smooth(0.88, 0.99, cp));
      comboItems.forEach((ci, i) => {
        const e = smooth(i * 0.06, 0.82 + i * 0.06, pop);
        ci.h.position.set(lerp(ci.a[0], ci.b[0], e), lerp(ci.a[1], ci.b[1] * L.box.pop, e) + Math.sin(t * 1.4 + i) * 0.04 * e, lerp(ci.a[2], ci.b[2], e));
        ci.h.rotation.x = lerp(ci.a[3], ci.b[3], e);
        if (ci.spin) ci.h.children[0].rotation.y += dt * ci.spin * (0.3 + e);
      });
      P.updateKulhad(kulhad, t, smooth(0.15, 0.35, cp));
    }

    // ---------------------------------------------------- background + embers
    const cands = [['hero', H.off], ['story', S.off], ['lineup', LU.off], ['combo', C.off], ['menu', M.off], ['visit', V.off]];
    let dom = 'hero', best = 9;
    for (const [id, off] of cands) if (Math.abs(off) < best) { best = Math.abs(off); dom = id; }
    let amt = 1, emb = 0.8;
    if (dom === 'hero') {
      tBase.set('#170a04'); tGlow.set('#5c2208'); tFloor.set('#2e1205');
      screenUV(heroHolder.position.x, heroHolder.position.y, 0, tCenter);
    } else if (dom === 'story') {
      tBase.set('#120803'); tGlow.set('#4a1c06').lerp(tmpC.set('#6e2507'), heat); tFloor.set('#341405').lerp(tmpC.set('#4f1a05'), heat);
      screenUV(heroHolder.position.x, heroHolder.position.y, 0, tCenter);
      emb = 0.8 + heat * 1.2;
    } else if (dom === 'lineup') {
      const th = BREADS[curIdx].theme;
      tBase.set('#120a06').lerp(tmpC.set(th.base), 0.5 + detailT * 0.5);
      tGlow.set(th.glow).multiplyScalar(0.08 + detailT * 0.16);
      tFloor.set(th.glow).multiplyScalar(0.16);
      if (detailOpen) screenUV(L.detail.x, L.detail.y + lineupGroup.position.y, 0.6, tCenter);
      else tCenter.set(0.5, 0.56);
      emb = 0.45;
    } else if (dom === 'combo') {
      tBase.set('#170806'); tGlow.set('#4d150f'); tFloor.set('#2a0c08');
      screenUV(comboGroup.position.x, comboGroup.position.y + 0.4, 0, tCenter);
      emb = 0.6;
    } else {
      tBase.set('#100805'); tGlow.set('#2c1004'); tFloor.set('#1a0a04');
      tCenter.set(0.5, 0.15);
      amt = 0.7; emb = 0.55;
    }
    const kc = 1 - Math.exp(-3.5 * dt);
    cBase.lerp(tBase, kc); cGlow.lerp(tGlow, kc); cFloor.lerp(tFloor, kc);
    bgU.uBase.value.copy(cBase); bgU.uGlow.value.copy(cGlow); bgU.uFloor.value.copy(cFloor);
    bgU.uCenter.value.lerp(tCenter, kc);
    bgU.uGlowAmt.value = damp(bgU.uGlowAmt.value, amt, 3, dt);
    bgU.uTime.value = t;
    embers.material.uniforms.uTime.value = t;
    const eu = embers.material.uniforms.uIntensity;
    eu.value = damp(eu.value, emb + 2.2 * (1 - smooth(0.6, 3.4, it)), 3, dt);
    bloom.strength = 0.5 + heat * 0.2;

    ui.setNav(window.scrollY > 30, (() => {
      const mid = innerHeight / 2;
      for (const id of ['visit', 'menu', 'combo', 'lineup', 'story']) {
        const s = secs[id];
        if (s.top - window.scrollY <= mid && s.top + s.h - window.scrollY >= mid) return id;
      }
      return '';
    })());

    composer.render(dt);
  }
  frame();
}
