import express from "express";
import fetch from "node-fetch";
import { WebcastPushConnection } from "tiktok-live-connector";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const TARGET_WEBHOOK_URL = process.env.TARGET_WEBHOOK_URL || "https://tu-webhook.macrodroid.com"; // cámbialo por el tuyo
const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME || "godbelcebu"; // cámbialo por tu usuario

let tiktokConnection;

// Función para iniciar la conexión con TikTok
async function startTikTokConnection() {
  try {
    console.log(`🚀 Intentando conectar con @${TIKTOK_USERNAME}...`);
    tiktokConnection = new WebcastPushConnection(TIKTOK_USERNAME);

    tiktokConnection.connect().then((state) => {
      console.log(`✅ Conectado al live de @${state.roomId}`);
    }).catch((err) => {
      console.error("❌ No hay live activo o error al conectar:", err.message);
      console.log("⚠️ Intentando reconectar en 60s...");
      setTimeout(startTikTokConnection, 60000);
    });

    // Evento: cuando alguien comenta
    tiktokConnection.on("chat", async (data) => {
      const payload = {
        nickname: data.user.nickname, // <- enviamos el nickname
        comment: data.comment,
        timestamp: Date.now()
      };

      console.log("💬 Comentario recibido:", payload);

      try {
        const res = await fetch(TARGET_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify(payload)
        });
        console.log(`📤 Enviado a webhook (status: ${res.status})`);
      } catch (err) {
        console.error("❌ Error enviando al webhook:", err.message);
      }
    });

    // Evento: live terminado o conexión perdida
    tiktokConnection.on("streamEnd", () => {
      console.log("⚠️ Live terminado, reconectando en 60s...");
      setTimeout(startTikTokConnection, 60000);
    });

  } catch (err) {
    console.error("❌ Error inicializando TikTok:", err.message);
    console.log("⚠️ Intentando reconectar en 60s...");
    setTimeout(startTikTokConnection, 60000);
  }
}

// --- Simulación de comentarios para pruebas ---
function simulateComments() {
  console.log("🧪 Modo prueba activado: simulando comentarios...");

  setInterval(async () => {
    const mockData = {
      user: { nickname: "UsuarioPrueba" },
      comment: "¡Hola desde la simulación!"
    };

    const payload = {
      nickname: mockData.user.nickname,
      comment: mockData.comment,
      timestamp: Date.now()
    };

    console.log("💬 Comentario simulado:", payload);

    try {
      const res = await fetch(TARGET_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(payload)
      });
      console.log(`📤 Enviado al webhook de prueba (status: ${res.status})`);
    } catch (err) {
      console.error("❌ Error enviando comentario simulado:", err.message);
    }
  }, 5000); // cada 5 segundos
}

// Descomenta la siguiente línea para activar la simulación
// simulateComments();

// Endpoint opcional para verificar que el servidor corre
app.get("/", (req, res) => {
  res.send("✅ Servidor TikTok Webhook Forwarder corriendo correctamente");
});

// Iniciar servidor Express
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  startTikTokConnection();
});
