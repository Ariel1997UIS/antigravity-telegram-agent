import express from 'express';
import fs from 'fs';
import path from 'path';
import { CONFIG } from './config.mjs';
import { processUserMessage } from './agent.mjs';

const app = express();
app.use(express.json());

const TELEGRAM_API_BASE = `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}`;

// Endpoint de monitoreo y ping (mantiene despierto el servicio)
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'Antigravity Cloud Super-Agent',
    timestamp: new Date().toISOString()
  });
});

// Enviar mensaje de texto
async function sendTelegramMessage(chatId, text) {
  try {
    const url = `${TELEGRAM_API_BASE}/sendMessage`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown'
      })
    });
    const data = await resp.json();
    if (!data.ok && data.description?.includes('can\'t parse entities')) {
      // Fallback a texto plano si markdown falla
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text
        })
      });
    }
  } catch (err) {
    console.error('Error enviando mensaje a Telegram:', err.message);
  }
}

// Enviar documento / archivo adjunto
async function sendTelegramDocument(chatId, filePath, caption) {
  try {
    const filename = path.basename(filePath);
    const fileBuffer = fs.readFileSync(filePath);
    const formData = new FormData();
    formData.append('chat_id', chatId.toString());
    formData.append('caption', caption || '');
    formData.append('document', new Blob([fileBuffer]), filename);

    const url = `${TELEGRAM_API_BASE}/sendDocument`;
    await fetch(url, {
      method: 'POST',
      body: formData
    });
  } catch (err) {
    console.error('Error enviando documento a Telegram:', err.message);
  }
}

// Indicador "escribiendo..."
async function sendChatAction(chatId, action = 'typing') {
  try {
    await fetch(`${TELEGRAM_API_BASE}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        action: action
      })
    });
  } catch {}
}

// Despacho de mensaje de usuario
async function handleIncomingMessage(msg) {
  if (!msg || !msg.text) return;
  const chatId = msg.chat.id;
  const username = msg.from?.username || msg.from?.first_name || 'Desconocido';
  const text = msg.text.trim();

  if (CONFIG.ALLOWED_USERS.length > 0) {
    const isAllowed = CONFIG.ALLOWED_USERS.includes(String(chatId)) ||
                      (msg.from?.username && CONFIG.ALLOWED_USERS.includes(msg.from.username));
    if (!isAllowed) {
      console.warn(`[Seguridad] Usuario no autorizado intentó escribir: ${username} (${chatId})`);
      return;
    }
  }

  console.log(`[Cloud Agent] 📩 Mensaje de @${username} (${chatId}): "${text}"`);
  await sendChatAction(chatId, 'typing');

  try {
    const reply = await processUserMessage(chatId, text);
    if (reply.text) {
      await sendTelegramMessage(chatId, reply.text);
    }
    if (reply.media && reply.media.type === 'document' && fs.existsSync(reply.media.filePath)) {
      await sendTelegramDocument(chatId, reply.media.filePath, reply.media.caption);
    }
  } catch (err) {
    console.error('[Cloud Agent] Error procesando mensaje:', err);
    await sendTelegramMessage(chatId, `⚠️ Error en la nube: ${err.message}`);
  }
}

// Webhook endpoint (si se usa modo Webhook)
app.post('/webhook', async (req, res) => {
  res.status(200).send('OK');
  const update = req.body;
  if (update && update.message) {
    await handleIncomingMessage(update.message);
  }
});

// Modo Long Polling (si no hay webhook configurado)
let offset = 0;
let isPolling = false;

async function startPollingLoop() {
  if (isPolling) return;
  isPolling = true;
  console.log('🔄 Iniciando Long-Polling para Telegram...');

  while (isPolling) {
    try {
      const url = `${TELEGRAM_API_BASE}/getUpdates?offset=${offset}&timeout=25`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(35000) });
      const data = await resp.json();

      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          offset = update.update_id + 1;
          if (update.message) {
            await handleIncomingMessage(update.message);
          }
        }
      } else if (!data.ok) {
        console.warn('Alerta Telegram API:', data.description);
        await new Promise(r => setTimeout(r, 4000));
      }
    } catch (err) {
      if (err.name !== 'TimeoutError') {
        console.error('Error de red en polling:', err.message);
      }
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

// Iniciar servidor HTTP
const server = app.listen(CONFIG.PORT, async () => {
  console.log(`====================================================`);
  console.log(`🌐 ANTIGRAVITY CLOUD SUPER-AGENT INICIADO`);
  console.log(`🚀 Puerto: ${CONFIG.PORT}`);
  console.log(`🧠 Modelo: ${CONFIG.GEMINI_MODEL}`);
  console.log(`====================================================`);

  if (CONFIG.WEBHOOK_URL) {
    const webhookEndpoint = `${CONFIG.WEBHOOK_URL.replace(/\/$/, '')}/webhook`;
    console.log(`Configurando Webhook en: ${webhookEndpoint}`);
    try {
      const setResp = await fetch(`${TELEGRAM_API_BASE}/setWebhook?url=${encodeURIComponent(webhookEndpoint)}`);
      const setData = await setResp.json();
      console.log('Resultado setWebhook:', setData);
    } catch (whErr) {
      console.error('Error configurando webhook:', whErr.message);
    }
  } else {
    // Modo Polling
    startPollingLoop();
  }
});
