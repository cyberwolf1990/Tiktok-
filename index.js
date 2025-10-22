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

async function startTikTokConnection() {
  try {
    console.log(`🚀 Conectando con @${TIKTOK_USERNAME}...`);
    tiktokConnection = new WebcastPushConnection(TIKTOK_USERNAME);

    tiktokConnection.connect()
      .then((state) => {
        console.log(`✅ Conectado al live de @${TIKTOK_USERNAME} (RoomID: ${state.roomId})`);
      })
      .catch((err) => {
        console.error("❌ No hay live activo o error al conectar:", err.message);
      });

    // 🗨️ Evento de chat
    tiktokConnection.on("chat", async (data) => {
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

      const comment = Buffer.from(data.comment, "utf8").toString("utf8");

      const payload = {
        nickname,
        comment,
        timestamp: Date.now(),
      };

      console.log("💬 Comentario recibido:", payload);

      try {
        const res = await fetch(TARGET_WEBHOOK_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
          },
          body: JSON.stringify(payload),
        });
        console.log(`📤 Enviado a webhook (status: ${res.status})`);
      } catch (err) {
        console.error("❌ Error enviando al webhook:", err.message);
      }
    });

    // 🟡 Cuando termina el live
    tiktokConnection.on("streamEnd", () => {
      console.log("⚠️ Live terminado, reconectando en 60s...");
      setTimeout(startTikTokConnection, 60000);
    });

  } catch (err) {
    console.error("❌ Error inicializando TikTok:", err.message);
  }
}

app.get("/", (req, res) => {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.send("✅ Servidor TikTok Webhook Forwarder corriendo correctamente con UTF-8");
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  startTikTokConnection();
});
