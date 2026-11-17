# Task 7 report
Implemented settingsKind, identityModeFor safe rule for legacy-less records, MigrationSettings (canStart/canDetach), SovereignAccountSettings, thin chooser passkey.tsx, new hook useSettingsKind (shared by Settings row + chooser), copy changes (legacy-only "Bürgerkonto" notices), Task 1 alias removed.
Tests: jest lib/passkey -> 33 suites, 410 tests pass. Review Focus 5 covered by settings-kind.test.ts (connected record / passkey session on legacy identity -> 'migration' with migrationOpen false).
RED not run separately (tests and impl written together); GREEN as above.
eslint: only pre-existing react-hooks/set-state-in-effect errors (GuardiansSection:32, useGuardianManager:115), untouched lines.
grep isPasskeyPreviewAllowed: empty. No tsc run (per contract).
Concerns: extra file useSettingsKind.ts not in brief; MigrationSettings hides ANMELDUNG heading when nothing under it; Review-5 UI behaviour (hidden start/detach) is not component-tested.
