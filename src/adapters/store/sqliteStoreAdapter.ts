import { invoke } from "@tauri-apps/api/core";
import type { DeliveryLogEntry, StorePort } from "../../ports/store";

const fallbackKey = "kiki_store_v2";

interface StoreState {
  processedKeys: string[];
  deliveries: DeliveryLogEntry[];
  suppressions: DeliveryLogEntry[];
}

function runningInTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function readFallback(): StoreState {
  const raw = localStorage.getItem(fallbackKey);
  if (!raw) return { processedKeys: [], deliveries: [], suppressions: [] };

  try {
    return JSON.parse(raw) as StoreState;
  } catch {
    return { processedKeys: [], deliveries: [], suppressions: [] };
  }
}

function writeFallback(state: StoreState): void {
  localStorage.setItem(fallbackKey, JSON.stringify(state));
}

export class SqliteStoreAdapter implements StorePort {
  async hasProcessedKey(key: string): Promise<boolean> {
    if (runningInTauri()) {
      return invoke<boolean>("db_has_processed_key", { key });
    }

    return readFallback().processedKeys.includes(key);
  }

  async logDelivery(entry: DeliveryLogEntry): Promise<void> {
    if (runningInTauri()) {
      await invoke("db_log_delivery", { entry });
      return;
    }

    const state = readFallback();
    state.processedKeys.push(entry.key);
    state.deliveries.push(entry);
    writeFallback(state);
  }

  async logSuppression(entry: DeliveryLogEntry): Promise<void> {
    if (runningInTauri()) {
      await invoke("db_log_suppression", { entry });
      return;
    }

    const state = readFallback();
    state.processedKeys.push(entry.key);
    state.suppressions.push(entry);
    writeFallback(state);
  }

  async listDeliveries(): Promise<DeliveryLogEntry[]> {
    if (runningInTauri()) {
      return invoke<DeliveryLogEntry[]>("db_list_deliveries");
    }

    return readFallback().deliveries;
  }

  async listSuppressions(): Promise<DeliveryLogEntry[]> {
    if (runningInTauri()) {
      return invoke<DeliveryLogEntry[]>("db_list_suppressions");
    }

    return readFallback().suppressions;
  }
}
