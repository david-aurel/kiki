# Kiki Build Plan (Agent Execution Spec)

## 0. Mission
Build **Kiki** as a **local-first macOS menu bar app** that ingests GitHub notifications, filters noise, sends actionable items to Slack DM via bot, and gives fast overview panels for:
- My open PRs
- Pending review requests (direct + team)

This document is the source of truth for AI agents to execute build work start-to-finish.

---

## 1. Product Scope (Locked)
### In scope (v1)
- Single-user local app running on macOS.
- Menu bar app UI (always accessible).
- GitHub ingestion:
  - Webhook-first event ingestion for PR/review activity when webhook relay is configured.
  - Low-frequency notifications polling fallback for user-inbox completeness.
  - PR metadata for authored PRs and review queue.
- Slack delivery:
  - Send individual messages to user DM.
- Filtering:
  - Suppress Copilot bot review/comment noise.
  - Suppress configurable low-signal GitHub reasons.
- Views:
  - Inbox log (delivered/suppressed/errors)
  - My PRs
  - Review Requests (direct + team)
  - Focus control (quick toggle in top bar + menu bar)
  - Rules
  - Settings
- Estimate parsing in PR description using placeholder emoji/text mapping.

### Out of scope (v1)
- Slack ingestion as an event source.
- Outlook integration.
- Multi-user centralized backend.
- Cloud sync.
- Cross-device state sharing.
- Full zero-poll architecture for all GitHub notification types.

---

## 2. Architecture (Locked)
### Stack
- Desktop shell: **Tauri 2**
- Frontend: **React + TypeScript + Vite**
- Local database: **SQLite**
- Secret storage: **macOS Keychain** (via Tauri plugin/native bridge)
- Scheduling: local timers/background loop in app runtime

### Architectural principles
- Keep business logic portable to future web backend.
- No backend service required in v1.
- Strict separation:
  1. `core` (domain logic, pure TS)
  2. `ports` (interfaces)
  3. `adapters` (Tauri/macOS/GitHub/Slack implementations)
  4. `ui` (React presentation)

---

## 3. Domain Model
### Entities
- `UserProfile`
  - `id`, `display_name`, `created_at`
- `GitHubConnection`
  - `user_id`, `auth_mode` (`pat`), `token_ref`, `created_at`, `updated_at`
- `SlackConnection`
  - `user_id`, `bot_token_ref`, `slack_user_id`, `workspace_id?`, `created_at`
- `RuleConfig`
  - `suppress_copilot` (bool)
  - `suppressed_reasons` (string[])
  - `estimate_patterns` (json)
  - `team_handles` (string[] like `org/team`)
- `NotificationEvent`
  - normalized GitHub notification snapshot
- `SuppressionEvent`
  - reason, timestamp, source notification key
- `DeliveryEvent`
  - destination, status, attempt_count, error
- `PullRequestSnapshot`
  - repo, number, title, state, draft, url, author, created_at, updated_at
  - diff stats (`additions`, `deletions`, `changed_files`)
  - ci rollup (`failing|pending|passing|none`)
  - review summary
  - estimate (`raw`, `normalized`)
- `ReviewQueueSnapshot`
  - PR fields + request origin (direct/team), requested_at if available

### Idempotency keys
- Notification dedupe key: `github_notification_id + updated_at`
- Delivery dedupe key: `user_id + notification_dedupe_key + destination`

---

## 4. Integrations
### GitHub
#### APIs used
- Webhooks for PR/review/comment events (`pull_request`, `pull_request_review`, `pull_request_review_comment`, `issue_comment`).
- REST `/notifications` for inbox fallback sync and missed-event recovery.
- GraphQL for PR dashboard and review queue aggregation.
- Optional REST lookups for edge enrichment.

#### Ingestion strategy (locked)
- Prefer event-driven updates from webhook payloads when available.
- Keep polling as a safety net because GitHub does not provide a single personal notification-inbox webhook feed.
- Polling must be efficient: use `Last-Modified`/`ETag` and process only deltas.

#### Required token scopes (initial PAT mode)
- Minimal scopes needed to read notifications, pull requests, and checks metadata for accessible repos.
- Agents must document exact scopes in setup doc once tested.

### Slack
#### API used
- `chat.postMessage` to DM target user.

#### Delivery mode
- Single message per kept notification.
- No batching in v1.

---

## 5. Filtering & Classification Rules
### Rule set v1
1. If `suppress_copilot = true` and latest comment/review actor is `github-copilot[bot]`, suppress.
2. If notification reason in `suppressed_reasons`, suppress.
3. Otherwise deliver.

### Estimate parser v1 (placeholder)
Parse PR description for example markers (replace later with real team convention):
- `ETA: :rotating_light: immediate`
- `ETA: :hourglass_flowing_sand: half-day`
- `ETA: :calendar: 1-2d`

Normalize to:
- `immediate`
- `half_day`
- `one_two_days`
- `unknown`

---

## 6. UI/UX Spec
### Visual direction
- Dense but calm and minimal. This is a productivity control console, not a consumer app.
- Visual references: GitButler screenshots in `inspiration/gitbutler_dark.jpg` and `inspiration/gitbutler_light.jpg`.
- Global feel:
  - low visual noise
  - clear hierarchy through panel grouping
  - sparse, meaningful color usage
  - compact data-first layout with clean alignment
- Tone:
  - serious and neat, no playful theme skin
  - very small Kiki nods only (icon glyph/copy micro-hints)
- Typography:
  - use native mac stack (`SF Pro Text`, `SF Pro Display`, fallbacks)
  - compact table typography and tight vertical rhythm
- Surfaces:
  - subtle gradients and layered neutrals
  - thin low-contrast borders
  - rounded corners, no heavy shadows
- Motion:
  - gentle transitions on state change (150-220ms), no decorative animation
- Accessibility:
  - keyboard-first navigation
  - high contrast mode switch
  - explicit focus rings on all actionable controls

### Layout and navigation
- Menu bar click opens a structured popover for quick triage.
- Popover sections:
  - Focus toggle and unread counters at top.
  - Two quick lists: `My PRs` and `Review Requests`.
  - Actions: `Open Full App`, `Pause`, `Sync Now`.
- Full window app uses a 3-zone structure:
  - left nav rail (sections)
  - central data table/list
  - right context panel (details/actions)

### Information architecture
- `Inbox`
  - feed of delivered/suppressed/error events
- `My PRs`
  - sortable table/list with state, CI, reviews, age, diff, estimate
- `Review Requests`
  - includes direct + team requests, sorted oldest first
- `Focus`
  - one-click mode toggle available from menu bar and full app header
  - presets:
    - `All`
    - `Personal PRs Only`
    - `Review Requests Only`
    - `Custom`
- `Rules`
  - Copilot toggle, suppressed reasons, estimate parser preview
  - per-focus-mode behavior editor
- `Settings`
  - GitHub token, Slack bot token, Slack user ID, team handles
  - webhook relay configuration
  - polling intervals and health indicators

### Focus modes and routing behavior (locked)
- `All`
  - deliver all non-suppressed notifications.
- `Personal PRs Only`
  - deliver notifications tied to PRs authored by current user.
- `Review Requests Only`
  - deliver only review-request signals (direct + team).
- `Custom`
  - user-configurable switches:
    - include personal PR activity
    - include review requests on external PRs
    - include direct mentions
    - include CI state changes
  - include/exclude repository allowlist patterns.

### SLA coloring (locked)
- `0-3h`: excellent (strong positive)
- `>3-6h`: very good (soft positive)
- `>6-24h`: acceptable/good (neutral-positive)
- `>24-48h`: degrading (warning)
- `>48h`: critical stale (high warning)
- Apply coloring to age badges and queue rows, not to full page background.

### CI rollup (locked)
- Any failing check => `failing`
- Else any pending => `pending`
- Else any passing and no failures => `passing`
- Else `none`

---

## 7. Scheduling & Sync
### Poll loops
- Notifications poll interval default: `180s` (fallback safety sync)
- PR snapshot refresh default: `180s`
- Manual refresh action available in UI.
- Webhook events update local state immediately when available.

### Retry behavior
- Transient API failures: retry with bounded backoff (max 3 attempts).
- Permanent auth errors: mark integration unhealthy and surface in Settings + Inbox error log.

---

## 8. Security & Privacy
- Secrets never stored plaintext in SQLite once keychain adapter is enabled.
- UI/API never expose secret values after save.
- Logs must redact tokens and sensitive headers.
- Local-only data by default.

---

## 9. Project Structure (Target)
```
kiki/
  src/
    core/
      models/
      rules/
      services/
    ports/
      github.ts
      slack.ts
      secrets.ts
      store.ts
      scheduler.ts
    adapters/
      github/
      slack/
      sqlite/
      keychain/
      tauri/
    ui/
      routes/
      components/
      styles/
  src-tauri/
    capabilities/
    src/
      main.rs
      tray.rs
      commands.rs
  docs/
    setup.md
    architecture.md
    runbook.md
```

---

## 10. Execution Milestones (Agent Checklist)
### M0 - Scaffold & Foundations
- [ ] Scaffold Tauri 2 + React + TS project.
- [ ] Set up routing and base UI shell with menu bar access.
- [ ] Add SQLite layer and migration setup.
- [ ] Add keychain secret adapter.
- [ ] Add typed config and diagnostics screen.

### M1 - Integrations Core
- [ ] Implement GitHub notifications ingestion service.
- [ ] Implement Slack DM delivery service.
- [ ] Implement dedupe + delivery/suppression logs.
- [ ] Implement webhook event ingest path (with relay option) and polling fallback scheduler.
- [ ] Implement manual sync trigger.

### M2 - PR Intelligence Views
- [ ] Implement My PRs aggregation (GraphQL-first).
- [ ] Implement Review Requests aggregation (direct + team).
- [ ] Implement CI rollup, review summary, diff stats.
- [ ] Implement estimate parser and badges.

### M3 - Rules + UX Hardening
- [ ] Rules page with suppression controls.
- [ ] Error surfacing and integration health states.
- [ ] Empty/loading/error UI states for all views.
- [ ] Accessibility and keyboard navigation pass.

### M4 - Packaging & Team Onboarding
- [ ] Build signed macOS artifact (as feasible).
- [ ] Write setup guide for teammates (tokens, Slack user ID, scopes).
- [ ] Add troubleshooting runbook.

---

## 11. Acceptance Criteria (v1)
1. User can configure GitHub PAT + Slack bot token + Slack user ID locally.
2. App ingests GitHub updates via webhook path when available, with polling fallback for completeness.
3. App sends only non-suppressed notifications to Slack DM.
4. Copilot suppression works for latest-comment/review bot events.
5. My PRs screen accurately shows state, CI, reviews, age, diff, estimate.
6. Review Requests includes direct and configured team requests, oldest first.
7. Focus mode toggle is accessible from menu bar and full app header and changes delivery behavior immediately.
8. App remains usable from menu bar without separate backend.

---

## 12. Risks & Mitigations
- GitHub API variability across repos/permissions.
  - Mitigation: robust partial-data handling + explicit status flags.
- Webhook relay setup friction for local app.
  - Mitigation: fallback polling path always available and easy to enable.
- Slack token/scope confusion.
  - Mitigation: setup wizard validation + test message action.
- Background polling impact.
  - Mitigation: adjustable intervals, backoff, pause-on-error.
- Future migration to web backend.
  - Mitigation: maintain strict core/ports/adapters boundaries.

---

## 13. Immediate Next Planning Tasks
- [ ] Finalize exact GitHub PAT scopes after endpoint test matrix.
- [ ] Replace placeholder estimate parser mapping with real team convention.
- [ ] Finalize onboarding flow UX (single-page wizard vs settings-first).
- [ ] Define webhook relay default (none/smee/ngrok) and document one-click local setup.

---

## 14. Testing Strategy (Agent Autonomy)
### Test layers
- Unit tests (fast, pure logic):
  - rules engine (suppression/focus mode routing)
  - estimate parser
  - CI rollup classifier
  - SLA bucket classifier
  - dedupe key generation
- Integration tests (adapter boundaries):
  - GitHub adapter with fixture payloads
  - Slack adapter with mocked `chat.postMessage`
  - SQLite repository reads/writes/migrations
  - keychain adapter behavior via test double
- End-to-end tests (UI + workflow):
  - settings save and validation
  - manual sync flow
  - focus toggle effect on notification routing
  - My PRs and Review Requests table rendering with seeded DB

### Tooling
- Test runner: `vitest`
- Component tests: `@testing-library/react`
- E2E: `playwright`
- Contract fixtures:
  - store canonical GitHub webhook and notification JSON fixtures in repo
  - store Slack API response fixtures in repo

### Commands agents must keep green
- `npm run test`
- `npm run test:integration`
- `npm run test:e2e`
- `npm run lint`
- `npm run typecheck`

### CI gate policy
- No feature PR is complete unless unit and integration tests pass.
- PRs touching routing/focus logic must include at least one new test.
- Bugs found in production-like runs require a failing regression test before fix merge.

---

## 15. UI Decision Log
### 2026-02-15 Session
- Decision: settings are not always visible in layout.
  - Updated UI to open settings from a top-right cog icon in a drawer overlay.
- Decision: remove left navigation rail from primary layout.
  - Replaced with slim top bar:
    - left: `Kiki` title
    - center: focus mode chips
    - right: pause/sync/settings actions
- Decision: show both core PR boards at the same time.
  - `Review Requests` in top middle section.
  - `My PRs` in bottom middle section.
- Decision: repurpose right panel for recent notifications.
  - Notifications are low-noise cards and clickable.
  - Click target behavior:
    - comment notifications resolve to comment URL when available
    - review request notifications resolve to PR URL
    - fallback to resolved subject URL.
- Decision: sections are collapsible.
  - Added collapse controls per section.
  - Collapse style is horizontal into thin vertical slices.
- Finding: always-visible settings distracted from primary operational workflow.
  - Mitigation: move settings behind cog and keep main dashboard focused on triage.
- Decision: PR title is clickable, URL text is not shown.
  - Row now shows title link + muted `repo#number` metadata only.
- Decision: author column shows `Me` when PR author matches connected GitHub user.
- Decision: diff stats are color-coded.
  - additions green, deletions red, file count muted.
- Finding: CI rollup showed too many `pending` states with status-only API.
  - Mitigation: CI rollup now combines:
    - commit combined status
    - check-runs API conclusions/statuses.
- Decision: focus behavior should be configurable in settings.
  - Added custom focus controls in settings:
    - include personal PR activity
    - include external review requests
    - include direct mentions
    - include CI changes
    - include/exclude repo lists.

### 2026-02-15 Session (Second Pass)
- Finding: collapse controls clipped icon visuals and felt too prominent.
  - Decision: use lower-prominence, smaller collapse controls inspired by reference tool styling.
  - Decision: increase settings cog size/contrast for discoverability.
- Finding: background gradient/pattern created scroll repaint artifacts.
  - Decision: switch to flat background color in primary workspace.
- Finding: whole-page scrolling made layout unstable.
  - Decision: lock overall layout height and allow scrolling only inside section bodies.
- Decision: remove `Custom` chip from top focus bar.
  - Rationale: focus customization belongs in settings.
  - Top bar focus presets remain: `All`, `Personal PRs`, `Review Requests`.
- Decision: use more intuitive age formatting.
  - Rules:
    - <24h => `Nh`
    - >=24h and <7d => `Xd Yh` (or `Xd`)
    - >=7d => `N.Nw` then `Nw` for larger values.
- Decision: replace author text with avatar in table rows.
  - Author name is surfaced via hover tooltip.
  - If avatar unavailable, show initial placeholder.
  - Preserve `Me` label semantics in tooltip when author matches connected account.
- Decision: state and CI become icon-first columns.
  - State uses compact symbol icon with tooltip.
  - CI uses traffic-light circles:
    - green passing
    - yellow pending
    - red failing
    - muted gray none
  - CI indicator links to available checks/status URL.
- Decision: remove `Requested By` column from review requests table.
  - Rationale: author context is sufficient and removes noise.
- Decision: collapse direction depends on section orientation.
  - Middle stacked sections (`Review Requests`, `My PRs`) collapse to horizontal slices.
  - Right-side notifications section collapses to vertical slice.
- Decision: collapsed state must preserve section identity.
  - Keep readable title label in collapsed slices.
  - For vertical slice, rotate using vertical writing mode.

### 2026-02-15 Session (Third Pass)
- Finding: right-panel collapsed notifications presented icon/text with poor hierarchy.
  - Decision: in collapsed notifications state, keep collapse icon at top and place rotated title directly under it with consistent top padding.
- Finding: middle stacked sections did not reflow when collapsed.
  - Decision: switch stacked layout from fixed grid fractions to fluid flex sizing.
  - Behavior:
    - collapsed middle card compresses to header-height slice
    - sibling card expands to consume freed space
    - if both collapsed, both remain compact at top.
- Finding: PR table row density and noise remained high.
  - Decisions:
    - remove repo/owner/number metadata from title cell display
    - truncate long titles to one line with ellipsis
    - force diff column to single-line (`nowrap`).
- Finding: avatar hover label was not reliably visible.
  - Decision: add explicit custom tooltip on author avatar hover.
- Decision: review column uses grouped semantic states instead of plain text.
  - Group by review state (`approved`, `changes_requested`, `commented`).
  - Render compact icon plus reviewer avatar stack for each group.
  - Empty review set renders as empty cell (no `No reviews` text).
- Decision: keep requested-by data in model for possible future use, but hide column in table UI.
- Decision: maintain section-only scrolling and flat background from prior pass.
- Decision: add first-pass Kiki logo mark in header and make tray label visible.
  - Added minimal vector mark in top bar.
  - Added tray title `Kiki` for clear menu bar presence even before final icon set.

### 2026-02-15 Session (Third Pass, Follow-up)
- Decision: reviews column uses emoji-first grouped pills for readability.
  - Approved group: green pill + `✅`.
  - Commented group: neutral/white pill + `💬`.
  - Blocking group: red pill + `🛑`.
  - Each pill contains compact reviewer avatar stack and optional overflow count.
- Decision: make title column narrower and more aggressively truncated.
  - One-line ellipsis for PR title to free space for operational columns.
- Decision: hide author column in `My PRs` section.
  - Keep author avatars in `Review Requests` only.
- Finding: middle-section collapse still felt non-fluid.
  - Decision: enforce per-section flex basis inline (`collapsed => fixed header height`, else `flex: 1`) so sibling section expands immediately.
- Decision: keep notification collapse hierarchy explicit.
  - Right collapsed rail now places collapse icon first, then rotated title beneath.
- Decision: start icon process with v1 mark.
  - Refined in-app Kiki mark (minimal broom+parcel motif).
  - Continue with multi-size app/tray icon export in next icon-focused pass.

### 2026-02-15 Session (Fourth Pass)
- Decision: PR table headers are sticky within scrollable section bodies.
  - Column labels remain visible while scrolling long lists.
- Decision: state and CI indicators use aligned equal-size circle marks.
  - Removed oversized draft glyph and replaced with solid light-gray state dot.
- Decision: tighten diff rendering to a single compact token (`+A/-D`) style with no spaced slash.
- Decision: normalize notifications section header ordering.
  - Expanded: title left, collapse control right (matches other sections).
  - Collapsed: control top, rotated title beneath.
- Decision: collapsed vertical title orientation changed for top-to-bottom reading.
  - Implemented vertical writing without reverse rotation.
- Decision: collapse control alignment made deterministic in all states.
  - Fixed control placement shift by forcing fixed-size grid-centered button.
- Decision: top focus controls now explicitly labelled as focus mode.
  - Added `Focus mode` label before chips for discoverability.
- Decision: hard-code operational focus presets in top bar.
  - `All`: everything delivered.
  - `Calm`: personal PR activity + review requests, suppress Copilot review comments.
  - `Focused`: personal PR activity only; suppress review requests and Copilot review comments.
  - `Zen`: suppress all notifications.
  - Added hover tooltips explaining each preset.
- Decision: `My PRs` hides author column to reduce redundant data.
- Decision: apply no-dock menu bar behavior on macOS.
  - Set activation policy to `Accessory` in app setup so app can run primarily as tray/menu bar utility.
- Finding: legacy stored focus-mode values (`personal_prs_only`, `review_requests_only`, `custom`) can exist in local settings.
  - Mitigation: migration mapping in settings loader to valid new modes.

### 2026-02-15 Session (Fifth Pass)
- Decision: adopt mobile-first responsive architecture in CSS.
  - Base styles now target mobile layout.
  - Desktop multi-panel workspace is enabled via `@media (min-width: 1100px)`.
- Decision: mobile uses bottom tab bar navigation instead of multi-panel layout.
  - Tabs: `Review`, `My PRs`, `Recent`.
  - Only one section view is active at a time.
  - Rationale: fluid 3-panel collapse interaction is not useful on small screens.
- Decision: title bar is responsive.
  - Focus chips become horizontally scrollable on small screens.
  - Action controls remain accessible in top bar.
- Decision: unify tooltip style.
  - Focus mode descriptions now use the same custom tooltip system style as avatar hover labels.
- Decision: menu bar app should be dockless on macOS.
  - Activation policy set to `Accessory` in app setup.
  - App runs as tray/menu bar utility without persistent Dock icon.
- Clarification: tray currently uses text title (`Kiki`) as placeholder.
  - Final tray icon asset replacement is queued for next icon-focused pass.

### 2026-02-15 Session (Sixth Pass)
- Finding: settings drawer rendered behind sticky table headers in some states.
  - Decision: raise settings overlay stacking order (`z-index`) above table headers.
- Decision: unify link styling across tables and notifications.
  - Links now use normal text color with underline-on-hover only.
- Decision: recent notifications should show all incoming items regardless of current focus mode.
  - Delivered vs muted is represented visually in list items.
  - Muted items are de-emphasized with reduced opacity and `🔕` indicator.
- Decision: recent notifications information hierarchy is simplified to reduce noise.
  - Removed repo/owner text from prominent row display.
  - Emphasis order:
    1. category (`Review`/`Comment`/`Update`)
    2. title
    3. actor (avatar + hover name)
    4. preview text snippet.
- Decision: enrich notification model for UI clarity.
  - Added actor login/avatar, category, preview text, delivered flag, and decision reason fields.
  - Comment notifications use latest-comment data for actor + snippet.
  - Target URLs resolve to best deep link (comment > PR/issue).

### 2026-02-15 Session (Seventh Pass)
- Decision: split recent notifications into two explicit streams.
  - `Delivered` section: notifications that passed active focus-mode routing.
  - `Suppressed` section: notifications blocked by focus/rules.
  - Desktop layout now renders both as side-by-side right-rail vertical sections.
  - Mobile layout now provides dedicated tabs for both streams.
- Decision: remove bell/mute icon dependency for suppression signaling.
  - Suppressed cards are de-emphasized through muted styling only.
- Decision: notification cards use row/card highlight instead of text underline affordance.
  - Entire card remains clickable.
  - Hover/focus changes card background tone; text remains non-underlined.
- Decision: PR list interaction is row-first, not link-first.
  - Entire table row is clickable with keyboard support.
  - Row hover/focus highlighting indicates click target.
  - CI indicator is no longer a direct link; row click is the only navigation affordance.
- Decision: tighten PR table visual density for operational columns.
  - More aggressive title truncation to allocate space for state/CI/diff/reviews.

### 2026-02-15 Session (Eighth Pass)
- Decision: introduce a focus-mode transition overlay animation (1.5s).
  - Full-screen, non-interactive overlay with compact center card.
  - SVG motif: broom + parcel arcs toward bell; mute slash appears for non-`All` modes.
  - Copy updates per mode (`All`, `Calm`, `Focused`, `Zen`) for immediate clarity.
  - Behavior is intentionally subtle and brief to avoid disrupting workflow.
- Decision: expand Kiki visual language through restrained references.
  - Keep productivity-first UI unchanged; add Kiki nods only in brand moments (icon mark + mode transition).
- Decision: create icon exploration set and expose in app for review.
  - Added `Icon Drafts` gallery in settings for quick comparison.
  - Draft directions:
    - `Courier` (broom + parcel, geometric)
    - `Mute Bell` (notification-first)
    - `Moon Parcel` (calmer thematic nod)
- Decision: export standalone SVG draft assets for future tray/app packaging.
  - Files:
    - `assets/icons/kiki-courier.svg`
    - `assets/icons/kiki-mute-bell.svg`
    - `assets/icons/kiki-moon-parcel.svg`

### 2026-02-15 Session (Ninth Pass)
- Finding: external links regressed in Tauri after row/card-level navigation moved to `window.open`.
  - Decision: route all outbound navigation through a Tauri command (`open_external_url`) with web fallback.
  - Applied to both PR rows and recent notification cards.
- Decision: remove temporary icon draft exploration from product UI.
  - Removed in-settings icon gallery and deleted draft asset files.
  - Awaiting user-provided final icon set before packaging integration.
- Decision: simplify recent-notification card semantics to avoid duplicate signals.
  - Review-request cards now show only:
    - review pill
    - actor avatar
    - PR title
  - Comment cards now show:
    - comment pill
    - actor avatar
    - comment snippet (primary)
    - PR title in muted secondary line
  - Cards made slimmer for lower visual weight.

### 2026-02-15 Session (Tenth Pass)
- Decision: produce standalone brand SVG asset pack from new inspiration references.
  - Light/dark icon variants created (rounded-square app icon + glyph-only icon).
  - Assets are intentionally not wired into app/tray yet pending user review.
- Decision: derive a fluid focus animation from sprite reference.
  - Created looped SVG animation with smooth transitions:
    - bell-only phase
    - hat reveal phase
    - merged hat+bell phase with subtle bell swing
  - Provided both light and dark variants for theme compatibility.

### 2026-02-15 Session (Eleventh Pass)
- Decision: revert previous icon-asset draft set to align with user-provided official mark.
  - Removed generated icon/glyph/animation draft files from `assets/brand/`.
- Decision: switch to official source vector `inspiration/icon.svg` as the only icon authority.
- Decision: create first-pass official reveal animation prototype (not integrated).
  - Asset: `assets/brand/kiki-official-reveal-animation.svg`
  - Motion:
    - starts with centered black bell
    - hat starts off-frame (upper-right), small/distant
    - hat drops in while scaling up and settling over bell
    - bell transitions black->white using hat-coverage mask (coverage-driven reveal)
- Constraint: wait for explicit user approval before generating dark/light variants or wiring into app/tray.

### 2026-02-15 Session (Twelfth Pass)
- Decision: reset animation prototype to strict official-icon path source.
  - Rebuilt `assets/brand/kiki-official-reveal-animation.svg` using `inspiration/icon.svg` path data verbatim (`d` unchanged).
  - Layering model:
    - stationary black bell path
    - moving black hat path
    - white bell repaint masked by moving hat footprint for XOR-like color swap on overlap
  - Motion model:
    - hat starts off-frame upper-right
    - simple lowering path into center coverage
- Constraint remains: no app/tray integration until user approval.
