import * as THREE from 'three';
import { createScene } from './scene.js';
import { createRig } from './rig.js';
import { createUI } from './ui.js';
import { createHologram } from './objects/hologram.js';
import { createDiagram } from './objects/diagram.js';
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
};

/* theme lấy nguyên từ app gốc.
   light bloom = 0: UnrealBloomPass cộng thêm vào toàn bộ nền #fafafa, nên
   bất kỳ mực tối nào ta vẽ lên đó cũng bị quang hóa thành trắng lại.
   Quầng sáng dùng chung accent (--blue) cho cả hai theme. glowI là cường độ
   đỉnh của profile: không được vượt 1, alpha > 1 làm 1 - alpha âm trong
   phép trộn.
   glow có màu riêng (không dùng accent): trên nền sáng, accent 0x0a66c2 có
   kênh blue ~0.54 < nền ~0.96 nên khi trộn alpha thấp bị kéo xuống thành xám
   xanh. Màu glow sáng theme light giữ blue ≈ 1, chỉ giảm R/G -> xanh trong.
   scrimI light thấp: scrim vẽ màu nền ngay tâm, sẽ phủ trắng lên lõi quầng. */
const THEME = {
  dark:  { bg: 0x0d1117, accent: 0x388bfd, glow: 0x388bfd, fill: 0x1b2c43, amber: 0xd29922, keyI: 2.4, fillI: 1.1, rimI: 2.2, env: 0.9,  bloom: 0.55, expo: 1.00, glowI: 0.42, scrimI: 0.88 },
  light: { bg: 0xfafafa, accent: 0x0a66c2, glow: 0x3d8bff, fill: 0xc7dbff, amber: 0x9a6700, keyI: 3.1, fillI: 1.4, rimI: 1.3, env: 1.7,  bloom: 0.00, expo: 1.18, glowI: 0.70, scrimI: 0.10 },
};

const SECTIONS = [...document.querySelectorAll('.sec')];
const NO_POINTER = MOBILE || REDUCE;

/* ── UI khởi tạo TRƯỚC 3D: nội dung phải sống kể cả khi WebGL chết ── */
let gl = null;

createUI({
  onTheme: (light) => gl?.setTheme(light),
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
  const mathGroup = new THREE.Group();
  mathGroup.position.set(2.55, 0.18, 0.9);
  mathGroup.rotation.y = -0.34;
  const hologram = createHologram();
  hologram.object.position.set(0, 0.66, 0);
  const diagram = createDiagram();
  diagram.object.position.set(0, -0.66, 0);
  mathGroup.add(hologram.object, diagram.object);
  scene.add(mathGroup);

  const glow = createGlow({ size: 17, opacity: 0.42 });
  scene.add(glow.object);

  /* ── theme lerp ── */
  const cA = new THREE.Color(), cB = new THREE.Color();
  const out = { bg: new THREE.Color(), accent: new THREE.Color(), amber: new THREE.Color(), glow: new THREE.Color() };
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
    out.glow.copy(col('glow'));

    scene.background = out.bg;
    scene.fog.color.copy(out.bg);
    lights.key.color.copy(out.accent);  lights.key.intensity  = L(THEME.dark.keyI,  THEME.light.keyI,  S.t);
    lights.fill.color.copy(col('fill')); lights.fill.intensity = L(THEME.dark.fillI, THEME.light.fillI, S.t);
    lights.rim.color.copy(out.amber);   lights.rim.intensity  = L(THEME.dark.rimI,  THEME.light.rimI,  S.t);
    scene.environmentIntensity = L(THEME.dark.env, THEME.light.env, S.t);
    renderer.toneMappingExposure = L(THEME.dark.expo, THEME.light.expo, S.t);
    bloom.strength = L(THEME.dark.bloom, THEME.light.bloom, S.t);

    hologram.setTheme(out.accent, S.t > 0.5);
    diagram.setTheme(out.accent, S.t > 0.5);
    glow.setTheme(out.glow, L(THEME.dark.glowI, THEME.light.glowI, S.t), S.t > 0.5);
  }
  applyTheme(0, true);

  /* ── cổng hiển thị theo scroll ── */
  const scrim = document.querySelector('.scrim');

  function gates() {
    const u = rig.u;
    hologram.setOpacity(win(u, 0.34, 0.58, 0.06));
    diagram.setOpacity(win(u, 0.34, 0.58, 0.06));
    // chỉ hero cần lớp làm mờ để chữ đọc được trên nền 3D
    if (scrim) scrim.style.opacity = (L(THEME.dark.scrimI, THEME.light.scrimI, S.t) * (1 - win(u, 0.02, 0.24, 0.06))).toFixed(3);
  }

  /* ── vòng lặp ── */
  let t = 0, last = performance.now(), raf = 0, ema = 16, cooldown = 0;

  if (REDUCE) {
    // không vòng lặp: chỉ vẽ lại khi có gì thay đổi -> không tốn pin
    const draw = () => { gates(); composer.render(); };
    addEventListener('resize', draw);
    addEventListener('scroll', draw, { passive: true });
    draw();
    return { rig, setTheme(light) { S.goal = light ? 1 : 0; applyTheme(0, true); draw(); }, requestRender: draw };
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
    glow.pulse(t);
    hologram.update(t);
    diagram.update(t);

    gates();
    composer.render();
  }
  raf = requestAnimationFrame(frame);

  addEventListener('pagehide', () => {
    cancelAnimationFrame(raf);
    [hologram, diagram, glow].forEach((o) => o.dispose());
    envRT.dispose();
    composer.dispose();
    renderer.dispose();
  });

  return {
    rig,
    setTheme(light) { S.goal = light ? 1 : 0; },
    requestRender() {},
  };
}