# Contributing to Roebel App

Thank you for your interest in contributing! This project is an open-source civic technology blueprint, and we welcome contributions from everyone.

## Git Workflow — Trunk-Based Development

We use **trunk-based development**: `main` is always deployable.

> **External contributors:** the "commit directly to `main`" rule below applies only to maintainers with write access. If you don't have write access, the flow is always **fork → branch → pull request** (see Getting Started).

- **Small changes** (single file, bug fix, docs): commit directly to `main`
- **Larger work** (new feature, multi-app changes, risky refactors): create a short-lived branch → open a PR → let CI pass → merge
- **Branch naming**: `feat/description`, `fix/description`, `docs/description`, `chore/description`
- **Delete branches** after merge — no long-lived branches

### When to Use a PR

- Changes span multiple apps (`apps/web` + `apps/expo`)
- Touching blockchain contracts or shared packages
- Anything you'd want CI to validate before it hits `main`
- When you want a clear record of what changed and why

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/Roebel-App.git`
3. Install dependencies: `pnpm install`
4. Create a feature branch: `git checkout -b feat/your-feature`
5. Make your changes
6. Push and open a Pull Request

## Development

```bash
pnpm dev:web    # Start Next.js web app
pnpm dev:expo   # Start Expo mobile app
pnpm lint       # Lint all packages
pnpm build      # Build all packages
```

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(web): add proposal voting page
fix(expo): resolve camera permission crash
docs: update deployment guide
chore(deps): upgrade Expo SDK to 55
style(tokens): update navy-500 to match Figma
refactor(blockchain): extract MACI voting hook
```

Scope should be one of: `web`, `expo`, `blockchain`, `contracts`, `config`, `tokens`, `docs`

## Pull Request Checklist

- [ ] No **new** TypeScript errors introduced (see note below)
- [ ] ESLint passes (`pnpm lint`)
- [ ] Works on web (localhost:3000)
- [ ] Works on iOS simulator (if UI change)
- [ ] Works on Android emulator (if UI change)
- [ ] Matches Figma design (if UI change)
- [ ] No hardcoded API keys or secrets
- [ ] German strings used for user-facing text (see Language below)

> **Note on TypeScript:** the repo currently has a known baseline of pre-existing type errors (an untyped Supabase client cascades through the apps). If `pnpm typecheck` shows errors in files you didn't touch, that's not you. The bar is: **don't add new errors in the code you change.** Burning down the baseline (e.g. generating Supabase types) is a very welcome contribution.

## Language

All user-facing UI text is **German first** — Röbel is a German town. If you don't speak German:

- Write your UI strings in English and say so in the PR description; a maintainer will translate before merge
- Code, comments, commit messages, issues, and PRs are all in **English**

## Code Style

- **TypeScript** everywhere (strict mode)
- **pnpm** as package manager (not npm/yarn)
- **Web styling**: Tailwind CSS utility classes
- **Mobile styling**: `StyleSheet.create()` + `useTheme()` hook (not NativeWind)
- Functional components only, explicit Props interfaces
- Import from shared packages using `@roebel/` aliases

## Reporting Issues

- Use GitHub Issues
- Include reproduction steps
- Label appropriately: `bug`, `feature`, `docs`, `good-first-issue`
- **Security vulnerabilities: do NOT open a public issue** — see [SECURITY.md](SECURITY.md)

## Questions

Not sure where to start, or want to discuss an idea before building it? Open a [GitHub Discussion](https://github.com/Roebel-Labs/Roebel-App/discussions). If you want to bring this stack to your own town, read the [Forking Guide](docs/FORKING_GUIDE.md) first.

## Code of Conduct

Be respectful, constructive, and inclusive. We follow the [Contributor Covenant](https://www.contributor-covenant.org/) — see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## CI/CD

Every push to `main` and every PR triggers automated checks:

- **Lint** — `pnpm lint` across all apps
- **Typecheck** — `pnpm typecheck` across all apps
- **Build** — `pnpm build` to verify nothing is broken

When changes to `apps/expo/` are merged to `main`, an OTA update is automatically published to the **preview** channel via EAS Update. Production updates (`pnpm update:production`) are done manually after testing.

Native builds (new SDK, new native modules) are triggered manually via GitHub Actions.

## Changesets

We use [Changesets](https://github.com/changesets/changesets) for version management. When making a notable change:

1. Run `pnpm changeset` and follow the prompts
2. Commit the generated changeset file with your PR
3. When merged, a "Version Packages" PR is auto-created with version bumps and changelog updates

## License

By contributing, you agree that your contributions will be licensed under AGPL-3.0.
