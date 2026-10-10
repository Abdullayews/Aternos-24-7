const express = require('express');
const mineflayer = require('mineflayer');

const CONFIG = {
  host: process.env.SERVER_HOST || '',
  port: parseInt(process.env.SERVER_PORT || '25565', 10),
  username: process.env.BOT_NAME || 'AFK_Bot',
  auth: process.env.AUTH || 'offline',
  email: process.env.BOT_EMAIL || '',
  password: process.env.BOT_PASSWORD || '',
  version: process.env.MC_VERSION || undefined,
  forge: (process.env.FORGE || 'false') === 'true',
  reconnectDelay: parseInt(process.env.RECONNECT_DELAY || '10000', 10),
  maxReconnectDelay: parseInt(process.env.MAX_RECONNECT_DELAY || '120000', 10),
  antiAfk: (process.env.ANTI_AFK || 'true') === 'true',
  antiAfkInterval: parseInt(process.env.ANTI_AFK_INTERVAL || '30000', 10)
};

let bot = null;
let reconnectTimer = null;
let antiAfkTimer = null;
let currentDelay = CONFIG.reconnectDelay;

const ts = () => new Date().toISOString();

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({
    status: 'running',
    bot: (bot && bot.entity) ? 'connected' : 'disconnected',
    target: CONFIG.host ? `${CONFIG.host}:${CONFIG.port}` : 'SERVER_HOST yoxdur',
    uptimeSeconds: Math.floor(process.uptime())
  });
});

app.listen(PORT, () => console.log(`[${ts()}] Web server: ${PORT}`));

const SELF_URL = process.env.RENDER_EXTERNAL_URL;
if (SELF_URL) {
  setInterval(async () => {
    try {
      const res = await fetch(SELF_URL);
      console.log(`[${ts()}] Self-ping OK (${res.status})`);
    } catch (e) {
      console.log(`[${ts()}] Self-ping xəta: ${e.message}`);
    }
  }, 60 * 1000);
}

function connectBot() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

  if (!CONFIG.host) {
    console.log(`[${ts()}] SERVER_HOST yoxdur`);
    return scheduleReconnect();
  }

  const options = {
    host: CONFIG.host,
    port: CONFIG.port,
    username: CONFIG.username,
    version: CONFIG.version,
    auth: CONFIG.auth
  };
  if (CONFIG.auth === 'microsoft') {
    options.username = CONFIG.email;
    options.password = CONFIG.password;
  }
  if (CONFIG.forge) {
    options.forge = { version: 2 };
  }

  bot = mineflayer.createBot(options);

  bot.once('spawn', () => {
    currentDelay = CONFIG.reconnectDelay;
    console.log(`[${ts()}] Bot oyundadır`);
    startAntiAfk();
  });

  bot.on('death', () => {
    console.log(`[${ts()}] Bot öldü, yenidən doğulur`);
    bot.respawn();
  });

  bot.on('kicked', (reason) => {
    console.log(`[${ts()}] Qovuldu: ${JSON.stringify(reason)}`);
  });

  bot.on('error', (err) => {
    console.log(`[${ts()}] Xəta: ${err.message}`);
    scheduleReconnect();
  });

  bot.on('end', () => {
    console.log(`[${ts()}] Bağlantı kəsildi`);
    stopAntiAfk();
    scheduleReconnect();
  });
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

connectBot();
console.log(`[${ts()}] Konfiq: forge=${CONFIG.forge} | version=${CONFIG.version || 'auto'} | host=${CONFIG.host}`);
