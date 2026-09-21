import { CONFIG } from './config.mjs';
import { executeShell, executePython, fetchWeb, generateFile } from './tools.mjs';

const SYSTEM_INSTRUCTION = `Eres Antigravity Cloud Super-Agent, un asistente de IA avanzado para Ariel Acosta que se ejecuta 24/7 en la nube para Telegram.
Tus capacidades:
1. Puedes escribir y ejecutar código en Python (\`execute_python\`) para realizar cálculos, simulaciones, procesar datos y generar resultados.
2. Puedes ejecutar comandos en la terminal de la nube (\`execute_shell\`) para tareas de sistema o manejo de paquetes.
3. Puedes consultar sitios web o URLs (\`fetch_web\`) para investigar documentación o leer artículos.
4. Puedes crear y enviar archivos descargables (\`generate_file\`) en cualquier formato (.py, .md, .csv, .json, .txt) directamente al chat de Telegram del usuario.

Instrucciones:
- Responde siempre de manera concisa, útil y en español, formateando con Markdown limpio para Telegram (*negrita*, \`código\`, etc.).
- Si el usuario te pide programar un script o generar un archivo, usa tus herramientas para crearlo y enviárselo listo para descargar.
- Siempre sé proactivo y confiable.`;

const TOOLS_DECLARATION = [
  {
    functionDeclarations: [
      {
        name: 'execute_python',
        description: 'Ejecuta código Python en el entorno de nube y devuelve el resultado o errores de consola.',
        parameters: {
          type: 'OBJECT',
          properties: {
            code: {
              type: 'STRING',
              description: 'El código fuente en Python a ejecutar.'
            }
          },
          required: ['code']
        }
      },
      {
        name: 'execute_shell',
        description: 'Ejecuta comandos de shell en el entorno Linux de la nube.',
        parameters: {
          type: 'OBJECT',
          properties: {
            command: {
              type: 'STRING',
              description: 'El comando de terminal a ejecutar.'
            }
          },
          required: ['command']
        }
      },
      {
        name: 'fetch_web',
        description: 'Descarga y extrae el texto de una página web o enlace de internet.',
        parameters: {
          type: 'OBJECT',
          properties: {
            url: {
              type: 'STRING',
              description: 'La URL pública a consultar.'
            }
          },
          required: ['url']
        }
      },
      {
        name: 'generate_file',
        description: 'Crea un archivo con el código o texto indicado y lo envía como documento adjunto a Telegram.',
        parameters: {
          type: 'OBJECT',
          properties: {
            filename: {
              type: 'STRING',
              description: 'Nombre del archivo con su extensión (ej: script.py, datos.csv, notas.md).'
            },
            content: {
              type: 'STRING',
              description: 'Contenido completo del archivo.'
            }
          },
          required: ['filename', 'content']
        }
      }
    ]
  }
];

const conversationHistories = new Map();

const CANDIDATE_MODELS = [
  CONFIG.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite-preview',
  'gemini-3.5-flash',
  'gemini-flash-latest'
].filter((v, i, a) => a.indexOf(v) === i);

async function callGeminiWithFallback(payload) {
  let lastError = null;
  for (const model of CANDIDATE_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await resp.json();
      if (!data.error) {
        return { data, model };
      }
      console.warn(`[Gemini Fallback] Modelo ${model} devolvió error:`, data.error.message || data.error.status);
      lastError = data.error;
    } catch (err) {
      console.warn(`[Gemini Fallback] Excepción conectando a ${model}:`, err.message);
      lastError = err;
    }
  }
  return { error: lastError };
}

export async function processUserMessage(chatId, userText) {
  let history = conversationHistories.get(chatId) || [];

  history.push({
    role: 'user',
    parts: [{ text: userText }]
  });

  if (history.length > 20) {
    history = history.slice(-20);
    conversationHistories.set(chatId, history);
  }

  let capturedMedia = null;
  let turns = 0;
  const maxTurns = 5;

  while (turns < maxTurns) {
    turns++;
    const payload = {
      systemInstruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }]
      },
      contents: history,
      tools: TOOLS_DECLARATION
    };

    const callResult = await callGeminiWithFallback(payload);
    if (callResult.error) {
      history.pop();
      conversationHistories.set(chatId, history);
      return {
        text: `Error de conexión con Gemini: ${callResult.error.message || JSON.stringify(callResult.error)}`,
        media: null
      };
    }

    const resData = callResult.data;
    const candidate = resData.candidates?.[0];
    if (!candidate?.content) {
      history.pop();
      conversationHistories.set(chatId, history);
      return {
        text: 'No recibí respuesta del modelo.',
        media: null
      };
    }

    history.push(candidate.content);
    conversationHistories.set(chatId, history);

    const parts = candidate.content.parts || [];
    const functionCalls = parts.filter(p => p.functionCall);

    if (functionCalls.length === 0) {
      const textParts = parts.filter(p => p.text).map(p => p.text).join('\n');
      return {
        text: textParts || 'Listo.',
        media: capturedMedia
      };
    }

    const functionResponses = [];
    for (const part of functionCalls) {
      const call = part.functionCall;
      const fnName = call.name;
      const fnArgs = call.args || {};
      let fnResult;

      console.log(`[Cloud Agent] Ejecutando: ${fnName}`, fnArgs);

      try {
        if (fnName === 'execute_python') {
          fnResult = await executePython(fnArgs.code);
        } else if (fnName === 'execute_shell') {
          fnResult = await executeShell(fnArgs.command);
        } else if (fnName === 'fetch_web') {
          fnResult = await fetchWeb(fnArgs.url);
        } else if (fnName === 'generate_file') {
          const fileResult = generateFile(fnArgs.filename, fnArgs.content);
          if (fileResult.success) {
            capturedMedia = {
              type: 'document',
              filePath: fileResult.filePath,
              caption: `📄 Archivo generado: \`${fileResult.filename}\``
            };
            fnResult = { success: true, message: `Archivo ${fileResult.filename} creado y listo para enviar.` };
          } else {
            fnResult = { error: fileResult.error };
          }
        } else {
          fnResult = { error: `Herramienta desconocida: ${fnName}` };
        }
      } catch (toolErr) {
        fnResult = { error: `Excepción en ${fnName}: ${toolErr.message}` };
      }

      functionResponses.push({
        functionResponse: {
          name: fnName,
          response: {
            output: fnResult
          }
        }
      });
    }

    history.push({
      role: 'user',
      parts: functionResponses
    });
    conversationHistories.set(chatId, history);
  }

  return {
    text: 'Acción completada.',
    media: capturedMedia
  };
}
