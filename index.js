import express from "express";
import fetch from "node-fetch";
import { WebcastPushConnection } from "tiktok-live-connector";
import crypto from "crypto"; // Módulo nativo de Node.js para generar hashes

const app = express();
app.use(express.json());

// --- CONFIGURACIÓN DE ENTORNO ---
const PORT = process.env.PORT || 8080;
// URL de destino del webhook.
const TARGET_WEBHOOK_URL = process.env.TARGET_WEBHOOK_URL || "https://tu-webhook-de-prueba.com";
// Nombre de usuario de TikTok a monitorear.
const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME || "godbelcebu";

// --- VARIABLES DE ESTADO ---
let tiktokConnection;
let reconnectAttempt = 0;
const MAX_RECONNECT_INTERVAL_MS = 300000; // 5 minutos (Límite máximo de espera)
const RECONNECT_BASE_MS = 5000; // 5 segundos (Base para el backoff exponencial)

// --- CACHÉ DE DEDUPLICACIÓN ---
// Almacena los hashes (IDs únicos) de los mensajes procesados recientemente.
// Esto es CRÍTICO para evitar duplicados después de una reconexión.
const recentMessageCache = new Set(); 
const CACHE_LIFESPAN_MS = 10000; // Los hashes se mantienen en caché por 10 segundos.

// --- FUNCIONES DE UTILIDAD ---

/**
 * Calcula el tiempo de espera para el próximo intento de reconexión
 * usando un retroceso exponencial con un límite máximo (capped exponential backoff).
 * @returns {number} Tiempo de espera en milisegundos.
 */
function calculateReconnectDelay() {
    // Calcula el retroceso: 5s, 10s, 20s, 40s, ... hasta 5 minutos.
    const delay = Math.min(
        RECONNECT_BASE_MS * Math.pow(2, reconnectAttempt),
        MAX_RECONNECT_INTERVAL_MS
    );
    return delay;
}

/**
 * Genera un hash (ID único) para un mensaje de chat.
 * Usa el ID de usuario, el comentario y un segmento de tiempo para identificar duplicados.
 * @param {object} data - Los datos del evento 'chat' de TikTok.
 * @param {string} nickname - El nombre de usuario.
 * @returns {string} Hash SHA256 único.
 */
function generateMessageHash(data, nickname) {
    // Usamos uniqueId (si está disponible) para identificar al usuario.
    const uniqueIdPart = data.user?.uniqueId || nickname; 
    const commentPart = data.comment;

    // Segmento de tiempo: Redondeamos el timestamp a los 5 segundos más cercanos.
    // Esto agrupa mensajes duplicados recibidos en la misma ventana corta de tiempo.
    const timeSegment = Math.floor(Date.now() / 5000) * 5000;
    
    // String combinada para el hash
    const combinedString = `${uniqueIdPart}:${commentPart}:${timeSegment}`;

    // Genera el hash
    return crypto.createHash('sha256').update(combinedString).digest('hex');
}


/**
 * Lógica para enviar el payload al webhook de forma asíncrona.
 * Se usa "fire-and-forget" para no bloquear la recepción de mensajes.
 * @param {object} payload - El objeto de datos a enviar.
 */
async function sendToWebhook(payload) {
    try {
        const res = await fetch(TARGET_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json; charset=utf-8" },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            console.log(`📤 Enviado a webhook OK (status: ${res.status})`);
        } else {
            console.error(`❌ Error HTTP ${res.status} al enviar al webhook.`);
        }
    } catch (err) {
        console.error("❌ Error grave enviando al webhook (tiempo de espera o red):", err.message);
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
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        console.log(`🚀 Intentando conectar con @${TIKTOK_USERNAME}...`);
        
        tiktokConnection = new WebcastPushConnection(TIKTOK_USERNAME, {
            // CRÍTICO: Asegura que los mensajes iniciales (los últimos segundos) se procesen.
            processInitialData: true, 
            enableExtendedGiftInfo: true 
        });

        // --- MANEJO DE EVENTOS ---
        
        // 1. Conexión Exitosa
        tiktokConnection.on("connect", (state) => {
            console.log(`✅ Conectado al live de @${TIKTOK_USERNAME} (RoomID: ${state.roomId})`);
            reconnectAttempt = 0; // Reinicia el contador de intentos al conectar.
        });

        // 2. Errores de Conexión
        tiktokConnection.on("error", (err) => {
            console.error(`❌ Error en la conexión del conector: ${err.message}.`);
            reconnectLogic();
        });

        // 3. Fin del Live o desconexión
        tiktokConnection.on("streamEnd", () => {
            console.log("⚠️ Live terminado o desconexión forzada. Intentando reconectar.");
            reconnectLogic();
        });
        
        // 4. Mensajes de Chat (Lógica de deduplicación)
        tiktokConnection.on("chat", (data) => {
            const nickname = data.nickname || data.user?.nickname || data.uniqueId || "Desconocido";

            // 1. Generar el Hash del mensaje
            const messageHash = generateMessageHash(data, nickname);

            // 2. Comprobar si es un duplicado
            if (recentMessageCache.has(messageHash)) {
                console.log(`🚫 Mensaje duplicado detectado (Hash: ${messageHash.substring(0, 8)}). Omitiendo: "${data.comment}"`);
                return; // Ignorar el mensaje duplicado
            }

            // 3. Añadir el hash al caché y programar su eliminación
            recentMessageCache.add(messageHash);
            setTimeout(() => {
                recentMessageCache.delete(messageHash);
            }, CACHE_LIFESPAN_MS);
            
            // 4. Si no es duplicado, procesar y enviar
            const payload = {
                event: 'chat',
                nickname: nickname,
                comment: data.comment,
                timestamp: Date.now()
            };

            console.log(`💬 Comentario procesado (Hash: ${messageHash.substring(0, 8)}): "${data.comment}"`);
            
            // Patrón Fire-and-Forget: Inicia el envío sin esperar respuesta para no bloquear.
            sendToWebhook(payload);
        });

        // 5. Evento de Regalo (Ejemplo)
        tiktokConnection.on("gift", (data) => {
             console.log(`🎁 Regalo recibido de ${data.nickname}: ${data.giftName} (x${data.repeatCount || 1})`);
             sendToWebhook({ event: 'gift', nickname: data.nickname, giftName: data.giftName, count: data.repeatCount || 1, timestamp: Date.now() });
        });
        
        // 6. Intentar Conectar
        await tiktokConnection.connect();


    } catch (err) {
        console.error("❌ Error grave inicializando o conectando:", err.message);
        reconnectLogic();
    }
}

/**
 * Función que gestiona la lógica de reconexión con retroceso exponencial.
 */
function reconnectLogic() {
    reconnectAttempt++;
    tiktokConnection?.disconnect(); // Asegura la desconexión limpia
    setTimeout(startTikTokConnection, calculateReconnectDelay());
}


// --- INICIO DEL SERVIDOR EXPRESS ---

app.get("/", (req, res) => {
  res.send(`✅ Servidor TikTok Webhook Forwarder corriendo. Monitoreando: @${TIKTOK_USERNAME}`);
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  startTikTokConnection(); // Inicia la conexión de TikTok al iniciar el servidor
});
        
