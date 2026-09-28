import * as THREE from 'three';

/* ═══════════════════════════════════════════════════════════════
   THE SLAB — concept chính của landing page.

   Một tấm kính xẻ đôi. Bên trái là Markdown thô (monospace, có
   syntax highlight), bên phải là typography đã render. Shader trộn
   hai texture quanh một `uSeam` — kéo seam là ký tự morph dần từ
   source thành kết quả. Đó là toàn bộ ý tưởng, không có gì hơn.
   ═══════════════════════════════════════════════════════════════ */

const W = 3.72, H = 2.325;              // 16:10
const CW = 1536, CH = 960;               // texture: ~1:1 với slab trên màn 1080p

const MONO = '"Cascadia Code", "Cascadia Mono", Consolas, ui-monospace, monospace';
const SANS = 'ui-sans-serif, system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const MATH = '"Cambria Math", "Times New Roman", Georgia, serif';

const RAW_COLORS = { txt: '#c9d1d9', mark: '#d29922', math: '#388bfd', code: '#79c0ff', strong: '#388bfd' };

/* Nội dung demo: raw (trước khi render) và out (sau khi render).
   Hai chuỗi phải cùng số dòng và cùng x — nếu lệch, mix ra hai ảnh
   chồng lệch chứ không phải một sự morph. */
const DOC = [
  { s: 'h1',   raw: '# Markdown Live',                        out: 'Markdown Live' },
  { s: 'p',    raw: '',                                       out: '' },
  { s: 'p',    raw: 'Write **Markdown**, watch it render.',   out: 'Write Markdown, watch it render.' },
  { s: 'p',    raw: '',                                       out: '' },
  { s: 'h2',   raw: '## Math',                                out: 'Math' },
  { s: 'math', raw: '$E = mc^2$',                              out: 'E = mc²' },
  { s: 'math', raw: '$$\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}$$',
                 out: '∫₀^∞ e^(−x²) dx = √π ⁄ 2' },
  { s: 'p',    raw: '',                                       out: '' },
  { s: 'h2',   raw: '## Diagrams',                            out: 'Diagrams' },
  { s: 'p',    raw: '```mermaid',                             out: 'flowchart LR' },
  { s: 'p',    raw: '  A --> B',                              out: 'A ⟶ B ⟶ C' },
  { s: 'p',    raw: '```',                                    out: 'rendered live' },
  { s: 'p',    raw: '',                                       out: '' },
  { s: 'note', raw: '> [!NOTE]',                              out: 'Note' },
  { s: 'note', raw: '> Zero round-trips. Ever.',              out: 'Zero round-trips. Ever.' },
  { s: 'p',    raw: '',                                       out: '' },
  { s: 'p',    raw: '- **Fast**  - **Offline**  - **Tiny**',  out: 'Fast · Offline · Tiny' },
];

const SIZE = { h1: 44, h2: 33, p: 27, math: 30, note: 26 };
const TOP = 78, PITCH = 47, X = 96;

/** export cho scripts/check.mjs canh vùng an toàn của nội dung demo */
export const LAYOUT = { CW, CH, TOP, PITCH, X, SIZE, DOC };

function tex(cv) {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  return t;
}

function blank() {
  const cv = document.createElement('canvas');
  cv.width = CW; cv.height = CH;
  return cv;
}

/* mini syntax highlighter — 12 dòng, thay cho 280KB highlight.js */
function tokenize(line) {
  const out = [];
  const re = /#{1,6} |[-*+] |> |```|\$[^$]*\$|`[^`]*`|\*\*[^*]+\*\*/g;
  let last = 0, m;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push([line.slice(last, m.index), 'txt']);
    const t = m[0];
    const kind = /^[#\-*>]/.test(t) || t === '```' ? 'mark'
      : t[0] === '$' ? 'math'
      : t[0] === '`' ? 'code'
      : 'strong';
    out.push([t, kind]);
    last = m.index + t.length;
  }
  if (last < line.length) out.push([line.slice(last), 'txt']);
  return out;
}

function drawRaw() {
  const cv = blank(), g = cv.getContext('2d');
  g.textBaseline = 'alphabetic';
  DOC.forEach((ln, i) => {
    const y = TOP + i * PITCH + SIZE[ln.s];
    g.font = `${ln.s === 'h1' || ln.s === 'h2' ? 700 : 400} ${SIZE[ln.s]}px ${MONO}`;
    let x = X;
    for (const [text, kind] of tokenize(ln.raw)) {
      g.fillStyle = RAW_COLORS[kind];
      g.fillText(text, x, y);
      x += g.measureText(text).width;
    }
  });
  return cv;
}

const OUT_STYLE = {
  h1:   { size: 46, weight: 700, family: SANS, color: '#e6edf3' },
  h2:   { size: 33, weight: 650, family: SANS, color: '#388bfd' },
  p:    { size: 27, weight: 400, family: SANS, color: '#c9d1d9' },
  math: { size: 31, weight: 400, family: MATH, color: '#6cb6ff', italic: true },
  note: { size: 27, weight: 600, family: SANS, color: '#388bfd' },
};

function drawOut() {
  const cv = blank(), g = cv.getContext('2d');
  g.textBaseline = 'alphabetic';
  DOC.forEach((ln, i) => {
    const st = OUT_STYLE[ln.s];
    g.font = `${st.italic ? 'italic ' : ''}${st.weight} ${st.size}px ${st.family}`;
    g.fillStyle = st.color;
    g.fillText(ln.out, X, TOP + i * PITCH + SIZE[ln.s]);
  });
  return cv;
}

export function seamMaterial(src, out) {
  return new THREE.ShaderMaterial({
    transparent: false,      // opaque: shader tự composite lên uBg -> không có lỗi alpha
    uniforms: {
      uSrc:   { value: src },
      uOut:   { value: out },
      uSeam:  { value: 0.5 },
      uTime:  { value: 0 },
      uAccent:{ value: new THREE.Color(0x388bfd) },
      uBg:    { value: new THREE.Color(0x0d1117) },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D uSrc, uOut;
      uniform float uSeam, uTime;
      uniform vec3  uAccent, uBg;
      varying vec2 vUv;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

      void main() {
        // mép seam có nhiễu -> đọc như "đang giải mã" chứ không phải bị cắt thẳng
        float jitter = (hash(vUv * vec2(1024.0, 64.0) + floor(uTime * 14.0)) - 0.5) * 0.007;
        float s = uSeam + jitter;

        // chuyển tiếp hẹp 2.4% -> morph từng chữ, không crossfade cả khối
        float t = smoothstep(s - 0.012, s + 0.012, vUv.x);
        vec4 c = mix(texture2D(uSrc, vUv), texture2D(uOut, vUv), t);

        // canvas 2D lưu premultiplied alpha -> c.rgb + uBg*(1-a) là composite đúng
        vec3 col = c.rgb + uBg * (1.0 - c.a);

        // lõi nóng + quầng
        float d = abs(vUv.x - uSeam);
        col += uAccent * ((1.0 - smoothstep(0.0, 0.006, d)) * 1.7
                        + (1.0 - smoothstep(0.0, 0.10,  d)) * 0.28);

        // vệt quét ngang, ~18s một vòng
        col += uAccent * (1.0 - smoothstep(0.0, 0.014, abs(vUv.y - fract(uTime * 0.055)))) * 0.09;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

export function glassFrame() {
  const s = new THREE.Shape(), r = 0.15, fw = W + 0.2, fh = H + 0.2;
  const rr = (path, w, h, rad) => {
    const x = -w / 2, y = -h / 2;
    path.moveTo(x + rad, y);
    path.lineTo(x + w - rad, y);  path.quadraticCurveTo(x + w, y, x + w, y + rad);
    path.lineTo(x + w, y + h - rad); path.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    path.lineTo(x + rad, y + h);  path.quadraticCurveTo(x, y + h, x, y + h - rad);
    path.lineTo(x, y + rad);      path.quadraticCurveTo(x, y, x + rad, y);
  };
  rr(s, fw, fh, r);

  const hole = new THREE.Path();
  rr(hole, W, H, r * 0.7);
  s.holes.push(hole);

  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.05, bevelEnabled: true, bevelThickness: 0.022, bevelSize: 0.022, bevelSegments: 2, curveSegments: 8,
  });
  geo.translate(0, 0, -0.05);

  // kim loại phản chiếu + IBL => cạnh sáng, mặt gần như vô hình.
  // Đây là fresnel "miễn phí" từ environment map, không cần custom shader.
  return new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({
    color: 0x9fb4c8,
    metalness: 0.94,
    roughness: 0.14,
    envMapIntensity: 1.7,
    transparent: true,
    opacity: 0.30,
    side: THREE.DoubleSide,
    depthWrite: false,
  }));
}

export function createSlab() {
  const group = new THREE.Group();

  const mat = seamMaterial(tex(drawRaw()), tex(drawOut()));
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
  pane.renderOrder = 1;
  group.add(pane);

  const frame = glassFrame();
  frame.renderOrder = 2;
  group.add(frame);

  const scratch = new THREE.Vector3();

  return {
    group, material: mat, pane, frame,

    /** toạ độ world của seam, để DOM handle bám theo (truyền `out` để không alias) */
    seamWorldX(v, out = scratch) {
      return out.set((v - 0.5) * W, 0, 0.02).applyMatrix4(pane.matrixWorld);
    },

    update(t, dt) {
      mat.uniforms.uTime.value = t;
      group.rotation.y = -0.15 + Math.sin(t * 0.24) * 0.03;
      group.rotation.x = 0.055 + Math.cos(t * 0.19) * 0.015;
      group.position.y = Math.sin(t * 0.42) * 0.045;
    },

    setTheme(bg, accent) {
      mat.uniforms.uBg.value.copy(bg);
      mat.uniforms.uAccent.value.copy(accent);
    },

    dispose() {
      pane.geometry.dispose(); mat.dispose();
      frame.geometry.dispose(); frame.material.dispose();
      mat.uniforms.uSrc.value.dispose(); mat.uniforms.uOut.value.dispose();
    },
  };
}
