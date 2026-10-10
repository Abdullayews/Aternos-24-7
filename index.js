const express = require('express');
const mineflayer = require('mineflayer');
const { autoVersionForge, forgeHandshake } = require('minecraft-protocol-forge');

const CONFIG = {
  host: process.env.SERVER_HOST || '',
  port: parseInt(process.env.SERVER_PORT || '25565', 10),
  username: process.env.BOT_NAME || 'AFK_Bot',
  auth: process.env.AUTH || 'offline',
  email: process.env.BOT_EMAIL || '',
  password: process.env.BOT_PASSWORD || '',
  version: process.env.MC_VERSION || false,
  forge: (process.env.FORGE || 'false') === 'true',
  forgeMods: process.env.FORGE_MODS || '',
  reconnectDelay: parseInt(process.env.RECONNECT_DELAY || '10000', 10),
  maxReconnectDelay: parseInt(process.env.MAX_RECONNECT_DELAY || '120000', 10),
  antiAfk: (process.env.ANTI_AFK || 'true') === 'true',
  antiAfkInterval: parseInt(process.env.ANTI_AFK_INTERVAL || '30000', 10)
};

let bot = null;
let reconnectTimer = null;
let antiAfkTimer = null;
let currentDelay = CONFIG.reconnectDelay;
let ignoredParseErrors = 0;
let lastParseErrorLog = 0;

const ts = () => new Date().toISOString();

/* Web server: status endpoint + keeps the Render instance awake */
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({
    status: 'running',
    bot: (bot && bot.entity) ? 'connected' : 'disconnected',
    target: CONFIG.host ? `${CONFIG.host}:${CONFIG.port}` : 'SERVER_HOST not set',
    uptimeSeconds: Math.floor(process.uptime())
  });
});

app.listen(PORT, () => console.log(`[${ts()}] Web server listening on port ${PORT}`));

/* Self-ping: prevents the free instance from sleeping (Render only) */
const SELF_URL = process.env.RENDER_EXTERNAL_URL;
if (SELF_URL) {
  setInterval(async () => {
    try {
      const res = await fetch(SELF_URL);
      console.log(`[${ts()}] Self-ping OK (${res.status})`);
    } catch (e) {
      console.log(`[${ts()}] Self-ping failed: ${e.message}`);
    }
  }, 60 * 1000);
}

/* Heavily modded servers send huge packets (recipes, command tree)
   right after login that sometimes fail to parse. The AFK bot does
   not need those packets, so we ignore parse errors and keep the
   connection alive instead of crashing. */
function isParseError(err) {
  if (!err) return false;
  if (err.name === 'PartialReadError') return true;
  return /Read error|partial packet|Chunk size/i.test(err.message || '');
}

function logParseError() {
  ignoredParseErrors++;
  if (Date.now() - lastParseErrorLog > 10000) {
    lastParseErrorLog = Date.now();
    console.log(`[${ts()}] Ignored ${ignoredParseErrors} modded packet parse error(s) — not needed for AFK`);
  }
}

function safeReconnect() {
  stopAntiAfk();
  try { if (bot) bot.end(); } catch (e) {}
  scheduleReconnect();
}

function connectBot() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

  if (!CONFIG.host) {
    console.log(`[${ts()}] SERVER_HOST is not set`);
    return scheduleReconnect();
  }

  const options = {
    host: CONFIG.host,
    port: CONFIG.port,
    username: CONFIG.username,
    version: CONFIG.version || false,
    auth: CONFIG.auth
  };
  if (CONFIG.auth === 'microsoft') {
    options.username = CONFIG.email;
    options.password = CONFIG.password;
  }

  console.log(`[${ts()}] Connecting: ${CONFIG.host}:${CONFIG.port} (${CONFIG.username}, forge=${CONFIG.forge})`);

  bot = mineflayer.createBot(options);

  /* Forge handshake via minecraft-protocol-forge */
  if (CONFIG.forge && bot._client) {
    if (CONFIG.forgeMods) {
      const mods = CONFIG.forgeMods.split(',').map(s => {
        const [modid, version] = s.trim().split(':');
        return { modid, version };
      });
      forgeHandshake(bot._client, { forgeMods: mods });
      console.log(`[${ts()}] Forge handshake: manual mod list (${mods.length} mods)`);
    } else {
      autoVersionForge(bot._client);
      console.log(`[${ts()}] Forge handshake: auto-detecting mods from server`);
    }
  } else if (CONFIG.forge) {
    console.log(`[${ts()}] Warning: bot._client not available, Forge disabled for this attempt`);
  }

  bot.once('spawn', () => {
    currentDelay = CONFIG.reconnectDelay;
    console.log(`[${ts()}] Bot is in game`);
    startAntiAfk();
  });

  bot.on('death', () => {
    console.log(`[${ts()}] Bot died, respawning`);
    bot.respawn();
  });

  bot.on('kicked', (reason) => {
    console.log(`[${ts()}] Kicked: ${JSON.stringify(reason)}`);
  });

  bot.on('error', (err) => {
    if (isParseError(err)) { logParseError(); return; }
    console.log(`[${ts()}] Error: ${err && err.message}`);
    safeReconnect();
  });

  bot.on('end', () => {
    console.log(`[${ts()}] Connection ended`);
    stopAntiAfk();
    scheduleReconnect();
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  const delay = currentDelay;
  currentDelay = Math.min(currentDelay * 2, CONFIG.maxReconnectDelay);
  console.log(`[${ts()}] Reconnecting in ${delay / 1000}s`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectBot();
  }, delay);
}

function startAntiAfk() {
  stopAntiAfk();
  if (!CONFIG.antiAfk) return;
  antiAfkTimer = setInterval(() => {
    try {
      if (bot && bot.entity) {
        bot.look(
          bot.entity.yaw + (Math.random() - 0.5) * 0.5,
          bot.entity.pitch + (Math.random() - 0.5) * 0.2,
          false
        );
        bot.swingArm();
      }
    } catch (e) {}
  }, CONFIG.antiAfkInterval);
}

function stopAntiAfk() {
  if (antiAfkTimer) { clearInterval(antiAfkTimer); antiAfkTimer = null; }
}

/* Crash resilience: parse errors are ignored, everything else
   triggers a clean reconnect instead of killing the process */
process.on('uncaughtException', (err) => {
  if (isParseError(err)) { logParseError(); return; }
  console.log(`[${ts()}] Uncaught exception: ${err && (err.stack || err.message)}`);
  safeReconnect();
});

process.on('unhandledRejection', (err) => {
  console.log(`[${ts()}] Unhandled rejection: ${err && (err.stack || err.message)}`);
  safeReconnect();
});

let mineflayerVersion = 'unknown';
try { mineflayerVersion = require('mineflayer/package.json').version; } catch (e) {}

console.log(`[${ts()}] Config: forge=${CONFIG.forge} | version=${CONFIG.version || 'auto'} | host=${CONFIG.host}`);
console.log(`[${ts()}] Runtime: node=${process.version} | mineflayer=${mineflayerVersion}`);

connectBot();
