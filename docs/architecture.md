# Architecture

## Layers
- `src/core`: pure domain logic and pipeline orchestration.
- `src/ports`: integration interfaces.
- `src/adapters`: concrete implementations for GitHub, Slack, store, secrets.
- `src/ui`: React components and styles.
- `src-tauri`: native shell, tray integration, keychain and SQLite commands.

## Runtime adapters
- GitHub: REST notifications + PR/review fetch + connection test.
- Slack: `chat.postMessage` + `auth.test`.
- Store:
  - Desktop: SQLite via Tauri `invoke` commands.
  - Web fallback: localStorage.
- Secrets:
  - Desktop: macOS keychain via Tauri command.
  - Web fallback: localStorage.

## Data flow
1. UI triggers sync (`Sync Now` or background interval).
2. Pipeline fetches notifications from GitHub.
3. Rules apply suppression + focus filtering.
4. Kept notifications are sent to Slack DM.
5. Deliveries/suppressions and processed keys are persisted.
6. UI refreshes inbox logs and PR dashboards.

## Next architecture steps
- Add webhook relay ingress for event-driven updates.
- Move user settings from localStorage to SQLite.
- Add stronger scheduler controls and health telemetry.
