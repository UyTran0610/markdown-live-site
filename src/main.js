import * as THREE from 'three';
import { createScene } from './scene.js';
import { createRig } from './rig.js';
import { createUI } from './ui.js';
import { createSlab } from './objects/slab.js';
import { createTypeParticles } from './objects/textPoints.js';
import { createHologram } from './objects/hologram.js';
import { createDiagram } from './objects/diagram.js';
import { createEngine } from './objects/engine.js';
import { createGlow } from './objects/glow.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ss = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
/** cửa sổ trượt trong không gian scroll: 0 ngoài [a,b], 1 ở giữa */
const win = (u, a, b, e = 0.05) => ss(a, a + e, u) * (1 - ss(b - e, b, u));

const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOBILE = matchMedia('(max-width: 860px)').matches;
const LOWRAM = (navigator.deviceMemory ?? 8) <= 4;

const quality = {
  dpr: MOBILE || LOWRAM ? 1 : Math.min(devicePixelRatio, 2),
  msaa: !MOBILE && !LOWRAM,
  bloom: !MOBILE && !LOWRAM,
  particles: MOBILE || LOWRAM ? 2600 : 9000,
};

/* theme lấy nguyên từ app gốc */
const THEME = {
  dark:  { bg: 0x0d1117, accent: 0x388bfd, fill: 0x1b2c43, amber: 0xd29922, keyI: 2.4, fillI: 1.1, rimI: 2.2, env: 0.9,  bloom: 0.55, expo: 1.00 },
  light: { bg: 0xfafafa, accent: 0x0a66c2, fill: 0xc7dbff, amber: 0x9a6700, keyI: 3.1, fillI: 1.4, rimI: 1.3, env: 1.7,  bloom: 0.18, expo: 1.18 },
};

const SECTIONS = [...document.querySelectorAll('.sec')];
const NO_POINTER = MOBILE || REDUCE;

/* ── UI khởi tạo TRƯỚC 3D: nội dung phải sống kể cả khi WebGL chết ── */
let gl = null;

const ui = createUI({
  onTheme: (light) => gl?.setTheme(light),
  onSeam: (v) => { if (gl) gl.slab.material.uniforms.uSeam.value = v; },
  onPointer: NO_POINTER ? undefined : (nx, ny) => gl?.rig.setPointer(nx, -ny),
});

try {
  gl = init3D();
} catch (err) {
  document.body.classList.add('no-gl');
  console.warn('[markdown-live] WebGL unavailable — static layout only:', err);
}

function init3D() {
  const { renderer, scene, camera, composer, bloom, lights, resize, envRT } =
    createScene(document.getElementById('gl'), quality);

  const rig = createRig(camera, SECTIONS);
  rig.setReducedMotion(REDUCE);

  /* ── dàn vật thể ── */
  const slab = createSlab();
  scene.add(slab.group);

  const particles = createTypeParticles(
    ['# Markdown Live', '## Math', '$E = mc^2$', '## Diagrams', '> [!NOTE]', '- **Fast**  - **Offline**'],
    { width: 3.72, height: 2.325, budget: quality.particles }
  );
  particles.object.position.z = 0.06;
  slab.group.add(particles.object);

  const mathGroup = new THREE.Group();
  mathGroup.position.set(2.55, 0.18, 0.9);
  mathGroup.rotation.y = -0.34;
  const hologram = createHologram();
  hologram.object.position.set(0, 0.66, 0);
  const diagram = createDiagram();
  diagram.object.position.set(0, -0.66, 0);
  mathGroup.add(hologram.object, diagram.object);
  scene.add(mathGroup);

  const engine = createEngine({ count: quality.particles > 4000 ? 320 : 140 });
  engine.object.position.set(-2.7, 0, 1.35);
  engine.object.rotation.y = 0.42;
  scene.add(engine.object);

  const glow = createGlow({ size: 17, opacity: 0.42 });
  scene.add(glow.object);

  /* ── theme lerp ── */
  const cA = new THREE.Color(), cB = new THREE.Color();
  const out = { bg: new THREE.Color(), accent: new THREE.Color(), amber: new THREE.Color() };
  const L = THREE.MathUtils.lerp;
  const startLight = document.documentElement.dataset.theme === 'light' ? 1 : 0;
  const S = { t: startLight, goal: startLight };

  function applyTheme(dt, force = false) {
    if (!force) {
      if (Math.abs(S.t - S.goal) < 1e-3) return;
      S.t += (S.goal - S.t) * (1 - Math.exp(-dt * 5));
    } else {
      S.t = S.goal;
    }
    const col = (k) => { cA.set(THEME.dark[k]); cB.set(THEME.light[k]); return cA.lerp(cB, S.t); };

    out.bg.copy(col('bg'));
    out.accent.copy(col('accent'));
    out.amber.copy(col('amber'));

    scene.background = out.bg;
    scene.fog.color.copy(out.bg);
    lights.key.color.copy(out.accent);  lights.key.intensity  = L(THEME.dark.keyI,  THEME.light.keyI,  S.t);
    lights.fill.color.copy(col('fill')); lights.fill.intensity = L(THEME.dark.fillI, THEME.light.fillI, S.t);
    lights.rim.color.copy(out.amber);   lights.rim.intensity  = L(THEME.dark.rimI,  THEME.light.rimI,  S.t);
    scene.environmentIntensity = L(THEME.dark.env, THEME.light.env, S.t);
    renderer.toneMappingExposure = L(THEME.dark.expo, THEME.light.expo, S.t);
    bloom.strength = L(THEME.dark.bloom, THEME.light.bloom, S.t);

    slab.setTheme(out.bg, out.accent);
    slab.frame.material.envMapIntensity = L(1.2, 1.9, S.t);
    particles.setTheme(out.accent);
    hologram.setTheme(out.accent);
    diagram.setTheme(out.accent);
    engine.setTheme(out.amber);
    glow.setTheme(out.accent);
  }
  applyTheme(0, true);

  /* ── seam -> DOM handle ── */
  const pSeam = new THREE.Vector3(), pA = new THREE.Vector3(), pB = new THREE.Vector3();

  function placeHandle() {
    // ma trận thế giới phải mới, nếu không sẽ bám lệch 1 frame
    slab.group.updateWorldMatrix(true, true);
    camera.updateMatrixWorld();

    const u = rig.u;
    slab.seamWorldX(ui.seam, pSeam).project(camera);
    const x = (pSeam.x * 0.5 + 0.5) * innerWidth;
    const y = (-pSeam.y * 0.5 + 0.5) * innerHeight;

    slab.seamWorldX(0.1, pA).project(camera);
    slab.seamWorldX(0.9, pB).project(camera);
    const perUnit = Math.abs(pB.x - pA.x) * 0.5 * innerWidth / 0.8;

    ui.placeHandle(x, y, perUnit, !NO_POINTER && u > 0.12 && u < 0.36 && innerWidth > 860);
  }

  /* ── cổng hiển thị theo scroll ── */
  const scrim = document.querySelector('.scrim');

  function gates() {
    const u = rig.u;
    particles.setOpacity(win(u, -0.25, 0.46, 0.14) * (MOBILE ? 0.55 : 1) * 0.5);
    hologram.setOpacity(win(u, 0.34, 0.58, 0.06));
    diagram.setOpacity(win(u, 0.34, 0.58, 0.06));
    engine.setOpacity(win(u, 0.56, 0.82, 0.06));
    // chỉ hero cần lớp làm mờ để chữ đọc được trên nền 3D
    if (scrim) scrim.style.opacity = (0.88 * (1 - win(u, 0.02, 0.24, 0.06))).toFixed(3);
    return u;
  }

  /* ── vòng lặp ── */
  let t = 0, last = performance.now(), raf = 0, ema = 16, cooldown = 0;

  if (REDUCE) {
    // không vòng lặp: chỉ vẽ lại khi có gì thay đổi -> không tốn pin
    const draw = () => { gates(); placeHandle(); composer.render(); };
    addEventListener('resize', draw);
    addEventListener('scroll', draw, { passive: true });
    draw();
    return { rig, slab, setTheme(light) { S.goal = light ? 1 : 0; applyTheme(0, true); draw(); }, requestRender: draw };
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const raw = (now - last) / 1000;
    last = now;
    if (document.hidden) return;

    const dt = Math.min(raw, 0.05);
    ema += (raw * 1000 - ema) * 0.1;

    // adaptive quality: rẻ hơn mọi kỹ thuật tối ưu khác, và là thứ người dùng nhận ra
    if (now > cooldown) {
      if (ema > 21 && quality.dpr > 1) {
        quality.dpr = Math.max(1, quality.dpr - 0.25);
        renderer.setPixelRatio(quality.dpr);
        composer.setPixelRatio(quality.dpr);
        resize();
        cooldown = now + 2500;
      } else if (ema > 30 && bloom.enabled) {
        bloom.enabled = false;
        cooldown = now + 5000;
      }
    }

    t += dt;
    rig.update(dt);
    applyTheme(dt);
    slab.update(t, dt);
    glow.pulse(t);
    particles.update(t);
    hologram.update(t);
    diagram.update(t);
    if (rig.u > 0.55 && rig.u < 0.83) engine.update(t);

    gates();
    placeHandle();
    composer.render();
  }
  raf = requestAnimationFrame(frame);

  addEventListener('pagehide', () => {
    cancelAnimationFrame(raf);
    [slab, particles, hologram, diagram, engine, glow].forEach((o) => o.dispose());
    envRT.dispose();
    composer.dispose();
    renderer.dispose();
  });

  return {
    rig, slab,
    setTheme(light) { S.goal = light ? 1 : 0; },
    requestRender() {},
  };
}
