const TikTokLive = require('tiktok-live-connector').default;
const express = require('express');
const axios = require('axios');

const USERNAME = 'nombre_de_usuario'; // Cambia por el usuario de TikTok
const WEBHOOK_URL = 'https://tuwebhook.com/recibir'; // Cambia por tu webhook
const PORT = 8080;

// Configuración de Express
const app = express();
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Servidor activo ✅');
});

app.listen(PORT, () => {
    console.log(`🌍 Servidor Express escuchando en puerto ${PORT}`);
});

// Función para iniciar conexión al live
async function connectToLive() {
    try {
        console.log(`🔌 Intentando conectar al Live de @${USERNAME}...`);
        const liveConnection = new TikTokLive({ username: USERNAME });

        liveConnection.on('connected', (data) => {
            console.log(`✅ Conectado al live de ${USERNAME}, viewers: ${data.viewerCount}`);
        });

        liveConnection.on('disconnected', (reason) => {
            console.log(`⚠️ Desconectado: ${reason}. Reintentando en 30s...`);
            setTimeout(connectToLive, 30000);
        });

        liveConnection.on('comment', async (data) => {
            // Construir JSON
            const payload = {
                username: data.user.uniqueId, // username del que comenta
                comment: data.comment,
                timestamp: Date.now()
            };

            console.log('📩 Comentario recibido:', payload);

            // Enviar al webhook
            try {
                await axios.post(WEBHOOK_URL, payload);
            } catch (err) {
                console.error('❌ Error enviando al webhook:', err.message);
            }
        });

        await liveConnection.connect();
    } catch (err) {
        console.error('❌ No hay live activo o error al conectar:', err.message || err);
        // Reintento progresivo
        const delay = 30 + Math.floor(Math.random() * 90); // entre 30 y 120s
        console.log(`⏳ Reintentando en ${delay} segundos...`);
        setTimeout(connectToLive, delay * 1000);
    }
}

// Iniciar la conexión
connectToLive();
