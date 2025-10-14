import express from "express";
import fetch from "node-fetch";
import { WebcastPushConnection } from "tiktok-live-connector";

const app = express();
app.use(express.json({ type: "application/json; charset=utf-8" }));

// ✅ Cambia estos valores:
const TIKTOK_USERNAME = "nombre_de_usuario"; // tu usuario sin @
const TARGET_WEBHOOK_URL = "https://tu_webhook_aqui.com"; // donde envías los datos

// Servidor Express
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🌍 Servidor Express escuchando en puerto ${PORT}`);
  connectToTikTok();
});

// Función principal para conectar al Live
async function connectToTikTok() {
  console.log(`🔌 Intentando conectar al Live de @${TIKTOK_USERNAME}...`);
  const tiktokConnection = new WebcastPushConnection(TIKTOK_USERNAME);

  try {
    const state = await tiktokConnection.connect();
    console.log(`✅ Conectado al Live de @${state.roomInfo.ownerId}`);

    // Escucha los mensajes del chat
    tiktokConnection.on("chat", async (data) => {
      const payload = {
        username: data.nickname, // 👈 Aquí se usa el nickname pero se mantiene el campo "username"
        comment: data.comment,
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

    // Manejo de desconexión o error
    tiktokConnection.on("disconnected", () => {
      console.log("⚠️ Desconectado del live. Reintentando en 60 segundos...");
      setTimeout(connectToTikTok, 60000);
    });

    tiktokConnection.on("error", (err) => {
      console.error("❌ Error en la conexión:", err.message);
      setTimeout(connectToTikTok, 60000);
    });

  } catch (err) {
    console.error("❌ No hay live activo o error al conectar:", err.message);
    const retry = Math.floor(Math.random() * 90 + 30); // reintento entre 30 y 120 seg
    console.log(`⏳ Reintentando en ${retry} segundos...`);
    setTimeout(connectToTikTok, retry * 1000);
  }
}

// Ruta básica para verificar el estado del servidor
app.get("/", (req, res) => {
  res.send("✅ Servidor TikTok Webhook Forwarder activo");
});
