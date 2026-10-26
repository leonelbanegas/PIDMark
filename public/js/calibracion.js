// ================================================================
// Calibración + vista previa de P&ID
// ================================================================
// Contiene:
//   - Vista previa a pantalla completa (modal "+ Agregar P&ID").
//   - Visor de calibración (marcar puntos 0,0 y 100,100).
//   - Lupa del visor de calibración.
//
// Depende de variables globales: cal, pids, sesion, vistaPrevia.

// Cursor "lupa simple" SIN signo (ni + ni -) para la vista previa de P&ID.
// CSS no tiene una lupa sin signo nativa, asi que usamos un SVG inline
// (circulo + mango) codificado como data URI. El hotspot (13 13) cae justo
// en el centro de la lente.
var CURSOR_LUPA_SIMPLE_VP =
  'url("data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' +
      '<circle cx="13" cy="13" r="8" fill="none" stroke="black" stroke-width="2"/>' +
      '<circle cx="13" cy="13" r="8" fill="none" stroke="white" stroke-width="1"/>' +
      '<line x1="19" y1="19" x2="28" y2="28" stroke="black" stroke-width="4" stroke-linecap="round"/>' +
      '<line x1="19" y1="19" x2="28" y2="28" stroke="white" stroke-width="2" stroke-linecap="round"/>' +
    '</svg>'
  ) +
  '") 13 13, default';

// Cursor de arrastre: mano CERRADA (agarrando). Se usa como SVG para
// asegurar que el navegador lo muestre durante el arrastre (el cursor
// nativo 'grabbing' a veces no se repinta sobre la imagen). Hotspot 16 16.
var CURSOR_AGARRE_VP =
  'url("data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' +
      '<path d="M11 15V8a2 2 0 0 1 4 0v5V6a2 2 0 0 1 4 0v7V7a2 2 0 0 1 4 0v10.5c0 5-3.5 8.5-8 8.5s-7-2.2-9-5.5l-2.2-3.6a2 2 0 0 1 3.3-2.2L11 17" ' +
        'fill="white" stroke="black" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>' +
    '</svg>'
  ) +
  '") 16 16, grabbing';

// ================================================================
// VISTA PREVIA A PANTALLA COMPLETA DE UN P&ID
// ================================================================

function abrirVistaPreviaPID(pid, hoja, rev) {
  const fondo = $('vistaPreviaFondo');
  const img = $('vistaPreviaImagen');
  const msg = $('vistaPreviaMensaje');
  if (!fondo || !img || !msg) return;

  // Si el mouse venia sobre un lienzo del visor (cursor:none), se quita para
  // que el puntero del sistema se vea mientras la vista previa esta abierta.
  if (typeof limpiarCursorOculto === 'function') limpiarCursorOculto();

  vistaPrevia.visible = true;
  vistaPrevia.imagen = null;
  vistaPrevia.ancho = 0;
  vistaPrevia.alto = 0;
  vistaPrevia.zoom = 1;
  vistaPrevia.zoomMin = 0.02;
  vistaPrevia.zoomMax = 20;
  vistaPrevia.offsetX = 0;
  vistaPrevia.offsetY = 0;
  vistaPrevia.arrastrando = false;
  vistaPrevia.arrastreIni = null;
  vistaPrevia.arrastreOffset = null;
  vistaPrevia.acumuladorWheel = 0;
  vistaPrevia.mousedownEn = null;
  vistaPrevia.movido = false;

  msg.style.display = 'none';
  img.style.display = 'block';
  img.style.transform = '';
  img.style.transformOrigin = '0 0';
  img.style.position = 'absolute';
  img.style.left = '0';
  img.style.top = '0';
  img.style.maxWidth = 'none';
  img.style.maxHeight = 'none';
  img.style.cursor = CURSOR_LUPA_SIMPLE_VP;

  fondo.style.display = 'block';
  fondo.style.overflow = 'hidden';
  fondo.style.cursor = CURSOR_LUPA_SIMPLE_VP;

  img.onload = function () {
    vistaPrevia.imagen = img;
    vistaPrevia.ancho = img.naturalWidth;
    vistaPrevia.alto = img.naturalHeight;

    ajustarVistaPreviaAPantalla();
    dibujarVistaPrevia();
  };
  img.onerror = function () {
    img.style.display = 'none';
    msg.style.display = 'block';
  };
  img.src = '/api/pid/' + encodeURIComponent(pid) + '/' + encodeURIComponent(hoja) + '/' + encodeURIComponent(rev) + '/imagen';
}

function ajustarVistaPreviaAPantalla() {
  const fondo = $('vistaPreviaFondo');
  if (!fondo || !vistaPrevia.imagen) return;

  const w = fondo.clientWidth;
  const h = fondo.clientHeight;
  const escalaX = w / vistaPrevia.ancho;
  const escalaY = h / vistaPrevia.alto;

  vistaPrevia.zoomMin = Math.min(escalaX, escalaY);
  vistaPrevia.zoomMax = 20;
  vistaPrevia.zoom = vistaPrevia.zoomMin;

  vistaPrevia.offsetX = (w - vistaPrevia.ancho * vistaPrevia.zoom) / 2;
  vistaPrevia.offsetY = (h - vistaPrevia.alto * vistaPrevia.zoom) / 2;

  clampearVistaPrevia();
}

function clampearVistaPrevia() {
  const fondo = $('vistaPreviaFondo');
  if (!fondo) return;

  const w = fondo.clientWidth;
  const h = fondo.clientHeight;

  if (vistaPrevia.zoom < vistaPrevia.zoomMin) vistaPrevia.zoom = vistaPrevia.zoomMin;
  if (vistaPrevia.zoom > vistaPrevia.zoomMax) vistaPrevia.zoom = vistaPrevia.zoomMax;

  const anchoVisible = vistaPrevia.ancho * vistaPrevia.zoom;
  const altoVisible = vistaPrevia.alto * vistaPrevia.zoom;

  if (anchoVisible <= w) {
    vistaPrevia.offsetX = (w - anchoVisible) / 2;
  } else {
    const minX = w - anchoVisible;
    const maxX = 0;
    if (vistaPrevia.offsetX < minX) vistaPrevia.offsetX = minX;
    if (vistaPrevia.offsetX > maxX) vistaPrevia.offsetX = maxX;
  }

  if (altoVisible <= h) {
    vistaPrevia.offsetY = (h - altoVisible) / 2;
  } else {
    const minY = h - altoVisible;
    const maxY = 0;
    if (vistaPrevia.offsetY < minY) vistaPrevia.offsetY = minY;
    if (vistaPrevia.offsetY > maxY) vistaPrevia.offsetY = maxY;
  }
}

function dibujarVistaPrevia() {
  const img = $('vistaPreviaImagen');
  if (!img || !vistaPrevia.imagen) return;

  const t = 'translate(' + vistaPrevia.offsetX + 'px,' + vistaPrevia.offsetY +
            'px) scale(' + vistaPrevia.zoom + ')';
  img.style.transform = t;
}

function pantallaAPixelVistaPrevia(clientX, clientY) {
  const fondo = $('vistaPreviaFondo');
  if (!fondo) return { x: 0, y: 0 };
  const rect = fondo.getBoundingClientRect();
  const x = (clientX - rect.left - vistaPrevia.offsetX) / vistaPrevia.zoom;
  const y = (clientY - rect.top - vistaPrevia.offsetY) / vistaPrevia.zoom;
  return { x: x, y: y };
}

// true si el punto cae dentro del area visible de la imagen (ya escalada
// y desplazada). Fuera de ella el cursor tiene que ser el normal.
function puntoSobreImagenVistaPrevia(clientX, clientY) {
  const fondo = $('vistaPreviaFondo');
  if (!fondo || !vistaPrevia.imagen) return false;
  const r = fondo.getBoundingClientRect();
  const izq = r.left + vistaPrevia.offsetX;
  const arr = r.top + vistaPrevia.offsetY;
  const der = izq + vistaPrevia.ancho * vistaPrevia.zoom;
  const aba = arr + vistaPrevia.alto * vistaPrevia.zoom;
  const tol = 2;
  return clientX >= izq + tol && clientX <= der - tol &&
         clientY >= arr + tol && clientY <= aba - tol;
}

function cerrarVistaPreviaPID() {
  const fondo = $('vistaPreviaFondo');
  const img = $('vistaPreviaImagen');
  if (!fondo) return;
  vistaPrevia.visible = false;
  vistaPrevia.arrastrando = false;
  fondo.style.display = 'none';
  if (img) img.src = '';

  // Quitar el foco del elemento activo (p.ej. el boton "Ver" que abrio la
  // vista previa) para que no quede resaltado al volver con Escape.
  const ae = document.activeElement;
  if (ae && typeof ae.blur === 'function' && ae !== document.body) {
    ae.blur();
  }
}

function engancharEventosVistaPrevia() {
  const fondo = $('vistaPreviaFondo');
  if (!fondo) return;

  fondo.addEventListener('wheel', function (e) {
    if (!vistaPrevia.visible) return;
    if (!vistaPrevia.imagen) return;
    e.preventDefault();

    vistaPrevia.acumuladorWheel += e.deltaY;
    if (Math.abs(vistaPrevia.acumuladorWheel) < 100) return;

    const direccion = vistaPrevia.acumuladorWheel > 0 ? -1 : 1;
    vistaPrevia.acumuladorWheel = 0;
    const factor = direccion > 0 ? 1.25 : 1 / 1.25;

    const antes = pantallaAPixelVistaPrevia(e.clientX, e.clientY);
    vistaPrevia.zoom = Math.max(vistaPrevia.zoomMin,
                       Math.min(vistaPrevia.zoomMax, vistaPrevia.zoom * factor));

    const rect = fondo.getBoundingClientRect();
    vistaPrevia.offsetX = (e.clientX - rect.left) - antes.x * vistaPrevia.zoom;
    vistaPrevia.offsetY = (e.clientY - rect.top) - antes.y * vistaPrevia.zoom;

    clampearVistaPrevia();
    dibujarVistaPrevia();
  }, { passive: false });

  fondo.addEventListener('mousedown', function (e) {
    if (!vistaPrevia.visible) return;

    if (e.button === 1) {
      if (!vistaPrevia.imagen) return;
      e.preventDefault();
      vistaPrevia.arrastrando = true;
      vistaPrevia.arrastreIni = { x: e.clientX, y: e.clientY };
      vistaPrevia.arrastreOffset = { x: vistaPrevia.offsetX, y: vistaPrevia.offsetY };
      // Mano con flechas en 4 direcciones mientras se arrastra.
      fondo.style.cursor = CURSOR_AGARRE_VP;
      const imgEl = $('vistaPreviaImagen');
      if (imgEl) imgEl.style.cursor = CURSOR_AGARRE_VP;
      return;
    }

    if (e.button === 0) {
      vistaPrevia.mousedownEn = { x: e.clientX, y: e.clientY };
      vistaPrevia.movido = false;
    }
  });

  document.addEventListener('mousemove', function (e) {
    if (!vistaPrevia.visible) return;

    // Cursor: lupa sobre la imagen, normal fuera de ella.
    if (!vistaPrevia.arrastrando) {
      const cursor = puntoSobreImagenVistaPrevia(e.clientX, e.clientY)
        ? CURSOR_LUPA_SIMPLE_VP
        : 'default';
      if (fondo.style.cursor !== cursor) fondo.style.cursor = cursor;
      const imgEl = $('vistaPreviaImagen');
      if (imgEl && imgEl.style.cursor !== cursor) imgEl.style.cursor = cursor;
    }

    if (vistaPrevia.arrastrando && vistaPrevia.arrastreIni) {
      const dx = e.clientX - vistaPrevia.arrastreIni.x;
      const dy = e.clientY - vistaPrevia.arrastreIni.y;
      vistaPrevia.offsetX = vistaPrevia.arrastreOffset.x + dx;
      vistaPrevia.offsetY = vistaPrevia.arrastreOffset.y + dy;
      clampearVistaPrevia();
      dibujarVistaPrevia();
      return;
    }

    if (vistaPrevia.mousedownEn) {
      const dx = e.clientX - vistaPrevia.mousedownEn.x;
      const dy = e.clientY - vistaPrevia.mousedownEn.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) vistaPrevia.movido = true;
    }
  });

  document.addEventListener('mouseup', function (e) {
    if (!vistaPrevia.visible) return;

    if (e.button === 1) {
      vistaPrevia.arrastrando = false;
      const cursor = puntoSobreImagenVistaPrevia(e.clientX, e.clientY)
        ? CURSOR_LUPA_SIMPLE_VP
        : 'default';
      fondo.style.cursor = cursor;
      const imgEl = $('vistaPreviaImagen');
      if (imgEl) imgEl.style.cursor = cursor;
      return;
    }

    if (e.button === 0) {
      const fueClic = vistaPrevia.mousedownEn && !vistaPrevia.movido;
      vistaPrevia.mousedownEn = null;
      vistaPrevia.movido = false;
      if (fueClic) cerrarVistaPreviaPID();
    }
  });

  fondo.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  fondo.addEventListener('auxclick', function (e) {
    if (e.button === 1) e.preventDefault();
  });

  // Escape de la vista previa: se registra en WINDOW en captura para correr
  // ANTES que cualquier handler de document (modal, etc.) y cortar la cadena
  // con stopImmediatePropagation. Asi Escape cierra SOLO la vista previa y
  // no el modal que la abrio.
  window.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!vistaPrevia.visible) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    e.stopPropagation();
    cerrarVistaPreviaPID();
  }, true);

  window.addEventListener('resize', function () {
    if (!vistaPrevia.visible) return;
    if (!vistaPrevia.imagen) return;
    const zoomRelativo = vistaPrevia.zoom / vistaPrevia.zoomMin || 1;
    ajustarVistaPreviaAPantalla();
    if (zoomRelativo > 1) {
      const fondoEl = $('vistaPreviaFondo');
      const w = fondoEl.clientWidth;
      const h = fondoEl.clientHeight;
      vistaPrevia.zoom = vistaPrevia.zoomMin * zoomRelativo;
      if (vistaPrevia.zoom > vistaPrevia.zoomMax) vistaPrevia.zoom = vistaPrevia.zoomMax;
      vistaPrevia.offsetX = (w - vistaPrevia.ancho * vistaPrevia.zoom) / 2;
      vistaPrevia.offsetY = (h - vistaPrevia.alto * vistaPrevia.zoom) / 2;
      clampearVistaPrevia();
    }
    dibujarVistaPrevia();
  });
}

// ================================================================
// VISOR DE CALIBRACION
// ================================================================

async function abrirVisorCalibracion(pid, hoja, rev, soloVer) {
  const hojaNorm = formatearHoja(hoja);
  // Modo SOLO VER ("Ver" en el menu de P&ID global): plano + hipervinculos
  // para navegar, sin panel derecho ni zona/puntos de calibracion.
  cal.soloVer = !!soloVer;

  // Guard: si hay un flujo de hipervínculo pendiente y se abre un P&ID que
  // NO es el destino esperado, se descarta el pendiente para no arrastrarlo.
  if (typeof hiperv !== 'undefined' && hiperv.pendiente && hiperv.pendiente.destino) {
    const d = hiperv.pendiente.destino;
    const coincide = String(pid) === String(d.pid) &&
                     formatearHoja(hojaNorm) === formatearHoja(d.hoja) &&
                     String(rev) === String(d.rev);
    if (!coincide && typeof cancelarFlujoHipervinculo === 'function') {
      cancelarFlujoHipervinculo({ volverOrigen: false, avisar: false });
    }
  }

  let info;
  try {
    const r = await fetchAPI('/api/pid/' + encodeURIComponent(pid) + '/' +
                             encodeURIComponent(hojaNorm) + '/' +
                             encodeURIComponent(rev));
    info = await r.json();
    if (info.error) { mostrarAviso(info.error, true); return; }
  } catch (e) {
    mostrarAviso('Error al obtener el P&ID: ' + e.message, true);
    return;
  }

  // Refrescar lupa desde el INI (por si cambió y la página no se recargó).
  if (sesion && sesion.config && sesion.config.Lupa) {
    const lz = parseFloat(sesion.config.Lupa.Zoom) || 3;
    const lt = parseInt(sesion.config.Lupa.Tamano, 10) || 180;
    cal.lupaZoom = lz;
    cal.lupaTamano = lt;
  }
  actualizarControlLupa();

  cal.pid = pid;
  cal.hoja = hojaNorm;
  cal.hojaTexto = info.hojaTexto || hojaNorm;
  cal.rev = rev;
  cal.punto00 = null;
  cal.punto100 = null;
  cal.modoMarcar = null;
  cal.cambiosCal = false;
  cal._calibradoOriginal = !!(info.calibrado && info.calibracion);
  cal.zoom = 1;
  cal.offsetX = 0;
  cal.offsetY = 0;
  cal.acumuladorWheel = 0;
  cal.virtual = null;
  cal.cruzVirtualEl = null;

  if (info.calibrado && info.calibracion) {
    cal.punto00 = { x: info.calibracion.punto00.x, y: info.calibracion.punto00.y };
    cal.punto100 = { x: info.calibracion.punto100.x, y: info.calibracion.punto100.y };
  }

  const img = new Image();
  img.onload = function () {
    cal.imagen = img;
    cal.ancho = img.naturalWidth;
    cal.alto = img.naturalHeight;

    $('tituloCalPID').textContent = pid;
    $('subtituloCalRev').textContent = 'Rev ' + rev;

    const chipC = $('chipHojaCal');
    if (chipC) {
      chipC.textContent = 'Hoja ' + cal.hojaTexto;
      chipC.style.display = '';
    }

    cal.cruzVirtualEl = crearCruzVirtual('capaMarcadoresCal');

    // Cargar hipervínculos del P&ID (no depende del listado).
    if (typeof inicializarHiperv === 'function') {
      inicializarHiperv(pid, hojaNorm, rev);
    }

    // Importante: ajustar/dibujar recién cuando la pantalla ya tiene tamaño
    // (el fade puede demorar el display). Si no, clientWidth = 0 -> negro.
    aplicarModoSoloVerCal();
    mostrarPantallaConFade('pantallaCalibracion', 'flex', function () {
      ajustarCalAPantalla();
      actualizarEstadoCal();
      dibujarCal();

      const lienzo = $('lienzoCal');
      if (lienzo) {
        lienzo.setAttribute('tabindex', '0');
        lienzo.focus();
      }
    });
  };
  img.onerror = function () {
    mostrarAviso('No se pudo cargar la imagen del P&ID.', true);
  };
  img.src = '/api/pid/' + encodeURIComponent(pid) + '/' +
            encodeURIComponent(hojaNorm) + '/' +
            encodeURIComponent(rev) + '/imagen';
}

function ajustarCalAPantalla() {
  const lienzo = $('lienzoCal');
  const w = lienzo.clientWidth;
  const h = lienzo.clientHeight;
  const escalaX = w / cal.ancho;
  const escalaY = h / cal.alto;

  cal.zoomMin = Math.min(escalaX, escalaY);
  cal.zoomMax = 20;
  cal.zoom = cal.zoomMin;

  cal.offsetX = (w - cal.ancho * cal.zoom) / 2;
  cal.offsetY = (h - cal.alto * cal.zoom) / 2;

  clampear();
  actualizarEstadoCal();
}

function clampear() {
  const lienzo = $('lienzoCal');
  const w = lienzo.clientWidth;
  const h = lienzo.clientHeight;

  if (cal.zoom < cal.zoomMin) cal.zoom = cal.zoomMin;
  if (cal.zoom > cal.zoomMax) cal.zoom = cal.zoomMax;

  const anchoVisible = cal.ancho * cal.zoom;
  const altoVisible = cal.alto * cal.zoom;

  if (anchoVisible <= w) {
    cal.offsetX = (w - anchoVisible) / 2;
  } else {
    const minX = w - anchoVisible;
    const maxX = 0;
    if (cal.offsetX < minX) cal.offsetX = minX;
    if (cal.offsetX > maxX) cal.offsetX = maxX;
  }

  if (altoVisible <= h) {
    cal.offsetY = (h - altoVisible) / 2;
  } else {
    const minY = h - altoVisible;
    const maxY = 0;
    if (cal.offsetY < minY) cal.offsetY = minY;
    if (cal.offsetY > maxY) cal.offsetY = maxY;
  }
}

function dibujarCal() {
  const canvas = $('canvasCal');
  const capa = $('capaMarcadoresCal');

  canvas.width = cal.ancho;
  canvas.height = cal.alto;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, cal.ancho, cal.alto);
  if (cal.imagen) ctx.drawImage(cal.imagen, 0, 0);

  const t = 'translate(' + cal.offsetX + 'px,' + cal.offsetY + 'px) scale(' + cal.zoom + ')';
  canvas.style.transform = t;
  capa.style.transform = t;
  const capaHip = $('capaHipervinculosCal');
  if (capaHip) capaHip.style.transform = t;
  const capaSello = $('capaSelloDesactualizadoCal');
  if (capaSello) capaSello.style.transform = t;

  capa.innerHTML = '';
  if (cal.cruzVirtualEl) {
    capa.appendChild(cal.cruzVirtualEl);
  } else {
    cal.cruzVirtualEl = crearCruzVirtual('capaMarcadoresCal');
  }

  // Esquina opuesta: el punto 100 confirmado, o el cursor mientras se esta
  // estirando la zona (previsualizacion enganchada al mouse).
  let esquinaOp = null;
  if (cal.punto100) esquinaOp = cal.punto100;
  else if (cal.arrastrandoZona && cal.virtual) esquinaOp = cal.virtual;

  if (!cal.soloVer && cal.punto00 && esquinaOp) {
    const x0 = Math.min(cal.punto00.x, esquinaOp.x);
    const x1 = Math.max(cal.punto00.x, esquinaOp.x);
    const y0 = Math.min(cal.punto00.y, esquinaOp.y);
    const y1 = Math.max(cal.punto00.y, esquinaOp.y);

    const rect = document.createElement('div');
    rect.className = 'zonaCalibrada';
    rect.style.left = x0 + 'px';
    rect.style.top = y0 + 'px';
    rect.style.width = (x1 - x0) + 'px';
    rect.style.height = (y1 - y0) + 'px';
    capa.appendChild(rect);
  }

  if (!cal.soloVer && cal.punto00) {
    const p = document.createElement('div');
    p.className = 'puntoCal p00';
    p.style.left = cal.punto00.x + 'px';
    p.style.top = cal.punto00.y + 'px';
    capa.appendChild(p);

    const e = document.createElement('div');
    e.className = 'etiquetaPuntoCal';
    e.textContent = '0,0';
    e.style.left = cal.punto00.x + 'px';
    e.style.top = cal.punto00.y + 'px';
    capa.appendChild(e);
  }

  if (!cal.soloVer && cal.punto100) {
    const p = document.createElement('div');
    p.className = 'puntoCal p100';
    p.style.left = cal.punto100.x + 'px';
    p.style.top = cal.punto100.y + 'px';
    capa.appendChild(p);

    const e = document.createElement('div');
    e.className = 'etiquetaPuntoCal';
    e.textContent = '100,100';
    e.style.left = cal.punto100.x + 'px';
    e.style.top = cal.punto100.y + 'px';
    capa.appendChild(e);
  }

  actualizarCruzVirtual(cal, cal.cruzVirtualEl);

  // Sello DESACTUALIZADO (mismo criterio que el visor de marcas).
  actualizarSelloDesactualizadoCal();

  // Hipervínculos: dibujar sobre la capa propia.
  if (typeof dibujarHipervinculosCal === 'function') dibujarHipervinculosCal();
}

// ================================================================
// SELLO "DESACTUALIZADO" SOBRE EL PLANO (VISOR DE CALIBRACION)
// ================================================================
// Igual que actualizarSelloDesactualizado() del visor de marcas, pero para
// el estado `cal`. Se muestra si el P&ID abierto NO es la ultima revision
// de su hoja. Geometria: centrado, rotado -30 grados, ancho 1/3 de la
// diagonal; el font-size se deriva del ancho.
function actualizarSelloDesactualizadoCal() {
  const capa = $('capaSelloDesactualizadoCal');
  if (!capa) return;

  if (!cal.imagen || !cal.ancho || !cal.alto) {
    capa.style.display = 'none';
    return;
  }

  const ultima = (typeof ultimaRevisionDeHoja === 'function')
    ? ultimaRevisionDeHoja(cal.pid, cal.hojaTexto || cal.hoja)
    : undefined;
  const desactualizado = (ultima !== undefined) &&
    (String(cal.rev) !== String(ultima));

  if (!desactualizado) {
    capa.style.display = 'none';
    return;
  }

  capa.style.display = 'block';
  capa.style.width = cal.ancho + 'px';
  capa.style.height = cal.alto + 'px';

  const sello = capa.firstElementChild;
  if (!sello) return;

  const diagonal = Math.sqrt(cal.ancho * cal.ancho + cal.alto * cal.alto);
  const anchoObjetivo = diagonal / 3;

  // Mismo criterio que el visor de marcas: se dimensiona con la linea mas
  // ancha (titulo o subtitulo "Nuevo P&ID disponible en Rev.X", a la mitad).
  const EM_POR_CARACTER = 0.72;
  const PADDING_EM = 0.14 * 2;
  const textoRev = 'Nuevo P&ID disponible en Rev.' + String(ultima);
  const emTitulo = 14 * EM_POR_CARACTER;
  const emSub = textoRev.length * EM_POR_CARACTER * 0.5;
  const emTexto = Math.max(emTitulo, emSub);
  let fontSize = anchoObjetivo / (emTexto + PADDING_EM);
  fontSize = Math.min(fontSize, cal.alto / 4);
  if (!isFinite(fontSize) || fontSize <= 0) fontSize = 20;

  sello.style.fontSize = fontSize + 'px';

  // Revision nueva DEBAJO del recuadro (hermano del .selloDesactualizado,
  // dentro de .selloDesactualizadoBloque).
  const bloque = sello.parentElement;
  const revEl = bloque ? bloque.querySelector('.selloRev') : null;
  if (revEl) revEl.textContent = textoRev;
}

function actualizarEstadoCal() {
  const e00 = $('estadoPunto00');
  const e100 = $('estadoPunto100');
  const ez = $('estadoZoom');
  const btn = $('btnGuardarCal');

  if (e00) {
    if (cal.punto00) {
      e00.textContent = '0,0 (inf. izq.): X=' + Math.round(cal.punto00.x) + ', Y=' + Math.round(cal.punto00.y);
      e00.classList.add('ok');
    } else {
      e00.textContent = 'Punto 0,0 (inf. izq.): sin marcar';
      e00.classList.remove('ok');
    }
  }

  if (e100) {
    if (cal.punto100) {
      e100.textContent = '100,100 (sup. der.): X=' + Math.round(cal.punto100.x) + ', Y=' + Math.round(cal.punto100.y);
      e100.classList.add('ok');
    } else {
      e100.textContent = 'Punto 100,100 (sup. der.): sin marcar';
      e100.classList.remove('ok');
    }
  }

  if (ez) ez.textContent = 'Zoom: ' + Math.round(cal.zoom * 100) + '%';
  // Guardar se habilita solo si hay cambios de calibración pendientes.
  if (btn) btn.disabled = !cal.cambiosCal;

  // Texto del botón Calibrar/Recalibrar según si el P&ID ya está calibrado.
  const btnCalibrar = $('btnCalibrar');
  if (btnCalibrar) {
    btnCalibrar.textContent = cal._calibradoOriginal ? 'Recalibrar' : 'Calibrar';
  }

  const lienzoCal = $('lienzoCal');
  if (lienzoCal) lienzoCal.classList.toggle('modoMarcar', cal.modoMarcar !== null);
}

// Muestra/oculta la UI de edicion segun cal.soloVer. En modo solo ver se
// oculta TODA la barra lateral derecha (#panelCal + #divisorCal) y los
// botones de accion de la barra superior (Calibrar/Guardar). Quedan visibles
// solo: volver, titulo, ajustar, zoom y la lupa (para navegar y leer).
function aplicarModoSoloVerCal() {
  const solo = !!cal.soloVer;
  const panel = $('panelCal');
  const divisor = $('divisorCal');
  if (panel) panel.style.display = solo ? 'none' : '';
  if (divisor) divisor.style.display = solo ? 'none' : '';

  const btnCalibrar = $('btnCalibrar');
  if (btnCalibrar) btnCalibrar.style.display = solo ? 'none' : '';
  const btnGuardar = $('btnGuardarCal');
  if (btnGuardar) btnGuardar.style.display = solo ? 'none' : '';
  const btnHip = $('btnNuevoHipervinculo');
  if (btnHip) btnHip.style.display = solo ? 'none' : '';

  // Separadores de la barra que quedarian "colgados".
  const separadores = document.querySelectorAll('#pantallaCalibracion .botonesCal .separadorBarra');
  Array.prototype.forEach.call(separadores, function (el) {
    el.style.display = solo ? 'none' : '';
  });

  const btnCancelar = $('btnCancelarCal');
  if (btnCancelar) btnCancelar.textContent = solo ? '← Volver' : '← Cancelar';
}

function pantallaAPixel(clientX, clientY) {
  const lienzo = $('lienzoCal');
  if (!lienzo) return { x: 0, y: 0 };
  const rect = lienzo.getBoundingClientRect();
  const x = (clientX - rect.left - cal.offsetX) / cal.zoom;
  const y = (clientY - rect.top - cal.offsetY) / cal.zoom;
  return { x: x, y: y };
}

// Flujo guiado de calibración: pide marcar 0,0 (inferior izquierda) y
// luego 100,100 (superior derecha). Reemplaza a los botones separados.
function iniciarCalibracionGuiada() {
  if (!cal.imagen) { mostrarAviso('No hay P&ID cargado.', true); return; }

  function empezar() {
    // Se BORRA la calibración actual: los puntos y la zona desaparecen y se
    // vuelven a marcar desde cero. No se persiste nada hasta Guardar.
    cal.punto00 = null;
    cal.punto100 = null;
    cal.arrastrandoZona = false;
    cal.cambiosCal = false;
    dibujarCal();
    actualizarEstadoCal();
    cal.modoMarcar = '00';
    actualizarEstadoCal();
    mostrarAviso('Marcá el punto 0,0 (esquina inferior izquierda).');
  }

  // Si ya está calibrado, se pide reconfirmación antes de recalibrar.
  if (cal._calibradoOriginal) {
    abrirModal('Recalibrar P&ID',
      '<p>Este P&amp;ID <strong>ya está calibrado</strong>.</p>' +
      '<p>Si continuás, vas a reemplazar los puntos de calibración actuales.</p>' +
      '<p>¿Querés recalibrarlo de todos modos?</p>',
      function () { empezar(); return true; },
      { textoAceptar: 'Recalibrar' });
    return;
  }

  empezar();
}

function cancelarVisorCal() {
  // Si había un flujo de hipervínculo a medias, se descarta en silencio
  // (sin volver a navegar ni avisar: el usuario ya está saliendo del visor).
  if (typeof cancelarFlujoHipervinculo === 'function') {
    cancelarFlujoHipervinculo({ volverOrigen: false, avisar: false });
  }
  cal.modoMarcar = null;
  $('lupa').style.display = 'none';
  mostrarPantallaConFade('pantallaPID', 'block', function () {
    marcarMenuActivo('menuPID');
    cargarPIDs();
  });
}

function guardarCalibracion() {
  if (!cal.punto00 || !cal.punto100) {
    mostrarAviso('Faltan marcar los puntos.', true);
    return;
  }

  fetchAPI('/api/pid/' + encodeURIComponent(cal.pid) + '/' +
          encodeURIComponent(cal.hojaTexto || cal.hoja) + '/' +
          encodeURIComponent(cal.rev) + '/calibracion', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ancho: cal.ancho,
      alto: cal.alto,
      punto00: { x: cal.punto00.x, y: cal.punto00.y },
      punto100: { x: cal.punto100.x, y: cal.punto100.y }
    })
  })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.error) { mostrarAviso(d.error, true); return; }
      cal.cambiosCal = false;
      cal._calibradoOriginal = true;
      actualizarEstadoCal();
      mostrarAviso('Calibración guardada.');
      cancelarVisorCal();
    });
}

// ================================================================
// LUPA - VISOR DE CALIBRACION
// ================================================================

function actualizarLupa() {
  const lupa = $('lupa');
  const lupaCanvas = $('lupaCanvas');

  if (!cal.lupaActiva || !cal.imagen) { lupa.style.display = 'none'; return; }
  if (!cal.virtual) { lupa.style.display = 'none'; return; }

  const p = { x: cal.virtual.x, y: cal.virtual.y };

  const tam = cal.lupaTamano;
  const zoomLupa = cal.lupaZoom;

  lupa.style.display = 'block';
  lupa.style.width = tam + 'px';
  lupa.style.height = tam + 'px';
  lupaCanvas.width = tam;
  lupaCanvas.height = tam;

  const ctx = lupaCanvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, tam, tam);

  const destinoAncho = cal.ancho * zoomLupa;
  const destinoAlto = cal.alto * zoomLupa;
  const offsetXEnLupa = (tam / 2) - (p.x * zoomLupa);
  const offsetYEnLupa = (tam / 2) - (p.y * zoomLupa);

  ctx.drawImage(cal.imagen, 0, 0, cal.ancho, cal.alto,
                offsetXEnLupa, offsetYEnLupa, destinoAncho, destinoAlto);

  const colorCruz = colorDeCruzAdecuado(p.x, p.y);
  dibujarCruz(ctx, tam, colorCruz);

  const lienzo = $('lienzoCal');
  const rect = lienzo.getBoundingClientRect();
  const xPant = p.x * cal.zoom + cal.offsetX + rect.left;
  const yPant = p.y * cal.zoom + cal.offsetY + rect.top;

  let lx = xPant + 20;
  let ly = yPant + 20;
  if (lx + tam > window.innerWidth) lx = xPant - tam - 20;
  if (ly + tam > window.innerHeight) ly = yPant - tam - 20;
  lupa.style.left = lx + 'px';
  lupa.style.top = ly + 'px';
}

function colorDeCruzAdecuado(pxImagen, pyImagen) {
  if (!cal.imagen) return '#fff';
  if (typeof canvasBrillo === 'undefined' || !canvasBrillo) return '#fff';
  const ctx = canvasBrillo.getContext('2d');
  if (!ctx) return '#fff';
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, canvasBrillo.width, canvasBrillo.height);

  try {
    ctx.drawImage(cal.imagen,
      Math.floor(pxImagen - 20), Math.floor(pyImagen - 20), 40, 40,
      0, 0, canvasBrillo.width, canvasBrillo.height);
  } catch (e) { return '#fff'; }

  let datos;
  try { datos = ctx.getImageData(0, 0, canvasBrillo.width, canvasBrillo.height).data; }
  catch (e) { return '#fff'; }

  let suma = 0, cuenta = 0;
  for (let i = 0; i < datos.length; i += 4) {
    suma += 0.299 * datos[i] + 0.587 * datos[i + 1] + 0.114 * datos[i + 2];
    cuenta++;
  }
  const brillo = suma / cuenta;
  return brillo > 128 ? 'rgba(0,0,0,0.9)' : 'rgba(255,255,255,0.95)';
}

// ============ Eventos del visor de calibración ============
function engancharEventosCalibracion() {
  const lienzo = $('lienzoCal');
  if (!lienzo) return;

  lienzo.style.userSelect = 'none';
  lienzo.style.webkitUserSelect = 'none';

  $('btnCancelarCal').onclick = cancelarVisorCal;

  // Escape en la pantalla de calibracion / Ver: vuelve al listado de P&ID.
  // Se ignora si hay un modal abierto o la vista previa visible (esos ya
  // manejan su propio Escape).
  if (!lienzo._escCalEnganchado) {
    lienzo._escCalEnganchado = true;
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      const pantallaCal = $('pantallaCalibracion');
      if (!pantallaCal || pantallaCal.style.display === 'none') return;
      if (typeof vistaPrevia !== 'undefined' && vistaPrevia && vistaPrevia.visible) return;
      const fondo = $('modalFondo');
      if (fondo && fondo.style.display !== 'none') return;
      e.preventDefault();
      e.stopPropagation();
      cancelarVisorCal();
    }, true);
  }
  $('btnAjustarCal').onclick = function () {
    ajustarCalAPantalla();
    actualizarEstadoCal();
    dibujarCal();
  };
  $('btnGuardarCal').onclick = guardarCalibracion;

  const btnHip = $('btnNuevoHipervinculo');
  if (btnHip) btnHip.onclick = function () {
    if (typeof activarModoHipervinculo === 'function') activarModoHipervinculo();
  };
  if (typeof engancharEventosHipervinculosCal === 'function') {
    engancharEventosHipervinculosCal();
  }

  const btnCalibrarEl = $('btnCalibrar');
  if (btnCalibrarEl) btnCalibrarEl.onclick = iniciarCalibracionGuiada;

  const btnLupaMenosCal = $('btnLupaMenos');
  if (btnLupaMenosCal) {
    btnLupaMenosCal.onclick = function () {
      cal.lupaZoom = Math.max(1, cal.lupaZoom - 0.5);
      actualizarControlLupa();
    };
  }
  $('btnLupaMas').onclick = function () {
    cal.lupaZoom = Math.min(5, cal.lupaZoom + 0.5);
    actualizarControlLupa();
  };

  lienzo.addEventListener('wheel', function (e) {
    e.preventDefault();
    cal.acumuladorWheel += e.deltaY;
    if (Math.abs(cal.acumuladorWheel) < 100) return;
    const direccion = cal.acumuladorWheel > 0 ? -1 : 1;
    cal.acumuladorWheel = 0;
    const factor = direccion > 0 ? 1.25 : 1 / 1.25;
    const antes = pantallaAPixel(e.clientX, e.clientY);
    cal.zoom = Math.max(cal.zoomMin, Math.min(cal.zoomMax, cal.zoom * factor));
    const rect = lienzo.getBoundingClientRect();
    cal.offsetX = (e.clientX - rect.left) - antes.x * cal.zoom;
    cal.offsetY = (e.clientY - rect.top) - antes.y * cal.zoom;
    clampear();
    dibujarCal();
    actualizarEstadoCal();
  }, { passive: false });

  lienzo.addEventListener('mousedown', function (e) {
    e.preventDefault();
    lienzo.focus();

    if (e.button === 1) {
      cal.arrastrando = true;
      cal.arrastreIni = { x: e.clientX, y: e.clientY };
      cal.arrastreOffset = { x: cal.offsetX, y: cal.offsetY };
      return;
    }

    if (e.button === 0) {
      // El clic SIEMPRE manda: recalcular el cursor virtual con la posicion
      // real del clic (no confiar en un valor previo o sembrado).
      if (cal.modoMarcar || cal.arrastrandoZona) {
        const pv = pantallaAPixel(e.clientX, e.clientY);
        cal.virtual = { x: pv.x, y: pv.y };
        clampearPuntoImagen(cal, cal.virtual);
      }
      marcarPuntoEnCursor();
    }
  });

  // Marca el punto 0,0 (primer clic) o cierra la zona en la posicion actual
  // del cursor (segundo clic). Lo usan el clic izquierdo y la tecla Enter.
  function marcarPuntoEnCursor() {
    if (!cal.modoMarcar && !cal.arrastrandoZona) return;
    if (!cal.virtual) return;
    const p = { x: cal.virtual.x, y: cal.virtual.y };
    if (p.x < 0 || p.y < 0 || p.x > cal.ancho || p.y > cal.alto) {
      mostrarAviso('El punto está fuera de la imagen.', true);
      return;
    }
    // Segundo clic mientras la zona se esta estirando: confirma el punto
    // 100,100 en la posicion actual del cursor.
    if (cal.arrastrandoZona) {
      cal.punto100 = p;
      cal.arrastrandoZona = false;
      cal.modoMarcar = null;
      cal.cambiosCal = true;
      dibujarCal();
      actualizarEstadoCal();
      return;
    }

    if (cal.modoMarcar === '00') {
      // Primer punto: se fija y desde aca la zona se ESTIRA con el cursor
      // hasta que el usuario haga el segundo clic (o Enter).
      cal.punto00 = p;
      cal.punto100 = null;
      cal.arrastrandoZona = true;
      cal.modoMarcar = null;
      actualizarCruzVirtual(cal, cal.cruzVirtualEl);
      dibujarCal();
      actualizarEstadoCal();
      mostrarAviso('Mové el mouse (o las flechas) y hacé clic / Enter para cerrar la zona.');
    }
  }

  // Enter equivale al clic izquierdo: marca / cierra la zona. Se escucha en
  // DOCUMENT (no en el lienzo) para que funcione aunque el foco no este en
  // el lienzo (p.ej. tras marcar el primer punto con Enter).
  if (!document._enterCalEnganchado) {
    document._enterCalEnganchado = true;
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      const pantallaCal = $('pantallaCalibracion');
      if (!pantallaCal || pantallaCal.style.display === 'none') return;
      if (!cal.modoMarcar && !cal.arrastrandoZona) return;
      if (typeof vistaPrevia !== 'undefined' && vistaPrevia && vistaPrevia.visible) return;
      const fondo = $('modalFondo');
      if (fondo && fondo.style.display !== 'none') return;
      e.preventDefault();
      e.stopPropagation();
      marcarPuntoEnCursor();
    }, true);
  }

  lienzo.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  lienzo.addEventListener('auxclick', function (e) {
    if (e.button === 1) e.preventDefault();
  });

  // Devuelve true si (clientX, clientY) cae dentro del area VISIBLE de la
  // hoja (imagen del P&ID ya escalada y desplazada), no del lienzo entero.
  // El lienzo incluye las franjas vacias alrededor del plano al "Ajustar".
  function puntoSobreLaHojaCal(clientX, clientY) {
    const r = lienzo.getBoundingClientRect();
    const izq = r.left + cal.offsetX;
    const arr = r.top + cal.offsetY;
    const der = izq + cal.ancho * cal.zoom;
    const aba = arr + cal.alto * cal.zoom;
    const tol = 2;
    return clientX >= izq + tol && clientX <= der - tol &&
           clientY >= arr + tol && clientY <= aba - tol;
  }

  function restaurarCursorCal() {
    lienzo.classList.remove('cursorOculto');
    const lupa = $('lupa');
    if (lupa) lupa.style.display = 'none';
  }

  lienzo.addEventListener('mouseenter', function () {
    lienzo.classList.add('cursorOculto');
  });

  lienzo.addEventListener('mousemove', function (e) {
    // Fuera de la hoja (franjas vacias del lienzo): el cursor del sistema
    // tiene que verse, igual que en el visor de marcas.
    if (!puntoSobreLaHojaCal(e.clientX, e.clientY)) {
      restaurarCursorCal();
      return;
    }
    if (!lienzo.classList.contains('cursorOculto')) {
      lienzo.classList.add('cursorOculto');
    }
    const p = pantallaAPixel(e.clientX, e.clientY);
    cal.virtual = { x: p.x, y: p.y };
    clampearPuntoImagen(cal, cal.virtual);
    actualizarCruzVirtual(cal, cal.cruzVirtualEl);
    actualizarLupa();
    // El redibujado mientras se estira la zona lo hace el listener de
    // 'document' (asi tambien funciona si el puntero sale del lienzo).
  });

  document.addEventListener('mousemove', function (e) {
    if (cal.arrastrando) {
      const dx = e.clientX - cal.arrastreIni.x;
      const dy = e.clientY - cal.arrastreIni.y;
      cal.offsetX = cal.arrastreOffset.x + dx;
      cal.offsetY = cal.arrastreOffset.y + dy;
      clampear();
      dibujarCal();
      return;
    }

    // Mientras se esta estirando la zona (primer punto marcado con clic o
    // con Enter), se sigue el cursor aunque salga del lienzo.
    if (cal.arrastrandoZona) {
      const lienzoEl = $('lienzoCal');
      if (!lienzoEl) return;
      const r = lienzoEl.getBoundingClientRect();
      const px = (e.clientX - r.left - cal.offsetX) / cal.zoom;
      const py = (e.clientY - r.top - cal.offsetY) / cal.zoom;
      cal.virtual = { x: px, y: py };
      clampearPuntoImagen(cal, cal.virtual);
      actualizarCruzVirtual(cal, cal.cruzVirtualEl);
      dibujarCal();
    }
  });

  // Flechas: mueven el cursor virtual. Mientras se estira la zona, la
  // redibujan (permite cerrar la calibracion solo con teclado).
  document.addEventListener('keydown', function (e) {
    if (!cal.arrastrandoZona) return;
    const pantallaCal = $('pantallaCalibracion');
    if (!pantallaCal || pantallaCal.style.display === 'none') return;
    const paso = pasoFlecha(e);
    let dx = 0, dy = 0;
    if (e.key === 'ArrowLeft') dx = -paso;
    else if (e.key === 'ArrowRight') dx = paso;
    else if (e.key === 'ArrowUp') dy = -paso;
    else if (e.key === 'ArrowDown') dy = paso;
    else return;
    e.preventDefault();
    e.stopPropagation();
    if (!cal.virtual) {
      cal.virtual = {
        x: cal.punto00 ? cal.punto00.x : 0,
        y: cal.punto00 ? cal.punto00.y : 0
      };
    }
    cal.virtual.x += dx;
    cal.virtual.y += dy;
    clampearPuntoImagen(cal, cal.virtual);
    actualizarCruzVirtual(cal, cal.cruzVirtualEl);
    dibujarCal();
  });

  document.addEventListener('mouseup', function (e) {
    if (e.button === 1) cal.arrastrando = false;
  });

  lienzo.addEventListener('mouseleave', function () {
    lienzo.classList.remove('cursorOculto');
    $('lupa').style.display = 'none';
  });

  window.addEventListener('resize', function () {
    if ($('pantallaCalibracion').style.display !== 'none') {
      const w = lienzo.clientWidth;
      const h = lienzo.clientHeight;
      cal.zoomMin = Math.min(w / cal.ancho, h / cal.alto);
      if (cal.zoom < cal.zoomMin) cal.zoom = cal.zoomMin;
      clampear();
      dibujarCal();
      actualizarEstadoCal();
    }
  });
}