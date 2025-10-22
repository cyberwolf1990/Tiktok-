import express from "express";
import fetch from "node-fetch";
import { WebcastPushConnection } from "tiktok-live-connector";
import crypto from "crypto"; // Módulo nativo de Node.js para generar hashes

const app = express();
app.use(express.json());

// --- CONFIGURACIÓN DE ENTORNO ---
const PORT = process.env.PORT || 8080;
const TARGET_WEBHOOK_URL = process.env.TARGET_WEBHOOK_URL || "https://tu-webhook-de-prueba.com";
const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME || "godbelcebu";

// --- VARIABLES DE ESTADO ---
let tiktokConnection;
let reconnectAttempt = 0;
const MAX_RECONNECT_INTERVAL_MS = 300000; // 5 minutos
const RECONNECT_BASE_MS = 5000; // 5 segundos

// --- CACHÉ DE DEDUPLICACIÓN ---
const recentMessageCache = new Set();
const CACHE_LIFESPAN_MS = 10000; // Mantener los IDs 10 segundos

// --- FUNCIONES DE UTILIDAD ---

function calculateReconnectDelay() {
    const delay = Math.min(
        RECONNECT_BASE_MS * Math.pow(2, reconnectAttempt),
        MAX_RECONNECT_INTERVAL_MS
    );
    return delay;
}

/**
 * Genera un hash (ID único) si no hay msgId disponible.
 */
function generateMessageHash(data, nickname) {
    const uniqueIdPart = data.user?.uniqueId || nickname;
    const commentPart = data.comment;
    const timeSegment = Math.floor(Date.now() / 5000) * 5000;
    const combinedString = `${uniqueIdPart}:${commentPart}:${timeSegment}`;
    return crypto.createHash("sha256").update(combinedString).digest("hex");
}

/**
 * Envía el payload al webhook destino.
 */
async function sendToWebhook(payload) {
    try {
        const res = await fetch(TARGET_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json; charset=utf-8" },
            body: JSON.stringify(payload),
        });

        if (res.ok) {
            console.log(`📤 Enviado a webhook OK (status: ${res.status})`);
        } else {
            console.error(`❌ Error HTTP ${res.status} al enviar al webhook.`);
        }
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
            console.log(`⏳ Reintentando conexión en ${delay / 1000}s (Intento #${reconnectAttempt})...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }

        console.log(`🚀 Conectando con @${TIKTOK_USERNAME}...`);

        tiktokConnection = new WebcastPushConnection(TIKTOK_USERNAME, {
            processInitialData: false, // CRÍTICO: evita recibir el historial completo
            enableExtendedGiftInfo: true,
        });

        // --- EVENTOS DE CONEXIÓN ---
        tiktokConnection.on("connect", (state) => {
            console.log(`✅ Conectado al live de @${TIKTOK_USERNAME} (RoomID: ${state.roomId})`);
            console.log("❗ Historial deshabilitado: solo se procesarán nuevos mensajes.");
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

            // 🔑 Prioriza el ID interno de TikTok
            const messageId = data.msgId || data.id || null;
            const uniqueKey = messageId
                ? `msg:${messageId}`
                : generateMessageHash(data, nickname); // fallback si no hay msgId

            // Evitar duplicados
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

            console.log(`💬 Nuevo mensaje (${uniqueKey.substring(0, 8)}): "${data.comment}"`);
            sendToWebhook(payload);
        });

        // --- EVENTO DE REGALOS (opcional) ---
        tiktokConnection.on("gift", (data) => {
            console.log(`🎁 Regalo recibido de ${data.nickname}: ${data.giftName} (x${data.repeatCount || 1})`);
            sendToWebhook({
                event: "gift",
                nickname: data.nickname,
                giftName: data.giftName,
                count: data.repeatCount || 1,
                timestamp: Date.now(),
            });
        });

        // --- CONECTAR ---
        await tiktokConnection.connect();
    } catch (err) {
        console.error("❌ Error iniciando conexión:", err.message);
        reconnectLogic();
    }
}

/**
 * Manejo de reconexión con backoff exponencial.
 */
function reconnectLogic() {
    reconnectAttempt++;
    console.log("♻️ Limpiando caché antes de reconectar...");
    recentMessageCache.clear(); // evita duplicados falsos entre reconexiones
    tiktokConnection?.disconnect();
    setTimeout(startTikTokConnection, calculateReconnectDelay());
}

// --- SERVIDOR EXPRESS ---
app.get("/", (req, res) => {
    res.send(`✅ Servidor TikTok Webhook Forwarder corriendo. Monitoreando: @${TIKTOK_USERNAME}`);
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    startTikTokConnection();
});
