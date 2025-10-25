import express from "express";
import { WebcastPushConnection } from "tiktok-live-connector";

const app = express();
app.use(express.json({ limit: "1mb" }));

// --- Configuración ---
const PORT = process.env.PORT || 8080;
const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME || "godbelcebu";
const TARGET_WEBHOOK_URL = process.env.TARGET_WEBHOOK_URL || "https://tu-webhook.macrodroid.com";

// --- Variables globales ---
let tiktokConnection = null;
let recentMessages = new Set();
const MAX_STORED_MESSAGES = 200;

let lastMessageTime = Date.now();
const INACTIVITY_LIMIT_MS = 120000;
let heartbeatInterval = null;

// --- Función principal ---
async function startTikTokConnection() {
  try {
    if (tiktokConnection) {
      console.log("♻️ Reiniciando conexión...");
      try { await tiktokConnection.disconnect(); } catch {}
      tiktokConnection = null;
    }

    console.log(`🔗 Conectando con @${TIKTOK_USERNAME}...`);
    tiktokConnection = new WebcastPushConnection(TIKTOK_USERNAME);
    await tiktokConnection.connect();
    console.log(`✅ Conectado al live de @${TIKTOK_USERNAME}`);

    // --- Evento de chat ---
    tiktokConnection.on("chat", async (data) => {
      lastMessageTime = Date.now();
      if (recentMessages.has(data.msgId)) return;
      recentMessages.add(data.msgId);
      if (recentMessages.size > MAX_STORED_MESSAGES)
        recentMessages = new Set([...recentMessages].slice(-MAX_STORED_MESSAGES));

      const nickname =
        data.nickname ||
        data.user?.nickname ||
        data.uniqueId ||
        "Desconocido";

      const comment = data.comment || "";
      if (!comment.trim()) return; // ignora mensajes vacíos

      // --- Texto plano ---
      const textMessage = `${nickname} dice: ${comment}`;

      // Muestra el mensaje en consola solo en modo desarrollo
      if (process.env.NODE_ENV !== "production") console.log(textMessage);

      // --- Enviar texto plano al webhook ---
      try {
        await fetch(TARGET_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain; charset=utf-8" },
          body: textMessage
        });
      } catch (err) {
        console.error("⚠️ Error enviando al webhook:", err.message);
      }
    });

    // --- Eventos de desconexión ---
    tiktokConnection.on("disconnected", () => {
      console.warn("⚠️ Conexión perdida, reconectando en 10s...");
      setTimeout(startTikTokConnection, 10000);
    });

    tiktokConnection.on("streamEnd", () => {
      console.log("🔴 Live terminado, reconectando en 60s...");
      setTimeout(startTikTokConnection, 60000);
    });

    // --- Heartbeat (1 solo activo) ---
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(() => {
      const now = Date.now();
      if (now - lastMessageTime > INACTIVITY_LIMIT_MS) {
        console.log("⏰ Inactividad detectada, reiniciando...");
        startTikTokConnection();
      }
    }, 60000);

  } catch (err) {
    console.error("❌ Error de conexión:", err.message);
    console.log("Reintentando en 30s...");
    setTimeout(startTikTokConnection, 30000);
  }
}

// --- Servidor HTTP ---
app.get("/", (req, res) => {
  res.type("text/plain").send("Bot TikTok corriendo (envía mensajes en texto plano al webhook)");
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor activo en puerto ${PORT}`);
  startTikTokConnection();
});
