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

### 2026-02-15 Session (Thirteenth Pass)
- Decision: consolidate icon variants and focus-mode animation behavior into one SVG file.
  - File: `assets/brand/kiki-official-reveal-animation.svg`
  - Control surface:
    - `data-theme=\"light|dark\"`
    - `data-focus=\"all|calm|personal|zen\"`
    - `data-animate=\"true|false\"`
  - Behavior mapping:
    - static icon (`data-animate=\"false\"`) = no animation, theme colors applied
    - `focus=all` + animate => reverse animation
    - `focus=calm|personal` + animate => normal animation with XOR overlap
    - `focus=zen` + animate => normal animation with XOR layer disabled (bell swallowed)

### 2026-02-15 Session (Fourteenth Pass)
- Decision: document icon SVG configuration directly in-file.
  - Added explicit usage matrix comments in `assets/brand/kiki-official-reveal-animation.svg`.
- Decision: replace legacy topbar icon + center overlay transition with state-aware in-place icon animation.
  - Added `KikiStateIcon` component that injects the single SVG template and drives:
    - `data-theme` from system theme
    - `data-focus` from selected focus mode
    - `data-animate` on focus-mode transitions
  - Removed center overlay transition from `App`.
- Decision: add system dark/light mode behavior for app UI.
  - CSS now includes `prefers-color-scheme: light` overrides while preserving dark default palette.
- Decision: propagate icon state to macOS tray title and ensure tray icon visibility.
  - Added tray-state command bridge (`set_tray_state`) and frontend runtime call.
  - Tray now uses default app icon when available and updates title with focus/theme indicator text.

### 2026-02-15 Session (Fifteenth Pass)
- Finding: tray icon rendered as red square because `src-tauri/icons/icon.png` was a 1x1 placeholder.
  - Decision: replace tray icon with proper 64x64 transparent RGBA asset generated from official icon source.
- Decision: remove textual tray-title state rendering (`◐`, mode labels) to avoid menu bar clutter and incorrect fallback visuals.
  - Tray now renders icon-only in menu bar; focus/theme state is surfaced via tooltip instead.
- Decision: enforce transparent icon background in the single SVG source.
  - Removed background rectangle fill from `assets/brand/kiki-official-reveal-animation.svg`.
- Decision: use macOS template-icon behavior for tray icon.
  - Enabled `icon_as_template(true)` in tray builder so icon adapts to menu bar appearance.

### 2026-02-15 Session (Sixteenth Pass)
- Plan/Decision: normalize icon animation logic around a base/contrast color model.
  - Hat + bell now always start in the same `--base-color` (theme-driven).
  - Contrast only appears via masked overlap repaint (`--contrast-color`) to keep bell visible under hat.
- Plan/Decision: focus-mode behavior mapping in SVG variables:
  - `calm|personal`: normal animation + XOR repaint enabled.
  - `zen`: normal animation + XOR repaint disabled (bell swallowed by same-color hat).
  - `all`: reverse animation; static pose defaults to reversed-end (`hat-start-transform`) so no jump-back.
- Plan/Decision: keep transparent icon source.
  - No background rectangle in icon SVG.

### 2026-02-15 Session (Seventeenth Pass)
- Decision: increase in-app header icon size and topbar scale for better visibility.
  - Topbar icon now renders larger in title area.
  - Topbar typography/padding increased slightly to match.
- Decision: add explicit tray icon set per focus state.
  - Generated transparent RGBA tray assets:
    - `src-tauri/icons/tray-all.png`
    - `src-tauri/icons/tray-focus.png`
    - `src-tauri/icons/tray-zen.png`
  - Tray icon now updates by focus mode (`all`, `calm|focused|personal`, `zen`).
- Decision: keep tray icon-only visual in menu bar.
  - No visible tray title text; state remains in tooltip.

### 2026-02-15 Session (Eighteenth Pass)
- Decision: add explicit tray icon sets for light and dark system themes.
  - Generated six transparent RGBA tray assets:
    - `src-tauri/icons/tray-all-light.png`
    - `src-tauri/icons/tray-focus-light.png`
    - `src-tauri/icons/tray-zen-light.png`
    - `src-tauri/icons/tray-all-dark.png`
    - `src-tauri/icons/tray-focus-dark.png`
    - `src-tauri/icons/tray-zen-dark.png`
- Decision: tray icon selection now keys on `(theme, focus_mode)`.
  - Theme from app system preference listener.
  - Focus buckets: `all`, `calm|focused|personal`, `zen`.
- Decision: disable template-icon mode for tray.
  - `icon_as_template(false)` to preserve explicit light/dark icon assets.

### 2026-02-16 Session (Nineteenth Pass)
- Decision: regenerate tray PNG assets from the current official SVG geometry/state.
  - Rebuilt:
    - `src-tauri/icons/tray-all-light.png`
    - `src-tauri/icons/tray-focus-light.png`
    - `src-tauri/icons/tray-zen-light.png`
    - `src-tauri/icons/tray-all-dark.png`
    - `src-tauri/icons/tray-focus-dark.png`
    - `src-tauri/icons/tray-zen-dark.png`
  - Synced compatibility aliases:
    - `src-tauri/icons/tray-all.png`
    - `src-tauri/icons/tray-focus.png`
    - `src-tauri/icons/tray-zen.png`
- Decision: add relative timestamps to recent notification cards (delivered and suppressed sections).
  - Timestamp shown on the right side of each card header.
  - Format:
    - `<60m`: minutes, e.g. `1M`, `22M`
    - `<24h`: hours, e.g. `2h`, `23h`
    - `>=24h`: shared long formatter (`1d 3h`, `1.5w`, etc.)

### 2026-02-16 Session (Twentieth Pass)
- Regression fix: restore focus-mode chip tooltips by removing overflow clipping on the focus row.
  - `src/ui/styles/app.css`: `.focus-row` now uses visible overflow so chip pseudo-tooltips can render outside the row box.
- UI polish: remove slash separator from PR diff display.
  - `src/ui/components/PrTable.tsx`: diff now renders as `+X -Y (files)` with no `/` separator.

### 2026-02-16 Session (Twenty-First Pass)
- Regression fix: restore full light-mode support for topbar controls, notification cards, settings form controls, and mobile tab switcher.
  - Introduced shared surface variables in `src/ui/styles/app.css`:
    - `--surface-1`
    - `--surface-2`
    - `--surface-hover`
    - `--tooltip-bg`
  - Mapped dark/light values in `:root` and `@media (prefers-color-scheme: light)`.
  - Replaced hardcoded dark backgrounds for:
    - focus chips
    - secondary/settings buttons
    - notification cards + hover states
    - settings `input`/`textarea`
    - mobile active tab background
    - tooltip surfaces and placeholder avatar backgrounds

### 2026-02-16 Session (Twenty-Second Pass)
- UX fix: clicking anywhere outside settings now closes the settings drawer.
  - Moved click stop-propagation from full-height drawer container to an inner settings shell around the actual panel.
  - This allows clicks in empty drawer area (including below content) to bubble to overlay close handler.
- UX polish: added a small close button in settings header.
  - `SettingsPanel` now accepts `onClose` and renders a top-right `×` icon button.

### 2026-02-16 Session (Twenty-Third Pass)
- Review requests behavior change:
  - Split ordering by request origin:
    - direct requests first
    - team requests second
  - Within each group, keep oldest-first ordering.
- Visual hierarchy change:
  - Team-origin review requests are now muted/greyed out in the review-request table (desktop + mobile).
  - Direct requests remain normal emphasis.

### 2026-02-16 Session (Twenty-Fourth Pass)
- Classification fix for review request origin:
  - Switched origin detection from search-source assumptions to authoritative PR fields:
    - `requested_reviewers`
    - `requested_teams`
  - This correctly classifies code-owner/team-driven requests as `team` even when they appear in broad review search results.
- Behavior impact:
  - Team/codeowner requests now consistently appear in the lower (muted) segment.
  - Direct requests remain in the top, normal-emphasis segment.

### 2026-02-16 Session (Twenty-Fifth Pass)
- Reliability fix for missing comment notifications:
  - Expanded GitHub notifications ingestion in `GitHubHttpAdapter.fetchNotifications`:
    - fetches up to 3 pages at `per_page=100` (unread window widened from only first 50)
    - merges both `participating=true` and `participating=false` scopes
    - deduplicates by notification `id` and keeps latest `updated_at`
    - sorts merged stream by newest `updated_at` before mapping
- Expected impact:
  - comment events are less likely to be dropped in high-volume repos/organizations
  - delivered/suppressed panels and Slack delivery now see the same widened notification source.

### 2026-02-16 Session (Twenty-Sixth Pass)
- Estimate parsing finalized to the agreed PR description markers:
  - `**⚡️ Immediate**`
  - `**🐬 Half working day**`
  - `**🐝 1-2 days**`
- Parser behavior:
  - matches line-based markers case-insensitively
  - accepts both bold markdown and plain-line forms
- Test coverage expanded:
  - immediate / half-day / 1-2 days all mapped
  - plain (non-bold) marker form covered
  - unknown fallback preserved.

### 2026-02-16 Session (Twenty-Seventh Pass)
- Estimate ambiguity rule tightened:
  - if multiple conflicting estimate markers are present in PR description, estimate resolves to `unknown`.
  - only a single unambiguous marker yields a known estimate.
- Estimate table rendering updated:
  - known estimates render emoji only:
    - `⚡️`, `🐬`, `🐝`
  - `unknown` renders as an empty cell.

### 2026-02-16 Session (Twenty-Eighth Pass)
- Native app lifecycle update:
  - Closing the main window now hides it instead of quitting the app.
  - App continues running in menu bar/tray for background notification delivery.
  - Implemented via Tauri `on_window_event` handler for `CloseRequested` with `prevent_close()` + `window.hide()`.
- Explicit full-quit action:
  - Added `quit_app` Tauri command.
  - Added top-bar `Quit` button next to `Pause` and `Sync` to fully terminate the app process.

### 2026-02-16 Session (Twenty-Ninth Pass)
- Native macOS Dock visibility made dynamic:
  - When app window is shown via tray click or tray menu `Open`, activation policy switches to `Regular` (Dock icon + cmd-tab presence).
  - When user closes window, close is intercepted (hide instead of quit) and activation policy switches back to `Accessory` (menu bar only).
- Resulting behavior:
  - app keeps running in menu bar for background delivery
  - Dock icon appears only while window is visible.

### 2026-02-16 Session (Thirtieth Pass)
- Dock visibility startup fix:
  - On app startup, if main window is already visible, activation policy is now promoted to `Regular`.
  - Prevents launch state where window is visible but app remains `Accessory` and absent from Dock/cmd-tab.
- Existing dynamic behavior preserved:
  - close/hide -> `Accessory`
  - focus/open from tray -> `Regular`

### 2026-02-16 Session (Thirty-First Pass)
- Dock icon source fix:
  - Reused tray brand asset as app icon source by setting:
    - `src-tauri/icons/icon.png` (copied from tray focus icon)
    - `src-tauri/tauri.conf.json` -> `bundle.icon: ["icons/icon.png"]`
- Notes:
  - Tauri config in this project version does not support per-window `icon` field; icon must come from bundle settings.

### 2026-02-16 Session (Thirty-Second Pass)
- macOS Dock icon reliability update:
  - Generated a proper `src-tauri/icons/icon.icns` via `tauri icon`.
  - Updated bundle icon config to include `icon.icns` and `icon.png`.
- Added runtime fallback in Tauri setup:
  - explicitly sets main window icon from `icons/icon.png` for dev runtime consistency.

### 2026-02-17 Session (Thirty-Third Pass)
- Dock icon corruption fix:
  - Regenerated app icon assets from official raster brand source (`inspiration/icon.png`) instead of tray/symbol-only sources.
  - Built fresh `src-tauri/icons/icon.icns` + `src-tauri/icons/icon.png` via `tauri icon` from a square-padded source image.
- Goal:
  - ensure bundled macOS app uses a valid, full-fidelity ICNS icon (not garbled/pixel-noise).

### 2026-02-17 Session (Thirty-Fourth Pass)
- Dock icon visual adjustment:
  - Switched app icon generation source to glyph-only tray mark (`src-tauri/icons/tray-focus-light.png`) to avoid nested rounded-square look in macOS Dock.
- Regenerated full icon set (`icon.icns`, `icon.png`, etc.) with `tauri icon`.

### 2026-02-17 Session (Thirty-Fifth Pass)
- Desktop layout collapse behavior fix:
  - When both right-side notification columns (`Delivered` and `Suppressed`) are collapsed, desktop grid now switches from fixed `620px` right column to `auto`.
- This allows PR sections to reclaim horizontal space instead of leaving a large empty reserved area.

### 2026-02-17 Session (Thirty-Sixth Pass)
- Added Notification Debug window for reliability triage.
  - Topbar now includes a `Debug` button next to `Pause`, `Sync`, `Quit`.
  - Debug modal shows raw fetched GitHub notifications (up to 250), including:
    - updated timestamp
    - reason
    - category
    - deliver/suppress decision
    - decision reason
    - flags (`isPersonalPrActivity`, `isReviewRequest`, `isDirectMention`)
    - notification id
  - Rows are clickable to open target URL.
- Added runtime debug fetch path:
  - `loadDebugNotifications()` fetches full inbox window (post-merge/pagination path), enriches, and applies delivery decision for visibility.

### 2026-02-17 Session (Thirty-Seventh Pass)
- Added direct GitHub Notifications API probe in Debug window to separate endpoint issues from app logic issues.
  - Probe runs page-1 snapshots for:
    - `all=false, participating=false`
    - `all=false, participating=true`
    - `all=true, participating=false`
    - `all=true, participating=true`
  - Each row shows:
    - count
    - latest `updated_at` timestamp
- Purpose:
  - quickly verify whether missing notifications are absent from GitHub endpoint responses or dropped in Kiki processing/filtering.

### 2026-02-17 Session (Thirty-Eighth Pass)
- Notification source behavior change:
  - Switched main inbox ingestion from `all=false` to `all=true`.
- Rationale: notifications read elsewhere (e.g. GitHub UI) should still be ingested and can still be delivered/shown in Kiki.

### 2026-02-17 Session (Thirty-Ninth Pass)
- Refresh reliability fix:
  - Replaced all-or-nothing `Promise.all` refresh with `Promise.allSettled` in app refresh flow.
  - Notifications now update even if another section fetch fails (e.g., review requests or viewer login).
  - Status line now reports partial refresh errors without freezing stale notification data.

### 2026-02-17 Session (Fortieth Pass)
- GitHub notification freshness and debug hardening:
  - GitHub adapter now forces uncached notifications fetches with:
    - `cache: "no-store"` (web mode)
    - cache-busting query stamp (`_kiki_ts`)
    - no-cache headers
  - Notification probe expanded to include additional slices (`all=true p2`, `since24h`) and now reports per-query errors instead of failing whole probe.
- Tauri-native GitHub transport added:
  - Added `github_api_get` Tauri command (reqwest-based) and wired GitHub adapter to use it when running in Tauri.
  - Goal: bypass WebView fetch/network quirks and make GitHub fetch behavior deterministic in desktop mode.
- Notification enrichment resilience:
  - Per-notification enrichment/actor lookups are now best-effort and no longer allowed to fail entire notification refresh/debug loads.
  - Debug refresh now clears stale rows first and uses `Promise.allSettled` so rows/probes are independently visible with explicit errors.

### 2026-02-17 Session (Forty-First Pass)
- Native command hang fix:
  - Converted Tauri network commands (`github_api_get`, `slack_api_call`) from blocking reqwest to async reqwest.
  - Added explicit network timeouts:
    - connect timeout: 8s
    - overall timeout: 20s
- Rationale:
  - previous blocking/no-timeout behavior could stall app startup/refresh indefinitely when network conditions were poor or proxy routing was slow.

### 2026-02-17 Session (Forty-Second Pass)
- Notification semantics refinement:
  - Added richer notification categories:
    - `review_request`, `comment`, `mention`, `assignment`, `review_approved`, `review_changes_requested`, `review_commented`, `ci`, `update`.
  - Added `occurredAt` timestamp on notification model for event-time display.
- Timestamp source-of-truth:
  - Notification age in UI now uses `occurredAt` (when available from GitHub event payloads) with fallback to notification `updated_at`.
- Actor attribution fixes:
  - `review_requested` notifications now prefer PR author (from PR subject payload) and no longer get overwritten by latest commenter.
  - `comment`/`mention` notifications now prefer latest comment actor + preview text.
- Update/review-result mapping:
  - For PR update-like reasons (`author`, `state_change`), app now attempts to resolve latest review outcome and map to:
    - approved / changes requested / review commented
  - Reviewer identity and review link are attached when resolvable, so avatar/label better reflects who reviewed.
  - Safety guard: review outcome is only attached when review timestamp is close to notification timestamp (24h window) to reduce misclassification from stale historical reviews.

### 2026-02-17 Session (Forty-Third Pass)
- Mention/comment behavior correction:
  - `mention` and `team_mention` are now normalized to comment notifications (not generic updates).
  - For comment-like notifications, adapter now backfills `latest_comment_url` via thread lookup (`/notifications/threads/{id}`) when missing.
  - Comment cards now prioritize:
    - deep link to exact comment (`comment.html_url`)
    - commenter actor/avatar
    - first comment text as preview
- Actor fallback guard:
  - disabled subject-owner actor fallback for comment-like notifications to prevent self-avatar misattribution on personal PRs.
- Review assignment handling:
  - `assign` reason added to review-outcome candidate reasons, so reviewer identity + deep link to specific review can be resolved when the assignment corresponds to review activity.

### 2026-02-19 Session (Forty-Fourth Pass)
- Sync reliability hardening:
  - Root cause identified: a single Slack delivery failure could abort the whole sync run, and then UI refresh would not execute, leaving stale notification cards visible.
- Fixes applied:
  - `runNotificationPipeline` now catches per-notification processing errors and continues scanning remaining notifications.
  - Added `failed` counter to pipeline result for visibility (`scanned/delivered/suppressed/skipped/failed`).
  - `runSync` now always triggers a UI refresh path even when sync throws, preventing stale data lock-in.
- Guardrails:
  - Failed items are intentionally not marked processed, so they retry on next sync.
  - Added regression test: one Slack send fails, remaining notifications still process and result reports `failed=1`.

### 2026-02-19 Session (Forty-Fifth Pass)
- Notification ingestion architecture switched fully (no feature flag) to a hybrid source:
  - REST `/notifications` is now used only for `review_requested` items.
  - GraphQL is now the source of truth for activity on authored PRs (comments + reviews).
- GraphQL-derived notifications:
  - Issue comments on your PRs by other users -> `comment` notifications with:
    - actor/avatar from comment author
    - preview text from comment body
    - deep link to exact comment URL
  - Reviews on your PRs by other users -> `review_approved` / `review_changes_requested` / `review_commented` with:
    - actor/avatar from reviewer
    - deep link to review URL
    - preview text from review body when available
- Source merge behavior:
  - REST review requests + GraphQL PR activity are merged, deduped by id, and sorted by event timestamp.
  - If one source fails, the other source still renders; full failure only occurs if both sources fail.
- Runtime transport updates:
  - Added native Tauri command `github_api_graphql` for reliable GraphQL POST requests.
  - Browser mode uses direct `POST https://api.github.com/graphql`.
- Debug wording updated:
  - debug panel now explicitly states notifications are from merged REST+GraphQL sources.

### 2026-02-19 Session (Forty-Sixth Pass)
- Review-request delivery behavior refined for focus modes:
  - Team-only review requests are now suppressed (but still shown in UI) for all modes except `all`.
  - Direct review requests (explicitly requested reviewer is the viewer) continue to be deliverable in `calm`.
- Implementation details:
  - Review-request notifications are now enriched at fetch time with:
    - `isDirectReviewRequest`
    - `isTeamReviewRequest`
  - Decision rule now suppresses `isTeamReviewRequest && !isDirectReviewRequest` when mode is not `all`.
- Added rule tests covering:
  - suppression of team-only review requests in `calm`
  - delivery of direct review requests in `calm`

### 2026-02-19 Session (Forty-Seventh Pass)
- GraphQL comment ingestion gap fix:
  - Added pull-request `reviewThreads` comment ingestion (in addition to PR conversation comments).
  - This captures inline code review comments, which are the common review comment type and were previously missing from notifications.
- Mapping:
  - Review-thread comments now produce `comment` notifications with:
    - commenter actor/avatar
    - preview text from comment body
    - deep link to exact comment URL
- Debugability:
  - Added `graphql my_pr_activity` probe row in Debug panel to show count/latest/top for GraphQL-derived activity notifications (or explicit query error).

### 2026-02-19 Session (Forty-Eighth Pass)
- GraphQL reliability hardening for PR activity:
  - Split GraphQL ingestion into:
    - core activity query (PR conversation comments + reviews)
    - optional review-thread comments query
  - Review-thread query failure no longer blocks all GraphQL activity notifications.
- Pagination compatibility fallback:
  - Each query now tries `last` pagination first, then falls back to `first` pagination for GitHub schema/runtime compatibility.
- Activity scope broadening:
  - PR activity queries now include both `OPEN` and `MERGED` authored PRs (not only open), improving chance to capture real-world review/comment activity.

### 2026-02-19 Session (Forty-Ninth Pass)
- Tauri GraphQL response-shape fix:
  - Root cause: native Tauri GraphQL command returns standard GraphQL envelope `{ data, errors }`, but adapter previously treated invoke return as already-unwrapped data object.
- Symptom: runtime error in debug probe (`undefined is not an object (evaluating 'corePayload.viewer.login')`).
- Fix: adapter now unwraps envelope in Tauri path and applies the same `errors` and `data` checks as browser path.

### 2026-02-19 Session (Fiftieth Pass)
- Bot handling refinement:
  - `prosperity-bot` / `ps-bot` are now hard-excluded at ingestion time for GraphQL-derived activity notifications.
  - Excluded bot activity is not delivered and not shown (not treated as suppressed).
- Copilot handling refinement:
  - Copilot suppression now matches both known bot accounts:
    - `github-copilot[bot]`
    - `copilot-pull-request-reviewer[bot]`
  - and generic copilot bot-name pattern (`*copilot*[bot]`) in non-`all` modes.
  - In `all` mode, Copilot activity remains deliverable by design.

### 2026-02-19 Session (Fifty-First Pass)
- Review-notification deduping policy tightened:
  - For review-thread comments that belong to a `pullRequestReview`, Kiki now emits exactly one review notification per review id.
  - Additional comments within the same review no longer generate separate comment notifications.
- Applies equally to human and Copilot reviews:
  - one review => one notification object (delivery still follows focus-mode suppression rules).

### 2026-02-19 Session (Fifty-Second Pass)
- GitHub rate-limit resilience improvements:
  - Added local cache + temporary backoff in runtime for GitHub-backed loads:
    - my PRs
    - review requests
    - notifications
    - debug probe
    - viewer login
  - On rate-limit errors, app now serves last successful cached data when available instead of failing hard.
  - Applies a 15-minute in-memory backoff to avoid hammering GitHub while limited.
- Refresh load-shedding:
  - Background 3-minute sync now refreshes notifications only (not full PR tables), reducing repeated expensive GitHub calls.
  - Manual sync remains full refresh.

### 2026-02-19 Session (Fifty-Third Pass)
- Review-comment copy quality improvement:
  - For collapsed review notifications (`review_commented`), if review summary body is empty, Kiki now uses linked review-thread comment content as preview text.
  - Existing emitted review notification is upgraded from generic fallback text (`Left a review comment`) to real comment snippet when thread comment text is available.
- For upgraded `review_commented` previews, deep-link target is also updated to exact comment URL when available.

### 2026-02-19 Session (Fifty-Fourth Pass)
- Clarified comment vs review semantics:
  - Normal PR conversation comments remain `comment`.
  - Note: mapping details were refined further in Fifty-Fifth Pass.
- UI distinction improved:
  - `review_request` label changed to `Review Request`.
  - `review_commented` label changed to `Review Comment`.
  - `review_commented` icon changed from chat bubble to note icon to reduce confusion with normal comments.

### 2026-02-19 Session (Fifty-Fifth Pass)
- Official GitHub semantics alignment (docs-backed):
  - Plain PR conversation comments (`IssueComment`) and standalone thread comments are treated as `comment`.
  - Review submissions (`PullRequestReview`) are treated as review outcomes:
    - `review_approved`
    - `review_changes_requested`
    - `review_commented`
  - A review remains one notification, even when it contains multiple review-thread comments.
- Labeling update:
  - Recent Notifications chip now uses `Comment` for comment events and `Review` for review outcome events (instead of ambiguous `Review Comment` copy).
  - Review action remains visible via emoji and detail text (`Approved`, `Requested changes`, `Commented in a review`).
- Slack copy update:
  - Replaced raw `Reason: ...` output with normalized type labels (`Comment`, `Review (Approved)`, `Review (Changes Requested)`, `Review (Commented)`, etc.) and optional detail snippet.

### 2026-02-19 Session (Fifty-Sixth Pass)
- Notification fetch + caching simplification:
  - Removed localStorage/backoff cache wrapper from runtime GitHub loaders used by:
    - recent notifications
    - debug notifications
    - debug probe
    - PR tables
    - viewer connection test
  - These calls now always fetch fresh data from GitHub on refresh/sync, eliminating stale-debug snapshots caused by cached reads during backoff windows.
- Notification enrichment simplification:
  - Enrichment now has one focused REST branch:
    - `review_request` notifications are enriched with PR author + canonical URL.
  - Removed legacy comment/update inference branches that were no longer needed after moving comment/review ingestion to GraphQL.
- Comment vs review behavior locked in:
  - `comment` is emitted for PR conversation comments and standalone review-thread comments.
  - `review_*` is emitted only for explicit `PullRequestReview` submissions.
  - Review-thread comments linked to a review continue to collapse into a single review notification.
- Slack delivery copy overhaul:
  - Slack messages now mirror app notification semantics (emoji + typed header + actor/action + concise detail + repo + deep link), instead of raw `Reason: ...`.
- Debug Slack testing:
  - Added debug actions to send typed Slack test notifications:
    - Review Request
    - Comment
    - Review Approved
    - Review Changes Requested
    - Review Commented
