# Mob Translate — logo (vector kit, 2026)

Pixel-faithful vector rebuild of the open-book "M" mark + `MOBTRANSLATE` wordmark,
traced from the supplied raster (`../source/original-upload.png`) and verified against
it (RMSE ≈ 0.025 — differences are sub-pixel edge anti-aliasing only).

## Colours
| Role | Hex |
|---|---|
| Teal (left page) | `#086672` |
| Charcoal / navy (right page + wordmark) | `#1D252E` |
| Background (icons) | `#FFFFFF` |

## Files
| File | Use |
|---|---|
| `logomark.svg` | the mark alone, tight bounds, transparent — **the primary logo** |
| `logo-full.svg` | mark + `MOBTRANSLATE` wordmark lockup |
| `logomark-mono-navy.svg` / `-white.svg` / `-teal.svg` | single-colour marks (stamps, dark UI, watermarks) |
| `icon-square.svg` | mark centred on white, app-icon framing (62%) |
| `icon-maskable.svg` | tighter framing (52%) for Android/PWA maskable safe zone |
| `icon-transparent.svg` | square, transparent background |

All raster app/web icons (favicons, apple-touch, PWA, Android mipmaps, iOS icon,
adaptive foreground, splash, OG image) are generated from these masters — see
`../png/`, `apps/web/app/{icon.svg,apple-icon.png,favicon.ico,opengraph-image.png}`,
`apps/web/public/icons/`, `mobile/assets/images/`, and the Android
`mipmap-*` folders.

Regenerate everything from the masters with the pipeline in the build scripts
(potrace trace → `rsvg-convert` → `ImageMagick`). The SVGs are the source of truth.
