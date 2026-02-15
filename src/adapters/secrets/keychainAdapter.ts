import { invoke } from "@tauri-apps/api/core";
import type { SecretsPort } from "../../ports/secrets";

const fallbackPrefix = "kiki_secret:";

function runningInTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export class KeychainAdapter implements SecretsPort {
  async get(name: string): Promise<string | null> {
    if (runningInTauri()) {
      try {
        const value = await invoke<string | null>("secret_get", { name });
        if (value && value.length > 0) {
          return value;
        }
      } catch {
        // Fallback below.
      }
    }

    return localStorage.getItem(`${fallbackPrefix}${name}`);
  }

  async set(name: string, value: string): Promise<void> {
    const trimmedValue = value.trim();
    const fallbackKey = `${fallbackPrefix}${name}`;

    if (runningInTauri()) {
      try {
        await invoke("secret_set", { name, value: trimmedValue });
        localStorage.setItem(fallbackKey, trimmedValue);
        return;
      } catch {
        // Fallback below.
      }
    }

    localStorage.setItem(fallbackKey, trimmedValue);
  }
}
