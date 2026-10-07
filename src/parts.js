// 3D building blocks: bread meshes, tandoor, kulhad, nashta box, embers, background.
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeNoise, rng } from './textures.js';

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------- bread
// A sphere is reshaped into a puffy flatbread. UVs are a planar projection of
// the unit disc so the painted textures line up with bubbles in the geometry.
export function breadGeometry(opts, bubbles = [], withBall = false) {
  const {
    shape = 'round', radius = 1, height = 0.15, puff = 0.2, bumps = 0.01,
    bottom = 0.42, seed = 1, wobble = 0.035,
  } = opts;
  const noise = makeNoise(seed);
  const geo = new THREE.SphereGeometry(1, 144, 96);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const n = pos.count;
  const colors = new Float32Array(n * 3);
  const ball = withBall ? new Float32Array(n * 3) : null;
  const ballN = withBall ? new Float32Array(n * 3) : null;

  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r = Math.hypot(x, z);
    const sl = y, cl = r;
    const top = sl >= 0;
    const rr = Math.pow(Math.max(cl, 0), 0.5);
    const yy = Math.sign(sl) * Math.pow(Math.abs(sl), top ? 0.55 : 0.32);
    const dx = r > 1e-6 ? x / r : 0, dz = r > 1e-6 ? z / r : 0;
    const ang = Math.atan2(dz, dx);
    const wob = 1 + wobble * noise(Math.cos(ang) * 1.6 + 3, Math.sin(ang) * 1.6 + 3);
    const u = rr * dx * wob, v = rr * dz * wob;

    let X = u, Z = v;
    if (shape === 'oval') { X = u * 1.3; Z = v * 0.84; }
    else if (shape === 'tear') { X = u * 1.32; Z = v * (0.9 - 0.26 * u); }

    let Y;
    if (top) {
      const dome = 1 + puff * (1 - rr * rr);
      Y = yy * height * dome;
      const f = smooth(0.0, 0.5, sl);
      Y += bumps * noise.fbm(X * 3.2 + seed, Z * 3.2, 3) * f;
      for (const b of bubbles) {
        const d = Math.hypot(u - b.u, v - b.v) / b.r;
        if (d < 2.5) Y += b.h * Math.exp(-d * d * 2.2) * f;
      }
    } else {
      Y = yy * height * bottom;
    }
    pos.setXYZ(i, X * radius, Y, Z * radius);
    uv.setXY(i, 0.5 + u * 0.5, 0.5 - v * 0.5);

    const shade = top ? 0.82 + 0.18 * smooth(0, 0.45, sl) : 0.7;
    colors[i * 3] = shade;
    colors[i * 3 + 1] = top ? shade : shade * 0.93;
    colors[i * 3 + 2] = top ? shade : shade * 0.86;

    if (withBall) {
      const lump = 1 + 0.035 * noise.fbm(x * 2.5 + 9, z * 2.5 + y * 2, 3);
      ball[i * 3] = x * 0.62 * lump;
      ball[i * 3 + 1] = y * 0.56 * lump + 0.02;
      ball[i * 3 + 2] = z * 0.62 * lump;
      const nl = Math.hypot(x, y / 0.9, z) || 1;
      ballN[i * 3] = x / nl; ballN[i * 3 + 1] = y / 0.9 / nl; ballN[i * 3 + 2] = z / nl;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // The sphere's original normals stay only as a merge key for seam/pole
  // duplicates; computeVertexNormals() replaces them after the merge.
  if (withBall) {
    geo.morphAttributes.position = [new THREE.BufferAttribute(ball, 3)];
    geo.morphAttributes.normal = [new THREE.BufferAttribute(ballN, 3)];
  }
  const merged = mergeVertices(geo, 1e-4);
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  geo.dispose();
  return merged;
}

export function breadMaterial(tex, m) {
  return new THREE.MeshPhysicalMaterial({
    map: tex.map,
    bumpMap: tex.bump,
    bumpScale: m.bumpScale ?? 2,
    roughness: m.roughness ?? 0.5,
    clearcoat: m.clearcoat ?? 0.3,
    clearcoatRoughness: m.clearcoatRoughness ?? 0.35,
    sheen: 0.15,
    sheenRoughness: 0.7,
    sheenColor: new THREE.Color('#ffcf8a'),
    vertexColors: true,
  });
}

// Story bread: blends raw dough -> pricked dough -> baked sheermaal.
export function storyBreadMaterial(baked, rawPlain, rawDots, m) {
  const mat = breadMaterial(baked, m);
  const u = { uBake: { value: 1 }, uPrick: { value: 1 }, rawPlain: { value: rawPlain }, rawDots: { value: rawDots } };
  mat.userData.u = u;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = 'uniform float uBake;\nuniform float uPrick;\nuniform sampler2D rawPlain;\nuniform sampler2D rawDots;\n' +
      shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
          vec4 rawC = mix( texture2D( rawPlain, vMapUv ), texture2D( rawDots, vMapUv ), uPrick );
          diffuseColor *= mix( rawC, texture2D( map, vMapUv ), uBake );
        #endif`
      );
  };
  mat.customProgramCacheKey = () => 'storyBread';
  return mat;
}

// ---------------------------------------------------------------- background
export function makeBackground() {
  const mat = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uBase: { value: new THREE.Color('#140904') },
      uGlow: { value: new THREE.Color('#5a2208') },
      uFloor: { value: new THREE.Color('#2a1004') },
      uCenter: { value: new THREE.Vector2(0.68, 0.5) },
      uAspect: { value: 1 },
      uGlowAmt: { value: 1 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.999, 1.0); }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uBase, uGlow, uFloor; uniform vec2 uCenter;
      uniform float uAspect, uGlowAmt, uTime;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec2 p = vUv - uCenter; p.x *= uAspect;
        float d = length(p);
        vec3 col = uBase;
        col = mix(col, uGlow, smoothstep(0.95, 0.0, d) * uGlowAmt);
        vec2 f = vec2((vUv.x - 0.5) * uAspect * 0.6, vUv.y + 0.25);
        col += uFloor * smoothstep(0.75, 0.0, length(f)) * 0.6;
        vec2 v = (vUv - 0.5) * vec2(uAspect, 1.0);
        col *= 1.0 - 0.45 * smoothstep(0.45, 1.25, length(v));
        col += (hash(vUv * 1024.0 + fract(uTime)) - 0.5) * (2.5 / 255.0);
        gl_FragColor = vec4(max(col, 0.0), 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  return mesh;
}

// ---------------------------------------------------------------- embers
export function makeEmbers(count) {
  const R = rng(42);
  const geo = new THREE.BufferGeometry();
  const p = new Float32Array(count * 3);
  const s = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    p[i * 3] = (R() - 0.5) * 18;
    p[i * 3 + 1] = 0;
    p[i * 3 + 2] = -7 + R() * 9.5;
    s[i * 4] = R(); s[i * 4 + 1] = R(); s[i * 4 + 2] = R(); s[i * 4 + 3] = 0.25 + R() * 0.55;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(s, 4));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uIntensity: { value: 1 }, uPixelRatio: { value: 1 }, uHeight: { value: 11 } },
    vertexShader: /* glsl */`
      attribute vec4 aSeed;
      uniform float uTime, uPixelRatio, uHeight;
      varying float vLife; varying float vFlick;
      void main() {
        float t = uTime * aSeed.w + aSeed.z * uHeight;
        vLife = mod(t, uHeight) / uHeight;
        vec3 p = position;
        p.y = vLife * uHeight - uHeight * 0.5;
        p.x += sin(uTime * 0.6 + aSeed.z * 6.283) * 0.6 * vLife + sin(uTime * 2.1 + aSeed.x * 30.0) * 0.06;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = mix(2.0, 6.5, fract(aSeed.x * 13.37));
        gl_PointSize = size * uPixelRatio * (8.0 / -mv.z) * (1.0 - vLife * 0.5);
        vFlick = 0.55 + 0.45 * sin(uTime * (4.0 + 8.0 * fract(aSeed.y * 7.1)) + aSeed.z * 20.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uIntensity;
      varying float vLife; varying float vFlick;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        a *= smoothstep(0.0, 0.12, vLife) * (1.0 - smoothstep(0.55, 1.0, vLife));
        vec3 col = mix(vec3(1.0, 0.78, 0.35), vec3(1.0, 0.28, 0.06), vLife) * 2.4;
        gl_FragColor = vec4(col * a * vFlick * uIntensity, 1.0);
      }
    `,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

// ---------------------------------------------------------------- glow sprite helpers
export function glowPlane(tex, color, size, opacity = 1) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({
      map: tex, color, transparent: true, opacity, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    })
  );
  return m;
}

// ---------------------------------------------------------------- pedestal
export function makePedestal(glowTex) {
  const g = new THREE.Group();
  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(1.0, 1.1, 0.14, 96),
    new THREE.MeshStandardMaterial({ color: '#1b100a', metalness: 0.75, roughness: 0.3 })
  );
  g.add(platform);
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.6, 0.5), toneMapped: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.06, 0.016, 12, 160), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.072;
  g.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.006, 8, 120), ringMat);
  ring2.rotation.x = Math.PI / 2;
  ring2.position.y = 0.074;
  g.add(ring2);
  const halo = glowPlane(glowTex, new THREE.Color('#ff8a2a'), 3.6, 0.38);
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.08;
  g.add(halo);
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color('#ff9a40') }, uAmt: { value: 0.1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 uColor; uniform float uAmt; varying vec2 vUv; void main(){ float a = pow(1.0 - vUv.y, 2.2) * uAmt; gl_FragColor = vec4(uColor * a, 1.0); }',
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.06, 2.4, 64, 1, true), beamMat);
  beam.position.y = 1.25;
  g.add(beam);
  const topRing = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.01, 8, 120), ringMat);
  topRing.rotation.x = Math.PI / 2;
  topRing.position.y = 2.45;
  g.add(topRing);
  g.userData = { ringMat, halo, beamMat, topRing };
  return g;
}

// ---------------------------------------------------------------- tandoor
export function makeTandoor(clayTex, glowTex, flameTex) {
  const g = new THREE.Group();
  const outerPts = [
    [0.0, -1.5], [1.12, -1.5], [1.42, -1.25], [1.6, -0.7], [1.66, -0.05], [1.56, 0.5],
    [1.34, 0.92], [1.14, 1.1], [1.08, 1.17], [1.0, 1.15],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const outerGeo = new THREE.LatheGeometry(outerPts, 96);
  const oc = new Float32Array(outerGeo.attributes.position.count * 3);
  for (let i = 0; i < outerGeo.attributes.position.count; i++) {
    const y = outerGeo.attributes.position.getY(i);
    const soot = smooth(0.6, 1.15, y) * 0.55;
    const s = 1 - soot;
    oc[i * 3] = s; oc[i * 3 + 1] = s * 0.95; oc[i * 3 + 2] = s * 0.92;
  }
  outerGeo.setAttribute('color', new THREE.BufferAttribute(oc, 3));
  clayTex.wrapS = clayTex.wrapT = THREE.RepeatWrapping;
  clayTex.repeat.set(3, 1);
  const outer = new THREE.Mesh(outerGeo, new THREE.MeshStandardMaterial({
    map: clayTex, color: '#a5684a', roughness: 0.92, vertexColors: true,
  }));
  g.add(outer);

  const innerPts = [
    [0.0, -1.3], [0.9, -1.24], [1.3, -0.9], [1.42, -0.2], [1.26, 0.55], [1.0, 1.12],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const innerGeo = new THREE.LatheGeometry(innerPts, 96);
  const ic = new Float32Array(innerGeo.attributes.position.count * 3);
  for (let i = 0; i < innerGeo.attributes.position.count; i++) {
    const y = innerGeo.attributes.position.getY(i);
    const t = smooth(-1.3, 1.1, y);
    ic[i * 3] = 2.2 - t * 1.8; ic[i * 3 + 1] = 0.95 - t * 0.88; ic[i * 3 + 2] = 0.2 - t * 0.19;
  }
  innerGeo.setAttribute('color', new THREE.BufferAttribute(ic, 3));
  const innerMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false });
  const inner = new THREE.Mesh(innerGeo, innerMat);
  g.add(inner);

  const mouthGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: new THREE.Color('#ff7a1a'), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  mouthGlow.scale.set(3.0, 3.0, 1);
  mouthGlow.position.y = 1.25;
  g.add(mouthGlow);

  const flames = [];
  const flameMat = new THREE.SpriteMaterial({
    map: flameTex, color: new THREE.Color(1.7, 0.6, 0.12), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
  });
  for (let i = 0; i < 7; i++) {
    const f = new THREE.Sprite(flameMat);
    f.center.set(0.5, 0.05);
    const a = (i / 7) * Math.PI * 2;
    f.userData = { a, r: 0.35 + (i % 3) * 0.2, ph: i * 1.7, s: 0.7 + (i % 4) * 0.18 };
    g.add(f);
    flames.push(f);
  }
  // The caller adds this light to the scene root so the light count never changes.
  const light = new THREE.PointLight('#ff7a22', 0, 9, 1.6);
  g.userData = { innerMat, mouthGlow, flames, light, flameMat };
  return g;
}

export function updateTandoor(g, t, heat) {
  const { flames, light, mouthGlow, flameMat } = g.userData;
  const flick = 0.85 + 0.15 * Math.sin(t * 13) * Math.sin(t * 7.3);
  light.intensity = heat * 9 * flick;
  mouthGlow.material.opacity = 0.25 + heat * 0.45 * flick;
  flameMat.opacity = heat;
  for (const f of flames) {
    const d = f.userData;
    const k = (Math.sin(t * 3 + d.ph) * 0.5 + 0.5);
    f.position.set(Math.cos(d.a + t * 0.4) * d.r, 0.95, Math.sin(d.a + t * 0.4) * d.r * 0.5);
    f.scale.set(d.s * (0.55 + 0.25 * k), Math.max(d.s * (0.7 + 0.9 * k) * heat, 0.001), 1);
  }
}

// ---------------------------------------------------------------- ingredients (instanced)
function cardamomGeometry() {
  const geo = new THREE.SphereGeometry(1, 24, 16);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const ridge = 1 + 0.08 * Math.cos(a * 3);
    p.setXYZ(i, x * 0.55 * ridge, y * 1.2, z * 0.55 * ridge);
  }
  geo.computeVertexNormals();
  return geo;
}

function saffronGeometry() {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.18, 0, 0), new THREE.Vector3(-0.06, 0.03, 0.02),
    new THREE.Vector3(0.06, -0.02, -0.02), new THREE.Vector3(0.18, 0.02, 0),
  ]);
  return new THREE.TubeGeometry(curve, 20, 0.008, 6, false);
}

export function makeIngredients() {
  const R = rng(11);
  const defs = [
    { key: 'flour', n: 22, geo: new THREE.IcosahedronGeometry(1, 1), mat: new THREE.MeshStandardMaterial({ color: '#cfc3ae', roughness: 1 }), s: [0.035, 0.075] },
    { key: 'milk', n: 6, geo: new THREE.SphereGeometry(1, 24, 16), mat: new THREE.MeshPhysicalMaterial({ color: '#d9d2c6', roughness: 0.25, clearcoat: 0.6, clearcoatRoughness: 0.3 }), s: [0.07, 0.11] },
    { key: 'ghee', n: 6, geo: new THREE.SphereGeometry(1, 24, 16).scale(1, 0.6, 1), mat: new THREE.MeshPhysicalMaterial({ color: '#f2bf45', roughness: 0.1, clearcoat: 1, emissive: '#6a3a00', emissiveIntensity: 0.35 }), s: [0.09, 0.15] },
    { key: 'saffron', n: 22, geo: saffronGeometry(), mat: new THREE.MeshStandardMaterial({ color: '#a8200e', emissive: '#4a0802', emissiveIntensity: 0.4, roughness: 0.55 }), s: [0.7, 1.0] },
    { key: 'cardamom', n: 8, geo: cardamomGeometry(), mat: new THREE.MeshStandardMaterial({ color: '#8fae55', roughness: 0.7 }), s: [0.08, 0.1] },
    { key: 'sugar', n: 14, geo: new THREE.BoxGeometry(1, 1, 1), mat: new THREE.MeshPhysicalMaterial({ color: '#d8d4cc', roughness: 0.2, transparent: true, opacity: 0.85 }), s: [0.035, 0.055] },
  ];
  const group = new THREE.Group();
  const sets = defs.map((d) => {
    const mesh = new THREE.InstancedMesh(d.geo, d.mat, d.n);
    mesh.frustumCulled = false;
    const items = [];
    for (let i = 0; i < d.n; i++) {
      items.push({
        a: R() * Math.PI * 2,
        r: 1.25 + R() * 0.8,
        y: (R() - 0.5) * 1.4,
        sp: (0.25 + R() * 0.35) * (R() < 0.5 ? 1 : 1.2),
        s: d.s[0] + R() * (d.s[1] - d.s[0]),
        rot: new THREE.Euler(R() * 6, R() * 6, R() * 6),
        rs: 0.5 + R() * 1.5,
        far: 7 + R() * 4,
        fa: R() * Math.PI * 2,
      });
    }
    group.add(mesh);
    return { mesh, items };
  });
  group.userData.sets = sets;
  return group;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
export function updateIngredients(group, t, enter, converge) {
  for (const { mesh, items } of group.userData.sets) {
    items.forEach((it, i) => {
      const a = it.a + t * it.sp;
      const r0 = it.r * (1 - converge);
      const fx = Math.cos(it.fa) * it.far, fy = Math.sin(it.fa) * it.far * 0.6;
      const ox = Math.cos(a) * r0 * 1.05, oz = Math.sin(a) * r0 * 0.7, oy = it.y * (1 - converge) + Math.sin(t + i) * 0.08;
      _p.set(fx + (ox - fx) * enter, fy + (oy - fy) * enter, oz * enter + (1 - enter) * 2);
      _e.set(it.rot.x + t * it.rs, it.rot.y + t * it.rs * 0.7, it.rot.z);
      _q.setFromEuler(_e);
      const sc = it.s * (1 - converge * converge) * Math.min(1, enter * 1.5);
      _s.set(sc, sc, sc);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- kulhad + chai + steam
export function makeKulhad(clayTex, foamTex, steamTex) {
  const g = new THREE.Group();
  const pts = [
    [0, 0], [0.17, 0], [0.19, 0.03], [0.235, 0.32], [0.268, 0.5], [0.282, 0.53],
    [0.268, 0.545], [0.252, 0.53], [0.228, 0.36], [0.182, 0.06], [0, 0.06],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const tex = clayTex.clone();
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  tex.needsUpdate = true;
  const cup = new THREE.Mesh(new THREE.LatheGeometry(pts, 64), new THREE.MeshStandardMaterial({ map: tex, color: '#d29a78', roughness: 0.95 }));
  g.add(cup);
  const chai = new THREE.Mesh(new THREE.CircleGeometry(0.25, 48), new THREE.MeshPhysicalMaterial({ map: foamTex, roughness: 0.5, clearcoat: 0.2, clearcoatRoughness: 0.4 }));
  chai.rotation.x = -Math.PI / 2;
  chai.position.y = 0.47;
  g.add(chai);
  const puffs = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTex, transparent: true, depthWrite: false, opacity: 0, color: '#fff3e6' }));
    m.userData.ph = i / 6;
    g.add(m);
    puffs.push(m);
  }
  g.userData = { puffs };
  return g;
}

export function updateKulhad(g, t, amt) {
  for (const m of g.userData.puffs) {
    const k = (t * 0.22 + m.userData.ph) % 1;
    m.position.set(Math.sin(t * 0.9 + m.userData.ph * 9) * 0.08 * (1 + k * 2), 0.55 + k * 1.1, 0);
    const s = (0.4 + k * 1.1) * 0.6;
    m.scale.set(s, s, s);
    m.material.opacity = amt * 0.55 * Math.sin(k * Math.PI);
  }
}

// ---------------------------------------------------------------- nashta box
export function makeBox(lidTex, frontTex) {
  const W = 2.6, D = 2.0, H = 0.62, T = 0.045;
  const maroon = new THREE.MeshStandardMaterial({ color: '#4a0e11', roughness: 0.55, metalness: 0.05 });
  const kraft = new THREE.MeshStandardMaterial({ color: '#a8804f', roughness: 0.9 });
  const lidMat = new THREE.MeshStandardMaterial({ map: lidTex, roughness: 0.45, metalness: 0.08 });
  const frontMat = new THREE.MeshStandardMaterial({ map: frontTex, roughness: 0.5 });
  const g = new THREE.Group();
  const base = new THREE.Group();
  g.add(base);
  const wall = (w, h, d, x, y, z, mats) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
    m.position.set(x, y, z);
    base.add(m);
    return m;
  };
  // BoxGeometry material order: +x, -x, +y, -y, +z, -z
  wall(W, T, D, 0, T / 2, 0, [maroon, maroon, kraft, maroon, maroon, maroon]);
  wall(W, H, T, 0, H / 2, D / 2 - T / 2, [maroon, maroon, maroon, maroon, frontMat, kraft]);
  wall(W, H, T, 0, H / 2, -D / 2 + T / 2, [maroon, maroon, maroon, maroon, kraft, maroon]);
  wall(T, H, D, W / 2 - T / 2, H / 2, 0, [maroon, kraft, maroon, maroon, maroon, maroon]);
  wall(T, H, D, -W / 2 + T / 2, H / 2, 0, [kraft, maroon, maroon, maroon, maroon, maroon]);
  const lid = new THREE.Group();
  lid.position.set(0, H, -D / 2);
  const top = new THREE.Mesh(new THREE.BoxGeometry(W + 0.04, T, D + 0.04), [maroon, maroon, lidMat, kraft, maroon, maroon]);
  top.position.set(0, T / 2, D / 2);
  lid.add(top);
  const flap = new THREE.Mesh(new THREE.BoxGeometry(W + 0.04, 0.2, T), [maroon, maroon, maroon, maroon, maroon, kraft]);
  flap.position.set(0, -0.08, D + 0.02);
  lid.add(flap);
  g.add(lid);
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.2, D - 0.2), new THREE.MeshStandardMaterial({ color: '#c9b08a', roughness: 0.95 }));
  paper.rotation.x = -Math.PI / 2;
  paper.position.y = T + 0.005;
  base.add(paper);
  g.userData = { lid, W, D, H };
  return g;
}
