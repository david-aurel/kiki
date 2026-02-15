import { invoke } from "@tauri-apps/api/core";
import type { SlackPort } from "../../ports/slack";
import type { SecretsPort } from "../../ports/secrets";

interface SlackResponse {
  ok: boolean;
  error?: string;
  team?: string;
  url?: string;
}

function runningInTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export class SlackHttpAdapter implements SlackPort {
  constructor(private readonly secrets: SecretsPort) {}

  async sendMessage(tokenRef: string, slackUserId: string, text: string): Promise<void> {
    const token = await this.requireToken(tokenRef);
    const payload = await this.callSlack(token, "chat.postMessage", {
      channel: slackUserId,
      text,
      mrkdwn: true,
      unfurl_links: false,
      unfurl_media: false
    });

    if (!payload.ok) {
      throw new Error(`Slack API error: ${payload.error || "unknown_error"}`);
    }
  }

  async testConnection(tokenRef: string): Promise<string> {
    const token = await this.requireToken(tokenRef);
    const payload = await this.callSlack(token, "auth.test", {});
    if (!payload.ok) {
      throw new Error(`Slack auth failed: ${payload.error || "unknown_error"}`);
    }

    return payload.team || payload.url || "connected";
  }

  private async requireToken(tokenRef: string): Promise<string> {
    const token = await this.secrets.get(tokenRef);
    if (!token) throw new Error(`Missing Slack token for ref '${tokenRef}'`);
    return token;
  }

  private async callSlack(token: string, method: string, body: Record<string, unknown>): Promise<SlackResponse> {
    if (runningInTauri()) {
      return invoke<SlackResponse>("slack_api_call", { token, method, body });
    }

    const response = await fetch(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    return response.json() as Promise<SlackResponse>;
  }
}
