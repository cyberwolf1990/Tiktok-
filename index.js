import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para parsear JSON (opcional, útil si recibirás webhooks)
app.use(express.json());

// Ruta principal de prueba
app.get("/", (req, res) => {
  res.send("✅ Servidor TikTok Webhook Forwarder activo");
});

// Ruta POST para recibir webhooks de TikTok o reenviarlos
app.post("/webhook", (req, res) => {
  console.log("📩 Datos recibidos:", req.body);
  res.status(200).json({ message: "Webhook recibido correctamente" });
});

// Inicia el servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
