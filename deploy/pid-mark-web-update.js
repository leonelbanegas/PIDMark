#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');

const REQUEST_FILE = '/var/lib/pid-mark/web-update-request.json';
const STATE_DIR = '/run/pid-mark-web-update';
const STATE_FILE = path.join(STATE_DIR, 'status.json');
const LOG_FILE = path.join(STATE_DIR, 'output.log');
const LOCK_FILE = '/run/pid-mark-web-update-lock/request.lock';
const MAX_ZIP_SIZE = 100 * 1024 * 1024;
const GITHUB_REPO = 'leonelbanegas/PIDMark';

let pidmarkGid = 0;

function compararVersiones(a, b) {
  const partesA = a.split('.').map(Number);
  const partesB = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (partesA[i] !== partesB[i]) return partesA[i] - partesB[i];
  }
  return 0;
}

function writeStatus(state, version, message) {
  const tmp = `${STATE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({
    state,
    version,
    message,
    updatedAt: new Date().toISOString()
  }) + '\n', { mode: 0o640 });
  fs.chownSync(tmp, 0, pidmarkGid);
  fs.renameSync(tmp, STATE_FILE);
}

async function fetchGitHubJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'PID-Mark-Updater'
    },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`GitHub respondió HTTP ${response.status}.`);
  return response.json();
}

async function leerRespuestaLimitada(response) {
  const length = Number(response.headers.get('content-length') || 0);
  if (length > MAX_ZIP_SIZE) throw new Error('El ZIP oficial supera el tamaño permitido.');
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    total += chunk.value.byteLength;
    if (total > MAX_ZIP_SIZE) {
      await reader.cancel();
      throw new Error('El ZIP oficial supera el tamaño permitido.');
    }
    chunks.push(Buffer.from(chunk.value));
  }
  return Buffer.concat(chunks, total);
}

async function validateRequest(request) {
  if (!request || typeof request !== 'object' ||
      !/^\d+\.\d+\.\d+$/.test(request.version || '') ||
      !/^[0-9a-f]{40}$/i.test(request.commitSha || '') ||
      !['github', 'zip'].includes(request.source)) {
    throw new Error('La solicitud de actualización no es válida.');
  }
  if (request.source === 'zip' && !/^[0-9a-f]{64}$/i.test(request.sha256 || '')) {
    throw new Error('Falta el hash del ZIP de GitHub.');
  }
  const installedVersion = JSON.parse(
    fs.readFileSync('/opt/pid-mark/package.json', 'utf8')
  ).version;
  if (!/^\d+\.\d+\.\d+$/.test(installedVersion || '') ||
      compararVersiones(request.version, installedVersion) <= 0) {
    throw new Error('La actualización debe ser posterior a la versión instalada.');
  }

  const tag = `v${request.version}`;
  const tags = await fetchGitHubJson(
    `https://api.github.com/repos/${GITHUB_REPO}/tags?per_page=100`
  );
  const publishedTag = tags.find(item => item.name === tag);
  if (!publishedTag ||
      publishedTag.commit.sha.toLowerCase() !== request.commitSha.toLowerCase()) {
    throw new Error('La etiqueta ya no coincide con el código verificado en GitHub.');
  }

  if (request.source === 'zip') {
    const response = await fetch(
      `https://codeload.github.com/${GITHUB_REPO}/zip/refs/tags/${tag}`,
      { signal: AbortSignal.timeout(60000) }
    );
    if (!response.ok) throw new Error(`GitHub respondió HTTP ${response.status} al validar el ZIP.`);
    const archive = await leerRespuestaLimitada(response);
    const officialHash = crypto.createHash('sha256').update(archive).digest('hex');
    if (officialHash !== request.sha256.toLowerCase()) {
      throw new Error('El ZIP no coincide exactamente con el archivo fuente de esa etiqueta de GitHub.');
    }
    const currentTags = await fetchGitHubJson(
      `https://api.github.com/repos/${GITHUB_REPO}/tags?per_page=100`
    );
    const currentTag = currentTags.find(item => item.name === tag);
    if (!currentTag ||
        currentTag.commit.sha.toLowerCase() !== request.commitSha.toLowerCase()) {
      throw new Error('La etiqueta cambió mientras se validaba el ZIP; vuelve a consultar GitHub.');
    }
  }
  return request;
}

function runUpdater(version, commitSha) {
  return new Promise((resolve, reject) => {
    const logFd = fs.openSync(LOG_FILE, 'w', 0o640);
    fs.fchownSync(logFd, 0, pidmarkGid);
    fs.fchmodSync(logFd, 0o640);
    const child = spawn('/usr/local/sbin/pid-mark-update', [version, commitSha], {
      stdio: ['ignore', logFd, logFd]
    });
    child.once('error', error => reject(error));
    child.once('close', code => {
      fs.closeSync(logFd);
      if (code === 0) resolve();
      else reject(new Error(`El actualizador terminó con código ${code}.`));
    });
  });
}

async function main() {
  const group = execFileSync('getent', ['group', 'pidmark'], { encoding: 'utf8' }).trim();
  pidmarkGid = Number(group.split(':')[2]);
  if (!Number.isInteger(pidmarkGid)) throw new Error('No se pudo determinar el grupo pidmark.');

  fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o750 });
  fs.chownSync(STATE_DIR, 0, pidmarkGid);
  fs.chmodSync(STATE_DIR, 0o750);
  writeStatus('running', '', 'Validando la solicitud y preparando la actualización.');

  const request = JSON.parse(fs.readFileSync(REQUEST_FILE, 'utf8'));
  await validateRequest(request);
  writeStatus('running', request.version, 'Descargando e instalando PID Mark.');
  await runUpdater(request.version, request.commitSha);

  const installed = JSON.parse(fs.readFileSync('/opt/pid-mark/package.json', 'utf8')).version;
  if (installed !== request.version) {
    throw new Error('La versión instalada no coincide con la solicitada.');
  }
  writeStatus('success', installed, `PID Mark v${installed} quedó instalado correctamente.`);
}

main().catch(error => {
  let version = '';
  try {
    const request = JSON.parse(fs.readFileSync(REQUEST_FILE, 'utf8'));
    version = request.version || '';
  } catch (statusError) {
    if (statusError.code !== 'ENOENT') console.error('No se pudo leer la solicitud:', statusError.message);
  }
  try {
    writeStatus('error', version, error.message);
  } catch (statusError) {
    console.error('No se pudo registrar el error de actualización:', statusError.message);
  }
  console.error('Error al actualizar PID Mark:', error.message);
  process.exitCode = 1;
}).finally(() => {
  try { fs.unlinkSync(REQUEST_FILE); } catch (error) {
    if (error.code !== 'ENOENT') console.error('No se pudo limpiar la solicitud:', error.message);
  }
  try { fs.unlinkSync(LOCK_FILE); } catch (error) {
    if (error.code !== 'ENOENT') console.error('No se pudo liberar el bloqueo:', error.message);
  }
});
