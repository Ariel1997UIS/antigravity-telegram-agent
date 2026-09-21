import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSPACE_DIR = path.join(__dirname, 'workspace');
if (!fs.existsSync(WORKSPACE_DIR)) {
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
}

export async function executeShell(command) {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: WORKSPACE_DIR,
      timeout: 25000,
      maxBuffer: 1024 * 1024 * 2
    });
    let output = (stdout || '') + (stderr ? `\n[STDERR]:\n${stderr}` : '');
    if (!output.trim()) output = '(Comando ejecutado con éxito, sin salida).';
    if (output.length > 3500) output = output.slice(0, 3500) + '\n... [Salida truncada]';
    return { success: true, output };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      stdout: error.stdout || '',
      stderr: error.stderr || ''
    };
  }
}

export async function executePython(code) {
  const scriptPath = path.join(WORKSPACE_DIR, `temp_${Date.now()}.py`);
  try {
    fs.writeFileSync(scriptPath, code, 'utf-8');
    const pyCmd = process.platform === 'win32' ? `python "${scriptPath}"` : `python3 "${scriptPath}"`;
    const { stdout, stderr } = await execAsync(pyCmd, {
      cwd: WORKSPACE_DIR,
      timeout: 20000,
      maxBuffer: 1024 * 1024 * 2
    });
    try { fs.unlinkSync(scriptPath); } catch {}
    let output = (stdout || '') + (stderr ? `\n[STDERR]:\n${stderr}` : '');
    if (!output.trim()) output = '(Código ejecutado sin errores, sin salida de print).';
    if (output.length > 3500) output = output.slice(0, 3500) + '\n... [Truncado]';
    return { success: true, output };
  } catch (error) {
    try { fs.unlinkSync(scriptPath); } catch {}
    return {
      success: false,
      error: error.message,
      stdout: error.stdout || '',
      stderr: error.stderr || ''
    };
  }
}

export async function fetchWeb(url) {
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(10000)
    });
    if (!resp.ok) {
      return { success: false, error: `HTTP ${resp.status} ${resp.statusText}` };
    }
    const html = await resp.text();
    // Limpieza simple de etiquetas HTML
    const text = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 4000);

    return { success: true, url, contentSnippet: text };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export function generateFile(filename, content) {
  try {
    const safeName = path.basename(filename);
    const targetPath = path.join(WORKSPACE_DIR, safeName);
    fs.writeFileSync(targetPath, content, 'utf-8');
    return {
      success: true,
      filePath: targetPath,
      filename: safeName,
      sizeBytes: Buffer.byteLength(content, 'utf-8')
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
