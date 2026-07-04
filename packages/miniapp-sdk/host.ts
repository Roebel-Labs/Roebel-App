// Physical re-export so `@netizen-labs/miniapp-sdk/host` resolves even when a bundler
// ignores the package.json "exports" map (e.g. Metro with package exports off).
// Bundlers that honor "exports" use ./src/host/index.ts via the map instead.
export * from './src/host/index';
