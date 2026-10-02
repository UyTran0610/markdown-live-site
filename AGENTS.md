# AGENTS.md

Landing page for **Markdown Live** (Windows Markdown editor). Plain HTML/CSS/JS + three.js, built by Vite. No framework, no TypeScript, no CSS framework, no templating.

## Commands

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # = node scripts/check.mjs — the only verification step
npm run build      # -> dist/
npm run preview
```

Node >= 22.12 (vite 8). There is **no lint and no typecheck** — `npm test` then `npm run build` is the whole gate. `dist/` is gitignored build output; never commit it.

`npm test` needs no browser and no dev server. It prints `N checks passed` — trust that `N`, don't hardcode a count anywhere.

## `src/` map

Orientation only — the invariants live in the sections below. `main.js` is the sole entry point; nothing outside it imports from `src/` except `scripts/check.mjs`, which runs `rig.js` for real. `tone.js` is imported by `main.js` and `objects/glow.js` only.

| File | Owns |
| --- | --- |
| `main.js` | Orchestration: the `THEME` table, scene assembly, the theme lerp, scroll gates, the frame loop. |
| `tone.js` | Inverse of the ACES tone curve: turns a colour you want *on screen* into the HDR value the scene must hold. Pure maths, no DOM. |
| `rig.js` | `scrollY` → `u ∈ [0,1]` across the `.sec` list → camera position, look-at and fov. |
| `scene.js` | The WebGL context, camera, key/fill/rim lights, `RoomEnvironment` IBL, the post chain. |
| `ui.js` | Every DOM interaction above the canvas. No 3D, no libraries. |
| `styles.css` | Colour tokens, the `.sec` shell, the `.no-gl` fallback, responsive + motion rules. |
| `objects/hologram.js` | The equation plate. |
| `objects/diagram.js` | The pipeline flowchart. |
| `objects/glow.js` | The background halo. |

Two details the filenames don't tell you:

- **`scene.js` exports `envRT` and `resize` for its callers, not for itself.** `main.js` needs both: `envRT` to free the PMREM target on `pagehide`, `resize` because adaptive quality re-runs it after dropping DPR. No shadow map and no transmission, deliberately — each doubles per-frame cost.
- **`ui.js` silently no-ops when a hook is missing.** It needs `#theme`, `.nav`, `.btn`, `.reveal` and `.scrim` to exist in *both* HTML pages. Rename one in a single page and that feature just stops working, with no error.

### `objects/` — one contract, one technique

All three layers return the same shape, and `main.js` drives them identically:

```js
{ object, update(t), setOpacity(v), setTheme(color, light), dispose() }
```

The shared technique: **raster into a `<canvas>`, upload it as a `CanvasTexture`**. Text stays crisp with zero font files, and the whole layer costs one draw call. A theme flip re-rasters *in place* behind an `isLight` guard instead of swapping in a second texture. **`glow.js` is the one exception** — see below.

- **`hologram.js`** — two formulas set in system math fonts; the shader adds per-frame jitter, a 1.6px chromatic offset, scanlines, an accent-tinted bottom glow and a vertical fade.
- **`diagram.js`** — a flowchart of the app's *real* pipeline (editor → parser → preview, plus the katex and mermaid.js branches), not decorative boxes. `route()` does orthogonal port routing, a shared destination gets one arrowhead, and node interiors are punched out with `destination-out` so an edge can never cross text. The shader splits RGB by less than a texel and sweeps a signal wave left→right every 4s.
- **`glow.js`** — a single `MeshBasicMaterial` plane, 17 units wide at `z=-4`. There is no floor, so there is no contact shadow: the wide colour layer *is* the depth. The two themes are **different constructions**, not one texture re-tinted:
  - *Dark*: a white-alpha `CanvasTexture` (`PROFILE_DARK`) multiplied by the accent colour — a blue halo, brighter than the ground.
  - *Light*: an **opaque** half-float `DataTexture` (`lightStops`), built lazily on the first flip to light and swapped in via `mat.map`. Centre is near-white, falling to sky-blue, and the rim equals the ground colour exactly. The design rule: the glow must be *lighter* than the ground in both themes. A blue-ink halo on a light page is darker than the ground and reads as a stain — that was the old light theme's problem.
  - Because the light plane is opaque, `glowI` for light is `1` and the glow colour is white; the texture carries all the colour. `glowI` must never exceed `1`.

## `npm test` is a source-text checker, not just a unit test

`scripts/check.mjs` greps and regex-parses source. Several invariants live **only** there, so edits can break them without any tool complaining until you run it:

- **No `smoothstep(hi, lo, x)`** (edge0 > edge1) in any `src/objects/*.js` — undefined per GLSL spec.
- **No `AdditiveBlending`** in `glow.js` / `hologram.js` / `diagram.js` — additive layers are invisible on the light background (`#e4ecf8`). This was a real shipped bug.
- Exact literals are asserted: `light ? '#1f2328' : '#ffffff'` in `hologram.js`, `ink: '#1f2328'` in `diagram.js`, the glow profile tables (now `PROFILE_DARK` + `lightStops` — **`check.mjs` still expects the old `dark`/`light` alpha tables and must be updated to match**), and every `col('k')` in `main.js` must match a `k: 0x` key in `THEME` (a typo silently yields black).

It also runs `src/rig.js` for real under stubbed browser globals, so **`rig.js` must stay importable in bare Node** — no module-scope DOM access.

## Sections: one DOM section = one camera keyframe

The load-bearing convention. `.sec` count in the HTML == `KEYS.length` in `src/rig.js`.

- **`KEYS` order follows DOM order, not alphabetical id order.** DOM is hero → split → math → perf → play; alphabetically the ids are `s-hero, s-math, s-perf, s-play, s-split`. Test asserts the id set is sorted-then-compared, so it will not catch a swapped keyframe.
- **Never reformat `KEYS`.** The test counts rows with `/^ {2}\[/gm` — rows indented with 4 spaces or tabs silently stop counting and fail the assertion.
- **The last section must stay taller than 1 viewport** (`.sec.play { min-height: 126svh }`). `rig.read()` ends the final window at `maxScroll`, not `documentHeight`; if the last section is only 1 viewport tall the last keyframe is unreachable.
- `scripts/check.mjs` hardcodes `HEIGHTS = [0.9, 0.9, 0.9, 0.9, 1.26] × viewport`, mirroring `styles.css`. Change a section's height and you must update `HEIGHTS` or the rig assertions break.
- Adding a section means editing `index.html`, `index.vi.html`, `src/rig.js` `KEYS`, `src/styles.css`, and (if new) `main.js` `gates()`.

## EN / VI pages must stay in lockstep

`index.html` and `index.vi.html` are separate full pages. `npm test` enforces same `id="s-*"` set, same `<section>` count, and matching numbers.

- The app size (`13 MB`) appears **three times per page** — hero stats, `.meter`, and `meta description` — and must be the same value in both languages. Test compares them.
- The `<head>` theme bootstrap script (reads `localStorage['ml-theme']` before first paint) and the `meta[name=theme-color]` sync are duplicated verbatim in both files. Change one, change both. The light `theme-color` literal in that script (`'#e4ecf8'`) must equal `--bg` for light.
- `<html data-theme>` + the CSS custom property `--bg` are the single source of colour truth for the DOM. The one place JS repeats a hex is `THEME.light.bg` in `main.js` — it **must equal** light `--bg` in `styles.css` and the `theme-color` literal in both HTML heads (`#e4ecf8` today). Change one, change all three.

## Theme / rendering invariants

- `src/main.js` holds the `THEME` table (dark + light). Theme changes **lerp** over ~5/s; `applyTheme()` early-returns when settled. Setting a value only in one theme silently has no effect. Light `bloom` is `0` on purpose: `UnrealBloomPass` adds light over the whole pale background, so any dark ink drawn on it is bloomed back to white.
- `prefers-reduced-motion: reduce` **removes the rAF loop entirely** — it re-renders only on `scroll`/`resize`. Any per-frame animation added in `frame()` never runs for those users.
- WebGL failure is non-fatal: `init3D()` is wrapped in try/catch, body gets `.no-gl`, CSS collapses the canvas. `createUI()` runs **before** 3D on purpose — content must survive a dead WebGL context.
- Adaptive quality in `frame()` will drop DPR then disable bloom on sustained slow frames — that is intentional, not a bug.

## Deploy

Push to `main` → `.github/workflows/deploy.yml` runs `npm ci` → `npm test` (hard gate) → `npm run build` → GitHub Pages. `npm test` failing blocks the deploy.

The Pages site must be created **once by hand**: Settings > Pages > Source = GitHub Actions. `GITHUB_TOKEN` cannot create it — `enablement: true` always 403s. A previous commit removed that; don't re-add it.

`vite.config.js`: `base: './'` (relative paths for the Pages subpath), two HTML entries sharing one JS/CSS bundle, `three` split into its own long-lived chunk. Don't consolidate the entries — the VI page intentionally reuses the EN bundle.

## Conventions

- Comments and internal prose are in Vietnamese; user-facing copy is EN in `index.html`, VI in `index.vi.html`.
- No dependencies beyond `three`. UI is plain DOM in `src/ui.js`.
- Commit messages: short imperative summary, lowercase, no required prefix — but `fix:`/`feat:` prefixes appear in recent history and are fine.