import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

export const CONFIG = {
  PORT: process.env.PORT || 3000,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  WEBHOOK_URL: process.env.WEBHOOK_URL || '',
  ALLOWED_USERS: (process.env.ALLOWED_USERS || '')
    .split(',')
    .map(u => u.trim())
    .filter(Boolean),
  DIRNAME: __dirname
};
