import * as THREE from 'three';

/**
 * "Type particles" — Markdown tan thành hạt rồi hòa vào seam.
 * Không cần font file, không cần geometry pipeline: raster text vào <canvas>,
 * đọc pixel, đưa toạ độ vào BufferGeometry. ~1ms, 1 draw call.
 */
const SAMPLE = 1024;

function raster(text) {
  const cv = document.createElement('canvas');
  cv.width = SAMPLE; cv.height = Math.round(SAMPLE * 0.625);
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#000';
  g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = '#fff';
  g.font = `${SAMPLE / 26}px "Cascadia Code", Consolas, ui-monospace, monospace`;
  g.textBaseline = 'top';
  text.split('\n').forEach((l, i) => g.fillText(l, SAMPLE * 0.05, SAMPLE * 0.05 + i * (SAMPLE / 21)));
  return { data: g.getImageData(0, 0, cv.width, cv.height).data, w: cv.width, h: cv.height };
}

export function createTypeParticles(text, { width, height, budget = 9000 } = {}) {
  const { data, w, h } = raster(text);
  const p = [], seed = [];
  const stride = Math.max(1, Math.floor((w * h) / (budget * 4)));   // mẫu thưa trước
  let step = 0;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 120) continue;
    if (step++ % stride) continue;
    const k = i >> 2;
    const x = k % w, y = (k / w) | 0;
    p.push((x / w - 0.5) * width * 1.06, (0.5 - y / h) * height * 1.06, 0);
    seed.push(Math.random());
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
  geo.computeBoundingSphere();

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime:    { value: 0 },
      uColor:   { value: new THREE.Color(0x388bfd) },
      uSeam:    { value: 0.5 },
      uWidth:   { value: width },
      uOpacity: { value: 0.5 },
      uSize:    { value: 26 },
      uPR:      { value: Math.min(devicePixelRatio, 2) },
    },
    vertexShader: /* glsl */`
      attribute float aSeed;
      uniform float uTime, uSeam, uWidth, uPR, uSize;
      varying float vA;
      void main() {
        vec3 q = position;
        q.z += sin(uTime * 0.55 + aSeed * 6.2831) * 0.035;
        q.y += sin(uTime * 0.31 + aSeed * 12.566) * 0.014;
        // hạt bị hút nhẹ về seam -> "chữ đang được biên dịch"
        float pull = (uSeam - 0.5) * uWidth;
        q.x += (pull - q.x) * 0.014 * (0.25 + 0.75 * aSeed);

        vec4 mv = modelViewMatrix * vec4(q, 1.0);
        gl_PointSize = uSize * uPR * (0.55 + aSeed * 0.9) / max(0.001, -mv.z);
        gl_Position = projectionMatrix * mv;
        vA = 0.3 + aSeed * 0.7;
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uOpacity;
      varying float vA;
      void main() {
        float a = 1.0 - smoothstep(0.1, 0.5, length(gl_PointCoord - 0.5));
        gl_FragColor = vec4(uColor, a * vA * uOpacity);
      }
    `,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 3;

  return {
    object: points, material: mat, count: seed.length,
    update(t) { mat.uniforms.uTime.value = t; },
    setOpacity(v) { mat.uniforms.uOpacity.value = v; points.visible = v > 0.004; },
    setTheme(c) { mat.uniforms.uColor.value.copy(c); },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}
