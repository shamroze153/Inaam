// Procedural canvas textures: bread surfaces, clay, box print, glow sprites.
// Texture space for breads is a unit disc: canvas centre = bread centre,
// canvas edge circle = bread rim. Disc coords (u, v) = ((px-c)/rad, (py-c)/rad).
import * as THREE from 'three';

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeNoise(seed) {
  const r = rng(seed);
  const perm = new Uint16Array(512);
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) { perm[i] = i; vals[i] = r() * 2 - 1; }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const fade = (t) => t * t * (3 - 2 * t);
  const n2 = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const a = vals[perm[X + perm[Y]]], b = vals[perm[X + 1 + perm[Y]]];
    const c = vals[perm[X + perm[Y + 1]]], d = vals[perm[X + 1 + perm[Y + 1]]];
    const u = fade(xf), v = fade(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  n2.fbm = (x, y, oct = 4) => {
    let s = 0, amp = 0.5, f = 1;
    for (let i = 0; i < oct; i++) { s += amp * n2(x * f, y * f); f *= 2; amp *= 0.5; }
    return s;
  };
  return n2;
}

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function spot(ctx, x, y, r, inner, outer = 'rgba(0,0,0,0)') {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function grey(v, a = 1) { return `rgba(${v},${v},${v},${a})`; }

function grain(ctx, w, h, amt, R) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (R() - 0.5) * amt;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function inDisc(P, maxFrac = 1) {
  const r = Math.sqrt(P.R()) * maxFrac * P.rad;
  const t = P.R() * Math.PI * 2;
  return [P.c + Math.cos(t) * r, P.c + Math.sin(t) * r];
}

function baseCoat(ctx, P, col, rimStrength = 0.9) {
  const { size, c, rad, R } = P;
  ctx.fillStyle = col.base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 70; i++) {
    const [x, y] = inDisc(P, 1.05);
    spot(ctx, x, y, rad * (0.08 + R() * 0.25), rgba(R() < 0.5 ? col.light : col.dark, 0.14 + R() * 0.2));
  }
  const g = ctx.createRadialGradient(c, c, rad * 0.5, c, c, rad);
  g.addColorStop(0, rgba(col.rim, 0));
  g.addColorStop(0.72, rgba(col.rim, 0.35 * rimStrength));
  g.addColorStop(0.9, rgba(col.rim, 0.8 * rimStrength));
  g.addColorStop(1, rgba(col.rim, rimStrength));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

function specks(ctx, P, n, color, rMin, rMax, alpha, maxFrac = 0.95) {
  for (let i = 0; i < n; i++) {
    const [x, y] = inDisc(P, maxFrac);
    const r = P.rad * (rMin + P.R() * (rMax - rMin));
    ctx.fillStyle = rgba(color, alpha * (0.5 + P.R() * 0.5));
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
}

function seeds(ctx, bx, P, n, color, shade, len, wid, maxFrac, bumpV = 220) {
  for (let i = 0; i < n; i++) {
    const [x, y] = inDisc(P, maxFrac);
    const a = P.R() * Math.PI;
    const l = P.rad * len * (0.75 + P.R() * 0.5), w = P.rad * wid * (0.8 + P.R() * 0.4);
    ctx.fillStyle = rgba(shade, 0.35);
    ctx.beginPath(); ctx.ellipse(x + w * 0.5, y + w * 0.7, l, w, a, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(x, y, l, w, a, 0, Math.PI * 2); ctx.fill();
    bx.fillStyle = grey(bumpV);
    bx.beginPath(); bx.ellipse(x, y, l, w, a, 0, Math.PI * 2); bx.fill();
  }
}

// Fork-prick pattern shared by baked sheermaal and the raw dough it starts as.
export function makeDots(size, seed) {
  const R = rng(seed);
  const c = size / 2, rad = size / 2, step = rad * 0.1;
  const dots = [];
  for (let gy = -rad; gy <= rad; gy += step) {
    for (let gx = -rad; gx <= rad; gx += step) {
      const ox = (Math.round(gy / step) % 2) * step * 0.5;
      const x = gx + ox + (R() - 0.5) * rad * 0.02;
      const y = gy + (R() - 0.5) * rad * 0.02;
      if (Math.hypot(x, y) < rad * 0.7 && R() > 0.05) dots.push([c + x, c + y]);
    }
  }
  return dots;
}

const PAINTERS = {
  sheermaal(ctx, bx, P) {
    const { rad, R } = P;
    baseCoat(ctx, P, { base: '#d6741e', light: '#f2a43f', dark: '#b05214', rim: '#62260a' });
    for (let i = 0; i < 26; i++) {
      const [x, y] = inDisc(P, 0.8);
      spot(ctx, x, y, rad * (0.06 + R() * 0.14), rgba('#ffb550', 0.1 + R() * 0.12));
    }
    specks(ctx, P, 160, '#9a4512', 0.004, 0.018, 0.4, 0.9);
    for (const [x, y] of P.dots) {
      spot(ctx, x, y, rad * 0.04, rgba('#a8460f', 0.32));
      spot(ctx, x, y, rad * 0.016, rgba('#4a1a05', 0.95), rgba('#4a1a05', 0));
      spot(bx, x, y, rad * 0.035, grey(150, 0.9), grey(128, 0));
      spot(bx, x, y, rad * 0.014, grey(30, 1), grey(90, 0));
    }
  },
  rawPlain(ctx, bx, P) {
    baseCoat(ctx, P, { base: '#ead6ae', light: '#f6ead0', dark: '#d6be92', rim: '#c4a676' }, 0.5);
    specks(ctx, P, 500, '#ffffff', 0.002, 0.008, 0.55, 1);
  },
  rawDots(ctx, bx, P) {
    PAINTERS.rawPlain(ctx, bx, P);
    for (const [x, y] of P.dots) {
      spot(ctx, x, y, P.rad * 0.018, rgba('#9d8459', 0.9), rgba('#9d8459', 0));
    }
  },
  taftan(ctx, bx, P) {
    const { c, rad, R } = P;
    baseCoat(ctx, P, { base: '#d4863a', light: '#eeae5e', dark: '#b06424', rim: '#6c300f' });
    const rings = [0.2, 0.38, 0.56];
    for (const k of rings) {
      const n = Math.round((Math.PI * 2 * k) / 0.13);
      for (let j = 0; j < n; j++) {
        const a = (j / n) * Math.PI * 2 + k * 3;
        const x = c + Math.cos(a) * k * rad, y = c + Math.sin(a) * k * rad;
        for (const [g, col, inner] of [[ctx, '#7f3d12', 0.6], [bx, null, 0]]) {
          g.save(); g.translate(x, y); g.rotate(a); g.scale(1, 0.42);
          if (col) spot(g, 0, 0, rad * 0.05, rgba(col, inner));
          else spot(g, 0, 0, rad * 0.05, grey(60, 1), grey(128, 0));
          g.restore();
        }
      }
    }
    spot(ctx, c, c, rad * 0.07, rgba('#7f3d12', 0.6));
    spot(bx, c, c, rad * 0.07, grey(60, 1), grey(128, 0));
    for (let i = 0; i < 1100; i++) {
      const [x, y] = inDisc(P, 0.82);
      const r = rad * (0.004 + R() * 0.004);
      ctx.fillStyle = rgba('#f4e6c4', 0.9);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      bx.fillStyle = grey(200);
      bx.beginPath(); bx.arc(x, y, r, 0, Math.PI * 2); bx.fill();
    }
    for (let i = 0; i < 18; i++) {
      const [x, y] = inDisc(P, 0.8);
      spot(ctx, x, y, rad * (0.05 + R() * 0.12), rgba('#ffd28a', 0.14));
    }
  },
  roghni(ctx, bx, P) {
    const { c, rad, R, noise } = P;
    baseCoat(ctx, P, { base: '#cf8e3c', light: '#efb85f', dark: '#a6652a', rim: '#682d0e' });
    for (let k = -3; k <= 3; k++) {
      const yy = c + k * rad * 0.17;
      const draw = (g, style, w, off) => {
        g.strokeStyle = style; g.lineWidth = w; g.lineCap = 'round';
        g.beginPath();
        for (let t = -0.72; t <= 0.72; t += 0.02) {
          const x = c + t * rad;
          const y = yy + off + noise(t * 4, k * 3.1) * rad * 0.03;
          if (Math.hypot(x - c, y - c) > rad * 0.78) continue;
          if (t <= -0.71) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.stroke();
      };
      draw(ctx, rgba('#6e3510', 0.5), rad * 0.04, 0);
      draw(ctx, rgba('#ffd58e', 0.28), rad * 0.018, -rad * 0.035);
      draw(bx, grey(50, 1), rad * 0.045, 0);
      draw(bx, grey(175, 1), rad * 0.02, -rad * 0.04);
    }
    seeds(ctx, bx, P, 340, '#f7e8c6', '#6b3a14', 0.013, 0.0065, 0.82);
    for (let i = 0; i < 20; i++) {
      const [x, y] = inDisc(P, 0.8);
      spot(ctx, x, y, rad * (0.05 + R() * 0.12), rgba('#ffd28a', 0.18));
    }
  },
  kulcha(ctx, bx, P) {
    const { rad, R } = P;
    baseCoat(ctx, P, { base: '#ecd29c', light: '#fff1cf', dark: '#d8b578', rim: '#ad7036' });
    for (let i = 0; i < 24; i++) {
      const [x, y] = inDisc(P, 0.85);
      const r = rad * (0.05 + R() * 0.12);
      spot(ctx, x, y, r, rgba('#c07f3c', 0.4 + R() * 0.3));
      spot(ctx, x, y, r * 0.45, rgba('#8b501d', 0.3));
      spot(bx, x, y, r, grey(175, 1), grey(128, 0));
    }
    for (let i = 0; i < 16; i++) {
      const [x, y] = inDisc(P, 0.75);
      spot(ctx, x, y, rad * (0.06 + R() * 0.1), rgba('#fff6da', 0.28));
    }
    specks(ctx, P, 90, '#5b3417', 0.003, 0.007, 0.5, 0.85);
    for (let i = 0; i < 5; i++) {
      const [x, y] = inDisc(P, 0.5);
      P.out.bubbles.push({ u: (x - P.c) / rad, v: (y - P.c) / rad, r: 0.22 + R() * 0.12, h: 0.02 + R() * 0.02 });
    }
  },
  bakarkhani(ctx, bx, P) {
    const { c, rad, R, noise } = P;
    baseCoat(ctx, P, { base: '#dfae67', light: '#f6cf8c', dark: '#b8803e', rim: '#744014' });
    for (let k = 0; k < 17; k++) {
      const rk = (0.06 + k * 0.053) * rad;
      const ring = (g, style, w, dr) => {
        g.strokeStyle = style; g.lineWidth = w;
        g.beginPath();
        for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.04) {
          const rr = rk + dr + noise(Math.cos(a) * 2 + k, Math.sin(a) * 2) * rad * 0.012;
          const x = c + Math.cos(a) * rr, y = c + Math.sin(a) * rr;
          if (a === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.stroke();
      };
      ring(ctx, rgba('#8f531d', 0.45), rad * 0.01, 0);
      ring(ctx, rgba('#ffe3aa', 0.35), rad * 0.007, rad * 0.016);
      ring(bx, grey(60, 1), rad * 0.012, 0);
      ring(bx, grey(185, 1), rad * 0.01, rad * 0.018);
    }
    for (let i = 0; i < 60; i++) {
      const [x, y] = inDisc(P, 0.9);
      ctx.strokeStyle = rgba('#6d3a12', 0.35); ctx.lineWidth = rad * 0.006;
      ctx.beginPath(); ctx.arc(x, y, rad * (0.02 + R() * 0.04), R() * 6, R() * 6 + 1); ctx.stroke();
    }
    seeds(ctx, bx, P, 90, '#f7e8c6', '#6b3a14', 0.012, 0.006, 0.8);
  },
  lachha(ctx, bx, P) {
    const { c, rad, R, noise } = P;
    baseCoat(ctx, P, { base: '#d7943e', light: '#f5c066', dark: '#a6601f', rim: '#68300e' });
    const turns = 9, maxT = turns * Math.PI * 2;
    const spiral = (g, style, w, dr) => {
      g.strokeStyle = style; g.lineWidth = w; g.lineCap = 'round';
      g.beginPath();
      for (let t = 0; t <= maxT; t += 0.035) {
        const rr = (0.03 + (t / maxT) * 0.9) * rad + dr + noise(t * 0.7, 1.7) * rad * 0.012;
        const x = c + Math.cos(t) * rr, y = c + Math.sin(t) * rr;
        if (t === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    };
    spiral(ctx, rgba('#74390f', 0.55), rad * 0.013, 0);
    spiral(ctx, rgba('#ffd690', 0.35), rad * 0.009, rad * 0.022);
    spiral(bx, grey(55, 1), rad * 0.016, 0);
    spiral(bx, grey(190, 1), rad * 0.012, rad * 0.024);
    for (let i = 0; i < 130; i++) {
      const [x, y] = inDisc(P, 0.95);
      const r = rad * (0.008 + R() * 0.025);
      spot(ctx, x, y, r, rgba(R() < 0.6 ? '#7e4216' : '#ffcf80', 0.45));
      spot(bx, x, y, r, grey(R() < 0.5 ? 175 : 85, 1), grey(128, 0));
    }
    for (let i = 0; i < 18; i++) {
      const [x, y] = inDisc(P, 0.8);
      spot(ctx, x, y, rad * (0.06 + R() * 0.12), rgba('#ffd28a', 0.16));
    }
  },
  roti(ctx, bx, P) {
    const { rad, R } = P;
    baseCoat(ctx, P, { base: '#c6925e', light: '#dcb27f', dark: '#a37243', rim: '#6a401f' });
    for (let i = 0; i < 46; i++) {
      const [x, y] = inDisc(P, 0.9);
      const r = rad * (0.012 + Math.pow(R(), 2) * 0.05);
      spot(ctx, x, y, r * 2.4, rgba('#7a4a24', 0.3));
      spot(ctx, x, y, r, rgba('#24120a', 0.75 + R() * 0.2), rgba('#24120a', 0));
      spot(bx, x, y, r * 1.6, grey(200, 1), grey(128, 0));
      if (r > rad * 0.03) P.out.bubbles.push({ u: (x - P.c) / rad, v: (y - P.c) / rad, r: (r / rad) * 1.8, h: 0.012 });
    }
    specks(ctx, P, 320, '#efe0c4', 0.002, 0.007, 0.45, 0.95);
    for (let i = 0; i < 7; i++) {
      const [x, y] = inDisc(P, 0.35);
      spot(ctx, x, y, rad * 0.06, rgba('#e2bd8c', 0.4));
      spot(bx, x, y, rad * 0.06, grey(80, 1), grey(128, 0));
    }
  },
  kalonji(ctx, bx, P) {
    const { rad, R } = P;
    baseCoat(ctx, P, { base: '#e5c890', light: '#f7e4bb', dark: '#cfa66a', rim: '#955a27' });
    for (let i = 0; i < 34; i++) {
      const [x, y] = inDisc(P, 0.86);
      const r = rad * (0.025 + Math.pow(R(), 1.5) * 0.07);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.7);
      g.addColorStop(0, rgba('#22120a', 0.92));
      g.addColorStop(0.35, rgba('#6b3a17', 0.75));
      g.addColorStop(0.65, rgba('#b97a3b', 0.45));
      g.addColorStop(1, rgba('#b97a3b', 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.7, 0, Math.PI * 2); ctx.fill();
      spot(bx, x, y, r * 1.6, grey(235, 1), grey(128, 0));
      P.out.bubbles.push({ u: (x - P.c) / rad, v: (y - P.c) / rad, r: (r / rad) * 1.7, h: 0.025 + R() * 0.035 });
    }
    seeds(ctx, bx, P, 190, '#120d0b', '#000000', 0.01, 0.0055, 0.85, 175);
    specks(ctx, P, 200, '#fff6e0', 0.002, 0.006, 0.4, 0.95);
  },
};

export function paintBread(kind, size, seed, dots) {
  const R = rng(seed);
  const col = canvas(size), bmp = canvas(size);
  const ctx = col.getContext('2d', { willReadFrequently: true });
  const bx = bmp.getContext('2d');
  bx.fillStyle = grey(128);
  bx.fillRect(0, 0, size, size);
  const out = { bubbles: [] };
  const P = { size, c: size / 2, rad: size / 2, R, noise: makeNoise(seed + 7), dots, out };
  PAINTERS[kind](ctx, bx, P);
  grain(ctx, size, size, 14, R);
  return { color: col, bump: bmp, bubbles: out.bubbles };
}

export function toTexture(cnv, srgb = true, aniso = 4) {
  const t = new THREE.CanvasTexture(cnv);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

export function clayTexture(seed, base = '#a9532b', size = 512) {
  const R = rng(seed);
  const c = canvas(size);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 90; i++) {
    const x = R() * size, y = R() * size;
    spot(ctx, x, y, size * (0.04 + R() * 0.16), rgba(R() < 0.5 ? '#c56a3a' : '#7d3a1d', 0.18 + R() * 0.15));
  }
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = rgba(R() < 0.5 ? '#e0a074' : '#4e2412', 0.3 + R() * 0.4);
    ctx.fillRect(R() * size, R() * size, 1 + R() * 2, 1 + R() * 2);
  }
  for (let y = 0; y < size; y += 3 + R() * 6) {
    ctx.fillStyle = rgba('#5b2a14', 0.07);
    ctx.fillRect(0, y, size, 1 + R() * 2);
  }
  grain(ctx, size, size, 18, R);
  return c;
}

export function glowTexture(size = 256, power = 1.6) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - size / 2 + 0.5, y - size / 2 + 0.5) / (size / 2);
      const a = Math.pow(Math.max(0, 1 - d), power);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function flameTexture() {
  const w = 128, h = 256;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x / w - 0.5) * 2, v = y / h; // v: 0 top, 1 bottom
      const width = Math.pow(v, 0.7) * (1 - Math.pow(v, 6) * 0.3);
      const d = Math.abs(u) / Math.max(width, 0.001);
      let a = Math.max(0, 1 - d) * Math.min(1, (1 - v) * 4) * Math.pow(v, 0.4);
      a = Math.pow(a, 1.3);
      const i = (y * w + x) * 4;
      img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255;
      img.data[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function steamTexture(seed = 3) {
  const R = rng(seed);
  const size = 256;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  for (let i = 0; i < 14; i++) {
    const x = size * (0.3 + R() * 0.4), y = size * (0.3 + R() * 0.4);
    spot(ctx, x, y, size * (0.12 + R() * 0.2), 'rgba(255,255,255,0.22)');
  }
  return c;
}

function spacedText(ctx, text, x, y, spacing) {
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (text.length - 1);
  let cx = x - total / 2;
  ctx.textAlign = 'left';
  [...text].forEach((ch, i) => { ctx.fillText(ch, cx, y); cx += widths[i] + spacing; });
}

function arcText(ctx, text, cx, cy, r, startAngle, spacing) {
  const chars = [...text];
  const widths = chars.map((ch) => ctx.measureText(ch).width + spacing);
  const total = widths.reduce((a, b) => a + b, 0);
  let a = startAngle - total / r / 2;
  ctx.textAlign = 'center';
  chars.forEach((ch, i) => {
    const w = widths[i];
    a += w / r / 2;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    a += w / r / 2;
  });
}

const GOLD = '#e2bb69';
const URDU_FONT = '"Noto Nastaliq Urdu", "Jameel Noori Nastaleeq", "Urdu Typesetting", serif';
const DISPLAY_FONT = 'Anton, Impact, "Arial Narrow", sans-serif';

function jaali(ctx, w, h, step, alpha) {
  ctx.strokeStyle = rgba(GOLD, alpha);
  ctx.lineWidth = 1.4;
  for (let y = step / 2; y < h; y += step) {
    for (let x = step / 2; x < w; x += step) {
      const r = step * 0.28;
      ctx.beginPath();
      for (let k = 0; k <= 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const rr = k % 2 ? r * 0.55 : r;
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }
}

export function boxLidTexture() {
  const w = 1024, h = 788;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(w / 2, h / 2, 50, w / 2, h / 2, w * 0.7);
  g.addColorStop(0, '#6e1a1c');
  g.addColorStop(1, '#3a0a0d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  jaali(ctx, w, h, 72, 0.12);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 4; ctx.strokeRect(26, 26, w - 52, h - 52);
  ctx.lineWidth = 1.5; ctx.strokeRect(40, 40, w - 80, h - 80);
  const cx = w / 2, cy = h / 2;
  ctx.fillStyle = '#300809';
  ctx.beginPath(); ctx.arc(cx, cy, 230, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(cx, cy, 230, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 206, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 150, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = GOLD;
  ctx.font = `30px ${DISPLAY_FONT}`;
  arcText(ctx, 'TANDOOR FRESH  •  HAR SUBAH  •', cx, cy, 168, -Math.PI / 2, 7);
  arcText(ctx, '•  SHEERMAAL HOUSE  •', cx, cy, 192, Math.PI / 2, 7);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 92px ${URDU_FONT}`;
  ctx.fillText('انعام', cx, cy - 10);
  ctx.font = `26px ${DISPLAY_FONT}`;
  spacedText(ctx, 'INAAM', cx, cy + 92, 10);
  return c;
}

export function boxFrontTexture() {
  const w = 1024, h = 240;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4a0e11';
  ctx.fillRect(0, 0, w, h);
  jaali(ctx, w, h, 60, 0.08);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 3; ctx.strokeRect(16, 16, w - 32, h - 32);
  ctx.fillStyle = GOLD;
  ctx.textBaseline = 'middle';
  ctx.font = `86px ${DISPLAY_FONT}`;
  spacedText(ctx, 'SHAHI NASHTA', w / 2 - 70, h / 2 - 6, 6);
  ctx.font = `700 46px ${URDU_FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('ناشتہ', w - 130, h / 2);
  ctx.font = `600 20px Manrope, system-ui, sans-serif`;
  spacedText(ctx, 'INAAM SHEERMAAL HOUSE', w / 2 - 70, h - 40, 6);
  return c;
}

export function foamTexture() {
  const size = 256;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, '#b07445');
  g.addColorStop(0.6, '#c08957');
  g.addColorStop(0.86, '#e2c19a');
  g.addColorStop(1, '#f1dcc0');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const R = rng(9);
  for (let i = 0; i < 120; i++) {
    const a = R() * Math.PI * 2, r = size * (0.36 + R() * 0.13);
    spot(ctx, size / 2 + Math.cos(a) * r, size / 2 + Math.sin(a) * r, 3 + R() * 6, 'rgba(255,240,220,0.5)');
  }
  return c;
}
