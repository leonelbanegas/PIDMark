// ================================================================
// Servidor principal del PID Marcador
// ================================================================
// Este archivo:
//   1. Lee la configuración desde el INI.
//   2. Verifica que el disco de red esté disponible.
//   3. Detecta el usuario de Windows actual cuando corresponde.
//   4. Inicializa la base SQLite.
//   5. Levanta el servidor Express y abre Chrome.

const express = require('express');
const path = require('path');
const open = require('open');
const versionAplicacion = require('./package.json').version;

const { cargarConfig, verificarRutas } = require('./src/config');
const { inicializarDB, getDB } = require('./src/db');
const { obtenerUsuarioWindows, esAdmin } = require('./src/usuario');
const sesiones = require('./src/sesiones');
const auth = require('./src/auth');
const registrarRutas = require('./src/rutas');

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
  log('Iniciando PID Mark v' + versionAplicacion + '...');

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

  // 3. Detectar usuario del sistema solo en Windows. En Linux la identidad
  // de los usuarios se obtiene del login de la aplicación, no del servicio.
  const usuarioReal = process.platform === 'win32' ? obtenerUsuarioWindows() : null;
  const adminReal = usuarioReal ? esAdmin(usuarioReal, config) : false;
  if (usuarioReal) log('Usuario real: ' + usuarioReal + (adminReal ? ' (admin)' : ''));
  else log('Sistema operativo: ' + process.platform);

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

  // Bloquear todos los recursos de la aplicación en navegadores no soportados.
  app.use((req, res, next) => {
    const ua = req.headers['user-agent'] || '';
    const esChrome = /Chrome\//.test(ua) && !/Edg\//.test(ua) && !/OPR\//.test(ua);
    if (!esChrome) {
      return res.status(403).sendFile(path.join(__dirname, 'public', 'bloqueo.html'));
    }
    next();
  });

  app.use(express.json({ limit: '300mb' }));

  // Middleware: adjuntar contexto (config, usuario, admin) a cada request.
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
    const usuario = usuarioReal;
    const admin = adminReal;

    // En modo windows, el rol sale del booleano admin (INI/BD).
    const rolWin = admin ? 'admin' : 'usuario';

    req.contexto = {
      config,
      usuario,
      admin,
      rol: rolWin,
      puedeGestionarPid: (rolWin === 'admin' || rolWin === 'superusuario'),
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

  // Ruta raíz
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  // Manejo de errores genérico
  app.use((err, req, res, next) => {
    console.error('Error en request:', err);
    const status = Number(err.status || err.statusCode);
    res.status(status >= 400 && status <= 599 ? status : 500).json({ error: err.message });
  });

  // 6. Levantar el servidor. En servidores Linux se usa systemd y no
  // corresponde intentar abrir un navegador en una sesión gráfica.
  const host = process.env.PID_HOST || '127.0.0.1';
  const puerto = Number(process.env.PID_PORT || 4123);
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
    abortar('PID_PORT debe ser un puerto entero entre 1 y 65535.');
  }

  app.listen(puerto, host, async () => {
    const url = 'http://' + (host.includes(':') ? '[' + host + ']' : host) + ':' + puerto;
    log('PID Mark v' + versionAplicacion + ' activo. Servidor disponible en ' + url);
    if (process.platform !== 'win32') {
      log('El servidor queda en segundo plano; configurá el acceso externo mediante un proxy HTTPS.');
      return;
    }
    try {
      await open(url, { app: { name: 'chrome' } });
    } catch (e) {
      log('Abrí manualmente: ' + url);
    }
  });
}

main().catch((e) => abortar(e.message));