# Contributing to Roebel App

Thank you for your interest in contributing! This project is an open-source civic technology blueprint, and we welcome contributions from everyone.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/roebel.git`
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

- [ ] TypeScript strict mode passes
- [ ] ESLint passes (`pnpm lint`)
- [ ] Works on web (localhost:3000)
- [ ] Works on iOS simulator (if UI change)
- [ ] Works on Android emulator (if UI change)
- [ ] Matches Figma design (if UI change)
- [ ] No hardcoded API keys or secrets
- [ ] German strings used for user-facing text

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

## Code of Conduct

Be respectful, constructive, and inclusive. We follow the [Contributor Covenant](https://www.contributor-covenant.org/).

## License

By contributing, you agree that your contributions will be licensed under AGPL-3.0.
