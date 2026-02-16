import { useState } from "react";
import { getSettings, setSettings } from "../../lib/appState";
import { saveSecret, testGithubConnection, testSlackConnection } from "../../lib/runtime";

interface SettingsPanelProps {
  onSaved: (message: string) => void;
  onClose: () => void;
}

export function SettingsPanel({ onSaved, onClose }: SettingsPanelProps) {
  const base = getSettings();
  const [githubTokenRef, setGithubTokenRef] = useState(base.githubTokenRef);
  const [slackTokenRef, setSlackTokenRef] = useState(base.slackTokenRef);
  const [slackUserId, setSlackUserId] = useState(base.slackUserId);
  const [teamHandles, setTeamHandles] = useState(base.rules.teamHandles.join("\n"));
  const [githubPat, setGithubPat] = useState("");
  const [slackBotToken, setSlackBotToken] = useState("");

  async function save(): Promise<void> {
    const nextGithubTokenRef = githubTokenRef.trim();
    const nextSlackTokenRef = slackTokenRef.trim();
    const nextSlackUserId = slackUserId.trim();

    if (!nextGithubTokenRef || !nextSlackTokenRef || !nextSlackUserId) {
      onSaved("Save failed: token refs and Slack user ID are required");
      return;
    }

    const nextTeamHandles = teamHandles
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const current = getSettings();
    setSettings({
      ...current,
      githubTokenRef: nextGithubTokenRef,
      slackTokenRef: nextSlackTokenRef,
      slackUserId: nextSlackUserId,
      rules: {
        ...current.rules,
        teamHandles: nextTeamHandles
      }
    });

    if (githubPat.trim()) await saveSecret(nextGithubTokenRef, githubPat);
    if (slackBotToken.trim()) await saveSecret(nextSlackTokenRef, slackBotToken);

    onSaved("Settings saved");
  }

  async function runGitHubTest(): Promise<void> {
    try {
      const login = await testGithubConnection();
      onSaved(`GitHub connected as ${login}`);
    } catch (error) {
      onSaved(`GitHub test failed: ${(error as Error).message}`);
    }
  }

  async function runSlackTest(): Promise<void> {
    try {
      const team = await testSlackConnection();
      onSaved(`Slack connected (${team})`);
    } catch (error) {
      onSaved(`Slack test failed: ${(error as Error).message}`);
    }
  }

  return (
    <div className="sidebar panel">
      <div className="settings-header">
        <h3>Settings</h3>
        <button className="icon-btn settings-close-btn" onClick={onClose} aria-label="Close settings">×</button>
      </div>
      <div className="field">
        <label>GitHub Token Ref</label>
        <input value={githubTokenRef} onChange={(e) => setGithubTokenRef(e.target.value)} />
      </div>
      <div className="field">
        <label>Slack Token Ref</label>
        <input value={slackTokenRef} onChange={(e) => setSlackTokenRef(e.target.value)} />
      </div>
      <div className="field">
        <label>Slack User ID</label>
        <input value={slackUserId} onChange={(e) => setSlackUserId(e.target.value)} placeholder="U..." />
      </div>
      <div className="field">
        <label>Team Handles (one per line, org/team)</label>
        <textarea rows={3} value={teamHandles} onChange={(e) => setTeamHandles(e.target.value)} />
      </div>
      <div className="field">
        <label>GitHub PAT (stored in keychain/local secret store)</label>
        <input type="password" value={githubPat} onChange={(e) => setGithubPat(e.target.value)} />
      </div>
      <div className="field">
        <label>Slack Bot Token (stored in keychain/local secret store)</label>
        <input type="password" value={slackBotToken} onChange={(e) => setSlackBotToken(e.target.value)} />
      </div>
      <div className="controls">
        <button className="primary" onClick={() => void save()}>Save</button>
        <button className="secondary" onClick={() => void runGitHubTest()}>Test GitHub</button>
        <button className="secondary" onClick={() => void runSlackTest()}>Test Slack</button>
      </div>
    </div>
  );
}
