import express from "express";
import fetch from "node-fetch";
import { WebcastPushConnection } from "tiktok-live-connector";
import crypto from "crypto";

const app = express();
app.use(express.json());

// --- CONFIGURACIÓN DE ENTORNO ---
const PORT = process.env.PORT || 8080;
const TARGET_WEBHOOK_URL = process.env.TARGET_WEBHOOK_URL || "https://tu-webhook-de-prueba.com";
const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME || "godbelcebu";

// --- VARIABLES DE ESTADO ---
let tiktokConnection;
let reconnectAttempt = 0;
let connectionStartTimestamp = 0; // 🔹 Guarda el momento de conexión
const MAX_RECONNECT_INTERVAL_MS = 300000; // 5 minutos
const RECONNECT_BASE_MS = 5000; // 5 segundos
const recentMessageCache = new Set();
const CACHE_LIFESPAN_MS = 10000;

// --- FUNCIONES AUXILIARES ---
function calculateReconnectDelay() {
    return Math.min(RECONNECT_BASE_MS * Math.pow(2, reconnectAttempt), MAX_RECONNECT_INTERVAL_MS);
}

function generateMessageHash(data, nickname) {
    const uniqueIdPart = data.user?.uniqueId || nickname;
    const commentPart = data.comment;
    const timeSegment = Math.floor(Date.now() / 5000) * 5000;
    return crypto.createHash("sha256").update(`${uniqueIdPart}:${commentPart}:${timeSegment}`).digest("hex");
}

async function sendToWebhook(payload) {
    try {
        const res = await fetch(TARGET_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json; charset=utf-8" },
            body: JSON.stringify(payload),
        });
        if (!res.ok) console.error(`❌ Error HTTP ${res.status} al enviar al webhook.`);
    } catch (err) {
        console.error("❌ Error al enviar al webhook:", err.message);
    }
}

/**
 * Inicializa la conexión con TikTok Live.
 */
async function startTikTokConnection() {
    try {
        const delay = calculateReconnectDelay();
        if (reconnectAttempt > 0) {
            console.log(`⏳ Reintentando en ${delay / 1000}s (intento #${reconnectAttempt})...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }

        console.log(`🚀 Conectando con @${TIKTOK_USERNAME}...`);

        tiktokConnection = new WebcastPushConnection(TIKTOK_USERNAME, {
            processInitialData: false,
            enableExtendedGiftInfo: true,
        });

        // --- EVENTOS DE CONEXIÓN ---
        tiktokConnection.on("connect", (state) => {
            connectionStartTimestamp = Math.floor(Date.now() / 1000); // 🔹 Momento exacto en segundos
            console.log(`✅ Conectado al live de @${TIKTOK_USERNAME} (RoomID: ${state.roomId})`);
            console.log(`⏱️ Ignorando mensajes anteriores a ${connectionStartTimestamp}`);
            reconnectAttempt = 0;
        });

        tiktokConnection.on("error", (err) => {
            console.error(`❌ Error en la conexión: ${err.message}`);
            reconnectLogic();
        });

        tiktokConnection.on("streamEnd", () => {
            console.log("⚠️ Live terminado o desconectado. Intentando reconectar...");
            reconnectLogic();
        });

        // --- MENSAJES DE CHAT ---
        tiktokConnection.on("chat", (data) => {
            const nickname = data.nickname || data.user?.nickname || data.uniqueId || "Desconocido";
            const msgTime = data.createTime || data.eventTime || 0; // segundos UNIX

            // ⛔ Ignorar mensajes anteriores al inicio de conexión
            if (msgTime < connectionStartTimestamp - 3) { 
                console.log(`⏩ Ignorado mensaje viejo (${nickname}): "${data.comment}"`);
                return;
            }

            const messageId = data.msgId || data.id || null;
            const uniqueKey = messageId ? `msg:${messageId}` : generateMessageHash(data, nickname);

            if (recentMessageCache.has(uniqueKey)) {
                console.log(`🚫 Duplicado omitido (${uniqueKey.substring(0, 8)}): "${data.comment}"`);
                return;
            }

            recentMessageCache.add(uniqueKey);
            setTimeout(() => recentMessageCache.delete(uniqueKey), CACHE_LIFESPAN_MS);

            const payload = {
                event: "chat",
                nickname,
                comment: data.comment,
                timestamp: Date.now(),
            };

            console.log(`💬 ${nickname}: "${data.comment}"`);
            sendToWebhook(payload);
        });

        // --- EVENTOS DE REGALOS ---
        tiktokConnection.on("gift", (data) => {
            const msgTime = data.createTime || data.eventTime || 0;
            if (msgTime < connectionStartTimestamp - 3) return; // evitar regalos antiguos

            console.log(`🎁 Regalo de ${data.nickname}: ${data.giftName} (x${data.repeatCount || 1})`);
            sendToWebhook({
                event: "gift",
                nickname: data.nickname,
                giftName: data.giftName,
                count: data.repeatCount || 1,
                timestamp: Date.now(),
            });
        });

        await tiktokConnection.connect();
    } catch (err) {
        console.error("❌ Error iniciando conexión:", err.message);
        reconnectLogic();
    }
}

/**
 * Lógica de reconexión con backoff exponencial.
 */
function reconnectLogic() {
    reconnectAttempt++;
    console.log("♻️ Limpiando caché antes de reconectar...");
    recentMessageCache.clear();
    tiktokConnection?.disconnect();
    setTimeout(startTikTokConnection, calculateReconnectDelay());
}

// --- SERVIDOR EXPRESS ---
app.get("/", (req, res) => {
    res.send(`✅ Servidor TikTok Forwarder corriendo. Monitoreando: @${TIKTOK_USERNAME}`);
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor en puerto ${PORT}`);
    startTikTokConnection();
});
