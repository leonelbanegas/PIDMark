// ================================================================
// Rutas HTTP de la API del PID Marcador
// ================================================================

const path = require('path');
const fs = require('fs');
const { getDB } = require('./db');
const auth = require('./auth');
const sesiones = require('./sesiones');
const pid = require('./pid');
const pdfarender = require('./pdfarender');
const PDFDocument = require('pdfkit');

const LARGO_MAX_DESCRIPCION_LISTADO = 1000;
const CANT_COLORES_LINEA = 10;
const COLORES_LINEA_FIJOS = 3;

const NOMBRES_COLORES_DEFAULT = [
  'Gas', 'Petróleo', 'Agua',
  'Color 4', 'Color 5', 'Color 6', 'Color 7', 'Color 8', 'Color 9', 'Color 10'
];

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

function asegurarUsuario(db, nombre) {
  let fila = db.prepare('SELECT id, es_admin FROM usuarios WHERE lower(nombre_windows) = lower(?)').get(nombre);
  if (fila) return fila;
  const info = db.prepare('INSERT INTO usuarios (nombre_windows, es_admin) VALUES (?, 0)').run(nombre);
  return { id: Number(info.lastInsertRowid), es_admin: 0 };
}

function registrarEvento(db, usuario, accion, detalle) {
  try { db.prepare('INSERT INTO eventos (usuario, accion, detalle) VALUES (?, ?, ?)').run(usuario, accion, detalle || ''); } catch (e) {}
}

function renumerarItems(db, listadoId) {
  const filas = db.prepare('SELECT id FROM items WHERE listado_id = ? ORDER BY orden ASC, id ASC').all(listadoId);
  const update = db.prepare('UPDATE items SET orden = ? WHERE id = ?');
  filas.forEach(function (f, i) { update.run(i + 1, f.id); });
}

function tocarListado(db, listadoId) {
  db.prepare('UPDATE listados SET modificado = CURRENT_TIMESTAMP WHERE id = ?').run(listadoId);
}

function infoListadoParaUsuario(db, listado, u, admin) {
  return {
    id: listado.id, nombre: listado.nombre, descripcion: listado.descripcion || null, usuario: listado.usuario,
    usuario_id: listado.usuario_id, creado: listado.creado, modificado: listado.modificado, origen_id: listado.origen_id,
    esPropio: listado.usuario_id === u.id, puedeEditar: listado.usuario_id === u.id || admin
  };
}

function ordenarPIDs(lista) {
  lista.sort(function (a, b) {
    if (a.pid !== b.pid) return a.pid.localeCompare(b.pid);
    const ha = pid.parsearHoja(a.hojaTexto || a.hoja), hb = pid.parsearHoja(b.hojaTexto || b.hoja);
    if (ha.total !== hb.total) return ha.total - hb.total;
    if (ha.actual !== hb.actual) return ha.actual - hb.actual;
    // Revision MAS NUEVA primero: argumentos invertidos (compararRevision
    // devuelve > 0 cuando el primer argumento es mas nuevo).
    return pid.compararRevision(b.revision, a.revision);
  });
  return lista;
}

function enriquecerItemsConNumero(db, listadoId, items) {
  const todos = db.prepare('SELECT id FROM items WHERE listado_id = ? ORDER BY orden ASC, id ASC').all(listadoId);
  const posiciones = {}; todos.forEach(function (t, i) { posiciones[t.id] = i + 1; });
  return items.map(function (it) { it.numero = posiciones[it.id] || it.orden || 0; return it; });
}

function normalizarDiametro(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  const n = parseFloat(valor); if (isNaN(n) || n <= 0) return null; return n;
}

function normalizarDescripcion(valor) {
  if (valor === undefined || valor === null) return null;
  let s = String(valor).trim(); if (s === '') return null; if (s.length > 200) s = s.slice(0, 200); return s;
}

function normalizarDescripcionListado(valor) {
  if (valor === undefined || valor === null) return null;
  let s = String(valor); if (s === '') return null;
  if (s.length > LARGO_MAX_DESCRIPCION_LISTADO) s = s.slice(0, LARGO_MAX_DESCRIPCION_LISTADO);
  if (s.trim() === '') return null; return s;
}

function normalizarCsoCsc(valor) {
  if (valor === undefined || valor === null) return 0;
  if (valor === true || valor === 1 || valor === '1' || valor === 'true') return 1;
  return 0;
}

function normalizarHoja(hoja) {
  if (hoja === null || hoja === undefined || hoja === '') return { actual: 1, total: 1, texto: '1de1' };
  if (typeof hoja === 'object') {
    const t = pid.formatearHoja(hoja), p = pid.parsearHoja(t);
    return { actual: p.actual, total: p.total, texto: t };
  }
  const t = pid.formatearHoja(String(hoja)), p = pid.parsearHoja(t);
  return { actual: p.actual, total: p.total, texto: t };
}

// ----------------------------------------------------------------
// Cache de escaneo por request (evita recorrer la carpeta N veces)
// ----------------------------------------------------------------

// Cache por request (evita repetir el escaneo dentro del MISMO request).
// Por debajo, escanearPIDsCacheado() cachea GLOBALMENTE durante 10 s, asi
// que requests seguidos de distintos usuarios tampoco recorren la carpeta.
function obtenerListaPIDsCacheada(req) {
  if (req._listaPIDsCache) return req._listaPIDsCache;
  try {
    req._listaPIDsCache = pid.escanearPIDsCacheado(req.contexto.config.Rutas.CarpetaImagenes);
  } catch (e) {
    req._listaPIDsCache = [];
  }
  return req._listaPIDsCache;
}

function buscarPIDEnLista(lista, nombre, hoja, rev) {
  if (!Array.isArray(lista) || lista.length === 0) return null;
  const nombreStr = String(nombre);
  const revStr = String(rev);
  const hojaTexto = pid.formatearHoja(hoja);
  for (let i = 0; i < lista.length; i++) {
    const p = lista[i];
    if (p.pid === nombreStr && p.hojaTexto === hojaTexto && String(p.revision) === revStr) return p;
  }
  return null;
}

function hojaEnriquecidaDesdeLista(lista, pidNombre, pidHoja, pidRev) {
  const encontrado = buscarPIDEnLista(lista, pidNombre, pidHoja, pidRev);
  if (encontrado) {
    return { actual: encontrado.hoja.actual, total: encontrado.hoja.total, texto: encontrado.hojaTexto };
  }
  return normalizarHoja(pidHoja);
}

function normalizarPuntosLinea(valor) {
  if (!Array.isArray(valor) || valor.length < 2) return null;
  const out = [];
  for (let i = 0; i < valor.length; i++) {
    const p = valor[i]; if (!p || typeof p !== 'object') return null;
    const x = parseFloat(p.x), y = parseFloat(p.y); if (isNaN(x) || isNaN(y)) return null;
    out.push({ x: x, y: y });
  }
  return out;
}

function normalizarColorLinea(valor) {
  const n = parseInt(valor, 10); if (isNaN(n) || n < 0 || n >= CANT_COLORES_LINEA) return null; return n;
}

function normalizarGrosorLinea(valor) {
  const n = parseFloat(valor); if (isNaN(n) || n < 1 || n > 100) return null; return n;
}

function normalizarOpacidadLinea(valor) {
  const n = parseInt(valor, 10); if (isNaN(n) || n < 1 || n > 100) return null; return n;
}

function nombresColoresLinea(db, listadoId, pidNombre, pidHoja) {
  const filas = db.prepare(
    'SELECT indice, nombre FROM nombres_colores_lineas_listado ' +
    'WHERE listado_id = ? AND pid_nombre = ? AND pid_hoja = ?'
  ).all(listadoId, pidNombre, pidHoja);
  const nombres = NOMBRES_COLORES_DEFAULT.slice();
  filas.forEach(function (f) {
    if (f.indice >= 0 && f.indice < CANT_COLORES_LINEA) nombres[f.indice] = f.nombre;
  });
  return nombres;
}

// ----------------------------------------------------------------
// Registro de rutas
// ----------------------------------------------------------------

module.exports = function (app) {

  // ----------------------------------------------------------------
  // AUTENTICACIÓN (solo en modo password)
  // ----------------------------------------------------------------

  // Helper: en modo password exige sesión; en windows no hace nada.
  function exigirSesion(req, res, next) {
    if (req.contexto.modoAuth !== 'password') return next();
    if (!req.contexto.autenticado) return res.status(401).json({ error: 'No autenticado.' });
    next();
  }

  app.post('/api/login', function (req, res) {
    if (req.contexto.modoAuth !== 'password') {
      return res.status(400).json({ error: 'El login no está habilitado (modo windows).' });
    }
    const b = req.body || {};
    const usuario = String(b.usuario || '').trim();
    const password = String(b.password || '');
    if (!usuario || !password) return res.status(400).json({ error: 'Usuario y contraseña obligatorios.' });

    const db = getDB();
    const fila = db.prepare('SELECT id, nombre_windows, es_admin, rol, password_hash, debe_cambiar_password, activo FROM usuarios WHERE lower(nombre_windows) = lower(?)').get(usuario);
    if (!fila) return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    if (fila.activo !== 1) return res.status(403).json({ error: 'Usuario deshabilitado.' });

    // Usuario SIN clave asignada (recien creado por el admin):
    // NO se valida contrasena. Se le pide que la cree antes de entrar.
    // (No se crea sesion todavia: eso pasa en /api/definir-password.)
    if (!fila.password_hash) {
      return res.status(200).json({
        ok: true,
        sinPassword: true,
        usuario: fila.nombre_windows
      });
    }

    if (!auth.verifyPassword(password, fila.password_hash)) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    const token = sesiones.crearSesion(fila.id);
    const esHttps = req.secure || (req.headers['x-forwarded-proto'] === 'https');
    res.setHeader('Set-Cookie', sesiones.cookieSesion(token, esHttps));
    res.json({
      usuario: fila.nombre_windows,
      admin: (fila.es_admin === 1),
      debeCambiarPassword: (fila.debe_cambiar_password === 1)
    });
  });

  // Define la clave de un usuario que todavia NO tiene (password_hash NULL).
  // Sirve para el alta: el admin crea el usuario sin clave y el usuario
  // define la suya la primera vez que entra.
  // SEGURIDAD: solo funciona si el usuario NUNCA tuvo clave. Si ya tiene
  // password_hash, responde 403 (para cambiar la clave esta /api/cambiar-password).
  app.post('/api/definir-password', function (req, res) {
    if (req.contexto.modoAuth !== 'password') {
      return res.status(400).json({ error: 'No aplica en modo windows.' });
    }
    const b = req.body || {};
    const usuario = String(b.usuario || '').trim();
    const password = String(b.password || '');
    if (!usuario) return res.status(400).json({ error: 'Falta el usuario.' });
    if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });

    const db = getDB();
    const fila = db.prepare('SELECT id, nombre_windows, es_admin, password_hash, activo FROM usuarios WHERE lower(nombre_windows) = lower(?)').get(usuario);
    if (!fila) return res.status(404).json({ error: 'Usuario no encontrado.' });
    if (fila.activo !== 1) return res.status(403).json({ error: 'Usuario deshabilitado.' });
    if (fila.password_hash) {
      return res.status(403).json({ error: 'Este usuario ya tiene contraseña. Usá "Cambiar contraseña".' });
    }

    const hash = auth.hashPassword(password);
    db.prepare('UPDATE usuarios SET password_hash = ?, debe_cambiar_password = 0 WHERE id = ?').run(hash, fila.id);

    // Crear sesion y loguear directamente.
    const token = sesiones.crearSesion(fila.id);
    const esHttps = req.secure || (req.headers['x-forwarded-proto'] === 'https');
    res.setHeader('Set-Cookie', sesiones.cookieSesion(token, esHttps));
    registrarEvento(db, fila.nombre_windows, 'definir_password', 'usuario=' + fila.nombre_windows);
    res.json({
      ok: true,
      usuario: fila.nombre_windows,
      admin: (fila.es_admin === 1),
      debeCambiarPassword: false
    });
  });

  app.post('/api/logout', function (req, res) {
    const token = req.contexto.tokenSesion;
    if (token) sesiones.destruirSesion(token);
    const esHttps = req.secure || (req.headers['x-forwarded-proto'] === 'https');
    res.setHeader('Set-Cookie', sesiones.cookieBorrar(esHttps));
    res.json({ ok: true });
  });

  app.post('/api/cambiar-password', exigirSesion, function (req, res) {
    if (req.contexto.modoAuth !== 'password') return res.status(400).json({ error: 'No aplica en modo windows.' });
    const b = req.body || {};
    const actual = String(b.actual || '');
    const nueva = String(b.nueva || '');
    if (nueva.length < 4) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 4 caracteres.' });

    const db = getDB();
    const fila = db.prepare('SELECT id, password_hash FROM usuarios WHERE id = ?').get(req.contexto.usuarioId);
    if (!fila) return res.status(404).json({ error: 'Usuario no encontrado.' });
    if (!auth.verifyPassword(actual, fila.password_hash)) return res.status(401).json({ error: 'Contraseña actual incorrecta.' });

    const hash = auth.hashPassword(nueva);
    db.prepare('UPDATE usuarios SET password_hash = ?, debe_cambiar_password = 0 WHERE id = ?').run(hash, fila.id);
    // Invalida las demás sesiones de este usuario (deja la actual).
    sesiones.destruirSesionesDeUsuario(fila.id, req.contexto.tokenSesion);
    res.json({ ok: true });
  });

  app.get('/api/sesion', function (req, res) {
    const c = req.contexto.config;
    res.json({
      usuario: req.contexto.usuario,
      admin: req.contexto.admin,
      rol: req.contexto.rol || (req.contexto.admin ? 'admin' : 'usuario'),
      puedeGestionarPid: !!req.contexto.puedeGestionarPid,
      usuarioId: req.contexto.usuarioId || null,
      modoAuth: req.contexto.modoAuth,
      autenticado: req.contexto.autenticado,
      debeCambiarPassword: !!req.contexto.debeCambiarPassword,
      config: { Marcadores: c.Marcadores, Lupa: c.Lupa, Interfaz: c.Interfaz }
    });
  });

  app.get('/api/usuarios', function (req, res) { if (!req.contexto.admin) return res.status(403).json({ error: 'Solo admin.' }); res.json({ usuarios: getDB().prepare('SELECT id, nombre_windows FROM usuarios ORDER BY lower(nombre_windows) ASC').all() }); });

  // LISTADOS
  app.get('/api/listados', function (req, res) {
    const db = getDB(), usuario = req.contexto.usuario, u = asegurarUsuario(db, usuario);
    const filas = db.prepare('SELECT l.id, l.nombre, l.descripcion, l.creado, l.modificado, u.nombre_windows AS usuario, l.usuario_id, l.origen_id, (SELECT COUNT(*) FROM items WHERE listado_id = l.id) AS cantidad_items, (SELECT COUNT(*) FROM listado_pids WHERE listado_id = l.id) AS cantidad_pids, (SELECT GROUP_CONCAT(pid_nombre, \' \') FROM listado_pids WHERE listado_id = l.id) AS pids_busqueda FROM listados l JOIN usuarios u ON u.id = l.usuario_id ORDER BY l.modificado DESC').all();
    res.json({ usuarioActual: usuario, usuarioId: u.id, listados: filas.map(function (f) { return { id: f.id, nombre: f.nombre, descripcion: f.descripcion || null, creado: f.creado, modificado: f.modificado, usuario: f.usuario, usuario_id: f.usuario_id, origen_id: f.origen_id, cantidad_items: f.cantidad_items, cantidad_pids: f.cantidad_pids, pids_busqueda: f.pids_busqueda || '', esPropio: f.usuario_id === u.id, puedeEditar: f.usuario_id === u.id || req.contexto.admin }; }) });
  });

  app.post('/api/listados', function (req, res) {
    const db = getDB(), usuario = req.contexto.usuario, u = asegurarUsuario(db, usuario);
    const nombre = (req.body && req.body.nombre ? String(req.body.nombre) : '').trim().slice(0, 200); const descripcion = normalizarDescripcionListado(req.body && req.body.descripcion);
    if (!nombre) return res.status(400).json({ error: 'Nombre vacío.' });
    const pids = (req.body && Array.isArray(req.body.pids)) ? req.body.pids : [];
    const info = db.prepare('INSERT INTO listados (nombre, descripcion, usuario_id) VALUES (?, ?, ?)').run(nombre, descripcion, u.id);
    const nuevoId = Number(info.lastInsertRowid);
    const insPID = db.prepare('INSERT OR IGNORE INTO listado_pids (listado_id, pid_nombre, pid_hoja, pid_revision) VALUES (?, ?, ?, ?)');
    pids.forEach(p => { if (p && p.pid && p.revision !== undefined && p.revision !== null && p.revision !== '') insPID.run(nuevoId, String(p.pid), normalizarHoja(p.hoja).texto, String(p.revision)); });
    registrarEvento(db, usuario, 'crear_listado', 'id=' + nuevoId + ' nombre=' + nombre);
    res.json({ id: nuevoId, nombre: nombre, pids: pids.length });
  });

  app.get('/api/listados/:id', function (req, res) {
    const db = getDB(), usuario = req.contexto.usuario, u = asegurarUsuario(db, usuario), id = parseInt(req.params.id, 10);
    const listado = db.prepare('SELECT l.*, u.nombre_windows AS usuario FROM listados l JOIN usuarios u ON u.id = l.usuario_id WHERE l.id = ?').get(id);
    if (!listado) return res.status(404).json({ error: 'Listado no encontrado.' });

    const listaPIDs = obtenerListaPIDsCacheada(req);

    const pidsRaw = db.prepare('SELECT lp.pid_nombre, lp.pid_hoja, lp.pid_revision, (SELECT COUNT(*) FROM items WHERE listado_id = lp.listado_id AND pid_nombre = lp.pid_nombre AND pid_hoja = lp.pid_hoja AND pid_revision = lp.pid_revision) AS cantidad_items FROM listado_pids lp WHERE lp.listado_id = ?').all(id);
    const pidsOrdenados = ordenarPIDs(pidsRaw.map(function (p) {
      const hojaNorm = normalizarHoja(p.pid_hoja);
      const hoja = hojaEnriquecidaDesdeLista(listaPIDs, p.pid_nombre, p.pid_hoja, p.pid_revision);
      return { pid: p.pid_nombre, hoja: hoja, hojaTexto: hojaNorm.texto, revision: p.pid_revision, cantidad_items: p.cantidad_items };
    }));
    res.json({ listado: infoListadoParaUsuario(db, listado, u, req.contexto.admin), pids: pidsOrdenados });
  });

  app.put('/api/listados/:id', function (req, res) {
    const db = getDB(), usuario = req.contexto.usuario, u = asegurarUsuario(db, usuario), id = parseInt(req.params.id, 10);
    const listado = db.prepare('SELECT * FROM listados WHERE id = ?').get(id);
    if (!listado) return res.status(404).json({ error: 'Listado no encontrado.' });
    if (listado.usuario_id !== u.id && !req.contexto.admin) return res.status(403).json({ error: 'Sin permiso.' });
    const b = req.body || {}; let nuevoNombre = listado.nombre;
    if (b.nombre !== undefined) { const n = String(b.nombre).trim().slice(0, 200); if (!n) return res.status(400).json({ error: 'Nombre vacío.' }); nuevoNombre = n; }
    let nuevaDescripcion = listado.descripcion; if (b.descripcion !== undefined) nuevaDescripcion = normalizarDescripcionListado(b.descripcion);
    db.prepare('UPDATE listados SET nombre = ?, descripcion = ?, modificado = CURRENT_TIMESTAMP WHERE id = ?').run(nuevoNombre, nuevaDescripcion, id);
    res.json({ ok: true, nombre: nuevoNombre, descripcion: nuevaDescripcion });
  });

  app.delete('/api/listados/:id', function (req, res) {
    const db = getDB(), usuario = req.contexto.usuario, u = asegurarUsuario(db, usuario), id = parseInt(req.params.id, 10);
    const listado = db.prepare('SELECT * FROM listados WHERE id = ?').get(id);
    if (!listado) return res.status(404).json({ error: 'Listado no encontrado.' });
    if (listado.usuario_id !== u.id && !req.contexto.admin) return res.status(403).json({ error: 'Sin permiso.' });
    try { db.prepare('UPDATE listados SET origen_id = NULL WHERE origen_id = ?').run(id); } catch (e) {}
    db.prepare('DELETE FROM items WHERE listado_id = ?').run(id); db.prepare('DELETE FROM lineas WHERE listado_id = ?').run(id); db.prepare('DELETE FROM listado_pids WHERE listado_id = ?').run(id); try { db.prepare('DELETE FROM leyendas_lineas WHERE listado_id = ?').run(id); } catch (e) {} db.prepare('DELETE FROM listados WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  app.post('/api/listados/:id/cambiar-duenio', function (req, res) {
    if (!req.contexto.admin) return res.status(403).json({ error: 'Solo admin.' });
    const db = getDB(), id = parseInt(req.params.id, 10);
    const listado = db.prepare('SELECT l.*, u.nombre_windows AS usuario_actual FROM listados l JOIN usuarios u ON u.id = l.usuario_id WHERE l.id = ?').get(id);
    if (!listado) return res.status(404).json({ error: 'Listado no encontrado.' });
    const nombreDestino = (req.body && req.body.nuevo_usuario) ? String(req.body.nuevo_usuario).trim() : '';
    if (!nombreDestino) return res.status(400).json({ error: 'Falta nuevo dueño.' });
    if (String(listado.usuario_actual).toLowerCase() === nombreDestino.toLowerCase()) return res.status(400).json({ error: 'Ya pertenece a ese dueño.' });
    const destino = asegurarUsuario(db, nombreDestino);
    db.prepare('UPDATE listados SET usuario_id = ?, modificado = CURRENT_TIMESTAMP WHERE id = ?').run(destino.id, id);
    res.json({ ok: true });
  });

  app.post('/api/listados/:id/copiar', function (req, res) {
    const db = getDB(), usuario = req.contexto.usuario, u = asegurarUsuario(db, usuario), id = parseInt(req.params.id, 10);
    const original = db.prepare('SELECT * FROM listados WHERE id = ?').get(id);
    if (!original) return res.status(404).json({ error: 'Listado no encontrado.' });
    const nuevoNombre = (req.body && req.body.nombre ? String(req.body.nombre) : '').trim() || (original.nombre + ' (copia de ' + usuario + ')');
    const info = db.prepare('INSERT INTO listados (nombre, descripcion, usuario_id, origen_id) VALUES (?, ?, ?, ?)').run(nuevoNombre, original.descripcion || null, u.id, original.id);
    const nuevoId = Number(info.lastInsertRowid);
    db.prepare('SELECT pid_nombre, pid_hoja, pid_revision FROM listado_pids WHERE listado_id = ?').all(id).forEach(p => db.prepare('INSERT OR IGNORE INTO listado_pids (listado_id, pid_nombre, pid_hoja, pid_revision) VALUES (?, ?, ?, ?)').run(nuevoId, p.pid_nombre, p.pid_hoja || '1de1', p.pid_revision));
    const items = db.prepare('SELECT * FROM items WHERE listado_id = ? ORDER BY orden ASC, id ASC').all(id);
    const insItem = db.prepare('INSERT INTO items (listado_id, orden, tag, descripcion, diametro, cso_csc, estado, pid_nombre, pid_hoja, pid_revision, x, y, forma, tamano, tamano_y, etiqueta_offset_x, etiqueta_offset_y, ubicacion) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    items.forEach(it => insItem.run(nuevoId, it.orden, it.tag, it.descripcion, it.diametro, it.cso_csc, it.estado, it.pid_nombre, it.pid_hoja || '1de1', it.pid_revision, it.x, it.y, it.forma, it.tamano, (it.tamano_y !== null && it.tamano_y !== undefined) ? it.tamano_y : it.tamano, it.etiqueta_offset_x, it.etiqueta_offset_y, it.ubicacion));
    const lineas = db.prepare('SELECT * FROM lineas WHERE listado_id = ? ORDER BY orden ASC, id ASC').all(id);
    const insLinea = db.prepare('INSERT INTO lineas (listado_id, orden, pid_nombre, pid_hoja, pid_revision, color_indice, grosor, opacidad, puntos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    lineas.forEach(ln => insLinea.run(nuevoId, ln.orden, ln.pid_nombre, ln.pid_hoja, ln.pid_revision, ln.color_indice, ln.grosor, ln.opacidad || 70, ln.puntos));
    // Copiar también la posición de la leyenda de líneas (es por listado).
    try {
      const leyendas = db.prepare('SELECT pid_nombre, pid_hoja, x, y FROM leyendas_lineas WHERE listado_id = ?').all(id);
      const insLeyenda = db.prepare('INSERT OR IGNORE INTO leyendas_lineas (listado_id, pid_nombre, pid_hoja, x, y) VALUES (?, ?, ?, ?, ?)');
      leyendas.forEach(ly => insLeyenda.run(nuevoId, ly.pid_nombre, ly.pid_hoja, ly.x, ly.y));
    } catch (e) {}
    const nombresColores = db.prepare(
      'SELECT pid_nombre, pid_hoja, indice, nombre FROM nombres_colores_lineas_listado WHERE listado_id = ?'
    ).all(id);
    const insNombreColor = db.prepare(
      'INSERT INTO nombres_colores_lineas_listado (listado_id, pid_nombre, pid_hoja, indice, nombre) VALUES (?, ?, ?, ?, ?)'
    );
    nombresColores.forEach(function (nc) {
      insNombreColor.run(nuevoId, nc.pid_nombre, nc.pid_hoja, nc.indice, nc.nombre);
    });
    res.json({ id: nuevoId, nombre: nuevoNombre, itemsCopiados: items.length, lineasCopiadas: lineas.length });
  });

  // PIDS
  app.get('/api/listados/:id/pids', function (req, res) {
    const db = getDB(), id = parseInt(req.params.id, 10);
    const listaPIDs = obtenerListaPIDsCacheada(req);

    const pidsRaw = db.prepare('SELECT lp.pid_nombre, lp.pid_hoja, lp.pid_revision, (SELECT COUNT(*) FROM items WHERE listado_id = lp.listado_id AND pid_nombre = lp.pid_nombre AND pid_hoja = lp.pid_hoja AND pid_revision = lp.pid_revision) AS cantidad_items FROM listado_pids lp WHERE lp.listado_id = ?').all(id);
    res.json({ pids: ordenarPIDs(pidsRaw.map(function (p) {
      const h = normalizarHoja(p.pid_hoja);
      return { pid: p.pid_nombre, hoja: hojaEnriquecidaDesdeLista(listaPIDs, p.pid_nombre, p.pid_hoja, p.pid_revision), hojaTexto: h.texto, revision: p.pid_revision, cantidad_items: p.cantidad_items };
    })) });
  });

  app.post('/api/listados/:id/pids', function (req, res) {
    const db = getDB(), usuario = req.contexto.usuario, u = asegurarUsuario(db, usuario), id = parseInt(req.params.id, 10);
    const listado = db.prepare('SELECT * FROM listados WHERE id = ?').get(id);
    if (!listado) return res.status(404).json({ error: 'Listado no encontrado.' });
    if (listado.usuario_id !== u.id && !req.contexto.admin) return res.status(403).json({ error: 'Sin permiso.' });
    const b = req.body || {};
    try { db.prepare('INSERT INTO listado_pids (listado_id, pid_nombre, pid_hoja, pid_revision) VALUES (?, ?, ?, ?)').run(id, String(b.pid), normalizarHoja(b.hoja).texto, String(b.revision)); }
    catch (e) { return res.status(400).json({ error: 'Ya asignado.' }); }
    tocarListado(db, id);
    res.json({ ok: true });
  });

  app.delete('/api/listados/:id/pids/:pid/:hoja/:rev', function (req, res) {
    const db = getDB(), usuario = req.contexto.usuario, u = asegurarUsuario(db, usuario), id = parseInt(req.params.id, 10);
    const pidNombre = decodeURIComponent(req.params.pid), pidHoja = normalizarHoja(decodeURIComponent(req.params.hoja)).texto, pidRev = String(req.params.rev);
    const listado = db.prepare('SELECT * FROM listados WHERE id = ?').get(id);
    if (!listado) return res.status(404).json({ error: 'Listado no encontrado.' });
    if (listado.usuario_id !== u.id && !req.contexto.admin) return res.status(403).json({ error: 'Sin permiso.' });
    const delItems = db.prepare('DELETE FROM items WHERE listado_id = ? AND pid_nombre = ? AND pid_hoja = ? AND pid_revision = ?').run(id, pidNombre, pidHoja, pidRev);
    db.prepare('DELETE FROM lineas WHERE listado_id = ? AND pid_nombre = ? AND pid_hoja = ? AND pid_revision = ?').run(id, pidNombre, pidHoja, pidRev);
    db.prepare('DELETE FROM listado_pids WHERE listado_id = ? AND pid_nombre = ? AND pid_hoja = ? AND pid_revision = ?').run(id, pidNombre, pidHoja, pidRev);
    // La leyenda es por (listado, pid, hoja): si el P&ID se va, no debe quedar huérfana.
    try { db.prepare('DELETE FROM leyendas_lineas WHERE listado_id = ? AND pid_nombre = ? AND pid_hoja = ?').run(id, pidNombre, pidHoja); } catch (e) {}
    renumerarItems(db, id);
    tocarListado(db, id);
    res.json({ ok: true, itemsBorrados: (delItems && delItems.changes) ? delItems.changes : 0 });
  });

  // ACTUALIZAR P&ID DEL LISTADO A LA REVISIÓN MÁS NUEVA
  app.post('/api/listados/:id/pids/:pid/:hoja/:rev/actualizar', function (req, res) {
    const db = getDB(), usuario = req.contexto.usuario, u = asegurarUsuario(db, usuario), id = parseInt(req.params.id, 10);
    const pidNombre = decodeURIComponent(req.params.pid);
    const pidHoja = normalizarHoja(decodeURIComponent(req.params.hoja)).texto;
    const pidRevVieja = String(req.params.rev);

    const listado = db.prepare('SELECT * FROM listados WHERE id = ?').get(id);
    if (!listado) return res.status(404).json({ error: 'Listado no encontrado.' });
    if (listado.usuario_id !== u.id && !req.contexto.admin) return res.status(403).json({ error: 'Sin permiso.' });

    const asignadoViejo = db.prepare('SELECT 1 FROM listado_pids WHERE listado_id = ? AND pid_nombre = ? AND pid_hoja = ? AND pid_revision = ?').get(id, pidNombre, pidHoja, pidRevVieja);
    if (!asignadoViejo) return res.status(404).json({ error: 'El P&ID en esa revisión no está asignado a este listado.' });

    // Buscar la revisión más nueva del mismo (pid, hoja)
    let listaPIDs;
    try { listaPIDs = pid.escanearPIDsCacheado(req.contexto.config.Rutas.CarpetaImagenes); }
    catch (e) { return res.status(500).json({ error: 'No se pudo escanear la carpeta de P&IDs: ' + e.message }); }

    let revMasNueva = null;
    listaPIDs.forEach(function (p) {
      if (p.pid !== pidNombre) return;
      if (p.hojaTexto !== pidHoja) return;
      if (revMasNueva === null || pid.compararRevision(p.revision, revMasNueva) > 0) {
        revMasNueva = String(p.revision);
      }
    });

    if (revMasNueva === null) return res.status(404).json({ error: 'No se encontró el P&ID en la carpeta de imágenes.' });
    if (String(revMasNueva) === String(pidRevVieja)) {
      return res.status(400).json({ error: 'El P&ID ya está en la última revisión (Rev' + revMasNueva + ').' });
    }

    // Bloquear si la revisión nueva ya está asignada al listado
    const yaAsignada = db.prepare('SELECT 1 FROM listado_pids WHERE listado_id = ? AND pid_nombre = ? AND pid_hoja = ? AND pid_revision = ?').get(id, pidNombre, pidHoja, String(revMasNueva));
    if (yaAsignada) {
      return res.status(400).json({ error: 'La revisión Rev' + revMasNueva + ' ya está asignada a este listado. Quitá primero la revisión vieja o la nueva.' });
    }

    try {
      db.exec('BEGIN');

      // 1) listado_pids: cambiar la revisión
      const insNuevo = db.prepare('INSERT INTO listado_pids (listado_id, pid_nombre, pid_hoja, pid_revision) VALUES (?, ?, ?, ?)').run(id, pidNombre, pidHoja, String(revMasNueva));
      db.prepare('DELETE FROM listado_pids WHERE listado_id = ? AND pid_nombre = ? AND pid_hoja = ? AND pid_revision = ?').run(id, pidNombre, pidHoja, pidRevVieja);

      // 2) items: mover a la revisión nueva conservando x, y, tamaños y offsets
      const itemsMovidos = db.prepare('UPDATE items SET pid_revision = ? WHERE listado_id = ? AND pid_nombre = ? AND pid_hoja = ? AND pid_revision = ?').run(String(revMasNueva), id, pidNombre, pidHoja, pidRevVieja);

      // 3) lineas: mover a la revisión nueva conservando puntos
      const lineasMovidas = db.prepare('UPDATE lineas SET pid_revision = ? WHERE listado_id = ? AND pid_nombre = ? AND pid_hoja = ? AND pid_revision = ?').run(String(revMasNueva), id, pidNombre, pidHoja, pidRevVieja);

      // 4) leyenda de líneas: escalar su posición si cambió la resolución de la imagen
      const infoViejo = buscarPIDEnLista(listaPIDs, pidNombre, pidHoja, pidRevVieja);
      const infoNuevo = buscarPIDEnLista(listaPIDs, pidNombre, pidHoja, String(revMasNueva));

      let leyendaEscalada = null;
      const leyenda = db.prepare('SELECT x, y FROM leyendas_lineas WHERE listado_id = ? AND pid_nombre = ? AND pid_hoja = ?').get(id, pidNombre, pidHoja);

      if (leyenda && infoViejo && infoNuevo && infoViejo.calibracion && infoNuevo.calibracion) {
        const anchoViejo = infoViejo.calibracion.ancho, altoViejo = infoViejo.calibracion.alto;
        const anchoNuevo = infoNuevo.calibracion.ancho, altoNuevo = infoNuevo.calibracion.alto;
        if (anchoViejo > 0 && altoViejo > 0 && (anchoViejo !== anchoNuevo || altoViejo !== altoNuevo)) {
          const fx = anchoNuevo / anchoViejo;
          const fy = altoNuevo / altoViejo;
          const nuevaX = leyenda.x * fx;
          const nuevaY = leyenda.y * fy;
          db.prepare('UPDATE leyendas_lineas SET x = ?, y = ? WHERE listado_id = ? AND pid_nombre = ? AND pid_hoja = ?').run(nuevaX, nuevaY, id, pidNombre, pidHoja);
          leyendaEscalada = { fx: fx, fy: fy };
        }
      }

      tocarListado(db, id);
      db.exec('COMMIT');

      registrarEvento(db, usuario, 'actualizar_pid_listado', 'listado=' + id + ' pid=' + pidNombre + ' hoja=' + pidHoja + ' rev=' + pidRevVieja + '->' + revMasNueva);

      res.json({
        ok: true,
        pid: pidNombre,
        hoja: pidHoja,
        revisionAnterior: pidRevVieja,
        revisionNueva: String(revMasNueva),
        itemsMovidos: itemsMovidos.changes,
        lineasMovidas: lineasMovidas.changes,
        leyendaEscalada: leyendaEscalada
      });
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch (e2) {}
      console.error('Error en /actualizar:', e);
      res.status(500).json({ error: 'Error al actualizar el P&ID: ' + e.message });
    }
  });

  // ITEMS
  app.get('/api/listados/:id/items', function (req, res) {
    const db = getDB(), id = parseInt(req.params.id, 10);
    const listaPIDs = obtenerListaPIDsCacheada(req);

    const items = db.prepare('SELECT * FROM items WHERE listado_id = ? ORDER BY orden ASC, id ASC').all(id);
    const enriquecidos = enriquecerItemsConNumero(db, id, items);
    enriquecidos.forEach(it => {
      if (it.pid_nombre) it.hoja = hojaEnriquecidaDesdeLista(listaPIDs, it.pid_nombre, it.pid_hoja, it.pid_revision);
    });
    res.json({ items: enriquecidos });
  });

  app.get('/api/listados/:id/items/:pidNombre/:hoja/:rev', function (req, res) {
    const db = getDB(), listadoId = parseInt(req.params.id, 10);
    const pidNombre = decodeURIComponent(req.params.pidNombre);
    const pidHoja = normalizarHoja(decodeURIComponent(req.params.hoja)).texto;
    const pidRev = String(req.params.rev);

    const listado = db.prepare('SELECT id FROM listados WHERE id = ?').get(listadoId);
    if (!listado) return res.status(404).json({ error: 'Listado no encontrado.' });

    const items = db.prepare('SELECT * FROM items WHERE listado_id = ? AND pid_nombre = ? AND pid_hoja = ? AND pid_revision = ? ORDER BY orden ASC, id ASC').all(listadoId, pidNombre, pidHoja, pidRev);
    const enriquecidos = enriquecerItemsConNumero(db, listadoId, items);
    res.json({ items: enriquecidos });
  });

  app.post('/api/listados/:id/items', function (req, res) {
    const db = getDB(), usuario = req.contexto.usuario, u = asegurarUsuario(db, usuario), listadoId = parseInt(req.params.id, 10);
    const listado = db.prepare('SELECT * FROM listados WHERE id = ?').get(listadoId);
    if (!listado) return res.status(404).json({ error: 'Listado no encontrado.' });
    if (listado.usuario_id !== u.id && !req.contexto.admin) return res.status(403).json({ error: 'Sin permiso.' });
    const b = req.body || {};
    const maxOrden = db.prepare('SELECT COALESCE(MAX(orden), 0) AS m FROM items WHERE listado_id = ?').get(listadoId).m;
    const cfgMarc = req.contexto.config.Marcadores;
    const info = db.prepare('INSERT INTO items (listado_id, orden, tag, descripcion, diametro, cso_csc, estado, pid_nombre, pid_hoja, pid_revision, x, y, forma, tamano, tamano_y, etiqueta_offset_x, etiqueta_offset_y, ubicacion) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      listadoId, maxOrden + 1, String(b.tag || ''), normalizarDescripcion(b.descripcion), normalizarDiametro(b.diametro), normalizarCsoCsc(b.cso_csc), String(b.estado || 'otro'),
      b.pid_nombre || null, normalizarHoja(b.pid_hoja).texto, b.pid_revision ? String(b.pid_revision) : null,
      (b.x === 0 || b.x) ? parseFloat(b.x) : null, (b.y === 0 || b.y) ? parseFloat(b.y) : null,
      b.forma || cfgMarc.FormaPorDefecto, (b.tamano === 0 || b.tamano) ? parseInt(b.tamano, 10) : cfgMarc.TamanoPorDefecto,
      (b.tamano_y === 0 || b.tamano_y) ? parseInt(b.tamano_y, 10) : (b.tamano === 0 || b.tamano ? parseInt(b.tamano, 10) : cfgMarc.TamanoPorDefecto),
      (b.etiqueta_offset_x === 0 || b.etiqueta_offset_x) ? parseFloat(b.etiqueta_offset_x) : null,
      (b.etiqueta_offset_y === 0 || b.etiqueta_offset_y) ? parseFloat(b.etiqueta_offset_y) : null,
      b.ubicacion ? String(b.ubicacion) : null
    );
    tocarListado(db, listadoId);
    res.json(enriquecerItemsConNumero(db, listadoId, [db.prepare('SELECT * FROM items WHERE id = ?').get(Number(info.lastInsertRowid))])[0]);
  });

  app.put('/api/items/:id', function (req, res) {
    const db = getDB(), usuario = req.contexto.usuario, u = asegurarUsuario(db, usuario), itemId = parseInt(req.params.id, 10);
    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
    if (!item) return res.status(404).json({ error: 'Item no encontrado.' });
    const listado = db.prepare('SELECT * FROM listados WHERE id = ?').get(item.listado_id);
    if (!listado) return res.status(404).json({ error: 'Listado no encontrado.' });
    if (listado.usuario_id !== u.id && !req.contexto.admin) return res.status(403).json({ error: 'Sin permiso.' });
    const b = req.body || {};

    let updates = [];
    let values = [];
    if (b.tag !== undefined) { updates.push('tag = ?'); values.push(String(b.tag)); }
    if (b.descripcion !== undefined) { updates.push('descripcion = ?'); values.push(normalizarDescripcion(b.descripcion)); }
    if (b.diametro !== undefined) { updates.push('diametro = ?'); values.push(normalizarDiametro(b.diametro)); }
    if (b.cso_csc !== undefined) { updates.push('cso_csc = ?'); values.push(normalizarCsoCsc(b.cso_csc)); }
    if (b.estado !== undefined) { updates.push('estado = ?'); values.push(String(b.estado)); }
    if (b.x !== undefined) { updates.push('x = ?'); values.push(parseFloat(b.x)); }
    if (b.y !== undefined) { updates.push('y = ?'); values.push(parseFloat(b.y)); }
    if (b.forma !== undefined) { updates.push('forma = ?'); values.push(String(b.forma)); }
    if (b.tamano !== undefined) { updates.push('tamano = ?'); values.push(parseInt(b.tamano, 10)); }
    if (b.tamano_y !== undefined) { updates.push('tamano_y = ?'); values.push(parseInt(b.tamano_y, 10)); }
    if (b.etiqueta_offset_x !== undefined) { updates.push('etiqueta_offset_x = ?'); values.push(parseFloat(b.etiqueta_offset_x)); }
    if (b.etiqueta_offset_y !== undefined) { updates.push('etiqueta_offset_y = ?'); values.push(parseFloat(b.etiqueta_offset_y)); }
    if (b.ubicacion !== undefined) { updates.push('ubicacion = ?'); values.push(b.ubicacion ? String(b.ubicacion) : null); }

    if (updates.length > 0) {
      values.push(itemId);
      db.prepare('UPDATE items SET ' + updates.join(', ') + ' WHERE id = ?').run(...values);
    }

    tocarListado(db, item.listado_id);
    res.json(enriquecerItemsConNumero(db, item.listado_id, [db.prepare('SELECT * FROM items WHERE id = ?').get(itemId)])[0]);
  });

  app.delete('/api/items/:id', function (req, res) {
    const db = getDB(), usuario = req.contexto.usuario, u = asegurarUsuario(db, usuario), itemId = parseInt(req.params.id, 10);
    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
    if (!item) return res.status(404).json({ error: 'Item no encontrado.' });
    const listado = db.prepare('SELECT * FROM listados WHERE id = ?').get(item.listado_id);
    if (!listado) return res.status(404).json({ error: 'Listado no encontrado.' });
    if (listado.usuario_id !== u.id && !req.contexto.admin) return res.status(403).json({ error: 'Sin permiso.' });
    db.prepare('DELETE FROM items WHERE id = ?').run(itemId);
    renumerarItems(db, item.listado_id);
    tocarListado(db, item.listado_id);
    res.json({ ok: true });
  });

  app.post('/api/listados/:id/reordenar', function (req, res) {
    const db = getDB(), usuario = req.contexto.usuario, u = asegurarUsuario(db, usuario), listadoId = parseInt(req.params.id, 10), ids = (req.body && Array.isArray(req.body.ids)) ? req.body.ids : null;
    const listado = db.prepare('SELECT * FROM listados WHERE id = ?').get(listadoId);
    if (!listado) return res.status(404).json({ error: 'Listado no encontrado.' });
    if (listado.usuario_id !== u.id && !req.contexto.admin) return res.status(403).json({ error: 'Sin permiso.' });
    if (ids) { const update = db.prepare('UPDATE items SET orden = ? WHERE id = ?'); ids.forEach((id, i) => update.run(i + 1, id)); tocarListado(db, listadoId); }
    res.json({ ok: true });
  });

  // NOMBRES COLORES (por P&ID dentro de cada listado)
  app.get('/api/listados/:id/pids/:nombre/:hoja/nombres-colores', function (req, res) {
    const db = getDB(), listadoId = parseInt(req.params.id, 10);
    const pidNombre = decodeURIComponent(req.params.nombre);
    const pidHoja = normalizarHoja(decodeURIComponent(req.params.hoja)).texto;
    const listado = db.prepare('SELECT id FROM listados WHERE id = ?').get(listadoId);
    if (!listado) return res.status(404).json({ error: 'Listado no encontrado.' });
    const nombres = nombresColoresLinea(db, listadoId, pidNombre, pidHoja);
    res.json({ nombres: nombres, cantidadColores: CANT_COLORES_LINEA, coloresFijos: COLORES_LINEA_FIJOS });
  });

  app.put('/api/listados/:id/pids/:nombre/:hoja/nombres-colores/:indice', function (req, res) {
    const db = getDB(), listadoId = parseInt(req.params.id, 10);
    const usuario = req.contexto.usuario, u = asegurarUsuario(db, usuario);
    const listado = db.prepare('SELECT * FROM listados WHERE id = ?').get(listadoId);
    if (!listado) return res.status(404).json({ error: 'Listado no encontrado.' });
    if (listado.usuario_id !== u.id && !req.contexto.admin) return res.status(403).json({ error: 'Sin permiso.' });

    const pidNombre = decodeURIComponent(req.params.nombre);
    const pidHoja = normalizarHoja(decodeURIComponent(req.params.hoja)).texto;
    const indice = parseInt(req.params.indice, 10);
    const nombre = String((req.body && req.body.nombre) || '').trim();
    if (indice < COLORES_LINEA_FIJOS || indice >= CANT_COLORES_LINEA || !nombre) return res.status(400).json({ error: 'Datos inválidos.' });
    const asignado = db.prepare(
      'SELECT 1 FROM listado_pids WHERE listado_id = ? AND pid_nombre = ? AND pid_hoja = ?'
    ).get(listadoId, pidNombre, pidHoja);
    if (!asignado) return res.status(400).json({ error: 'P&ID no asignado al listado.' });
    db.prepare(
      'INSERT INTO nombres_colores_lineas_listado (listado_id, pid_nombre, pid_hoja, indice, nombre) ' +
      'VALUES (?, ?, ?, ?, ?) ' +
      'ON CONFLICT(listado_id, pid_nombre, pid_hoja, indice) DO UPDATE SET nombre = excluded.nombre'
    ).run(listadoId, pidNombre, pidHoja, indice, nombre);
    res.json({ ok: true });
  });

  // LINEAS
  app.get('/api/listados/:id/lineas/:pid/:hoja/:rev', function (req, res) {
    const db = getDB(); const listadoId = parseInt(req.params.id, 10); const pidNombre = decodeURIComponent(req.params.pid); const pidHoja = normalizarHoja(decodeURIComponent(req.params.hoja)).texto; const pidRev = String(req.params.rev);

    const filas = db.prepare('SELECT * FROM lineas WHERE listado_id = ? AND pid_nombre = ? AND pid_hoja = ? AND pid_revision = ? ORDER BY orden ASC, id ASC').all(listadoId, pidNombre, pidHoja, pidRev);
    const nombres = nombresColoresLinea(db, listadoId, pidNombre, pidHoja);

    res.json({ lineas: filas.map(f => ({ id: f.id, orden: f.orden, pid_nombre: f.pid_nombre, pid_hoja: f.pid_hoja, pid_revision: f.pid_revision, color_indice: f.color_indice, grosor: f.grosor, opacidad: f.opacidad, descripcion: f.descripcion || null, puntos: JSON.parse(f.puntos || '[]'), nombres_colores: nombres })) });
  });

  app.post('/api/listados/:id/lineas', function (req, res) {
    const db = getDB(); const usuario = req.contexto.usuario; const u = asegurarUsuario(db, usuario); const listadoId = parseInt(req.params.id, 10);
    const b = req.body || {};

    const listado = db.prepare('SELECT * FROM listados WHERE id = ?').get(listadoId);
    if (!listado) return res.status(404).json({ error: 'Listado no encontrado.' });
    if (listado.usuario_id !== u.id && !req.contexto.admin) return res.status(403).json({ error: 'Sin permiso.' });
    const pidNombre = b.pid_nombre ? String(b.pid_nombre) : '', pidHoja = normalizarHoja(b.pid_hoja).texto, pidRev = b.pid_revision ? String(b.pid_revision) : null;
    const colorIndice = normalizarColorLinea(b.color_indice), grosor = normalizarGrosorLinea(b.grosor), opacidad = normalizarOpacidadLinea(b.opacidad), puntos = normalizarPuntosLinea(b.puntos);
    if (!pidNombre || pidRev === null || colorIndice === null || grosor === null || opacidad === null || !puntos) return res.status(400).json({ error: 'Datos inválidos (revisar colores, puntos, etc).' });
    const asignado = db.prepare('SELECT 1 FROM listado_pids WHERE listado_id = ? AND pid_nombre = ? AND pid_hoja = ? AND pid_revision = ?').get(listadoId, pidNombre, pidHoja, pidRev);
    if (!asignado) { return res.status(400).json({ error: 'P&ID no asignado al listado.' }); }
    const maxOrden = db.prepare('SELECT COALESCE(MAX(orden), 0) AS m FROM lineas WHERE listado_id = ?').get(listadoId).m;
    const descripcion = normalizarDescripcion(b.descripcion);
    const info = db.prepare('INSERT INTO lineas (listado_id, orden, pid_nombre, pid_hoja, pid_revision, color_indice, grosor, opacidad, descripcion, puntos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(listadoId, maxOrden + 1, pidNombre, pidHoja, pidRev, colorIndice, grosor, opacidad, descripcion, JSON.stringify(puntos));

    tocarListado(db, listadoId);
    const fila = db.prepare('SELECT * FROM lineas WHERE id = ?').get(Number(info.lastInsertRowid));
    res.json({ id: fila.id, orden: fila.orden, pid_nombre: fila.pid_nombre, pid_hoja: fila.pid_hoja, pid_revision: fila.pid_revision, color_indice: fila.color_indice, grosor: fila.grosor, opacidad: fila.opacidad, descripcion: fila.descripcion || null, puntos: JSON.parse(fila.puntos) });
  });

  app.put('/api/lineas/:id', function (req, res) {
    const db = getDB(), usuario = req.contexto.usuario, u = asegurarUsuario(db, usuario), lineaId = parseInt(req.params.id, 10), b = req.body || {};
    const fila = db.prepare('SELECT * FROM lineas WHERE id = ?').get(lineaId);
    if (!fila) return res.status(404).json({ error: 'Línea no encontrada.' });
    const listado = db.prepare('SELECT * FROM listados WHERE id = ?').get(fila.listado_id);
    if (!listado) return res.status(404).json({ error: 'Listado no encontrado.' });
    if (listado.usuario_id !== u.id && !req.contexto.admin) return res.status(403).json({ error: 'Sin permiso.' });

    let sets = [], vals = [];
    if (b.color_indice !== undefined) { sets.push('color_indice = ?'); vals.push(parseInt(b.color_indice, 10)); }
    if (b.grosor !== undefined) { sets.push('grosor = ?'); vals.push(parseFloat(b.grosor)); }
    if (b.opacidad !== undefined) { sets.push('opacidad = ?'); vals.push(parseInt(b.opacidad, 10)); }
    if (b.descripcion !== undefined) { sets.push('descripcion = ?'); vals.push(normalizarDescripcion(b.descripcion)); }
    if (b.puntos !== undefined) {
      const pts = normalizarPuntosLinea(b.puntos);
      if (!pts) return res.status(400).json({ error: 'Puntos inválidos.' });
      sets.push('puntos = ?');
      vals.push(JSON.stringify(pts));
    }
    if (sets.length === 0) return res.json({ ok: true });
    vals.push(lineaId);
    db.prepare('UPDATE lineas SET ' + sets.join(', ') + ' WHERE id = ?').run(...vals);
    res.json({ ok: true });
  });

  app.delete('/api/lineas/:id', function (req, res) {
    const db = getDB(), usuario = req.contexto.usuario, u = asegurarUsuario(db, usuario);
    const lineaId = parseInt(req.params.id, 10);
    if (isNaN(lineaId)) return res.status(400).json({ error: 'ID inválido.' });

    const fila = db.prepare('SELECT * FROM lineas WHERE id = ?').get(lineaId);
    if (!fila) return res.status(404).json({ error: 'Línea no encontrada.' });

    const listado = db.prepare('SELECT * FROM listados WHERE id = ?').get(fila.listado_id);
    if (!listado) return res.status(404).json({ error: 'Listado no encontrado.' });
    if (listado.usuario_id !== u.id && !req.contexto.admin) {
      return res.status(403).json({ error: 'Sin permiso.' });
    }

    db.prepare('DELETE FROM lineas WHERE id = ?').run(lineaId);
    tocarListado(db, fila.listado_id);
    res.json({ ok: true });
  });

  // LEYENDA DE LÍNEAS
  app.get('/api/listados/:id/leyenda-lineas/:pid/:hoja', function (req, res) {
    const db = getDB(), listadoId = parseInt(req.params.id, 10);
    const pidNombre = decodeURIComponent(req.params.pid);
    const pidHoja = normalizarHoja(decodeURIComponent(req.params.hoja)).texto;

    const fila = db.prepare('SELECT x, y FROM leyendas_lineas WHERE listado_id = ? AND pid_nombre = ? AND pid_hoja = ?').get(listadoId, pidNombre, pidHoja);
    if (!fila) return res.json({ x: null, y: null });
    res.json({ x: fila.x, y: fila.y });
  });

  app.put('/api/listados/:id/leyenda-lineas/:pid/:hoja', function (req, res) {
    const db = getDB(), usuario = req.contexto.usuario, u = asegurarUsuario(db, usuario);
    const listadoId = parseInt(req.params.id, 10);
    const pidNombre = decodeURIComponent(req.params.pid);
    const pidHoja = normalizarHoja(decodeURIComponent(req.params.hoja)).texto;

    const listado = db.prepare('SELECT * FROM listados WHERE id = ?').get(listadoId);
    if (!listado) return res.status(404).json({ error: 'Listado no encontrado.' });
    if (listado.usuario_id !== u.id && !req.contexto.admin) return res.status(403).json({ error: 'Sin permiso.' });

    const b = req.body || {};
    const x = parseFloat(b.x), y = parseFloat(b.y);
    if (isNaN(x) || isNaN(y)) return res.status(400).json({ error: 'Coordenadas inválidas.' });

    db.prepare('INSERT INTO leyendas_lineas (listado_id, pid_nombre, pid_hoja, x, y) VALUES (?, ?, ?, ?, ?) ON CONFLICT(listado_id, pid_nombre, pid_hoja) DO UPDATE SET x = excluded.x, y = excluded.y').run(listadoId, pidNombre, pidHoja, x, y);
    res.json({ ok: true, x: x, y: y });
  });

  // HIPERVINCULOS (asociados al P&ID origen, sin depender de listados)
  app.get('/api/hipervinculos/:pid/:hoja/:rev', function (req, res) {
    try {
      const db = getDB();
      const pidNombre = decodeURIComponent(req.params.pid);
      const pidHoja = normalizarHoja(decodeURIComponent(req.params.hoja)).texto;
      const pidRev = String(req.params.rev);
      const filas = db.prepare('SELECT * FROM hipervinculos WHERE pid_nombre = ? AND pid_hoja = ? AND pid_revision = ? ORDER BY id ASC').all(pidNombre, pidHoja, pidRev);
      res.json({ hipervinculos: filas });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/hipervinculos', function (req, res) {
    try {
      if (!req.contexto.puedeGestionarPid) return res.status(403).json({ error: 'Requiere rol SuperUsuario o Admin.' });
      const db = getDB();
      const b = req.body || {};
      const pidNombre = String(b.pid_nombre || '').trim();
      const pidHoja = normalizarHoja(b.pid_hoja).texto;
      const pidRev = String(b.pid_revision || '').trim();
      const x = parseFloat(b.x), y = parseFloat(b.y), w = parseFloat(b.w), h = parseFloat(b.h);
      const dNombre = String(b.destino_pid_nombre || '').trim();
      const dHoja = normalizarHoja(b.destino_pid_hoja).texto;
      const dRev = String(b.destino_pid_revision || '').trim();
      if (!pidNombre || !pidRev || !dNombre || !dRev) return res.status(400).json({ error: 'Faltan datos del P&ID o del destino.' });
      if (!isFinite(x) || !isFinite(y) || !isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) return res.status(400).json({ error: 'Rectángulo inválido.' });
      const info = db.prepare('INSERT INTO hipervinculos (pid_nombre, pid_hoja, pid_revision, x, y, w, h, destino_pid_nombre, destino_pid_hoja, destino_pid_revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(pidNombre, pidHoja, pidRev, x, y, w, h, dNombre, dHoja, dRev);
      const fila = db.prepare('SELECT * FROM hipervinculos WHERE id = ?').get(Number(info.lastInsertRowid));
      res.json(fila);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/hipervinculos/:id', function (req, res) {
    try {
      if (!req.contexto.puedeGestionarPid) return res.status(403).json({ error: 'Requiere rol SuperUsuario o Admin.' });
      const db = getDB();
      const id = parseInt(req.params.id, 10);
      const fila = db.prepare('SELECT * FROM hipervinculos WHERE id = ?').get(id);
      if (!fila) return res.status(404).json({ error: 'Hipervínculo no encontrado.' });
      const b = req.body || {};
      let sets = [], vals = [];
      if (b.x !== undefined) { const v = parseFloat(b.x); if (!isFinite(v)) return res.status(400).json({ error: 'x inválido.' }); sets.push('x = ?'); vals.push(v); }
      if (b.y !== undefined) { const v = parseFloat(b.y); if (!isFinite(v)) return res.status(400).json({ error: 'y inválido.' }); sets.push('y = ?'); vals.push(v); }
      if (b.w !== undefined) { const v = parseFloat(b.w); if (!isFinite(v) || v <= 0) return res.status(400).json({ error: 'w inválido.' }); sets.push('w = ?'); vals.push(v); }
      if (b.h !== undefined) { const v = parseFloat(b.h); if (!isFinite(v) || v <= 0) return res.status(400).json({ error: 'h inválido.' }); sets.push('h = ?'); vals.push(v); }
      if (b.destino_pid_nombre !== undefined) { sets.push('destino_pid_nombre = ?'); vals.push(String(b.destino_pid_nombre).trim()); }
      if (b.destino_pid_hoja !== undefined) { sets.push('destino_pid_hoja = ?'); vals.push(normalizarHoja(b.destino_pid_hoja).texto); }
      if (b.destino_pid_revision !== undefined) { sets.push('destino_pid_revision = ?'); vals.push(String(b.destino_pid_revision).trim()); }
      if (sets.length === 0) return res.json({ ok: true });
      vals.push(id);
      db.prepare('UPDATE hipervinculos SET ' + sets.join(', ') + ' WHERE id = ?').run(...vals);
      const nueva = db.prepare('SELECT * FROM hipervinculos WHERE id = ?').get(id);
      res.json(nueva);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/hipervinculos/par', function (req, res) {
    try {
      if (!req.contexto.puedeGestionarPid) return res.status(403).json({ error: 'Requiere rol SuperUsuario o Admin.' });
      const db = getDB();
      const b = req.body || {};
      const o = b.origen || {}, dst = b.destino || {}, rec = b.receptor || {};
      const oNombre = String(o.pid_nombre || '').trim(), oRev = String(o.pid_revision || '').trim();
      const dNombre = String(dst.pid_nombre || '').trim(), dRev = String(dst.pid_revision || '').trim();
      const oHoja = normalizarHoja(o.pid_hoja).texto, dHoja = normalizarHoja(dst.pid_hoja).texto;
      const ox = parseFloat(o.x), oy = parseFloat(o.y), ow = parseFloat(o.w), oh = parseFloat(o.h);
      const rx = parseFloat(rec.x), ry = parseFloat(rec.y), rw = parseFloat(rec.w), rh = parseFloat(rec.h);
      if (!oNombre || !oRev || !dNombre || !dRev) return res.status(400).json({ error: 'Faltan datos del P&ID origen o destino.' });
      if (![ox, oy, ow, oh, rx, ry, rw, rh].every(isFinite) || ow <= 0 || oh <= 0 || rw <= 0 || rh <= 0) {
        return res.status(400).json({ error: 'Rectángulos inválidos.' });
      }
      db.exec('BEGIN');
      try {
        const infoA = db.prepare('INSERT INTO hipervinculos (pid_nombre, pid_hoja, pid_revision, x, y, w, h, destino_pid_nombre, destino_pid_hoja, destino_pid_revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(oNombre, oHoja, oRev, ox, oy, ow, oh, dNombre, dHoja, dRev);
        const idA = Number(infoA.lastInsertRowid);
        const infoB = db.prepare('INSERT INTO hipervinculos (pid_nombre, pid_hoja, pid_revision, x, y, w, h, destino_pid_nombre, destino_pid_hoja, destino_pid_revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(dNombre, dHoja, dRev, rx, ry, rw, rh, oNombre, oHoja, oRev);
        const idB = Number(infoB.lastInsertRowid);
        db.prepare('UPDATE hipervinculos SET par_id = ? WHERE id IN (?, ?)').run(idA, idA, idB);
        db.exec('COMMIT');
        const filaA = db.prepare('SELECT * FROM hipervinculos WHERE id = ?').get(idA);
        const filaB = db.prepare('SELECT * FROM hipervinculos WHERE id = ?').get(idB);
        res.json({ ok: true, origen: filaA, destino: filaB });
      } catch (e) {
        try { db.exec('ROLLBACK'); } catch (e2) {}
        throw e;
      }
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/hipervinculos/:id', function (req, res) {
    try {
      if (!req.contexto.puedeGestionarPid) return res.status(403).json({ error: 'Requiere rol SuperUsuario o Admin.' });
      const db = getDB();
      const id = parseInt(req.params.id, 10);
      const fila = db.prepare('SELECT * FROM hipervinculos WHERE id = ?').get(id);
      if (!fila) return res.status(404).json({ error: 'Hipervínculo no encontrado.' });
      // Si es parte de un par, borrar ambos lados (el link inverso también).
      if (fila.par_id) {
        db.prepare('DELETE FROM hipervinculos WHERE par_id = ?').run(fila.par_id);
      } else {
        db.prepare('DELETE FROM hipervinculos WHERE id = ?').run(id);
      }
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // PID general
  // Devuelve la lista de P&ID con el conteo de hipervínculos de cada uno
  // (columna 'Hipervínculos' de la tabla global).
  app.get('/api/pid', function (req, res) {
    try {
      const lista = pid.escanearPIDsCacheado(req.contexto.config.Rutas.CarpetaImagenes);

      // Conteo de hipervínculos por P&ID de origen (nombre + hoja + rev).
      // Se hace en UNA sola consulta agrupada y despues se asigna en memoria:
      // recorrer la lista y consultar por cada fila seria N+1 consultas.
      const conteo = {};
      try {
        const db = getDB();
        const filas = db.prepare(
          'SELECT pid_nombre, pid_hoja, pid_revision, COUNT(*) AS n ' +
          'FROM hipervinculos GROUP BY pid_nombre, pid_hoja, pid_revision'
        ).all();
        filas.forEach(function (f) {
          conteo[f.pid_nombre + '|' + f.pid_hoja + '|' + String(f.pid_revision)] = f.n;
        });
      } catch (e) {
        // Si falla el conteo, la tabla se muestra igual (todos en 0).
      }

      const conConteo = lista.map(function (p) {
        return Object.assign({}, p, {
          hipervinculos: conteo[p.pid + '|' + p.hojaTexto + '|' + String(p.revision)] || 0
        });
      });

      res.json({ pids: conConteo });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.get('/api/pid/:nombre/:hoja/:rev', function (req, res) {
    try {
      const encontrado = pid.buscarPID(req.contexto.config.Rutas.CarpetaImagenes, decodeURIComponent(req.params.nombre), decodeURIComponent(req.params.hoja), String(req.params.rev));
      if (!encontrado) return res.status(404).json({ error: 'P&ID no encontrado.' }); res.json(encontrado);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/pid/:nombre/:hoja/:rev/imagen', function (req, res) {
    try {
      const carpeta = req.contexto.config.Rutas.CarpetaImagenes;
      const encontrado = pid.buscarPID(carpeta, decodeURIComponent(req.params.nombre), decodeURIComponent(req.params.hoja), String(req.params.rev));
      if (!encontrado) return res.status(404).json({ error: 'P&ID no encontrado.' });
      const rutaImagen = path.join(carpeta, encontrado.archivo);
      if (!fs.existsSync(rutaImagen)) return res.status(404).json({ error: 'Imagen no encontrada.' });
      res.sendFile(rutaImagen);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.put('/api/pid/:nombre/:hoja/:rev/calibracion', function (req, res) {
    if (!req.contexto.puedeGestionarPid) return res.status(403).json({ error: 'Requiere rol SuperUsuario o Admin.' });
    try {
      const carpeta = req.contexto.config.Rutas.CarpetaImagenes;
      const encontrado = pid.buscarPID(carpeta, decodeURIComponent(req.params.nombre), decodeURIComponent(req.params.hoja), String(req.params.rev));
      if (!encontrado) return res.status(404).json({ error: 'P&ID no encontrado.' });
      const b = req.body || {}, ancho = parseInt(b.ancho, 10), alto = parseInt(b.alto, 10);
      if (!ancho || !alto) return res.status(400).json({ error: 'Faltan dimensiones.' });
      const datos = { archivo: encontrado.archivo, pid: decodeURIComponent(req.params.nombre), hoja: encontrado.hojaTexto, revision: String(req.params.rev), ancho: ancho, alto: alto, punto00: { x: parseFloat(b.punto00.x), y: parseFloat(b.punto00.y) }, punto100: { x: parseFloat(b.punto100.x), y: parseFloat(b.punto100.y) }, calibrado_por: req.contexto.usuario, calibrado_en: new Date().toISOString() };
      const error = pid.validarCalibracion(datos, ancho, alto); if (error) return res.status(400).json({ error: error });
      pid.guardarCalibracion(carpeta, encontrado.archivo, datos);
      res.json({ ok: true, calibracion: datos });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.delete('/api/pid/:nombre/:hoja/:rev/calibracion', function (req, res) {
    if (!req.contexto.puedeGestionarPid) return res.status(403).json({ error: 'Requiere rol SuperUsuario o Admin.' });
    try {
      const carpeta = req.contexto.config.Rutas.CarpetaImagenes;
      const encontrado = pid.buscarPID(carpeta, decodeURIComponent(req.params.nombre), decodeURIComponent(req.params.hoja), String(req.params.rev));
      if (!encontrado) return res.status(404).json({ error: 'P&ID no encontrado.' });
      pid.borrarCalibracion(carpeta, encontrado.archivo);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  // ----------------------------------------------------------------
  // CARGAR NUEVO P&ID (PNG individual o PDF multipágina -> PNG 300dpi)
  // ----------------------------------------------------------------
  // Body:
  //   {
  //     tipo: 'pdf' | 'png',
  //     nombre: 'FA00014-...',        // nombre del P&ID
  //     paginaInicial: 1,             // número de página de la 1ra imagen
  //     totalPaginas: 3,              // total de páginas del P&ID
  //     revision: '1',                // letra o número
  //     pdfBase64: '...',             // si tipo=pdf
  //     pngsBase64: ['...','...'],    // si tipo=png (uno o varios)
  //     reemplazar: false             // si true, sobreescribe existentes
  //   }
  app.post('/api/pids/cargar', async function (req, res) {
    if (!req.contexto.puedeGestionarPid) return res.status(403).json({ error: 'Requiere rol SuperUsuario o Admin.' });
    try {
      const b = req.body || {};
      const tipo = String(b.tipo || '').toLowerCase();
      const nombre = String(b.nombre || '').trim().toUpperCase();
      const revision = String(b.revision !== undefined && b.revision !== null ? b.revision : '').trim().toUpperCase();
      let paginaInicial = parseInt(b.paginaInicial, 10);
      const totalPaginas = parseInt(b.totalPaginas, 10);

      if (!nombre) return res.status(400).json({ error: 'Falta el nombre del P&ID.' });
      if (!/^[A-Za-z]|\d$/.test(revision) || revision.length > 3) return res.status(400).json({ error: 'Revisión inválida.' });
      if (isNaN(totalPaginas) || totalPaginas < 1) return res.status(400).json({ error: 'Total de páginas inválido.' });
      if (isNaN(paginaInicial) || paginaInicial < 1) paginaInicial = 1;
      // Única condición: la página inicial no puede superar el total de hojas.
      if (paginaInicial > totalPaginas) {
        return res.status(400).json({ error: 'La página (' + paginaInicial + ') no puede superar el total de hojas (' + totalPaginas + ').' });
      }

      // Sanitizar el nombre para usarlo como base de archivo.
      const nombreSeguro = nombre.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
      if (!nombreSeguro) return res.status(400).json({ error: 'Nombre inválido.' });

      // Recolectar las imágenes a guardar: array de {pagina, png:Buffer}
      let imagenes = [];

      if (tipo === 'pdf') {
        if (typeof b.pdfBase64 !== 'string' || b.pdfBase64.length === 0) {
          return res.status(400).json({ error: 'Falta el PDF.' });
        }
        const pdfBuf = Buffer.from(b.pdfBase64, 'base64');
        if (pdfBuf.length === 0) return res.status(400).json({ error: 'PDF vacío o inválido.' });

        let pngs;
        try {
          pngs = await pdfarender.pdfAPngs(pdfBuf);
        } catch (e) {
          return res.status(400).json({ error: 'No se pudo leer el PDF: ' + e.message });
        }
        // El total de hojas del P&ID es independiente de la cantidad de páginas
        // del PDF. Las páginas del PDF se numeran a partir de paginaInicial.
        if (paginaInicial + pngs.length - 1 > totalPaginas) {
          return res.status(400).json({
            error: 'El PDF tiene ' + pngs.length + ' página(s) y empezando en la hoja ' +
              paginaInicial + ' excede el total de hojas (' + totalPaginas + ').'
          });
        }
        imagenes = pngs.map(function (p, i) { return { pagina: paginaInicial + i, png: p.png }; });
      } else if (tipo === 'png') {
        const lista = Array.isArray(b.pngsBase64) ? b.pngsBase64 : [];
        if (lista.length === 0) return res.status(400).json({ error: 'No se recibieron imágenes PNG.' });
        if (paginaInicial + lista.length - 1 > totalPaginas) {
          return res.status(400).json({
            error: 'Se recibieron ' + lista.length + ' imagen(es) y empezando en la hoja ' +
              paginaInicial + ' excede el total de hojas (' + totalPaginas + ').'
          });
        }
        for (let i = 0; i < lista.length; i++) {
          const buf = Buffer.from(String(lista[i] || ''), 'base64');
          if (buf.length === 0) return res.status(400).json({ error: 'Imagen ' + (i + 1) + ' vacía.' });
          imagenes.push({ pagina: paginaInicial + i, png: buf });
        }
      } else {
        return res.status(400).json({ error: 'Tipo inválido (usar pdf o png).' });
      }

      const carpeta = req.contexto.config.Rutas.CarpetaImagenes;
      if (!fs.existsSync(carpeta)) fs.mkdirSync(carpeta, { recursive: true });

      const reemplazar = !!b.reemplazar;
      const guardados = [];
      const conflictos = [];

      for (let i = 0; i < imagenes.length; i++) {
        const img = imagenes[i];
        const hojaTexto = img.pagina + 'de' + totalPaginas;
        const nombreArchivo = nombreSeguro + '_' + hojaTexto + '_Rev' + revision + '.png';
        const rutaDestino = path.join(carpeta, nombreArchivo);

        if (fs.existsSync(rutaDestino) && !reemplazar) {
          conflictos.push(nombreArchivo);
          continue;
        }

        // Si se reemplaza, respaldar el anterior en _papelera.
        if (fs.existsSync(rutaDestino) && reemplazar) {
          const carpetaPapelera = path.join(carpeta, '_papelera');
          if (!fs.existsSync(carpetaPapelera)) fs.mkdirSync(carpetaPapelera, { recursive: true });
          const ts = new Date().toISOString().replace(/[:.]/g, '-');
          try { fs.copyFileSync(rutaDestino, path.join(carpetaPapelera, nombreArchivo + '.' + ts + '.bak')); } catch (e) {}
        }

        fs.writeFileSync(rutaDestino, img.png);
        guardados.push({ archivo: nombreArchivo, hojaTexto: hojaTexto, pagina: img.pagina });
      }

      if (conflictos.length > 0 && guardados.length === 0) {
        return res.status(409).json({
          error: 'Ya existen estos archivos: ' + conflictos.join(', ') + '. Marcá "reemplazar" si querés sobrescribirlos.',
          conflictos: conflictos
        });
      }

      registrarEvento(getDB(), req.contexto.usuario, 'cargar_pid', 'nombre=' + nombreSeguro + ' rev=' + revision + ' paginas=' + guardados.length + (conflictos.length ? ' conflictos=' + conflictos.length : ''));

      // Si se guardo al menos un archivo, invalidar el cache de escaneo
      // para que el P&ID nuevo aparezca al instante (sin esperar el TTL).
      if (guardados.length > 0) pid.invalidarCachePIDs();

      res.json({
        ok: true,
        guardados: guardados,
        conflictos: conflictos,
        pid: nombreSeguro,
        totalPaginas: totalPaginas,
        revision: revision
      });
    } catch (e) {
      console.error('Error en /api/pids/cargar:', e);
      res.status(500).json({ error: 'Error al cargar P&ID: ' + e.message });
    }
  });

  // ----------------------------------------------------------------
  // MODIFICAR DATOS DE UN P&ID (nombre / hoja / revisión)
  // ----------------------------------------------------------------
  // Renombra el PNG (y su JSON de calibración) y actualiza las
  // referencias en la BD (listado_pids, items, lineas, etc.).
  app.post('/api/pid/:nombre/:hoja/:rev/modificar', function (req, res) {
    if (!req.contexto.puedeGestionarPid) return res.status(403).json({ error: 'Requiere rol SuperUsuario o Admin.' });
    try {
      const carpeta = req.contexto.config.Rutas.CarpetaImagenes;
      const nombreViejo = decodeURIComponent(req.params.nombre);
      const hojaVieja = decodeURIComponent(req.params.hoja);
      const revVieja = String(req.params.rev);

      const encontrado = pid.buscarPID(carpeta, nombreViejo, hojaVieja, revVieja);
      if (!encontrado) return res.status(404).json({ error: 'P&ID no encontrado.' });

      const b = req.body || {};
      const nombreNuevo = String(b.nombre || '').trim().toUpperCase();
      const hojaNuevaRaw = String(b.hoja || '').trim();
      const revNueva = String(b.revision !== undefined && b.revision !== null ? b.revision : '').trim().toUpperCase();

      if (!nombreNuevo) return res.status(400).json({ error: 'Falta el nombre del P&ID.' });
      if (!revNueva || revNueva.length > 3) return res.status(400).json({ error: 'Revisión inválida.' });

      // parsearHojaEstricta devuelve null si el texto no es una hoja valida.
      // (parsearHoja devuelve {1,1} como fallback y haria guardar 1de1 en
      // silencio cuando el frontend manda algo que no matchea.)
      const hojaNueva = pid.parsearHojaEstricta(hojaNuevaRaw);
      if (!hojaNueva) return res.status(400).json({ error: 'Hoja inválida. Usá formato N/M (ej: 1/3).' });
      const totalNuevo = hojaNueva.total;
      const paginaNueva = hojaNueva.actual;

      const nombreSeguro = nombreNuevo.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
      if (!nombreSeguro) return res.status(400).json({ error: 'Nombre inválido.' });

      const hojaTextoNueva = paginaNueva + 'de' + totalNuevo;
      const archivoNuevo = nombreSeguro + '_' + hojaTextoNueva + '_Rev' + revNueva + '.png';
      const rutaVieja = path.join(carpeta, encontrado.archivo);
      const rutaNueva = path.join(carpeta, archivoNuevo);

      const mismaRuta = path.resolve(rutaVieja).toLowerCase() === path.resolve(rutaNueva).toLowerCase();
      if (!mismaRuta && fs.existsSync(rutaNueva)) {
        return res.status(409).json({
          error: 'Ya existe un P&ID con ese nombre, hoja y revisión: ' + archivoNuevo
        });
      }

      // Renombrar la imagen y su JSON de calibración (si existe).
      if (!mismaRuta) {
        fs.renameSync(rutaVieja, rutaNueva);

        const jsonViejo = pid.rutaJSONCalibracion(carpeta, encontrado.archivo);
        if (fs.existsSync(jsonViejo)) {
          const jsonNuevo = pid.rutaJSONCalibracion(carpeta, archivoNuevo);
          try {
            const datos = JSON.parse(fs.readFileSync(jsonViejo, 'utf8'));
            datos.archivo = archivoNuevo;
            datos.pid = nombreSeguro;
            datos.hoja = hojaTextoNueva;
            datos.revision = revNueva;
            fs.writeFileSync(jsonNuevo, JSON.stringify(datos, null, 2), 'utf8');
            fs.unlinkSync(jsonViejo);
          } catch (e) {
            // Si falla el JSON, al menos movemos el archivo tal cual.
            try { fs.renameSync(jsonViejo, jsonNuevo); } catch (e2) {}
          }
        }
      }

      // Actualizar referencias en la BD.
      const db = getDB();
      const hojaViejaNorm = encontrado.hojaTexto;
      let referenciasActualizadas = 0;

      const tablas = [
        { tabla: 'listado_pids', campoHoja: 'pid_hoja' },
        { tabla: 'items', campoHoja: 'pid_hoja' },
        { tabla: 'lineas', campoHoja: 'pid_hoja' },
        { tabla: 'leyendas_lineas', campoHoja: 'pid_hoja' }
      ];

      for (let i = 0; i < tablas.length; i++) {
        const t = tablas[i];
        try {
          const info = db.prepare(
            'UPDATE ' + t.tabla + ' SET pid_nombre = ?, ' + t.campoHoja + ' = ?, pid_revision = ? ' +
            'WHERE pid_nombre = ? AND ' + t.campoHoja + ' = ? AND pid_revision = ?'
          ).run(nombreSeguro, hojaTextoNueva, revNueva, nombreViejo, hojaViejaNorm, revVieja);
          referenciasActualizadas += (info && info.changes) ? info.changes : 0;
        } catch (e) {
          // Si la tabla no existe o el UPDATE falla, seguimos.
        }
      }
      const nombresAnteriores = db.prepare(
        'SELECT listado_id, indice, nombre FROM nombres_colores_lineas_listado ' +
        'WHERE pid_nombre = ? AND pid_hoja = ?'
      ).all(nombreViejo, hojaViejaNorm);
      const upsertNombre = db.prepare(
        'INSERT OR IGNORE INTO nombres_colores_lineas_listado ' +
        '(listado_id, pid_nombre, pid_hoja, indice, nombre) VALUES (?, ?, ?, ?, ?)'
      );
      nombresAnteriores.forEach(function (nc) {
        upsertNombre.run(nc.listado_id, nombreSeguro, hojaTextoNueva, nc.indice, nc.nombre);
      });
      if (nombresAnteriores.length) {
        db.prepare(
          'DELETE FROM nombres_colores_lineas_listado WHERE pid_nombre = ? AND pid_hoja = ?'
        ).run(nombreViejo, hojaViejaNorm);
        referenciasActualizadas += nombresAnteriores.length;
      }

      // El archivo cambio de nombre (y quizas de hoja/revision): invalidar
      // el cache para que las tablas muestren los datos nuevos al instante.
      pid.invalidarCachePIDs();

      registrarEvento(db, req.contexto.usuario, 'modificar_pid',
        'de=' + nombreViejo + ' ' + hojaViejaNorm + ' Rev' + revVieja +
        ' a=' + nombreSeguro + ' ' + hojaTextoNueva + ' Rev' + revNueva);

      res.json({
        ok: true,
        archivoAnterior: encontrado.archivo,
        archivo: archivoNuevo,
        pid: nombreSeguro,
        hojaTexto: hojaTextoNueva,
        revision: revNueva,
        referenciasActualizadas: referenciasActualizadas
      });
    } catch (e) {
      console.error('Error en /api/pid/.../modificar:', e);
      res.status(500).json({ error: 'Error al modificar el P&ID: ' + e.message });
    }
  });

  // ----------------------------------------------------------------
  // LISTADOS A LOS QUE ESTA ASIGNADO UN P&ID
  // ----------------------------------------------------------------
  // Devuelve los listados donde esta asignado exactamente ese P&ID
  // (nombre + hoja + revision), con la cantidad de marcaciones (items)
  // de ese P&ID en cada listado. Sirve para avisar antes de borrarlo.
  app.get('/api/pid/:nombre/:hoja/:rev/listados', function (req, res) {
    if (!req.contexto.puedeGestionarPid) return res.status(403).json({ error: 'Requiere rol SuperUsuario o Admin.' });
    try {
      const nombre = decodeURIComponent(req.params.nombre);
      const hoja = decodeURIComponent(req.params.hoja);
      const rev = String(req.params.rev);
      const db = getDB();

      // La hoja puede venir como '1de1' o '1/1': normalizamos al texto guardado.
      const hojaTexto = normalizarHoja(hoja).texto;

      const filas = db.prepare(
        'SELECT l.id, l.nombre, l.usuario_id, u.nombre_windows AS usuario, ' +
        '(SELECT COUNT(*) FROM items i WHERE i.listado_id = l.id ' +
        '  AND i.pid_nombre = lp.pid_nombre AND i.pid_hoja = lp.pid_hoja AND i.pid_revision = lp.pid_revision) AS cantidad_items ' +
        'FROM listado_pids lp ' +
        'JOIN listados l ON l.id = lp.listado_id ' +
        'JOIN usuarios u ON u.id = l.usuario_id ' +
        'WHERE lp.pid_nombre = ? AND lp.pid_hoja = ? AND lp.pid_revision = ? ' +
        'ORDER BY l.nombre COLLATE NOCASE ASC'
      ).all(nombre, hojaTexto, rev);

      // Hipervinculos del P&ID: los que SALEN de el (origen) y los que
      // APUNTAN a el (destino). Se borran junto con el P&ID.
      let hiperSalientes = 0;
      let hiperEntrantes = 0;
      try {
        hiperSalientes = db.prepare(
          'SELECT COUNT(*) AS n FROM hipervinculos ' +
          'WHERE pid_nombre = ? AND pid_hoja = ? AND pid_revision = ?'
        ).get(nombre, hojaTexto, rev).n;
        hiperEntrantes = db.prepare(
          'SELECT COUNT(*) AS n FROM hipervinculos ' +
          'WHERE destino_pid_nombre = ? AND destino_pid_hoja = ? AND destino_pid_revision = ?'
        ).get(nombre, hojaTexto, rev).n;
      } catch (e) {
        // Si la tabla no existe todavia (base vieja), no rompemos el endpoint.
        hiperSalientes = 0;
        hiperEntrantes = 0;
      }

      res.json({
        ok: true,
        listados: filas.map(function (f) {
          return { id: f.id, nombre: f.nombre, usuario: f.usuario, cantidad_items: f.cantidad_items };
        }),
        hipervinculos: {
          salientes: hiperSalientes,
          entrantes: hiperEntrantes,
          total: hiperSalientes + hiperEntrantes
        }
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ----------------------------------------------------------------
  // BORRAR UN P&ID (mueve imagen + JSON a _papelera y limpia referencias)
  // ----------------------------------------------------------------
  app.delete('/api/pid/:nombre/:hoja/:rev', function (req, res) {
    if (!req.contexto.puedeGestionarPid) return res.status(403).json({ error: 'Requiere rol SuperUsuario o Admin.' });
    try {
      const carpeta = req.contexto.config.Rutas.CarpetaImagenes;
      const nombre = decodeURIComponent(req.params.nombre);
      const hoja = decodeURIComponent(req.params.hoja);
      const rev = String(req.params.rev);

      const encontrado = pid.buscarPID(carpeta, nombre, hoja, rev);
      if (!encontrado) return res.status(404).json({ error: 'P&ID no encontrado.' });

      const db = getDB();
      const hojaTexto = encontrado.hojaTexto;

      // BLOQUEO: no se puede borrar un P&ID que esté asignado a algún listado.
      // Primero hay que quitarlo de todos los listados.
      const asignados = db.prepare(
        'SELECT l.id, l.nombre, u.nombre_windows AS usuario ' +
        'FROM listado_pids lp ' +
        'JOIN listados l ON l.id = lp.listado_id ' +
        'JOIN usuarios u ON u.id = l.usuario_id ' +
        'WHERE lp.pid_nombre = ? AND lp.pid_hoja = ? AND lp.pid_revision = ? ' +
        'ORDER BY l.nombre COLLATE NOCASE ASC'
      ).all(nombre, hojaTexto, rev);

      if (asignados.length > 0) {
        return res.status(409).json({
          error: 'No se puede borrar: el P&ID está asignado a ' +
            (asignados.length === 1 ? 'un listado' : asignados.length + ' listados') +
            '. Quitalo de ' + (asignados.length === 1 ? 'ese listado' : 'esos listados') + ' antes de borrarlo.',
          listados: asignados.map(function (a) {
            return { id: a.id, nombre: a.nombre, usuario: a.usuario };
          })
        });
      }

      // Mover PNG y JSON a _papelera (no se borran fisicamente).
      const carpetaPapelera = path.join(carpeta, '_papelera');
      if (!fs.existsSync(carpetaPapelera)) fs.mkdirSync(carpetaPapelera, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-');

      const rutaPng = path.join(carpeta, encontrado.archivo);
      if (fs.existsSync(rutaPng)) {
        try { fs.renameSync(rutaPng, path.join(carpetaPapelera, encontrado.archivo + '.' + ts + '.bak')); } catch (e) {}
      }
      const rutaJson = pid.rutaJSONCalibracion(carpeta, encontrado.archivo);
      if (fs.existsSync(rutaJson)) {
        try { fs.renameSync(rutaJson, path.join(carpetaPapelera, path.basename(rutaJson) + '.' + ts + '.bak')); } catch (e) {}
      }

      // Quitar referencias en la BD.
      db.prepare('DELETE FROM items WHERE pid_nombre = ? AND pid_hoja = ? AND pid_revision = ?').run(nombre, hojaTexto, rev);
      db.prepare('DELETE FROM lineas WHERE pid_nombre = ? AND pid_hoja = ? AND pid_revision = ?').run(nombre, hojaTexto, rev);
      db.prepare('DELETE FROM listado_pids WHERE pid_nombre = ? AND pid_hoja = ? AND pid_revision = ?').run(nombre, hojaTexto, rev);
      db.prepare('DELETE FROM nombres_colores_lineas_listado WHERE pid_nombre = ? AND pid_hoja = ?').run(nombre, hojaTexto);
      // La leyenda de líneas es por (listado, pid, hoja): al borrar el P&ID no debe quedar huérfana.
      try { db.prepare('DELETE FROM leyendas_lineas WHERE pid_nombre = ? AND pid_hoja = ?').run(nombre, hojaTexto); } catch (e) {}
      // Hipervinculos: se borran los que SALEN de este P&ID y los que APUNTAN
      // a el. Si no, quedan filas huerfanas y links rotos en otros P&ID.
      try { db.prepare('DELETE FROM hipervinculos WHERE pid_nombre = ? AND pid_hoja = ? AND pid_revision = ?').run(nombre, hojaTexto, rev); } catch (e) {}
      try { db.prepare('DELETE FROM hipervinculos WHERE destino_pid_nombre = ? AND destino_pid_hoja = ? AND destino_pid_revision = ?').run(nombre, hojaTexto, rev); } catch (e) {}

      // El archivo se movio a _papelera: invalidar el cache de escaneo.
      pid.invalidarCachePIDs();

      registrarEvento(db, req.contexto.usuario, 'borrar_pid', 'pid=' + nombre + ' hoja=' + hojaTexto + ' rev=' + rev);
      res.json({ ok: true, archivo: encontrado.archivo });
    } catch (e) {
      console.error('Error en DELETE /api/pid:', e);
      res.status(500).json({ error: 'Error al borrar el P&ID: ' + e.message });
    }
  });

  app.get('/api/ping', function (req, res) { res.json({ ok: true }); });

  // ----------------------------------------------------------------
  // EXPORTAR PDF (server-side con pdfkit)
  // ----------------------------------------------------------------
  // Body:
  //   {
  //     paginas: [{ pid, hoja, rev, pngBase64, anchoImg, altoImg }],
  //     titulo?: string,
  //     portada?: boolean,
  //     incluirListado?: boolean,
  //     itemsListado?: [{ numero, tag, diametro, descripcion, estado,
  //                       cso_csc, pid_nombre, pid_hoja, pid_revision,
  //                       ubicacion }],
  //     nombreListado?: string,
  //     usuario?: string
  //   }
  // Respuesta: application/pdf
  // Página A3 horizontal: 841.89 x 595.28 pt. Margen 20pt.
  app.post('/api/exportar/pdf', function (req, res) {
    try {
      const b = req.body || {};
      const paginas = Array.isArray(b.paginas) ? b.paginas : [];
      const incluirListado = !!b.incluirListado;
      const itemsListado = Array.isArray(b.itemsListado) ? b.itemsListado : [];
      const conPortada = !!b.portada;

      // Validar que haya al menos una sección para exportar
      if (paginas.length === 0 && !conPortada && !incluirListado) {
        return res.status(400).json({ error: 'No hay secciones para exportar (portada, P&IDs o listado).' });
      }
      if (incluirListado && itemsListado.length === 0) {
        return res.status(400).json({ error: 'Se pidió incluir el listado pero no hay marcaciones.' });
      }

      // Validar payload mínimo de páginas
      for (let i = 0; i < paginas.length; i++) {
        const p = paginas[i];
        if (!p || typeof p.pngBase64 !== 'string' || p.pngBase64.length === 0) {
          return res.status(400).json({ error: 'Página ' + (i + 1) + ' sin imagen.' });
        }
      }

      const titulo = (typeof b.titulo === 'string' && b.titulo.trim() !== '') ? b.titulo.trim() : 'P&ID exportado';
      const nombreListado = (typeof b.nombreListado === 'string' && b.nombreListado.trim() !== '') ? b.nombreListado.trim() : titulo;
      const hojaListado = (typeof b.hojaListado === 'string' && b.hojaListado.trim() !== '') ? b.hojaListado.trim() : '';

      console.log('[exportar/pdf] paginas=' + paginas.length + ' portada=' + conPortada + ' incluirListado=' + incluirListado + ' items=' + itemsListado.length);

      const doc = new PDFDocument({
        size: 'A3',
        layout: 'landscape',
        margin: 20,
        bufferPages: true,
        info: {
          Title: titulo,
          Author: req.contexto.usuario || 'P&ID Mark',
          Creator: 'P&ID Mark',
          CreationDate: new Date()
        }
      });

      const nombreArchivo = 'export_' + Date.now() + '.pdf';
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="' + nombreArchivo + '"');

      doc.pipe(res);

      const PAGE_W = doc.page.width;
      const PAGE_H = doc.page.height;
      const MARGEN = 20;
      const AREA_W = PAGE_W - MARGEN * 2;
      const AREA_H = PAGE_H - MARGEN * 2;
      // La portada usa un margen propio de 2.5 cm en todo el contorno.
      // 1 cm = 28.3465 pt (72 pt = 1 pulgada = 2.54 cm).
      const MARGEN_PORTADA = 2.5 * 28.3465;
      const AREA_PORTADA_W = PAGE_W - MARGEN_PORTADA * 2;

      // --- Logos (PNG generados una vez desde los SVG) ---
      // Se leen del disco. Si faltan, se omite el logo sin romper la exportación.
      const path = require('path');
      const fs = require('fs');
      const IMG_DIR = path.join(__dirname, '..', 'public', 'img');
      let bufTecpetrol = null;
      let bufSimbolo = null;
      try { bufTecpetrol = fs.readFileSync(path.join(IMG_DIR, 'tecpetrol.png')); } catch (e) {}
      // Logo completo (icono + 'P&ID Mark'), generado desde
      // datos/imagenes/'logo P&ID.svg'. Si falta, cae al icono viejo.
      try { bufSimbolo = fs.readFileSync(path.join(IMG_DIR, 'logo-pid-mark.png')); } catch (e) {}
      if (!bufSimbolo) { try { bufSimbolo = fs.readFileSync(path.join(IMG_DIR, 'logo-simbolo.png')); } catch (e) {} }

      // Dibuja la fila de logos arriba de la portada.
      // - Centro: icono del programa + texto 'P&ID Mark'.
      // - Derecha: logo de Tecpetrol.
      // Devuelve la Y debajo de los logos.
      function dibujarLogosPortada(margen) {
        const MARGEN_P = (typeof margen === 'number') ? margen : MARGEN;
        // Icono del programa 50% mas grande (54 -> 81).
        const ALTO_ICONO = 81;
        // Tecpetrol el doble de grande (54 -> 108).
        const ALTO_TEC = 108;
        const Y_TOP = MARGEN_P;

        // P&ID Mark a la IZQUIERDA (espejo de Tecpetrol), misma altura.
        // Ratio real del PNG generado: 1268/600 = 2.1133.
        if (bufSimbolo) {
          const ratioLogo = 1268 / 600;
          const anchoLogo = ALTO_TEC * ratioLogo;
          doc.image(bufSimbolo, MARGEN_P, Y_TOP, { height: ALTO_TEC });
        }

        // Tecpetrol a la DERECHA, misma altura y mismo borde superior.
        if (bufTecpetrol) {
          const ratioTec = 704 / 398; // ancho/alto del PNG
          const anchoTec = ALTO_TEC * ratioTec;
          doc.image(bufTecpetrol, PAGE_W - MARGEN_P - anchoTec, Y_TOP, { height: ALTO_TEC });
        }

        return Y_TOP + Math.max(ALTO_ICONO, ALTO_TEC) + 20;
      }

      // Bandera para saber si ya se dibujó algo en la página actual.
      // pdfkit crea una página inicial vacía automáticamente; la usamos
      // para la primera sección y agregamos páginas nuevas para el resto.
      let hayContenidoEnPagina = false;

      function asegurarPaginaNuevaSiHaceFalta() {
        if (hayContenidoEnPagina) {
          doc.addPage();
          hayContenidoEnPagina = false;
        }
      }

      // --- PORTADA (opcional) ---
      if (conPortada) {
        // Logos arriba (centro + derecha), con el margen de la portada.
        dibujarLogosPortada(MARGEN_PORTADA);

        // Nombre del listado centrado en la hoja (titulo grande), con el
        // prefijo 'Nombre: '.
        const yCentro = PAGE_H / 2 - 40;
        // lineBreak:false + fijar doc.y evita que pdfkit agregue una pagina
        // nueva por su cuenta (el margen interno del doc sigue siendo 20).
        doc.y = yCentro;
        doc.fontSize(34).fillColor('#111111').text('Nombre: ' + nombreListado, MARGEN_PORTADA, yCentro, {
          width: AREA_PORTADA_W,
          align: 'center',
          ellipsis: true,
          lineBreak: false
        });

        // Detalles debajo del nombre, centrados.
        let yDet = yCentro + 70;
        const lineasDet = [
          'Generado: ' + new Date().toLocaleString('es-AR'),
          'Usuario: ' + (req.contexto.usuario || '—'),
          'Cantidad de P&ID: ' + paginas.length
        ];
        if (incluirListado) lineasDet.push('Cantidad de marcaciones: ' + itemsListado.length);

        doc.fontSize(13).fillColor('#555555');
        lineasDet.forEach(function (txt) {
          doc.y = yDet;
          doc.text(txt, MARGEN_PORTADA, yDet, {
            width: AREA_PORTADA_W,
            align: 'center',
            lineBreak: false
          });
          yDet += 20;
        });

        hayContenidoEnPagina = true;
      }

      // --- LISTADO DE MARCACIONES (va antes que los P&IDs) ---
      console.log('[exportar/pdf] antes del listado, hayContenidoEnPagina=' + hayContenidoEnPagina);
      if (incluirListado) {
        console.log('[exportar/pdf] dibujando listado con ' + itemsListado.length + ' items');
        // Columnas con sus anchos proporcionales (suma ≈ AREA_W)
        const COLS = [
          { key: 'numero', label: '#', weight: 0.04, align: 'center' },
          { key: 'tag', label: 'Tag', weight: 0.10, align: 'left' },
          { key: 'diametro', label: 'Ø', weight: 0.05, align: 'center' },
          { key: 'descripcion', label: 'Descripción', weight: 0.22, align: 'left' },
          { key: 'estado', label: 'Estado', weight: 0.07, align: 'center' },
          { key: 'cso_csc', label: 'CSO/C', weight: 0.06, align: 'center' },
          { key: 'pid_nombre', label: 'P&ID', weight: 0.15, align: 'left' },
          { key: 'pid_hoja', label: 'Hoja', weight: 0.06, align: 'center' },
          { key: 'pid_revision', label: 'Rev.', weight: 0.05, align: 'center' },
          { key: 'ubicacion', label: 'Ubicación', weight: 0.08, align: 'center' }
        ];
        COLS.forEach(function (c) { c.ancho = Math.floor(AREA_W * c.weight); });

        const ROW_H = 14;
        const HEADER_H = 18;
        const TOP_Y = MARGEN;
        const BOTTOM_LIMIT = PAGE_H - MARGEN - 24;

        function textoCelda(val, col) {
          if (val === null || val === undefined) return '';
          if (col.key === 'diametro') {
            const n = parseFloat(val);
            if (isNaN(n) || n <= 0) return '';
            return String(n);
          }
          if (col.key === 'estado') {
            if (val === 'abierto') return 'Abierto';
            if (val === 'cerrado') return 'Cerrado';
            if (val === 'otro') return 'Otro';
            return String(val);
          }
          if (col.key === 'cso_csc') {
            return (val === 1 || val === true || val === '1') ? 'Sí' : '';
          }
          if (col.key === 'numero') {
            return (val !== null && val !== undefined) ? String(val) : '';
          }
          return String(val);
        }

        function dibujarEncabezado(y) {
          doc.save();
          doc.rect(MARGEN, y, AREA_W, HEADER_H).fill('#e8e8e8');
          doc.restore();

          doc.fontSize(8).fillColor('#111111');
          let x = MARGEN;
          COLS.forEach(function (c) {
            doc.text(c.label, x + 3, y + 5, { width: c.ancho - 6, align: c.align });
            x += c.ancho;
          });

          doc.strokeColor('#999999').lineWidth(0.5);
          doc.moveTo(MARGEN, y + HEADER_H).lineTo(MARGEN + AREA_W, y + HEADER_H).stroke();

          // Líneas verticales sutiles entre columnas (solo en el encabezado)
          doc.strokeColor('#d8d8d8').lineWidth(0.3);
          let xvH = MARGEN;
          for (let kH = 0; kH < COLS.length - 1; kH++) {
            xvH += COLS[kH].ancho;
            doc.moveTo(xvH, y).lineTo(xvH, y + HEADER_H).stroke();
          }

          return y + HEADER_H;
        }

        // --- Calcular en cuántas hojas entra el listado (para 'X de N') ---
        // La primera fila útil arranca después del título + encabezado.
        const Y_FILAS_INI = TOP_Y + 54 + HEADER_H;
        const filasPorHoja = Math.max(1, Math.floor((BOTTOM_LIMIT - Y_FILAS_INI) / ROW_H));
        const totalHojasListado = Math.max(1, Math.ceil(itemsListado.length / filasPorHoja));
        let hojaListadoActual = 0;

        function dibujarTituloListado() {
          hojaListadoActual++;
          const pagTexto = hojaListadoActual + ' de ' + totalHojasListado;
          // El nombre del listado puede traer pegado el sufijo '- Hoja XdeN'
          // (heredado del P&ID). En el titulo del PDF no debe verse: la hoja
          // ya se informa por columna y por la numeracion de pagina.
          const nombreTitulo = String(nombreListado || '').replace(/\s*-\s*Hoja\s*\d+\s*de\s*\d+\s*$/i, '').trim();
          const tituloListado = 'Listado: ' + (nombreTitulo || nombreListado);
          doc.fontSize(16).fillColor('#2962FF').text(tituloListado, MARGEN, TOP_Y + 12, { width: AREA_W, align: 'center' });
          doc.fontSize(9).fillColor('#555555').text('Total: ' + itemsListado.length + ' marcaciones', MARGEN, TOP_Y + 36, { width: AREA_W, align: 'center' });
          // Numeración 'X de N' en la cabecera (alineada a la derecha).
          doc.fontSize(11).fillColor('#333333').text(pagTexto, MARGEN, TOP_Y + 12, { width: AREA_W - 6, align: 'right' });
          return TOP_Y + 54;
        }

        // Primera página del listado: siempre página nueva, salvo que sea
        // la primera sección del documento (sin portada ni P&IDs).
        asegurarPaginaNuevaSiHaceFalta();

        let y = dibujarTituloListado();
        y = dibujarEncabezado(y);
        hayContenidoEnPagina = true;

        for (let i = 0; i < itemsListado.length; i++) {
          if (y + ROW_H > BOTTOM_LIMIT) {
            doc.addPage();
            y = dibujarTituloListado();
            y = dibujarEncabezado(y);
            hayContenidoEnPagina = true;
          }

          const it = itemsListado[i];
          if (i % 2 === 1) {
            doc.save();
            doc.rect(MARGEN, y, AREA_W, ROW_H).fill('#f6f6f6');
            doc.restore();
          }

          doc.fontSize(8).fillColor('#111111');
          let x = MARGEN;
          COLS.forEach(function (c) {
            const txt = textoCelda(it[c.key], c);
            doc.text(txt, x + 3, y + 3, {
              width: c.ancho - 6,
              align: c.align,
              ellipsis: true,
              lineBreak: false
            });
            x += c.ancho;
          });

          doc.strokeColor('#e0e0e0').lineWidth(0.3);
          doc.moveTo(MARGEN, y + ROW_H).lineTo(MARGEN + AREA_W, y + ROW_H).stroke();

          // Líneas verticales sutiles entre columnas (cada fila)
          doc.strokeColor('#ececec').lineWidth(0.25);
          let xvF = MARGEN;
          for (let kF = 0; kF < COLS.length - 1; kF++) {
            xvF += COLS[kF].ancho;
            doc.moveTo(xvF, y).lineTo(xvF, y + ROW_H).stroke();
          }

          y += ROW_H;
        }
      }

      // --- UNA PÁGINA POR P&ID (después del listado) ---
      for (let i = 0; i < paginas.length; i++) {
        asegurarPaginaNuevaSiHaceFalta();

        const p = paginas[i];
        const buffer = Buffer.from(p.pngBase64, 'base64');

        const anchoImg = (typeof p.anchoImg === 'number' && p.anchoImg > 0) ? p.anchoImg : 1000;
        const altoImg = (typeof p.altoImg === 'number' && p.altoImg > 0) ? p.altoImg : 1000;
        const escala = Math.min(AREA_W / anchoImg, AREA_H / altoImg);
        const dibW = anchoImg * escala;
        const dibH = altoImg * escala;
        const x = MARGEN + (AREA_W - dibW) / 2;
        const y = MARGEN + (AREA_H - dibH) / 2;

        try {
          doc.image(buffer, x, y, { width: dibW, height: dibH });
        } catch (e) {
          doc.fontSize(14).fillColor('#b71c1c').text('Error al incrustar imagen: ' + (p.pid || '') + ' ' + (p.hoja || ''), MARGEN, MARGEN);
        }

        hayContenidoEnPagina = true;
      }

      doc.end();

    } catch (e) {
      console.error('Error en /api/exportar/pdf:', e);
      try { res.status(500).json({ error: e.message }); } catch (e2) {}
    }
  });

  // ----------------------------------------------------------------
  // ADMINISTRACIÓN DE USUARIOS (solo admin)
  // ----------------------------------------------------------------
  // En modo windows la app no maneja contraseñas: la pantalla se muestra
  // en solo lectura y los endpoints de escritura responden 400.

  function esModoPassword(req) {
    return req.contexto && req.contexto.modoAuth === 'password';
  }

  app.get('/api/admin/usuarios', function (req, res) {
    if (!req.contexto.admin) return res.status(403).json({ error: 'Solo admin.' });
    try {
      const db = getDB();
      const filas = db.prepare(
        'SELECT u.id, u.nombre_windows, u.es_admin, u.rol, u.activo, u.creado, ' +
        '(SELECT COUNT(*) FROM listados l WHERE l.usuario_id = u.id) AS cantidad_listados ' +
        'FROM usuarios u ORDER BY lower(u.nombre_windows) ASC'
      ).all();
      res.json({
        modoAuth: req.contexto.modoAuth,
        usuarios: filas.map(function (f) {
          const rol = f.rol || (f.es_admin === 1 ? 'admin' : 'usuario');
          return {
            id: f.id,
            usuario: f.nombre_windows,
            rol: rol,
            esAdmin: rol === 'admin',
            activo: f.activo === 1,
            creado: f.creado,
            cantidadListados: f.cantidad_listados
          };
        })
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/admin/usuarios', function (req, res) {
    if (!req.contexto.admin) return res.status(403).json({ error: 'Solo admin.' });
    if (!esModoPassword(req)) return res.status(400).json({ error: 'No aplica en modo windows (sin contraseñas).' });
    try {
      const b = req.body || {};
      const usuario = String(b.usuario || '').trim();
      // La clave es OPCIONAL: si no se manda (o viene vacia), el usuario se crea
      // con password_hash = NULL y la define el mismo la primera vez que entra.
      const password = String(b.password || '');
      let rol = String(b.rol || '').trim().toLowerCase();
      if (rol !== 'admin' && rol !== 'superusuario') rol = 'usuario';
      if (!usuario) return res.status(400).json({ error: 'Falta el nombre de usuario.' });
      if (password && password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });

      const db = getDB();
      const existe = db.prepare('SELECT id FROM usuarios WHERE lower(nombre_windows) = lower(?)').get(usuario);
      if (existe) return res.status(409).json({ error: 'Ya existe un usuario con ese nombre.' });

      const hash = password ? auth.hashPassword(password) : null;
      const info = db.prepare('INSERT INTO usuarios (nombre_windows, es_admin, rol, password_hash, debe_cambiar_password, activo) VALUES (?, ?, ?, ?, 1, 1)')
        .run(usuario, rol === 'admin' ? 1 : 0, rol, hash);
      registrarEvento(db, req.contexto.usuario, 'crear_usuario',
        'usuario=' + usuario + ' rol=' + rol + (hash ? '' : ' (sin clave)'));
      res.json({ ok: true, id: Number(info.lastInsertRowid), sinClave: !hash });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/api/admin/usuarios/:id', function (req, res) {
    if (!req.contexto.admin) return res.status(403).json({ error: 'Solo admin.' });
    try {
      const db = getDB();
      const id = parseInt(req.params.id, 10);
      const fila = db.prepare('SELECT id, nombre_windows, es_admin FROM usuarios WHERE id = ?').get(id);
      if (!fila) return res.status(404).json({ error: 'Usuario no encontrado.' });

      const b = req.body || {};
      const sets = [];
      const vals = [];

      if (b.rol !== undefined) {
        let nuevoRol = String(b.rol || '').trim().toLowerCase();
        if (nuevoRol !== 'admin' && nuevoRol !== 'superusuario') nuevoRol = 'usuario';
        // No permitir que el admin se saque a si mismo el rol si es el unico admin.
        if (fila.id === req.contexto.usuarioId && nuevoRol !== 'admin') {
          const otros = db.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE (rol = 'admin' OR es_admin = 1) AND id <> ?").get(fila.id).n;
          if (otros === 0) return res.status(400).json({ error: 'No podés quitarte el rol de Admin: sos el único admin.' });
        }
        sets.push('rol = ?');
        vals.push(nuevoRol);
        sets.push('es_admin = ?');
        vals.push(nuevoRol === 'admin' ? 1 : 0);
      }

      if (b.activo !== undefined) {
        if (!esModoPassword(req)) return res.status(400).json({ error: 'Activar/desactivar no aplica en modo windows.' });
        if (fila.id === req.contexto.usuarioId && !b.activo) return res.status(400).json({ error: 'No podés desactivar tu propio usuario.' });
        sets.push('activo = ?');
        vals.push(b.activo ? 1 : 0);
      }

      if (sets.length === 0) return res.json({ ok: true });
      vals.push(id);
      db.prepare('UPDATE usuarios SET ' + sets.join(', ') + ' WHERE id = ?').run(...vals);

      // Si se desactiva, cerrar todas sus sesiones.
      if (b.activo === false) sesiones.destruirSesionesDeUsuario(id);

      registrarEvento(db, req.contexto.usuario, 'editar_usuario', 'id=' + id + ' ' + sets.join(', '));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/admin/usuarios/:id/blanquear', function (req, res) {
    if (!req.contexto.admin) return res.status(403).json({ error: 'Solo admin.' });
    if (!esModoPassword(req)) return res.status(400).json({ error: 'No aplica en modo windows (sin contraseñas).' });
    try {
      const db = getDB();
      const id = parseInt(req.params.id, 10);
      const fila = db.prepare('SELECT id, nombre_windows FROM usuarios WHERE id = ?').get(id);
      if (!fila) return res.status(404).json({ error: 'Usuario no encontrado.' });

      const temporal = auth.generarPasswordTemporal();
      const hash = auth.hashPassword(temporal);
      db.prepare('UPDATE usuarios SET password_hash = ?, debe_cambiar_password = 1 WHERE id = ?').run(hash, id);
      sesiones.destruirSesionesDeUsuario(id);
      registrarEvento(db, req.contexto.usuario, 'blanquear_password', 'usuario=' + fila.nombre_windows);

      res.json({ ok: true, usuario: fila.nombre_windows, passwordTemporal: temporal });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/admin/usuarios/:id', function (req, res) {
    if (!req.contexto.admin) return res.status(403).json({ error: 'Solo admin.' });
    try {
      const db = getDB();
      const id = parseInt(req.params.id, 10);
      const fila = db.prepare('SELECT id, nombre_windows FROM usuarios WHERE id = ?').get(id);
      if (!fila) return res.status(404).json({ error: 'Usuario no encontrado.' });
      if (id === req.contexto.usuarioId) return res.status(400).json({ error: 'No podés eliminar tu propio usuario.' });

      const cant = db.prepare('SELECT COUNT(*) AS n FROM listados WHERE usuario_id = ?').get(id).n;
      if (cant > 0) {
        return res.status(409).json({ error: 'El usuario tiene ' + cant + ' listado(s). Reasignálos o eliminálos antes de borrar el usuario.' });
      }

      db.prepare('DELETE FROM sesiones WHERE usuario_id = ?').run(id);
      db.prepare('DELETE FROM usuarios WHERE id = ?').run(id);
      registrarEvento(db, req.contexto.usuario, 'eliminar_usuario', 'usuario=' + fila.nombre_windows);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Fallback JSON para rutas /api/* no encontradas
  app.use('/api', function (req, res) {
    res.status(404).json({ error: 'Endpoint no encontrado: ' + req.method + ' ' + req.originalUrl });
  });
};