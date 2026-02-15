import type { FocusMode } from "../../core/models/types";

interface FocusModeTransitionProps {
  mode: FocusMode | null;
}

function label(mode: FocusMode): string {
  if (mode === "all") return "All";
  if (mode === "calm") return "Calm";
  if (mode === "focused") return "Focused";
  return "Zen";
}

function subtitle(mode: FocusMode): string {
  if (mode === "all") return "Everything comes through.";
  if (mode === "calm") return "Copilot noise gets muted.";
  if (mode === "focused") return "Only your own PR activity.";
  return "Quiet mode. Notifications paused.";
}

export function FocusModeTransition({ mode }: FocusModeTransitionProps) {
  if (!mode) return null;

  return (
    <div className={`focus-transition mode-${mode}`} aria-live="polite" aria-label={`Focus mode changed to ${label(mode)}`}>
      <div className="focus-transition-card panel">
        <svg viewBox="0 0 340 120" role="img" aria-label="Focus transition animation" className="focus-transition-art">
          <defs>
            <linearGradient id="kikiTrail" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#6bb8b2" stopOpacity="0" />
              <stop offset="100%" stopColor="#6bb8b2" stopOpacity="0.9" />
            </linearGradient>
          </defs>

          <g className="ft-bell">
            <path d="M280 35c0-14-10-21-22-21s-22 7-22 21v16l-7 9h58l-7-9V35z" className="ft-bell-shape" />
            <circle cx="258" cy="68" r="5" className="ft-bell-clapper" />
          </g>

          <path d="M52 68c35-36 92-39 145-25" className="ft-trail" />

          <g className="ft-broom">
            <line x1="44" y1="66" x2="86" y2="46" className="ft-handle" />
            <path d="M35 64l12 10 10-8-12-10z" className="ft-brush" />
            <rect x="83" y="42" width="9" height="8" rx="2" className="ft-parcel" />
          </g>

          <g className="ft-mute">
            <line x1="228" y1="22" x2="292" y2="82" className="ft-slash" />
          </g>
        </svg>
        <div className="focus-transition-copy">
          <strong>{label(mode)}</strong>
          <span>{subtitle(mode)}</span>
        </div>
      </div>
    </div>
  );
}
