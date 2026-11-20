// Generates a low-poly, flat-shaded Elli e-van as GLB (glTF 2.0, Y-up, metres).
// Forward = +X, left = -Z, origin = ground centre. Usage: node make-elli.cjs out.glb
const fs = require('fs');

const srgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return [...c, 1];
};

const MATERIALS = {
  body: { color: '#FFB703', rough: 0.55 },
  roof: { color: '#FFF4D6', rough: 0.6 },
  glass: { color: '#1F2A37', rough: 0.15, metal: 0.1 },
  stripe: { color: '#00498B', rough: 0.5 },
  tyre: { color: '#1B1B1D', rough: 0.9 },
  hub: { color: '#C9CDD3', rough: 0.4, metal: 0.3 },
  trim: { color: '#3A3F47', rough: 0.7 },
  head: { color: '#FFFBEA', rough: 0.2, emissive: '#FFF1B8' },
  tail: { color: '#D7263D', rough: 0.3, emissive: '#7A0F1C' },
};

const tris = Object.fromEntries(Object.keys(MATERIALS).map((k) => [k, []]));

function tri(mat, a, b, c) {
  tris[mat].push([a, b, c]);
}
function quad(mat, a, b, c, d) {
  tri(mat, a, b, c);
  tri(mat, a, c, d);
}

// Side profile (x, y) polygon, extruded between z0 and z1. Profile must be
// counter-clockwise when viewed from +Z and star-shaped from its centroid.
function prism(mat, profile, z0, z1) {
  const n = profile.length;
  const cx = profile.reduce((s, p) => s + p[0], 0) / n;
  const cy = profile.reduce((s, p) => s + p[1], 0) / n;
  for (let i = 0; i < n; i++) {
    const p = profile[i];
    const q = profile[(i + 1) % n];
    // +Z cap (CCW seen from +Z)
    tri(mat, [cx, cy, z1], [p[0], p[1], z1], [q[0], q[1], z1]);
    // -Z cap (reversed)
    tri(mat, [cx, cy, z0], [q[0], q[1], z0], [p[0], p[1], z0]);
    // side wall
    quad(mat, [p[0], p[1], z0], [q[0], q[1], z0], [q[0], q[1], z1], [p[0], p[1], z1]);
  }
}

function box(mat, x0, x1, y0, y1, z0, z1) {
  prism(mat, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], z0, z1);
}

// Cylinder along Z.
function cylinder(mat, cx, cy, r, z0, z1, seg = 18) {
  const profile = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    profile.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  prism(mat, profile, z0, z1);
}

const W = 0.9; // half width

// Main body: friendly rounded-box van silhouette.
prism(
  'body',
  [
    [-2.2, 0.32],
    [2.22, 0.32],
    [2.3, 0.6],
    [2.28, 0.95],
    [2.05, 1.12],
    [1.25, 1.82],
    [-2.05, 1.9],
    [-2.2, 1.78],
  ],
  -W,
  W,
);

// Roof cap
box('roof', -1.95, 1.05, 1.9, 1.97, -0.78, 0.78);

// Side windows (both sides), slightly proud of the body
const sideWin = [
  [-1.85, 1.22],
  [1.12, 1.22],
  [1.62, 1.22],
  [1.18, 1.72],
  [-1.85, 1.76],
];
prism('glass', sideWin, W, W + 0.015);
prism('glass', sideWin, -W - 0.015, -W);
// B-pillar breaks
box('body', -0.35, -0.22, 1.2, 1.78, W + 0.015, W + 0.03);
box('body', -0.35, -0.22, 1.2, 1.78, -W - 0.03, -W - 0.015);
box('body', 0.75, 0.86, 1.2, 1.74, W + 0.015, W + 0.03);
box('body', 0.75, 0.86, 1.2, 1.74, -W - 0.03, -W - 0.015);

// Windshield: thin slab parallel to the slanted front, offset outward.
{
  const ax = 2.0, ay = 1.17, bx = 1.38, by = 1.71;
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
  const nx = dy / len, ny = -dx / len; // outward normal (points +x/+y)
  const o = 0.004, t = 0.01;
  prism(
    'glass',
    [
      [ax + nx * o, ay + ny * o],
      [ax + nx * (o + t), ay + ny * (o + t)],
      [bx + nx * (o + t), by + ny * (o + t)],
      [bx + nx * o, by + ny * o],
    ],
    -0.72,
    0.72,
  );
}
// Rear window
box('glass', -2.225, -2.205, 1.3, 1.72, -0.7, 0.7);

// Röbel navy stripe
box('stripe', -2.18, 2.26, 0.62, 0.74, W, W + 0.012);
box('stripe', -2.18, 2.26, 0.62, 0.74, -W - 0.012, -W);

// Bumpers
box('trim', 2.18, 2.36, 0.3, 0.52, -0.86, 0.86);
box('trim', -2.32, -2.12, 0.3, 0.52, -0.86, 0.86);

// Lights
box('head', 2.26, 2.31, 0.8, 0.95, 0.5, 0.8);
box('head', 2.26, 2.31, 0.8, 0.95, -0.8, -0.5);
box('tail', -2.23, -2.2, 0.85, 1.2, 0.66, 0.86);
box('tail', -2.23, -2.2, 0.85, 1.2, -0.86, -0.66);

// Wheels
for (const x of [1.45, -1.45]) {
  for (const s of [1, -1]) {
    const zIn = s * 0.68, zOut = s * 0.95;
    cylinder('tyre', x, 0.36, 0.36, Math.min(zIn, zOut), Math.max(zIn, zOut));
    const zh0 = s > 0 ? 0.95 : -0.965;
    cylinder('hub', x, 0.36, 0.18, zh0, zh0 + 0.015, 12);
  }
}

// ---- GLB assembly (indexed, flat normals) ----
const bins = [];
let byteOffset = 0;
const bufferViews = [];
const accessors = [];
const primitives = [];
const materials = [];

function push(typed, target) {
  const raw = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
  bufferViews.push({ buffer: 0, byteOffset, byteLength: raw.length, target });
  // keep every view 4-byte aligned
  const buf = Buffer.concat([raw, Buffer.alloc((4 - (raw.length % 4)) % 4)]);
  bins.push(buf);
  byteOffset += buf.length;
  return bufferViews.length - 1;
}

for (const [name, list] of Object.entries(tris)) {
  if (!list.length) continue;
  const pos = [];
  const nor = [];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const [a, b, c] of list) {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...n) || 1;
    n = n.map((x) => x / l);
    for (const p of [a, b, c]) {
      pos.push(...p);
      nor.push(...n);
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], p[i]);
        max[i] = Math.max(max[i], p[i]);
      }
    }
  }
  const count = pos.length / 3;
  const pv = push(new Float32Array(pos), 34962);
  accessors.push({ bufferView: pv, componentType: 5126, count, type: 'VEC3', min, max });
  const pa = accessors.length - 1;
  const nv = push(new Float32Array(nor), 34962);
  accessors.push({ bufferView: nv, componentType: 5126, count, type: 'VEC3' });
  const na = accessors.length - 1;
  // Mapbox's native glTF loader dereferences the index accessor unconditionally
  // (non-indexed primitives crash it with a null deref on Android), so always
  // emit indices even though every vertex is unique (flat shading).
  const iv = push(Uint16Array.from({ length: count }, (_, i) => i), 34963);
  accessors.push({ bufferView: iv, componentType: 5123, count, type: 'SCALAR', min: [0], max: [count - 1] });
  const ia = accessors.length - 1;

  const m = MATERIALS[name];
  const mat = {
    name,
    pbrMetallicRoughness: {
      baseColorFactor: srgb(m.color),
      metallicFactor: m.metal ?? 0,
      roughnessFactor: m.rough,
    },
  };
  if (m.emissive) mat.emissiveFactor = srgb(m.emissive).slice(0, 3);
  materials.push(mat);
  primitives.push({ attributes: { POSITION: pa, NORMAL: na }, indices: ia, material: materials.length - 1, mode: 4 });
}

const bin = Buffer.concat(bins);
const gltf = {
  asset: { version: '2.0', generator: 'roebel-elli-van' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'elli' }],
  meshes: [{ name: 'elli', primitives }],
  materials,
  accessors,
  bufferViews,
  buffers: [{ byteLength: bin.length }],
};

const pad = (buf, ch) => {
  const p = (4 - (buf.length % 4)) % 4;
  return Buffer.concat([buf, Buffer.alloc(p, ch)]);
};
const json = pad(Buffer.from(JSON.stringify(gltf)), 0x20);
const binP = pad(bin, 0);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + binP.length, 8);
const jh = Buffer.alloc(8);
jh.writeUInt32LE(json.length, 0);
jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8);
bh.writeUInt32LE(binP.length, 0);
bh.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(process.argv[2], Buffer.concat([header, jh, json, bh, binP]));
console.log('wrote', process.argv[2], 'triangles', Object.values(tris).reduce((s, l) => s + l.length, 0));
