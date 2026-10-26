// ================================================================
// Módulo de P&ID: escaneo, parseo de nombres y calibración
// ================================================================
// Formato de nombre de archivo:
//   NOMBRE_XXdeXX_RevX.png
// donde:
//   - NOMBRE puede tener guiones, puntos, etc. (pero NO "_XXdeXX_RevX")
//   - XXdeXX es el número de página "N de M", sin ceros a la izquierda.
//     Ejemplo: "1de2", "10de10", "3de3".
//     La palabra "de" es tolerante a mayúsculas/minúsculas (de, DE, De, dE).
//   - RevX: la palabra "Rev" es tolerante a mayúsculas/minúsculas
//     (Rev, rev, REV, rEv, etc.). X puede ser una letra A-Z o un número.
//   - La extensión puede ser .png, .PNG o .Png.

const fs = require('fs');
const path = require('path');

// ----------------------------------------------------------------
// Parseo del nombre del archivo
// ----------------------------------------------------------------

/**
 * Parsea un nombre de archivo con formato "NOMBRE_XXdeXX_RevX.png".
 *
 * El regex es tolerante a mayúsculas/minúsculas en las palabras clave
 * "de" y "Rev".
 *
 * Devuelve un objeto con:
 *   {
 *     pid, pagina, totalPaginas, revision,
 *     hoja: {actual, total},
 *     hojaTexto: "XdeY",
 *     nombreCompleto, archivo, extension
 *   }
 * o null si no matchea.
 */
function parsearNombreArchivo(nombreArchivo) {
  const m = nombreArchivo.match(/^(.+)_(\d+)[Dd][Ee](\d+)_[Rr][Ee][Vv]([A-Za-z]|\d+)\.(png|PNG|Png)$/);
  if (!m) return null;

  const pid = m[1];
  const pagina = parseInt(m[2], 10);
  const totalPaginas = parseInt(m[3], 10);
  const revision = String(m[4]);

  // Validaciones lógicas: página entre 1 y totalPaginas, totalPaginas >= 1.
  if (isNaN(pagina) || isNaN(totalPaginas)) return null;
  if (totalPaginas < 1) return null;
  if (pagina < 1) return null;
  if (pagina > totalPaginas) return null;

  const hoja = { actual: pagina, total: totalPaginas };
  const hojaTexto = formatearHoja(hoja);

  // Normalizamos el nombreCompleto a una forma canónica en minúsculas
  // para "de" y con "Rev" en su forma original.
  const nombreCompleto = pid + '_' + pagina + 'de' + totalPaginas + '_Rev' + revision;

  return {
    pid: pid,
    pagina: pagina,
    totalPaginas: totalPaginas,
    revision: revision,
    hoja: hoja,
    hojaTexto: hojaTexto,
    nombreCompleto: nombreCompleto,
    archivo: nombreArchivo,
    extension: 'png'
  };
}

/**
 * Formatea una hoja {actual, total} como "XdeY".
 *   - Sin ceros a la izquierda.
 *   - "de" en minúscula.
 *   - Si falta algún dato, devuelve "1de1" como fallback.
 *
 * Acepta también un string "XdeY" y lo normaliza.
 */
function formatearHoja(hoja) {
  if (hoja === null || hoja === undefined) return '1de1';

  // Si ya viene como string "XdeY", lo parseamos y reformateamos.
  if (typeof hoja === 'string') {
    const m = hoja.match(/^(\d+)[Dd][Ee](\d+)$/);
    if (!m) return '1de1';
    const a = parseInt(m[1], 10);
    const t = parseInt(m[2], 10);
    if (!isFinite(a) || !isFinite(t) || a < 1 || t < 1 || a > t) return '1de1';
    return a + 'de' + t;
  }

  if (typeof hoja !== 'object') return '1de1';

  const a = parseInt(hoja.actual, 10);
  const t = parseInt(hoja.total, 10);
  if (!isFinite(a) || !isFinite(t) || a < 1 || t < 1 || a > t) return '1de1';
  return a + 'de' + t;
}

/**
 * Parsea un string "XdeY" a {actual, total}. Fallback: {actual:1, total:1}.
 */
// OJO: la regex vieja era /^(\d+)[Dd][Ee](\d+)$/ y solo aceptaba "1de2".
// El frontend manda "1/2" (ver ejecutarModificarPID), asi que parseaba mal y
// caia al fallback {actual:1,total:1}: el P&ID terminaba guardado como 1de1.
// Ahora se aceptan las tres formas: "1de2", "1/2" y "1 de 2".
const RE_HOJA = /^\s*(\d+)\s*(?:[Dd][Ee]|\/)\s*(\d+)\s*$/;

// Devuelve {actual,total} o null si el texto no es una hoja valida.
// Usar esta version en los endpoints que ESCRIBEN: si es null hay que
// rechazar con 400 en vez de guardar 1de1 en silencio.
function parsearHojaEstricta(texto) {
  if (texto === null || texto === undefined) return null;
  const m = String(texto).match(RE_HOJA);
  if (!m) return null;
  const a = parseInt(m[1], 10);
  const t = parseInt(m[2], 10);
  if (!isFinite(a) || !isFinite(t) || a < 1 || t < 1 || a > t) return null;
  return { actual: a, total: t };
}

function parsearHoja(texto) {
  return parsearHojaEstricta(texto) || { actual: 1, total: 1 };
}

/**
 * Devuelve un nombre lindo para mostrar en la UI (sin hoja).
 * Ejemplos:
 *   - P-101 con 1 de 2 → "P-101"
 */
function nombreLindo(pidInfo) {
  if (!pidInfo) return '';
  return pidInfo.pid;
}

// ----------------------------------------------------------------
// Rutas de calibración
// ----------------------------------------------------------------

function rutaJSONCalibracion(carpetaImagenes, archivoPNG) {
  const base = archivoPNG.replace(/\.png$/i, '');
  return path.join(carpetaImagenes, base.toLowerCase() + '.json');
}

function leerCalibracion(carpetaImagenes, archivoPNG) {
  const ruta = rutaJSONCalibracion(carpetaImagenes, archivoPNG);
  if (!fs.existsSync(ruta)) return null;
  try {
    return JSON.parse(fs.readFileSync(ruta, 'utf-8'));
  } catch (e) {
    return null;
  }
}

function guardarCalibracion(carpetaImagenes, archivoPNG, datos) {
  const ruta = rutaJSONCalibracion(carpetaImagenes, archivoPNG);
  fs.writeFileSync(ruta, JSON.stringify(datos, null, 2), 'utf-8');
  return ruta;
}

function borrarCalibracion(carpetaImagenes, archivoPNG) {
  const ruta = rutaJSONCalibracion(carpetaImagenes, archivoPNG);
  if (fs.existsSync(ruta)) fs.unlinkSync(ruta);
}

// ----------------------------------------------------------------
// Escaneo de la carpeta de imágenes
// ----------------------------------------------------------------

// ----------------------------------------------------------------
// Cache de escaneo (TTL + invalidacion manual)
// ----------------------------------------------------------------
// escanearPIDs() recorre TODA la carpeta y parsea cada nombre + su JSON de
// calibracion. Con pocos archivos es instantaneo, pero con miles y muchos
// usuarios se vuelve el cuello de botella: cada request HTTP lo repetia.
//
// Aca se guarda el ultimo resultado durante TTL_ESCANEO_PIDS_MS. Las
// escrituras (cargar / modificar / borrar P&ID) deben llamar a
// invalidarCachePIDs() para que el cambio se vea al instante. El TTL queda
// como red de seguridad (por si algo se cambia por fuera de la app, ej.
// copiando un archivo a mano a la carpeta).
const TTL_ESCANEO_PIDS_MS = 10000; // 10 segundos
let _cacheEscaneo = null; // { carpeta, expira, datos }

function invalidarCachePIDs() {
  _cacheEscaneo = null;
}

function escanearPIDsCacheado(carpetaImagenes) {
  const ahora = Date.now();
  if (_cacheEscaneo &&
      _cacheEscaneo.carpeta === carpetaImagenes &&
      ahora < _cacheEscaneo.expira) {
    return _cacheEscaneo.datos;
  }
  const datos = escanearPIDs(carpetaImagenes);
  _cacheEscaneo = { carpeta: carpetaImagenes, expira: ahora + TTL_ESCANEO_PIDS_MS, datos: datos };
  return datos;
}

function escanearPIDs(carpetaImagenes) {
  if (!fs.existsSync(carpetaImagenes)) {
    throw new Error('La carpeta de imagenes no existe: ' + carpetaImagenes);
  }

  const archivos = fs.readdirSync(carpetaImagenes);
  const pids = [];
  const pngsValidos = new Set();

  // Primera pasada: recolectar PNGs válidos
  for (const archivo of archivos) {
    const info = parsearNombreArchivo(archivo);
    if (!info) continue;

    pngsValidos.add(archivo.toLowerCase());

    const rutaPNG = path.join(carpetaImagenes, archivo);
    let stats;
    try {
      stats = fs.statSync(rutaPNG);
    } catch (e) {
      continue;
    }

    const calibracion = leerCalibracion(carpetaImagenes, archivo);

    pids.push({
      pid: info.pid,
      pagina: info.pagina,
      totalPaginas: info.totalPaginas,
      revision: info.revision,
      hoja: info.hoja,
      hojaTexto: info.hojaTexto,
      nombreCompleto: info.nombreCompleto,
      archivo: archivo,
      anchoArchivo: stats.size,
      modificado: stats.mtime.toISOString(),
      calibrado: !!calibracion,
      calibracion: calibracion
    });
  }

  // Segunda pasada: mover JSON huérfanos a _huerfanos\
  const carpetaHuerfanos = path.join(carpetaImagenes, '_huerfanos');
  for (const archivo of archivos) {
    if (!archivo.toLowerCase().endsWith('.json')) continue;

    const baseSinExt = archivo.replace(/\.json$/i, '');
    if (pngsValidos.has(baseSinExt.toLowerCase() + '.png')) continue;

    if (!fs.existsSync(carpetaHuerfanos)) {
      try { fs.mkdirSync(carpetaHuerfanos, { recursive: true }); } catch (e) { /* noop */ }
    }
    try {
      fs.renameSync(
        path.join(carpetaImagenes, archivo),
        path.join(carpetaHuerfanos, archivo)
      );
    } catch (e) {
      // noop
    }
  }

  // Ordenar por nombre base, luego página, luego revisión MAS NUEVA PRIMERO.
  // compararRevision(a,b) > 0 = a es mas nueva; para que la mas nueva quede
  // arriba en el sort hay que invertir los argumentos.
  pids.sort(function (a, b) {
    if (a.pid !== b.pid) return a.pid.localeCompare(b.pid);
    if (a.pagina !== b.pagina) return a.pagina - b.pagina;
    return compararRevision(b.revision, a.revision);
  });

  return pids;
}

/**
 * Busca un P&ID por (nombre, hoja, revision).
 *   - hoja puede ser un string "XdeY" o un objeto {actual, total}.
 *   - Si hoja es null/undefined, se asume "1de1".
 */
function buscarPID(carpetaImagenes, nombre, hoja, rev) {
  const nombreStr = String(nombre);
  const revStr = String(rev);
  const hojaTexto = formatearHoja(hoja);

  // Usa el cache: abrir un P&ID (GET /api/pid/...) no debe recorrer la
  // carpeta entera en cada request.
  const lista = escanearPIDsCacheado(carpetaImagenes);
  return lista.find(function (p) {
    return p.pid === nombreStr
        && p.hojaTexto === hojaTexto
        && String(p.revision) === revStr;
  }) || null;
}

// ----------------------------------------------------------------
// Comparación de revisiones
// ----------------------------------------------------------------

/**
 * Compara dos revisiones con SEMANTICA NATURAL:
 *   - Devolver > 0 significa que 'a' es mas NUEVA que 'b'.
 *   - Devolver < 0 significa que 'a' es mas VIEJA que 'b'.
 *
 * Jerarquia: numeros > letras. Entre numeros gana el mayor (3 > 2 > 1).
 * Entre letras gana la posterior del alfabeto (Z > Y > ... > A).
 *
 * OJO: los listados que quieren mostrar la mas NUEVA PRIMERO deben llamar
 * compararRevision(b.revision, a.revision) (argumentos invertidos).
 */
function compararRevision(a, b) {
  const sa = String(a);
  const sb = String(b);

  const aEsLetra = /^[A-Za-z]$/.test(sa);
  const bEsLetra = /^[A-Za-z]$/.test(sb);

  if (aEsLetra && bEsLetra) {
    return sa.toUpperCase().localeCompare(sb.toUpperCase());
  }
  if (!aEsLetra && !bEsLetra) {
    return parseInt(sa, 10) - parseInt(sb, 10);
  }
  // Los numeros son mas nuevos que las letras.
  return aEsLetra ? -1 : 1;
}

// ----------------------------------------------------------------
// Validación de calibración
// ----------------------------------------------------------------

function validarCalibracion(datos, ancho, alto) {
  if (!datos.punto00 || !datos.punto100) {
    return 'Faltan los puntos de calibración.';
  }

  const p00 = datos.punto00;
  const p100 = datos.punto100;

  const num = function (v) { return typeof v === 'number' && isFinite(v); };

  if (!num(p00.x) || !num(p00.y) || !num(p100.x) || !num(p100.y)) {
    return 'Coordenadas inválidas.';
  }
  if (p00.x < 0 || p00.y < 0 || p00.x > ancho || p00.y > alto) {
    return 'El punto 0,0 está fuera de la imagen.';
  }
  if (p100.x < 0 || p100.y < 0 || p100.x > ancho || p100.y > alto) {
    return 'El punto 100,100 está fuera de la imagen.';
  }
  if (p00.x === p100.x && p00.y === p100.y) {
    return 'Los dos puntos no pueden coincidir.';
  }
  if (p100.x <= p00.x) {
    return 'El punto 100,100 debe estar a la derecha del punto 0,0.';
  }
  if (p100.y >= p00.y) {
    return 'El punto 100,100 debe estar arriba del punto 0,0 (eje Y invertido en imágenes).';
  }
  return null;
}

// ----------------------------------------------------------------
// Normalización de nombres viejos (migración)
// ----------------------------------------------------------------

/**
 * Si el nombre tiene el patrón "NOMBRE_NNdeNN" al final, lo saca.
 * Devuelve solo el nombre limpio.
 */
function normalizarNombrePIDViejo(nombre) {
  if (!nombre) return nombre;
  return String(nombre).replace(/_\d+[Dd][Ee]\d+$/, '');
}

/**
 * Si el nombre tiene el patrón "NOMBRE_NNdeNN" al final, devuelve
 * la hoja como "NdeM". Si no, devuelve null.
 */
function extraerHojaDeNombreViejo(nombre) {
  if (!nombre) return null;
  const m = String(nombre).match(/_(\d+)[Dd][Ee](\d+)$/);
  if (!m) return null;
  return formatearHoja({ actual: parseInt(m[1], 10), total: parseInt(m[2], 10) });
}

// ----------------------------------------------------------------
// Exportaciones
// ----------------------------------------------------------------

module.exports = {
  parsearNombreArchivo,
  formatearHoja,
  parsearHoja,
  parsearHojaEstricta,
  nombreLindo,
  rutaJSONCalibracion,
  leerCalibracion,
  guardarCalibracion,
  borrarCalibracion,
  escanearPIDs,
  escanearPIDsCacheado,
  invalidarCachePIDs,
  buscarPID,
  validarCalibracion,
  compararRevision,
  normalizarNombrePIDViejo,
  extraerHojaDeNombreViejo
};