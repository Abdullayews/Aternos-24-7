````markdown
<div align="center">

# 🤖 aternos-afk-bot

**Keeps your free Aternos server awake 24/7 — without ever touching the power button.**

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18-green.svg)
![Cost](https://img.shields.io/badge/cost-%240.00-success.svg)
![Works on my server](https://img.shields.io/badge/works-on%20my%20server-blueviolet.svg)

</div>

---

## 💡 Why?

Aternos is amazing — a fully free Minecraft server. The catch: the moment the last player leaves, the server hibernates. And waking it up means queue, queue, queue.

**This bot is that one friend who never logs off.**

```
 Aternos sees a player online  →  server never hibernates
 Render app pings itself       →  app never sleeps
 ──────────────────────────────
 Result: 24/7 uptime · $0/month
```

## ✨ Features

- 🔌 **Auto-reconnect** with exponential backoff (10s → 2min) — survives restarts, crashes and queue rage
- 🕺 **Anti-AFK** micro-movements so the server doesn't idle-kick the bot
- 🩺 **Status endpoint** — check on your bot from anywhere via JSON
- 🔁 **Self-ping** keeps the free Render instance awake — no UptimeRobot needed
- ⚙️ **Zero code edits** — everything is configured with environment variables
- 🪶 **~120 lines** of readable code, no bloat, no build step

## 🚀 Quick start

### 1. Aternos side

- Grab your address: `something.aternos.me`
- Not using a premium account for the bot? **Options → Cracked: On**
- ⚠️ Start the server once from the panel — *the bot keeps a server awake, it can't wake one up*

### 2. Render side

1. Push this repo to GitHub
2. [render.com](https://render.com) → **New + → Web Service** → pick the repo
3. Configure:

| Setting | Value |
|---|---|
| Build Command | `npm install` |
| Start Command | `npm start` |
| Instance Type | **Free** |
| Region | Frankfurt (closest) |

4. Add environment variables (see below) → **Deploy**
5. Done. Watch **Logs** for `Bot is in game` 🎉

## ⚙️ Environment variables

| Variable | Default | Description |
|---|---|---|
| `SERVER_HOST` | *(required)* | Your address, e.g. `something.aternos.me` |
| `SERVER_PORT` | `25565` | Usually leave it — SRV records resolve automatically |
| `BOT_NAME` | `AFK_Bot` | ≤ 16 chars, letters/digits/`_` |
| `AUTH` | `offline` | `offline` for cracked servers, `microsoft` for a real account |
| `BOT_EMAIL` | — | Microsoft account email (only if `AUTH=microsoft`) |
| `BOT_PASSWORD` | — | Microsoft account password (only if `AUTH=microsoft`) |
| `MC_VERSION` | auto | Pin e.g. `1.20.4` if autodetect fails |
| `RECONNECT_DELAY` | `10000` | First reconnect delay, ms |
| `MAX_RECONNECT_DELAY` | `120000` | Reconnect backoff cap, ms |
| `ANTI_AFK` | `true` | Micro-movements on/off |
| `ANTI_AFK_INTERVAL` | `30000` | Movement frequency, ms |

Change any of these from the Render dashboard → **Environment** → the app redeploys automatically. No code edits, ever.

## 🩺 Status endpoint

Hit your Render URL (`https://your-app.onrender.com`) and get:

```json
{
  "status": "running",
  "bot": "connected",
  "target": "something.aternos.me:25565",
  "uptimeSeconds": 86400
}
```

## 🔧 Troubleshooting

| Symptom | Fix |
|---|---|
| Bot can't connect | Server is hibernating — start it once from the Aternos panel |
| `bot was kicked` | Check `BOT_NAME`, Cracked setting, whitelist |
| Version mismatch error | Set `MC_VERSION` manually |
| Microsoft login fails | Double-check `BOT_EMAIL` / `BOT_PASSWORD` |
| Render instance sleeps anyway | Check Logs for `Self-ping OK` — should appear every 60s |

## 🧪 Run locally

```bash
git clone https://github.com/you/aternos-afk-bot
cd aternos-afk-bot
npm install
SERVER_HOST=something.aternos.me BOT_NAME=MyBot npm start
```

(Self-ping is a no-op locally — it only activates on Render.)

## ⚠️ Disclaimer

Automating an AFK player goes against Aternos's terms of service, and they actively hunt bots. Worst case: your server or account gets banned. This project is for **educational purposes** — use at your own risk.

If you actually need reliable 24/7 hosting, consider [exaroton](https://exaroton.com) (Aternos's paid sibling, billed per minute) or a cheap VPS.
````
