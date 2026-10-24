// Renders the link-preview image, app/opengraph-image.png: the first frame of
// the login screen's Threads background (components/Threads.tsx, with the
// props from components/login/threads-background.tsx) at 1200 x 630.
//
// The shader is ported to the CPU so no browser or new dependency is needed.
// Re-run after changing the Threads props:
//   node apps/web/scripts/render-og-image.mjs
import { writeFileSync } from "node:fs";
import { deflateSync, crc32 } from "node:zlib";

const W = 1200;
const H = 630;
const BACKGROUND = 0x0a; // the login page's bg-[#0a0a0a]
const SUBSAMPLES = 4; // per axis

// Threads defaults; the login screen overrides only speed and mouse
// interaction, neither of which affects the first frame.
const P = {
  amplitude: 1.7,
  distance: 0.4,
  lineCount: 90,
  thickness: 0.6,
  softness: 1.3,
  waves: 1.05,
  split: 0.04,
  fray: 0.5,
  angle: 25,
  seed: 0,
  taper: 0.85,
  brightness: 1.4,
};
const TIME = 0;
const MOUSE = [0.5, 0.5];

// GLSL highp is 32-bit; the noise hash depends on that precision.
const f = Math.fround;
const fract = (x) => f(x - Math.floor(x));
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function perlin2D(px, py) {
  const pix = Math.floor(px);
  const piy = Math.floor(py);
  const pf = [f(px - pix), f(py - piy), f(px - (pix + 1)), f(py - (piy + 1))];
  let pt = [pix, piy, pix + 1, piy + 1].map((v) => {
    const m = f(v - f(Math.floor(f(v * f(1 / 71))) * 71));
    return m;
  });
  pt = [f(pt[0] + 26), f(pt[1] + 161), f(pt[2] + 26), f(pt[3] + 161)];
  pt = pt.map((v) => f(v * v));
  // Pt.xzxz * Pt.yyww
  const h = [f(pt[0] * pt[1]), f(pt[2] * pt[1]), f(pt[0] * pt[3]), f(pt[2] * pt[3])];
  const fx = [pf[0], pf[2], pf[0], pf[2]];
  const fy = [pf[1], pf[1], pf[3], pf[3]];
  const g = h.map((v, i) => {
    const gx = fract(f(v * f(1 / 951.135664))) - 0.49999;
    const gy = fract(f(v * f(1 / 642.949883))) - 0.49999;
    return ((gx * fx[i] + gy * fy[i]) / Math.sqrt(gx * gx + gy * gy)) * Math.SQRT2;
  });
  const bx = pf[0] ** 3 * (pf[0] * (pf[0] * 6 - 15) + 10);
  const by = pf[1] ** 3 * (pf[1] * (pf[1] * 6 - 15) + 10);
  // dot(g, blend2.zxzx * blend2.wwyy), blend2 = (bx, by, 1-bx, 1-by)
  return (
    g[0] * (1 - bx) * (1 - by) +
    g[1] * bx * (1 - by) +
    g[2] * (1 - bx) * by +
    g[3] * bx * by
  );
}

const rad = (P.angle * Math.PI) / 180;
const cos = Math.cos(rad);
const sin = Math.sin(rad);
const frameX = Math.abs(W * cos) + Math.abs(H * sin);
const frameY = Math.abs(W * sin) + Math.abs(H * cos);
const pixel = 1 / Math.max(W, H);
const seed = P.seed * 13.37;

// Per line, the centre (local y) and half-width of the strip, sampled along x.
const SAMPLES = Math.ceil(frameX) * 2;
const lines = [];
for (let i = 0; i < P.lineCount; i++) {
  const perc = i / P.lineCount;
  const centre = new Float64Array(SAMPLES + 1);
  const draw = new Float64Array(SAMPLES + 1);
  const band = new Float64Array(SAMPLES + 1);
  for (let s = 0; s <= SAMPLES; s++) {
    const x = s / SAMPLES;
    const splitPoint = P.split + perc * P.fray;
    const amplitudeNormal = smoothstep(splitPoint, Math.max(0.7, splitPoint + 0.2), x);
    const finalAmplitude =
      amplitudeNormal * 0.5 * P.amplitude * (1 + (MOUSE[1] - 0.5) * 0.2);
    const t = TIME / 10 + (MOUSE[0] - 0.5);
    const blur = smoothstep(splitPoint, splitPoint + 0.05, x) * perc;
    const n1 = perlin2D(t * 2.5 + seed, (x * P.waves + perc) * 2.5);
    const n2 = perlin2D(t * 3.5 + seed, (x * P.waves + t) * 3.5) / 1.5;
    const xnoise = n1 + (n2 - n1) * (x * 0.3);
    const y = 0.5 + (perc - 0.5) * P.distance + (xnoise / 2) * finalAmplitude;
    const width = 7 * P.thickness * pixel * (1 - perc);
    band[s] = (width / 2 + 10 * P.softness * pixel * blur) * frameY;
    draw[s] = Math.max(band[s], 1);
    centre[s] = (y - 0.5) * frameY;
  }
  const alpha = 1 - smoothstep(0, 1, Math.pow(perc, 0.3)) * P.taper;
  lines.push({ centre, draw, band, alpha });
}

// Lines blend in instance order: dst = src + dst * (1 - srcAlpha). They are
// white, so premultiplied colour equals alpha and only alpha is tracked.
function coverageAt(gx, gy) {
  // Screen (y up, origin at centre) to the strip's unrotated frame.
  const lx = gx * cos + gy * sin;
  const ly = -gx * sin + gy * cos;
  const x = lx / frameX + 0.5;
  if (x < 0 || x > 1) return 0;
  const pos = x * SAMPLES;
  const s = Math.min(SAMPLES - 1, Math.floor(pos));
  const k = pos - s;
  let a = 0;
  for (const line of lines) {
    const centre = line.centre[s] + (line.centre[s + 1] - line.centre[s]) * k;
    const draw = line.draw[s] + (line.draw[s + 1] - line.draw[s]) * k;
    const edge = Math.abs(ly - centre);
    if (edge >= draw) continue;
    const band = line.band[s] + (line.band[s + 1] - line.band[s]) * k;
    const c = (1 - smoothstep(0, draw, edge)) * (band / draw) * line.alpha;
    a = c + a * (1 - c);
  }
  return a;
}

const curve = 2 / P.brightness;
const rowBytes = 1 + W * 3;
const raw = Buffer.alloc(rowBytes * H);
for (let r = 0; r < H; r++) {
  raw[r * rowBytes] = 0; // filter: none
  for (let c = 0; c < W; c++) {
    let sum = 0;
    for (let sy = 0; sy < SUBSAMPLES; sy++) {
      for (let sx = 0; sx < SUBSAMPLES; sx++) {
        const gx = c + (sx + 0.5) / SUBSAMPLES - W / 2;
        const gy = H / 2 - (r + (sy + 0.5) / SUBSAMPLES);
        const a = coverageAt(gx, gy);
        // Screen pass: colour * alpha^curve, composited over the page.
        sum += Math.pow(a, curve) * 255 + BACKGROUND * (1 - a);
      }
    }
    const v = Math.round(sum / (SUBSAMPLES * SUBSAMPLES));
    raw.fill(v, r * rowBytes + 1 + c * 3, r * rowBytes + 4 + c * 3);
  }
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // colour type: RGB
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = new URL("../app/opengraph-image.png", import.meta.url);
writeFileSync(out, png);
console.log(`Wrote ${out.pathname} (${(png.length / 1024).toFixed(0)} KB)`);
