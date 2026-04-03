# Open-Source Workflow & Guidelines Design

## Context

The Roebel App is a public monorepo (AGPL-3.0) designed as a replicable civic tech blueprint. Currently developed solo, but structured to welcome contributors later. The main pain point is **no clear git workflow** — no branching strategy, no automated quality checks, and no CI/CD pipeline. The repo has a solid CONTRIBUTING.md and README but is missing GitHub templates, governance docs, shared configs, and automation.

**Goal:** Establish a professional open-source workflow with trunk-based development, CI/CD automation (including EAS OTA updates), and clear guidelines — all proportional to a solo developer who wants good habits now and easy onboarding later.

---

## 1. Git Workflow — Trunk-Based Development

### Rules

- `main` is always deployable
- **Small changes** (single file, bug fix, docs, config): commit directly to `main`
- **Larger work** (new feature, multi-app changes, risky refactors): short-lived feature branch → PR → merge
- **Branch naming**: `feat/description`, `fix/description`, `docs/description`, `chore/description`
- **Commit convention**: Conventional Commits (already documented in CONTRIBUTING.md)
- **Delete branches** after merge
- **No long-lived branches** — feature branches should live hours to days, not weeks

### When to Use a PR (Even Solo)

- Changes span multiple apps (`apps/web` + `apps/expo`)
- Touching blockchain contracts or shared packages
- Anything you'd want CI to validate before it hits `main`
- When you want a clear record of what changed and why

### Files to Modify

- [CONTRIBUTING.md](../../../CONTRIBUTING.md) — add "Git Workflow" section with these rules

---

## 2. CI/CD — GitHub Actions

### Workflow 1: `ci.yml` — Quality Checks

**Triggers:** Push to `main`, all PRs

```yaml
Steps:
  1. Checkout
  2. Setup pnpm (with cache)
  3. Setup Node.js 20
  4. pnpm install --frozen-lockfile
  5. pnpm lint
  6. pnpm typecheck
  7. pnpm build
```

### Workflow 2: `eas-update.yml` — OTA Update to Preview Channel

**Triggers:** Push to `main` (after CI passes)

```yaml
Steps:
  1. Checkout
  2. Setup pnpm + Node.js
  3. pnpm install --frozen-lockfile
  4. Setup EAS CLI
  5. eas update --channel preview --auto
```

**Required secrets:** `EXPO_TOKEN`

**Note:** Production OTA updates (`pnpm update:production`) remain manual — run deliberately after testing on the preview channel.

### Workflow 3: `eas-build.yml` — Native Builds (Manual)

**Triggers:** Manual dispatch (`workflow_dispatch`) or git tags (`v*`)

```yaml
Steps:
  1. Checkout
  2. Setup pnpm + Node.js
  3. pnpm install --frozen-lockfile
  4. Setup EAS CLI
  5. eas build --platform all --profile production
```

**Required secrets:** `EXPO_TOKEN`

**When to use:** Only when native code changes (new SDK version, new native modules, new permissions). JS-only changes go through OTA updates instead.

### Vercel Preview Deploys

No workflow needed — Vercel auto-deploys PRs when the repo is connected. Verify Vercel integration is active for `apps/web`.

### Changesets — Version Management

- Install `@changesets/cli` as a dev dependency
- Add `.changeset/config.json` with `"access": "public"` and `"baseBranch": "main"`
- Before merging notable changes, run `pnpm changeset` to create a changeset file
- A GitHub Action (`release.yml`) creates a "Version Packages" PR that bumps versions and generates `CHANGELOG.md`
- Merging that PR publishes the release

### Files to Create

- `.github/workflows/ci.yml`
- `.github/workflows/eas-update.yml`
- `.github/workflows/eas-build.yml`
- `.github/workflows/release.yml`
- `.changeset/config.json`

---

## 3. Shared Configs

### Prettier

Move `apps/web/.prettierrc` to root level so all apps share the same formatting rules.

```json
{
  "singleQuote": false,
  "semi": true,
  "tabWidth": 2,
  "trailingComma": "es5"
}
```

### ESLint

Keep per-app ESLint configs (Next.js and Expo have different plugin needs). Verify `apps/expo/` has an ESLint config — add one if missing.

### Files to Modify/Create

- Move `apps/web/.prettierrc` → root `.prettierrc`
- Verify/create `apps/expo/.eslintrc.json`
- Add `prettier` to root `devDependencies`

---

## 4. GitHub Templates

### PR Template — `.github/pull_request_template.md`

Based on the existing checklist in CONTRIBUTING.md:

```markdown
## What

<!-- Brief description of the change -->

## Why

<!-- Why is this change needed? -->

## Checklist

- [ ] TypeScript strict mode passes
- [ ] ESLint passes (`pnpm lint`)
- [ ] Works on web (localhost:3000)
- [ ] Works on iOS simulator (if UI change)
- [ ] Works on Android emulator (if UI change)
- [ ] No hardcoded API keys or secrets
- [ ] German strings used for user-facing text
```

### Bug Report — `.github/ISSUE_TEMPLATE/bug_report.md`

```markdown
---
name: Bug Report
about: Report a bug
labels: bug
---

## Describe the bug
<!-- Clear description -->

## To reproduce
1. Go to '...'
2. Click on '...'
3. See error

## Expected behavior
<!-- What should happen -->

## Platform
- [ ] Web (browser + version)
- [ ] iOS (device/simulator + version)
- [ ] Android (device/emulator + version)

## Screenshots
<!-- If applicable -->
```

### Feature Request — `.github/ISSUE_TEMPLATE/feature_request.md`

```markdown
---
name: Feature Request
about: Suggest a feature
labels: feature
---

## Problem
<!-- What problem does this solve? -->

## Proposed solution
<!-- How should it work? -->

## Alternatives considered
<!-- Other approaches you've thought about -->
```

### Files to Create

- `.github/pull_request_template.md`
- `.github/ISSUE_TEMPLATE/bug_report.md`
- `.github/ISSUE_TEMPLATE/feature_request.md`

---

## 5. Governance Docs

### CODE_OF_CONDUCT.md

Contributor Covenant v2.1 (already referenced in CONTRIBUTING.md). Standard template with project contact info.

### SECURITY.md

```markdown
# Security Policy

## Reporting a Vulnerability

Please report security vulnerabilities via GitHub Security Advisories
(Settings → Security → Advisories → New draft advisory).

Do NOT use email — use GitHub's built-in security advisory feature.

Do NOT open a public issue for security vulnerabilities.

## Supported Versions

| Version | Supported |
|---------|-----------|
| main    | ✅        |
```

### docs/FORKING_GUIDE.md

Step-by-step guide for towns to fork and customize:

1. Fork the repository
2. Update branding in `packages/design-tokens/`
3. Configure environment variables
4. Deploy Supabase project
5. Deploy web app to Vercel
6. Build mobile app with EAS
7. Deploy governance contracts on Base

### Files to Create

- `CODE_OF_CONDUCT.md`
- `SECURITY.md`
- `docs/FORKING_GUIDE.md`

---

## 6. Updated CONTRIBUTING.md

Add these sections to the existing file:

- **Git Workflow** — trunk-based rules (when to branch, when to PR)
- **CI/CD** — what runs automatically and what the checks mean
- **Changesets** — how to create a changeset for notable changes
- **OTA Updates** — explain the preview → production update flow

### Files to Modify

- [CONTRIBUTING.md](../../../CONTRIBUTING.md)

---

## Summary of All Files

### New Files (13)
| File | Purpose |
|------|---------|
| `.github/workflows/ci.yml` | Lint, typecheck, build |
| `.github/workflows/eas-update.yml` | OTA update to preview channel |
| `.github/workflows/eas-build.yml` | Manual native builds |
| `.github/workflows/release.yml` | Changesets version + release |
| `.github/pull_request_template.md` | PR checklist |
| `.github/ISSUE_TEMPLATE/bug_report.md` | Bug report template |
| `.github/ISSUE_TEMPLATE/feature_request.md` | Feature request template |
| `.changeset/config.json` | Changesets configuration |
| `CODE_OF_CONDUCT.md` | Contributor Covenant v2.1 |
| `SECURITY.md` | Vulnerability reporting |
| `docs/FORKING_GUIDE.md` | Fork & customize guide |
| Root `.prettierrc` | Shared Prettier config |
| `apps/expo/.eslintrc.json` | Expo ESLint config (if missing) |

### Modified Files (2)
| File | Change |
|------|--------|
| `CONTRIBUTING.md` | Add git workflow, CI/CD, changesets, OTA sections |
| `package.json` | Add `prettier`, `@changesets/cli` to devDependencies |

---

## Verification Plan

1. **CI workflow**: Push a commit to `main` → verify GitHub Actions run lint, typecheck, build successfully
2. **EAS Update**: Verify `EXPO_TOKEN` secret is set → push to `main` → confirm OTA update published to preview channel
3. **Templates**: Create a test issue and PR → verify templates render correctly
4. **Prettier**: Run `npx prettier --check .` from root → verify it catches formatting issues across all apps
5. **Changesets**: Run `pnpm changeset` → verify it creates a changeset file → push → verify release workflow creates Version Packages PR
6. **Forking guide**: Follow the guide steps on a test fork to verify completeness
7. **Docs links**: Verify README link to `docs/FORKING_GUIDE.md` resolves correctly
