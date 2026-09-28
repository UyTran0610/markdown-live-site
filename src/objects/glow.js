import * as THREE from 'three';

/**
 * Quầng sáng nền. Không có mặt sàn nên không có contact shadow — thay bằng
 * một lớp additive rộng phía sau để tạo chiều sâu và cho bloom việc để ăn.
 */
function radial(inner = 'rgba(255,255,255,.85)') {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.42, 'rgba(255,255,255,.20)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(cv);
}

export function createGlow({ size = 16, color = 0x388bfd, opacity = 0.5 } = {}) {
  const tex = radial();
  const mat = new THREE.MeshBasicMaterial({
    map: tex, color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  mesh.position.set(0, 0, -4);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;

  return {
    object: mesh,
    pulse(t) { mat.opacity = opacity * (0.82 + 0.18 * Math.sin(t * 0.5)); },
    setTheme(c) { mat.color.copy(c); },
    dispose() { mesh.geometry.dispose(); mat.dispose(); tex.dispose(); },
  };
}
