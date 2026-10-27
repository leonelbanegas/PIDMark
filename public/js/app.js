// ================================================================
// P&ID Mark - Cliente (núcleo)
// ================================================================
// Estado global, navegación, sesión e init.
// El resto de la funcionalidad vive en:
//   utilidades.js, modalMenu.js, divisoresColumnas.js,
//   listados.js, marcaciones.js, pids.js, calibracion.js,
//   visorMarcadoCanvas.js, visorMarcadoLupa.js,
//   visorMarcadoEventos.js, visorMarcado.js, exportar.js

// ============ Estado global ============
let sesion = null;
let listados = [];
let filtroActual = 'mios';
let listadoFiltroTexto = '';
let listadoActual = null;
let pidsDelListado = [];
let itemsDelListado = [];

let pids = [];
let pidFiltroTexto = '';

let ultimasRevisiones = {};

const LARGO_MAX_DESCRIPCION_LISTADO = 1000;
const LARGO_MAX_DESCRIPCION = 200;
const LARGO_MAX_NOMBRE_LISTADO = 200;

const TAMANO_MARCA_MIN = 10;
const TAMANO_MARCA_MAX = 400;
const GROSOR_BORDE_MARCA = 4;
const SEPARACION_TAG = 10;

const MARGEN_AUTOSCROLL = 60;

const canvasBrillo = document.createElement('canvas');
canvasBrillo.width = 40;
canvasBrillo.height = 40;

// ============ Estado de la vista previa ============
let vistaPrevia = {
  visible: false,
  imagen: null,
  ancho: 0, alto: 0,
  zoom: 1, zoomMin: 0.02, zoomMax: 20,
  offsetX: 0, offsetY: 0,
  arrastrando: false,
  arrastreIni: null,
  arrastreOffset: null,
  acumuladorWheel: 0,
  mousedownEn: null,
  movido: false
};

// ============ Estado del visor de calibración ============
let cal = {
  pid: null, hoja: null, rev: null, imagen: null, ancho: 0, alto: 0,
  hojaTexto: null,
  zoom: 1, zoomMin: 0.02, zoomMax: 20, offsetX: 0, offsetY: 0,
  punto00: null, punto100: null, modoMarcar: null,
  cambiosCal: false, _calibradoOriginal: false,
  arrastrando: false, arrastreIni: null, arrastreOffset: null,
  acumuladorWheel: 0, lupaZoom: 3, lupaTamano: 180, lupaActiva: true,
  virtual: null,
  cruzVirtualEl: null
};

// ============ Estado del visor de marcado ============
let marc = {
  pid: null, hoja: null, rev: null, imagen: null, ancho: 0, alto: 0,
  hojaTexto: null,
  zoom: 1, zoomMin: 0.02, zoomMax: 20, offsetX: 0, offsetY: 0,
  arrastrando: false, arrastreIni: null, arrastreOffset: null,
  acumuladorWheel: 0, lupaZoom: 3, lupaTamano: 180, lupaActiva: true,
  marcas: [], seleccionada: null,
  arrastrandoMarca: false, redimensionandoMarca: false,
  redimIni: null, redimTamIni: 0, redimOffsetIni: null,
  arrastrandoEtiqueta: false, etiquetaIni: null, etiquetaOffsetIni: null,
  tempIdSiguiente: 1, cambios: false,
  maxNumeroGlobal: 0,
  todosLosItems: [],
  tempIdItemNegativo: -1,
  ultimaSeleccionadaEnPanel: -1,
  parpadeoActivo: false,
  parpadeoMostrando: true,
  parpadeoToken: 0,
  focoItemId: null,
  focoNumero: null,
  origenVisor: null,
  scrollGuardado: null,
  virtual: null,
  cruzVirtualEl: null,
  soloLectura: false
};

// ============ Tema (claro / oscuro) ============
function aplicarTema(tema) {
  const claro = (tema === 'claro');
  document.body.classList.toggle('temaClaro', claro);
  try { localStorage.setItem('tema', claro ? 'claro' : 'oscuro'); } catch (e) {}
}

function temaActual() {
  try { return localStorage.getItem('tema') === 'claro' ? 'claro' : 'oscuro'; } catch (e) { return 'oscuro'; }
}

function alternarTema() {
  aplicarTema(document.body.classList.contains('temaClaro') ? 'oscuro' : 'claro');
}

(function iniciarTema() {
  if (temaActual() === 'claro') document.body.classList.add('temaClaro');
})();

// ============ Sesión ============
async function cargarSesion() {
  const r = await fetchAPI('/api/sesion');

  // En modo password, sin sesión válida -> a la pantalla de login.
  if (r.status === 401) {
    window.location.href = '/login.html';
    return;
  }

  sesion = await r.json();

  if (sesion.modoAuth === 'password' && !sesion.autenticado) {
    window.location.href = '/login.html';
    return;
  }

  $('infoSesion').textContent = sesion.usuario || '—';
  const ua = $('usuarioActivoListados');
  if (ua) {
    ua.textContent = 'Usuario activo: ';
    const nombreUa = document.createElement('span');
    nombreUa.className = 'usuarioActivoNombre';
    nombreUa.textContent = sesion.usuario || '—';
    ua.appendChild(nombreUa);
  }

  const nivel = $('infoNivel');
  if (nivel) {
    const rol = sesion.rol || (sesion.admin ? 'admin' : 'usuario');
    if (rol === 'admin') {
      nivel.textContent = 'Admin';
      nivel.className = 'usuarioNivel nivelAdmin';
    } else if (rol === 'superusuario') {
      nivel.textContent = 'SuperUsuario';
      nivel.className = 'usuarioNivel nivelSuperUsuario';
    } else {
      nivel.textContent = 'Usuario';
      nivel.className = 'usuarioNivel nivelUsuario';
    }
  }

  // Cerrar sesión: solo visible en modo password.
  // Menú "Usuarios": solo para admin.
  const menuUsr = $('menuUsuarios');
  if (menuUsr) menuUsr.style.display = sesion.admin ? '' : 'none';

  // Botón "Cargar P&ID": visible para Admin y SuperUsuario.
  const btnCargar = $('btnCargarPID');
  if (btnCargar) btnCargar.style.display = sesion.puedeGestionarPid ? '' : 'none';

  const btnSalir = $('btnCerrarSesion');
  if (btnSalir) {
    if (sesion.modoAuth === 'password') {
      btnSalir.style.display = '';
      if (!btnSalir._logoutEnganchado) {
        btnSalir._logoutEnganchado = true;
        btnSalir.onclick = function () {
          fetchAPI('/api/logout', { method: 'POST' })
            .then(function () { window.location.href = '/login.html'; })
            .catch(function () { window.location.href = '/login.html'; });
        };
      }
    } else {
      btnSalir.style.display = 'none';
    }
  }

  // Cambio de contraseña obligatorio.
  if (sesion.modoAuth === 'password' && sesion.debeCambiarPassword) {
    abrirModalObligatorioCambioPassword();
  }

  if (sesion.config && sesion.config.Lupa) {
    cal.lupaZoom = sesion.config.Lupa.Zoom || 3;
    cal.lupaTamano = sesion.config.Lupa.Tamano || 180;
    marc.lupaZoom = cal.lupaZoom;
    marc.lupaTamano = cal.lupaTamano;
  }
  actualizarControlLupa();
}

function actualizarControlLupa() {
  const valor = $('valorLupaZoom');
  if (valor) valor.textContent = cal.lupaZoom + 'x';
  const valorM = $('valorLupaZoomMarc');
  if (valorM) valorM.textContent = marc.lupaZoom + 'x';
}

// ============ Navegación ============
function marcarMenuActivo(idActivo) {
  document.querySelectorAll('.menuItem').forEach(function (b) {
    b.classList.toggle('activo', b.id === idActivo);
  });
  // El encabezado existe por pantalla; no hay que reescribir texto, cada uno
  // ya tiene el suyo (data-pantalla). Nada que hacer acá.
  void idActivo;
}

const IDS_PANTALLAS = [
  'pantallaListados', 'pantallaListadoAbierto',
  'pantallaPID', 'pantallaCalibracion', 'pantallaMarcado', 'pantallaUsuarios'
];

// Pantalla visible actualmente (para animar el cambio).
let _pantallaActualId = null;

function ocultarTodasLasPantallas() {
  IDS_PANTALLAS.forEach(function (id) {
    const el = $(id);
    if (el) {
      el.style.display = 'none';
      el.classList.remove('pantallaEntrando');
      el.classList.remove('pantallaOculta');
    }
  });
  _pantallaActualId = null;
}

// Cambia de pantalla con un fundido de 0.5 s en total:
// 200 ms de fade-out de la actual + 300 ms de fade-in de la nueva.
function mostrarPantallaConFade(id, displayFinal, alMostrar) {
  const destino = $(id);
  if (!destino) { if (alMostrar) alMostrar(); return; }

  // Al cambiar de pantalla se corta cualquier parpadeo de línea en curso.
  if (typeof cancelarParpadeoLinea === 'function') cancelarParpadeoLinea();

  const actual = _pantallaActualId ? $(_pantallaActualId) : null;
  const esMisma = (_pantallaActualId === id) && destino.style.display !== 'none';

  function mostrar() {
    IDS_PANTALLAS.forEach(function (otroId) {
      const el = $(otroId);
      if (!el) return;
      el.classList.remove('pantallaOculta');
      el.classList.remove('pantallaEntrando');
      if (otroId === id) {
        el.style.display = displayFinal || 'block';
      } else {
        el.style.display = 'none';
      }
    });
    _pantallaActualId = id;
    // Reinicia la animación de entrada (forzando reflow).
    void destino.offsetWidth;
    destino.classList.add('pantallaEntrando');
    if (alMostrar) alMostrar();
  }

  if (esMisma) { if (alMostrar) alMostrar(); return; }

  if (actual && actual !== destino && actual.style.display !== 'none') {
    actual.classList.add('pantallaOculta');
    setTimeout(mostrar, 200);
  } else {
    mostrar();
  }
}

function irAPantallaListados() {
  mostrarPantallaConFade('pantallaListados', 'block', function () {
    marcarMenuActivo('menuListados');
    cargarListados();
  });
}

function irAPantallaPID() {
  mostrarPantallaConFade('pantallaPID', 'block', function () {
    marcarMenuActivo('menuPID');
    cargarPIDs();
  });
}

// ============ Enganche principal de eventos ============
function engancharEventos() {
  $('menuListados').onclick = irAPantallaListados;
  $('menuPID').onclick = irAPantallaPID;

  $('btnNuevo').onclick = accionNuevo;
  const btnCargarPID = $('btnCargarPID');
  if (btnCargarPID) btnCargarPID.onclick = abrirModalCargarPID;

  const swGlobal = $('switchTemaGlobal');
  if (swGlobal) swGlobal.onclick = alternarTema;

  document.querySelectorAll('input[name="filtro"]').forEach(function (r) {
    r.onchange = function () { filtroActual = r.value; cargarListados(); };
  });

  const buscarListado = $('buscarListado');
  if (buscarListado) {
    buscarListado.oninput = function (e) {
      listadoFiltroTexto = e.target.value;
      dibujarTablaListados();
    };
    engancharBuscador('buscarListado');
  }

  const buscarPID = $('buscarPID');
  if (buscarPID) {
    buscarPID.oninput = function (e) {
      pidFiltroTexto = e.target.value;
      dibujarTablaPID();
    };
    engancharBuscador('buscarPID');
  }

  const desc = $('descripcionListado');
  if (desc) {
    desc.addEventListener('dblclick', function () {
      abrirModalEditarDescripcion();
    });
  }

  $('cuerpoTabla').addEventListener('click', function (e) {
    const btn = e.target.closest('button[data-accion="menu_listado"]');
    if (!btn) return;
    const id = parseInt(btn.getAttribute('data-id'), 10);
    const l = listados.find(function (x) { return x.id === id; });
    if (!l) return;
    abrirMenuDesdeBoton(btn, opcionesMenuListado(l));
  });

  $('cuerpoTabla').addEventListener('dblclick', function (e) {
    if (e.target.closest('button')) return;
    const tr = e.target.closest('tr');
    if (!tr) return;
    const id = parseInt(tr.getAttribute('data-id'), 10);
    if (!id) return;
    abrirListado(id);
  });

  $('cuerpoPidsDelListado').addEventListener('click', function (e) {
    const btn = e.target.closest('button[data-accion="menu_pid_listado"]');
    if (!btn) return;
    const pid = btn.getAttribute('data-pid');
    const hoja = btn.getAttribute('data-hoja');
    const rev = btn.getAttribute('data-rev');
    const p = pidsDelListado.find(function (x) {
      return String(x.pid) === String(pid)
          && formatearHoja(x.hojaTexto || x.hoja) === formatearHoja(hoja)
          && String(x.revision) === String(rev);
    });
    if (!p) return;
    abrirMenuDesdeBoton(btn, opcionesMenuPidDelListado(p));
  });

  $('cuerpoPidsDelListado').addEventListener('dblclick', function (e) {
    if (e.target.closest('button')) return;
    const tr = e.target.closest('tr');
    if (!tr) return;
    const pid = tr.getAttribute('data-pid');
    const hoja = tr.getAttribute('data-hoja');
    const rev = tr.getAttribute('data-rev');
    if (!pid || rev === null) return;
    abrirVisorMarcado(pid, hoja, rev);
  });

  $('cuerpoItems').addEventListener('click', function (e) {
    const btn = e.target.closest('button[data-accion="menu_item"]');
    if (!btn) return;
    const id = parseInt(btn.getAttribute('data-id'), 10);
    const it = itemsDelListado.find(function (x) { return x.id === id; });
    if (!it) return;
    abrirMenuDesdeBoton(btn, opcionesMenuItem(it));
  });

  $('cuerpoPID').addEventListener('click', function (e) {
    const btn = e.target.closest('button[data-accion="menu_pid_global"]');
    if (!btn) return;
    const pid = btn.getAttribute('data-pid');
    const hoja = btn.getAttribute('data-hoja');
    const rev = btn.getAttribute('data-rev');
    const p = pids.find(function (x) {
      return String(x.pid) === String(pid)
          && formatearHoja(x.hojaTexto || x.hoja) === formatearHoja(hoja)
          && String(x.revision) === String(rev);
    });
    if (!p) return;
    abrirMenuDesdeBoton(btn, opcionesMenuPidGlobal(p));
  });

  $('cuerpoPID').addEventListener('dblclick', function (e) {
    if (e.target.closest('button')) return;
    const tr = e.target.closest('tr');
    if (!tr) return;
    const pid = tr.getAttribute('data-pid');
    const hoja = tr.getAttribute('data-hoja');
    const rev = tr.getAttribute('data-rev');
    if (!pid || rev === null) return;

    const p = pids.find(function (x) {
      return String(x.pid) === String(pid)
          && formatearHoja(x.hojaTexto || x.hoja) === formatearHoja(hoja)
          && String(x.revision) === String(rev);
    });
    if (!p) return;

    // Doble clic en un P&ID calibrado -> visor en modo SOLO VER (igual que
    // la opcion 'Ver' del menu). Si no esta calibrado, va a Calibrar.
    if (p.calibrado) {
      abrirVisorCalibracion(pid, hoja, rev, true);
    } else if (sesion && sesion.puedeGestionarPid) {
      accionCalibrar(pid, hoja, rev, false);
    }
  });

  $('btnAgregarPIDAlListado').onclick = accionAgregarPIDAlListado;

  // Menú de acciones de la pestaña Líneas (⋮ por fila).
  const cuerpoLineasEl = $('cuerpoLineas');
  if (cuerpoLineasEl) {
    cuerpoLineasEl.addEventListener('click', function (e) {
      const btn = e.target.closest('button[data-accion="menu_linea"]');
      if (!btn) return;
      const id = parseInt(btn.getAttribute('data-id'), 10);
      const ln = lineasDelListado.find(function (x) { return x.id === id; });
      if (!ln) return;
      abrirMenuDesdeBoton(btn, opcionesMenuLinea(ln));
    });
  }


  if (typeof engancharPestanasListado === 'function') engancharPestanasListado();
  if (typeof engancharEventosUsuarios === 'function') engancharEventosUsuarios();

  engancharEventosCalibracion();
  engancharEventosMarcado();
  engancharEventosPanelPropiedades();
  engancharEventosVistaPrevia();
  engancharCierreMenuContextual();
  engancharTecladoGlobal();
  inicializarDivisores();

  hacerColumnasRedimensionables('tablaListados', 'anchos_tablaListados_v3');
  hacerColumnasRedimensionables('tablaPidsDelListado', 'anchos_tablaPidsDelListado_v3');
  hacerColumnasRedimensionables('tablaItems', 'anchos_tablaItems_v3');
  hacerColumnasRedimensionables('tablaPID', 'anchos_tablaPID_v3');
  hacerColumnasRedimensionables('tablaLineas', 'anchos_tablaLineas_v1');

  // Enganche de exportación (PNG / PDF actual / PDF combinado)
  if (typeof inicializarExportacion === 'function') {
    inicializarExportacion();
  }
}

function engangarEventosSeguro() {
  try {
    engancharEventos();
  } catch (e) {
    console.error('Error al enganchar eventos:', e);
  }
}

// ============ Cambio de contraseña obligatorio ============
function abrirModalObligatorioCambioPassword() {
  const html =
    '<p style="margin-top:0;">Por seguridad, tenés que cambiar la contraseña antes de continuar.</p>' +
    '<label>Contraseña actual:' +
    '<input type="password" id="inpPassActual" autocomplete="current-password"></label>' +
    '<label>Contraseña nueva (mínimo 4):' +
    '<input type="password" id="inpPassNueva" autocomplete="new-password"></label>' +
    '<label>Repetir contraseña nueva:' +
    '<input type="password" id="inpPassNueva2" autocomplete="new-password"></label>' +
    '<div id="errCambioPass" style="color:#e07070;font-size:12px;min-height:14px;"></div>';

  abrirModal('Cambiar contraseña', html, async function () {
    const err = $('errCambioPass');
    const actual = $('inpPassActual').value;
    const nueva = $('inpPassNueva').value;
    const nueva2 = $('inpPassNueva2').value;
    if (err) err.textContent = '';

    if (!actual || !nueva) { if (err) err.textContent = 'Completá todos los campos.'; return false; }
    if (nueva.length < 4) { if (err) err.textContent = 'La nueva contraseña debe tener al menos 4 caracteres.'; return false; }
    if (nueva !== nueva2) { if (err) err.textContent = 'Las contraseñas nuevas no coinciden.'; return false; }

    try {
      const r = await fetchAPI('/api/cambiar-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actual: actual, nueva: nueva })
      });
      const d = await r.json().catch(function () { return {}; });
      if (!r.ok) { if (err) err.textContent = d.error || 'No se pudo cambiar la contraseña.'; return false; }
      sesion.debeCambiarPassword = false;
      mostrarAviso('Contraseña actualizada.');
      return true;
    } catch (e) {
      if (err) err.textContent = 'Error de conexión: ' + e.message;
      return false;
    }
  }, { textoAceptar: 'Cambiar contraseña', sinCancelar: true });
}

// ============ Init ============
async function init() {
  try {
    await cargarSesion();
    await cargarListados();
    engangarEventosSeguro();
    marcarMenuActivo('menuListados');
    _pantallaActualId = 'pantallaListados';
  } catch (e) {
    console.error(e);
    mostrarAviso('Error al iniciar: ' + e.message, true);
  }
}

init();