// Hero-only effects: ember calligraphy, orbiting bread galaxy, steam,
// cursor sparks and the tandoor flash that opens the page.
import * as THREE from 'three';
import { rng } from './textures.js';
import { breadMaterial } from './parts.js';

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// Rasterise text and return `count` random points on its glyphs, normalised
// so the text is 1 unit wide and centred on the origin (y up).
export function sampleText(text, font, count, seed) {
  const W = 1600, H = 800;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font;
  ctx.fillText(text, W / 2, H / 2);
  const d = ctx.getImageData(0, 0, W, H).data;
  const xs = [], ys = [];
  let minX = W, maxX = 0, minY = H, maxY = 0;
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      if (d[(y * W + x) * 4 + 3] > 150) {
        xs.push(x); ys.push(y);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (xs.length < 300) return null;
  const bw = maxX - minX, cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const R = rng(seed);
  const pts = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const k = Math.floor(R() * xs.length);
    pts[i * 2] = (xs[k] - cx + (R() - 0.5) * 2) / bw;
    pts[i * 2 + 1] = -(ys[k] - cy + (R() - 0.5) * 2) / bw;
  }
  return { pts, aspect: (maxY - minY) / bw };
}

// Particles fly up from the tandoor, spell the calligraphy, then swirl into a
// glittering ring around the bread (aHalo = ring radius factor, angle, height).
function createCalligraphy(sample, count) {
  const R = rng(5);
  const gauss = () => (R() + R() + R() - 1.5) / 1.5;
  const geo = new THREE.BufferGeometry();
  const scatter = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 4);
  const halo = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    scatter[i * 3] = (R() - 0.5) * 3.5;
    scatter[i * 3 + 1] = -4 - R() * 3;
    scatter[i * 3 + 2] = (R() - 0.5) * 3;
    seeds[i * 4] = R(); seeds[i * 4 + 1] = R(); seeds[i * 4 + 2] = R(); seeds[i * 4 + 3] = R();
    const band = R() < 0.72;
    halo[i * 3] = band ? 1 + gauss() * 0.16 : 0.55 + R() * 1.0;
    halo[i * 3 + 1] = R() * Math.PI * 2;
    halo[i * 3 + 2] = gauss() * (band ? 0.03 : 0.09);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('aTarget', new THREE.BufferAttribute(sample.pts, 2));
  geo.setAttribute('aScatter', new THREE.BufferAttribute(scatter, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  geo.setAttribute('aHalo', new THREE.BufferAttribute(halo, 3));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 }, uForm: { value: 0 }, uExplode: { value: 0 }, uHalo: { value: 0 }, uPulse: { value: 0 },
      uOrbitR: { value: 2 }, uHaloCenter: { value: new THREE.Vector3() }, uHaloRot: { value: new THREE.Matrix3() },
      uWidth: { value: 5 }, uSize: { value: 2.4 }, uPixelRatio: { value: 1 },
      uMouse: { value: new THREE.Vector2(99, 99) }, uMouseStrength: { value: 0 },
      uColor: { value: new THREE.Color(1.5, 0.82, 0.28) }, uHot: { value: new THREE.Color(2.6, 1.0, 0.25) },
      uIntensity: { value: 0.7 },
    },
    vertexShader: /* glsl */`
      attribute vec2 aTarget; attribute vec3 aScatter; attribute vec4 aSeed; attribute vec3 aHalo;
      uniform float uTime, uForm, uExplode, uWidth, uSize, uPixelRatio, uMouseStrength, uHalo, uPulse, uOrbitR;
      uniform vec2 uMouse; uniform vec3 uHaloCenter; uniform mat3 uHaloRot;
      varying float vAlpha; varying float vHeat;
      void main() {
        float f = clamp((uForm - aSeed.x * 0.45) / 0.55, 0.0, 1.0);
        f = f * f * (3.0 - 2.0 * f);
        vec3 target = vec3(aTarget * uWidth, 0.0);
        target.x += sin(uTime * 1.3 + aSeed.y * 30.0) * 0.01;
        target.y += cos(uTime * 1.1 + aSeed.z * 30.0) * 0.01;
        target.z += sin(uTime * 0.7 + aSeed.w * 20.0) * 0.06;
        vec3 p = mix(aScatter, target, f);
        float fly = f * (1.0 - f) * 4.0;
        p.x += sin(aSeed.y * 6.283 + uTime * 1.5) * fly * 0.7;
        p.z += cos(aSeed.z * 6.283 + uTime) * fly * 0.5;
        float hq = clamp((uHalo - aSeed.y * 0.4) / 0.6, 0.0, 1.0);
        hq = hq * hq * (3.0 - 2.0 * hq);
        float r = aHalo.x * uOrbitR;
        float th = aHalo.y + uTime * 0.42 / max(aHalo.x, 0.35);
        vec3 ring = uHaloRot * vec3(cos(th) * r, aHalo.z * uOrbitR, sin(th) * r) + uHaloCenter;
        p = mix(p, ring, hq);
        p.y += sin(hq * 3.1416) * (aSeed.z - 0.25) * 1.4;
        vec3 fc = p - uHaloCenter;
        p += (fc / max(length(fc), 0.0001)) * uPulse * (0.5 + aSeed.w * 0.9);
        vec2 d = p.xy - uMouse;
        float dist = length(d);
        float push = smoothstep(0.85, 0.0, dist) * uMouseStrength * f;
        p.xy += (d / max(dist, 0.0001)) * push * 0.5;
        p.z += push * 0.8;
        vHeat = push;
        float e = uExplode;
        p.y += e * (1.0 + aSeed.y * 5.0);
        p.x += (aSeed.z - 0.5) * e * 4.0;
        p.z += (aSeed.w - 0.3) * e * 3.0;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = uSize * (0.55 + aSeed.w * 0.9) * (1.0 + push * 1.5);
        gl_PointSize = size * uPixelRatio * (8.0 / -mv.z);
        float tw = 0.6 + 0.4 * sin(uTime * (2.0 + aSeed.x * 4.0) + aSeed.y * 40.0);
        vAlpha = tw * (0.2 + 0.8 * f) * (1.0 - e) * (1.0 - hq * 0.35) * (aHalo.x > 1.3 || aHalo.x < 0.75 ? 1.0 - hq * 0.4 : 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uColor, uHot; uniform float uIntensity;
      varying float vAlpha; varying float vHeat;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        vec3 col = mix(uColor, uHot, clamp(vHeat, 0.0, 1.0));
        gl_FragColor = vec4(col * a * vAlpha * uIntensity, 1.0);
      }
    `,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

function createSparks(max) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3);
  const life = new Float32Array(max);
  const size = new Float32Array(max);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aLife', new THREE.BufferAttribute(life, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uPixelRatio: { value: 1 } },
    vertexShader: /* glsl */`
      attribute float aLife; attribute float aSize;
      uniform float uPixelRatio;
      varying float vLife;
      void main() {
        vLife = aLife;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uPixelRatio * (0.4 + aLife) * (8.0 / -mv.z);
      }
    `,
    fragmentShader: /* glsl */`
      varying float vLife;
      void main() {
        if (vLife <= 0.0) discard;
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vLife;
        vec3 col = mix(vec3(1.0, 0.25, 0.05), vec3(1.0, 0.8, 0.35), vLife) * 2.6;
        gl_FragColor = vec4(col * a, 1.0);
      }
    `,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  const vel = new Float32Array(max * 3);
  let next = 0;
  let dirty = false;
  return {
    points,
    emit(x, y, z, n, spread) {
      for (let k = 0; k < n; k++) {
        const i = next;
        next = (next + 1) % max;
        pos[i * 3] = x + (Math.random() - 0.5) * spread;
        pos[i * 3 + 1] = y + (Math.random() - 0.5) * spread;
        pos[i * 3 + 2] = z;
        vel[i * 3] = (Math.random() - 0.5) * 0.7;
        vel[i * 3 + 1] = 0.3 + Math.random() * 0.9;
        vel[i * 3 + 2] = (Math.random() - 0.5) * 0.4;
        life[i] = 0.7 + Math.random() * 0.3;
        size[i] = 3 + Math.random() * 5;
      }
      dirty = true;
    },
    update(dt) {
      if (!dirty) return;
      let alive = 0;
      for (let i = 0; i < max; i++) {
        if (life[i] <= 0) continue;
        alive++;
        life[i] = Math.max(0, life[i] - dt * 1.15);
        vel[i * 3 + 1] += dt * 0.5;
        vel[i * 3] *= 1 - dt * 1.5;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aLife.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;
      dirty = alive > 0;
    },
  };
}

export function createHeroFX({ breads, glowTex, steamTex, isTouch, sample }) {
  const root = new THREE.Group();

  // Ember calligraphy behind the hero bread.
  let calli = null;
  if (sample) {
    calli = createCalligraphy(sample, sample.pts.length / 2);
    root.add(calli);
  }

  // Orbiting galaxy of the other breads.
  const orbit = new THREE.Group();
  const ring = new THREE.Group();
  orbit.add(ring);
  root.add(orbit);
  const lineMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.4, 0.75, 0.25), transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false,
  });
  const line = new THREE.Mesh(new THREE.TorusGeometry(1, 0.0028, 6, 220), lineMat);
  line.rotation.x = Math.PI / 2;
  ring.add(line);
  const line2 = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.0016, 6, 220), lineMat);
  line2.rotation.x = Math.PI / 2;
  ring.add(line2);
  // Picking uses an invisible low-poly disc per bread instead of the 13k-vertex mesh.
  const proxyGeo = new THREE.CylinderGeometry(1.25, 1.25, 0.45, 20);
  const proxyMat = new THREE.MeshBasicMaterial();
  const minis = breads.map(({ b, tex, geo }, i) => {
    const holder = new THREE.Object3D();
    const mat = breadMaterial(tex, b.mat);
    mat.emissive.setRGB(0.5, 0.22, 0.04);
    mat.emissiveIntensity = 0;
    const mesh = new THREE.Mesh(geo, mat);
    const proxy = new THREE.Mesh(proxyGeo, proxyMat);
    proxy.visible = false;
    proxy.userData.orbitIndex = i;
    mesh.add(proxy);
    holder.add(mesh);
    ring.add(holder);
    return { holder, mesh, mat, b, proxy, hover: 0, ph: i * 2.1 };
  });

  // Steam over the freshly baked bread.
  const steam = new THREE.Group();
  root.add(steam);
  const puffs = [];
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTex, transparent: true, depthWrite: false, opacity: 0, color: '#ffe9d2' }));
    s.userData.ph = i / 6;
    steam.add(s);
    puffs.push(s);
  }

  // Tandoor fire under the page at the opening, then a burst where the bread pops out.
  const mkFlash = (col) => {
    const f = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: col, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0,
    }));
    root.add(f);
    return f;
  };
  const flash = mkFlash(new THREE.Color(1.9, 0.62, 0.12));
  const burst = mkFlash(new THREE.Color(2.0, 0.95, 0.3));
  const _m4 = new THREE.Matrix4();
  let pulse = 0;

  const sparks = createSparks(isTouch ? 90 : 220);
  root.add(sparks.points);

  // Added to the scene root by the caller: a light inside a group whose visibility
  // toggles would change the light count and force every lit shader to recompile.
  const cursorLight = new THREE.PointLight('#ffb366', 0, 7, 1.4);

  let base = 0;
  let speed = 1;

  return {
    root, calli, orbit, ring, minis, sparks, cursorLight,
    pickables: minis.map((m) => m.proxy),
    pulse(x, y) {
      pulse = 1;
      sparks.emit(x, y, 0.6, 26, 0.5);
    },
    setPixelRatio(pr) {
      if (calli) calli.material.uniforms.uPixelRatio.value = pr;
      sparks.points.material.uniforms.uPixelRatio.value = pr;
    },
    // s: { t, dt, it, k, hero:{x,y,s}, L, mouse, mouseLocal, hoverIdx, pointerActive }
    update(s) {
      const { t, dt, it, k } = s;
      const live = k < 0.999;
      root.visible = live || it < 3;

      // ---- opening: fire glow below (0-1.6s), burst as the bread pops out (~1.9s)
      const fl = smooth(0.0, 0.35, it) * (1 - smooth(0.9, 2.0, it));
      flash.visible = fl > 0.001;
      flash.position.set(s.textPos.x, -s.L.Hw * 0.5 - 0.4, -1);
      const fs = 2.5 + smooth(0, 1.2, it) * 5;
      flash.scale.set(fs, fs * 0.8, 1);
      flash.material.opacity = fl * 0.65;
      const bu = smooth(1.75, 1.95, it) * (1 - smooth(2.0, 2.9, it));
      burst.visible = bu > 0.001;
      burst.position.set(s.hero.x, s.hero.y, -0.5);
      const bs = (1.2 + smooth(1.75, 2.8, it) * (s.L.mobile ? 3.2 : 5)) * s.hero.s;
      burst.scale.set(bs, bs, 1);
      burst.material.opacity = bu;
      pulse = Math.max(0, pulse - dt * 1.6);

      // ---- calligraphy
      if (calli) {
        const u = calli.material.uniforms;
        calli.visible = k < 0.98;
        u.uTime.value = t;
        u.uForm.value = s.reduce ? 1 : clamp01((it - 0.25) / 1.45);
        u.uHalo.value = s.reduce ? 1 : clamp01((it - 1.85) / 1.3);
        u.uExplode.value = smooth(0, 0.75, k);
        u.uWidth.value = s.calli.w;
        u.uSize.value = s.calli.size;
        u.uOrbitR.value = s.orbitR;
        u.uPulse.value = Math.sin(Math.min(1, (1 - pulse) * 1.0) * Math.PI) * (pulse > 0 ? 1 : 0) * 0.9;
        calli.position.set(s.textPos.x, s.textPos.y, 0);
        u.uHaloCenter.value.set(s.hero.x - s.textPos.x, s.hero.y - s.textPos.y, 0);
        u.uMouse.value.lerp(s.mouseLocal, 1 - Math.exp(-10 * dt));
        u.uMouseStrength.value = lerp(u.uMouseStrength.value, s.pointerActive ? 1 : 0, 1 - Math.exp(-4 * dt));
      }

      // ---- orbit
      speed = lerp(speed, s.hoverIdx >= 0 ? 0 : 1, 1 - Math.exp(-6 * dt));
      base += dt * 0.32 * speed * (s.reduce ? 0.3 : 1);
      orbit.visible = k < 0.98;
      orbit.position.set(s.hero.x, s.hero.y, 0);
      ring.rotation.set(0.38 + s.mouse.y * 0.22, 0, -0.3 + s.mouse.x * 0.18);
      if (calli) calli.material.uniforms.uHaloRot.value.setFromMatrix4(_m4.makeRotationFromEuler(ring.rotation));
      const scatter = smooth(0, 0.8, k);
      const a = s.orbitR * (1 + scatter * 1.4);
      line.scale.setScalar(a);
      line2.scale.setScalar(a);
      lineMat.opacity = 0.3 * smooth(2.6, 3.6, it) * (1 - smooth(0, 0.3, k));
      const n = minis.length;
      minis.forEach((m, i) => {
        const enter = s.reduce ? 1 : smooth(2.5 + i * 0.09, 3.5 + i * 0.09, it);
        const th = base + (i / n) * Math.PI * 2;
        const r = a * (1 + (1 - enter) * 2.5);
        m.holder.position.set(Math.cos(th) * r, Math.sin(th * 2 + t * 0.8 + m.ph) * 0.06, Math.sin(th) * r);
        m.hover = lerp(m.hover, s.hoverIdx === i ? 1 : 0, 1 - Math.exp(-10 * dt));
        const sc = s.miniS * enter * (1 + m.hover * 0.7) * (1 - scatter);
        m.holder.scale.setScalar(Math.max(sc, 0.001));
        m.holder.visible = sc > 0.002;
        m.mesh.rotation.set(0.9 + Math.sin(t * 0.7 + m.ph) * 0.5 - m.hover * 0.5, t * 0.8 + m.ph, Math.cos(t * 0.5 + m.ph) * 0.4);
        m.mat.emissiveIntensity = m.hover * 0.35;
      });

      // ---- steam
      const sa = (1 - k) * smooth(3.0, 4.2, it);
      steam.position.set(s.hero.x, s.hero.y + 0.2 * s.hero.s, 0.3);
      for (const p of puffs) {
        const q = (t * 0.18 + p.userData.ph) % 1;
        p.position.set(Math.sin(t * 0.8 + p.userData.ph * 9) * 0.25 * (1 + q), q * 1.4 * s.hero.s, 0);
        const sc = (0.6 + q * 1.6) * s.hero.s;
        p.scale.set(sc, sc, sc);
        p.material.opacity = sa * 0.1 * Math.sin(q * Math.PI);
        p.visible = p.material.opacity > 0.002;
      }

      // ---- sparks + cursor light
      sparks.update(dt);
      cursorLight.position.copy(s.cursorWorld);
      cursorLight.intensity = lerp(cursorLight.intensity, s.pointerActive && k < 0.5 ? 6 : 0, 1 - Math.exp(-6 * dt));
      speed = Math.max(speed, 0.001);
    },
  };
}
