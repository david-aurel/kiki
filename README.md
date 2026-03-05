# Kiki

Kiki is a local-first macOS menu bar app for GitHub notification triage.
It ingests review requests and authored-PR activity, applies focus-mode suppression rules, and delivers actionable items to Slack DM.

## What Kiki Does
- Pulls **review requests** from GitHub notifications.
- Pulls **comments/reviews on PRs you authored** from GitHub GraphQL.
- Splits notifications into:
  - `Delivered` (would notify)
  - `Suppressed` (kept visible, not notified)
- Sends delivered items to Slack DM via bot.
- Shows operational dashboards for:
  - `Review Requests`
  - `My PRs`

## Focus Modes
- `All`: deliver everything (except hard-excluded actors).
- `Calm`: personal PR activity + review requests; suppress Copilot noise.
- `Focused`: personal PR activity only.
- `Zen`: suppress all notifications.

Additional rules:
- Team-only review requests are suppressed outside `All` (still shown in UI).
- Actors like `prosperity-bot` / `ps-bot` are excluded.

## Notification Semantics
Kiki distinguishes comment events from review events:
- `comment`: issue/PR comments and standalone review-thread comments.
- `review_approved` / `review_changes_requested` / `review_commented`: explicit review submissions.

Review-thread comments linked to a review are collapsed into one review notification.

## Stack
- Tauri 2 + React + TypeScript + Vite
- GitHub REST + GraphQL
- Slack Web API (`chat.postMessage`)
- Desktop persistence: SQLite + macOS keychain
- Web fallback persistence: localStorage

## Prerequisites
- macOS (menu bar + native behavior is macOS-first)
- Node.js 20+
- Rust toolchain (`rustup`, `cargo`)
- Xcode Command Line Tools

If Tauri build fails with Xcode license error:
```bash
sudo xcodebuild -license
sudo xcodebuild -runFirstLaunch
```

## Install
```bash
npm install
```

## Run
Web-only shell:
```bash
npm run dev
```

Desktop app (recommended):
```bash
npm run tauri:dev
```

## Build
Frontend build:
```bash
npm run build
```

Desktop bundle build:
```bash
npm run tauri:build
```

## Quality Checks
```bash
npm run typecheck
npm run lint
npm run test -- --run
```

## Setup (First Run)
1. Open **Settings**.
2. Set token refs (defaults are fine unless you want custom names).
3. Paste secrets:
   - GitHub token
   - Slack bot token
4. Set Slack user ID (`U...`) as DM destination.
5. Optional: add team handles (`org/team`, one per line).
6. Click **Save**.
7. Use **Test GitHub** and **Test Slack**.
8. Click **Sync**.

## Debug Workflow
Open **Debug** from the top bar.

The debug modal provides:
- Notification table with classification and delivery decision.
- API probe snapshots for notification endpoint sanity checks.
- Slack test event buttons:
  - Review Request
  - Comment
  - Review Approved
  - Review Changes Requested
  - Review Commented

## Background Behavior
- Closing the window hides it; app keeps running in menu bar.
- Use **Quit** to fully terminate.
- Dock visibility is dynamic (visible when app window is active).

## Data & Dedupe
- Delivery dedupe key is stable by notification id (`userId:notificationId`).
- Goal: prevent repeated Slack sends of the same notification.
- Notifications and PR panels refresh on sync; background sync keeps views current.

## GitHub Activity Window
Authored PR activity includes `OPEN`, `MERGED`, and `CLOSED` PRs.
For non-open PRs, activity is included only if the PR was merged/closed in the last 48 hours.

## Current Project Layout
```text
src/
  adapters/
  core/
  lib/
  ports/
  test/
  ui/
src-tauri/
  src/
PLAN.md
README.md
```
