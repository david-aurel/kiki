import { useMemo } from "react";
import type { FocusMode } from "../../core/models/types";
import iconTemplate from "../../../assets/brand/kiki-official-reveal-animation.svg?raw";

interface KikiStateIconProps {
  theme: "light" | "dark";
  focusMode: FocusMode;
  animate: boolean;
  size?: number;
}

function toIconFocus(mode: FocusMode): "all" | "calm" | "personal" | "zen" {
  if (mode === "focused") return "personal";
  return mode;
}

export function KikiStateIcon({ theme, focusMode, animate, size = 26 }: KikiStateIconProps) {
  const svg = useMemo(() => {
    return iconTemplate
      .replace(/data-theme="[^"]*"/, `data-theme="${theme}"`)
      .replace(/data-focus="[^"]*"/, `data-focus="${toIconFocus(focusMode)}"`)
      .replace(/data-animate="[^"]*"/, `data-animate="${animate ? "true" : "false"}"`)
      .replace(/width="[^"]*"/, 'width="100%"')
      .replace(/height="[^"]*"/, 'height="100%"');
  }, [theme, focusMode, animate]);

  return (
    <span
      className="kiki-state-icon"
      style={{ width: `${size}px`, height: `${size}px` }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
