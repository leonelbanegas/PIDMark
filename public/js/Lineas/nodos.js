// ================================================================
// Líneas de proceso - Edición de nodos y traslación completa
// ================================================================
// Permite:
//   - Arrastrar un tirador (nodo) para mover ese punto.
//   - Arrastrar la línea (desde un segmento, sin tocar tirador)
//     para trasladar TODA la línea.
//   - Ctrl+Z deshace el último cambio (por línea, en memoria).
//   - Supr (Delete) borra la línea seleccionada (con confirmación).
//
// El historial de undo NO se persiste: es una pila en memoria por
// línea, se resetea al recargar el P&ID. El guardado real sigue
// siendo manual con el botón "Guardar cambios".

var MAX_HISTORIAL_POR_LINEA = 50;

// ----------------------------------------------------------------
// Historial (undo)
// ----------------------------------------------------------------

function _historialDeLinea(ln) {
  if (!ln._historial) ln._historial = [];
  return ln._historial;
}

// Pushea el estado actual (copia profunda de puntos) al historial.
// Se llama cuando TERMINA una edición, no durante.
function _pushHistorial(ln, puntosAnteriores) {
  if (!puntosAnteriores) return;
  const hist = _historialDeLinea(ln);
  hist.push(puntosAnteriores.map(function (p) { return { x: p.x, y: p.y }; }));
  if (hist.length > MAX_HISTORIAL_POR_LINEA) hist.shift();
}

function _snapshotPuntos(ln) {
  if (!ln || !ln.puntos) return null;
  return ln.puntos.map(function (p) { return { x: p.x, y: p.y }; });
}

// Deshace el último cambio de la línea seleccionada.
// Devuelve true si deshizo algo, false si no había nada que deshacer.
function deshacerEdicionLinea() {
  if (lineas.seleccionada === null) return false;
  if (typeof marc !== 'undefined' && marc.soloLectura) return false;

  const ln = lineas.delPidActual.find(function (l) { return l.id === lineas.seleccionada; });
  if (!ln) return false;

  const hist = _historialDeLinea(ln);
  if (hist.length === 0) return false;

  ln.puntos = hist.pop();
  marcarLineaModificada(ln);
  if (typeof marc !== 'undefined') marc.cambios = true;
  if (typeof actualizarBotonGuardar === 'function') actualizarBotonGuardar();

  dibujarMarc();
  if (typeof actualizarLupaMarc === 'function') actualizarLupaMarc();
  return true;
}

// ----------------------------------------------------------------
// Drag de nodo / drag de línea completa
// ----------------------------------------------------------------
// Ambos comparten estado: lineas._dragNodo.
// - modo 'nodo': se mueve un solo punto (indice)
// - modo 'linea': se traslada toda la línea (dx, dy)

function iniciarDragNodo(ln, indice, p) {
  if (typeof marc !== 'undefined' && marc.soloLectura) return;
  if (!ln || !ln.puntos) return;

  lineas._dragNodo = {
    modo: 'nodo',
    linea: ln,
    indice: indice,
    inicioMouse: { x: p.x, y: p.y },
    puntosOriginales: _snapshotPuntos(ln)
  };
}

function iniciarDragLineaCompleta(ln, p) {
  if (typeof marc !== 'undefined' && marc.soloLectura) return;
  if (!ln || !ln.puntos) return;

  lineas._dragNodo = {
    modo: 'linea',
    linea: ln,
    inicioMouse: { x: p.x, y: p.y },
    puntosOriginales: _snapshotPuntos(ln)
  };
}

function moverDragNodo(p) {
  const d = lineas._dragNodo;
  if (!d) return false;
  if (typeof marc !== 'undefined' && marc.soloLectura) return false;

  const dx = p.x - d.inicioMouse.x;
  const dy = p.y - d.inicioMouse.y;
  const ancho = (typeof marc !== 'undefined' && marc.ancho) ? marc.ancho : Infinity;
  const alto = (typeof marc !== 'undefined' && marc.alto) ? marc.alto : Infinity;

  if (d.modo === 'nodo') {
    const orig = d.puntosOriginales[d.indice];
    let nx = orig.x + dx, ny = orig.y + dy;
    if (typeof clampearAlAreaCalibrada === 'function') {
      const pc = clampearAlAreaCalibrada({ x: nx, y: ny });
      nx = pc.x; ny = pc.y;
    } else {
      if (nx < 0) nx = 0;
      if (ny < 0) ny = 0;
      if (nx > ancho) nx = ancho;
      if (ny > alto) ny = alto;
    }
    d.linea.puntos[d.indice] = { x: nx, y: ny };
  } else {
    // Traslación de toda la línea: aplicamos dx, dy a todos los puntos.
    for (let i = 0; i < d.puntosOriginales.length; i++) {
      let nx = d.puntosOriginales[i].x + dx;
      let ny = d.puntosOriginales[i].y + dy;
      if (typeof clampearAlAreaCalibrada === 'function') {
        const pc = clampearAlAreaCalibrada({ x: nx, y: ny });
        nx = pc.x; ny = pc.y;
      } else {
        if (nx < 0) nx = 0;
        if (ny < 0) ny = 0;
        if (nx > ancho) nx = ancho;
        if (ny > alto) ny = alto;
      }
      d.linea.puntos[i] = { x: nx, y: ny };
    }
  }

  dibujarMarc();
  return true;
}

function finalizarDragNodo() {
  const d = lineas._dragNodo;
  if (!d) return false;
  lineas._dragNodo = null;

  // ¿Cambió respecto al estado original? Solo pusheamos si cambió.
  const actuales = d.linea.puntos;
  const orig = d.puntosOriginales;
  let cambio = false;
  if (actuales.length !== orig.length) {
    cambio = true;
  } else {
    for (let i = 0; i < actuales.length; i++) {
      if (actuales[i].x !== orig[i].x || actuales[i].y !== orig[i].y) { cambio = true; break; }
    }
  }

  if (!cambio) return false;

  _pushHistorial(d.linea, orig);
  marcarLineaModificada(d.linea);
  if (typeof marc !== 'undefined') marc.cambios = true;
  if (typeof actualizarBotonGuardar === 'function') actualizarBotonGuardar();
  if (typeof actualizarLupaMarc === 'function') actualizarLupaMarc();

  return true;
}

// ¿Hay un drag de nodo/línea en curso?
function hayDragNodoEnCurso() {
  return !!lineas._dragNodo;
}

// ================================================================
// BORRADO DE LÍNEAS
// ================================================================
// La X del listado y la tecla Supr llaman a esta función.
// El borrado se marca como pendiente y se persiste recién al
// presionar "Guardar cambios" (mismo flujo que el resto).

// Pide confirmación y, si acepta, borra la línea indicada.
// - Si era nueva (id < 0): se saca de delPidActual, del caché y de
//   pendientesGuardar. NO se agrega a pendientesBorrar (nunca
//   existió en el server).
// - Si era guardada (id > 0): se saca de delPidActual y se agrega
//   a pendientesBorrar para que el próximo Guardar haga el DELETE.
function solicitarBorrarLinea(id) {
  if (typeof marc !== 'undefined' && marc.soloLectura) {
    mostrarAviso('Listado en modo solo lectura.', true);
    return;
  }
  if (id === null || id === undefined) return;

  const ln = lineas.delPidActual.find(function (l) { return l.id === id; });
  if (!ln) return;

  const msg = '¿Borrar esta línea?\n\n' +
    (lineas.nombres[ln.color_indice] || ('Color ' + (ln.color_indice + 1))) +
    ' · ' + Math.round(ln.grosor) + 'px · ' + ln.puntos.length + ' puntos';
  if (!confirm(msg)) return;

  borrarLinea(id);
}

// Ejecuta el borrado (sin confirmación; la confirmación la hace
// solicitarBorrarLinea). Separado para poder testear o reusar.
function borrarLinea(id) {
  const idx = lineas.delPidActual.findIndex(function (l) { return l.id === id; });
  if (idx < 0) return;

  const ln = lineas.delPidActual[idx];

  // 1) Quitar del array en memoria
  lineas.delPidActual.splice(idx, 1);

  // 2) Limpiar estado según el tipo de línea
  if (ln.id < 0) {
    // Nueva sin guardar: sacarla de pendientesGuardar y del caché
    lineas.pendientesGuardar = lineas.pendientesGuardar.filter(function (l) { return l.id !== ln.id; });

    // Sacarla también del caché del P&ID actual (por las dudas)
    try {
      const clave = _claveCache(lineas._listadoId, lineas._pidNombre, lineas._pidHoja, lineas._pidRev);
      if (cacheLineas[clave]) {
        cacheLineas[clave] = cacheLineas[clave].filter(function (l) { return l.id !== ln.id; });
        if (cacheLineas[clave].length === 0) delete cacheLineas[clave];
      }
    } catch (e) { /* si _claveCache no está, no pasa nada */ }
  } else {
    // Guardada: marcar para borrar en el próximo Guardar
    if (!lineas.pendientesBorrar.includes(ln.id)) {
      lineas.pendientesBorrar.push(ln.id);
    }
    // Y sacarla de pendientesModificar (ya no aplica)
    lineas.pendientesModificar = lineas.pendientesModificar.filter(function (x) { return x !== ln.id; });
  }

  // 3) Si era la seleccionada, deseleccionar
  if (lineas.seleccionada === ln.id) {
    seleccionarLinea(null);
  }

  // 4) Refrescar UI
  if (typeof renderizarListaLineas === 'function') renderizarListaLineas();
  if (typeof renderizarLeyendaLineas === 'function') renderizarLeyendaLineas();
  if (typeof dibujarMarc === 'function') dibujarMarc();
  if (typeof actualizarLupaMarc === 'function') actualizarLupaMarc();
  if (typeof actualizarBotonGuardar === 'function') actualizarBotonGuardar();

  mostrarAviso('Línea borrada. Acordate de Guardar.');
}

// ================================================================
// ATAJO: tecla Supr borra la línea seleccionada
// ================================================================
// Se ignora si:
//   - No hay línea seleccionada.
//   - Estamos escribiendo en un input/textarea/contenteditable.
//   - Estamos en modo "dibujando" (ahí Supr no aplica).
//   - El visor está en solo lectura.
window.addEventListener('keydown', function (e) {
  if (e.key !== 'Delete' && e.key !== 'Supr') return;
  if (lineas.seleccionada === null) return;
  if (lineas.modo === 'dibujando') return;

  // Ignorar si el foco está en un campo de texto
  const ae = document.activeElement;
  if (ae) {
    const tag = (ae.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (ae.isContentEditable) return;
  }

  if (typeof marc !== 'undefined' && marc.soloLectura) return;

  e.preventDefault();
  e.stopPropagation();
  solicitarBorrarLinea(lineas.seleccionada);
}, true);