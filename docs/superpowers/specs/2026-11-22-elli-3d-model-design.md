# Elli 3D vehicle model — design (short)

Date: 2026-11-22 · Status: awaiting approval · Part 1 of 2 (part 2 = CO₂ savings, designed with booking)

## Intent
The Elli pin on the 3D map (`apps/expo/app/settings/dev-elli-map.tsx`) is a boxy, yellow, code-built van that
looks cheap and is not Elli. Replace it with a stylised model of Elli's real car (white **Nissan e-NV200 Evalia**)
in the soft "clay" look of Uber's 3D vehicle renders: reduced shapes, no photorealism. It should read as a real
car on the ground when zoomed in.

## Goals
- Recognisably Elli: e-NV200 proportions (4.56 × 1.76 × 1.86 m, tall box nose, sliding door), white body.
- Clay look: generous rounded bevels, smooth shading, matte white body, one dark glass band wrapping the cabin,
  black mirrors, chunky dark tyres with light hubs, a thin light strip front and red strip rear.
- One Elli key visual: the **green plug + cable swoosh** (front + both flanks), as geometry/material, not a texture.
- True scale up close: the model grows/shrinks with the map; below a zoom threshold it holds a minimum on-screen
  size so it never vanishes.

## Non-goals / anti-goals
- No photorealism, no textures, no readable text (ELLI logo, "BÜRGERBUS", plate). Unreadable at map scale.
- Not a copy of Uber's vehicle — only their render *style*; the body is the e-NV200 shape.
- Must not crash Mapbox: every primitive indexed (Android SIGSEGV lesson, cd40cd5f).

## Approaches
- A. Licensed photoreal model, re-liveried — rejected: Max wants stylised, not photoreal.
- **B. Own model built in Blender via a Python script — chosen.** Reproducible, ours, free, style fully controlled.
- C. Polish the existing JS generator (`apps/web/scripts/make-elli-model.cjs`) — rejected: stays boxy (no bevels/subdivision).

## How
- Script `apps/web/scripts/elli-model/build_elli.py`, run headless:
  `/Applications/Blender.app/Contents/MacOS/Blender -b -P build_elli.py -- apps/web/public/models/elli.glb`.
  Also saves a `.blend` + a PNG preview render (studio light, like the Uber reference) for review.
- Units metres, origin ground-centre, forward = +X, Y-up in the glTF (same axes as today, so the existing −90°
  heading offset keeps working).
- Budget: ≤ 15k triangles, ≤ 400 KB GLB, ~8 flat PBR materials, no textures. Modifiers applied on export.
- Validate after export: indices present on every primitive, bounds ≈ real dimensions.
- Replaces `apps/web/public/models/elli.glb` (served at roebel.app/models/elli.glb → live after web deploy;
  app picks it up without OTA). Old JS generator deleted.
- Zoom: `MODEL_SCALE` becomes `[1,1,1]` (true metres) from zoom ~17 up; below that it grows ×2 per zoom step
  down so the van keeps ~its zoom-17 on-screen size. Threshold tuned on device.

## Left to the builder
Exact bevel radii, colours (white `#F4F5F7`, glass `#1E242C`, Elli green `#5DBB46`-ish from the photo), poly
detail — judged from the preview render; Max reviews the render before it ships.
