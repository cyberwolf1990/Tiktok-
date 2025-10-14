import express from "express";
import { WebcastPushConnection } from "tiktok-live-connector";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 8080;

const TIKTOK_USER = process.env.TIKTOK_USERNAME || "nombre_de_usuario";
const TARGET_WEBHOOK_URL = process.env.TARGET_WEBHOOK_URL || "https://tu-webhook-aqui.com/recibir";

let connection = null;
let isConnecting = false;

// Función para iniciar la conexión
async function connectToLive() {
  if (isConnecting) return;
  isConnecting = true;

  try {
    console.log(`🔌 Intentando conectar al Live de @${TIKTOK_USER}...`);
    connection = new WebcastPushConnection(TIKTOK_USER);
    const state = await connection.connect();
    console.log(`✅ Conectado al Live de @${state.roomInfo.owner.user.uniqueId}`);

    // Cuando llega un comentario
    connection.on("chat", async (data) => {
      const payload = {
        username: data.uniqueId,
        comment: data.comment,
        timestamp: new Date().toISOString()
      };

      try {
        await fetch(TARGET_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=UTF-8" },
          body: JSON.stringify(payload)
        });
        console.log(`💬 Enviado: ${data.uniqueId}: ${data.comment}`);
      } catch (err) {
        console.error("❌ Error al enviar al webhook:", err.message);
      }
    });

    // Si se desconecta, reintenta
    connection.on("disconnected", () => {
      console.log("⚠️ Desconectado del Live. Reintentando en 60 segundos...");
      isConnecting = false;
      setTimeout(connectToLive, 60000);
    });
  } catch (err) {
    console.log("❌ No hay live activo o error al conectar:", err.message || err);
    isConnecting = false;
    setTimeout(connectToLive, 60000);
  }
}

// Llamamos por primera vez
connectToLive();

app.get("/", (req, res) => {
  res.send("✅ TikTok Live Connector activo y reenviando mensajes");
});

app.listen(PORT, () => {
  console.log(`🌍 Servidor Express escuchando en puerto ${PORT}`);
});
