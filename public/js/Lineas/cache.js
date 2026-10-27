// ================================================================
// Líneas de proceso - Caché temporal, snapshot e inicialización
// ================================================================
// Mantiene las líneas en memoria entre cambios de P&ID dentro de la
// misma sesión (para no perder cambios no guardados), y expone
// la inicialización del módulo cuando se abre un P&ID.

// Caché global: clave = "listadoId|pidNombre|pidHoja|pidRev"
var cacheLineas = {};

// Genera la clave única para el caché
function _claveCache(listadoId, pidNombre, pidHoja, pidRev) {
  return listadoId + '|' + pidNombre + '|' + pidHoja + '|' + pidRev;
}

// ----------------------------------------------------------------
// Snapshot para detectar cambios
// ----------------------------------------------------------------

function _puntoAString(p) {
  const x = Math.round(parseFloat(p.x) * 100) / 100;
  const y = Math.round(parseFloat(p.y) * 100) / 100;
  return '{"x":' + x + ',"y":' + y + '}';
}

function _obtenerSnapshot() {
  return lineas.delPidActual.map(function (l) {
    const puntosStr = (l.puntos || []).map(_puntoAString).join(',');
    return JSON.stringify({
      id: l.id,
      color: l.color_indice,
      grosor: Math.round(parseFloat(l.grosor) * 100) / 100,
      opacidad: l.opacidad,
      puntos: puntosStr
    });
  }).sort();
}

// ----------------------------------------------------------------
// Firma de una línea para detectar duplicados server↔cache
// ----------------------------------------------------------------
// No usamos id porque la copia del cache tiene id negativo. Usamos
// (color, grosor, opacidad, puntos redondeados) para reconocer que
// la línea local ES la misma que la del server.
function _firmaLinea(l) {
  const pts = (l.puntos || []).map(_puntoAString).join(',');
  return l.color_indice + '|' + Math.round(parseFloat(l.grosor) * 100) / 100 + '|' +
         l.opacidad + '|' + pts;
}

// ----------------------------------------------------------------
// Inicialización al abrir un P&ID
// ----------------------------------------------------------------

async function inicializarModoLineas(pidNombre, pidHoja, pidRev, listadoId) {
  if (lineas.guardando) return;

  lineas._initToken++;
  const miToken = lineas._initToken;

  // Guardar líneas del P&ID anterior en caché. Solo las NO
  // confirmadas (id < 0). Las confirmadas ya están en DB.
  if (lineas._pidNombre && lineas._listadoId) {
    const claveVieja = _claveCache(lineas._listadoId, lineas._pidNombre, lineas._pidHoja, lineas._pidRev);
    const pendientesViejos = lineas.delPidActual.filter(function (l) { return l.id < 0; });
    if (pendientesViejos.length > 0) {
      cacheLineas[claveVieja] = pendientesViejos;
    } else {
      delete cacheLineas[claveVieja];
    }
  }

  const nuevaClave = _claveCache(listadoId, pidNombre, pidHoja, pidRev);
  lineas._pidNombre = pidNombre;
  lineas._pidHoja = pidHoja;
  lineas._pidRev = pidRev;
  lineas._listadoId = listadoId;

  lineas.seleccionada = null;
  lineas.modo = 'inactivo';
  lineas.puntosEnCurso = [];
  lineas.cargado = false;
  lineas._dragNodo = null;
  // Restaurar el boton "Nueva linea" si quedo en modo "Terminar linea"
  // tras una re-inicializacion (polling / cambio de P&ID a mitad de dibujo).
  if (typeof cancelarLineaEnCurso === 'function') cancelarLineaEnCurso();

  lineas.pendientesGuardar = [];
  lineas.pendientesModificar = [];
  lineas.pendientesBorrar = [];

  cambiarTabActiva('marcas');
  engancharEventosLineas();

  try {
    const [nuevosNombres, nuevasLineas] = await Promise.all([
      obtenerNombresColores(listadoId, pidNombre, pidHoja),
      obtenerLineasDelPIDActual(listadoId, pidNombre, pidHoja, pidRev)
    ]);

    if (miToken !== lineas._initToken) return;
    if (lineas.guardando) return;

    lineas.nombres = nuevosNombres || NOMBRES_COLORES_LINEA_DEFAULT.slice();

    const lineasDelServer = Array.isArray(nuevasLineas) ? nuevasLineas : [];
    const lineasLocales = cacheLineas[nuevaClave] || [];

    // Deduplicar: si una línea del cache coincide con una del
    // server por firma, la del cache se DESCARTA (ya fue guardada
    // en una sesión anterior y el server es la fuente de verdad).
    const firmasServer = new Set(lineasDelServer.map(_firmaLinea));
    const localesNoGuardadas = lineasLocales.filter(function (l) {
      return l.id < 0 && !firmasServer.has(_firmaLinea(l));
    });

    lineas.delPidActual = [...lineasDelServer, ...localesNoGuardadas];

    // Cache limpio: si quedó vacío, lo borramos.
    if (localesNoGuardadas.length > 0) {
      cacheLineas[nuevaClave] = localesNoGuardadas;
    } else {
      delete cacheLineas[nuevaClave];
    }

    lineas.pendientesGuardar = localesNoGuardadas.slice();
    lineas.pendientesModificar = [];
    lineas.pendientesBorrar = [];

    lineas._lineaBase = _obtenerSnapshot();

    lineas.cargado = true;

    if (typeof cargarPosicionLeyenda === 'function') {
      await cargarPosicionLeyenda();
    }

    renderizarPaletaColores();
    renderizarListaLineas();

    if (typeof dibujarMarc === 'function') dibujarMarc();
    if (typeof actualizarLupaMarc === 'function') actualizarLupaMarc();
    if (typeof actualizarBotonGuardar === 'function') actualizarBotonGuardar();

    // Si quedó un parpadeo pendiente de "Ver en plano" para ESTE P&ID,
    // dispararlo recién ahora (las líneas ya están cargadas).
    if (lineas._parpadeoPendiente) {
      const pp = lineas._parpadeoPendiente;
      const mismoPid = (pp.pid === pidNombre &&
        formatearHoja(pp.hoja) === formatearHoja(pidHoja) &&
        String(pp.rev) === String(pidRev));
      if (mismoPid) {
        lineas._parpadeoPendiente = null;
        if (typeof iniciarParpadeoLinea === 'function') iniciarParpadeoLinea(pp.id, 10, 500);
      }
    }

  } catch (e) {
    console.warn('Error cargando datos de líneas:', e);
    if (miToken === lineas._initToken) {
      lineas.cargado = true;
      lineas._lineaBase = _obtenerSnapshot();
      renderizarListaLineas();
    }
  }
}

// =================================================================
// INICIALIZACIÓN: ya NO hay polling.
// =================================================================
// Antes había un setInterval de 500 ms que espiaba marc.pid para
// reinicializar el modo líneas. Eso provocaba una DOBLE inicialización
// al abrir un P&ID (una desde visorMarcado.js y otra desde el polling),
// y mantenía un timer corriendo de por vida.
//
// La inicialización la hace explícitamente _abrirVisorMarcadoInterno()
// en public/js/visorMarcado.js:
//     inicializarModoLineas(pid, hojaNorm, rev, listadoActual.id);
//
// Si en el futuro se agrega otra forma de cambiar de P&ID SIN pasar por
// _abrirVisorMarcadoInterno(), hay que llamar a inicializarModoLineas()
// desde ese punto. No reintroducir un polling.