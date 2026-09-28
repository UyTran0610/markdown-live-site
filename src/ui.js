const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const MIN = 0.08, MAX = 0.92;

/**
 * Toàn bộ tương tác 2D↔3D. Không thư viện.
 * - theme toggle đẩy giá trị ra ngoài qua callback (main.js lo lerp 3D)
 * - handle kéo được: vị trí do 3D chiếu ra, nên bám đúng slab ở mọi góc camera
 * - reveal bằng IntersectionObserver
 */
export function createUI({ onTheme, onSeam, onPointer }) {
  const root = document.documentElement;
  const handle = document.getElementById('seam-handle');

  /* ── theme ─────────────────────────────────────────────── */
  const btnTheme = document.getElementById('theme');
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  let light = root.dataset.theme === 'light';

  btnTheme.addEventListener('click', () => { light = !light; applyTheme(); });
  applyTheme();

  /* ── reveal ────────────────────────────────────────────── */
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('on')),
    { rootMargin: '0px 0px -18% 0px', threshold: 0.05 }
  );
  document.querySelectorAll('.reveal').forEach((el, i) => {
    el.style.transitionDelay = `${Math.min(i % 4, 3) * 70}ms`;
    io.observe(el);
  });

  /* ── nav ───────────────────────────────────────────────── */
  const nav = document.querySelector('.nav');
  const onScroll = () => nav.classList.toggle('solid', scrollY > 40);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ── nút: sheen theo con trỏ, CSS-only ─────────────────── */
  document.querySelectorAll('.btn').forEach((b) => {
    b.addEventListener('pointermove', (e) => {
      const r = b.getBoundingClientRect();
      b.style.setProperty('--mx', `${e.clientX - r.left}px`);
      b.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  });

  /* ── con trỏ -> parallax ──────────────────────────────── */
  addEventListener('pointermove', (e) => {
    if (handle.classList.contains('grabbing')) return;
    onPointer?.((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
  }, { passive: true });

  /* ── seam handle ───────────────────────────────────────── */
  let seam = 0.5, span = 400, active = false;
  let startX = 0, startSeam = 0.5, startSpan = 400;

  // ui.js chạy chung cho cả 2 bản EN/VI, nên aria-valuetext phải theo lang của trang
  const VAL = document.documentElement.lang.startsWith('vi')
    ? (p) => `${p} phần trăm bản xem trước`
    : (p) => `${p} percent preview`;

  const set = (v, silent) => {
    seam = clamp(v, MIN, MAX);
    const pct = Math.round(seam * 100);
    handle.setAttribute('aria-valuenow', pct);
    handle.setAttribute('aria-valuetext', VAL(pct));
    if (!silent) onSeam?.(seam);
  };

  function applyTheme() {
    root.dataset.theme = light ? 'light' : 'dark';
    try { localStorage.setItem('ml-theme', light ? 'light' : 'dark'); } catch { /* storage bị chặn */ }
    // thanh trình duyệt trên mobile: đọc token --bg để không lặp mã màu ở JS
    metaTheme.content = getComputedStyle(root).getPropertyValue('--bg').trim();
    onTheme?.(light);
  }

  handle.addEventListener('pointerdown', (e) => {
    active = true;
    startX = e.clientX;
    startSeam = seam;
    startSpan = span;              // span đổi theo camera -> chụp lại lúc bắt đầu kéo
    handle.classList.add('grabbing');
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  handle.addEventListener('pointermove', (e) => {
    if (!active) return;
    set(startSeam + (e.clientX - startX) / startSpan);
  });
  const end = (e) => {
    if (!active) return;
    active = false;
    handle.classList.remove('grabbing');
    try { handle.releasePointerCapture(e.pointerId); } catch { /* pointer đã nhả */ }
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);

  handle.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 0.10 : 0.03;
    const map = { ArrowLeft: -step, ArrowRight: step, PageDown: -step * 3, PageUp: step * 3 };
    if (e.key in map) { set(seam + map[e.key]); e.preventDefault(); return; }
    if (e.key === 'Home') { set(MIN); e.preventDefault(); return; }
    if (e.key === 'End')  { set(MAX); e.preventDefault(); }
  });

  set(0.5, true);

  return {
    get seam() { return seam; },

    /** main.js gọi mỗi frame sau khi chiếu seam lên màn hình */
    placeHandle(x, y, pxPerUnit, visible) {
      handle.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      handle.classList.toggle('live', visible);
      span = Math.max(80, pxPerUnit);
    },
  };
}
