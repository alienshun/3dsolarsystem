/**
 * 构建期网格抽稀（规格 §4.6 LOD/decimate）：二进制 STL 顶点聚类降面。
 * 用法：node scripts/decimate-stl.mjs <in.stl> <out.stl> [grid=48]
 * 顶点聚类：体素格内顶点取平均，三角形重映射后丢弃退化面。
 */
import { readFileSync, writeFileSync } from "node:fs";

const [inPath, outPath, gridArg] = process.argv.slice(2);
const G = Number(gridArg ?? 48);

const buf = readFileSync(inPath);
const triCount = buf.readUInt32LE(80);
const tris = new Float32Array(triCount * 9);
for (let t = 0; t < triCount; t++) {
  const o = 84 + t * 50 + 12; // 跳过法线
  for (let k = 0; k < 9; k++) tris[t * 9 + k] = buf.readFloatLE(o + k * 4);
}
console.log(`${inPath}: ${triCount} triangles`);

const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < tris.length; i += 3) {
  for (let c = 0; c < 3; c++) {
    const v = tris[i + c];
    if (v < min[c]) min[c] = v;
    if (v > max[c]) max[c] = v;
  }
}
const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
const cell = extent / G;

const clusterPos = new Map(); // key -> [sx,sy,sz,n]
const clusterIndex = new Map(); // key -> new index
const newVerts = [];
function vertexIndex(x, y, z) {
  const kx = Math.floor((x - min[0]) / cell);
  const ky = Math.floor((y - min[1]) / cell);
  const kz = Math.floor((z - min[2]) / cell);
  const key = `${kx},${ky},${kz}`;
  let acc = clusterPos.get(key);
  if (!acc) {
    acc = [0, 0, 0, 0];
    clusterPos.set(key, acc);
    clusterIndex.set(key, newVerts.length / 3);
    newVerts.push(0, 0, 0);
  }
  acc[0] += x; acc[1] += y; acc[2] += z; acc[3] += 1;
  return clusterIndex.get(key);
}

const idx = new Int32Array(triCount * 3);
for (let t = 0; t < triCount; t++) {
  for (let v = 0; v < 3; v++) {
    idx[t * 3 + v] = vertexIndex(tris[t * 9 + v * 3], tris[t * 9 + v * 3 + 1], tris[t * 9 + v * 3 + 2]);
  }
}
// 用累加和写回平均位置
for (const [key, acc] of clusterPos) {
  const vi = clusterIndex.get(key) * 3;
  newVerts[vi] = acc[0] / acc[3];
  newVerts[vi + 1] = acc[1] / acc[3];
  newVerts[vi + 2] = acc[2] / acc[3];
}

const outTris = [];
for (let t = 0; t < triCount; t++) {
  const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2];
  if (a === b || b === c || a === c) continue;
  outTris.push(a, b, c);
}
const nOut = outTris.length / 3;

const out = Buffer.alloc(84 + nOut * 50);
out.write("decimated vertex-cluster", 0, "ascii");
out.writeUInt32LE(nOut, 80);
for (let t = 0; t < nOut; t++) {
  const o = 84 + t * 50 + 12;
  for (let v = 0; v < 3; v++) {
    for (let c = 0; c < 3; c++) out.writeFloatLE(newVerts[outTris[t * 3 + v] * 3 + c], o + v * 12 + c * 4);
  }
}
writeFileSync(outPath, out);
console.log(`${outPath}: ${nOut} triangles, ${newVerts.length / 3} verts, extents ${(max[0] - min[0]).toPrecision(4)} ${(max[1] - min[1]).toPrecision(4)} ${(max[2] - min[2]).toPrecision(4)}`);
