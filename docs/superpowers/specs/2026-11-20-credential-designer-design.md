# Credential Designer ("Ausweis-Designer") — Design

**Date:** 2026-11-20 · **Status:** draft for owner approval · **Builds on:** `2026-11-17-credential-register-design.md` (register, types, batches, event badges), plans credreg-1…5.

## 1. Intent

Clubs and organisations in Röbel issue Ausweise (memberships, roles) and event Abzeichen through the credential register. Today a type has a name, a description, benefits and one image link; the four community cards (Gast, Bürger, Bescheiniger, PSV) are fixed PNGs rendered from SVG.

The owner wants every org's Ausweis to look as professional as those four cards — a real, moving metal shimmer — while letting each org make it its own: some want shine, others matt, paper or their own texture. The person designing is **a club treasurer**: knows the club, has a logo, is not a designer, has limited time. Templates make the easy path look premium; a free editor lets anyone go further.

Success: a treasurer opens a template, drops in the logo, changes the text, maybe generates a background, tests the card on their own phone, publishes it, and members get a card that looks premium and shows their own name. Later the treasurer can change it at any time and publish an update.

## 2. Decisions taken with the owner (2026-11-19/20)

| Topic | Decision |
|---|---|
| Who designs | Org owners/admins (persona: club treasurer). |
| Where | Ortis Studio (web and desktop) **and** the Röbel App. |
| Freedom | Full editor: drag and drop every element, **all text editable**, including "Röbel / Müritz" and the Röbel App mark — nothing is locked. Templates are offered as the starting point. |
| Backgrounds | Choose from presets, upload, or **generate with AI**. |
| Stickers | Generate with AI (and upload) and place on the card. |
| Personal field | The creator can place a dynamic text field that shows the holder's **first and last name**. |
| Format | Card proportions of the existing cards: **924 × 580** (corner radius of the existing cards, ~4 % of the width, not rounder). Title size in the range of "BÜRGER" on the citizen card. |
| Stamps | Attendance stamps / event badges stay **org-only** (no personal issuers; no contract change). |
| Lifecycle | **Save drafts, test drafts, then publish; always editable afterwards, and every change can be published as an update.** |
| Approach | **B** (see §4): web editor in Studio, native drawing with Skia in the app plus a touch editor. |
| Contract | CredentialRegistry deployed 2026-11-20: `0xF06BAa9396ef57E660D3549897d5ca8fb788b8E1` (block 49374195, owner Attester Safe). |

## 3. Goals, non-goals, anti-goals

**Goals**
- Premium look by default: every template must look as good as the four existing cards.
- A non-designer finishes a card in about ten minutes.
- Same card in Studio, the app wallet, the app editor and the public type metadata.
- Shimmer that moves: in the app it follows the phone's tilt.
- Drafting and testing work **before** an org is registered on chain and before the register is switched on for everybody.

**Non-goals**
- Personal (non-org) issuers of stamps or Ausweise.
- Printed plastic cards (letters with QR codes already exist in plan 4).
- Animated video backgrounds, 3D models.
- A general-purpose graphics tool (no pen tool, no free vector drawing).

**Anti-goals (a failure even if it works)**
- Members ever see an unfinished draft.
- A holder's name, email or wallet ends up in public metadata, on chain, or on the server in rendered form.
- Templates that look cheap, or a default flow that produces unreadable cards.
- Studio or the app suggesting a card is published before the phone confirmed the register change.
- The words NFT, Token, Wallet-Adresse, Blockchain in the interface; any wallet address shown.

## 4. Approaches considered

All three store a design as one shared description of layers (§5).

- **A. One web editor, the app embeds it in a WebView.** Built once, identical everywhere, fastest, no native package. Editing on the phone feels like a website; a wallet with many cards needs flat images plus a separate sheen.
- **B. Web editor in Studio, native drawing in the app (Skia) plus a native touch editor.** Real tilt-following shimmer per element, native phone editing. Cost: the drawing runs on two platforms and must be pinned together; Skia is a new native package → next store build. **Chosen by the owner.**
- **C. Full editor only in Studio; the app gets templates + text + logo, cards as flat images with one animated sheen.** Least work, no native package; no free editing on the phone, sheen only over the whole card. Rejected: the owner wants real editing in the app.

## 5. The design document ("card design")

A versioned JSON document, the single source for every renderer.

```
CardDesign {
  schema: 1
  format: 'card' | 'stamp'              // card 924×580, stamp = circle (event badges)
  background: { kind: 'preset', preset: 'silver'|'navy'|'gold'|'black'|'paper'|'holo'|'matte'|'glass'|…, color?: string }
            | { kind: 'image', assetId, fit: 'cover' | 'tile' }
  shine: { enabled: boolean, intensity: 0..1 }        // card-wide sheen
  border?: { color, width }
  layers: Layer[]                                      // bottom → top
}
Layer = common { id, x, y, w, h, rotation, opacity, shine: boolean, locked?: false }
  & ( { type: 'text', text, font, weight, size, color, align, uppercase, letterSpacing }
    | { type: 'field', field: 'holderName' | 'validUntil' | 'memberSince', font, …, sampleText }
    | { type: 'image', assetId, role: 'logo' | 'sticker' | 'image' } )
```

- Coordinates in card units (0–924 × 0–580; stamp 0–580 × 0–580), so every renderer scales the same way.
- Fonts: a curated set embedded in both clients (Mona Sans family as used by the app, plus a few licence-clean display faces). No arbitrary font upload.
- Assets (`assetId`): images in Supabase storage under the org, content-addressed (sha256), immutable.
- Templates are CardDesigns with placeholder text and logo slots: the four existing cards recreated as designs first, then further finishes.

## 6. Lifecycle: draft → test → publish → update

States per type: **Entwurf** (draft only), **Veröffentlicht** (live version, possibly with a newer draft on top).

1. **Entwurf.** Every edit autosaves to the type's working draft (server). A type can exist as a draft without being in the register. Drafts are visible only to the org's owners/admins.
2. **Testen.** "Auf mein Handy senden": the draft appears in the creator's Röbel App (and co-admins') as a preview card marked "Entwurf · nur für dich", drawn with the real Skia renderer, the creator's own name in the name field, tilt shimmer. Nothing is written to the register; no member sees it. Studio also shows previews: card, in the hand (moving), in the wallet, light/dark.
3. **Veröffentlichen.** The draft is frozen into **design version n**: the server stores the design, renders the public preview image, and serves both at an immutable, content-addressed URL (`/api/credentials/designs/<sha256>` → type metadata JSON with `image` and the design). First publication = the existing `type_prepare` **create** flow with `metadataURI` = that URL; later publications = `type_prepare` **update** → `updateType` with the new `metadataURI`. Both are confirmed on the phone like every register change. Requires the org to be registered on chain and the register enabled.
4. **Ändern.** Editing a published type creates a new working draft on top of the live version; members keep seeing the live version until the update is confirmed. Possible at any time while the type is not retired. Older versions stay reachable (their URLs are immutable), so the history is verifiable on chain.

Because each published version's URL is pinned on chain, a holder or a door scanner can always check which design the org confirmed.

## 7. Personal fields

- `holderName` is filled in **only on the holder's device**. Verified citizens: their verified first and last name, which exists only on their phone (from verification, `lib/citizen-commitment.ts`); everybody else: their display name (editable by them).
- `validUntil` and `memberSince` come from the holder's own credential data.
- The public preview image and metadata show the field empty (or a neutral sample text that is never a real name).
- Studio previews use the creator's own name or "Vorname Nachname".

## 8. The editor

**Studio (web and desktop, `apps/studio`, renderer only → interface OTA):** left panel to add (Vorlagen, Oberfläche, Logo, Text, Feld, Sticker), centre canvas with drag, resize, rotate, snap guides, undo/redo; right panel with the selected element's settings (size, rotation, colour, font, shine on/off, layer order); preview switcher (Karte, In der Hand, Im Wallet, Hell/Dunkel); checks shown as **hints, never blocks** (text contrast, logo resolution, text outside the card). One primary action: "Als Entwurf speichern" / "Veröffentlichen".

**Röbel App (`apps/expo`):** the same document, touch editor: tap to select, drag, pinch to scale and rotate, bottom sheets for the panels; replaces today's form in `app/org/credentials/types-new.tsx`. Wallet and credential screens draw cards from the design with Skia instead of fixed PNGs (the four community cards move to designs too).

**AI help (kie.ai, as the Flyer-Generator and menu photos):** "Hintergrund erzeugen" (prompt → texture at card size, tileable option), "Sticker erzeugen" (prompt → image with the background removed). Results are stored as assets and marked as AI-generated (EU AI Act Art. 50, as for other AI images in the app). Daily limits per org.

**Upload:** logos and images (PNG/JPG/SVG/WebP), background removal offered for logos.

## 9. Rendering

- One drawing module per platform from the same CardDesign: Studio (web) and app (React Native Skia). Recommendation to the builder: draw with Skia on both sides (CanvasKit in Studio, `@shopify/react-native-skia` in the app) so shaders, blend modes and text layout are the same engine; the shimmer is one shared runtime shader.
- Golden tests: a fixed set of designs rendered on both platforms and compared to reference images within a tolerance.
- Shine: a moving highlight shader per layer with `shine: true` and card-wide; the app drives it from device tilt (`expo-sensors`, already installed), Studio from the pointer / a slow loop; reduced motion → static highlight.
- Server: renders the public preview PNG at publication (for metadata `image`, link previews, the web dashboard).

## 10. Server and data

- New table for designs per type: working draft (one per type) and published versions (immutable, sha256, created_by, created_at, confirmed action id). Type rows keep `metadataURI` of the live version.
- Draft routes need only org owner/admin rights and work while the org is not yet registered on chain and while `credentials_enabled` is off; they sit behind their own switch (`credential_designer_enabled`, app_settings) so drafting can open before issuing.
- Publication reuses `type_prepare` create/update and the phone confirmation of plan 2.
- Org routes (`/api/credentials/org`) gain design actions (draft get/save, assets, AI generate, test-send, publish); Studio uses its pairing session as today; holder-only actions stay app-only.

## 11. Constraints

- Studio: no change under `apps/studio/electron/` (interface OTA), Studio UI rules (no drop shadows in the chrome, warm stone greys, one primary action, `--w-accent`), all strings through `t()` with English entries. Never merge `feat/ortis-studio-desktop` into main.
- App: `StyleSheet` + `useTheme()`, no NativeWind; Mona Sans tokens. `@shopify/react-native-skia` is a new native package → ships with the next store build (3.10.0, owner runs EAS).
- German UI, English code. "Ausweis", "Abzeichen", "Röbel Münzen"; never NFT/Token/Wallet/Blockchain; never a wallet address.
- Production state 2026-11-20: registry deployed; Vercel production still needs `CREDENTIAL_REGISTRY_ADDRESS` + `CREDENTIAL_REGISTRY_DEPLOY_BLOCK`; `credentials_enabled` off; no org registered on chain yet (Attester Safe must sign the pending `migrationRegister` batch before anyone can publish).

## 12. Builder's calls (decided by the designer of this doc, owner can override)

- "Testen" = a private preview on the creator's (and co-admins') phones, not a real issue on chain.
- The designer covers the round stamp format of event badges as well as the card.
- Design updates go through the phone confirmation every time (they change the on-chain `metadataURI`) — matches "deploy an update".
- Separate switch for drafting (`credential_designer_enabled`) so drafting opens before issuing.
- The web dashboard (`apps/web/dashboard/credentials`) keeps its forms and shows the designed card read-only with a link to Studio web; no third editor.
- Curated fonts, no font upload.
- The four community cards become CardDesigns (owner = community namespace) and serve as the first templates.
- AI limits per org per day, numbers set at build time.

## 13. Left to the builder

Exact template list beyond the four, the shader maths, snap/guide behaviour, autosave interval, asset size limits, moderation of uploads (reuse what exists), the phased order (suggested: design schema + Studio editor + server drafts → app renderer → app editor → publish/update → AI).
