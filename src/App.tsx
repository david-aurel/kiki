import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FocusMode, GitHubNotification, PullRequestSnapshot } from "./core/models/types";
import { sortReviewRequestsOldestFirst } from "./core/services/prViews";
import { getSettings, setFocusMode } from "./lib/appState";
import { loadMyPrs, loadRecentNotifications, loadReviewRequests, syncNow, testGithubConnection } from "./lib/runtime";
import { PrTable } from "./ui/components/PrTable";
import { RecentNotifications } from "./ui/components/RecentNotifications";
import { SettingsPanel } from "./ui/components/SettingsPanel";
import { KikiMark } from "./ui/components/KikiMark";
import { FocusModeTransition } from "./ui/components/FocusModeTransition";
import "./ui/styles/app.css";

type SectionTab = "review" | "my" | "delivered" | "suppressed";

const focusOptions: Array<{ value: FocusMode; label: string; description: string }> = [
  { value: "all", label: "All", description: "All notifications are delivered, including Copilot." },
  { value: "calm", label: "Calm", description: "Personal PR activity and review requests, with Copilot review comments suppressed." },
  { value: "focused", label: "Focused", description: "Only personal PR activity. Review requests and Copilot comments are suppressed." },
  { value: "zen", label: "Zen", description: "All notifications are suppressed." }
];

export default function App() {
  const [focusMode, setFocusModeState] = useState<FocusMode>(getSettings().rules.focusMode);
  const [status, setStatus] = useState("Ready");
  const [paused, setPaused] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [viewerLogin, setViewerLogin] = useState("");
  const [myPrs, setMyPrs] = useState<PullRequestSnapshot[]>([]);
  const [reviewRequests, setReviewRequests] = useState<PullRequestSnapshot[]>([]);
  const [notifications, setNotifications] = useState<GitHubNotification[]>([]);
  const [collapsed, setCollapsed] = useState<{
    review: boolean;
    my: boolean;
    delivered: boolean;
    suppressed: boolean;
  }>({
    review: false,
    my: false,
    delivered: false,
    suppressed: false
  });
  const [mobileTab, setMobileTab] = useState<SectionTab>("review");
  const [focusTransition, setFocusTransition] = useState<FocusMode | null>(null);
  const transitionTimerRef = useRef<number | null>(null);

  const sortedReviewRequests = useMemo(() => sortReviewRequestsOldestFirst(reviewRequests), [reviewRequests]);

  const refreshAll = useCallback(async (successMessage: string): Promise<void> => {
    try {
      const [my, reviews, recents, login] = await Promise.all([
        loadMyPrs(),
        loadReviewRequests(),
        loadRecentNotifications(12),
        testGithubConnection()
      ]);
      setMyPrs(my);
      setReviewRequests(reviews);
      setNotifications(recents);
      setViewerLogin(login);
      setStatus(successMessage);
    } catch (error) {
      setStatus(`Data refresh failed: ${(error as Error).message}`);
    }
  }, []);

  const runSync = useCallback(async (successMessage = "Sync complete"): Promise<void> => {
    setStatus("Syncing...");
    try {
      const result = await syncNow();
      await refreshAll(`${successMessage}: scanned=${result.scanned}, delivered=${result.delivered}, suppressed=${result.suppressed}`);
    } catch (error) {
      setStatus(`Sync failed: ${(error as Error).message}`);
    }
  }, [refreshAll]);

  useEffect(() => {
    void refreshAll("Initial sync complete");
  }, [refreshAll]);

  useEffect(() => {
    if (paused) return;

    const timer = window.setInterval(() => {
      void runSync("Background sync complete");
    }, 180000);

    return () => window.clearInterval(timer);
  }, [paused, runSync]);

  function switchFocus(mode: FocusMode): void {
    if (mode === focusMode) return;

    setFocusMode(mode);
    setFocusModeState(mode);
    setFocusTransition(mode);
    if (transitionTimerRef.current) {
      window.clearTimeout(transitionTimerRef.current);
    }
    transitionTimerRef.current = window.setTimeout(() => {
      setFocusTransition(null);
      transitionTimerRef.current = null;
    }, 1500);
    setStatus(`Focus set to ${mode}`);
  }

  function toggleSection(section: SectionTab): void {
    setCollapsed((prev) => ({ ...prev, [section]: !prev[section] }));
  }

  const deliveredNotifications = useMemo(
    () => notifications.filter((notification) => notification.delivered),
    [notifications]
  );
  const suppressedNotifications = useMemo(
    () => notifications.filter((notification) => !notification.delivered),
    [notifications]
  );

  return (
    <div className="layout-root">
      <header className="topbar panel">
        <div className="topbar-left"><KikiMark /><span>Kiki</span></div>
        <div className="focus-row">
          <span className="focus-label">Focus mode</span>
          {focusOptions.map((option) => (
            <button
              key={option.value}
              className={`chip tooltip-anchor ${focusMode === option.value ? "active" : ""}`}
              data-tooltip={option.description}
              onClick={() => switchFocus(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="topbar-right">
          <button className="secondary" onClick={() => setPaused((v) => !v)}>{paused ? "Resume" : "Pause"}</button>
          <button className="secondary" onClick={() => void runSync()}>Sync</button>
          <button className="icon-btn settings-btn" onClick={() => setShowSettings((v) => !v)} aria-label="Settings">⚙</button>
        </div>
      </header>

      <div className="desktop-layout body-grid">
        <main className="stack-column">
          <section className={`section-card panel ${collapsed.review ? "collapsed-y" : ""}`} style={{ flex: collapsed.review ? "0 0 34px" : "1 1 0" }}>
            <div className="section-head">
              <h2>Review Requests</h2>
              <button className="collapse-btn" onClick={() => toggleSection("review")} aria-label="Collapse review requests">{collapsed.review ? "▸" : "▾"}</button>
            </div>
            {!collapsed.review ? <div className="section-body"><PrTable rows={sortedReviewRequests} currentUser={viewerLogin} showAuthor /></div> : null}
          </section>

          <section className={`section-card panel ${collapsed.my ? "collapsed-y" : ""}`} style={{ flex: collapsed.my ? "0 0 34px" : "1 1 0" }}>
            <div className="section-head">
              <h2>My PRs</h2>
              <button className="collapse-btn" onClick={() => toggleSection("my")} aria-label="Collapse my PRs">{collapsed.my ? "▸" : "▾"}</button>
            </div>
            {!collapsed.my ? <div className="section-body"><PrTable rows={myPrs} currentUser={viewerLogin} showAuthor={false} /></div> : null}
          </section>
        </main>

        <aside className="right-panels">
          <div className={`right-column section-card panel ${collapsed.delivered ? "collapsed-x" : ""}`}>
            <div className="section-head">
              {collapsed.delivered ? (
                <>
                  <button className="collapse-btn" onClick={() => toggleSection("delivered")} aria-label="Expand delivered notifications">▸</button>
                  <h2>Delivered</h2>
                </>
              ) : (
                <>
                  <h2>Delivered</h2>
                  <button className="collapse-btn" onClick={() => toggleSection("delivered")} aria-label="Collapse delivered notifications">◂</button>
                </>
              )}
            </div>
            {!collapsed.delivered ? <div className="section-body"><RecentNotifications rows={deliveredNotifications} emptyText="No delivered notifications." /></div> : null}
          </div>

          <div className={`right-column section-card panel ${collapsed.suppressed ? "collapsed-x" : ""}`}>
            <div className="section-head">
              {collapsed.suppressed ? (
                <>
                  <button className="collapse-btn" onClick={() => toggleSection("suppressed")} aria-label="Expand suppressed notifications">▸</button>
                  <h2>Suppressed</h2>
                </>
              ) : (
                <>
                  <h2>Suppressed</h2>
                  <button className="collapse-btn" onClick={() => toggleSection("suppressed")} aria-label="Collapse suppressed notifications">◂</button>
                </>
              )}
            </div>
            {!collapsed.suppressed ? <div className="section-body"><RecentNotifications rows={suppressedNotifications} emptyText="No suppressed notifications." /></div> : null}
          </div>
        </aside>
      </div>

      <div className="mobile-layout panel">
        <div className="section-head mobile-head">
          <h2>
            {mobileTab === "review"
              ? "Review Requests"
              : mobileTab === "my"
                ? "My PRs"
                : mobileTab === "delivered"
                  ? "Delivered"
                  : "Suppressed"}
          </h2>
        </div>
        <div className="section-body mobile-body">
          {mobileTab === "review" ? <PrTable rows={sortedReviewRequests} currentUser={viewerLogin} showAuthor /> : null}
          {mobileTab === "my" ? <PrTable rows={myPrs} currentUser={viewerLogin} showAuthor={false} /> : null}
          {mobileTab === "delivered" ? <RecentNotifications rows={deliveredNotifications} emptyText="No delivered notifications." /> : null}
          {mobileTab === "suppressed" ? <RecentNotifications rows={suppressedNotifications} emptyText="No suppressed notifications." /> : null}
        </div>
      </div>

      <nav className="mobile-tabbar panel" aria-label="Mobile navigation">
        <button className={`mobile-tab ${mobileTab === "review" ? "active" : ""}`} onClick={() => setMobileTab("review")}>Review</button>
        <button className={`mobile-tab ${mobileTab === "my" ? "active" : ""}`} onClick={() => setMobileTab("my")}>My PRs</button>
        <button className={`mobile-tab ${mobileTab === "delivered" ? "active" : ""}`} onClick={() => setMobileTab("delivered")}>Delivered</button>
        <button className={`mobile-tab ${mobileTab === "suppressed" ? "active" : ""}`} onClick={() => setMobileTab("suppressed")}>Suppressed</button>
      </nav>

      {showSettings ? (
        <div className="settings-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-drawer" onClick={(event) => event.stopPropagation()}>
            <SettingsPanel onSaved={setStatus} />
          </div>
        </div>
      ) : null}

      <FocusModeTransition mode={focusTransition} />

      <div className="status-line kpi">{status}</div>
    </div>
  );
}
