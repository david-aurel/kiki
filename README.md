# Kiki

Kiki is a local-first macOS menu bar app (Tauri + React) for GitHub notification triage and Slack DM delivery.

## Current status
- Tauri + React + TypeScript app scaffolded and runnable.
- Focus modes implemented (`All`, `Personal PRs`, `Review Requests`, `Custom`).
- Notification pipeline implemented:
  - GitHub notifications fetch
  - Copilot suppression (latest comment actor)
  - reason suppression + focus filtering
  - Slack DM delivery
  - dedupe and logs
- PR dashboards implemented from real GitHub API data:
  - `My PRs`
  - `Review Requests` (direct + team handles)
  - CI rollup, review summary, diff size, age/SLA, estimate parsing
- Native Tauri commands:
  - Keychain secret storage (`secret_get`, `secret_set`)
  - SQLite-backed log storage (`db_*` commands)
- Tray behavior implemented (open/quit).
- Test suite present for core logic.

## Prerequisites
- Node.js 20+
- Rust toolchain (`rustup`, `cargo`)
- macOS for desktop runtime features

## Install
```bash
npm install
```

## Run (web shell)
```bash
npm run dev
```

## Run (desktop app)
```bash
npm run tauri:dev
```

## Quality checks
```bash
npm run lint
npm run test
npm run typecheck
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
```

## Initial setup in app
1. Open `Settings`.
2. Set token refs (defaults are fine).
3. Paste GitHub PAT and Slack bot token.
4. Set Slack user ID (`U...`) and optional team handles (`org/team`, one per line).
5. Click `Save`.
6. Run `Test GitHub`, `Test Slack`, then `Sync Now`.

## Notes
- In desktop mode, logs/dedupe persist in SQLite via Tauri commands.
- In web-only mode (`npm run dev`), adapters fall back to browser local storage.
- Webhook relay path is still planned; current flow uses API sync and background refresh.
