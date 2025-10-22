import express from "express";
import fetch from "node-fetch";
import { WebcastPushConnection } from "tiktok-live-connector";
import crypto from "crypto";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const TARGET_WEBHOOK_URL = process.env.TARGET_WEBHOOK_URL || "https://tu-webhook.macrodroid.com";
const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME || "godbelcebu";

let tiktokConnection;
let reconnectAttempt = 0;
const MAX_RECONNECT_INTERVAL_MS = 300000; // 5 min
const RECONNECT_BASE_MS = 5000; // 5 seg

// --- Cache para evitar mensajes duplicados ---
const recentMessages = new Set();
const CACHE_LIFESPAN_MS = 8000;

// --- Funciones auxiliares ---
function generateHash(data) {
  const base = `${data.user?.uniqueId || ""}:${data.comment}`;
  return crypto.createHash("sha256").update(base).digest("hex");
}

async function sendToWebhook(payload) {
  try {
    const res = await fetch(TARGET_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    console.log(`📤 Enviado a webhook (${res.status})`);
  } catch (err) {
    console.error("❌ Error al enviar webhook:", err.message);
  }
}

function calculateReconnectDelay() {
  return Math.min(RECONNECT_BASE_MS * Math.pow(2, reconnectAttempt), MAX_RECONNECT_INTERVAL_MS);
}

function reconnect() {
  reconnectAttempt++;
  console.log(`♻️ Reintentando conexión en ${calculateReconnectDelay() / 1000}s...`);
  setTimeout(startTikTokConnection, calculateReconnectDelay());
}

// --- Conexión principal ---
async function startTikTokConnection() {
  try {
    console.log(`🚀 Conectando con @${TIKTOK_USERNAME}...`);

    tiktokConnection = new WebcastPushConnection(TIKTOK_USERNAME, {
      processInitialData: false
    });

    tiktokConnection.on("connect", (state) => {
      console.log(`✅ Conectado al live de @${TIKTOK_USERNAME} (RoomID: ${state.roomId})`);
      reconnectAttempt = 0;
    });

    tiktokConnection.on("error", (err) => {
      console.error("❌ Error en la conexión:", err.message);
      reconnect();
    });

    tiktokConnection.on("streamEnd", () => {
      console.log("⚠️ El live terminó. Reintentando más tarde...");
      reconnect();
    });

    // --- Solo evento chat ---
    tiktokConnection.on("chat", async (data) => {
      const hash = generateHash(data);
      if (recentMessages.has(hash)) return;

      recentMessages.add(hash);
      setTimeout(() => recentMessages.delete(hash), CACHE_LIFESPAN_MS);

      const nickname = data.nickname || data.user?.nickname || data.uniqueId || "Desconocido";

      const payload = {
        event: "chat",
        nickname: nickname,
        comment: data.comment,
        timestamp: Date.now()
      };

      console.log(`💬 ${nickname}: "${data.comment}"`);
      sendToWebhook(payload);
    });

    await tiktokConnection.connect();

  } catch (err) {
    console.error("❌ Error grave al conectar:", err.message);
    reconnect();
  }
}

// --- Servidor Express ---
app.get("/", (req, res) => {
  res.send(`✅ Servidor TikTok Chat Forwarder corriendo. Monitoreando: @${TIKTOK_USERNAME}`);
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  startTikTokConnection();
});
