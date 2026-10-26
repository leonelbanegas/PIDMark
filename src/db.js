// ================================================================
// Base de datos SQLite (node:sqlite nativo, NO better-sqlite3)
// ================================================================
// Configuración segura para SMB: journal_mode = DELETE (no WAL) y
// busy_timeout. Crea el esquema si no existe.

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

let db = null;

function inicializarDB(rutaArchivo) {
  const carpeta = path.dirname(rutaArchivo);
  if (!fs.existsSync(carpeta)) fs.mkdirSync(carpeta, { recursive: true });

  db = new DatabaseSync(rutaArchivo);

  // journal_mode = DELETE: seguro para sistemas de archivos en red (SMB).
  // WAL no funciona bien sobre SMB.
  try { db.exec('PRAGMA journal_mode = DELETE;'); } catch (e) {}
  try { db.exec('PRAGMA busy_timeout = 5000;'); } catch (e) {}
  try { db.exec('PRAGMA foreign_keys = ON;'); } catch (e) {}

  crearEsquema();
  return db;
}

function crearEsquema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre_windows TEXT NOT NULL UNIQUE,
      es_admin INTEGER NOT NULL DEFAULT 0,
      creado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS listados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      descripcion TEXT,
      usuario_id INTEGER NOT NULL,
      origen_id INTEGER,
      creado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      modificado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    );

    CREATE TABLE IF NOT EXISTS listado_pids (
      listado_id INTEGER NOT NULL,
      pid_nombre TEXT NOT NULL,
      pid_hoja TEXT NOT NULL,
      pid_revision TEXT NOT NULL,
      PRIMARY KEY (listado_id, pid_nombre, pid_hoja, pid_revision),
      FOREIGN KEY (listado_id) REFERENCES listados(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listado_id INTEGER NOT NULL,
      orden INTEGER NOT NULL DEFAULT 1,
      tag TEXT,
      descripcion TEXT,
      diametro REAL,
      cso_csc INTEGER NOT NULL DEFAULT 0,
      estado TEXT NOT NULL DEFAULT 'otro',
      pid_nombre TEXT,
      pid_hoja TEXT,
      pid_revision TEXT,
      x REAL,
      y REAL,
      forma TEXT NOT NULL DEFAULT 'circulo',
      tamano INTEGER NOT NULL DEFAULT 14,
      tamano_y INTEGER,
      etiqueta_offset_x REAL,
      etiqueta_offset_y REAL,
      ubicacion TEXT,
      FOREIGN KEY (listado_id) REFERENCES listados(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lineas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listado_id INTEGER NOT NULL,
      orden INTEGER NOT NULL DEFAULT 1,
      pid_nombre TEXT NOT NULL,
      pid_hoja TEXT NOT NULL,
      pid_revision TEXT NOT NULL,
      color_indice INTEGER NOT NULL DEFAULT 0,
      grosor REAL NOT NULL DEFAULT 16,
      opacidad INTEGER NOT NULL DEFAULT 70,
      puntos TEXT NOT NULL DEFAULT '[]',
      FOREIGN KEY (listado_id) REFERENCES listados(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS nombres_colores_lineas (
      pid_nombre TEXT NOT NULL,
      pid_hoja TEXT NOT NULL,
      indice INTEGER NOT NULL,
      nombre TEXT NOT NULL,
      PRIMARY KEY (pid_nombre, pid_hoja, indice)
    );

    CREATE TABLE IF NOT EXISTS hipervinculos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pid_nombre TEXT NOT NULL,
      pid_hoja TEXT NOT NULL,
      pid_revision TEXT NOT NULL,
      x REAL NOT NULL,
      y REAL NOT NULL,
      w REAL NOT NULL,
      h REAL NOT NULL,
      destino_pid_nombre TEXT NOT NULL,
      destino_pid_hoja TEXT NOT NULL,
      destino_pid_revision TEXT NOT NULL,
      creado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS leyendas_lineas (
      listado_id INTEGER NOT NULL,
      pid_nombre TEXT NOT NULL,
      pid_hoja TEXT NOT NULL,
      x REAL NOT NULL,
      y REAL NOT NULL,
      PRIMARY KEY (listado_id, pid_nombre, pid_hoja)
    );

    CREATE TABLE IF NOT EXISTS eventos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario TEXT,
      accion TEXT,
      detalle TEXT,
      creado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sesiones (
      token TEXT PRIMARY KEY,
      usuario_id INTEGER NOT NULL,
      creado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expira TEXT NOT NULL,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    );
  `);

  migrarUsuariosPassword();
  migrarHipervinculos();
  migrarLineasDescripcion();
  migrarIndices();
}

/**
 * Migración idempotente: crea los índices que faltan.
 *
 * Ya existían:
 *   idx_items_listado        items(listado_id, orden)
 *   idx_lineas_listado       lineas(listado_id, pid_nombre, pid_hoja, pid_revision)
 *   idx_listado_pids_listado listado_pids(listado_id)
 *   idx_listados_usuario     listados(usuario_id)
 *
 * Estos cubren las consultas POR LISTADO. Faltaban los que cubren las
 * consultas GLOBALES por P&ID (borrar un P&ID, sus items/lineas, buscar
 * hipervínculos) y las de sesiones/eventos.
 *
 * Todos son CREATE INDEX IF NOT EXISTS -> se pueden correr en cada arranque.
 */
function migrarIndices() {
  const indices = [
    // Borrar un P&ID global y consultar sus referencias: filtra por P&ID
    // (sin listado_id). Sin estos índices, cada DELETE hacía un scan completo.
    'CREATE INDEX IF NOT EXISTS idx_items_pid ON items(pid_nombre, pid_hoja, pid_revision)',
    'CREATE INDEX IF NOT EXISTS idx_lineas_pid ON lineas(pid_nombre, pid_hoja, pid_revision)',
    'CREATE INDEX IF NOT EXISTS idx_listado_pids_pid ON listado_pids(pid_nombre, pid_hoja, pid_revision)',

    // Hipervínculos: se consultan SIEMPRE por P&ID de origen y no tenían índice.
    'CREATE INDEX IF NOT EXISTS idx_hipervinculos_pid ON hipervinculos(pid_nombre, pid_hoja, pid_revision)',
    // Borrar el par completo busca por par_id.
    'CREATE INDEX IF NOT EXISTS idx_hipervinculos_par ON hipervinculos(par_id)',

    // Sesiones: logout masivo por usuario y limpieza por vencimiento.
    'CREATE INDEX IF NOT EXISTS idx_sesiones_usuario ON sesiones(usuario_id)',
    'CREATE INDEX IF NOT EXISTS idx_sesiones_expira ON sesiones(expira)',

    // Eventos: la tabla crece con cada acción; el listado ordena por fecha.
    // OJO: la columna es `fecha` (no `creado`).
    'CREATE INDEX IF NOT EXISTS idx_eventos_fecha ON eventos(fecha)',

    // Leyendas: se consultan por listado (la PK arranca por listado_id, así
    // que ya está cubierto); el borrado global filtra por P&ID.
    'CREATE INDEX IF NOT EXISTS idx_leyendas_pid ON leyendas_lineas(pid_nombre, pid_hoja)'
  ];

  for (let i = 0; i < indices.length; i++) {
    try { db.exec(indices[i]); } catch (e) {
      // Si falla (tabla inexistente en una base vieja), seguimos.
    }
  }
}

/**
 * Migración idempotente: agrega la columna descripcion a `lineas` si no
 * existe. Es un texto libre opcional (ej. "Línea de vapor principal").
 */
function migrarLineasDescripcion() {
  let columnas = [];
  try {
    columnas = db.prepare('PRAGMA table_info(lineas)').all().map(function (c) { return c.name; });
  } catch (e) {
    return;
  }
  if (columnas.indexOf('descripcion') === -1) {
    try { db.exec('ALTER TABLE lineas ADD COLUMN descripcion TEXT'); } catch (e) {}
  }
}

/**
 * Migración idempotente: agrega la columna par_id a hipervinculos si no
 * existe. Los dos links de un mismo par (A->B y B->A) comparten par_id.
 */
function migrarHipervinculos() {
  let columnas = [];
  try {
    columnas = db.prepare('PRAGMA table_info(hipervinculos)').all().map(function (c) { return c.name; });
  } catch (e) {
    return;
  }
  if (columnas.indexOf('par_id') === -1) {
    try { db.exec('ALTER TABLE hipervinculos ADD COLUMN par_id INTEGER'); } catch (e) {}
  }
}

/**
 * Migración idempotente: agrega columnas de autenticación a `usuarios` si
 * no existen (password_hash, debe_cambiar_password, activo).
 */
function migrarUsuariosPassword() {
  let columnas = [];
  try {
    columnas = db.prepare("PRAGMA table_info(usuarios)").all().map(function (c) { return c.name; });
  } catch (e) {
    return;
  }

  function agregar(nombre, definicion) {
    if (columnas.indexOf(nombre) !== -1) return;
    try { db.exec('ALTER TABLE usuarios ADD COLUMN ' + nombre + ' ' + definicion); } catch (e) {}
  }

  agregar('password_hash', 'TEXT');
  agregar('debe_cambiar_password', 'INTEGER NOT NULL DEFAULT 0');
  agregar('activo', 'INTEGER NOT NULL DEFAULT 1');
  agregar('rol', "TEXT NOT NULL DEFAULT 'usuario'");

  // Sincronizar roles con el booleano historico es_admin.
  // Un es_admin=1 pasa a rol='admin'. Los demas quedan como 'usuario'.
  try {
    db.exec("UPDATE usuarios SET rol = 'admin' WHERE es_admin = 1 AND (rol IS NULL OR rol = '' OR rol = 'usuario')");
  } catch (e) {}
}

function getDB() {
  if (!db) throw new Error('DB no inicializada. Llamar inicializarDB() primero.');
  return db;
}

module.exports = { inicializarDB, getDB };