import * as THREE from 'three';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * Mỗi section DOM có đúng 1 keyframe -> KEYS.length = sections.length.
 * read() chia đều [0..1] cho N section (u = i/N), nên keyframe cuối ứng với
 * section cuối cùng, camera kịp pull-back ở đáy trang. Thêm section thì thêm
 * 1 keyframe, và .sec cuối phải cao hơn 1 viewport để có cửa sổ scroll thật.
 */
const KEYS = [
  // px    py    pz   fov  lookX lookY lookZ
  [  0.0, 0.10, 7.2, 38,   0.0,  0.0,  0.0 ],  // hero      — copy overlay giữa
  [  0.0, 0.00, 4.6, 32,   0.0, -0.2,  0.0 ],  // split     — nền trống, copy dồn lên trên
  [  0.6, 0.50, 3.8, 42,   1.5,  0.25, 1.0 ],  // math      — nhìn lệch trái => vật thể sang phải
  [ -0.6, 0.10, 3.8, 40,  -1.5,  0.00, 1.4 ],  // perf      — nhìn lệch phải, copy dồn sang trái
  [  0.0, 0.60, 8.8, 42,   0.0,  0.10, 0.0 ],  // outro     — pull back cho CTA
];

export function createRig(camera, sections) {
  const N = sections.length;
  const v3 = (i, o) => new THREE.Vector3(KEYS[i][o], KEYS[i][o + 1], KEYS[i][o + 2]);

  const posCurve = new THREE.CatmullRomCurve3(
    KEYS.map((_, i) => v3(i, 0)), false, 'catmullrom', 0.3
  );
  const lookCurve = new THREE.CatmullRomCurve3(
    KEYS.map((_, i) => v3(i, 4)), false, 'catmullrom', 0.3
  );
  const fovCurve = new THREE.CatmullRomCurve3(
    KEYS.map((_, i) => new THREE.Vector3(KEYS[i][3], 0, 0)), false, 'catmullrom', 0.3
  );

  const S = { u: 0, uSmooth: 0, section: 0 };
  const P = new THREE.Vector3(), L = new THREE.Vector3(), T = new THREE.Vector3();
  const par = { x: 0, y: 0, tx: 0, ty: 0 };
  let reduce = false;

  // Mỗi section là một cửa sổ scroll [offsetTop_i, offsetTop_i+1]; cửa sổ cuối
  // kết thúc ở maxScroll chứ không phải documentHeight — nếu không thì keyframe
  // cuối không bao giờ tới được. u = 0 đúng ở đầu trang, u = 1 đúng ở cuối trang.
  let docH = 0;
  const measure = () => { docH = document.documentElement.scrollHeight; };
  addEventListener('resize', measure);
  addEventListener('load', measure);
  measure();

  function read() {
    const max = Math.max(1, docH - innerHeight);
    const y = clamp(scrollY, 0, max);
    let i = 0;
    for (let k = 0; k < N; k++) if (y >= sections[k].offsetTop) i = k;
    const a = sections[i].offsetTop;
    const b = i + 1 < N ? sections[i + 1].offsetTop : max;
    S.section = i;
    S.u = (i + clamp((y - a) / Math.max(1, b - a), 0, 1)) / N;
  }

  return {
    get u() { return S.uSmooth; },
    get section() { return S.section; },

    setPointer(nx, ny) { par.tx = nx; par.ty = ny; },
    setReducedMotion(on) { reduce = on; },

    update(dt) {
      read();
      // damping độc lập frame-rate
      S.uSmooth += (S.u - S.uSmooth) * (1 - Math.exp(-dt * 6));
      par.x += (par.tx - par.x) * (1 - Math.exp(-dt * 4));
      par.y += (par.ty - par.y) * (1 - Math.exp(-dt * 4));
      if (reduce) { par.x = par.y = 0; S.uSmooth = S.u; }

      posCurve.getPoint(S.uSmooth, P);
      lookCurve.getPoint(S.uSmooth, L);
      fovCurve.getPoint(S.uSmooth, T);

      P.x += par.x * 0.34;
      P.y += par.y * 0.22;

      camera.position.copy(P);
      camera.lookAt(L);
      if (Math.abs(camera.fov - T.x) > 0.01) {
        camera.fov = T.x;
        camera.updateProjectionMatrix();
      }
      return S.uSmooth;
    },
  };
}
