# Handoff: Colsubsidio "Grúa del Futuro" – Landing Hero

## Overview
Landing/hero screen for the "Grúa del Futuro" campaign microsite. Single animated hero that introduces a gamified housing questionnaire and drives users to a CTA that starts the game.

## About the Design Files
The bundled file (`landing-hero.html`) is a **design reference built in HTML** — a prototype showing intended look, copy, and motion. It is not production code to paste in as-is. Recreate it inside your app's existing stack (React, Vue, etc.) using your project's own component/styling conventions, importing the real Colsubsidio logo asset and font licenses as your codebase already handles them.

## Fidelity
**High-fidelity.** Colors, type, spacing, and animation timings below are final — implement pixel-for-pixel and timing-for-timing.

## Screens / Views

### Screen: Landing Hero
**Purpose:** First screen of the campaign; sets tone, communicates it's fast/playful, and leads to the CTA that starts the housing-match game.

**Layout:**
- Full viewport height column: `nav` (fixed 76px) + `main` (flex:1, centered content, column, `gap:22px`, `align-items:center`, `text-align:center`, `padding:56px 24px 72px`).
- Page background: `linear-gradient(180deg, #CCE1EF 0%, #E4F1FA 42%, #FFFFFF 85%)`.

**Components (top to bottom):**

1. **Nav bar** — height 76px, background `#0067B1`, `display:flex; justify-content:space-between; align-items:center; padding:0 32px`.
   - Left: hamburger icon button, 42×42px, transparent bg, 3 white bars (22×2.5px, 5px gap, 2px radius), hover bg `rgba(255,255,255,0.12)`.
   - Right: Colsubsidio logo, white lockup version, height 26px (asset: `Logov2.png` in this bundle — white version for use on the brand-blue background).

2. **Campaign eyebrow pill** — inline-flex pill, white bg, border `1px solid rgba(0,103,177,0.25)`, text color `#0067B1`, font `700 12px/1 Inter`, `letter-spacing:0.08em`, uppercase, padding `9px 16px`, `border-radius:999px`, small 7px yellow dot (`#FFD000`) before text. Copy: "Grúa del Futuro" (tweakable).
   - Entrance: fade+slide up, 0.6s ease-out, no delay.

3. **Animated hero illustration** — 320×240px relative container, centered:
   - Radial glow circle behind: 210×210px, `radial-gradient(circle, rgba(0,103,177,0.22) 0%, rgba(0,103,177,0) 70%)`, pulsing scale 0.94↔1.06 / opacity 0.5↔0.85, 5s loop.
   - "House" glyph: white rounded rect (96×80px, `border:5px solid #0067B1`, `border-radius:10px`) + yellow triangle roof above it + small yellow door (26×36px) + small blue window (14×14px). All four pieces share one gentle bob+rotate float (`translateY(-12px) rotate(-3deg)` at midpoint, 6s loop).
   - 4 small floating accent shapes around the house (yellow rounded square, blue circle, grafito square, yellow small circle) each on its own orbit-style float loop (4.2–5.4s, independent phase) for a lively, non-repetitive feel.
   - Entrance: whole illustration fades+scales in (0.7s ease-out, 0.1s delay), continuous float/orbit/glow loops run indefinitely after.

4. **Headline** — "Construye tu sueño", `Poppins 800, 56px/1.08`, color `#0067B1`, `letter-spacing:-0.01em`. Entrance: fade-up 0.7s, 0.25s delay.

5. **Subheadline** — "Responde jugando y encuentra tu vivienda ideal con **Colsubsidio**." `Inter 500, 21px/1.5`, color `#3385C1` (80%-tint of brand blue); "Colsubsidio" in bold `#0067B1`. Entrance: fade-up 0.7s, 0.4s delay.

6. **Quote line** — "Tú pones el sueño. Nosotros la grúa." italic `Inter 500, 16px/1.5`, color `#575756` (grafito). Entrance: fade-up 0.7s, 0.5s delay.

7. **CTA button** — "¡Construir mi casa!" (tweakable text), bg `#FFD000`, text `#575756`, `Poppins 700, 21px/1`, padding `22px 44px`, `border-radius:16px`. Hover: `translateY(-2px)`, 0.15s ease. Entrance: fade-up 0.7s at 0.6s delay, THEN a continuous soft shadow pulse starting ~1.3s in (`box-shadow` breathing between `0 10px 24px rgba(255,208,0,.35)` and `0 16px 34px rgba(255,208,0,.52)`, 2.6s loop, infinite) to keep drawing the eye without being distracting.

8. **Info badge** — single pill, white bg, border `1px solid rgba(87,87,86,0.15)`, `border-radius:999px`, padding `10px 18px`, text `600 14px Inter` color `#0067B1`, clock outline icon (16×16 SVG, stroke `#0067B1`), copy "2 minutos". Entrance: fade-up 0.7s, 0.75s delay.
   (Note: an earlier "Sin descargas" badge was removed per latest direction — do not re-add.)

## Interactions & Behavior
- No real navigation is wired in the reference (hamburger is decorative in this mock — wire it to your actual nav/menu).
- CTA button has no click handler in the mock — should route to / open the housing-match game flow.
- All motion is passive/ambient (no scroll-triggered or JS-driven animation) — pure CSS `@keyframes`, so it's cheap to port to any framework via CSS modules / styled-components / Tailwind `@layer` etc.
- Respect `prefers-reduced-motion`: consider disabling the infinite float/orbit/pulse loops (keep the one-time entrance fades) for users who request reduced motion — not present in the mock, worth adding in production.

## State Management
Stateless screen. Only content-level "props" (all with sensible defaults, safe to hardcode if not building a CMS-driven version):
- `ctaText` (string) — default "¡Construir mi casa!"
- `campaignTag` (string) — default "Grúa del Futuro"
- `showBadges` (boolean) — default true (controls the "2 minutos" badge row)

## Design Tokens

**Colors (official Colsubsidio brand):**
- Azul Colsubsidio: `#0067B1` (Pantone 2196 C)
- Amarillo Colsubsidio: `#FFD000` (Pantone 109 C)
- Grafito: `#575756` (Pantone Cool Gray 11 C)
- Azul 80% tint (derived): `#3385C1` — used for subheadline text
- Background gradient stops: `#CCE1EF` → `#E4F1FA` → `#FFFFFF`

**Typography:**
- Headline / CTA: Poppins, weights 700–800
- Body / UI: Inter, weights 400–600
- Both loaded from Google Fonts in the mock; swap for your codebase's licensed/self-hosted equivalents if different.

**Radii:** pill `999px`, illustration house `10px`, CTA button `16px`, badge `999px`.

**Shadows:** illustration house `0 12px 22px rgba(0,103,177,0.18)`; CTA pulsing shadow (see above); badge `0 2px 6px rgba(0,0,0,0.04)`.

**Animation timings:** entrance fades 0.6–0.7s ease-out, staggered 0–0.75s; ambient loops 4.2s–6s ease-in-out infinite; CTA shadow pulse 2.6s ease-in-out infinite.

## Assets
- `Logov2.png` — Colsubsidio full lockup, white version (for use on brand-blue nav). Provided by the user (official brand asset).
- No other images; the hero illustration is built entirely from CSS shapes (div rectangles/triangles + radial-gradient), no image or SVG illustration asset — reproduce as shapes/CSS in your framework, or replace with a real illustration asset if the brand team provides one.
- Small inline SVG clock icon (stroke-based, 24×24 viewBox) used in the badge — included inline in the HTML file.

## Files
- `landing-hero.html` — full design reference (this is the DC-wrapped prototype; the actual markup/styles to read are inside the `<x-dc>` body).
