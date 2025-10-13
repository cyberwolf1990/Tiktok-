import express from "express";
import { WebcastPushConnection } from "tiktok-live-connector";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 8080;

// Tu nombre de usuario de TikTok (sin @)
const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME || "nombre_de_usuario";

// Webhook de destino (puede ser un Discord, tu API, etc.)
const TARGET_WEBHOOK_URL = process.env.TARGET_WEBHOOK_URL || "https://tu-webhook-aqui.com/recibir";

// --- Servidor Express ---
app.use(express.json());

app.get("/", (req, res) => {
  res.send("✅ TikTok Live Connector activo y reenviando mensajes");
});

// --- Conexión al Live ---
const tiktokLiveConnection = new WebcastPushConnection(TIKTOK_USERNAME);

// Cuando llega un mensaje nuevo del chat
tiktokLiveConnection.on("chat", async (data) => {
  console.log(`💬 ${data.uniqueId}: ${data.comment}`);

  // Reenvía el mensaje al webhook configurado
  try {
    await fetch(TARGET_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: data.uniqueId,
        comment: data.comment,
        timestamp: data.createTime,
      }),
    });
  } catch (err) {
    console.error("Error al enviar al webhook:", err.message);
  }
});

// Manejo de errores de conexión
tiktokLiveConnection.on("disconnected", () => {
  console.log("⚠️ Desconectado del Live, intentando reconectar...");
  setTimeout(() => tiktokLiveConnection.connect(), 5000);
});

// Intentar conexión inicial
(async () => {
  try {
    console.log(`🔌 Conectando al Live de @${TIKTOK_USERNAME}...`);
    const state = await tiktokLiveConnection.connect();
    console.log(`✅ Conectado al Live de @${state.roomInfo.owner.user.uniqueId}`);
  } catch (err) {
    console.error("❌ Error al conectar:", err);
  }
})();

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
