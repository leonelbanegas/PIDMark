// ================================================================
// Hipervínculos sobre el visor de CALIBRACIÓN
// ================================================================
// Flujo:
//   1) En el P&ID origen, "+ Agregar hipervínculo" -> se dibuja un
//      rectángulo en el origen.
//   2) Modal (arrastrable, con filtro) para elegir el P&ID destino.
//   3) Se abre el P&ID destino en el visor y se pide dibujar la zona
//      receptora.
//   4) Se crea un PAR: A->B (rect origen) y B->A (rect receptor),
//      compartiendo par_id. Se vuelve al P&ID origen.
//
// Depende de: cal (estado del visor de calibración), sesion, $,
// fetchAPI, abrirModal, mostrarAviso, escaparHTML, formatearHoja,
// abrirVisorCalibracion.

var hiperv = {
  delPidActual: [],
  modo: 'inactivo',        // 'inactivo' | 'dibujar'
  rectEnCurso: null,       // { x0, y0, x1, y1 } en px de imagen
  dibujando: false,
  seleccionado: null,
  _pid: null,
  _hoja: null,
  _rev: null,
  _pidsCalibradosCache: null,
  // Flujo de creación con par inverso:
  pendiente: null,         // { origen:{pid,hoja,rev,rect}, destino:{pid,hoja,rev} }
  // Parpadeo del rectángulo receptor tras navegar.
  // _parpadeoParId = par_id del link que debe parpadear (el inverso exacto
  // del que se clickeó). Asi, si dos links apuntan al mismo P&ID, solo titila
  // el correcto.
  _parpadeoParId: null,
  _parpadeoToken: 0,
  // Arrastre / redimension del rectangulo seleccionado.
  // _accion: null | 'mover' | 'redimensionar'
  _accion: null,
  _accionH: null,          // hipervinculo afectado (objeto de delPidActual)
  _accionRectOriginal: null, // { x, y, w, h } al iniciar la accion
  _accionPuntoInicio: null,  // { x, y } en px de imagen al iniciar
  _accionMovido: false,      // true si se movio lo suficiente (evita navegar)
  _accionPendienteGuardar: false,
  _debounceGuardarId: 0,   // timer de guardado por teclado
  _hipervKeyEnganchado: false
};

// Devuelve true si el usuario actual puede crear/editar/borrar hipervínculos
// (Admin o SuperUsuario). Si no hay sesión cargada, se asume sin permiso.
function hipervPuedeGestionar () {
  return !!(typeof sesion !== 'undefined' && sesion && sesion.puedeGestionarPid);
}

// Muestra u oculta el botón "+ Agregar hipervínculo" según permiso.
function _actualizarBotonNuevoHiperv () {
  const btn = $('btnNuevoHipervinculo');
  if (!btn) return;
  btn.style.display = hipervPuedeGestionar() ? '' : 'none';
}

// ---------- carga ----------
function inicializarHiperv (pid, hoja, rev) {
  hiperv._pid = pid;
  hiperv._hoja = formatearHoja(hoja);
  hiperv._rev = String(rev);
  _actualizarBotonNuevoHiperv();
  hiperv.delPidActual = [];
  hiperv.modo = 'inactivo';
  hiperv.rectEnCurso = null;
  hiperv.seleccionado = null;
  dibujarHipervinculosCal();
  renderizarListaHipervinculos();
  fetchAPI('/api/hipervinculos/' +
    encodeURIComponent(pid) + '/' +
    encodeURIComponent(hiperv._hoja) + '/' +
    encodeURIComponent(hiperv._rev))
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d && d.hipervinculos) {
        hiperv.delPidActual = d.hipervinculos;
        dibujarHipervinculosCal();
        renderizarListaHipervinculos();
      }
    })
    .catch(function () { /* silencioso */ });
}

// ---------- dibujo en la capa overlay ----------
function dibujarHipervinculosCal () {
  const capa = $('capaHipervinculosCal');
  if (!capa) return;
  capa.innerHTML = '';

  hiperv.delPidActual.forEach(function (h) {
    const div = document.createElement('div');
    div.className = 'hipervinculoRect' + (hiperv.seleccionado === h.id ? ' seleccionado' : '');
    div.style.left = h.x + 'px';
    div.style.top = h.y + 'px';
    div.style.width = h.w + 'px';
    div.style.height = h.h + 'px';
    // En modo SOLO VER (cal.soloVer) no se permite seleccionar/editar:
    // el rect solo navega al destino.
    const soloVer = (typeof cal !== 'undefined' && cal && cal.soloVer);
    div.title = soloVer
      ? ('Clic para ir a: ' + h.destino_pid_nombre + ' (' + h.destino_pid_hoja + ') Rev.' + h.destino_pid_revision)
      : ('Clic para ir a: ' + h.destino_pid_nombre + ' (' + h.destino_pid_hoja + ') Rev.' + h.destino_pid_revision + '  (Ctrl+clic: seleccionar)');
    // Parpadea solo el rectángulo inverso exacto (mismo par_id), no todos
    // los que apunten al mismo destino.
    if (hiperv._parpadeoParId != null && h.par_id != null &&
        String(h.par_id) === String(hiperv._parpadeoParId)) {
      div.classList.add('parpadeando');
    }
    // Rojo si el P&ID destino no está en su última revisión.
    if (typeof esDestinoDesactualizado === 'function' &&
        esDestinoDesactualizado(h.destino_pid_nombre, h.destino_pid_hoja, h.destino_pid_revision)) {
      div.classList.add('desactualizado');
    }

    // mousedown: si esta seleccionado y hay permiso, inicia ARRASTRE.
    // Si no, deja que el click haga lo suyo (navegar / seleccionar).
    div.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      if (cal && cal.soloVer) return; // modo Ver: sin arrastre
      if (!hipervPuedeGestionar()) return;
      if (hiperv.seleccionado !== h.id) return;
      if (hiperv.modo === 'dibujar') return;
      iniciarAccionHipervinculo('mover', h, e);
    });

    div.addEventListener('click', function (e) {
      e.stopPropagation();
      if (hiperv._accionMovido) {
        // Fue un arrastre: no navegar ni re-seleccionar.
        hiperv._accionMovido = false;
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        // Ctrl (o Cmd) + clic: seleccionar. En modo Ver no se selecciona.
        if (cal && cal.soloVer) return;
        seleccionarHipervinculo(h.id);
        return;
      }
      // Clic simple: navegar al P&ID destino.
      navegarAHipervinculo(h);
    });
    div.addEventListener('dblclick', function (e) {
      e.stopPropagation();
      if (cal && cal.soloVer) return; // modo Ver: sin editar destino
      if (!hipervPuedeGestionar()) return;
      editarDestinoHipervinculo(h);
    });
    capa.appendChild(div);

    // Tirador de redimension: solo con el rect seleccionado, permiso y
    // fuera del modo Ver.
    if (!(cal && cal.soloVer) && hiperv.seleccionado === h.id && hipervPuedeGestionar()) {
      const tirador = document.createElement('div');
      tirador.className = 'tiradorHipervinculo';
      tirador.style.left = (h.x + h.w) + 'px';
      tirador.style.top = (h.y + h.h) + 'px';
      tirador.title = 'Arrastrar para redimensionar';
      tirador.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        iniciarAccionHipervinculo('redimensionar', h, e);
      });
      capa.appendChild(tirador);
    }
  });

  if (hiperv.rectEnCurso) {
    const r = hiperv.rectEnCurso;
    const x = Math.min(r.x0, r.x1), y = Math.min(r.y0, r.y1);
    const w = Math.abs(r.x1 - r.x0), h = Math.abs(r.y1 - r.y0);
    const div = document.createElement('div');
    div.className = 'hipervinculoRect hipervinculoRectCurso';
    div.style.left = x + 'px';
    div.style.top = y + 'px';
    div.style.width = w + 'px';
    div.style.height = h + 'px';
    capa.appendChild(div);
  }
}

// Navega al P&ID destino del hipervínculo (clic simple en la zona).
// Si hay un flujo pendiente, no navega (para no romper la creación).
function navegarAHipervinculo (h) {
  if (hiperv.pendiente) {
    mostrarAviso('Terminá primero la zona receptora del hipervínculo en curso.', true);
    return;
  }
  const destPid = h.destino_pid_nombre;
  const destHoja = formatearHoja(h.destino_pid_hoja);
  const destRev = String(h.destino_pid_revision);
  if (!destPid || !destHoja || destRev === '') return;

  // Al llegar al destino, debe parpadear el rectángulo inverso de ESTE par.
  // Se usa el par_id del link clickeado (no el destino) para no confundir
  // con otros links que apunten al mismo P&ID.
  _iniciarParpadeoDestino(h.par_id != null ? h.par_id : null);

  if (typeof abrirVisorCalibracion === 'function') {
    // Si venimos del modo Ver, el destino tambien se abre en modo Ver
    // (sin panel derecho). Si no, se abre el visor normal de calibracion.
    const soloVer = (typeof cal !== 'undefined' && cal && cal.soloVer);
    abrirVisorCalibracion(destPid, destHoja, destRev, soloVer);
    // El aviso de P&ID desactualizado NO se muestra en un modal: el sello
    // sobre el plano (con la revision nueva) es suficiente.
  }
}

// ================================================================
// VISOR DE MARCAS: dibujo (solo lectura) + navegación
// ================================================================
// Los hipervínculos son por P&ID, así que se cargan igual que en
// calibración. En este visor solo se NAVEGA (clic simple), no se edita.

var hipervMarc = {
  delPidActual: [],
  _pid: null,
  _hoja: null,
  _rev: null,
  // Parpadeo del rectángulo receptor tras navegar desde el visor de marcas.
  _parpadeoParId: null,
  _parpadeoToken: 0
};

// Carga los hipervínculos del P&ID actual en el visor de marcas y los dibuja.
function inicializarHipervMarc (pid, hoja, rev) {
  hipervMarc._pid = pid;
  hipervMarc._hoja = formatearHoja(hoja);
  hipervMarc._rev = String(rev);
  hipervMarc.delPidActual = [];
  dibujarHipervinculosMarc();
  fetchAPI('/api/hipervinculos/' +
    encodeURIComponent(pid) + '/' +
    encodeURIComponent(hipervMarc._hoja) + '/' +
    encodeURIComponent(hipervMarc._rev))
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d && d.hipervinculos) {
        hipervMarc.delPidActual = d.hipervinculos;
        dibujarHipervinculosMarc();
      }
    })
    .catch(function () { /* silencioso */ });
}

// Activa/desactiva la interactividad de la capa de hipervínculos del visor
// de MARCAS. Se desactiva mientras se está dibujando una línea, para que el
// usuario pueda hacer clic SOBRE una zona de hipervínculo sin navegar (el
// clic atraviesa la capa y llega al lienzo, que agrega el punto de la línea).
// Con pointer-events:none los divs siguen visibles pero no reciben eventos.
// OJO: los .hipervinculoRect tienen pointer-events:auto en el CSS, lo que
// ANULA el none del padre. Por eso hay que forzarlo tambien en cada rect;
// si no, el dblclick se genera en el rect y no finaliza la linea.
function setHipervinculosMarcInteractivos (activo) {
  const capa = $('capaHipervinculosMarc');
  if (!capa) return;
  capa.style.pointerEvents = activo ? '' : 'none';
  const rects = capa.querySelectorAll('.hipervinculoRect');
  Array.prototype.forEach.call(rects, function (el) {
    el.style.pointerEvents = activo ? '' : 'none';
  });
}

// Dibuja los rectángulos sobre #capaHipervinculosMarc. El transform lo
// aplica dibujarMarc() a esa capa.
function dibujarHipervinculosMarc () {
  const capa = $('capaHipervinculosMarc');
  if (!capa) return;
  capa.innerHTML = '';

  // Si se esta dibujando una linea, la capa NO debe capturar clics (aunque
  // dibujarMarc se llame de nuevo y recree los divs). Se re-aplica siempre.
  const dibujandoLinea = (typeof lineas !== 'undefined' && lineas && lineas.modo === 'dibujando');
  capa.style.pointerEvents = dibujandoLinea ? 'none' : '';

  hipervMarc.delPidActual.forEach(function (h) {
    const div = document.createElement('div');
    div.className = 'hipervinculoRect';
    if (dibujandoLinea) div.style.pointerEvents = 'none';
    div.style.left = h.x + 'px';
    div.style.top = h.y + 'px';
    div.style.width = h.w + 'px';
    div.style.height = h.h + 'px';
    div.title = 'Clic para ir a: ' + h.destino_pid_nombre + ' (' + h.destino_pid_hoja + ') Rev.' + h.destino_pid_revision;
    // Parpadea solo el rectángulo inverso exacto (mismo par_id).
    if (hipervMarc._parpadeoParId != null && h.par_id != null &&
        String(h.par_id) === String(hipervMarc._parpadeoParId)) {
      div.classList.add('parpadeando');
    }
    // Rojo si el P&ID destino no está en su última revisión.
    if (typeof esDestinoDesactualizado === 'function' &&
        esDestinoDesactualizado(h.destino_pid_nombre, h.destino_pid_hoja, h.destino_pid_revision)) {
      div.classList.add('desactualizado');
    }
    div.addEventListener('click', function (e) {
      e.stopPropagation();
      navegarDesdeMarcado(h);
    });
    capa.appendChild(div);
  });
}

// Navega desde el visor de marcas al P&ID destino del hipervínculo.
// Flujo (en este orden):
//   1) Si hay cambios sin guardar -> pedir confirmación SOLO para guardar.
//      No se cierra ni se cambia el P&ID actual en este paso. Si cancela,
//      se queda en el P&ID actual.
//   2) Con el guardado resuelto, si el destino ESTÁ en el listado actual ->
//      se cambia el P&ID visible.
//   3) Si NO está -> sin cerrar el actual, preguntar si se carga. Si da OK
//      se agrega al listado y se cambia el P&ID visible. Si cancela, se
//      queda en el P&ID actual.
// El parpadeo del link inverso se dispara SOLO cuando se navega de verdad.
function navegarDesdeMarcado (h) {
  const destPid = h.destino_pid_nombre;
  const destHoja = formatearHoja(h.destino_pid_hoja);
  const destRev = String(h.destino_pid_revision);
  if (!destPid || !destHoja || destRev === '') return;

  function enListadoActual() {
    return (typeof pidsDelListado !== 'undefined' && Array.isArray(pidsDelListado))
      ? pidsDelListado.some(function (p) {
          return String(p.pid) === String(destPid) &&
                 formatearHoja(p.hojaTexto || p.hoja) === destHoja &&
                 String(p.revision) === destRev;
        })
      : false;
  }

  // Cambia el P&ID visible y arranca el parpadeo del link inverso.
  function cambiarPidVisible() {
    _iniciarParpadeoDestinoMarc(h.par_id != null ? h.par_id : null);
    abrirVisorMarcado(destPid, destHoja, destRev);
    // Sin modal de aviso: el sello sobre el plano ya lo indica.
  }

  // Paso 2/3: decidir la navegación (sin tocar el P&ID actual todavía).
  function intentarNavegar() {
    if (enListadoActual()) {
      cambiarPidVisible();
      return;
    }

    // No está en el listado: preguntar si agregarlo SIN cerrar el actual.
    abrirModal('P&ID no está en el listado',
      '<p>El P&amp;ID <strong>' + escaparHTML(destPid) + '</strong> (Hoja ' + escaparHTML(destHoja) +
        ' Rev.' + escaparHTML(destRev) + ') no está en el listado actual.</p>' +
      '<p>¿Querés agregarlo al listado y abrirlo?</p>' +
      '<p style="color:#888;font-size:12px;">Si cancelás, seguís en el P&amp;ID actual.</p>',
      function () {
        if (typeof listadoActual === 'undefined' || !listadoActual) return false;
        return fetchAPI('/api/listados/' + listadoActual.id + '/pids', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pid: destPid, hoja: destHoja, revision: destRev })
        }).then(function (r) { return r.json(); }).then(function (d) {
          if (d && d.error) { mostrarAviso(d.error, true); return false; }

          // OJO: recargarPidsDelListadoActual() es async y ADENTRO hace
          // mostrarPantallaConFade('pantallaListadoAbierto', ...). Si no la
          // esperamos, esa recarga termina DESPUES de abrirVisorMarcado y
          // pisa la pantalla: el visor se abre y al toque vuelve al listado.
          // Por eso primero refrescamos el listado y RECIEN despues abrimos.
          const recarga = (typeof recargarPidsDelListadoActual === 'function')
            ? Promise.resolve(recargarPidsDelListadoActual()).catch(function () {})
            : Promise.resolve();

          return recarga.then(function () {
            cambiarPidVisible();
            return true;
          });
        }).catch(function (e) {
          mostrarAviso('Error al agregar P&ID: ' + e.message, true);
          return false;
        });
      },
      { textoAceptar: 'Agregar y abrir' }
    );
  }

  // Paso 1: si hay cambios sin guardar, confirmar guardado (SIN cerrar el actual).
  if (typeof hayCambiosSinGuardar === 'function' && hayCambiosSinGuardar()) {
    abrirModal('Cambios sin guardar',
      '<p>Hay cambios sin guardar en este P&amp;ID.</p>' +
      '<p>¿Querés guardarlos antes de ir al P&amp;ID vinculado?</p>' +
      '<p style="color:#888;font-size:12px;">Si cancelás, seguís en el P&amp;ID actual sin cambios.</p>',
      function () {
        if (typeof guardarCambiosMarc !== 'function') { intentarNavegar(); return true; }
        // Guardar SIN volver al listado (noNavegar); la navegación se decide después.
        return Promise.resolve(guardarCambiosMarc({ noNavegar: true })).then(function (ok) {
          // Si el guardado falló o quedó bloqueado, NO navegar.
          if (ok === false) return false;
          // Diferir la navegación hasta DESPUÉS de que abrirModal cierre este
          // modal. Si no, el cerrar() del modal pisa el modal/P&ID que abre
          // intentarNavegar() (el segundo modal quedaría oculto al instante).
          setTimeout(function () { intentarNavegar(); }, 0);
          return true;
        }).catch(function () { return false; });
      },
      { textoAceptar: 'Guardar y continuar', textoCancelar: 'Cancelar' }
    );
    return;
  }

  intentarNavegar();
}

// Guarda el destino de parpadeo y arranca el temporizador (~10 parpadeos
// cada 0.5s = 5s). Cada llamada corta el parpadeo anterior.
function _iniciarParpadeoDestino (parId) {
  hiperv._parpadeoToken++;
  const miToken = hiperv._parpadeoToken;
  hiperv._parpadeoParId = parId;
  setTimeout(function () {
    if (miToken !== hiperv._parpadeoToken) return; // lo cortó otro clic
    hiperv._parpadeoParId = null;
    dibujarHipervinculosCal();
  }, 5000);
}

// Igual que _iniciarParpadeoDestino pero para el visor de marcas.
function _iniciarParpadeoDestinoMarc (parId) {
  void parId;
  hipervMarc._parpadeoToken++;
  const miToken = hipervMarc._parpadeoToken;
  hipervMarc._parpadeoParId = parId;
  setTimeout(function () {
    if (miToken !== hipervMarc._parpadeoToken) return;
    hipervMarc._parpadeoParId = null;
    dibujarHipervinculosMarc();
  }, 5000);
}

// Selecciona/deselecciona un hipervínculo. NO hace parpadear: el parpadeo
// se dispara solo desde el listado (ver renderizarListaHipervinculos).
function seleccionarHipervinculo (id) {
  hiperv.seleccionado = (hiperv.seleccionado === id) ? null : id;
  dibujarHipervinculosCal();
  renderizarListaHipervinculos();
}

// Hace parpadear en el visor el rect correspondiente a un hipervínculo.
// Se usa al seleccionarlo desde el listado (no desde el canvas).
function _parpadearHipervinculoDeLista (id) {
  const h = hiperv.delPidActual.find(function (x) { return x.id === id; });
  if (!h) return;
  if (h.par_id != null) {
    _iniciarParpadeoDestino(h.par_id);
  } else {
    _parpadearRectIndividual(h);
  }
}

// Parpadeo puntual de un rect sin par_id: agrega la clase al div y la quita
// a los 5s (10 parpadeos de 0.5s), igual que el parpadeo por par_id.
function _parpadearRectIndividual (h) {
  const capa = $('capaHipervinculosCal');
  if (!capa) return;
  const divs = capa.querySelectorAll('.hipervinculoRect');
  // Re-render primero para asegurar que existen los divs.
  dibujarHipervinculosCal();
  const idx = hiperv.delPidActual.indexOf(h);
  if (idx < 0) return;
  const div = capa.querySelectorAll('.hipervinculoRect')[idx];
  if (!div) return;
  div.classList.add('parpadeando');
  hiperv._parpadeoToken++;
  const miToken = hiperv._parpadeoToken;
  setTimeout(function () {
    if (miToken !== hiperv._parpadeoToken) return;
    dibujarHipervinculosCal();
  }, 5000);
}


// ---------- lista lateral ----------
function renderizarListaHipervinculos () {
  const cont = $('listaHipervinculosCal');
  if (!cont) return;
  if (hiperv.delPidActual.length === 0) {
    cont.innerHTML = '<div style="font-size:11px;color:#777;">Sin hipervínculos.</div>';
    return;
  }
  const puede = hipervPuedeGestionar();
  const botonesAcciones = puede
    ? ('<button type="button" class="btnEditarHip" title="Editar destino">✎</button>' +
       '<button type="button" class="btnBorrarHip" title="Borrar (borra el par completo)">×</button>')
    : '';
  cont.innerHTML = hiperv.delPidActual.map(function (h) {
    const sel = (hiperv.seleccionado === h.id) ? ' seleccionada' : '';
    return '<div class="itemListaHipervinculo' + sel + '" data-id="' + h.id + '">' +
      '<span class="textoHipervinculo" title="' + escaparHTML(h.destino_pid_nombre + ' ' + h.destino_pid_hoja + ' Rev.' + h.destino_pid_revision) + '">' +
        escaparHTML(h.destino_pid_nombre) + ' <span class="hojaHip">(' + escaparHTML(h.destino_pid_hoja) + ') Rev.' + escaparHTML(String(h.destino_pid_revision)) + '</span>' +
      '</span>' +
      botonesAcciones +
    '</div>';
  }).join('');

  Array.prototype.forEach.call(cont.querySelectorAll('.itemListaHipervinculo'), function (el) {
    const id = parseInt(el.getAttribute('data-id'), 10);
    el.addEventListener('click', function (e) {
      if (e.target.closest('button')) return;
      const yaEra = (hiperv.seleccionado === id);
      seleccionarHipervinculo(id);
      // Parpadeo solo al SELECCIONAR desde el listado (no al deseleccionar
      // ni al seleccionar desde el canvas).
      if (!yaEra) _parpadearHipervinculoDeLista(id);
    });
    const btnEdit = el.querySelector('.btnEditarHip');
    if (btnEdit) btnEdit.addEventListener('click', function (e) {
      e.stopPropagation();
      const h = hiperv.delPidActual.find(function (x) { return x.id === id; });
      if (h) editarDestinoHipervinculo(h);
    });
    const btnDel = el.querySelector('.btnBorrarHip');
    if (btnDel) btnDel.addEventListener('click', function (e) {
      e.stopPropagation();
      borrarHipervinculo(id);
    });
  });
}

// ---------- modo dibujar ----------
// Activación desde el botón "+ Agregar hipervínculo".
// Bloquea si ya hay un flujo pendiente (para no pisarlo).
function activarModoHipervinculo () {
  if (!hipervPuedeGestionar()) { mostrarAviso('Requiere rol SuperUsuario o Admin para agregar hipervínculos.', true); return; }
  if (!cal || !cal.imagen) { mostrarAviso('No hay P&ID cargado.', true); return; }
  if (hiperv.pendiente) { mostrarAviso('Terminá de definir la zona receptora del hipervínculo en curso.', true); return; }
  _ponerModoDibujar();
}

// Cancela el flujo de creación de hipervínculo que esté a medias y limpia
// todo el estado asociado (pendiente, modo dibujar, rect en curso, arrastres).
// Opciones:
//   volverOrigen: si true y hay un origen guardado, vuelve a ese P&ID.
//   avisar:       si true, muestra el aviso 'Hipervínculo cancelado.'.
// Devuelve true si efectivamente había un flujo pendiente y se canceló.
function cancelarFlujoHipervinculo (opts) {
  opts = opts || {};
  const pend = hiperv.pendiente;
  const habia = !!pend || hiperv.modo === 'dibujar' || !!hiperv.rectEnCurso || hiperv.dibujando;
  if (!habia) return false;

  hiperv.pendiente = null;
  hiperv.modo = 'inactivo';
  hiperv.rectEnCurso = null;
  hiperv.dibujando = false;
  hiperv._accion = null;
  hiperv._accionH = null;
  hiperv._accionRectOriginal = null;
  hiperv._accionPuntoInicio = null;
  hiperv._accionPendienteGuardar = false;

  const lienzo = $('lienzoCal');
  if (lienzo) lienzo.classList.remove('modoHipervinculo');
  dibujarHipervinculosCal();

  if (opts.avisar) mostrarAviso('Hipervínculo cancelado.');

  if (opts.volverOrigen && pend && pend.origen) {
    abrirVisorCalibracion(pend.origen.pid, pend.origen.hoja, pend.origen.rev);
  }
  return true;
}

// Activa el modo dibujar SIN el guard de pendiente. Es el que usa el flujo
// interno (marcar zona receptora en el destino).
function _ponerModoDibujar () {
  hiperv.modo = 'dibujar';
  hiperv.rectEnCurso = null;
  hiperv.dibujando = false;
  const lienzo = $('lienzoCal');
  if (lienzo) lienzo.classList.add('modoHipervinculo');
}

function desactivarModoHipervinculo () {
  hiperv.modo = 'inactivo';
  hiperv.rectEnCurso = null;
  hiperv.dibujando = false;
  const lienzo = $('lienzoCal');
  if (lienzo) lienzo.classList.remove('modoHipervinculo');
  dibujarHipervinculosCal();
}

// Inicia una accion de arrastre (mover / redimensionar) sobre un hipervinculo.
function iniciarAccionHipervinculo (tipo, h, e) {
  e.preventDefault();
  e.stopPropagation();
  const p = pantallaAPixel(e.clientX, e.clientY);
  hiperv._accion = tipo;
  hiperv._accionH = h;
  hiperv._accionRectOriginal = { x: h.x, y: h.y, w: h.w, h: h.h };
  hiperv._accionPuntoInicio = { x: p.x, y: p.y };
  hiperv._accionMovido = false;
  hiperv._accionPendienteGuardar = false;
}

// Aplica el desplazamiento del mouse al hipervinculo en curso de arrastre.
function aplicarMovimientoHipervinculo (e) {
  if (!hiperv._accion || !hiperv._accionH) return;
  const h = hiperv._accionH;
  const orig = hiperv._accionRectOriginal;
  const p = pantallaAPixel(e.clientX, e.clientY);
  const dx = p.x - hiperv._accionPuntoInicio.x;
  const dy = p.y - hiperv._accionPuntoInicio.y;
  if (Math.abs(dx) > 2 || Math.abs(dy) > 2) hiperv._accionMovido = true;

  if (hiperv._accion === 'mover') {
    let nx = orig.x + dx;
    let ny = orig.y + dy;
    // Clamp dentro de la imagen.
    const maxX = (cal && cal.ancho ? cal.ancho : Infinity) - orig.w;
    const maxY = (cal && cal.alto ? cal.alto : Infinity) - orig.h;
    nx = Math.max(0, Math.min(maxX, nx));
    ny = Math.max(0, Math.min(maxY, ny));
    h.x = nx;
    h.y = ny;
  } else if (hiperv._accion === 'redimensionar') {
    let nw = Math.max(5, orig.w + dx);
    let nh = Math.max(5, orig.h + dy);
    const maxW = (cal && cal.ancho ? cal.ancho : Infinity) - orig.x;
    const maxH = (cal && cal.alto ? cal.alto : Infinity) - orig.y;
    nw = Math.min(maxW, nw);
    nh = Math.min(maxH, nh);
    h.w = nw;
    h.h = nh;
  }
  hiperv._accionPendienteGuardar = true;
  dibujarHipervinculosCal();
}

// Finaliza el arrastre y persiste el rect (con rollback si falla).
function finalizarAccionHipervinculo () {
  const h = hiperv._accionH;
  const movido = hiperv._accionMovido;
  const pend = hiperv._accionPendienteGuardar;
  const orig = hiperv._accionRectOriginal;
  hiperv._accion = null;
  hiperv._accionH = null;
  hiperv._accionRectOriginal = null;
  hiperv._accionPuntoInicio = null;
  hiperv._accionPendienteGuardar = false;
  if (!h || !movido || !pend) return;
  guardarRectHipervinculo(h, orig);
}

// PUT del rect. Si falla, revierte al rect original y avisa.
function guardarRectHipervinculo (h, rectOriginal) {
  return fetchAPI('/api/hipervinculos/' + h.id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ x: h.x, y: h.y, w: h.w, h: h.h })
  }).then(function (r) { return r.json(); }).then(function (d) {
    if (d && d.error) {
      if (rectOriginal) { h.x = rectOriginal.x; h.y = rectOriginal.y; h.w = rectOriginal.w; h.h = rectOriginal.h; }
      dibujarHipervinculosCal();
      mostrarAviso(d.error, true);
    }
  }).catch(function (e) {
    if (rectOriginal) { h.x = rectOriginal.x; h.y = rectOriginal.y; h.w = rectOriginal.w; h.h = rectOriginal.h; }
    dibujarHipervinculosCal();
    mostrarAviso('Error al guardar: ' + e.message, true);
  });
}

// Mueve el hipervinculo seleccionado con las flechas (1px / 10px con Shift).
function moverSeleccionadoConTeclas (dx, dy) {
  const h = hiperv.delPidActual.find(function (x) { return x.id === hiperv.seleccionado; });
  if (!h) return;
  const rectOrig = { x: h.x, y: h.y, w: h.w, h: h.h };
  let nx = h.x + dx;
  let ny = h.y + dy;
  const maxX = (cal && cal.ancho ? cal.ancho : Infinity) - h.w;
  const maxY = (cal && cal.alto ? cal.alto : Infinity) - h.h;
  nx = Math.max(0, Math.min(maxX, nx));
  ny = Math.max(0, Math.min(maxY, ny));
  if (nx === h.x && ny === h.y) return;
  h.x = nx;
  h.y = ny;
  dibujarHipervinculosCal();
  // Debounce: un solo PUT al terminar de moverse.
  clearTimeout(hiperv._debounceGuardarId);
  hiperv._debounceGuardarId = setTimeout(function () {
    guardarRectHipervinculo(h, rectOrig);
  }, 400);
}

// Enganche de eventos del lienzo (se llama desde engancharEventosCalibracion).
function engancharEventosHipervinculosCal () {
  const lienzo = $('lienzoCal');
  if (!lienzo || lienzo._hipEnganchado) return;
  lienzo._hipEnganchado = true;

  lienzo.addEventListener('mousedown', function (e) {
    if (hiperv.modo !== 'dibujar' || e.button !== 0) return;
    const p = pantallaAPixel(e.clientX, e.clientY);
    hiperv.dibujando = true;
    hiperv.rectEnCurso = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    e.preventDefault();
    e.stopPropagation();
  }, true);

  // Clic en el fondo del lienzo (fuera de un rect): deseleccionar.
  lienzo.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    if (hiperv.modo === 'dibujar') return;
    if (e.target.closest('.hipervinculoRect, .tiradorHipervinculo')) return;
    if (hiperv.seleccionado !== null) {
      hiperv.seleccionado = null;
      dibujarHipervinculosCal();
      renderizarListaHipervinculos();
    }
  });

  document.addEventListener('mousemove', function (e) {
    if (hiperv._accion) { aplicarMovimientoHipervinculo(e); return; }
    if (!hiperv.dibujando || !hiperv.rectEnCurso) return;
    const p = pantallaAPixel(e.clientX, e.clientY);
    hiperv.rectEnCurso.x1 = p.x;
    hiperv.rectEnCurso.y1 = p.y;
    dibujarHipervinculosCal();
  });

  document.addEventListener('mouseup', function (e) {
    if (hiperv._accion) { finalizarAccionHipervinculo(); return; }
    if (!hiperv.dibujando || !hiperv.rectEnCurso) return;
    hiperv.dibujando = false;
    const r = hiperv.rectEnCurso;
    const x = Math.min(r.x0, r.x1), y = Math.min(r.y0, r.y1);
    const w = Math.abs(r.x1 - r.x0), h = Math.abs(r.y1 - r.y0);
    hiperv.rectEnCurso = null;
    if (w < 5 || h < 5) {
      dibujarHipervinculosCal();
      mostrarAviso('El rectángulo es demasiado pequeño.', true);
      return;
    }

    if (hiperv.pendiente) {
      // Estamos marcando la zona receptora en el P&ID destino.
      finalizarZonaReceptora({ x: x, y: y, w: w, h: h });
    } else {
      // Zona en el origen: elegir destino.
      abrirModalDestinoHipervinculo({ x: x, y: y, w: w, h: h });
    }
  });

  // Teclado: flechas mueven el seleccionado; Escape deselecciona.
  // Se engancha en CAPTURA para correr antes que el keydown de burbuja de
  // visorMarcadoEventos.js (que mueve el cursor virtual y hace preventDefault
  // con las flechas). Con un hipervínculo seleccionado cortamos la flecha
  // (stopImmediatePropagation) para que NO se mueva también el cursor virtual.
  if (!hiperv._hipervKeyEnganchado) {
    hiperv._hipervKeyEnganchado = true;
    document.addEventListener('keydown', function (e) {
      // La pantalla se muestra con style.display (no usa clase 'activa').
      const pantallaCal = $('pantallaCalibracion');
      if (!pantallaCal || pantallaCal.style.display === 'none') return;
      const tagK = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
      const enInputK = (tagK === 'input' || tagK === 'textarea' || tagK === 'select' || (e.target && e.target.isContentEditable));

      // Escape: si hay un flujo de hipervínculo a medias, lo cancela (vuelve
      // al origen y avisa) incluso si no hay un rect seleccionado.
      if (e.key === 'Escape' && !enInputK && hiperv.pendiente) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        cancelarFlujoHipervinculo({ volverOrigen: true, avisar: true });
        return;
      }

      if (hiperv.seleccionado === null || hiperv.seleccionado === undefined) return;
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.target && e.target.isContentEditable) return;

      // Supr: borra el hipervínculo seleccionado (pide confirmación y, si
      // es parte de un par, borra también el link inverso).
      if (e.key === 'Delete') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        borrarHipervinculo(hiperv.seleccionado);
        return;
      }

      if (e.key === 'Escape') {
        hiperv.seleccionado = null;
        dibujarHipervinculosCal();
        renderizarListaHipervinculos();
        return;
      }
      if (!hipervPuedeGestionar()) return;
      const paso = e.shiftKey ? 10 : 1;
      let dx = 0, dy = 0;
      if (e.key === 'ArrowLeft') dx = -paso;
      else if (e.key === 'ArrowRight') dx = paso;
      else if (e.key === 'ArrowUp') dy = -paso;
      else if (e.key === 'ArrowDown') dy = paso;
      else return;
      // Mover el hipervínculo y consumir la flecha (no mover el cursor virtual).
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      moverSeleccionadoConTeclas(dx, dy);
    }, true);
  }
}

// ---------- modal destino (con filtro) ----------
function cargarPidsCalibrados (forzar) {
  if (hiperv._pidsCalibradosCache && !forzar) return Promise.resolve(hiperv._pidsCalibradosCache);
  return fetchAPI('/api/pid')
    .then(function (r) { return r.json(); })
    .then(function (d) {
      const calibrados = (d.pids || []).filter(function (p) { return p.calibrado; });
      hiperv._pidsCalibradosCache = calibrados;
      return calibrados;
    });
}

// Construye el HTML interno del selector de destino con filtro.
function _htmlSelectorDestino (pids, idFiltro, idLista) {
  if (!pids || pids.length === 0) return '<p>No hay P&IDs calibrados.</p>';
  const filas = pids.map(function (p, i) {
    const hojaTxt = formatearHoja(p.hojaTexto || p.hoja);
    const texto = (p.pid + ' ' + hojaTxt + ' rev.' + p.revision).toLowerCase();
    return '<div class="hipOpcionDestino" data-idx="' + i + '" data-texto="' + escaparHTML(texto) + '">' +
      escaparHTML(p.pid) + ' <span class="hojaHip">(' + escaparHTML(hojaTxt) + ') Rev.' + escaparHTML(String(p.revision)) + '</span>' +
    '</div>';
  }).join('');
  return '<input type="text" id="' + idFiltro + '" placeholder="Filtrar P&ID..." style="width:100%;margin-bottom:8px;">' +
    '<div id="' + idLista + '" class="hipListaDestino">' + filas + '</div>';
}

// Engancha el filtro + selección del listado del modal. Devuelve un getter
// de la selección actual (índice en pids o null).
function _engancharSelectorDestino (pids, idFiltro, idLista, seleccionInicial) {
  const filtro = $(idFiltro);
  const lista = $(idLista);
  let seleccion = (seleccionInicial !== undefined) ? seleccionInicial : null;

  function marcarSeleccion() {
    Array.prototype.forEach.call(lista.querySelectorAll('.hipOpcionDestino'), function (el) {
      const idx = parseInt(el.getAttribute('data-idx'), 10);
      el.classList.toggle('seleccionada', idx === seleccion);
    });
  }

  if (filtro) {
    filtro.addEventListener('input', function () {
      const q = filtro.value.trim().toLowerCase();
      Array.prototype.forEach.call(lista.querySelectorAll('.hipOpcionDestino'), function (el) {
        const txt = el.getAttribute('data-texto') || '';
        el.style.display = (!q || txt.indexOf(q) !== -1) ? '' : 'none';
      });
    });
    setTimeout(function () { filtro.focus(); }, 40);
  }

  if (lista) {
    lista.addEventListener('click', function (e) {
      const el = e.target.closest('.hipOpcionDestino');
      if (!el) return;
      seleccion = parseInt(el.getAttribute('data-idx'), 10);
      marcarSeleccion();
    });
    // Doble clic: selecciona y avanza (equivale a Aceptar / Siguiente).
    lista.addEventListener('dblclick', function (e) {
      const el = e.target.closest('.hipOpcionDestino');
      if (!el) return;
      e.preventDefault();
      seleccion = parseInt(el.getAttribute('data-idx'), 10);
      marcarSeleccion();
      const btn = $('modalAceptar');
      if (btn && btn.style.display !== 'none') btn.click();
    });
    marcarSeleccion();
  }

  return function () { return seleccion; };
}

function abrirModalDestinoHipervinculo (rect) {
  // forzar=true: recalcular la lista. Si no, el cache en memoria deja afuera
  // los P&ID cargados/calibrados despues de la primera apertura del modal.
  cargarPidsCalibrados(true).then(function (pids) {
    if (!pids || pids.length === 0) {
      mostrarAviso('No hay P&IDs calibrados para elegir como destino.', true);
      desactivarModoHipervinculo();
      return;
    }
    const html =
      '<p style="margin-top:0;">Elegí el P&amp;ID de destino para la zona seleccionada:</p>' +
      _htmlSelectorDestino(pids, 'hipFiltroDestino', 'hipListaDestino');

    let getSel = null;
    abrirModal('Nuevo hipervínculo — elegir destino', html, function () {
      const idx = getSel ? getSel() : null;
      if (idx === null || idx === undefined) { mostrarAviso('Seleccioná un P&ID destino.', true); return false; }
      const destino = pids[idx];
      if (!destino) return false;
      // Guardar pendiente y abrir el P&ID destino para marcar la zona receptora.
      hiperv.pendiente = {
        origen: { pid: hiperv._pid, hoja: hiperv._hoja, rev: hiperv._rev, rect: rect },
        destino: {
          pid: destino.pid,
          hoja: formatearHoja(destino.hojaTexto || destino.hoja),
          rev: String(destino.revision)
        }
      };
      desactivarModoHipervinculo();
      // Cargar el destino en el visor y activar modo dibujar cuando la
      // imagen esté lista (abrirVisorCalibracion es asíncrono).
      abrirVisorCalibracion(destino.pid, formatearHoja(destino.hojaTexto || destino.hoja), String(destino.revision));
      esperarImagenCalYActivar(0);
      return true;
    }, { textoAceptar: 'Siguiente' });

    getSel = _engancharSelectorDestino(pids, 'hipFiltroDestino', 'hipListaDestino', null);
  }).catch(function (e) {
    mostrarAviso('Error al cargar P&IDs: ' + e.message, true);
    desactivarModoHipervinculo();
  });
}

// Espera (poll) a que cal.imagen del P&ID destino esté cargada y recién
// ahí activa el modo dibujar para marcar la zona receptora.
function esperarImagenCalYActivar (intentos) {
  intentos = intentos || 0;
  if (!hiperv.pendiente) return;
  if (cal && cal.imagen && cal.pid === hiperv.pendiente.destino.pid &&
      formatearHoja(cal.hoja) === hiperv.pendiente.destino.hoja) {
    _ponerModoDibujar();
    mostrarAviso('Dibujá la zona donde se recibe el hipervínculo en ' + hiperv.pendiente.destino.pid + '.');
    return;
  }
  if (intentos > 40) { // ~4s como máximo
    mostrarAviso('No se pudo cargar el P&ID destino para marcar la zona.', true);
    return;
  }
  setTimeout(function () { esperarImagenCalYActivar(intentos + 1); }, 100);
}

// ---------- crear par ----------
function finalizarZonaReceptora (rectReceptor) {
  const pend = hiperv.pendiente;
  if (!pend) return;
  const body = {
    origen: {
      pid_nombre: pend.origen.pid,
      pid_hoja: pend.origen.hoja,
      pid_revision: pend.origen.rev,
      x: pend.origen.rect.x, y: pend.origen.rect.y,
      w: pend.origen.rect.w, h: pend.origen.rect.h
    },
    destino: {
      pid_nombre: pend.destino.pid,
      pid_hoja: pend.destino.hoja,
      pid_revision: pend.destino.rev
    },
    receptor: { x: rectReceptor.x, y: rectReceptor.y, w: rectReceptor.w, h: rectReceptor.h }
  };

  fetchAPI('/api/hipervinculos/par', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(function (r) { return r.json(); }).then(function (d) {
    if (d && d.error) { mostrarAviso(d.error, true); return; }
    const origenPid = pend.origen.pid, origenHoja = pend.origen.hoja, origenRev = pend.origen.rev;
    hiperv.pendiente = null;
    desactivarModoHipervinculo();
    mostrarAviso('Hipervínculo creado en ambos sentidos.');
    // Volver al P&ID origen.
    abrirVisorCalibracion(origenPid, origenHoja, origenRev);
  }).catch(function (e) {
    mostrarAviso('Error al crear el hipervínculo: ' + e.message, true);
  });
}

// ---------- editar destino ----------
function editarDestinoHipervinculo (h) {
  if (!hipervPuedeGestionar()) { mostrarAviso('Requiere rol SuperUsuario o Admin.', true); return; }
  cargarPidsCalibrados(true).then(function (pids) {
    if (!pids || pids.length === 0) { mostrarAviso('No hay P&IDs calibrados.', true); return; }

    // Preseleccionar el destino actual, si está entre los calibrados.
    let selInicial = null;
    pids.forEach(function (p, i) {
      if (String(p.pid) === String(h.destino_pid_nombre) &&
          formatearHoja(p.hojaTexto || p.hoja) === h.destino_pid_hoja &&
          String(p.revision) === String(h.destino_pid_revision)) selInicial = i;
    });

    const html =
      '<p style="margin-top:0;">Nuevo destino para el hipervínculo:</p>' +
      '<p style="color:#888;font-size:11px;">Nota: cambiar el destino aquí solo actualiza este lado. El link inverso conserva el suyo.</p>' +
      _htmlSelectorDestino(pids, 'hipFiltroEdit', 'hipListaEdit');

    let getSel = null;
    abrirModal('Editar hipervínculo', html, function () {
      const idx = getSel ? getSel() : null;
      if (idx === null || idx === undefined) { mostrarAviso('Seleccioná un P&ID destino.', true); return false; }
      const destino = pids[idx];
      if (!destino) return false;
      fetchAPI('/api/hipervinculos/' + h.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destino_pid_nombre: destino.pid,
          destino_pid_hoja: formatearHoja(destino.hojaTexto || destino.hoja),
          destino_pid_revision: String(destino.revision)
        })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d && d.error) { mostrarAviso(d.error, true); return false; }
        const idxArr = hiperv.delPidActual.findIndex(function (x) { return x.id === h.id; });
        if (idxArr !== -1) hiperv.delPidActual[idxArr] = d;
        mostrarAviso('Hipervínculo actualizado.');
        dibujarHipervinculosCal();
        renderizarListaHipervinculos();
        return true;
      }).catch(function (e) {
        mostrarAviso('Error al editar: ' + e.message, true);
        return false;
      });
    }, { textoAceptar: 'Guardar' });

    getSel = _engancharSelectorDestino(pids, 'hipFiltroEdit', 'hipListaEdit', selInicial);
  });
}

// ---------- borrar (borra el par completo en el backend) ----------
function borrarHipervinculo (id) {
  if (!hipervPuedeGestionar()) { mostrarAviso('Requiere rol SuperUsuario o Admin.', true); return; }
  abrirModal('Borrar hipervínculo',
    '<p>¿Seguro que querés borrar este hipervínculo?</p>' +
    '<p style="color:#888;font-size:12px;">Si forma parte de un par, también se borra el link inverso en el otro P&ID.</p>',
    function () {
      fetchAPI('/api/hipervinculos/' + id, { method: 'DELETE' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.error) { mostrarAviso(d.error, true); return; }
          // Quitar de la lista actual los que ya no existen (por si borró el par).
          const borrada = hiperv.delPidActual.find(function (x) { return x.id === id; });
          const parId = borrada ? borrada.par_id : null;
          hiperv.delPidActual = hiperv.delPidActual.filter(function (x) {
            if (parId && x.par_id === parId) return false;
            return x.id !== id;
          });
          if (hiperv.seleccionado === id) hiperv.seleccionado = null;
          mostrarAviso('Hipervínculo borrado.');
          dibujarHipervinculosCal();
          renderizarListaHipervinculos();
        })
        .catch(function (e) { mostrarAviso('Error al borrar: ' + e.message, true); });
    },
    { textoAceptar: 'Borrar' });
}
