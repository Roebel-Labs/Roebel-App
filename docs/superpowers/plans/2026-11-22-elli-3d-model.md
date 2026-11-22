# Elli 3D Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the boxy yellow Elli van with a stylised clay-look Nissan e-NV200 built by a Blender script, and make it true-scale when zoomed in.

**Architecture:** A headless Blender Python script builds the van from bevelled, subdivided primitives, renders a studio preview PNG and exports an indexed GLB to `apps/web/public/models/elli.glb`. A Node validator checks indices, triangle count, size and bounds. The Expo map test switches `modelScale` to true metres above zoom 17.

**Tech Stack:** Blender 5.3 (bpy, glTF exporter), Node (validator, no deps), @rnmapbox/maps ModelLayer.

**Spec:** `docs/superpowers/specs/2026-11-22-elli-3d-model-design.md`

## Global Constraints
- Units metres; origin ground-centre; forward = +X; glTF Y-up (exporter `+Y up`); existing −90° heading offset must still be correct.
- Bounds ≈ 4.56 (L) × 1.76 (W) × 1.86 (H) m, ±5 %.
- ≤ 15 000 triangles, ≤ 400 KB GLB, no textures, every primitive indexed.
- No text/logos/plate on the model; one Elli key visual = green plug + cable swoosh (front + both flanks).
- Clay style: matte white body, dark glass band, black mirrors, dark tyres + light hubs, white front light strip, red rear strip.

## Review Focus
- Orientation flipped/mirrored after export (nose pointing −X) → validator asserts the front-light material's centroid has x > 0.
- Missing indices → validator fails (Android crash lesson cd40cd5f).
- Model floating or sunk → validator asserts min y ≈ 0 (|min y| < 0.02).
- Stale cached model on devices → app URL gets `?v=2`.
- Van vanishes when zoomed far out → scale expression keeps ×2 per zoom step below 17.

---

### Task 1: Blender build script + validator

**Files:**
- Create: `apps/web/scripts/elli-model/build_elli.py`
- Create: `apps/web/scripts/elli-model/validate-glb.cjs`
- Modify: `apps/web/public/models/elli.glb` (regenerated)
- Delete: `apps/web/scripts/make-elli-model.cjs`

**Interfaces:**
- Produces: `Blender -b -P build_elli.py -- <out.glb> [<preview.png>]`; `node validate-glb.cjs <file.glb>` → exit 0 + summary line, exit 1 + reason.

- [ ] Step 1: Write `validate-glb.cjs`: parse GLB JSON chunk; fail if any primitive lacks `indices`, triangles > 15000, file > 400 KB, bounds outside ±5 % of 4.56/1.86/1.76 (x/y/z extents), |min y| ≥ 0.02, or the material named `light_front` has mean POSITION x ≤ 0.
- [ ] Step 2: Run it on the current `elli.glb` → expect FAIL (bounds/material).
- [ ] Step 3: Write `build_elli.py` (body: rounded box with bevel+subsurf, tapered nose and windscreen, glass band, wheel arches, 4 wheels, mirrors, light strips, green plug swoosh; materials named `body, glass, tyre, hub, trim, light_front, light_rear, elli_green`); apply modifiers, export GLB, render preview with Eevee/studio lighting.
- [ ] Step 4: Build + validate → PASS; review preview PNG and iterate on shape.
- [ ] Step 5: Commit.

### Task 2: True-scale zoom in the map test

**Files:**
- Modify: `apps/expo/app/settings/dev-elli-map.tsx:33-55`

- [ ] Step 1: `MODEL_URL` gets `?v=2`; `MODEL_SCALE` = `['interpolate', ['exponential', 2], ['zoom'], 10, [128,128,128], 17, [1,1,1], 22, [1,1,1]]` (×2 per step below 17, true metres above); drop `MODEL_PX_SCALE`.
- [ ] Step 2: Commit + push (Max tests on device; threshold tuned there).
