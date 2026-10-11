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
  reconnectDelay: parseInt(process.env.RECONNECT_DELAY || '5000', 10),
  maxReconnectDelay: parseInt(process.env.MAX_RECONNECT_DELAY || '60000', 10),
  antiAfk: (process.env.ANTI_AFK || 'true') === 'true',
  antiAfkInterval: parseInt(process.env.ANTI_AFK_INTERVAL || '30000', 10)
};

let bot = null;
let reconnectTimer = null;
let antiAfkTimer = null;
let watchdogTimer = null;
let currentDelay = CONFIG.reconnectDelay;
let lastPacketTime = Date.now();
let reconnectCount = 0;
let lastReconnectLog = 0;

const ts = () => new Date().toISOString();

/* Web server: status endpoint + keeps the Render instance awake */
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({
    status: 'running',
    bot: (bot && bot.entity) ? 'connected' : 'disconnected',
    target: CONFIG.host ? `${CONFIG.host}:${CONFIG.port}` : 'SERVER_HOST not set',
    uptimeSeconds: Math.floor(process.uptime()),
    totalReconnects: reconnectCount
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

/* Heavily modded Forge servers send 1MB+ unlock_recipes and declare_commands
   packets that crash the vanilla protocol parser. The connection dies.
   Solution: detect the dead connection (watchdog) and reconnect fast.
   Each reconnect counts as a player join, keeping the Aternos server awake. */
function safeReconnect() {
  stopAntiAfk();
  stopWatchdog();
  try { if (bot) bot.end(); } catch (e) {}
  scheduleReconnect();
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  const delay = currentDelay;
  currentDelay = Math.min(currentDelay * 2, CONFIG.maxReconnectDelay);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectBot();
  }, delay);
}

function startWatchdog() {
  stopWatchdog();
  watchdogTimer = setInterval(() => {
    const silence = Date.now() - lastPacketTime;
    if (silence > 30000) {
      console.log(`[${ts()}] Watchdog: no packets for ${Math.floor(silence / 1000)}s, forcing reconnect`);
      reconnectCount++;
      safeReconnect();
    }
  }, 10000);
}

function stopWatchdog() {
  if (watchdogTimer) { clearInterval(watchdogTimer); watchdogTimer = null; }
}

function connectBot() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  lastPacketTime = Date.now();

  if (!CONFIG.host) {
    console.log(`[${ts()}] SERVER_HOST is not set`);
    return scheduleReconnect();
  }

  const options = {
    host: CONFIG.host,
    port: CONFIG.port,
    username: CONFIG.username,
    version: CONFIG.version || false,
    auth: CONFIG.auth,
    hideErrors: false
  };
  if (CONFIG.auth === 'microsoft') {
    options.username = CONFIG.email;
    options.password = CONFIG.password;
  }

  try {
    bot = mineflayer.createBot(options);
  } catch (e) {
    console.log(`[${ts()}] createBot threw: ${e.message}`);
    return scheduleReconnect();
  }

  /* Forge handshake via minecraft-protocol-forge */
  if (CONFIG.forge && bot._client) {
    try {
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
    } catch (e) {
      console.log(`[${ts()}] Forge handshake failed: ${e.message}`);
    }
  } else if (CONFIG.forge) {
    console.log(`[${ts()}] Warning: bot._client not available, Forge disabled for this attempt`);
  }

  /* Watch every packet: update lastPacketTime so the watchdog
     knows the connection is alive */
  if (bot._client) {
    bot._client.on('packet', () => { lastPacketTime = Date.now(); });
    bot._client.on('end', () => {
      console.log(`[${ts()}] Client ended`);
      reconnectCount++;
      safeReconnect();
    });
    bot._client.on('error', (err) => {
      console.log(`[${ts()}] Client error: ${err && err.message}`);
      reconnectCount++;
      safeReconnect();
    });
  }

  bot.once('spawn', () => {
    currentDelay = CONFIG.reconnectDelay;
    console.log(`[${ts()}] Bot is in game`);
    startAntiAfk();
    startWatchdog();
  });

  bot.on('death', () => {
    console.log(`[${ts()}] Bot died, respawning`);
    try { bot.respawn(); } catch (e) {}
  });

  bot.on('kicked', (reason) => {
    console.log(`[${ts()}] Kicked: ${JSON.stringify(reason)}`);
    reconnectCount++;
  });

  bot.on('error', (err) => {
    console.log(`[${ts()}] Error: ${err && err.message}`);
    reconnectCount++;
    safeReconnect();
  });

  bot.on('end', () => {
    console.log(`[${ts()}] Connection ended`);
    reconnectCount++;
    stopAntiAfk();
    stopWatchdog();
    scheduleReconnect();
  });

  /* Log reconnect rate: if >5 per minute, modpack is too heavy */
  const now = Date.now();
  if (now - lastReconnectLog > 60000) {
    lastReconnectLog = now;
    if (reconnectCount > 5) {
      console.log(`[${ts()}] Warning: ${reconnectCount} reconnects in the last minute — modpack is very heavy for mineflayer`);
    }
  }
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

/* Global crash resilience */
process.on('uncaughtException', (err) => {
  console.log(`[${ts()}] Uncaught: ${err && (err.stack || err.message)}`);
  reconnectCount++;
  safeReconnect();
});

process.on('unhandledRejection', (err) => {
  console.log(`[${ts()}] Unhandled rejection: ${err && (err.stack || err.message)}`);
  reconnectCount++;
  safeReconnect();
});

let mineflayerVersion = 'unknown';
try { mineflayerVersion = require('mineflayer/package.json').version; } catch (e) {}

console.log(`[${ts()}] Config: forge=${CONFIG.forge} | version=${CONFIG.version || 'auto'} | host=${CONFIG.host}`);
console.log(`[${ts()}] Runtime: node=${process.version} | mineflayer=${mineflayerVersion}`);

connectBot();
