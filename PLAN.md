# Kiki Plan (Consolidated)

## Mission
Build and maintain **Kiki** as a local-first macOS menu bar app that:
- ingests GitHub review requests and authored-PR activity,
- applies focus-mode suppression rules,
- delivers actionable items to Slack DM,
- provides fast triage views for `Review Requests`, `My PRs`, `Delivered`, and `Suppressed` notifications.

## Current Scope (v1)
### In
- Single-user local app (Tauri + React + TypeScript).
- GitHub ingestion:
  - REST `/notifications` for review requests.
  - GraphQL for comments/reviews on authored PRs.
- Slack DM delivery via bot token.
- Focus modes: `all`, `calm`, `focused`, `zen`.
- PR dashboards:
  - `My PRs`
  - `Review Requests` (direct + team)
- Native menu-bar behavior (window hide-to-tray, explicit Quit).
- Debug tooling:
  - notification table with decisions,
  - API probe,
  - Slack test event sender.

### Out
- Slack or Outlook ingestion.
- Central multi-user backend.
- Cross-device sync.

## Architecture (Current)
- Shell: Tauri 2 (`src-tauri`).
- UI: React + Vite (`src`).
- Core logic: `src/core`.
- Adapters:
  - GitHub API: `src/adapters/github`
  - Slack API: `src/adapters/slack`
  - Secrets (keychain): `src/adapters/secrets`
  - Store (SQLite / local fallback): `src/adapters/store`
- Persistence:
  - Desktop: SQLite + Keychain.
  - Web fallback: localStorage.

## Behavior Contracts (Current)
### Notification semantics
- `comment`: PR conversation comments + standalone review-thread comments.
- `review_*`: explicit `PullRequestReview` submissions only (`approved`, `changes_requested`, `commented`).
- Review-thread comments linked to a review collapse into a single review notification.

### Focus mode routing
- `all`: deliver all non-excluded notifications.
- `calm`: deliver personal PR activity + review requests; suppress Copilot noise.
- `focused`: deliver personal PR activity only.
- `zen`: suppress all.
- Team-only review requests are shown, but suppressed outside `all`.

### Dedupe
- Delivery dedupe key: `userId:notificationId`.
- Goal: never deliver the same notification twice to Slack.

### Recently closed PR activity
- Authored PR activity includes `OPEN`, `MERGED`, `CLOSED`.
- Non-open PRs are included only when merged/closed within the last 48h.

## Open Risks / Next Priorities
1. Keep API volume low without re-introducing stale-cache behavior.
2. Continue validating focus-mode suppression against real-world inbox traffic.
3. Harden review-request actor attribution across edge payloads.
4. Add compact debug counters for quick field validation (deliver/suppress/skip by mode).

---

## Pass Summary (1-58)

### Pass 1
1. Initial dashboard direction finalized: top bar focus controls, settings via cog, two PR sections + right notification section, collapsible sections, clickable rows/cards.

### Passes 2-18 (UI layout, responsiveness, icon system)
2. Collapse controls/scroll behavior refined; section-only scrolling and flatter background.
3. Fluid collapse/reflow behavior improved; denser PR table; avatar/tooltips.
4. Sticky headers, aligned state/CI dots, normalized focus chips and labels.
5. Mobile-first responsive structure and mobile tabbed navigation introduced.
6. Settings z-index/light hierarchy fixes; richer notification card fields.
7. Delivered vs Suppressed split introduced (desktop columns + mobile tabs).
8. Focus transition overlay and early icon exploration added.
9. External-link regression fixed; icon drafts removed pending official source.
10. First brand SVG/icon set drafted from inspiration.
11. Switched to official icon source; previous drafts reverted.
12. Official reveal animation rebuilt with source path fidelity.
13. Single SVG with variable-driven state/theme/focus animation behavior.
14. In-place animated header icon integration; system-theme wiring; tray-state bridge.
15. Tray icon placeholder/red-square issue fixed; transparent icon handling improved.
16. Icon color/XOR logic normalized for calm/focused/zen/all mappings.
17. Header icon enlarged; tray assets split by focus state.
18. Tray assets split by light/dark themes and selected by `(theme, focus)`.

### Passes 19-35 (UI polish, native lifecycle, icon packaging)
19. Tray assets regenerated from current SVG; relative notification timestamps added.
20. Focus tooltip regression fixed; diff formatting tightened.
21. Light-mode regressions fixed across controls/cards/forms/mobile tabs.
22. Settings overlay click-outside close fixed; close button added.
23. Review requests split into direct-first/team-second with team rows muted.
24. Review request origin classification moved to authoritative PR fields.
25. Notifications fetch widened (pagination + scope merge) for missing events.
26. Estimate parser aligned to agreed markers (`⚡️`, `🐬`, `🐝`).
27. Conflicting estimate markers resolve to unknown; UI shows emoji-only known states.
28. Close-window now hides app; explicit Quit button added.
29. Dynamic Dock policy: show dock when window visible, hide when tray-only.
30. Startup dock visibility corrected when window opens visible.
31. Bundle icon source updated to avoid default exec icon.
32. Proper `.icns` generation and runtime icon fallback added.
33. Dock icon corruption fixed by regenerating from official raster source.
34. Dock icon visual refinement to avoid nested-icon look.
35. Desktop grid collapse fixed when both right panels are collapsed.

### Passes 36-44 (debug tooling and fetch reliability)
36. Debug modal introduced with full notification decision visibility.
37. API probe added to separate endpoint freshness vs app logic issues.
38. Main inbox ingestion switched to `all=true` behavior.
39. Refresh flow moved to `Promise.allSettled` for partial-success resiliency.
40. No-cache fetch hardening + native GitHub GET command + resilient enrichment path.
41. Tauri network commands moved to async reqwest with timeouts to prevent hangs.
42. Notification model enriched with categories + `occurredAt`; improved review mapping.
43. Mention/comment corrections, thread lookup fallback, assignment review-outcome mapping.
44. Pipeline hardened so one Slack failure does not abort sync; failed counter added.

### Passes 45-58 (source architecture, semantics, suppression, dedupe)
45. Ingestion architecture switched:
   - REST only for review requests,
   - GraphQL for authored PR comments/reviews.
46. Team-only review requests suppressed outside `all`; direct requests preserved.
47. GraphQL review-thread comments ingestion added.
48. GraphQL core/thread query split with pagination fallbacks; merged PRs included.
49. Tauri GraphQL envelope unwrapping bug fixed.
50. `prosperity-bot`/`ps-bot` excluded; Copilot suppression matching expanded.
51. One-review-one-notification dedupe policy enforced.
52. Runtime rate-limit cache/backoff added (later reworked).
53. Review-comment preview improved using thread comment text when needed.
54. UI review/comment labels clarified (intermediate refinement).
55. Official docs-aligned comment vs review semantics locked in.
56. Fetch/caching simplified to fresh loads for notifications/debug/PRs; legacy enrichment removed; Slack debug event sender added.
57. Recently closed PR (48h) support, stable dedupe key, focus refresh on mode switch, full background refresh restored, stale-section clearing on failures.
58. Slack actor attribution fixed (`actorLogin` propagation + formatter fallback).

---

## Operational Checklist (Current)
- [x] Fresh notification sync path (no stale cache layer in runtime loaders)
- [x] Focus-mode delivery/suppression decisions persisted and visible
- [x] Slack dedupe by stable notification id
- [x] Review request actor attribution in Slack
- [x] Debug panel with API probe and Slack test event buttons
- [x] Menu bar lifecycle: hide on close, explicit quit

## Documentation Sync Rule
Whenever behavior changes in notifications, focus routing, Slack delivery, or native lifecycle:
1. Update `README.md` first (user-facing contract).
2. Update this `PLAN.md` pass summary with one-line outcome.
3. Add/adjust tests before closing the pass.
