import express from "express";
import fetch from "node-fetch";
import { WebcastPushConnection } from "tiktok-live-connector";

const app = express();
const PORT = process.env.PORT || 8080;

// 🔧 Variables de entorno
const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME || "nombre_de_usuario";
const TARGET_WEBHOOK_URL = process.env.TARGET_WEBHOOK_URL || "https://tu-webhook-aqui.com/recibir";

app.use(express.json());

// 🌐 Endpoint básico para verificar que el servidor está activo
app.get("/", (req, res) => {
  res.send("✅ TikTok Live Connector activo y en espera de transmisión");
});

// --- Conexión con TikTok ---
let tiktokConnection = null;
let retryDelay = 30_000; // 30 segundos al inicio

async function connectToTikTok() {
  console.log(`🔌 Intentando conectar al Live de @${TIKTOK_USERNAME}...`);

  try {
    // Crear conexión nueva cada intento
    tiktokConnection = new WebcastPushConnection(TIKTOK_USERNAME);

    // 📩 Evento: nuevo mensaje en el chat
    tiktokConnection.on("chat", async (data) => {
      console.log(`💬 ${data.uniqueId}: ${data.comment}`);
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

    // ⚠️ Evento: desconexión
    tiktokConnection.on("disconnected", () => {
      console.warn("⚠️ Desconectado del Live, reintentando...");
      scheduleReconnect();
    });

    // 🚀 Intentar conectar
    const state = await tiktokConnection.connect();
    console.log(`✅ Conectado al Live de @${state.roomInfo.owner.user.uniqueId}`);
    retryDelay = 30_000; // Reiniciar el tiempo de espera si conecta

  } catch (err) {
    console.error("❌ No hay live activo o error al conectar con TikTok:");
    scheduleReconnect();
  }
}

// 🔁 Lógica de reconexión con retardo exponencial
function scheduleReconnect() {
  console.log(`⏳ Reintentando en ${retryDelay / 1000} segundos...`);
  setTimeout(connectToTikTok, retryDelay);
  retryDelay = Math.min(retryDelay * 2, 5 * 60_000); // Máximo 5 minutos
}

// 🚀 Iniciar servidor
app.listen(PORT, () => {
  console.log(`🌍 Servidor Express escuchando en puerto ${PORT}`);
  connectToTikTok(); // Conexión inicial al arrancar
});
