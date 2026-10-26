// ================================================================
// Lectura del archivo INI de configuración
// ================================================================
// Este módulo:
//   1. Ubica el archivo config.ini (junto al .exe, junto al server.js
//      o en la ruta indicada por la variable de entorno PID_CONFIG).
//   2. Lo parsea y aplica valores por defecto donde falten.
//   3. Expone una función para verificar que las rutas sean accesibles.

const fs = require('fs');
const path = require('path');
const ini = require('ini');

/**
 * Busca el archivo config.ini en ubicaciones conocidas.
 * Orden de búsqueda:
 *   1. Variable de entorno PID_CONFIG.
 *   2. Junto al ejecutable (modo .exe empaquetado).
 *   3. Junto a server.js (modo desarrollo).
 * Si no lo encuentra, lanza un error.
 */
function ubicarINI() {
  // 1. Variable de entorno
  if (process.env.PID_CONFIG && fs.existsSync(process.env.PID_CONFIG)) {
    return process.env.PID_CONFIG;
  }
  // 2. Junto al ejecutable
  const juntoAlExe = path.join(path.dirname(process.execPath), 'config.ini');
  if (fs.existsSync(juntoAlExe)) return juntoAlExe;

  // 3. Junto a server.js
  const juntoAlServer = path.join(__dirname, '..', 'config.ini');
  if (fs.existsSync(juntoAlServer)) return juntoAlServer;

  throw new Error(
    'No se encontro config.ini. Colocalo junto al .exe o definí la variable PID_CONFIG.'
  );
}

/**
 * Carga el archivo INI y devuelve un objeto con la configuración.
 * Aplica valores por defecto para las claves faltantes.
 */
function cargarConfig() {
  const ruta = ubicarINI();
  const contenido = fs.readFileSync(ruta, 'utf-8');
  const config = ini.parse(contenido);

  // Normalizar secciones esperadas
  config.Rutas = config.Rutas || {};
  config.Administracion = config.Administracion || { AdminUsuarios: '' };
  config.Marcadores = config.Marcadores || {};
  config.Lupa = config.Lupa || {};
  config.Exportacion = config.Exportacion || {};
  config.Interfaz = config.Interfaz || {};
  config.Autenticacion = config.Autenticacion || {};

  // Valores por defecto de [Marcadores]
  config.Marcadores.TamanoPorDefecto = parseInt(config.Marcadores.TamanoPorDefecto || 14, 10);
  config.Marcadores.TamanoEtiquetaMax = parseInt(config.Marcadores.TamanoEtiquetaMax || 150, 10);
  config.Marcadores.FormaPorDefecto = config.Marcadores.FormaPorDefecto || 'circulo';
  config.Marcadores.ColorAbierto = config.Marcadores.ColorAbierto || '#00C853';
  config.Marcadores.ColorCerrado = config.Marcadores.ColorCerrado || '#D50000';
  config.Marcadores.ColorOtro = config.Marcadores.ColorOtro || '#2962FF';
  config.Marcadores.TransparenciaRelleno = parseFloat(config.Marcadores.TransparenciaRelleno || 0.5);
  config.Marcadores.GrosorBorde = parseInt(config.Marcadores.GrosorBorde || 3, 10);

  // Parpadeo configurable (al abrir "Ver en P&ID").
  config.Marcadores.ParpadeoVeces = parseInt(config.Marcadores.ParpadeoVeces || 5, 10);
  config.Marcadores.ParpadeoIntervalo = parseInt(config.Marcadores.ParpadeoIntervalo || 250, 10);

  // Valores por defecto de [Lupa]
  config.Lupa.Zoom = parseFloat(config.Lupa.Zoom || 3);
  config.Lupa.Tamano = parseInt(config.Lupa.Tamano || 180, 10);
  config.Lupa.MostrarMarcaciones = String(config.Lupa.MostrarMarcaciones).toLowerCase() === 'true';

  // Valores por defecto de [Exportacion]
  config.Exportacion.DPI = parseInt(config.Exportacion.DPI || 300, 10);
  config.Exportacion.TamanoHoja = config.Exportacion.TamanoHoja || 'A3';
  config.Exportacion.Orientacion = config.Exportacion.Orientacion || 'horizontal';

  // Valores por defecto de [Interfaz]
  config.Interfaz.Tema = config.Interfaz.Tema || 'oscuro';
  config.Interfaz.Idioma = config.Interfaz.Idioma || 'es';

  // Valores por defecto de [Autenticacion]
  // Modo: 'windows' (usuario de Windows, sin login) | 'password' (login).
  // Por defecto windows, para no romper instalaciones existentes.
  const modoAuth = String(config.Autenticacion.Modo || 'windows').trim().toLowerCase();
  config.Autenticacion.Modo = (modoAuth === 'password') ? 'password' : 'windows';
  config.Autenticacion.UsuarioSemilla = String(config.Autenticacion.UsuarioSemilla || 'admin').trim();

  // Admin usuarios -> array en minúsculas
  config.Administracion.AdminUsuarios = String(config.Administracion.AdminUsuarios || '')
    .split(',')
    .map(function (u) { return u.trim().toLowerCase(); })
    .filter(Boolean);

  // Guardamos la ruta del INI para debug
  config._rutaINI = ruta;

  return config;
}

/**
 * Verifica que las rutas del INI sean accesibles.
 * Devuelve un array de strings con los problemas encontrados
 * (vacío si todo está OK).
 */
function verificarRutas(config) {
  const problemas = [];
  const rutas = {
    CarpetaImagenes: config.Rutas.CarpetaImagenes,
    CarpetaDatos: config.Rutas.CarpetaDatos,
    CarpetaBackups: config.Rutas.CarpetaBackups,
    CarpetaLogs: config.Rutas.CarpetaLogs
  };

  for (const nombre in rutas) {
    const r = rutas[nombre];
    if (!r) { problemas.push(nombre + ' no definida'); continue; }
    try {
      if (!fs.existsSync(r)) fs.mkdirSync(r, { recursive: true });
      fs.accessSync(r, fs.constants.R_OK | fs.constants.W_OK);
    } catch (e) {
      problemas.push(nombre + ' (' + r + '): ' + e.message);
    }
  }

  if (config.Rutas.BaseDatos) {
    const carpeta = path.dirname(config.Rutas.BaseDatos);
    if (!fs.existsSync(carpeta)) {
      try {
        fs.mkdirSync(carpeta, { recursive: true });
      } catch (e) {
        problemas.push('Carpeta de BaseDatos: ' + e.message);
      }
    }
  } else {
    problemas.push('BaseDatos no definida');
  }

  return problemas;
}

module.exports = { cargarConfig, verificarRutas };