/**
 * Toàn bộ tương tác DOM phía trên canvas 3D. Không thư viện.
 * - theme toggle đẩy giá trị ra ngoài qua callback (main.js lo lerp 3D)
 * - reveal bằng IntersectionObserver
 */
export function createUI({ onTheme, onPointer }) {
  const root = document.documentElement;

  /* ── theme ─────────────────────────────────────────────── */
  const btnTheme = document.getElementById('theme');
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  let light = root.dataset.theme === 'light';

  btnTheme.addEventListener('click', () => { light = !light; applyTheme(); });
  applyTheme();

  /* ── reveal ────────────────────────────────────────────── */
  /* .on dính 1 lần cho tới hết phiên; .live bật/tắt theo viewport và chỉ
     .panes.on dùng nó — đó là công tắc "chạy/dừng" cho animation ở styles.css. */
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      if (e.isIntersecting) e.target.classList.add('on');
      e.target.classList.toggle('live', e.isIntersecting);
    }),
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
    onPointer?.((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
  }, { passive: true });

  function applyTheme() {
    // Cố ý không lưu: mỗi lần vào lại bắt đầu từ nền tối (data-theme trên <html>).
    root.dataset.theme = light ? 'light' : 'dark';
    // thanh trình duyệt trên mobile: đọc token --bg để không lặp mã màu ở JS
    metaTheme.content = getComputedStyle(root).getPropertyValue('--bg').trim();
    onTheme?.(light);
  }
}
