import * as THREE from 'three';

/**
 * Sơ đồ Mermaid "sống": raster một flowchart thật vào canvas (chữ luôn sắc nét,
 * không cần font atlas) rồi bọc shader có sóng tín hiệu chạy dọc sơ đồ.
 * 1 draw call cho toàn bộ diagram.
 */
const CW = 1024, CH = 640;

const NODES = [
  { id: 'md',      x:  62, y:  92, w: 186, h: 56, label: 'editor.md' },
  { id: 'parser',  x: 330, y:  92, w: 176, h: 56, label: 'parser' },
  { id: 'render',  x: 610, y:  92, w: 196, h: 56, label: 'renderer' },
  { id: 'katex',   x:  62, y: 292, w: 186, h: 56, label: 'katex' },
  { id: 'mermaid', x: 330, y: 292, w: 196, h: 56, label: 'mermaid.js' },
  { id: 'canvas',  x: 610, y: 292, w: 196, h: 56, label: 'canvas' },
];
const EDGES = [
  ['md', 'parser'], ['parser', 'render'], ['parser', 'mermaid'],
  ['mermaid', 'canvas'], ['render', 'canvas'], ['katex', 'parser'],
];
/* Bảng màu riêng cho mỗi theme: nền sáng cần mực tối, nền tối cần mực sáng. */
const PALETTE = {
  dark:  { accent: '#388bfd', fill: 'rgba(56,139,253,.10)', ink: '#dfe7ef' },
  light: { accent: '#0a66c2', fill: 'rgba(10,102,194,.07)', ink: '#1f2328' },
};

function box(g, n) {
  const r = 10;
  g.beginPath();
  g.moveTo(n.x + r, n.y);
  g.arcTo(n.x + n.w, n.y, n.x + n.w, n.y + n.h, r);
  g.arcTo(n.x + n.w, n.y + n.h, n.x, n.y + n.h, r);
  g.arcTo(n.x, n.y + n.h, n.x, n.y, r);
  g.arcTo(n.x, n.y, n.x + n.w, n.y, r);
  g.closePath();
}

function raster(cv, light) {
  const P = PALETTE[light ? 'light' : 'dark'];
  cv = cv || document.createElement('canvas');
  cv.width = CW; cv.height = CH;
  const g = cv.getContext('2d');
  const at = (id) => NODES.find((n) => n.id === id);

  g.lineWidth = 2;
  g.strokeStyle = P.accent;
  g.fillStyle = P.accent;

  for (const [a, b] of EDGES) {
    const A = at(a), B = at(b);
    const x1 = A.x + A.w, y1 = A.y + A.h / 2;
    const x2 = B.x, y2 = B.y + B.h / 2;
    g.globalAlpha = 0.85;
    g.beginPath();
    if (Math.abs(y1 - y2) < 2) { g.moveTo(x1, y1); g.lineTo(x2 - 9, y1); }
    else {
      const mx = x1 + (x2 - x1) * 0.5;
      g.moveTo(x1, y1); g.lineTo(mx, y1); g.lineTo(mx, y2); g.lineTo(x2 - 9, y2);
    }
    g.stroke();
    g.beginPath();
    g.moveTo(x2, y2); g.lineTo(x2 - 11, y2 - 6); g.lineTo(x2 - 11, y2 + 6);
    g.closePath();
    g.fill();
  }

  g.globalAlpha = 1;
  for (const n of NODES) {
    box(g, n);
    g.fillStyle = P.fill;
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = P.accent;
    g.stroke();
    g.fillStyle = P.ink;
    g.font = `600 24px ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(n.label, n.x + n.w / 2, n.y + n.h / 2 + 1);
  }
  return cv;
}

export function createDiagram({ width = 3.05, height = 1.9 } = {}) {
  const cv = raster(null, false);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  let isLight = false;

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
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

      void main() {
        vec2 uv = vUv;
        vec4 t = texture2D(uMap, uv);
        if (t.a < 0.004) discard;

        float r = texture2D(uMap, uv + vec2( 0.0014, 0.0)).r;
        float b = texture2D(uMap, uv - vec2( 0.0014, 0.0)).b;
        vec3 c = vec3(r, t.g, b) * 0.9;

        c *= 0.86 + 0.14 * sin(vUv.y * 520.0 - uTime * 2.6);

        // sóng tín hiệu chạy trái -> phải, 4s/lần
        float w = exp(-pow((fract(uTime * 0.25) - vUv.x) * 7.0, 2.0));
        c += uAccent * w * 0.5 * t.a;

        gl_FragColor = vec4(c, t.a * uOpacity);
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  mesh.renderOrder = 4;

  return {
    object: mesh, material: mat,
    update(t) { mat.uniforms.uTime.value = t; },
    setOpacity(v) { mat.uniforms.uOpacity.value = v; mesh.visible = v > 0.004; },
    setTheme(c, light) {
      mat.uniforms.uAccent.value.copy(c);
      if (light === isLight) return;
      isLight = light;
      raster(cv, light);
      tex.needsUpdate = true;
    },
    dispose() { mesh.geometry.dispose(); mat.dispose(); tex.dispose(); },
  };
}
