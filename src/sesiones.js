// ================================================================
// Sesiones persistidas en SQLite (sobreviven a reinicios del server)
// ================================================================
// - La cookie pid_sesion contiene un token aleatorio.
// - La sesión se guarda en la tabla `sesiones` con expiración.
// - Deslizante: cada uso renueva `expira`.

const { getDB } = require('./db');
const { generarToken } = require('./auth');

// 365 días en milisegundos.
const DURACION_MS = 365 * 24 * 60 * 60 * 1000;
const NOMBRE_COOKIE = 'pid_sesion';

function isoEn(ms) {
  return new Date(Date.now() + ms).toISOString();
}

function ahoraISO() {
  return new Date().toISOString();
}

/**
 * Crea una sesión para el usuario y devuelve el token.
 */
function crearSesion(usuarioId) {
  const db = getDB();
  const token = generarToken();
  db.prepare('INSERT INTO sesiones (token, usuario_id, creado, expira) VALUES (?, ?, ?, ?)')
    .run(token, usuarioId, ahoraISO(), isoEn(DURACION_MS));
  return token;
}

/**
 * Devuelve la sesión { token, usuario_id, expira } si el token es válido y
 * no expiró. Si expiró, la borra y devuelve null.
 */
function obtenerSesion(token) {
  if (!token) return null;
  const db = getDB();
  let fila;
  try {
    fila = db.prepare('SELECT token, usuario_id, creado, expira FROM sesiones WHERE token = ?').get(token);
  } catch (e) {
    return null;
  }
  if (!fila) return null;
  if (fila.expira && fila.expira < ahoraISO()) {
    destruirSesion(token);
    return null;
  }
  return fila;
}

/**
 * Renueva la expiración (sesión deslizante).
 */
function renovarSesion(token) {
  if (!token) return;
  try {
    getDB().prepare('UPDATE sesiones SET expira = ? WHERE token = ?').run(isoEn(DURACION_MS), token);
  } catch (e) {}
}

/**
 * Borra una sesión puntual.
 */
function destruirSesion(token) {
  if (!token) return;
  try { getDB().prepare('DELETE FROM sesiones WHERE token = ?').run(token); } catch (e) {}
}

/**
 * Borra todas las sesiones de un usuario (salvo `exceptoToken` si se pasa).
 * Se usa al cambiar la contraseña.
 */
function destruirSesionesDeUsuario(usuarioId, exceptoToken) {
  try {
    if (exceptoToken) {
      getDB().prepare('DELETE FROM sesiones WHERE usuario_id = ? AND token <> ?').run(usuarioId, exceptoToken);
    } else {
      getDB().prepare('DELETE FROM sesiones WHERE usuario_id = ?').run(usuarioId);
    }
  } catch (e) {}
}

/**
 * Limpia sesiones expiradas (para llamar al arrancar).
 */
function limpiarExpiradas() {
  try { getDB().prepare('DELETE FROM sesiones WHERE expira < ?').run(ahoraISO()); } catch (e) {}
}

// ----------------------------------------------------------------
// Cookies (sin dependencias)
// ----------------------------------------------------------------

/**
 * Lee una cookie del header Cookie del request.
 */
function leerCookie(req, nombre) {
  const header = req.headers && req.headers.cookie;
  if (!header) return null;
  const partes = header.split(';');
  for (let i = 0; i < partes.length; i++) {
    const p = partes[i].trim();
    const idx = p.indexOf('=');
    if (idx === -1) continue;
    if (p.substring(0, idx) === nombre) {
      const valor = p.substring(idx + 1);
      try { return decodeURIComponent(valor); } catch (e) { return valor; }
    }
  }
  return null;
}

/**
 * Arma el Set-Cookie para la sesión.
 */
function cookieSesion(token, esHttps) {
  let c = NOMBRE_COOKIE + '=' + encodeURIComponent(token) + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + Math.floor(DURACION_MS / 1000);
  if (esHttps) c += '; Secure';
  return c;
}

/**
 * Arma el Set-Cookie para borrar la sesión.
 */
function cookieBorrar(esHttps) {
  let c = NOMBRE_COOKIE + '=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
  if (esHttps) c += '; Secure';
  return c;
}

module.exports = {
  NOMBRE_COOKIE,
  crearSesion,
  obtenerSesion,
  renovarSesion,
  destruirSesion,
  destruirSesionesDeUsuario,
  limpiarExpiradas,
  leerCookie,
  cookieSesion,
  cookieBorrar
};
