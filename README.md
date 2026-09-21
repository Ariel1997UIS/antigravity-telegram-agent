# Antigravity Telegram Super-Agent (Cloud 24/7)

Bot de Telegram con superpoderes impulsado por **Google Gemini**, diseñado para funcionar 24/7 en la nube sin necesidad de tener tu PC encendida.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Ariel1997UIS/antigravity-telegram-agent)

## Capacidades (Tools)
- 🧠 **Gemini 2.5 Flash-Lite** con soporte multi-modelo y fallback automático.
- 🐍 **`execute_python`**: Ejecución de scripts Python en el contenedor para cálculos, simulaciones y procesamiento de datos.
- 💻 **`execute_shell`**: Comandos de terminal Linux en el entorno de nube.
- 🌐 **`fetch_web`**: Extracción y análisis de contenido de enlaces web.
- 📄 **`generate_file`**: Generación de archivos (.py, .csv, .md, .txt) enviados automáticamente como adjuntos descargables a Telegram.

## Variables de Entorno requeridas
- `TELEGRAM_BOT_TOKEN`: Tu token de bot de BotFather.
- `GEMINI_API_KEY`: Tu API Key de Google Generative Language.
- `GEMINI_MODEL`: `gemini-3.5-flash-lite` (por defecto).
