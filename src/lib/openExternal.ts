import { invoke } from "@tauri-apps/api/core";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && typeof window.__TAURI_INTERNALS__ !== "undefined";
}

export async function openExternal(url: string | undefined): Promise<void> {
  if (!url) return;

  if (isTauriRuntime()) {
    try {
      await invoke("open_external_url", { url });
      return;
    } catch {
      // Fall back to browser behavior when Tauri command fails.
    }
  }

  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) {
    window.location.href = url;
  }
}
