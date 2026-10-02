import * as THREE from 'three';

/**
 * Quầng sáng nền. Không có mặt sàn nên không có contact shadow — thay bằng
 * một lớp màu rộng phía sau để tạo chiều sâu. Normal blending chứ không phải
 * additive: additive chỉ làm sáng, nên trên nền sáng (#fafafa) mọi thứ clamp
 * về trắng và biến mất hoàn toàn.
 *
 * Profile riêng cho từng theme. Plane 17 đơn vị rộng hơn khung hình ~2.2 lần,
 * nên gradient của profile tối chỉ phủ giữa màn hình. Nền sáng thì phải tắt
 * trước rìa khung: ACES bão hòa vùng sáng nên màu nhạt ở alpha thấp ra xám
 * (#cfd8e3 ở alpha .55). Trải đều tới rìa chỉ là một lớt xám nhạt phủ cả màn
 * hình — không có mép, đọc ra là vết bẩn chứ không phải quầng sáng.
 */
const PROFILE = {
  dark:  [[0, .85], [0.42, .20], [1, 0]],
  // lõi đặc, rơi mượt, tắt hẳn trước rìa -> có tâm rõ như theme tối,
  // không còn lớp xám mỏng trải tới mép khung
  light: [[0, 1], [0.12, .92], [0.26, .72], [0.4, .45], [0.55, .22], [0.7, .07], [0.85, .01], [1, 0]],
};

function raster(cv, light) {
  cv = cv || document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  for (const [at, a] of PROFILE[light ? 'light' : 'dark']) {
    grd.addColorStop(at, `rgba(255,255,255,${a})`);
  }
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  return cv;
}

export function createGlow({ size = 16, color = 0x388bfd, opacity = 0.5 } = {}) {
  const cv = raster(null, false);
  const tex = new THREE.CanvasTexture(cv);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, color, transparent: true, opacity,
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
      raster(cv, light);
      tex.needsUpdate = true;
    },
    dispose() { mesh.geometry.dispose(); mat.dispose(); tex.dispose(); },
  };
}