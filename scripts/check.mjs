/**
 * Self-check. Chạy bằng: npm test
 *
 * Kiểm tra đúng 6 thứ dễ vỡ nhất và vỡ âm thầm:
 *  1. ExtrudeGeometry với lỗ hình học (frame kính) — triangulation có hỏng không
 *  2. Uniform khai báo trong GLSL có khớp với uniforms object không (typo = silent)
 *  3. smoothstep(hi, lo, x) — undefined behaviour theo GLSL spec
 *  4. Ánh xạ section -> u của scroll rig (off-by-one ở section cuối)
 *  5. Nội dung demo trong canvas không tràn khung
 *  6. Hai trang HTML (EN/VI) đồng bộ: cùng section, cùng id, cùng con số,
 *     và số keyframe của camera khớp số section
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* ── stub browser globals ─────────────────────────────────── */
const VH = 900;
globalThis.innerWidth = 1600;
globalThis.innerHeight = VH;
globalThis.scrollY = 0;
globalThis.addEventListener = () => {};
/* 4 section đầu 1 viewport, section cuối 1.4 viewport -> giống hệt styles.css */
const HEIGHTS = [VH, VH, VH, VH, 1.4 * VH];
const DOC_H = HEIGHTS.reduce((a, b) => a + b, 0);
globalThis.document = { documentElement: { scrollHeight: DOC_H } };

const { glassFrame, seamMaterial, LAYOUT } = await import('../src/objects/slab.js');
const { createRig } = await import('../src/rig.js');
const THREE = await import('three');

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const shaderFiles = fs.readdirSync(path.join(SRC, 'objects')).filter((f) => f.endsWith('.js'));
const sources = shaderFiles.map((f) => [f, fs.readFileSync(path.join(SRC, 'objects', f), 'utf8')]);

let checks = 0;
const ok = (msg) => { checks++; console.log('  ok  ' + msg); };

/* ── 1. frame kính ───────────────────────────────────────── */
{
  const mesh = glassFrame();
  mesh.geometry.computeBoundingBox();
  const bb = mesh.geometry.boundingBox;
  const pos = mesh.geometry.attributes.position.array;
  assert.ok(pos.length > 0 && pos.length % 3 === 0, 'position array phải chia hết cho 3');
  assert.ok(pos.every(Number.isFinite), 'mọi vertex phải hữu hạn (triangulation hỏng)');
  // rộng ~3.92, cao ~2.53, dày ~0.05 (+bevel) -> xấp xỉ
  assert.ok(bb.max.x - bb.min.x > 3.8 && bb.max.x - bb.min.x < 4.0, `bề rộng frame sai: ${(bb.max.x - bb.min.x).toFixed(3)}`);
  assert.ok(bb.max.y - bb.min.y > 2.4 && bb.max.y - bb.min.y < 2.6, `chiều cao frame sai: ${(bb.max.y - bb.min.y).toFixed(3)}`);
  assert.ok(bb.max.z - bb.min.z < 0.2, 'frame phải mỏng');
  mesh.geometry.dispose();
  ok('glassFrame() dựng được hình học lỗ, kích thước đúng');
}

/* ── 2. uniform GLSL <-> uniforms object ─────────────────── */
{
  const mat = seamMaterial(null, null);
  const frag = mat.fragmentShader;
  const declared = [...frag.matchAll(/uniform\s+\w+\s+([^;]+);/g)]
    .flatMap((m) => m[1].split(',').map((s) => s.trim().split(/\s|\[/).pop()));
  const provided = Object.keys(mat.uniforms);
  const missing = declared.filter((u) => !provided.includes(u));
  const unused = provided.filter((u) => !declared.includes(u));
  assert.deepEqual(missing, [], `GLSL dùng uniform không có trong uniforms: ${missing}`);
  assert.deepEqual(unused, [], `uniforms thừa không ai dùng: ${unused}`);
  // sampler phải có default value, nếu không WebGL sẽ đọc texture 0
  assert.ok(mat.uniforms.uSrc.value === null, 'uSrc/uOut chỉ được gán lúc runtime');
  mat.dispose();
  ok('seamMaterial: khai báo uniform khớp 100%, không thừa không thiếu');
}

/* ── 3. smoothstep nghịch ────────────────────────────────── */
{
  const bad = [];
  for (const [file, src] of sources) {
    for (const m of src.matchAll(/smoothstep\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,/g)) {
      const [, a, b] = m;
      if (Number(a) > Number(b)) {
        const line = src.slice(0, m.index).split('\n').length;
        bad.push(`${file}:${line} smoothstep(${a}, ${b}, ...)`);
      }
    }
  }
  assert.deepEqual(bad, [], `smoothstep(hi, lo, x) là undefined behaviour:\n    ${bad.join('\n    ')}`);
  ok('không có smoothstep với edge0 > edge1 trong toàn bộ shader');
}

/* ── 4. scroll rig: section -> u ─────────────────────────── */
{
  const N = 5;
  const sections = [];
  let top = 0;
  for (const h of HEIGHTS) { sections.push({ offsetTop: top }); top += h; }
  const maxScroll = DOC_H - VH;

  const rig = createRig(new THREE.PerspectiveCamera(), sections);
  rig.setReducedMotion(true);          // update() gán thẳng S.u -> u là giá trị thô
  const at = (y) => { globalThis.scrollY = y; return rig.update(1 / 60); };

  assert.equal(at(0), 0, 'đầu trang phải là u = 0 (keyframe hero)');
  assert.equal(at(VH), 1 / N, 'khi section 1 chạm đỉnh viewport -> u = 0.2 (keyframe split)');
  assert.equal(at(2 * VH), 2 / N, 'section 2 -> u = 0.4 (keyframe math)');
  assert.equal(at(3 * VH), 3 / N, 'section 3 -> u = 0.6 (keyframe perf)');
  assert.equal(at(4 * VH), 4 / N, 'section 4 -> u = 0.8 (keyframe outro)');
  assert.equal(at(maxScroll), 1, 'cuối trang phải là u = 1 (keyframe cuối của curve)');

  // monotonic: u không được lùi khi cuộn xuống
  let prev = -1;
  for (let y = 0; y <= maxScroll; y += 20) {
    const u = at(y);
    assert.ok(u >= prev - 1e-9, `u không monotonic tại y=${y} (${prev} -> ${u})`);
    prev = u;
  }

  // camera không được lọt vào trong vật thể
  const cam = new THREE.PerspectiveCamera();
  const rig2 = createRig(cam, sections);
  rig2.setReducedMotion(true);
  for (let y = 0; y <= maxScroll; y += 20) {
    globalThis.scrollY = y;
    rig2.update(1 / 60);
    const p = cam.position;
    assert.ok(Number.isFinite(p.length()), `camera NaN tại y=${y}`);
    assert.ok(p.length() > 1.2, `camera lọt vào trong vật thể tại y=${y} (|p|=${p.length().toFixed(2)})`);
    assert.ok(cam.fov >= 30 && cam.fov <= 45, `fov ngoài dải thiết kế tại y=${y}: ${cam.fov.toFixed(1)}`);
  }
  ok('scroll rig: u = 0 ở đầu trang, 1 ở cuối trang, monotonic, camera an toàn');
}

/* ── 5. nội dung demo phải vừa trong canvas ───────────────── */
{
  const { CW, CH, TOP, PITCH, X, SIZE, DOC } = LAYOUT;
  const over = [];
  const rightEdge = new Map();

  DOC.forEach((ln, i) => {
    const y = TOP + i * PITCH + SIZE[ln.s];
    if (y > CH - 8) over.push(`dòng ${i + 1} (${ln.s}) tràn đáy: baseline ${y} > ${CH}`);
    // advance factor thận trọng cho từng họ font
    const wRaw = ln.raw.length * SIZE[ln.s] * 0.62;
    const wOut = ln.out.length * SIZE[ln.s] * 0.58;
    if (X + wRaw > CW - 20) over.push(`dòng ${i + 1} raw tràn phải: ${Math.round(X + wRaw)} > ${CW}`);
    if (X + wOut > CW - 20) over.push(`dòng ${i + 1} rendered tràn phải: ${Math.round(X + wOut)} > ${CW}`);
    rightEdge.set(i, Math.max(X + wRaw, X + wOut));
  });

  // mỗi dòng phải có style hợp lệ, và cả hai canvas phải cùng số dòng —
  // nếu lệch, mix ra hai ảnh chồng lệch chứ không phải một sự morph
  DOC.forEach((l, i) => {
    assert.ok(SIZE[l.s] !== undefined, `dòng ${i + 1} có style không xác định: "${l.s}"`);
    assert.equal(typeof l.raw, 'string', `dòng ${i + 1} thiếu raw`);
    assert.equal(typeof l.out, 'string', `dòng ${i + 1} thiếu out`);
  });
  assert.equal(DOC.length * PITCH + TOP < CH, true, `tổng chiều cao nội dung không vừa: ${DOC.length} dòng`);

  assert.deepEqual(over, [], `nội dung demo tràn khung:\n    ${over.join('\n    ')}`);
  const widest = Math.max(...rightEdge.values());
  ok(`nội dung demo vừa khung (dòng rộng nhất ${Math.round(widest)}px / ${CW}px)`);
}

/* ── 6. 2 trang HTML phải đồng bộ, và khớp với scroll rig ──── */
{
  const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const en = read('index.html'), vi = read('index.vi.html');

  const ids = (h) => [...h.matchAll(/id="(s-[\w-]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(ids(vi), ids(en), 'hai trang phải có cùng tập id section');
  assert.deepEqual(ids(en), ['s-hero', 's-math', 's-perf', 's-play', 's-split'],
    'id section lạ -> nav/anchor và camera rig sẽ lệch');

  const nSec = (h) => (h.match(/<section /g) || []).length;
  assert.equal(nSec(vi), nSec(en), `số section lệch: EN ${nSec(en)}, VI ${nSec(vi)}`);

  const nKeys = (read('src/rig.js').match(/^ {2}\[/gm) || []).length;
  assert.equal(nKeys, nSec(en),
    `KEYS phải có đúng 1 keyframe mỗi section = ${nSec(en)}, đang có ${nKeys}`);

  // số dung lượng phải là MỘT giá trị duy nhất, khớp giữa hero stats, meter và meta
  const first = (s) => (s.match(/~(\d+)\s*(?:<span>)?\s*MB/) || [])[1];
  for (const [f, h] of [['index.html', en], ['index.vi.html', vi]]) {
    const meter = h.slice(h.indexOf('class="meter"'));
    const claim = first(h);
    assert.equal(claim, first(meter), `${f}: hero stats và meter ghi khác dung lượng`);
    assert.equal(h.match(/name="description" content="[^"]*?(\d+)\s*MB/)[1], claim,
      `${f}: meta description ghi dung lượng khác hero stats`);
  }
  ok('EN/VI cùng 5 section, cùng id, KEYS khớp, dung lượng nhất quán');
}

console.log(`\n${checks} checks passed.`);
