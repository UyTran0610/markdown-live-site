/**
 * Bù tone mapping ACES cho nền sáng.
 *
 * Vấn đề: OutputPass chạy ACESFilmic lên TOÀN BỘ khung hình, gồm cả nền. Nền
 * #fafafa qua ACES (exposure 1.18) ra #e6e6e6 — xám đục, lệch hẳn với nền CSS
 * (nên thanh nav trắng nhìn như dải dán lên canvas), và mọi màu pha trên đó
 * đều bị xám theo. Nền tối không lộ vì ACES chỉ kéo đen xuống tối hơn một chút.
 *
 * Cách giải: không đổi tone mapping (vật thể 3D đã được chỉnh theo ACES), mà
 * đảo ngược nó cho đúng những pixel là "giấy": hỏi "scene phải chứa giá trị
 * tuyến tính nào để sau ACES + sRGB ra đúng màu này?". Giá trị đó thường > 1
 * (HDR) — hợp lệ vì composer render vào target half-float.
 *
 * Công thức là bản sao của ACESFilmicToneMapping trong three.js; đổi
 * toneMapping thì file này phải đổi theo.
 */

const IN  = [[0.59719, 0.35458, 0.04823], [0.07600, 0.90834, 0.01566], [0.02840, 0.13383, 0.83777]];
const OUT = [[1.60475, -0.53108, -0.07367], [-0.10208, 1.10813, -0.00605], [-0.00327, -0.07276, 1.07602]];

const mul = (m, v) => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
];
const fit = (v) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);

/** scene tuyến tính -> màu tuyến tính sau ACES (chưa clamp, để Newton có đạo hàm) */
const aces = (c, expo) => {
  const k = expo / 0.6;
  return mul(OUT, mul(IN, [c[0] * k, c[1] * k, c[2] * k]).map(fit));
};

const toLinear = (u) => (u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4);

/** 0xRRGGBB (sRGB hiển thị) -> [r,g,b] tuyến tính */
export const hexToLinear = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => toLinear(v / 255));

const det3 = (m) =>
  m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
  m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
  m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

function solve3(m, b) {
  const d = det3(m);
  if (Math.abs(d) < 1e-12) return null;
  return [0, 1, 2].map((i) => {
    const mi = m.map((row, r) => row.map((v, c) => (c === i ? b[r] : v)));
    return det3(mi) / d;
  });
}

/**
 * Màu hiển thị (tuyến tính, mỗi kênh < 1) -> giá trị scene tuyến tính.
 * ACES tiệm cận ~1 nên kênh gần trắng đòi giá trị scene rất lớn: kẹp ở 0.985
 * (~#fcfcfc) — trắng tuyệt đối không tồn tại sau ACES, và cũng không cần.
 */
export function sceneFromDisplay(target, expo) {
  const t = target.map((v) => Math.min(v, 0.985));
  // khởi điểm: nghiệm trung tính bằng chia đôi
  const lum = (t[0] + t[1] + t[2]) / 3;
  let lo = 0, hi = 400;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    (aces([mid, mid, mid], expo)[1] < lum ? (lo = mid) : (hi = mid));
  }
  let x = [(lo + hi) / 2, (lo + hi) / 2, (lo + hi) / 2];

  for (let it = 0; it < 40; it++) {
    const f = aces(x, expo);
    const err = [f[0] - t[0], f[1] - t[1], f[2] - t[2]];
    if (Math.abs(err[0]) + Math.abs(err[1]) + Math.abs(err[2]) < 1e-7) break;
    const J = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let j = 0; j < 3; j++) {
      const h = Math.max(1e-5, x[j] * 1e-4);
      const xp = x.slice(); xp[j] += h;
      const fp = aces(xp, expo);
      for (let i = 0; i < 3; i++) J[i][j] = (fp[i] - f[i]) / h;
    }
    const dx = solve3(J, err);
    if (!dx) break;
    x = x.map((v, i) => Math.min(400, Math.max(1e-4, v - dx[i])));
  }
  return x;
}