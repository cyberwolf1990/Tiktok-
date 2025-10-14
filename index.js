// index.js
const { WebcastPushConnection } = require('tiktok-live-connector');
const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 8080;
const TIKTOK_USERNAME = 'nombre_de_usuario'; // Reemplaza con el usuario del Live
const WEBHOOK_URL = 'TU_WEBHOOK_URL_AQUI'; // Reemplaza con tu webhook

let liveConnection = null;

// Función para conectar al live
async function connectToLive() {
    try {
        liveConnection = new WebcastPushConnection(TIKTOK_USERNAME);

        liveConnection.on('comment', async (data) => {
            try {
                const commentText = data.comment;
                const username = data.user.uniqueId; // Mantener username
                const timestamp = Date.now();

                // Enviar al webhook
                await axios.post(WEBHOOK_URL, {
                    username,
                    comment: commentText,
                    timestamp
                });
            } catch (err) {
                console.error('❌ Error enviando al webhook:', err.message);
            }
        });

        liveConnection.on('streamEnd', () => {
            console.log('📴 El live terminó. Reintentando en 2 minutos...');
            setTimeout(connectToLive, 120000); // Reintentar en 2 min
        });

        await liveConnection.connect();
        console.log(`🔌 Conectado al Live de @${TIKTOK_USERNAME}`);
    } catch (err) {
        console.error('❌ No hay live activo o error al conectar:', err.message);
        const retryTime = 60000; // 1 minuto
        console.log(`⏳ Reintentando en ${retryTime / 1000} segundos...`);
        setTimeout(connectToLive, retryTime);
    }
}

// Servidor Express
app.get('/', (req, res) => {
    res.send('Servidor corriendo');
});

// Iniciar el servidor y la conexión al live
app.listen(PORT, () => {
    console.log(`🌍 Servidor Express escuchando en puerto ${PORT}`);
    connectToLive();
});
