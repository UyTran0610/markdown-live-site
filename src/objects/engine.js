import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * E6 — "Rust engine": hộp kim loại nhỏ + vòng quay + hạt amber bay lên.
 * Đại diện cho footprint nhỏ và tốc độ, không phải cho một con robot.
 */
function sparkTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

export function createEngine({ count = 320, range = 1.5 } = {}) {
  const group = new THREE.Group();

  const box = new THREE.Mesh(
    new RoundedBoxGeometry(0.52, 0.36, 0.36, 3, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x8a9099, metalness: 0.95, roughness: 0.33, envMapIntensity: 1.3, transparent: true })
  );
  group.add(box);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.46, 0.008, 6, 96),
    new THREE.MeshBasicMaterial({ color: 0xd29922, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) seeds[i] = Math.random();

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), range);

  const mat = new THREE.PointsMaterial({
    size: 0.055, map: sparkTexture(), color: 0xd29922,
    transparent: true, opacity: 0.9, depthWrite: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  const sparks = new THREE.Points(geo, mat);
  sparks.frustumCulled = false;
  group.add(sparks);

  const P = geo.attributes.position, S = geo.attributes.aSeed;
  const H = range * 0.5;

  return {
    object: group,
    /** toàn bộ motion nằm ở đây: CPU chỉ chạy mỗi frame khi section perf hiện ra */
    update(t) {
      box.rotation.y = t * 0.35;
      box.rotation.x = Math.sin(t * 0.24) * 0.12;
      ring.rotation.z = t * 0.9;
      ring.scale.setScalar(1 + Math.sin(t * 1.4) * 0.06);
      for (let i = 0; i < count; i++) {
        const s = S.getX(i);
        const y = ((s * range + t * (0.26 + s * 0.5)) % range) - H;
        const a = s * 62.83;
        const r = 0.11 + ((s * 7.31) % 1) * 0.17;
        P.setXYZ(i, Math.cos(a) * r, y, Math.sin(a) * r);
      }
      P.needsUpdate = true;
    },
    setOpacity(v) {
      group.visible = v > 0.004;
      box.material.opacity = v;
      mat.opacity = 0.9 * v;
      ring.material.opacity = 0.75 * v;
    },
    setTheme(accent) { mat.color.copy(accent); ring.material.color.copy(accent); },
    dispose() {
      box.geometry.dispose(); box.material.dispose();
      ring.geometry.dispose(); ring.material.dispose();
      geo.dispose(); mat.map.dispose(); mat.dispose();
    },
  };
}
