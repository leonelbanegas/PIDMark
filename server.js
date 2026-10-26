// ================================================================
// Servidor principal del PID Marcador
// ================================================================
// Este archivo:
//   1. Lee la configuración desde el INI.
//   2. Verifica que el disco de red esté disponible.
//   3. Detecta el usuario de Windows actual.
//   4. Inicializa la base SQLite.
//   5. Levanta el servidor Express y abre Chrome.

const express = require('express');
const path = require('path');
const open = require('open');

const { cargarConfig, verificarRutas } = require('./src/config');
const { inicializarDB, getDB } = require('./src/db');
const { obtenerUsuarioWindows, esAdmin } = require('./src/usuario');
const sesiones = require('./src/sesiones');
const auth = require('./src/auth');
const registrarRutas = require('./src/rutas');

const PUERTO = 4123;

// ----------------------------------------------------------------
// Utilidades
// ----------------------------------------------------------------

/** Imprime un mensaje con la hora actual. */
function log(mensaje) {
  console.log('[' + new Date().toISOString() + '] ' + mensaje);
}

/** Imprime un error y cierra el proceso. */
function abortar(mensaje) {
  console.error('\nERROR FATAL: ' + mensaje + '\n');
  process.exit(1);
}

// ----------------------------------------------------------------
// Arranque
// ----------------------------------------------------------------

async function main() {
  log('Iniciando PID Marcador...');

  // 1. Cargar configuración desde el INI
  let config;
  try {
    config = cargarConfig();
    log('Configuracion INI cargada desde: ' + config._rutaINI);
  } catch (e) {
    abortar('No se pudo leer el INI: ' + e.message);
  }

  // 2. Verificar que el disco de red esté disponible
  const problemas = verificarRutas(config);
  if (problemas.length > 0) {
    abortar('Disco de red inaccesible:\n  - ' + problemas.join('\n  - '));
  }
  log('Rutas accesibles.');

  // 3. Detectar usuario de Windows y si es admin
  const usuarioReal = obtenerUsuarioWindows();
  const adminReal = esAdmin(usuarioReal, config);
  log('Usuario real: ' + usuarioReal + (adminReal ? ' (admin)' : ''));

  // 4. Inicializar base de datos SQLite
  try {
    inicializarDB(config.Rutas.BaseDatos);
    log('Base de datos lista: ' + config.Rutas.BaseDatos);
  } catch (e) {
    abortar('Error en base de datos: ' + e.message);
  }

  // --crear-admin <usuario> <password>: crea/actualiza un SuperUsuario y
  // sale sin levantar el servidor.
  const idxAdmin = process.argv.indexOf('--crear-admin');
  if (idxAdmin !== -1) {
    const u = process.argv[idxAdmin + 1];
    const p = process.argv[idxAdmin + 2];
    if (!u || !p) abortar('Uso: node server.js --crear-admin <usuario> <password>');
    try {
      const id = auth.crearOActualizarAdmin(getDB(), u, p);
      log('SuperUsuario creado/actualizado: ' + u + ' (id ' + id + ')');
    } catch (e) {
      abortar('No se pudo crear el admin: ' + e.message);
    }
    process.exit(0);
  }

  // Limpiar sesiones expiradas al arrancar (solo aplica en modo password).
  try { sesiones.limpiarExpiradas(); } catch (e) {}

  const modoAuth = (config.Autenticacion && config.Autenticacion.Modo) || 'windows';

  // 5. Servidor Express
  const app = express();
  app.use(express.json({ limit: '300mb' }));

  // Middleware: adjuntar contexto (config, usuario, admin) a cada request.
  //
  // Soporte de "usuario simulado": si el usuario real es admin y viene el
  // header X-Usuario-Simulado, se usa ese valor como usuario efectivo y se
  // recalcula el flag admin para ese usuario simulado. Si el usuario real
  // no es admin, el header se ignora por completo.
  app.use((req, res, next) => {
    if (modoAuth === 'password') {
      // Identidad desde la cookie de sesión.
      const token = sesiones.leerCookie(req, sesiones.NOMBRE_COOKIE);
      const ses = sesiones.obtenerSesion(token);
      let usuario = null;
      let admin = false;
      let usuarioId = null;
      let debeCambiar = false;
      let activo = true;

      let rol = 'usuario';
      if (ses) {
        const fila = getDB().prepare('SELECT id, nombre_windows, es_admin, rol, debe_cambiar_password, activo FROM usuarios WHERE id = ?').get(ses.usuario_id);
        if (fila) {
          usuario = fila.nombre_windows;
          rol = fila.rol || (fila.es_admin === 1 ? 'admin' : 'usuario');
          admin = (rol === 'admin');
          usuarioId = fila.id;
          debeCambiar = (fila.debe_cambiar_password === 1);
          activo = (fila.activo === 1);
          sesiones.renovarSesion(token);
        }
      }

      req.contexto = {
        config,
        usuario,
        admin,
        rol,
        puedeGestionarPid: (rol === 'admin' || rol === 'superusuario'),
        usuarioReal: usuario,
        adminReal: admin,
        usuarioId,
        debeCambiarPassword: debeCambiar,
        activo,
        tokenSesion: token,
        modoAuth: 'password',
        autenticado: !!usuario
      };
      return next();
    }

    // Modo windows: comportamiento original.
    let usuario = usuarioReal;
    let admin = adminReal;

    const simuladoRaw = req.headers['x-usuario-simulado'];
    const simulado = (typeof simuladoRaw === 'string') ? simuladoRaw.trim() : '';

    if (adminReal && simulado !== '') {
      usuario = simulado;
      admin = esAdmin(simulado, config);
    }

    // En modo windows, el rol sale del booleano admin (INI/BD).
    const rolWin = admin ? 'admin' : 'usuario';

    req.contexto = {
      config,
      usuario,
      admin,
      rol: rolWin,
      puedeGestionarPid: (rolWin === 'admin' || rolWin === 'superusuario'),
      usuarioReal,
      adminReal,
      modoAuth: 'windows',
      autenticado: true
    };

    next();
  });

  // Registrar todas las rutas API
  registrarRutas(app);

  // Servir archivos estáticos desde /public
  app.use(express.static(path.join(__dirname, 'public')));

  // Fallback de favicon: algunos navegadores piden /favicon.ico directamente.
  // Servimos el SVG (que sí existe) para evitar un 404.
  app.get('/favicon.ico', (req, res) => {
    res.type('image/svg+xml');
    res.sendFile(path.join(__dirname, 'public', 'favicon.svg'));
  });

  // Ruta raíz: si no es Chrome, redirigir a /bloqueo.html
  app.get('/', (req, res) => {
    const ua = req.headers['user-agent'] || '';
    const esChrome = /Chrome\//.test(ua) && !/Edg\//.test(ua) && !/OPR\//.test(ua);
    if (!esChrome) return res.redirect('/bloqueo.html');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  // Manejo de errores genérico
  app.use((err, req, res, next) => {
    console.error('Error en request:', err);
    res.status(500).json({ error: err.message });
  });

  // 6. Levantar el servidor y abrir Chrome
  app.listen(PUERTO, '127.0.0.1', async () => {
    const url = 'http://127.0.0.1:' + PUERTO;
    log('Servidor disponible en ' + url);
    try {
      await open(url, { app: { name: 'chrome' } });
    } catch (e) {
      log('Abri manualmente: ' + url);
    }
  });
}

main().catch((e) => abortar(e.message));