import express from "express";
import fetch from "node-fetch";
import { WebcastPushConnection } from "tiktok-live-connector";

const app = express();
app.use(express.json());

// --- CONFIGURACIÓN DE ENTORNO ---
const PORT = process.env.PORT || 8080;
// URL de destino del webhook, por ejemplo, Macrodroid.
const TARGET_WEBHOOK_URL = process.env.TARGET_WEBHOOK_URL || "https://tu-webhook-de-prueba.com";
// Nombre de usuario de TikTok a monitorear.
const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME || "godbelcebu";

// --- VARIABLES DE ESTADO ---
let tiktokConnection;
let reconnectAttempt = 0;
const MAX_RECONNECT_INTERVAL_MS = 300000; // 5 minutos (Máximo de espera)
const RECONNECT_BASE_MS = 5000; // 5 segundos (Base para el backoff exponencial)

// --- FUNCIONES DE UTILIDAD ---

/**
 * Calcula el tiempo de espera para el próximo intento de reconexión
 * usando un retroceso exponencial con un límite máximo (capped exponential backoff).
 * Esto evita saturar el servicio de TikTok con reintentos fallidos.
 * @returns {number} Tiempo de espera en milisegundos.
 */
function calculateReconnectDelay() {
    // Math.pow(2, reconnectAttempt) * 1000, limitado por MAX_RECONNECT_INTERVAL_MS
    const delay = Math.min(
        RECONNECT_BASE_MS * Math.pow(2, reconnectAttempt),
        MAX_RECONNECT_INTERVAL_MS
    );
    return delay;
}

/**
 * Lógica para enviar el payload al webhook de forma asíncrona.
 * @param {object} payload - El objeto de datos a enviar.
 */
async function sendToWebhook(payload) {
    try {
        // La llamada a fetch es intrínsecamente asíncrona, lo que es bueno.
        // Asegúrate de que TARGET_WEBHOOK_URL responde RÁPIDO para no bloquear el Event Loop.
        const res = await fetch(TARGET_WEBHOOK_URL, {
            method: "POST",
            // Se añade 'utf-8' por si el webhook lo requiere, aunque fetch lo infiere.
            headers: { "Content-Type": "application/json; charset=utf-8" },
            // Se usa el modo 'no-cors' si el entorno de ejecución lo exige, aunque Node.js lo maneja.
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            console.log(`📤 Enviado a webhook OK (status: ${res.status})`);
        } else {
            console.error(`❌ Error HTTP ${res.status} al enviar al webhook.`);
            // Opcional: Loggear el cuerpo de la respuesta para depuración.
            // console.error(await res.text());
        }
    } catch (err) {
        console.error("❌ Error grave enviando al webhook (tiempo de espera o red):", err.message);
        // NOTA: Si este error es frecuente, considera usar una cola (como Redis o un simple array)
        // para reintentar estos mensajes más tarde, en lugar de perderlos.
    }
}


/**
 * Inicializa la conexión con TikTok Live.
 * Incluye la lógica de reintento.
 */
async function startTikTokConnection() {
    try {
        const delay = calculateReconnectDelay();
        if (reconnectAttempt > 0) {
            console.log(`⏳ Reintentando conexión en ${delay / 1000}s (Intento #${reconnectAttempt})...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        console.log(`🚀 Intentando conectar con @${TIKTOK_USERNAME}...`);
        
        // Se reinicializa la conexión en cada intento para evitar estados previos
        tiktokConnection = new WebcastPushConnection(TIKTOK_USERNAME, {
             // **CRÍTICO:** Asegura que los mensajes iniciales (los últimos segundos) se procesen.
            processInitialData: true, 
             // Intenta reconectar automáticamente.
            enableExtendedGiftInfo: true // Opcional, para info detallada de regalos.
        });

        // --- MANEJO DE EVENTOS ---
        
        // 1. Conexión Exitosa
        tiktokConnection.on("connect", (state) => {
            console.log(`✅ Conectado al live de @${TIKTOK_USERNAME} (RoomID: ${state.roomId})`);
            reconnectAttempt = 0; // Reinicia el contador de intentos al conectar.
        });

        // 2. Errores de Conexión (Importante para la reconexión)
        tiktokConnection.on("error", (err) => {
            console.error(`❌ Error en la conexión del conector: ${err.message}.`);
            // Se llama a la lógica de reconexión
            reconnectLogic();
        });

        // 3. Fin del Live (Live ha terminado)
        tiktokConnection.on("streamEnd", () => {
            console.log("⚠️ Live terminado o desconexión forzada. Intentando reconectar.");
            // Se llama a la lógica de reconexión
            reconnectLogic();
        });
        
        // 4. Mensajes de Chat (El foco principal de la optimización)
        tiktokConnection.on("chat", (data) => {
            // Se utiliza el operador de encadenamiento opcional para una extracción de datos más segura.
            const nickname = data.nickname || data.user?.nickname || data.uniqueId || "Desconocido";

            const payload = {
                event: 'chat', // Añade el tipo de evento para que el webhook lo filtre
                nickname: nickname,
                comment: data.comment,
                timestamp: Date.now()
            };

            console.log("💬 Comentario recibido:", payload.comment);
            
            // CRÍTICO: La función de envío al webhook se ejecuta de forma asíncrona,
            // pero sin usar 'await' aquí. Esto es un patrón "fire-and-forget"
            // que asegura que el Event Loop no se bloquee mientras se espera la
            // respuesta del webhook, permitiendo que el conector procese el siguiente
            // mensaje de TikTok inmediatamente. ¡Esto reduce la pérdida de mensajes!
            sendToWebhook(payload);
        });

        // Opcional: Añadir otros eventos si los necesitas
        tiktokConnection.on("gift", (data) => {
             console.log(`🎁 Regalo recibido de ${data.nickname}: ${data.giftName}`);
             sendToWebhook({ event: 'gift', nickname: data.nickname, giftName: data.giftName, count: data.repeatCount || 1, timestamp: Date.now() });
        });
        
        // 5. Intentar Conectar
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
    tiktokConnection?.disconnect(); // Asegura la desconexión limpia si estaba conectado
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
