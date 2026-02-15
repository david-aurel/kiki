# Runbook

## Sync failed with GitHub auth error
- Re-open Settings.
- Re-save GitHub PAT under the configured token ref.
- Confirm token scopes include notifications/PR read access.

## Sync failed with Slack auth error
- Re-save Slack bot token.
- Validate `chat:write` scope.
- Confirm Slack user ID is valid (`U...`).

## No messages delivered
- Check focus mode is not filtering everything.
- Check suppressed reasons list for over-filtering.
- Inspect Inbox > Suppressed entries.
