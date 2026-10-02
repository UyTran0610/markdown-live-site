import * as THREE from 'three';

/**
 * Sơ đồ Mermaid "sống": raster một flowchart thật vào canvas (chữ luôn sắc nét,
 * không cần font atlas) rồi bọc shader có sóng tín hiệu chạy dọc sơ đồ.
 * 1 draw call cho toàn bộ diagram.
 */
const CW = 1024, CH = 640;

/* Luồng thật của app: editor -> parser -> preview.
   KaTeX là extension của parser (công thức -> HTML);
   Mermaid chạy sau khi HTML vào preview (khối ```mermaid -> SVG).
   Mỗi cột có CÙNG tâm x (editor = 155, parser/katex = 428, preview/mermaid = 708)
   để mũi tên dọc đi thẳng từ đáy ô này lên đỉnh ô kia. */
const NODES = [
  { id: 'editor',  x:  62, y:  92, w: 186, h: 56, label: 'editor' },
  { id: 'parser',  x: 340, y:  92, w: 176, h: 56, label: 'parser' },
  { id: 'preview', x: 610, y:  92, w: 196, h: 56, label: 'preview' },
  { id: 'katex',   x: 335, y: 292, w: 186, h: 56, label: 'katex' },
  { id: 'mermaid', x: 610, y: 292, w: 196, h: 56, label: 'mermaid.js' },
];
const EDGES = [
  ['editor', 'parser'], ['parser', 'preview'],
  ['katex', 'parser'], ['mermaid', 'preview'],
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

/**
 * Định tuyến trực giao theo cổng (port):
 *  - cùng cột  -> đáy ô trên  -> đỉnh ô dưới (thẳng đứng)
 *  - khác cột  -> cạnh phải   -> cạnh trái   (ngang, gấp khúc ở giữa nếu lệch hàng)
 * Trả về đường gấp khúc + hướng mũi tên (dx, dy) để vẽ đầu mũi tên.
 */
function route(A, B) {
  const ax = A.x + A.w / 2, bx = B.x + B.w / 2;
  if (Math.abs(ax - bx) < 2) {
    const down = B.y > A.y;
    const y1 = down ? A.y + A.h : A.y;
    const y2 = down ? B.y : B.y + B.h;
    return { pts: [[ax, y1], [ax, y2]], dx: 0, dy: down ? 1 : -1 };
  }
  const x1 = A.x + A.w, y1 = A.y + A.h / 2;
  const x2 = B.x,       y2 = B.y + B.h / 2;
  if (Math.abs(y1 - y2) < 2) return { pts: [[x1, y1], [x2, y2]], dx: 1, dy: 0 };
  const mx = x1 + (x2 - x1) / 2;
  return { pts: [[x1, y1], [mx, y1], [mx, y2], [x2, y2]], dx: 1, dy: 0 };
}

function raster(cv, light) {
  const P = PALETTE[light ? 'light' : 'dark'];
  cv = cv || document.createElement('canvas');
  cv.width = CW; cv.height = CH;
  const g = cv.getContext('2d');
  const at = (id) => NODES.find((n) => n.id === id);

  g.lineWidth = 3;           // dày hơn 2px: nét mảnh bị mipmap làm mờ + shader tách kênh màu
  g.lineJoin = 'round';
  g.strokeStyle = P.accent;
  g.fillStyle = P.accent;
  g.globalAlpha = 1;

  const heads = new Set();   // hai mũi tên cùng đích chỉ vẽ MỘT đầu mũi tên (nhập luồng)
  const AH = 12, AW = 6;     // chiều dài / nửa bề rộng đầu mũi tên

  for (const [a, b] of EDGES) {
    const { pts, dx, dy } = route(at(a), at(b));
    const [tx, ty] = pts[pts.length - 1];

    // thân mũi tên dừng ở gốc đầu mũi tên để không "nhọn đè" lên tam giác
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.lineTo(tx - dx * AH * 0.6, ty - dy * AH * 0.6);
    g.stroke();

    const key = `${tx},${ty}`;
    if (heads.has(key)) continue;
    heads.add(key);
    const bx = tx - dx * AH, by = ty - dy * AH;   // gốc tam giác
    const px = -dy, py = dx;                      // vector vuông góc
    g.beginPath();
    g.moveTo(tx, ty);
    g.lineTo(bx + px * AW, by + py * AW);
    g.lineTo(bx - px * AW, by - py * AW);
    g.closePath();
    g.fill();
  }

  for (const n of NODES) {
    box(g, n);
    // nền ô phủ KÍN bằng màu nền trước, rồi mới tô fill trong suốt:
    // đường nối nào lỡ chạm vào ô cũng không thể xuyên qua chữ.
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = '#000';
    g.fill();
    g.restore();
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

        // tách kênh màu: giữ < 1 texel, nếu lớn hơn nét 2-3px sẽ rã thành đường xanh lá mảnh
        float r = texture2D(uMap, uv + vec2( 0.0005, 0.0)).r;
        float b = texture2D(uMap, uv - vec2( 0.0005, 0.0)).b;
        vec3 c = vec3(r, t.g, b) * 0.9;

        c *= 0.88 + 0.12 * sin(vUv.y * 520.0 - uTime * 2.6);

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