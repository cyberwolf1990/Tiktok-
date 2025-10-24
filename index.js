import express from "express";
import fetch from "node-fetch";
import { WebcastPushConnection } from "tiktok-live-connector";

const app = express();
app.use(express.json({ limit: "1mb", type: "application/json" }));

const PORT = process.env.PORT || 8080;
const TARGET_WEBHOOK_URL = process.env.TARGET_WEBHOOK_URL || "https://tu-webhook.macrodroid.com";
const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME || "godbelcebu";

let tiktokConnection;
let recentMessages = new Set();
const MAX_STORED_MESSAGES = 200;

// Inactividad máxima antes de reiniciar (2 min)
const INACTIVITY_LIMIT_MS = 120000;
let lastMessageTime = Date.now();

async function startTikTokConnection() {
  try {
    console.log(`🚀 Conectando con @${TIKTOK_USERNAME}...`);
    tiktokConnection = new WebcastPushConnection(TIKTOK_USERNAME);

    await tiktokConnection.connect();
    console.log(`✅ Conectado al live de @${TIKTOK_USERNAME}`);

    // 🗨️ Chat y stickers
    tiktokConnection.on("chat", async (data) => {
      lastMessageTime = Date.now();

      // Evita duplicados
      if (recentMessages.has(data.msgId)) return;
      recentMessages.add(data.msgId);
      if (recentMessages.size > MAX_STORED_MESSAGES) {
        recentMessages = new Set([...recentMessages].slice(-MAX_STORED_MESSAGES));
      }

      const nickname =
        data.nickname ||
        data.user?.nickname ||
        data.user?.profile?.nickname ||
        data.userProfile?.nickname ||
        data.uniqueId ||
        "Desconocido";

      const comment = Buffer.from(data.comment || "", "utf8").toString("utf8");

      // Detecta stickers correctamente
      const stickerUrl =
        data.sticker?.image?.url ||   // stickers estándar
        data.emote?.image?.url ||     // stickers/emotes en chat
        null;

      const payload = {
        nickname,
        comment,
        stickerUrl,
        timestamp: Date.now(),
      };

      console.log("💬 Comentario recibido:", payload);

      try {
        const res = await fetch(TARGET_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify(payload),
        });
        console.log(`📤 Enviado a webhook (status: ${res.status})`);
      } catch (err) {
        console.error("❌ Error enviando al webhook:", err.message);
      }
    });

    // 🟡 Live terminado
    tiktokConnection.on("streamEnd", () => {
      console.log("⚠️ Live terminado, reconectando en 60s...");
      setTimeout(startTikTokConnection, 60000);
    });

    // 🔌 Desconexión inesperada
    tiktokConnection.on("disconnected", () => {
      console.warn("⚠️ Conexión perdida, reconectando en 10s...");
      setTimeout(startTikTokConnection, 10000);
    });

    // 💓 Heartbeat: revisa cada 60s si hubo mensajes
    setInterval(() => {
      const now = Date.now();
      if (now - lastMessageTime > INACTIVITY_LIMIT_MS) {
        console.warn("⚠️ Inactividad detectada, reiniciando conexión TikTok...");
        try { tiktokConnection.disconnect(); } catch(e) {}
        startTikTokConnection();
      }
    }, 60000);

  } catch (err) {
    console.error("❌ Error inicializando TikTok:", err.message);
    console.log("🔁 Reintentando conexión en 30s...");
    setTimeout(startTikTokConnection, 30000);
  }
}

// --- Servidor Express ---
app.get("/", (req, res) => {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.send("✅ Servidor TikTok Webhook Forwarder corriendo con UTF-8, chat + stickers");
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  startTikTokConnection();
});
