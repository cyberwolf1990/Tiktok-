import express from "express";
import { WebcastPushConnection } from "tiktok-live-connector";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 8080;

// 👇 Configura estas variables desde Railway o en tu entorno local
const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME || "nombre_de_usuario";
const TARGET_WEBHOOK_URL = process.env.TARGET_WEBHOOK_URL || "https://tu-webhook-aqui.com/recibir";

// Middleware para recibir JSON
app.use(express.json());

// Ruta de prueba
app.get("/", (req, res) => {
  res.send("✅ TikTok Live Connector activo y reenviando mensajes");
});

// --- Función para iniciar conexión con TikTok Live ---
async function startTikTokConnection() {
  const tiktokLiveConnection = new WebcastPushConnection(TIKTOK_USERNAME);

  // Evento: cuando alguien escribe en el chat
  tiktokLiveConnection.on("chat", async (data) => {
    console.log(`💬 ${data.uniqueId}: ${data.comment}`);

    // Enviar mensaje al webhook
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
      console.error("❌ Error al enviar al webhook:", err.message);
    }
  });

  // Evento: desconexión automática
  tiktokLiveConnection.on("disconnected", () => {
    console.log("⚠️ Desconectado del Live, intentando reconectar en 5s...");
    setTimeout(startTikTokConnection, 5000);
  });

  // Intentar conectar
  try {
    console.log(`🔌 Conectando al Live de @${TIKTOK_USERNAME}...`);
    const state = await tiktokLiveConnection.connect();
    console.log(`✅ Conectado al Live de @${state.roomInfo.owner.user.uniqueId}`);
  } catch (err) {
    console.error("❌ Error al conectar con TikTok:", err.message);
    console.log("Reintentando en 10 segundos...");
    setTimeout(startTikTokConnection, 10000);
  }
}

// Iniciar servidor Express
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  startTikTokConnection();
});
