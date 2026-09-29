import * as THREE from 'three';

/**
 * Quầng sáng nền. Không có mặt sàn nên không có contact shadow — thay bằng
 * một lớp màu rộng phía sau để tạo chiều sâu. Normal blending chứ không phải
 * additive: additive chỉ làm sáng, nên trên nền sáng (#fafafa) mọi thứ clamp
 * về trắng và biến mất hoàn toàn.
 *
 * Profile riêng cho từng theme. Plane 17 đơn vị rộng hơn khung hình ~2.2 lần,
 * nên gradient của profile tối chỉ phủ giữa màn hình. Nền sáng cần profile
 * trải alpha ra tận rìa, không thì cả lớp màu co lại thành một vệt nhỏ.
 */
const PROFILE = {
  dark:  [[0, .85], [0.42, .20], [1, 0]],
  light: [[0, .85], [0.25, .78], [0.45, .55], [0.70, .25], [0.90, .08], [1, 0]],
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
