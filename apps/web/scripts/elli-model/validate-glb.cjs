// Validates the Elli GLB for the Mapbox ModelLayer.
// Usage: node validate-glb.cjs <file.glb>
// Mapbox crashes natively (Android SIGSEGV) on non-indexed primitives, so every
// primitive must carry `indices`. Also checks size, triangle budget, real-world
// bounds (metres, Y-up) and that the nose (front light) points to +X.
const fs = require('fs');

const LIMITS = { maxTris: 15000, maxBytes: 400 * 1024, tol: 0.05 };
const DIMS = { x: 4.56, y: 1.86, z: 1.76 }; // length, height, width

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

const file = process.argv[2];
if (!file) fail('usage: node validate-glb.cjs <file.glb>');
const buf = fs.readFileSync(file);
if (buf.toString('utf8', 0, 4) !== 'glTF') fail('not a GLB');
const jsonLen = buf.readUInt32LE(12);
const gltf = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
const binStart = 20 + jsonLen + 8;

if (buf.length > LIMITS.maxBytes) fail(`file ${buf.length} B > ${LIMITS.maxBytes} B`);
if ((gltf.images || []).length) fail('textures present');

for (const n of gltf.nodes || []) {
  const t = n.translation, r = n.rotation, s = n.scale;
  const ident =
    (!t || t.every((v) => Math.abs(v) < 1e-6)) &&
    (!r || (Math.abs(r[0]) < 1e-6 && Math.abs(r[1]) < 1e-6 && Math.abs(r[2]) < 1e-6)) &&
    (!s || s.every((v) => Math.abs(v - 1) < 1e-6)) &&
    !n.matrix;
  if (n.mesh !== undefined && !ident) fail(`node "${n.name}" has a non-identity transform`);
}

function readVec3(accIdx) {
  const acc = gltf.accessors[accIdx];
  const view = gltf.bufferViews[acc.bufferView];
  const stride = view.byteStride || 12;
  const base = binStart + (view.byteOffset || 0) + (acc.byteOffset || 0);
  const out = [];
  for (let i = 0; i < acc.count; i++) {
    const o = base + i * stride;
    out.push([buf.readFloatLE(o), buf.readFloatLE(o + 4), buf.readFloatLE(o + 8)]);
  }
  return out;
}

let tris = 0;
const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
let frontX = null;
for (const mesh of gltf.meshes) {
  for (const p of mesh.primitives) {
    if (p.indices === undefined) fail(`primitive in mesh "${mesh.name}" has no indices`);
    if ((p.mode ?? 4) !== 4) fail('non-triangle primitive');
    tris += gltf.accessors[p.indices].count / 3;
    const pos = readVec3(p.attributes.POSITION);
    for (const v of pos) for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], v[k]);
      max[k] = Math.max(max[k], v[k]);
    }
    const mat = p.material !== undefined ? gltf.materials[p.material].name : '';
    if (mat === 'light_front') frontX = pos.reduce((s, v) => s + v[0], 0) / pos.length;
  }
}

if (tris > LIMITS.maxTris) fail(`${tris} triangles > ${LIMITS.maxTris}`);
const ext = { x: max[0] - min[0], y: max[1] - min[1], z: max[2] - min[2] };
for (const k of ['x', 'y', 'z']) {
  if (Math.abs(ext[k] - DIMS[k]) / DIMS[k] > LIMITS.tol)
    fail(`extent ${k} = ${ext[k].toFixed(3)} m, expected ${DIMS[k]} ±${LIMITS.tol * 100}%`);
}
if (Math.abs(min[1]) >= 0.02) fail(`min y = ${min[1].toFixed(3)} (model not on the ground)`);
if (frontX === null) fail('no "light_front" material');
if (frontX <= 0) fail(`front light at x = ${frontX.toFixed(2)} — nose does not point to +X`);

console.log(
  `OK ${file}: ${tris} tris, ${(buf.length / 1024).toFixed(0)} KB, ` +
    `${ext.x.toFixed(2)}×${ext.y.toFixed(2)}×${ext.z.toFixed(2)} m, ${gltf.materials.length} materials`,
);
