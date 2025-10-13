// index.js
import express from "express";
import { connect } from "tiktok-live-connector";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// Ruta healthcheck (útil para Railway / uptime monitors)
app.get("/", (req, res) => res.send("OK - TikTok webhook forwarder"));

// Variables de entorno
const TIKTOK_USER = process.env.TIKTOK_USER;        // e.g. '@miusuario' o 'miusuario'
const WEBHOOK_URL = process.env.WEBHOOK_URL;        // URL a la que reenviar eventos
const RECONNECT_DELAY = Number(process.env.RECONNECT_DELAY || 10000);

if (!TIKTOK_USER || !WEBHOOK_URL) {
  console.error("Falta TIKTOK_USER o WEBHOOK_URL en las env vars. Abortando.");
  process.exit(1);
}

// Función que reenvía un objeto JSON al webhook
async function forwardToWebhook(payload) {
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      timeout: 10000
    });
    if (!res.ok) {
      console.warn("Webhook responded with non-OK:", res.status);
    }
  } catch (err) {
    console.error("Error enviando al webhook:", err?.message || err);
  }
}

// Conectar y escuchar
async function startConnector() {
  try {
    console.log("Intentando conectar a TikTok user:", TIKTOK_USER);
    const room = await connect(TIKTOK_USER);

    console.log("Conectado. Room id:", room.roomId);

    // eventos comunes
    room.on("chat", (data) => {
      console.log("CHAT:", data);
      forwardToWebhook({ type: "chat", data, receivedAt: new Date().toISOString() });
    });

    room.on("gift", (data) => {
      console.log("GIFT:", data);
      forwardToWebhook({ type: "gift", data, receivedAt: new Date().toISOString() });
    });

    room.on("join", (data) => {
      console.log("JOIN:", data);
      forwardToWebhook({ type: "join", data, receivedAt: new Date().toISOString() });
    });

    room.on("disconnected", (reason) => {
      console.warn("Desconectado:", reason);
      forwardToWebhook({ type: "disconnected", reason, at: new Date().toISOString() });
      // intentaremos reconectar
      setTimeout(() => startConnector(), RECONNECT_DELAY);
    });

    // Manejo de errores
    room.on("error", (err) => {
      console.error("ROOM ERROR:", err);
      forwardToWebhook({ type: "error", error: String(err), at: new Date().toISOString() });
    });

  } catch (err) {
    console.error("Fallo al conectar:", err?.message || err);
    setTimeout(() => startConnector(), RECONNECT_DELAY);
  }
}

startConnector();

// Levantamos express para healthcheck (puerto le asigna Railway vía env PORT)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`App corriendo en puerto ${PORT}`);
});
