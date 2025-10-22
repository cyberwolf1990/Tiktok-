import express from "express";
import fetch from "node-fetch";
import { WebcastPushConnection } from "tiktok-live-connector";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const TARGET_WEBHOOK_URL = process.env.TARGET_WEBHOOK_URL || "https://tu-webhook.macrodroid.com";
const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME || "godbelcebu";

let tiktokConnection;
let recentMessages = new Set(); // Guarda los últimos msgId recibidos para evitar duplicados
const MAX_STORED_MESSAGES = 200; // Límite de memoria para el Set

async function startTikTokConnection() {
  try {
    console.log(`🚀 Intentando conectar con @${TIKTOK_USERNAME}...`);
    tiktokConnection = new WebcastPushConnection(TIKTOK_USERNAME);

    tiktokConnection.connect()
      .then((state) => {
        console.log(`✅ Conectado al live de @${TIKTOK_USERNAME} (RoomID: ${state.roomId})`);
      })
      .catch((err) => {
        console.error("❌ No hay live activo o error al conectar:", err.message);
      });

    // Cuando alguien comenta
    tiktokConnection.on("chat", async (data) => {
      // Evita mensajes repetidos
      if (recentMessages.has(data.msgId)) return;
      recentMessages.add(data.msgId);
      if (recentMessages.size > MAX_STORED_MESSAGES) {
        // Mantiene el Set con tamaño controlado
        recentMessages = new Set([...recentMessages].slice(-MAX_STORED_MESSAGES));
      }

      // Forzar obtención del nickname
      const nickname =
        data.nickname ||
        data.user?.nickname ||
        data.user?.profile?.nickname ||
        data.userProfile?.nickname ||
        data.userInfo?.nickname ||
        data.uniqueId ||
        "Desconocido";

      const payload = {
        nickname: nickname,
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

    // Cuando termina el live
    tiktokConnection.on("streamEnd", () => {
      console.log("⚠️ Live terminado, reconectando en 60s...");
      setTimeout(startTikTokConnection, 60000);
    });

  } catch (err) {
    console.error("❌ Error inicializando TikTok:", err.message);
  }
}

app.get("/", (req, res) => {
  res.send("✅ Servidor TikTok Webhook Forwarder corriendo correctamente");
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  startTikTokConnection();
});
