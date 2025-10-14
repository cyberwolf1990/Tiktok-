import express from 'express';
import fetch from 'node-fetch';
import TikTokLive from 'tiktok-live-connector';

const app = express();
const PORT = process.env.PORT || 8080;

const TIKTOK_USER = 'nombre_de_usuario';
const MACRODROID_WEBHOOK = 'https://macrodroid-webhook-url';

// Inicializa cliente TikTok
let client = null;
let liveActive = false;

async function startLiveListener() {
  try {
    client = new TikTokLive({ username: TIKTOK_USER });

    client.on('connected', (data) => {
      liveActive = true;
      console.log(`🔌 Conectado al live de ${TIKTOK_USER}, userId: ${data.userId}`);
    });

    client.on('disconnected', () => {
      liveActive = false;
      console.log('❌ Live cerrado o desconectado');
      checkLiveLoop();
    });

    client.on('comment', async (data) => {
      try {
        const payload = {
          username: data.user.uniqueId,
          comment: data.comment,
          timestamp: Date.now()
        };

        await fetch(MACRODROID_WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=UTF-8' },
          body: JSON.stringify(payload)
        });

        console.log('💬 Comentario enviado:', payload.comment);
      } catch (err) {
        console.error('❌ Error enviando comentario:', err);
      }
    });

    await client.connect();
  } catch (err) {
    liveActive = false;
    console.log('❌ No hay live activo o error al conectar:', err.message);
    checkLiveLoop();
  }
}

// Función que revisa periódicamente si hay un live activo
function checkLiveLoop() {
  if (liveActive) return; // ya está conectado

  console.log('⏳ Verificando si hay live cada 60 segundos...');
  const interval = setInterval(async () => {
    if (!liveActive) {
      console.log('🔌 Intentando reconectar al live...');
      try {
        await startLiveListener();
      } catch {
        console.log('❌ Aún no hay live activo');
      }
    } else {
      clearInterval(interval); // si se conecta, detiene el loop
    }
  }, 60000);
}

// Inicia verificación de live
startLiveListener();

// Express para Railway o VPS
app.get('/', (req, res) => {
  res.send('TikTok Live Forwarder robusto activo');
});

app.listen(PORT, () => console.log(`🌍 Servidor Express escuchando en puerto ${PORT}`));
