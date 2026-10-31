# AGENTS.md

Landing page cho **Markdown Live** (editor Markdown cho Windows). HTML/CSS/JS thuần + three.js, build bằng Vite. Hai trang đầy đủ: `index.html` (EN) và `index.vi.html` (VI), dùng chung một bundle.

## Map

- `src/main.js`: entry duy nhất. Bảng `THEME`, dựng scene, lerp theme, scroll gates, frame loop.
- `src/rig.js`: `scrollY` → `u ∈ [0,1]` → camera.
- `src/scene.js`: renderer, lights, IBL, post chain.
- `src/tone.js`: đảo ACES (màu muốn thấy trên màn hình → giá trị HDR trong scene).
- `src/ui.js`: mọi tương tác DOM phía trên canvas.
- `src/objects/{hologram,diagram,glow}.js`: lớp 3D, raster vào `<canvas>` → `CanvasTexture`, trả `{ object, setOpacity, dispose, ... }`.
- `src/styles.css`: token màu, `.sec`, fallback `.no-gl`.

## Why

- Trang luôn mở ở theme **tối**, có chủ đích: không `localStorage`, không `prefers-color-scheme`. Đừng thêm persistence.
- Glow phải **sáng hơn nền** ở cả hai theme. Theme sáng dùng texture half-float đặc, rìa trùng màu nền, `glowI ≤ 1`. Quầng xanh tối hơn nền sẽ đọc như vết bẩn.
- Không shadow map, không transmission (mỗi cái nhân đôi chi phí). Bloom = 0 ở theme sáng.
- `createUI()` chạy trước `init3D()`: nội dung phải sống khi WebGL chết.

## How

- `npm test` rồi `npm run build` là toàn bộ gate. Không có lint, không có typecheck. Node >= 22.12. Không commit `dist/`.
- `npm test` là checker đọc source text. Nó chạy thật `rig.js` dưới stub, nên `rig.js` phải import được trong Node trần (không đụng DOM ở module scope).

## Invariants dễ vỡ âm thầm

**Section ↔ camera**
- Số `.sec` trong HTML == `KEYS.length` trong `rig.js`, thứ tự theo DOM.
- Không reformat `KEYS`: test đếm dòng bằng `/^ {2}\[/gm` (đúng 2 space).
- Section cuối phải cao hơn 1 viewport (`.sec.play { min-height: 126svh }`), nếu không keyframe cuối không tới được.
- `HEIGHTS` trong `scripts/check.mjs` phản chiếu `styles.css`. Đổi chiều cao thì đổi cả hai.
- Thêm section: sửa 2 file HTML, `KEYS`, `styles.css`, và `gates()` nếu cần.

**EN / VI**
- Hai trang phải cùng tập `id="s-*"`, cùng số `<section>`, cùng con số (dung lượng `13 MB` xuất hiện 5 lần/trang, test chỉ kiểm 3).
- Script `<head>` thêm class `js` được nhân đôi ở cả hai file: sửa một thì sửa cả hai.
- `THEME.light.bg` trong `main.js` phải bằng `--bg` của theme sáng trong `styles.css`.

**Rendering**
- Cấm `AdditiveBlending` trong `objects/*` (vô hình trên nền sáng) và `smoothstep(hi, lo, x)` (undefined theo GLSL).
- Test ghim literal: `light ? '#1f2328' : '#ffffff'` (hologram), `ink: '#1f2328'` (diagram), và mọi `col('k')` phải có `k: 0x` trong `THEME`.
- Giá trị theme chỉ đặt ở một theme thì không có tác dụng (lerp giữa hai theme).
- `prefers-reduced-motion` bỏ hẳn vòng rAF: animation thêm trong `frame()` sẽ không chạy cho nhóm này.
- `ui.js` không degrade: thiếu `#theme` hoặc `.nav` ở một trang là cả script chết.

## Deploy

- Pages phải tạo **một lần bằng tay** (Settings > Pages > Source = GitHub Actions). Đừng thêm `enablement: true`, luôn 403.
- `vite.config.js`: `base: './'`, hai entry dùng chung bundle, `three` tách chunk riêng. Đừng gộp entry.

## Conventions

- Comment và prose nội bộ bằng tiếng Việt. Copy hiển thị: EN trong `index.html`, VI trong `index.vi.html`.