export interface SlackPort {
  sendMessage(tokenRef: string, slackUserId: string, text: string): Promise<void>;
  testConnection(tokenRef: string): Promise<string>;
}
