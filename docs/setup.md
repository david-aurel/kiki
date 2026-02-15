# Setup

## 1. Install dependencies
```bash
npm install
```

## 2. Start app
Web shell:
```bash
npm run dev
```

Desktop app:
```bash
npm run tauri:dev
```

## 3. Configure settings
In app `Settings`:
- GitHub token ref (default `github_pat`)
- Slack token ref (default `slack_bot`)
- Slack user ID (`U...`)
- Team handles (optional, one `org/team` per line)

Paste token values and click `Save`.

## 4. Validate integrations
- Click `Test GitHub`
- Click `Test Slack`
- Click `Sync Now`
