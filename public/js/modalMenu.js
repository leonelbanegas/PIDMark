// ================================================================
// Modal genérico y menú contextual
// ================================================================

let menuCtxAbierto = false;

// ============ Menú contextual ============
function abrirMenuContextual(clientX, clientY, opciones) {
  const menu = $('menuContextual');
  if (!menu) return;

  menu.innerHTML = '';

  opciones.forEach(function (op) {
    if (op.separador) {
      const sep = document.createElement('div');
      sep.className = 'menuSeparador';
      menu.appendChild(sep);
      return;
    }

    const div = document.createElement('div');
    div.className = 'menuOpcion' + (op.deshabilitada ? ' deshabilitada' : '') +
                    (op.peligro ? ' peligro' : '');
    div.textContent = op.texto;

    if (!op.deshabilitada) {
      div.addEventListener('click', function (e) {
        e.stopPropagation();
        cerrarMenuContextual();
        if (typeof op.accion === 'function') op.accion();
      });
    }

    menu.appendChild(div);
  });

  menu.style.display = 'block';
  menu.style.left = '0px';
  menu.style.top = '0px';

  const rect = menu.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let x = clientX;
  let y = clientY;

  if (x + w > vw - 4) x = vw - w - 4;
  if (y + h > vh - 4) y = vh - h - 4;
  if (x < 4) x = 4;
  if (y < 4) y = 4;

  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  menuCtxAbierto = true;
}

function cerrarMenuContextual() {
  const menu = $('menuContextual');
  if (!menu) return;
  menu.style.display = 'none';
  menu.innerHTML = '';
  menuCtxAbierto = false;
}

function engancharCierreMenuContextual() {
  document.addEventListener('mousedown', function (e) {
    if (!menuCtxAbierto) return;
    const menu = $('menuContextual');
    if (menu && menu.contains(e.target)) return;
    cerrarMenuContextual();
  });

  document.addEventListener('keydown', function (e) {
    if (!menuCtxAbierto) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cerrarMenuContextual();
    }
  }, true);

  window.addEventListener('resize', function () {
    if (menuCtxAbierto) cerrarMenuContextual();
  });
  window.addEventListener('scroll', function () {
    if (menuCtxAbierto) cerrarMenuContextual();
  }, true);
}

function abrirMenuDesdeBoton(btn, opciones) {
  const rect = btn.getBoundingClientRect();
  abrirMenuContextual(rect.right - 170, rect.bottom + 4, opciones);
}

// Quita 'cursorOculto' (cursor:none) de TODOS los lienzos de los visores.
// Se usa al abrir cualquier modal o vista previa: si el mouse estaba sobre el
// lienzo, el cursor del sistema quedaba oculto en esa zona.
function limpiarCursorOculto() {
  const lienzos = document.querySelectorAll('.lienzoCal.cursorOculto');
  Array.prototype.forEach.call(lienzos, function (lz) {
    lz.classList.remove('cursorOculto');
  });
}

// ============ Modal genérico ============
function abrirModal(titulo, contenidoHTML, alAceptar, opciones) {
  opciones = opciones || {};
  $('modalTitulo').textContent = titulo;
  $('modalCuerpo').innerHTML = contenidoHTML;
  $('modalFondo').style.display = 'flex';

  // Si venimos del visor, el lienzo puede tener 'cursorOculto' (cursor:none).
  // Al abrir un modal el puntero tiene que verse SIEMPRE: se lo quitamos.
  limpiarCursorOculto();

  const caja = $('modalCaja');
  if (caja) {
    if (opciones.grande) caja.classList.add('modalCajaGrande');
    else caja.classList.remove('modalCajaGrande');
    // Resetear posición (por si un modal anterior se arrastró).
    caja.style.position = '';
    caja.style.left = '';
    caja.style.top = '';
    caja.style.margin = '';
  }
  _engancharArrastreModal();

  const aceptar = $('modalAceptar');
  const cancelar = $('modalCancelar');

  if (opciones.textoAceptar) aceptar.textContent = opciones.textoAceptar;
  else aceptar.textContent = 'Aceptar';

  if (opciones.ocultarAceptar) aceptar.style.display = 'none';
  else aceptar.style.display = '';

  // sinCancelar: oculta el botón Cancelar y bloquea Escape (modal obligatorio).
  // ocultarCancelar: oculta el botón Cancelar pero deja funcionar Escape.
  if (opciones.sinCancelar || opciones.ocultarCancelar) cancelar.style.display = 'none';
  else cancelar.style.display = '';

  let alCerrarCb = null;

  function cerrar() {
    $('modalFondo').style.display = 'none';
    aceptar.onclick = null;
    cancelar.onclick = null;
    aceptar.style.display = '';
    cancelar.style.display = '';
    if (caja) caja.classList.remove('modalCajaGrande');
    document.removeEventListener('keydown', onKey, true);
    if (typeof alCerrarCb === 'function') {
      try { alCerrarCb(); } catch (e) { console.error(e); }
    }
  }

  function onKey(e) {
    if ($('modalFondo').style.display === 'none') return;
    if (vistaPrevia.visible) return;

    const activo = document.activeElement;
    const tagActivo = activo && activo.tagName ? activo.tagName.toUpperCase() : '';
    const esTextarea = tagActivo === 'TEXTAREA';

    if (esTextarea && (e.key === 'Enter' || e.key === 'Escape')) {
      return;
    }

    if (e.key === 'Enter' && tagActivo === 'BUTTON') return;

    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      aceptar.click();
    } else if (e.key === 'Escape') {
      if (opciones.sinCancelar) { e.preventDefault(); e.stopPropagation(); return; }
      e.preventDefault();
      e.stopPropagation();
      // Si el botón Cancelar está oculto (ocultarCancelar), cerramos directo.
      if (opciones.ocultarCancelar) cerrar();
      else cancelar.click();
    }
  }

  document.addEventListener('keydown', onKey, true);

  cancelar.onclick = cerrar;
  aceptar.onclick = async function () {
    if (!alAceptar) { cerrar(); return; }
    // El callback puede ser async: esperamos su resultado real. Si devuelve
    // false (validacion fallida, error de red, etc.) NO se cierra el modal.
    let seguir;
    try {
      seguir = await alAceptar();
    } catch (e) {
      console.error(e);
      seguir = false;
    }
    if (seguir !== false) cerrar();
  };

  return {
    cerrar: cerrar,
    alCerrar: function (cb) { alCerrarCb = cb; }
  };
}

// Hace que #modalCaja se pueda arrastrar agarrándola desde #modalTitulo.
// Se engancha una sola vez; el estado de arrastre es por gesto.
function _engancharArrastreModal() {
  const caja = $('modalCaja');
  const titulo = $('modalTitulo');
  if (!caja || !titulo || titulo._dragEnganchado) return;
  titulo._dragEnganchado = true;
  titulo.style.cursor = 'move';
  titulo.style.userSelect = 'none';

  let arrastrando = false;
  let iniX = 0, iniY = 0, baseLeft = 0, baseTop = 0;

  titulo.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    // Si el modal está centrado por flex, pasar a posicionamiento absoluto.
    const rect = caja.getBoundingClientRect();
    const fondoRect = $('modalFondo').getBoundingClientRect();
    caja.style.position = 'absolute';
    caja.style.margin = '0';
    baseLeft = rect.left - fondoRect.left;
    baseTop = rect.top - fondoRect.top;
    caja.style.left = baseLeft + 'px';
    caja.style.top = baseTop + 'px';
    iniX = e.clientX;
    iniY = e.clientY;
    arrastrando = true;
    e.preventDefault();
  });

  document.addEventListener('mousemove', function (e) {
    if (!arrastrando) return;
    const dx = e.clientX - iniX;
    const dy = e.clientY - iniY;
    let nl = baseLeft + dx;
    let nt = baseTop + dy;
    // Clampear para que no se vaya fuera de la ventana.
    const w = caja.offsetWidth, h = caja.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    if (nl < 0) nl = 0;
    if (nt < 0) nt = 0;
    if (nl + w > vw) nl = vw - w;
    if (nt + h > vh) nt = vh - h;
    caja.style.left = nl + 'px';
    caja.style.top = nt + 'px';
  });

  document.addEventListener('mouseup', function () {
    if (arrastrando) arrastrando = false;
  });
}