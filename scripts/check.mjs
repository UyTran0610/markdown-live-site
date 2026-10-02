/**
 * Self-check. Chạy bằng: npm test
 *
 * Kiểm tra đúng 3 thứ dễ vỡ nhất và vỡ âm thầm:
 *  1. smoothstep(hi, lo, x) — undefined behaviour theo GLSL spec
 *  2. Ánh xạ section -> u của scroll rig (off-by-one ở section cuối)
 *  3. Hai trang HTML (EN/VI) đồng bộ: cùng section, cùng id, cùng con số,
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
/* 4 section đầu 0.9 viewport, section cuối 1.26 viewport -> giống hệt styles.css */
const HEIGHTS = [0.9 * VH, 0.9 * VH, 0.9 * VH, 0.9 * VH, 1.26 * VH];
const DOC_H = HEIGHTS.reduce((a, b) => a + b, 0);
globalThis.document = { documentElement: { scrollHeight: DOC_H } };

const { createRig } = await import('../src/rig.js');
const THREE = await import('three');

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const shaderFiles = fs.readdirSync(path.join(SRC, 'objects')).filter((f) => f.endsWith('.js'));
const sources = shaderFiles.map((f) => [f, fs.readFileSync(path.join(SRC, 'objects', f), 'utf8')]);

let checks = 0;
const ok = (msg) => { checks++; console.log('  ok  ' + msg); };

/* ── 1. smoothstep nghịch ─────────────────────────────────── */
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

/* ── 2. scroll rig: section -> u ─────────────────────────── */
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
  assert.equal(at(0.9 * VH), 1 / N, 'khi section 1 chạm đỉnh viewport -> u = 0.2 (keyframe split)');
  assert.equal(at(1.8 * VH), 2 / N, 'section 2 -> u = 0.4 (keyframe math)');
  assert.equal(at(2.7 * VH), 3 / N, 'section 3 -> u = 0.6 (keyframe perf)');
  assert.equal(at(3.6 * VH), 4 / N, 'section 4 -> u = 0.8 (keyframe outro)');
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

/* ── 3. 2 trang HTML phải đồng bộ, và khớp với scroll rig ──── */
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

    // tên app trong mock 2 cửa sổ (phần 03) phải trùng label .meter
    const win = h.match(/class="ttl".*?<span>([^<]+)<\/span>/);
    assert.ok(win, `${f}: không tìm thấy mock 2 cửa sổ (.ttl) trong s-perf`);
    assert.ok(meter.includes(win[1]),
      `${f}: tên app trong mock phần 03 khác label .meter (${win[1]})`);
  }
  ok('EN/VI cùng 5 section, cùng id, KEYS khớp, dung lượng nhất quán');
}

/* "§4: lớp trang trí nền không được dùng additive.
   Additive chỉ làm sáng -> trên nền sáng (#fafafa) công thức + biểu đồ + quầng
   sáng đều clamp về trắng và biến mất. Đây chính là lỗi đã gặp. */
{
  const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

  for (const f of ['src/objects/glow.js', 'src/objects/hologram.js', 'src/objects/diagram.js']) {
    assert.ok(!/AdditiveBlending/.test(read(f)),
      `${f}: dùng AdditiveBlending -> lớp này vô hình trên nền sáng`);
  }

  // mực của công thức / biểu đồ phải đổi theo theme, nếu không sẽ trùng nền
  assert.ok(/light \? '#1f2328' : '#ffffff'/.test(read('src/objects/hologram.js')),
    'hologram.js: mực công thức phải tối lại ở nền sáng');
  assert.ok(/ink: '#1f2328'/.test(read('src/objects/diagram.js')),
    'diagram.js: mực nhãn node phải tối lại ở nền sáng');

  // plane glow rộng hơn khung hình ~2.2 lần (bán kính khung ~0.45 theo chiều cao).
  // Theme tối: texture trắng + alpha nhân màu accent. Theme sáng KHÔNG dùng
  // profile alpha nữa — plane là dải màu ĐẶC, rìa trùng đúng màu nền (glow.js).
  // Nên thay vì "tắt alpha trước rìa khung", điều phải giữ là mọi stop sáng hơn
  // nền: ACES bão hòa vùng sáng, quầng tối hơn nền thì mắt đọc ra là vết bẩn.
  const glowSrc = read('src/objects/glow.js');
  const darkLine = glowSrc.split('\n').find((l) => l.includes('const PROFILE_DARK'));
  const dark = [...darkLine.matchAll(/\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]/g)].map((s) => Number(s[2]));
  assert.deepEqual(dark, [0.85, 0.2, 0], 'profile glow nền tối phải giữ nguyên so với bản gốc');

  const ramp = glowSrc.slice(glowSrc.indexOf('const lightStops'));
  const light = [...ramp.slice(0, ramp.indexOf('];'))
    .matchAll(/\[\s*([\d.]+)\s*,\s*(0x[0-9a-f]+|ground)\s*\]/g)].map(([, at, c]) => [Number(at), c]);
  const ground = Number(/ground = (0x[0-9a-f]+)/.exec(glowSrc)[1]);
  // luminance ở không gian hiển thị sRGB, không phải linear
  const lum = (hex) => [16, 8, 0].map((s) => (hex >> s) & 255)
    .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  assert.ok(light.length > 3, 'dải màu nền sáng phải có nhiều stop, không phải một mảng phẳng');
  assert.equal(light.at(-1)[1], 'ground',
    'rìa plane nền sáng phải trùng màu nền, nếu không sẽ có seam xám ở mép khung');
  for (const [, c] of light) {
    if (c === 'ground') continue;
    assert.ok(lum(Number(c)) > lum(ground),
      `stop ${c} tối hơn nền #${ground.toString(16)} -> quầng thành vết mực, không phải ánh sáng`);
  }

  // col('X') gõ sai key -> Color.set(undefined) ra đen -> glow biến mất im lặng
  const mainSrc = read('src/main.js');
  for (const [, k] of mainSrc.matchAll(/col\('(\w+)'\)/g)) {
    assert.ok(new RegExp(`\\b${k}: 0x`).test(mainSrc),
      `THEME không có key "${k}" mà main.js vẫn gọi col('${k}')`);
  }

  // plane sáng là dải đặc: màu nằm hẳn trong texture, glowI chỉ còn là alpha
  const glowI = Number(/glowI:\s*([\d.]+)/.exec(
    mainSrc.split('\n').find((l) => /^\s*light: \{/.test(l)))[1]);
  assert.ok(glowI <= 1,
    `THEME.light.glowI = ${glowI} > 1 -> alpha vượt 1 là vô nghĩa và phủ xám nền sáng`);

  ok('glow/hologram/diagram dùng normal blending, mực đổi theo theme, dải glow nền sáng sáng hơn nền và rìa trùng nền');
}

console.log(`\n${checks} checks passed.`);
