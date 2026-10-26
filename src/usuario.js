// ================================================================
// Detección del usuario de Windows y verificación de admin
// ================================================================

const os = require('os');

/**
 * Devuelve el nombre del usuario de Windows que ejecuta el proceso.
 * Si falla, intenta con variables de entorno.
 */
function obtenerUsuarioWindows() {
  try {
    const info = os.userInfo();
    return info.username || 'desconocido';
  } catch (e) {
    return process.env.USERNAME || process.env.USER || 'desconocido';
  }
}

/**
 * Devuelve true si el usuario está en la lista de admins del INI.
 * La comparación es en minúsculas.
 */
function esAdmin(usuario, config) {
  if (!usuario) return false;
  const lista = (config.Administracion && config.Administracion.AdminUsuarios) || [];
  return lista.indexOf(String(usuario).toLowerCase()) !== -1;
}

module.exports = { obtenerUsuarioWindows, esAdmin };