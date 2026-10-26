// ================================================================
// Pantalla P&ID (lista principal)
// ================================================================
// Listado de P&ID con calibración + acciones (Ver, Calibrar,
// Recalibrar).
//
// La vista previa y el visor de calibración viven en calibracion.js.

// ============ P&ID: lista ============
async function cargarPIDs() {
  try {
    const r = await fetchAPI('/api/pid');
    const d = await r.json();
    if (d.error) { mostrarAviso(d.error, true); return; }
    pids = d.pids;
    calcularUltimasRevisiones();
    dibujarTablaPID();
  } catch (e) {
    mostrarAviso('Error al cargar P&ID: ' + e.message, true);
  }
}

function dibujarTablaPID() {
  const cuerpo = $('cuerpoPID');
  const vacio = $('mensajeVacioPID');
  const tabla = $('tablaPID');

  const filtro = pidFiltroTexto.trim().toLowerCase();

  const visibles = pids
    .filter(function (p) {
      if (!filtro) return true;
      const hojaTexto = formatearHoja(p.hojaTexto || p.hoja);
      const texto = (p.pid + ' rev' + p.revision + ' hoja ' + hojaTexto).toLowerCase();
      return texto.indexOf(filtro) !== -1;
    })
    .slice()
    .sort(function (a, b) {
      if (a.pid !== b.pid) return a.pid.localeCompare(b.pid);
      if (a.pagina !== b.pagina) return a.pagina - b.pagina;
      // Revision MAS NUEVA primero: compararRevision(b, a) devuelve < 0
      // cuando 'a' es mas nueva que 'b' (compararRevision tiene semantica
      // natural: > 0 = primer argumento mas nuevo).
      return compararRevision(b.revision, a.revision);
    });

  if (visibles.length === 0) {
    cuerpo.innerHTML = '';
    tabla.style.display = 'none';
    vacio.style.display = 'block';
    return;
  }

  tabla.style.display = '';
  vacio.style.display = 'none';

  cuerpo.innerHTML = visibles.map(function (p, i) {
    const estado = p.calibrado
      ? '<span class="etiqueta etiquetaPropia">Sí</span>'
      : '<span class="etiqueta etiquetaOtro">No</span>';

    let fecha = '—';
    if (p.calibrado && p.calibracion && p.calibracion.calibrado_en) {
      fecha = formatearFecha(p.calibracion.calibrado_en);
    }

    const abrible = p.calibrado || (sesion && sesion.puedeGestionarPid);
    const hojaTexto = formatearHoja(p.hojaTexto || p.hoja);

    // Arbol: si hay una revision mas nueva de este pid+hoja, el nombre se
    // muestra desplazado y con una flecha, simulando que cuelga de la nueva.
    const esUltima = (typeof ultimaRevisionDeHoja === 'function')
      ? (String(p.revision) === String(ultimaRevisionDeHoja(p.pid, hojaTexto)))
      : true;
    const claseNombre = esUltima ? 'celdaNombrePid' : 'celdaNombrePid celdaNombrePidHija';
    const flecha = esUltima ? '' : '<span class="flechaArbolPid">↳</span>';

    return (
      '<tr' + (abrible ? ' class="filaAbrible"' : '') +
        ' data-pid="' + escaparHTML(p.pid) + '" ' +
        ' data-hoja="' + escaparHTML(hojaTexto) + '" ' +
        ' data-rev="' + escaparHTML(p.revision) + '"' +
        ' data-calibrado="' + (p.calibrado ? '1' : '0') + '">' +
        '<td class="' + claseNombre + '" title="' + escaparHTML(p.pid) + '">' + flecha + escaparHTML(p.pid) + '</td>' +
        '<td>' + escaparHTML(hojaTexto) + '</td>' +
        '<td>' + formatearRevision(p.pid, p.revision, hojaTexto) + '</td>' +
        '<td>' + estado + '</td>' +
        '<td>' + fecha + '</td>' +
        '<td class="colCentrada">' + celdaHipervinculos(p.hipervinculos) + '</td>' +
        '<td class="celdaAccionesCentrada">' +
          '<button type="button" class="btnMenu" data-accion="menu_pid_global" ' +
                  'data-pid="' + escaparHTML(p.pid) + '" ' +
                  'data-hoja="' + escaparHTML(hojaTexto) + '" ' +
                  'data-rev="' + escaparHTML(p.revision) + '" ' +
                  'title="Acciones">&#8942;</button>' +
        '</td>' +
      '</tr>'
    );
  }).join('');
}

// Celda de la columna 'Hipervínculos': SOLO el número.
// El icono de cadena va en el ENCABEZADO de la columna (index.html), así
// cada fila queda limpia y se compara de un vistazo.
// Si el P&ID no tiene ninguno, se muestra '—' (gris).
function celdaHipervinculos(cantidad) {
  const n = parseInt(cantidad, 10);
  if (!n || n <= 0) {
    return '<span class="sinHipervinculos">—</span>';
  }
  return '<span class="celdaHipervinculos">' + n + '</span>';
}

function opcionesMenuPidGlobal(p) {
  const puedeGestionar = !!(sesion && sesion.puedeGestionarPid);
  const hojaTexto = formatearHoja(p.hojaTexto || p.hoja);
  const ops = [];

  if (p.calibrado) {
    // 'Ver' abre el plano en modo SOLO VER: sin panel derecho, sin zona
    // calibrada ni puntos; solo hipervinculos para navegar entre P&ID.
    ops.push({ texto: 'Ver', accion: function () { abrirVisorCalibracion(p.pid, hojaTexto, p.revision, true); } });
    if (puedeGestionar) {
      ops.push({ separador: true });
      ops.push({ texto: 'Calibrar e hipervínculos', accion: function () { accionCalibrar(p.pid, hojaTexto, p.revision, false); } });
    }
  } else {
    if (puedeGestionar) {
      ops.push({ texto: 'Calibrar', accion: function () { accionCalibrar(p.pid, hojaTexto, p.revision, false); } });
    } else {
      ops.push({ texto: 'Sin calibrar (requiere SuperUsuario o Admin)', deshabilitada: true });
    }
  }

  if (puedeGestionar) {
    ops.push({ separador: true });
    ops.push({
      texto: 'Modificar datos',
      accion: function () { abrirModalModificarPID(p.pid, hojaTexto, p.revision); }
    });
    ops.push({ separador: true });
    ops.push({
      texto: 'Borrar P&ID',
      peligro: true,
      accion: function () { accionBorrarPID(p.pid, hojaTexto, p.revision); }
    });
  }

  return ops;
}

// ============ Borrar un P&ID ============
// Consulta a que listados esta asignado el P&ID y pide confirmacion.
// Si esta asignado, avisa en que listados (y cuantas marcaciones tiene
// en cada uno) porque al borrar el P&ID se quitan esas referencias.
async function accionBorrarPID(pid, hoja, rev) {
  if (!sesion || !sesion.puedeGestionarPid) {
    mostrarAviso('Requiere rol SuperUsuario o Admin para borrar P&ID.', true);
    return;
  }

  const hojaTexto = formatearHoja(hoja);
  let listados = [];
  let hiperTotal = 0;

  // Buscamos los listados donde esta asignado este P&ID exacto (y cuantos
  // hipervinculos tiene, que se borran junto con el P&ID).
  try {
    const r = await fetchAPI('/api/pid/' + encodeURIComponent(pid) + '/' +
      encodeURIComponent(hojaTexto) + '/' + encodeURIComponent(rev) + '/listados');
    const d = await r.json().catch(function () { return {}; });
    if (r.ok && Array.isArray(d.listados)) listados = d.listados;
    if (r.ok && d.hipervinculos && typeof d.hipervinculos.total === 'number') {
      hiperTotal = d.hipervinculos.total;
    }
  } catch (e) {
    // Si falla la consulta, igual dejamos confirmar (sin el detalle).
    listados = [];
  }

  const asignado = listados.length > 0;

  // Armamos el cuerpo del modal.
  let html = '<p style="margin-top:0;">P&amp;ID <strong>' + escaparHTML(pid) + '</strong> — Hoja ' +
    escaparHTML(hojaTexto) + ' — Rev' + escaparHTML(String(rev)) + '</p>';

  if (asignado) {
    // Esta asignado: NO se puede borrar. Solo informamos en que listados esta.
    html += '<p style="color:#e07070;">No se puede borrar, ' +
      (listados.length === 1 ? 'está asignado a este listado:' : 'está asignado a estos ' + listados.length + ' listados:') + '</p>';
    html += '<ul style="margin:6px 0 10px 18px;padding:0;color:#ddd;">';
    listados.forEach(function (l) {
      html += '<li><strong>#' + escaparHTML(String(l.id)) + '</strong> — <strong>' +
        escaparHTML(l.nombre) + '</strong>' +
        ' <span style="color:#888;">(' + escaparHTML(l.usuario || '') + ')</span></li>';
    });
    html += '</ul>';
    html += '<p style="color:#888;font-size:12px;">Quitalo de ' +
      (listados.length === 1 ? 'ese listado' : 'esos listados') +
      ' antes de borrarlo.</p>';
  } else {
    // No asignado: confirmacion normal.
    html += '<p style="margin-top:0;">¿Seguro que querés borrar este P&amp;ID?</p>';
    html += '<p style="color:#888;font-size:12px;">No está asignado a ningún listado. ' +
      'El archivo (PNG y su calibración) se moverá a la papelera, no se borra de forma definitiva.</p>';
    if (hiperTotal > 0) {
      html += '<p style="color:#e0b070;font-size:13px;">Este P&amp;ID tiene <strong>' +
        escaparHTML(String(hiperTotal)) + '</strong> hipervínculo' +
        (hiperTotal === 1 ? '' : 's') +
        ' (propio' + (hiperTotal === 1 ? '' : 's') + ' y/o en otros P&amp;ID) que también se ' +
        (hiperTotal === 1 ? 'eliminará' : 'eliminarán') + '.</p>';
    }
  }

  // Si esta asignado, es solo informativo: NO se borra. Mostramos SOLO el
  // boton "Cerrar" (Aceptar). ESC tambien cierra (ocultarCancelar).
  if (asignado) {
    abrirModal('Borrar P&ID', html, function () { return true; },
      { textoAceptar: 'Cerrar', ocultarCancelar: true });
    return;
  }

  abrirModal('Borrar P&ID', html, async function () {
    try {
      const r = await fetchAPI('/api/pid/' + encodeURIComponent(pid) + '/' +
        encodeURIComponent(hojaTexto) + '/' + encodeURIComponent(rev), { method: 'DELETE' });
      const d = await r.json().catch(function () { return {}; });
      if (!r.ok) { mostrarAviso(d.error || 'No se pudo borrar el P&ID.', true); return false; }
      mostrarAviso('P&ID borrado: ' + pid + ' — Hoja ' + hojaTexto + ' — Rev' + rev + '.');
      // Quedarse en la pantalla P&ID (no navegar a Marcaciones).
      // irAPantallaPID recarga la tabla y deja activa la pantalla de P&ID.
      if (typeof irAPantallaPID === 'function') {
        irAPantallaPID();
      } else {
        await cargarPIDs();
      }
      return true;
    } catch (e) {
      mostrarAviso('Error al borrar: ' + e.message, true);
      return false;
    }
  }, { textoAceptar: 'Borrar' });
}

function accionCalibrar(pid, hoja, rev, esRecalibrar) {
  if (!sesion || !sesion.puedeGestionarPid) {
    mostrarAviso('Requiere rol SuperUsuario o Admin para calibrar.', true);
    return;
  }

  if (esRecalibrar) {
    abrirModal(
      'Confirmar recalibración',
      '<p>Este P&amp;ID ya está calibrado. Recalibrar puede afectar las marcaciones existentes.</p>' +
      '<p>¿Querés continuar?</p>',
      function () { abrirVisorCalibracion(pid, hoja, rev); }
    );
  } else {
    abrirVisorCalibracion(pid, hoja, rev);
  }
}

// ============ Cargar nuevo P&ID ============
function abrirModalCargarPID() {
  if (!sesion || !sesion.puedeGestionarPid) {
    mostrarAviso('Requiere rol SuperUsuario o Admin para cargar P&ID.', true);
    return;
  }

  const html =
    '<div class="cargaPIDGrid">' +
      // ---- Columna izquierda: vista previa con zoom ----
      '<div id="visorCargaPID" class="cargaPIDPrevia">' +
        '<canvas id="canvasCargaPID"></canvas>' +
        '<div id="vaciaCargaPID" class="cargaPIDPreviaVacia">' +
          'Seleccioná un archivo para ver la vista previa.<br>Usá la rueda del mouse para hacer zoom y leer los datos del plano.' +
        '</div>' +
        '<div id="zoomBarCargaPID" class="cargaPIDZoomBar" style="display:none;">' +
          '<button type="button" id="btnZoomMenosCargaPID" class="btnSecundario" title="Menos zoom">−</button>' +
          '<span id="zoomValorCargaPID" class="zoomValor">100%</span>' +
          '<button type="button" id="btnZoomMasCargaPID" class="btnSecundario" title="Más zoom">+</button>' +
          '<button type="button" id="btnAjustarCargaPID" class="btnSecundario" title="Ajustar a la ventana">⤢</button>' +
        '</div>' +
      '</div>' +
      // ---- Columna derecha: datos ----
      '<div class="cargaPIDCampos">' +
        '<p style="margin:0;color:#888;font-size:12px;line-height:1.4;">' +
          'Subí un PDF multipágina (se convierte a PNG 300 dpi) o uno o varios PNG. ' +
          'Las páginas quedarán disponibles en la lista, sin calibrar.' +
        '</p>' +
        '<label>Archivo(s):' +
          '<input type="file" id="inpArchivoPID" accept=".pdf,image/png" multiple></label>' +
        '<div id="infoArchivoPID" style="font-size:12px;color:#888;"></div>' +
        '<label>Nombre del P&amp;ID:' +
          '<input type="text" id="inpNombrePID" class="entradaMayusculas" placeholder="Ej: FA00014-ACO-LT2E-PTC-R-PI-001"></label>' +
        '<label>Hoja:' +
          '<span class="filaHojaPID">' +
            '<input type="number" id="inpHojaPID" min="1" step="1" placeholder="1">' +
            '<span class="textoDeHoja">de</span>' +
            '<input type="number" id="inpHojaTotalPID" min="1" step="1" placeholder="3">' +
          '</span>' +
        '</label>' +
        '<div class="filaCampos">' +
          '<label>Revisión:' +
            '<input type="text" id="inpRevPID" class="entradaMayusculas" placeholder="Ej: 1 o A" maxlength="3"></label>' +
        '</div>' +
        '<label class="campoCheckboxModal">' +
          '<input type="checkbox" id="inpReemplazarPID"> Reemplazar si ya existe' +
        '</label>' +
      '</div>' +
    '</div>';

  const modal = abrirModal('Cargar nuevo P&ID', html, function () {
    return ejecutarCargaPID();
  }, { textoAceptar: 'Cargar' });

  const caja = $('modalCaja');
  if (caja) caja.classList.add('modalCargaPID');
  if (modal && typeof modal.alCerrar === 'function') modal.alCerrar(function () {
    if (caja) caja.classList.remove('modalCargaPID');
  });

  // Enganchar cambio de archivo y el visor de vista previa
  setTimeout(function () {
    inicializarVisorCargaPID();
    engancharEntradaMayusculas('inpNombrePID');
    engancharEntradaMayusculas('inpRevPID');

    const inp = $('inpArchivoPID');
    if (!inp) return;
    inp.addEventListener('change', function () {
      const info = $('infoArchivoPID');
      const archivos = Array.from(inp.files || []);
      if (archivos.length === 0) {
        if (info) info.textContent = '';
        limpiarVisorCargaPID();
        return;
      }
      const esPDF = archivos.length === 1 && /\.pdf$/i.test(archivos[0].name);
      if (esPDF) {
        info.textContent = 'PDF seleccionado: ' + archivos[0].name + ' (' + Math.round(archivos[0].size / 1024) + ' KB). Se convertirá a PNG a 300 dpi.';
        leerCantidadPaginasPDF(archivos[0]).then(function (n) {
          if (n > 0) {
            const pag = $('inpHojaPID');
            const tot = $('inpHojaTotalPID');
            if (pag && !pag.value) pag.value = 1;
            if (tot && !tot.value) tot.value = n;
            info.textContent = 'PDF: ' + archivos[0].name + ' — ' + n + ' página(s). Se convertirá a PNG a 300 dpi.';
            cargarPreviaCargaPID(archivos[0], 'pdf');
          }
        }).catch(function () {});
        cargarPreviaCargaPID(archivos[0], 'pdf');
      } else {
        info.textContent = archivos.length + ' PNG seleccionado(s). Total de páginas = ' + archivos.length + '.';
        const pag = $('inpHojaPID');
        const tot = $('inpHojaTotalPID');
        if (pag && !pag.value) pag.value = 1;
        if (tot && !tot.value) tot.value = archivos.length;
        cargarPreviaCargaPID(archivos[0], 'png');
      }
    });

    // Al cambiar la página, re-renderizar la previa del PDF
    const hojaInp = $('inpHojaPID');
    if (hojaInp) {
      hojaInp.addEventListener('change', function () {
        const archivos = Array.from(($('inpArchivoPID') || {}).files || []);
        if (archivos.length === 1 && /\.pdf$/i.test(archivos[0].name)) {
          cargarPreviaCargaPID(archivos[0], 'pdf');
        }
      });
    }
  }, 60);
}

// ============ Modificar datos de un P&ID existente ============
// Reutiliza el mismo layout (previa a la izquierda + campos a la derecha)
// y el mismo visor con zoom que el modal de carga.
function abrirModalModificarPID(pid, hoja, rev) {
  if (!sesion || !sesion.puedeGestionarPid) {
    mostrarAviso('Requiere rol SuperUsuario o Admin para modificar P&ID.', true);
    return;
  }

  const hojaTexto = formatearHoja(hoja);
  const hojaParseada = parsearHojaEntrada(hojaTexto) || { actual: 1, total: 1 };

  const html =
    '<div class="cargaPIDGrid">' +
      '<div id="visorCargaPID" class="cargaPIDPrevia">' +
        '<canvas id="canvasCargaPID"></canvas>' +
        '<div id="vaciaCargaPID" class="cargaPIDPreviaVacia">' +
          'Cargando vista previa…<br>Usá la rueda del mouse para hacer zoom y leer los datos del plano.' +
        '</div>' +
        '<div id="zoomBarCargaPID" class="cargaPIDZoomBar" style="display:none;">' +
          '<button type="button" id="btnZoomMenosCargaPID" class="btnSecundario" title="Menos zoom">−</button>' +
          '<span id="zoomValorCargaPID" class="zoomValor">100%</span>' +
          '<button type="button" id="btnZoomMasCargaPID" class="btnSecundario" title="Más zoom">+</button>' +
          '<button type="button" id="btnAjustarCargaPID" class="btnSecundario" title="Ajustar a la ventana">⤢</button>' +
        '</div>' +
      '</div>' +
      '<div class="cargaPIDCampos">' +
        '<p style="margin:0;color:#888;font-size:12px;line-height:1.4;">' +
          'Se renombra el archivo del P&amp;ID y se actualizan todas las referencias en los listados.' +
        '</p>' +
        '<label>Nombre del P&amp;ID:' +
          '<input type="text" id="inpNombrePID" class="entradaMayusculas" value="' + escaparHTML(pid) + '"></label>' +
        '<label>Hoja:' +
          '<span class="filaHojaPID">' +
            '<input type="number" id="inpHojaPID" min="1" step="1" value="' + hojaParseada.actual + '">' +
            '<span class="textoDeHoja">de</span>' +
            '<input type="number" id="inpHojaTotalPID" min="1" step="1" value="' + hojaParseada.total + '">' +
          '</span>' +
        '</label>' +
        '<div class="filaCampos">' +
          '<label>Revisión:' +
            '<input type="text" id="inpRevPID" class="entradaMayusculas" maxlength="3" value="' + escaparHTML(rev) + '"></label>' +
        '</div>' +
      '</div>' +
    '</div>';

  const modal = abrirModal('Modificar datos del P&ID', html, function () {
    return ejecutarModificarPID(pid, hojaTexto, rev);
  }, { textoAceptar: 'Guardar cambios' });

  const caja = $('modalCaja');
  if (caja) caja.classList.add('modalCargaPID');
  if (modal && typeof modal.alCerrar === 'function') modal.alCerrar(function () {
    if (caja) caja.classList.remove('modalCargaPID');
  });

  setTimeout(function () {
    inicializarVisorCargaPID();
    engancharEntradaMayusculas('inpNombrePID');
    engancharEntradaMayusculas('inpRevPID');
    cargarPreviaDesdeServidor(pid, hojaTexto, rev);
  }, 60);
}

// Carga una imagen ya existente del servidor en el visor del modal.
function cargarPreviaDesdeServidor(pid, hoja, rev) {
  const v = _visorCargaPID;
  if (!v.canvas || !v.cont) return;

  const img = new Image();
  img.onload = function () {
    v.canvas.width = img.naturalWidth;
    v.canvas.height = img.naturalHeight;
    const ctx = v.canvas.getContext('2d');
    ctx.clearRect(0, 0, v.canvas.width, v.canvas.height);
    ctx.drawImage(img, 0, 0);
    const vacia = $('vaciaCargaPID');
    if (vacia) vacia.style.display = 'none';
    const barra = $('zoomBarCargaPID');
    if (barra) barra.style.display = 'flex';
    _ajustarCargaPID();
  };
  img.onerror = function () {
    const vacia = $('vaciaCargaPID');
    if (vacia) vacia.textContent = 'No se pudo cargar la vista previa.';
  };
  img.src = '/api/pid/' + encodeURIComponent(pid) + '/' +
            encodeURIComponent(hoja) + '/' +
            encodeURIComponent(rev) + '/imagen';
}

async function ejecutarModificarPID(pidViejo, hojaVieja, revVieja) {
  const nombre = (($('inpNombrePID') || {}).value || '').trim().toUpperCase();
  const rev = (($('inpRevPID') || {}).value || '').trim().toUpperCase();

  if (!nombre) { mostrarAviso('Ingresá el nombre del P&ID.', true); return false; }
  if (!rev) { mostrarAviso('Ingresá la revisión.', true); return false; }
  const hoja = leerHojaDeInputs();
  if (!hoja) { mostrarAviso('Hoja inválida. Indicá página y total (ej: 1 de 3).', true); return false; }

  mostrarAviso('Guardando cambios...');

  try {
    const r = await fetchAPI(
      '/api/pid/' + encodeURIComponent(pidViejo) + '/' +
      encodeURIComponent(hojaVieja) + '/' +
      encodeURIComponent(revVieja) + '/modificar',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nombre,
          hoja: hoja.actual + '/' + hoja.total,
          revision: rev
        })
      }
    );
    const d = await r.json();
    if (!r.ok || d.error) {
      mostrarAviso(d.error || ('HTTP ' + r.status), true);
      return false;
    }

    let msg = 'P&ID modificado: ' + d.pid + ' ' + d.hojaTexto + ' Rev' + d.revision + '.';
    if (d.referenciasActualizadas > 0) {
      msg += ' (' + d.referenciasActualizadas + ' referencia(s) actualizada(s)).';
    }
    mostrarAviso(msg);

    await cargarPIDs();

    // Si hay un listado abierto, refrescar sus datos SIN NAVEGAR.
    // OJO: recargarPidsDelListadoActual() ademas cambia de pantalla
    // (mostrarPantallaConFade a pantallaListadoAbierto, pestaña 'pids') y
    // sacaba al usuario de la pantalla P&ID general al modificar desde ahi.
    // _cargarDatosListado() solo trae los datos y NO toca la pantalla visible.
    if (typeof listadoActual !== 'undefined' && listadoActual &&
        typeof _cargarDatosListado === 'function') {
      try {
        await _cargarDatosListado(listadoActual.id);
        if (typeof dibujarTablaPidsDelListado === 'function') {
          dibujarTablaPidsDelListado();
        }
        if (typeof actualizarEtiquetaDuenioListado === 'function') {
          actualizarEtiquetaDuenioListado();
        }
      } catch (e) {
        console.warn('No se pudo refrescar el listado abierto:', e);
      }
    }

    return true;
  } catch (e) {
    mostrarAviso('Error al modificar: ' + e.message, true);
    return false;
  }
}

// Lee la cantidad de páginas de un PDF usando pdf.js cargado por CDN (solo lectura de metadatos).
function leerCantidadPaginasPDF(file) {
  return new Promise(function (resolve, reject) {
    const url = URL.createObjectURL(file);
    cargarPdfJsSiHaceFalta().then(function (pdfjsLib) {
      const assets = pdfjsLib.__pidAssets || {};
      pdfjsLib.getDocument({ url: url, cMapUrl: assets.cMapUrl, cMapPacked: assets.cMapPacked, wasmUrl: assets.wasmUrl }).promise.then(function (doc) {
        URL.revokeObjectURL(url);
        resolve(doc.numPages);
      }).catch(function (e) { URL.revokeObjectURL(url); reject(e); });
    }).catch(reject);
  });
}

let _pdfjsPromise = null;
function cargarPdfJsSiHaceFalta() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (_pdfjsPromise) return _pdfjsPromise;
  _pdfjsPromise = (async function () {
    // Build ESM local de pdfjs-dist (vendorizado en public/js/vendor/pdfjs6).
    // Funciona sin internet: worker, cmaps y wasm se sirven desde el propio server.
    let mod;
    try {
      mod = await import('/js/vendor/pdfjs6/pdf.min.mjs');
    } catch (e) {
      throw new Error('No se pudo cargar pdf.js local (vendor): ' + (e && e.message ? e.message : e));
    }
    if (!mod || !mod.GlobalWorkerOptions || !mod.getDocument) {
      throw new Error('pdf.js local no expone la API esperada.');
    }
    mod.GlobalWorkerOptions.workerSrc = '/js/vendor/pdfjs6/pdf.worker.min.mjs';
    // Recursos auxiliares locales (sin CDN).
    mod.GlobalWorkerOptions.workerPort = undefined;
    // Algunos builds aceptan estas rutas al crear el documento; las dejamos
    // expuestas para que getDocument las use si se pasan como opciones.
    mod.__pidAssets = {
      cMapUrl: '/js/vendor/pdfjs6/cmaps/',
      cMapPacked: true,
      wasmUrl: '/js/vendor/pdfjs6/wasm/'
    };
    // Compatibilidad: otros scripts podrían chequear window.pdfjsLib.
    window.pdfjsLib = mod;
    return mod;
  })();
  return _pdfjsPromise;
}

// ============ Vista previa del archivo a cargar (con zoom) ============
//
// El visor vive dentro del propio modal de carga (columna izquierda).
// Se puede hacer zoom con la rueda del mouse y desplazar arrastrando.

const _visorCargaPID = {
  canvas: null,
  cont: null,
  zoom: 1,
  zoomMin: 0.05,
  zoomMax: 10,
  offX: 0,
  offY: 0,
  arrastrando: false,
  ini: null,
  offIni: null,
  iniciado: false,
  cargando: false,
  acumuladorWheel: 0
};

// Ajusta offX/offY para que NUNCA se vea fondo negro alrededor de la hoja:
// si la hoja es mas chica que el contenedor en un eje, la centra; si es mas
// grande, la limita para que sus bordes no entren dentro del contenedor.
function _limitarOffsetsCargaPID() {
  const v = _visorCargaPID;
  if (!v.canvas || !v.cont || !v.canvas.width) return;
  const w = v.cont.clientWidth;
  const h = v.cont.clientHeight;
  const ancho = v.canvas.width * v.zoom;
  const alto = v.canvas.height * v.zoom;

  if (ancho <= w) v.offX = (w - ancho) / 2;
  else v.offX = Math.min(0, Math.max(w - ancho, v.offX));

  if (alto <= h) v.offY = (h - alto) / 2;
  else v.offY = Math.min(0, Math.max(h - alto, v.offY));
}

function _aplicarTransformCargaPID() {
  const v = _visorCargaPID;
  if (!v.canvas) return;
  _limitarOffsetsCargaPID();
  v.canvas.style.transform =
    'translate(' + v.offX + 'px,' + v.offY + 'px) scale(' + v.zoom + ')';
  const etiqueta = $('zoomValorCargaPID');
  if (etiqueta) etiqueta.textContent = Math.round(v.zoom * 100) + '%';
}

function _ajustarCargaPID() {
  const v = _visorCargaPID;
  if (!v.canvas || !v.cont || !v.canvas.width) return;
  const w = v.cont.clientWidth;
  const h = v.cont.clientHeight;
  const escalaX = w / v.canvas.width;
  const escalaY = h / v.canvas.height;
  // El zoom minimo es exactamente "ajustar": la hoja completa, sin negro.
  v.zoomMin = Math.min(escalaX, escalaY);
  v.zoom = Math.min(escalaX, escalaY);
  v.offX = (w - v.canvas.width * v.zoom) / 2;
  v.offY = (h - v.canvas.height * v.zoom) / 2;
  _aplicarTransformCargaPID();
}

function _zoomCentroCargaPID(factor) {
  const v = _visorCargaPID;
  if (!v.canvas || !v.cont) return;
  const w = v.cont.clientWidth;
  const h = v.cont.clientHeight;
  const nuevo = Math.max(v.zoomMin, Math.min(v.zoomMax, v.zoom * factor));
  const k = nuevo / v.zoom;
  v.offX = w / 2 - (w / 2 - v.offX) * k;
  v.offY = h / 2 - (h / 2 - v.offY) * k;
  v.zoom = nuevo;
  _aplicarTransformCargaPID();
}

function inicializarVisorCargaPID() {
  const v = _visorCargaPID;
  v.cont = $('visorCargaPID');
  v.canvas = $('canvasCargaPID');
  if (!v.cont || !v.canvas) return;

  // Cada apertura del modal recrea #visorCargaPID / #canvasCargaPID, asi
  // que re-enganchamos los listeners sobre el contenedor NUEVO. Antes se
  // usaba un flag global 'iniciado' que impedia volver a engancharlos y el
  // zoom dejaba de andar en la segunda apertura (p.ej. Modificar datos).
  if (v._contEnganchado !== v.cont) {
    // Quitamos los handlers de document de la apertura anterior (si habia)
    // para no acumular listeners.
    if (v._onMove) document.removeEventListener('mousemove', v._onMove);
    if (v._onUp) document.removeEventListener('mouseup', v._onUp);

    v._contEnganchado = v.cont;
    v.iniciado = true;

    // Cursor por defecto del visor: lupa simple SIN signo (ni + ni -).
    // CSS no tiene una lupa sin signo nativa, asi que usamos un SVG inline
    // (circulo + mango) codificado como data URI. El 'hotspot' (16 16) cae
    // justo en el centro de la lente.
    const CURSOR_LUPA_SIMPLE =
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
    v.cont.style.cursor = CURSOR_LUPA_SIMPLE;
    v._cursorLupa = CURSOR_LUPA_SIMPLE;

    // Mismo comportamiento que el canvas de marcado: acumula deltaY y
    // avanza/retrocede en pasos de 1.25x cada 100 de acumulación.
    v.cont.addEventListener('wheel', function (e) {
      if (!v.canvas.width) return;
      e.preventDefault();
      v.acumuladorWheel += e.deltaY;
      if (Math.abs(v.acumuladorWheel) < 100) return;
      const direccion = v.acumuladorWheel > 0 ? -1 : 1;
      v.acumuladorWheel = 0;
      const factor = direccion > 0 ? 1.25 : 1 / 1.25;

      const r = v.cont.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const nuevo = Math.max(v.zoomMin, Math.min(v.zoomMax, v.zoom * factor));
      const k = nuevo / v.zoom;
      v.offX = mx - (mx - v.offX) * k;
      v.offY = my - (my - v.offY) * k;
      v.zoom = nuevo;
      _aplicarTransformCargaPID();
    }, { passive: false });

    v.cont.addEventListener('mousedown', function (e) {
      if (!v.canvas.width) return;
      // El desplazamiento (pan) se activa SOLO con el boton del medio.
      // En ese caso el cursor pasa a 'move' (manito con 4 flechas).
      if (e.button !== 1) return;
      e.preventDefault();
      v.arrastrando = true;
      v.ini = { x: e.clientX, y: e.clientY };
      v.offIni = { x: v.offX, y: v.offY };
      v.cont.style.cursor = 'move';
    });

    // Evita el auto-scroll que dispara el boton del medio en algunos
    // navegadores; si no, el pan queda interrumpido.
    v.cont.addEventListener('auxclick', function (e) {
      if (e.button === 1) e.preventDefault();
    });

    v._onMove = function (e) {
      if (!v.arrastrando) return;
      v.offX = v.offIni.x + (e.clientX - v.ini.x);
      v.offY = v.offIni.y + (e.clientY - v.ini.y);
      _aplicarTransformCargaPID();
    };
    document.addEventListener('mousemove', v._onMove);

    v._onUp = function () {
      if (!v.arrastrando) return;
      v.arrastrando = false;
      if (v.cont) v.cont.style.cursor = v._cursorLupa || 'default';
    };
    document.addEventListener('mouseup', v._onUp);

    const mas = $('btnZoomMasCargaPID');
    if (mas) mas.onclick = function () { _zoomCentroCargaPID(1.25); };
    const menos = $('btnZoomMenosCargaPID');
    if (menos) menos.onclick = function () { _zoomCentroCargaPID(1 / 1.25); };
    const ajustar = $('btnAjustarCargaPID');
    if (ajustar) ajustar.onclick = _ajustarCargaPID;
  }
}

function limpiarVisorCargaPID() {
  const v = _visorCargaPID;
  if (!v.canvas) return;
  v.canvas.width = 0;
  v.canvas.height = 0;
  v.cargando = false;
  v.acumuladorWheel = 0;
  const vacia = $('vaciaCargaPID');
  if (vacia) vacia.style.display = '';
  const barra = $('zoomBarCargaPID');
  if (barra) barra.style.display = 'none';
}

function cargarPreviaCargaPID(file, tipo) {
  const v = _visorCargaPID;
  if (!v.canvas || !v.cont) return;

  function dibujar(src) {
    const img = new Image();
    img.onload = function () {
      v.canvas.width = img.naturalWidth;
      v.canvas.height = img.naturalHeight;
      const ctx = v.canvas.getContext('2d');
      ctx.clearRect(0, 0, v.canvas.width, v.canvas.height);
      ctx.drawImage(img, 0, 0);
      const vacia = $('vaciaCargaPID');
      if (vacia) vacia.style.display = 'none';
      const barra = $('zoomBarCargaPID');
      if (barra) barra.style.display = 'flex';
      _ajustarCargaPID();
    };
    img.onerror = function () {
      limpiarVisorCargaPID();
    };
    img.src = src;
  }

  if (tipo === 'png') {
    const url = URL.createObjectURL(file);
    dibujar(url);
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
    return;
  }

  // PDF: renderizar la página indicada en "Página (N/M)" a buena resolución.
  const pagina = (leerHojaDeInputs() || { actual: 1 }).actual;
  v.cargando = true;
  // Primero a escala 2 (buena resolución). Si falla (PDF grande o con
  // objetos que pdf.js no puede decodificar a ese tamaño), reintenta a
  // escala 1. Si vuelve a fallar, muestra el motivo real en el panel.
  renderizarPaginaPDFaDataURL(file, pagina, 2)
    .catch(function () { return renderizarPaginaPDFaDataURL(file, pagina, 1); })
    .then(function (dataUrl) {
      v.cargando = false;
      dibujar(dataUrl);
    }).catch(function (err) {
      v.cargando = false;
      limpiarVisorCargaPID();
      const vacia = $('vaciaCargaPID');
      if (vacia) {
        vacia.style.display = '';
        vacia.textContent = 'No se pudo mostrar la vista previa: ' +
          (err && err.message ? err.message : 'error desconocido') + '.';
      }
    });
}

function renderizarPaginaPDFaDataURL(file, numeroPagina, escala) {
  return new Promise(function (resolve, reject) {
    const url = URL.createObjectURL(file);
    cargarPdfJsSiHaceFalta().then(function (pdfjsLib) {
      const assets = pdfjsLib.__pidAssets || {};
      pdfjsLib.getDocument({ url: url, cMapUrl: assets.cMapUrl, cMapPacked: assets.cMapPacked, wasmUrl: assets.wasmUrl }).promise.then(function (doc) {
        const n = Math.max(1, Math.min(doc.numPages, numeroPagina || 1));
        return doc.getPage(n).then(function (pagina) {
          const viewport = pagina.getViewport({ scale: escala || 1 });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const ctx = canvas.getContext('2d');
          return pagina.render({ canvasContext: ctx, viewport: viewport }).promise.then(function () {
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL('image/png'));
          });
        });
      }).catch(function (e) { URL.revokeObjectURL(url); reject(e); });
    }).catch(reject);
  });
}

// Fuerza el valor REAL de un input a mayusculas mientras se tipea
// (text-transform:uppercase solo cambia lo visual, no el value).
function engancharEntradaMayusculas(idInput) {
  const el = $(idInput);
  if (!el || el._mayusEnganchado) return;
  el._mayusEnganchado = true;
  el.addEventListener('input', function () {
    const pos = el.selectionStart;
    const fin = el.selectionEnd;
    const up = el.value.toUpperCase();
    if (up !== el.value) {
      el.value = up;
      try { el.setSelectionRange(pos, fin); } catch (e) {}
    }
  });
}

function leerArchivoBase64(file) {
  return new Promise(function (resolve, reject) {
    const r = new FileReader();
    r.onload = function () {
      const s = String(r.result || '');
      const i = s.indexOf(',');
      resolve(i >= 0 ? s.substring(i + 1) : '');
    };
    r.onerror = function () { reject(new Error('No se pudo leer ' + file.name)); };
    r.readAsDataURL(file);
  });
}

// Lee los dos inputs (página y total) y devuelve {actual,total} o null.
function leerHojaDeInputs() {
  const pagEl = $('inpHojaPID');
  const totEl = $('inpHojaTotalPID');
  const actual = parseInt(pagEl ? pagEl.value : '', 10);
  const total = parseInt(totEl ? totEl.value : '', 10);
  if (isNaN(actual) || isNaN(total)) return null;
  if (total < 1 || actual < 1 || actual > total) return null;
  return { actual: actual, total: total };
}

function parsearHojaEntrada(texto) {
  // OJO: la clase [\/de] matchea UN caracter de {'/', 'd', 'e'}, no el
  // literal "de". Por eso "2de2" fallaba y el modal mostraba siempre 1 de 1.
  // El separador correcto es "de" o "/" (con espacios opcionales).
  const m = String(texto || '').match(/^\s*(\d+)\s*(?:de|\/)\s*(\d+)\s*$/i);
  if (!m) return null;
  const actual = parseInt(m[1], 10), total = parseInt(m[2], 10);
  if (isNaN(actual) || isNaN(total) || total < 1 || actual < 1 || actual > total) return null;
  return { actual: actual, total: total };
}

async function ejecutarCargaPID() {
  const inp = $('inpArchivoPID');
  const nombre = ($('inpNombrePID').value || '').trim().toUpperCase();
  const rev = ($('inpRevPID').value || '').trim().toUpperCase();
  const reemplazar = !!$('inpReemplazarPID').checked;

  if (!nombre) { mostrarAviso('Ingresá el nombre del P&ID.', true); return false; }
  if (!rev) { mostrarAviso('Ingresá la revisión.', true); return false; }
  const hoja = leerHojaDeInputs();
  if (!hoja) { mostrarAviso('Hoja inválida. Indicá página y total (ej: 1 de 3).', true); return false; }

  const archivos = Array.from(inp.files || []);
  if (archivos.length === 0) { mostrarAviso('Seleccioná al menos un archivo.', true); return false; }

  const esPDF = archivos.length === 1 && /\.pdf$/i.test(archivos[0].name);

  mostrarAviso('Cargando P&ID... (puede tardar si el PDF es grande)');

  let payload;
  try {
    if (esPDF) {
      const base64 = await leerArchivoBase64(archivos[0]);
      payload = {
        tipo: 'pdf',
        nombre: nombre,
        paginaInicial: hoja.actual,
        totalPaginas: hoja.total,
        revision: rev,
        pdfBase64: base64,
        reemplazar: reemplazar
      };
    } else {
      const pngs = [];
      for (let i = 0; i < archivos.length; i++) {
        if (!/\.png$/i.test(archivos[i].name)) {
          mostrarAviso('Solo se aceptan PNG cuando no es un único PDF.', true);
          return false;
        }
        pngs.push(await leerArchivoBase64(archivos[i]));
      }
      payload = {
        tipo: 'png',
        nombre: nombre,
        paginaInicial: hoja.actual,
        totalPaginas: hoja.total,
        revision: rev,
        pngsBase64: pngs,
        reemplazar: reemplazar
      };
    }
  } catch (e) {
    mostrarAviso('Error leyendo archivos: ' + e.message, true);
    return false;
  }

  try {
    const r = await fetchAPI('/api/pids/cargar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const d = await r.json();
    if (!r.ok || d.error) {
      mostrarAviso(d.error || ('HTTP ' + r.status), true);
      return false;
    }
    const cant = (d.guardados || []).length;
    const conf = (d.conflictos || []).length;
    let msg = 'P&ID cargado: ' + cant + ' página(s) guardada(s).';
    if (conf > 0) msg += ' ' + conf + ' ya existían y no se reemplazaron.';
    mostrarAviso(msg);
    await cargarPIDs();
    return true;
  } catch (e) {
    mostrarAviso('Error al cargar: ' + e.message, true);
    return false;
  }
}

function asegurarPIDsCargados() {
  if (pids && pids.length > 0) {
    calcularUltimasRevisiones();
    return Promise.resolve();
  }
  return fetchAPI('/api/pid')
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.pids) {
        pids = d.pids;
        calcularUltimasRevisiones();
      }
    })
    .catch(function () { /* noop */ });
}