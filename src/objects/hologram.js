import * as THREE from 'three';

/**
 * Tấm hologram KaTeX. Công thức được raster bằng font hệ thống (0 dependency,
 * 0 font file) rồi bọc shader: scanline + chromatic offset + fade đáy.
 */
const CW = 1024, CH = 360;

const LINES = [
  { t: 'E = mc²', s: 96 },
  { t: '∫₀^∞ e^(−x²) dx = √π ⁄ 2', s: 58 },
];

function raster() {
  const cv = document.createElement('canvas');
  cv.width = CW; cv.height = CH;
  const g = cv.getContext('2d');
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  LINES.forEach((l, i) => {
    g.font = `italic ${l.s}px "Cambria Math", "Times New Roman", Georgia, serif`;
    g.fillStyle = '#ffffff';
    g.fillText(l.t, CW / 2, CH * (i === 0 ? 0.36 : 0.75));
  });
  return cv;
}

export function createHologram({ width = 2.9, height = 1.02 } = {}) {
  const tex = new THREE.CanvasTexture(raster());
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uMap:     { value: tex },
      uTime:    { value: 0 },
      uAccent:  { value: new THREE.Color(0x388bfd) },
      uOpacity: { value: 1 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap;
      uniform float uTime, uOpacity;
      uniform vec3 uAccent;
      varying vec2 vUv;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

      void main() {
        // rung ở tần số frame -> nhấp nháy kiểu hologram
        float j = (hash(vUv * 220.0 + floor(uTime * 9.0)) - 0.5) * 0.005;
        vec2 uv = vUv + j;

        // lệch RGB 1.6px -> chromatic aberration
        float r = texture2D(uMap, uv + vec2( 0.0016, 0.0)).r;
        float g = texture2D(uMap, uv).g;
        float b = texture2D(uMap, uv - vec2( 0.0016, 0.0)).b;
        float a = texture2D(uMap, uv).a;

        vec3 c = vec3(r, g, b);
        c *= 0.80 + 0.20 * sin(vUv.y * 640.0 - uTime * 3.2);   // scanline
        c  = mix(c, uAccent, 0.18);
        c += uAccent * pow(1.0 - vUv.y, 3.0) * 0.30;           // quầng đáy

        float fade = smoothstep(0.0, 0.10, vUv.y) * (1.0 - smoothstep(0.90, 1.0, vUv.y));
        gl_FragColor = vec4(c, a * uOpacity * fade);
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  mesh.renderOrder = 4;

  return {
    object: mesh, material: mat,
    update(t) { mat.uniforms.uTime.value = t; },
    setOpacity(v) { mat.uniforms.uOpacity.value = v; mesh.visible = v > 0.004; },
    setTheme(c) { mat.uniforms.uAccent.value.copy(c); },
    dispose() { mesh.geometry.dispose(); mat.dispose(); tex.dispose(); },
  };
}
