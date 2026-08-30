# Custom map marker PNGs

Drop marker images here (recommended: 128×128 px PNG with transparency).
Register each file in `lib/map/markers.ts` → `MARKER_IMAGES`, then reference
the registry key from a feature's `markerImage` property (per-place wiring
lands with the org-map-presence slice; slug-based wiring works today via
`SLUG_MARKER_IMAGE_OVERRIDES` in the same file).

Planned: `muehle.png` (windmill, size lg), Döner/Burger for An der Waage.
