// ================================================================
// Autenticación: hash de contraseñas y utilidades
// ================================================================
// Usa crypto.scrypt nativo (sin dependencias).
// Formato guardado: scrypt$<saltHex>$<hashHex>

const crypto = require('crypto');

const KEYLEN = 64;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 };

/**
 * Genera el hash de una contraseña en texto plano.
 * Devuelve un string scrypt$salt$hash.
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, KEYLEN, SCRYPT_OPTS);
  return 'scrypt$' + salt.toString('hex') + '$' + hash.toString('hex');
}

/**
 * Verifica una contraseña contra el string guardado.
 * Devuelve true/false. Nunca lanza.
 */
function verifyPassword(password, stored) {
  try {
    if (!stored || typeof stored !== 'string') return false;
    const partes = stored.split('$');
    if (partes.length !== 3 || partes[0] !== 'scrypt') return false;
    const salt = Buffer.from(partes[1], 'hex');
    const esperado = Buffer.from(partes[2], 'hex');
    const hash = crypto.scryptSync(String(password), salt, esperado.length, SCRYPT_OPTS);
    return crypto.timingSafeEqual(hash, esperado);
  } catch (e) {
    return false;
  }
}

/**
 * Genera una contraseña temporal legible (12 caracteres).
 * Evita caracteres ambiguos (0/O, 1/l/I).
 */
function generarPasswordTemporal() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(12);
  let out = '';
  for (let i = 0; i < 12; i++) out += alfabeto[bytes[i] % alfabeto.length];
  return out;
}

/**
 * Genera un token de sesión aleatorio (32 bytes -> 64 hex).
 */
function generarToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Crea o actualiza un usuario como SuperUsuario con la contraseña indicada.
 * Devuelve el id del usuario.
 */
function crearOActualizarAdmin(db, usuario, password) {
  const nombre = String(usuario || '').trim();
  if (!nombre) throw new Error('Usuario vacío.');
  if (!password || String(password).length < 4) throw new Error('Contraseña demasiado corta (mínimo 4).');

  const hash = hashPassword(password);
  const existente = db.prepare('SELECT id FROM usuarios WHERE lower(nombre_windows) = lower(?)').get(nombre);
  if (existente) {
    db.prepare("UPDATE usuarios SET es_admin = 1, rol = 'admin', password_hash = ?, debe_cambiar_password = 0, activo = 1 WHERE id = ?")
      .run(hash, existente.id);
    return existente.id;
  }
  const info = db.prepare("INSERT INTO usuarios (nombre_windows, es_admin, rol, password_hash, debe_cambiar_password, activo) VALUES (?, 1, 'admin', ?, 0, 1)")
    .run(nombre, hash);
  return Number(info.lastInsertRowid);
}

module.exports = {
  hashPassword,
  verifyPassword,
  generarPasswordTemporal,
  generarToken,
  crearOActualizarAdmin
};
