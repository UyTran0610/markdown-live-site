import * as THREE from 'three';
import { sceneFromDisplay } from '../tone.js';

/**
 * Quầng sáng nền. Không có mặt sàn nên không có contact shadow — thay bằng
 * một lớp màu rộng phía sau để tạo chiều sâu.
 *
 * ── Nền tối: quầng xanh phát sáng (giữ nguyên) ──────────────────────────────
 * Texture trắng + alpha, nhân màu accent, Normal blending.
 *
 * ── Nền sáng: ánh sáng chứ không phải mực ───────────────────────────────────
 * Quầng xanh trên nền sáng luôn thành vết: chỗ "có quầng" là chỗ TỐI hơn nền,
 * nên mắt đọc ra là bẩn. Ở theme tối chỗ có quầng là chỗ SÁNG hơn nền. Vậy
 * theme sáng giữ đúng quan hệ đó: tâm trắng nhất, tối dần và ngả xanh trời về
 * phía rìa (như quầng sáng quanh mặt trời, không phải vệt mực).
 *
 * Mặt phẳng ở theme sáng là một dải màu ĐẶC (alpha 1) từ tâm đến rìa, rìa
 * trùng đúng màu nền. Màu được vẽ ở không gian hiển thị (sRGB) rồi đảo ngược
 * ACES (tone.js) để lên màn hình đúng như đã vẽ — vì thế texture là half-float
 * HDR (giá trị scene > 1), không phải canvas 8-bit.
 */
const PROFILE_DARK = [[0, .85], [0.42, .20], [1, 0]];

/**
 * Dải màu theo bán kính (0 = tâm, 1 = rìa plane), màu hiển thị 0xRRGGBB.
 * Điểm cuối LUÔN là màu nền (`ground`). Kênh gần trắng bị kẹp ở ~#fcfcfc trong
 * tone.js: ACES không có trắng tuyệt đối.
 */
const lightStops = (ground) => [
  [0.00, 0xfbfdff],
  [0.14, 0xf6faff],
  [0.30, 0xecf3ff],
  [0.50, 0xe4eefc],
  [0.78, ground],
  [1.00, ground],
];

function rasterDark(cv) {
  cv = cv || document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  for (const [at, a] of PROFILE_DARK) grd.addColorStop(at, `rgba(255,255,255,${a})`);
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  return cv;
}

const smooth = (t) => t * t * (3 - 2 * t);
const unpack = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const toLinear = (v) => { const u = v / 255; return u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4; };

/** Texture half-float RGBA 256², tâm -> rìa theo lightStops, đã bù ACES. */
function rasterLight(ground, expo) {
  const N = 256;
  const stops = lightStops(ground);

  // ramp 1D: nội suy ở sRGB hiển thị (đều theo cảm nhận), rồi đảo ACES từng mẫu
  const ramp = [];
  for (let i = 0; i < N; i++) {
    const r = i / (N - 1);
    let k = 0;
    while (k < stops.length - 2 && r > stops[k + 1][0]) k++;
    const [a0, c0] = stops[k], [a1, c1] = stops[k + 1];
    const t = smooth(Math.min(1, Math.max(0, (r - a0) / (a1 - a0))));
    const A = unpack(c0), B = unpack(c1);
    ramp.push(sceneFromDisplay([0, 1, 2].map((j) => toLinear(A[j] + (B[j] - A[j]) * t)), expo));
  }

  const data = new Uint16Array(N * N * 4);
  const h = THREE.DataUtils.toHalfFloat;
  const one = h(1), c = (N - 1) / 2;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const f = Math.min(1, Math.hypot(x - c, y - c) / c) * (N - 1);
      const i0 = Math.floor(f), i1 = Math.min(N - 1, i0 + 1), w = f - i0;
      const p = (y * N + x) * 4;
      for (let j = 0; j < 3; j++) data[p + j] = h(ramp[i0][j] + (ramp[i1][j] - ramp[i0][j]) * w);
      data[p + 3] = one;
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export function createGlow({ size = 16, color = 0x388bfd, opacity = 0.5, ground = 0xe4ecf8, expo = 1.18 } = {}) {
  const darkTex = new THREE.CanvasTexture(rasterDark(null));
  let lightTex = null; // dựng lười: người dùng theme tối không phải trả chi phí này
  const mat = new THREE.MeshBasicMaterial({
    map: darkTex, color, transparent: true, opacity,
    blending: THREE.NormalBlending, depthWrite: false, depthTest: false, fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  mesh.position.set(0, 0, -4);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;

  let base = opacity, isLight = false;
  return {
    object: mesh,
    pulse(t) { mat.opacity = base * (0.82 + 0.18 * Math.sin(t * 0.5)); },
    setTheme(c, o, light) {
      mat.color.copy(c);
      base = o;
      // mat.opacity cũng phải set ở đây: nhánh prefers-reduced-motion không có
      // vòng lặp nên không bao giờ gọi pulse().
      mat.opacity = o;
      if (light === isLight) return;
      isLight = light;
      if (light && !lightTex) lightTex = rasterLight(ground, expo);
      mat.map = light ? lightTex : darkTex;
      mat.needsUpdate = true;
    },
    dispose() { mesh.geometry.dispose(); mat.dispose(); darkTex.dispose(); lightTex?.dispose(); },
  };
}