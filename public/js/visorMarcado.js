// ================================================================
// Visor de marcado - Núcleo
// ================================================================
// Apertura del visor, cancelar/volver, guardar, editar modal,
// zoom (ajustar/clampear), renumeración global, parpadeo, etc.

// Función auxiliar para calcular la grilla imaginaria

// Calcula la celda de la grilla imaginaria (A-H en X, 1-4 en Y).
//
// La grilla se apoya en el AREA CALIBRADA del P&ID (rectangulo definido por
// punto00 = esquina inf. izq. y punto100 = esquina sup. der., en pixeles de
// la imagen). Asi la grilla coincide con el marco del plano y no con los
// margenes del PNG.
//
// Compatibilidad: si se llama sin los puntos de calibracion (o el P&ID no
// esta calibrado), cae al comportamiento anterior: usa el tamano completo
// de la imagen (0..ancho, 0..alto).
function calcularUbicacionGrilla(x, y, ancho, alto, punto00, punto100) {
  if (x === null || x === undefined || y === null || y === undefined) return null;

  // Rectangulo de referencia.
  let x0 = 0, x1 = ancho, y0 = 0, y1 = alto;
  if (punto00 && punto100 &&
      isFinite(punto00.x) && isFinite(punto00.y) &&
      isFinite(punto100.x) && isFinite(punto100.y)) {
    x0 = Math.min(punto00.x, punto100.x);
    x1 = Math.max(punto00.x, punto100.x);
    y0 = Math.min(punto00.y, punto100.y);
    y1 = Math.max(punto00.y, punto100.y);
  }

  const anchoRef = x1 - x0;
  const altoRef = y1 - y0;
  if (!anchoRef || !altoRef || anchoRef <= 0 || altoRef <= 0) return null;

  // Fuera del area de referencia -> sin ubicacion.
  if (x < x0 || x > x1 || y < y0 || y > y1) return null;

  // Normalizamos la posicion al [0,1] dentro del area de referencia.
  const nx = (x - x0) / anchoRef;
  const ny = (y - y0) / altoRef;

  // Eje X: 8 partes de derecha a izquierda (A es derecha, H es izquierda)
  let colIndex = Math.floor((1 - nx) * 8);
  if (colIndex < 0) colIndex = 0;
  if (colIndex > 7) colIndex = 7;
  const letras = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const letra = letras[colIndex];

  // Eje Y: 4 partes de abajo hacia arriba (1 es abajo, 4 es arriba)
  // Como y crece hacia abajo en la imagen:
  let rowIndex = Math.floor((1 - ny) * 4);
  if (rowIndex < 0) rowIndex = 0;
  if (rowIndex > 3) rowIndex = 3;
  const numero = rowIndex + 1;

  return letra + numero;
}

// Devuelve el rectangulo valido para ubicar marcas/líneas: el AREA
// CALIBRADA (punto00..punto100) si el P&ID esta calibrado; si no, el
// tamano completo de la imagen (fallback). Nunca devuelve null si hay
// imagen cargada.
function areaCalibradaMarc() {
  const ancho = (typeof marc !== 'undefined' && marc.ancho) ? marc.ancho : 0;
  const alto = (typeof marc !== 'undefined' && marc.alto) ? marc.alto : 0;
  let x0 = 0, x1 = ancho, y0 = 0, y1 = alto;
  const cal = (typeof marc !== 'undefined') ? marc.calibracion : null;
  if (cal && cal.punto00 && cal.punto100 &&
      isFinite(cal.punto00.x) && isFinite(cal.punto00.y) &&
      isFinite(cal.punto100.x) && isFinite(cal.punto100.y)) {
    x0 = Math.min(cal.punto00.x, cal.punto100.x);
    x1 = Math.max(cal.punto00.x, cal.punto100.x);
    y0 = Math.min(cal.punto00.y, cal.punto100.y);
    y1 = Math.max(cal.punto00.y, cal.punto100.y);
  }
  return { x0: x0, x1: x1, y0: y0, y1: y1, calibrado: !!(cal && cal.punto00 && cal.punto100) };
}

// Clampea un punto {x, y} al area calibrada (o a la imagen completa si no
// hay calibracion). Devuelve un objeto NUEVO con las coordenadas ajustadas.
function clampearAlAreaCalibrada(p) {
  const a = areaCalibradaMarc();
  let x = p.x, y = p.y;
  if (!isFinite(x)) x = a.x0;
  if (!isFinite(y)) y = a.y0;
  if (x < a.x0) x = a.x0;
  if (x > a.x1) x = a.x1;
  if (y < a.y0) y = a.y0;
  if (y > a.y1) y = a.y1;
  return { x: x, y: y };
}

// Devuelve true si el punto {x, y} esta dentro del area calibrada.
function puntoDentroAreaCalibrada(p) {
  if (!p) return false;
  const a = areaCalibradaMarc();
  return p.x >= a.x0 && p.x <= a.x1 && p.y >= a.y0 && p.y <= a.y1;
}

async function abrirVisorMarcado(pid, hoja, rev, origen) {
  marc.origenVisor = origen || 'pids';
  marc.scrollGuardado = null;
  marc.focoItemId = null;
  marc.focoNumero = null;
  return _abrirVisorMarcadoInterno(pid, hoja, rev);
}

async function abrirVisorMarcadoYCentrar(pid, hoja, rev, itemId, numero) {
  marc.origenVisor = 'marcaciones';
  const cont = $('contenido');
  marc.scrollGuardado = cont ? cont.scrollTop : 0;
  marc.focoItemId = itemId;
  marc.focoNumero = numero;
  return _abrirVisorMarcadoInterno(pid, hoja, rev);
}

async function _abrirVisorMarcadoInterno(pid, hoja, rev) {
  const hojaNorm = formatearHoja(hoja);

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

  marc.soloLectura = !(listadoActual && listadoActual.esPropio);

  if (sesion && sesion.config && sesion.config.Lupa) {
    const lz = parseFloat(sesion.config.Lupa.Zoom) || 3;
    const lt = parseInt(sesion.config.Lupa.Tamano, 10) || 180;
    marc.lupaZoom = lz;
    marc.lupaTamano = lt;
  }
  actualizarControlLupa();

  marc.pid = pid;
  marc.hoja = hojaNorm;
  marc.hojaTexto = info.hojaTexto || hojaNorm;
  marc.rev = rev;
  // Calibracion del P&ID (punto00/punto100) para que la grilla imaginaria
  // de ubicacion se base en el area calibrada y no en el PNG completo.
  marc.calibracion = (info.calibrado && info.calibracion) ? info.calibracion : null;
  marc.zoom = 1;
  // Zoom de referencia para el tamano inicial de la leyenda de lineas:
  // se fija en el primer dibujo (tras ajustar a pantalla) y define el
  // tamano en imagen para que al abrir se vea del tamano ideal.
  marc._zoomLeyendaRef = null;
  marc.offsetX = 0;
  marc.offsetY = 0;
  marc.acumuladorWheel = 0;
  marc.marcas = [];
  marc.seleccionada = null;
  marc.cambios = false;
  marc.arrastrandoMarca = false;
  marc.redimensionandoMarca = false;
  marc.arrastrandoEtiqueta = false;
  marc.tempIdSiguiente = 1;
  marc.maxNumeroGlobal = 0;
  marc.todosLosItems = [];
  marc.tempIdItemNegativo = -1;
  marc.ultimaSeleccionadaEnPanel = -1;
  marc.parpadeoActivo = false;
  marc.parpadeoMostrando = true;
  marc.parpadeoToken = 0;
  marc.virtual = null;
  marc.mouseSobreLienzo = false;
  marc.cruzVirtualEl = null;
  marc.mostrarMarcas = true;
  marc.mostrarLineas = true;
  marc.tabActiva = 'marcas';

  const chkMarcas = $('chkVerMarcas');
  const chkLineas = $('chkVerLineas');
  if (chkMarcas) chkMarcas.checked = true;
  if (chkLineas) chkLineas.checked = true;

  const img = new Image();
  img.onload = function () {
    marc.imagen = img;
    marc.ancho = img.naturalWidth;
    marc.alto = img.naturalHeight;

    $('tituloMarcPID').textContent = pid;
    $('subtituloMarcRev').textContent = 'Rev ' + rev;

    const chipM = $('chipHojaMarc');
    if (chipM) {
      chipM.textContent = 'Hoja ' + marc.hojaTexto;
      chipM.style.display = '';
    }

    actualizarAvisoSoloLectura();

    Promise.all([
      fetchAPI('/api/listados/' + listadoActual.id + '/items/' +
               encodeURIComponent(pid) + '/' +
               encodeURIComponent(hojaNorm) + '/' +
               encodeURIComponent(rev)).then(function (r) { return r.json(); }),
      fetchAPI('/api/listados/' + listadoActual.id + '/items').then(function (r) { return r.json(); })
    ]).then(function (resultados) {
      const delPid = resultados[0].items || [];
      const todos = resultados[1].items || [];

      marc.todosLosItems = todos.map(function (it) {
        return {
          id: it.id,
          numero: (it.numero !== undefined && it.numero !== null) ? it.numero : null,
          pid_nombre: it.pid_nombre,
          pid_hoja: it.pid_hoja,
          pid_revision: it.pid_revision,
          borrado: false
        };
      });

      delPid.forEach(function (it) {
        marc.marcas.push({
          id: it.id,
          tempId: marc.tempIdSiguiente++,
          numero: (it.numero !== undefined && it.numero !== null) ? it.numero : null,
          tag: it.tag || '',
          descripcion: it.descripcion || '',
          diametro: (it.diametro !== null && it.diametro !== undefined) ? it.diametro : null,
          csoCsc: (it.cso_csc === 1 || it.cso_csc === true) ? 1 : 0,
          estado: it.estado || 'otro',
          forma: it.forma || 'circulo',
          tamano: it.tamano || 14,
          tamanoY: (it.tamano_y !== null && it.tamano_y !== undefined) ? it.tamano_y : (it.tamano || 14),
          x: it.x,
          y: it.y,
          etiquetaOffsetX: (it.etiqueta_offset_x !== null && it.etiqueta_offset_x !== undefined) ? it.etiqueta_offset_x : null,
          etiquetaOffsetY: (it.etiqueta_offset_y !== null && it.etiqueta_offset_y !== undefined) ? it.etiqueta_offset_y : null,
          nuevo: false,
          borrado: false
        });
      });

      renumerarTodoElListado();

      ocultarTodasLasPantallas();
      $('pantallaMarcado').style.display = 'flex';

      marc.cruzVirtualEl = crearCruzVirtual('capaMarcadoresMarc');

      // Cargar los hipervínculos del P&ID para mostrarlos y permitir navegar.
      if (typeof inicializarHipervMarc === 'function') {
        inicializarHipervMarc(pid, hojaNorm, rev);
      }

      ajustarMarcAPantalla();
      actualizarEstadoMarc();
      dibujarMarc();
      dibujarListaMarcas();
      actualizarPanelPropiedades();
      actualizarBotonGuardar();

      const lienzo = $('lienzoMarc');
      if (lienzo) {
        lienzo.setAttribute('tabindex', '0');
        lienzo.focus();
      }

      // Inicializar líneas del P&ID (carga, snapshot, leyenda)
      if (typeof inicializarModoLineas === 'function') {
        inicializarModoLineas(pid, hojaNorm, rev, listadoActual.id);
      }

      if (marc.focoItemId !== null) {
        let marcaFoco = marc.marcas.find(function (m) { return m.id === marc.focoItemId; });
        if (!marcaFoco && marc.focoNumero !== null) {
          marcaFoco = marc.marcas.find(function (m) { return m.numero === marc.focoNumero; });
        }

        if (marcaFoco) {
          marc.seleccionada = marcaFoco.tempId;
          asegurarMarcaVisible(marcaFoco);
          marc.virtual = { x: marcaFoco.x, y: marcaFoco.y };
          dibujarMarc();
          dibujarListaMarcas();
          actualizarPanelPropiedades();
          actualizarCruzVirtual(marc, marc.cruzVirtualEl);
          actualizarLupaMarc();

          const cfgM = (sesion && sesion.config && sesion.config.Marcadores) || {};
          const veces = cfgM.ParpadeoVeces || 5;
          const intervalo = cfgM.ParpadeoIntervalo || 250;
          parpadearMarca(marcaFoco.tempId, veces, intervalo);
        } else {
          mostrarAviso('No se encontró la marca en este P&ID.', true);
        }

        marc.focoItemId = null;
        marc.focoNumero = null;
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

function actualizarAvisoSoloLectura() {
  const aviso = $('avisoSoloLectura');
  if (!aviso) return;
  if (marc.soloLectura) aviso.style.display = '';
  else aviso.style.display = 'none';
}

function renumerarTodoElListado() {
  const vivas = marc.todosLosItems.filter(function (it) { return !it.borrado; });

  vivas.sort(function (a, b) {
    const na = (a.numero !== null && a.numero !== undefined) ? a.numero : 999999;
    const nb = (b.numero !== null && b.numero !== undefined) ? b.numero : 999999;
    if (na !== nb) return na - nb;
    return a.id - b.id;
  });

  vivas.forEach(function (it, i) {
    it.numero = i + 1;
  });

  marc.marcas.forEach(function (m) {
    const ref = marc.todosLosItems.find(function (it) { return it.id === m.id; });
    if (ref) m.numero = ref.numero;
  });

  marc.maxNumeroGlobal = vivas.length;
}

function ajustarMarcAPantalla() {
  const lienzo = $('lienzoMarc');
  const w = lienzo.clientWidth;
  const h = lienzo.clientHeight;
  const escalaX = w / marc.ancho;
  const escalaY = h / marc.alto;

  marc.zoomMin = Math.min(escalaX, escalaY);
  marc.zoomMax = 20;
  marc.zoom = marc.zoomMin;

  marc.offsetX = (w - marc.ancho * marc.zoom) / 2;
  marc.offsetY = (h - marc.alto * marc.zoom) / 2;

  clampearMarc();
}

function clampearMarc() {
  const lienzo = $('lienzoMarc');
  const w = lienzo.clientWidth;
  const h = lienzo.clientHeight;

  if (marc.zoom < marc.zoomMin) marc.zoom = marc.zoomMin;
  if (marc.zoom > marc.zoomMax) marc.zoom = marc.zoomMax;

  const anchoVisible = marc.ancho * marc.zoom;
  const altoVisible = marc.alto * marc.zoom;

  if (anchoVisible <= w) {
    marc.offsetX = (w - anchoVisible) / 2;
  } else {
    const minX = w - anchoVisible;
    const maxX = 0;
    if (marc.offsetX < minX) marc.offsetX = minX;
    if (marc.offsetX > maxX) marc.offsetX = maxX;
  }

  if (altoVisible <= h) {
    marc.offsetY = (h - altoVisible) / 2;
  } else {
    const minY = h - altoVisible;
    const maxY = 0;
    if (marc.offsetY < minY) marc.offsetY = minY;
    if (marc.offsetY > maxY) marc.offsetY = maxY;
  }
}

function ultimaMarcaValida() {
  const vivas = marc.marcas.filter(function (m) { return !m.borrado; });
  if (vivas.length === 0) return null;
  vivas.sort(function (a, b) { return b.tempId - a.tempId; });
  return vivas[0];
}

function asegurarMarcaVisible(m) {
  const lienzo = $('lienzoMarc');
  if (!lienzo || !m) return;
  if (m.x === null || m.y === null) return;

  const w = lienzo.clientWidth;
  const h = lienzo.clientHeight;

  const pxEnPantalla = m.x * marc.zoom + marc.offsetX;
  const pyEnPantalla = m.y * marc.zoom + marc.offsetY;

  const margen = 60;

  const dentro =
    pxEnPantalla >= margen &&
    pxEnPantalla <= w - margen &&
    pyEnPantalla >= margen &&
    pyEnPantalla <= h - margen;

  if (dentro) return;

  marc.offsetX = (w / 2) - (m.x * marc.zoom);
  marc.offsetY = (h / 2) - (m.y * marc.zoom);

  clampearMarc();
  dibujarMarc();
}

function parpadearMarca(tempId, veces, intervaloMs) {
  veces = veces || 4;
  intervaloMs = intervaloMs || 500;

  marc.parpadeoToken++;
  const miToken = marc.parpadeoToken;

  marc.parpadeoActivo = true;
  marc.parpadeoMostrando = true;

  let i = 0;

  function ciclo() {
    if (miToken !== marc.parpadeoToken) return;

    if (i >= veces * 2) {
      marc.parpadeoActivo = false;
      marc.parpadeoMostrando = true;
      dibujarMarc();
      return;
    }
    marc.parpadeoMostrando = (i % 2 === 0);
    dibujarMarc();
    i++;
    setTimeout(ciclo, intervaloMs / 2);
  }
  ciclo();
}

// =================================================================
// Detección de cambios: helper central
// =================================================================
function hayCambiosSinGuardar() {
  if (marc.cambios) return true;
  if (marc.marcas.some(function (m) { return m.borrado || m.nuevo; })) return true;

  if (typeof lineas !== 'undefined' && lineas.cargado) {
    if (lineas.pendientesGuardar.length > 0) return true;
    if (lineas.pendientesModificar.length > 0) return true;
    if (lineas.pendientesBorrar.length > 0) return true;

    if (typeof _obtenerSnapshot === 'function' && lineas._lineaBase) {
      const actual = JSON.stringify(_obtenerSnapshot());
      const base = JSON.stringify(lineas._lineaBase);
      if (actual !== base) return true;
    }
  }

  return false;
}

function cancelarVisorMarc() {
  $('lupaMarc').style.display = 'none';

  if (hayCambiosSinGuardar()) {
    abrirModal(
      'Salir sin guardar',
      '<p>Hay cambios sin guardar. ¿Querés salir igual?</p>',
      function () { volverDeMarcado(); }
    );
  } else {
    volverDeMarcado();
  }
}

function volverDeMarcado() {
  const origen = marc.origenVisor;
  const scroll = marc.scrollGuardado;

  marc.origenVisor = null;
  marc.scrollGuardado = null;

  // Cortar cualquier parpadeo de línea en curso al salir del visor.
  if (typeof cancelarParpadeoLinea === 'function') cancelarParpadeoLinea();

  marcarMenuActivo('menuListados');

  // 1) Elegir la PESTAÑA de destino segun el origen (misma pantalla).
  if (!listadoActual) {
    irAPantallaListados();
  } else {
    mostrarPantallaConFade('pantallaListadoAbierto', 'block', function () {
      marcarMenuActivo('menuListados');
    });
    if (typeof activarPestanaListado === 'function') {
      let pestana = 'marcaciones';
      if (origen === 'pids') pestana = 'pids';
      else if (origen === 'lineas') pestana = 'lineas';
      activarPestanaListado(pestana);
    }
  }

  // 2) Refrescar SIEMPRE, desde el backend, tanto las marcas (items) como los
  //    P&ID del listado. Asi la tabla de Marcaciones y la de P&ID muestran las
  //    cantidades/altas/bajas al instante, sin necesidad de F5.
  if (listadoActual) {
    const idListado = listadoActual.id;

    // 2a) Marcas (items) del listado -> itemsDelListado + tabla Marcaciones.
    fetchAPI('/api/listados/' + idListado + '/items')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        itemsDelListado = d.items || [];
        dibujarTablaItems();

        if (origen === 'marcaciones' && scroll !== null && scroll !== undefined) {
          const cont = $('contenido');
          if (cont) {
            setTimeout(function () { cont.scrollTop = scroll; }, 20);
          }
        }
      })
      .catch(function () {});

    // 2b) P&ID del listado -> pidsDelListado + tabla de P&ID (cantidad de marcas).
    if (typeof _cargarDatosListado === 'function') {
      _cargarDatosListado(idListado).catch(function () {});
    }
  }
}

// =================================================================
// GUARDAR CAMBIOS (marcas + líneas en un solo flujo)
// =================================================================
// opciones.noNavegar = true -> guarda pero NO vuelve al listado.
// Devuelve true si guardó OK, false si hubo error o no se pudo guardar.
async function guardarCambiosMarc(opciones) {
  const noNavegar = !!(opciones && opciones.noNavegar);
  if (marc.soloLectura) {
    mostrarAviso('Este listado es de solo lectura.', true);
    return;
  }

  if (!hayCambiosSinGuardar()) {
    mostrarAviso('No hay cambios para guardar.');
    return;
  }

  // 1) Líneas primero (si hay).
  if (typeof lineas !== 'undefined' &&
      (lineas.pendientesGuardar.length > 0 ||
       lineas.pendientesModificar.length > 0 ||
       lineas.pendientesBorrar.length > 0)) {
    const okLineas = await guardarLineasPendientes();
    if (!okLineas) return;
  }

  // 2) Marcas después.
  const operaciones = [];

  marc.marcas.forEach(function (m) {
    const cal = marc.calibracion;
    const ubicacion = calcularUbicacionGrilla(
      m.x, m.y, marc.ancho, marc.alto,
      cal ? cal.punto00 : null,
      cal ? cal.punto100 : null
    );

    if (m.borrado && m.id && m.id > 0) {
      operaciones.push(
        ejecutarOperacion(
          fetchAPI('/api/items/' + m.id, { method: 'DELETE' }),
          'borrar marca #' + (m.numero !== null ? m.numero : m.id)
        )
      );
    } else if (m.borrado) {
      // Marca nueva (id negativo o nulo) borrada antes de guardar: no existia
      // en el backend, no hay nada que eliminar.
    } else if (m.id && m.id > 0) {
      operaciones.push(
        ejecutarOperacion(
          fetchAPI('/api/items/' + m.id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tag: m.tag,
              descripcion: m.descripcion,
              diametro: m.diametro,
              cso_csc: m.csoCsc,
              estado: m.estado,
              forma: m.forma,
              tamano: m.tamano,
              tamano_y: m.tamanoY,
              x: m.x,
              y: m.y,
              etiqueta_offset_x: m.etiquetaOffsetX,
              etiqueta_offset_y: m.etiquetaOffsetY,
              ubicacion: ubicacion
            })
          }),
          'editar marca #' + (m.numero !== null ? m.numero : m.id)
        )
      );
    } else {
      // Al crear, si el POST responde OK, guardamos el id real en la marca
      // para que un reintento (tras un fallo parcial de otras operaciones)
      // NO vuelva a crearla y duplique registros.
      const opCrear = ejecutarOperacion(
        fetchAPI('/api/listados/' + listadoActual.id + '/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tag: m.tag || '',
            descripcion: m.descripcion,
            diametro: m.diametro,
            cso_csc: m.csoCsc,
            estado: m.estado,
            forma: m.forma,
            tamano: m.tamano,
            tamano_y: m.tamanoY,
            x: m.x,
            y: m.y,
            etiqueta_offset_x: m.etiquetaOffsetX,
            etiqueta_offset_y: m.etiquetaOffsetY,
            ubicacion: ubicacion,
            pid_nombre: marc.pid,
            pid_hoja: marc.hojaTexto || marc.hoja,
            pid_revision: marc.rev
          })
        }),
        'crear marca nueva'
      ).then(function (r) {
        if (r.ok && r.data && r.data.id !== undefined && r.data.id !== null) {
          m.id = r.data.id;
          m.nuevo = false;
        }
        return r;
      });
      operaciones.push(opCrear);
    }
  });

  if (operaciones.length === 0) {
    mostrarAviso('Cambios guardados.');
    marc.cambios = false;
    if (!noNavegar) volverDeMarcado();
    return true;
  }

  // Guardado secuencial para evitar "database is locked" en SQLite
  const resultados = [];
  for (let i = 0; i < operaciones.length; i++) {
    resultados.push(await operaciones[i]);
  }

  const fallidas = resultados.filter(function (r) { return !r.ok; });
  const total = resultados.length;
  const errores = fallidas.length;

  if (errores === 0) {
    mostrarAviso('Cambios guardados (' + total + ').');
    marc.cambios = false;
    if (!noNavegar) volverDeMarcado();
    return true;
  }

  console.warn('Operaciones fallidas al guardar:', fallidas);
  mostrarAviso(
    'No se pudieron guardar ' + errores + ' de ' + total +
    ' cambios. Revisá la consola (F12) para más detalle.',
    true
  );
  return false;
}

function ejecutarOperacion(promesaFetch, descripcion) {
  return promesaFetch
    .then(function (resp) {
      return resp.json().then(
        function (data) {
          if (!resp.ok) {
            return {
              ok: false,
              motivo: descripcion + ': HTTP ' + resp.status +
                      (data && data.error ? ' - ' + data.error : '')
            };
          }
          if (data && data.error) {
            return { ok: false, motivo: descripcion + ': ' + data.error };
          }
          return { ok: true, data: data };
        },
        function () {
          if (!resp.ok) {
            return { ok: false, motivo: descripcion + ': HTTP ' + resp.status };
          }
          return { ok: true, data: null };
        }
      );
    })
    .catch(function (e) {
      return { ok: false, motivo: descripcion + ': ' + e.message };
    });
}

function editarMarcaPorTempId(tempId) {
  if (marc.soloLectura) return;

  const m = marc.marcas.find(function (x) { return x.tempId === tempId; });
  if (!m) return;

  marc.ultimaSeleccionadaEnPanel = -1;

  const csoTildado = (m.csoCsc === 1) ? ' checked' : '';

  // Total de marcas vivas (para limitar la posición a la que se puede mover).
  const totalVivas = marc.todosLosItems.filter(function (it) { return !it.borrado; }).length;

  const html =
    '<p style="margin-top:0;font-size:16px;"><strong>Marcación ' + textoListaMarca(m) + '</strong></p>' +
    '<label class="campoCheckboxModal" style="margin-bottom:6px;">' +
      '<input type="checkbox" id="chkMoverPosMarca">' +
      '<span>Mover a posición:</span>' +
      '<input type="number" id="inpMoverPosMarca" min="1" max="' + totalVivas + '" step="1" ' +
        'value="' + (m.numero !== null && m.numero !== undefined ? m.numero : '') + '" ' +
        'style="width:80px;margin-left:8px;" disabled>' +
    '</label>' +
    '<label>Tag:' +
    '<input type="text" id="inpTagMarca" value="' + escaparHTML(m.tag || '') + '" placeholder="Ej: FV-101"></label>' +
    '<label>Diámetro (pulg):' +
    '<input type="number" id="inpDiametroMarca" min="0" step="0.1" value="' + (m.diametro !== null && m.diametro !== undefined ? m.diametro : '') + '" placeholder="Ej: 4"></label>' +
    '<label>Descripción:' +
    '<input type="text" id="inpDescripcionMarca" maxlength="' + LARGO_MAX_DESCRIPCION + '" value="' + escaparHTML(m.descripcion || '') + '" placeholder="Ej: Válvula de corte línea principal"></label>' +
    '<div class="filaCampos">' +
      '<label>Estado:' +
        '<select id="inpEstadoMarca">' +
          '<option value="abierto"' + (m.estado === 'abierto' ? ' selected' : '') + '>Abierto</option>' +
          '<option value="cerrado"' + (m.estado === 'cerrado' ? ' selected' : '') + '>Cerrado</option>' +
          '<option value="otro"' + (m.estado === 'otro' ? ' selected' : '') + '>Otro</option>' +
        '</select>' +
      '</label>' +
      '<label>Forma:' +
        '<select id="inpFormaMarca">' +
          '<option value="circulo"' + (m.forma === 'circulo' ? ' selected' : '') + '>Círculo</option>' +
          '<option value="rectangular"' + (m.forma === 'rectangular' ? ' selected' : '') + '>Rectangular</option>' +
        '</select>' +
      '</label>' +
    '</div>' +
    '<label class="campoCheckboxModal">' +
      '<input type="checkbox" id="inpCsoCscMarca"' + csoTildado + '>' +
      '<span>CSO/C</span>' +
    '</label>';

  abrirModal('Editar marca', html, function () {
    const diametroRaw = $('inpDiametroMarca').value.trim();

    // --- Mover a posición (opcional) ---
    const chkMover = $('chkMoverPosMarca');
    const inpMover = $('inpMoverPosMarca');
    let moverA = null;
    if (chkMover && chkMover.checked) {
      const rawPos = inpMover ? String(inpMover.value).trim() : '';
      const pos = parseInt(rawPos, 10);
      if (isNaN(pos) || pos < 1 || pos > totalVivas) {
        mostrarAviso('La posición debe ser un número entero entre 1 y ' + totalVivas + '.', true);
        return false;
      }
      moverA = pos;
    }

    m.tag = $('inpTagMarca').value.trim();
    m.descripcion = $('inpDescripcionMarca').value.trim().slice(0, LARGO_MAX_DESCRIPCION);
    m.estado = $('inpEstadoMarca').value;
    const nuevaForma = $('inpFormaMarca').value;
    if (nuevaForma !== m.forma && nuevaForma === 'circulo') {
      m.tamanoY = m.tamano;
    }
    m.forma = nuevaForma;
    m.csoCsc = $('inpCsoCscMarca').checked ? 1 : 0;

    if (diametroRaw === '') {
      m.diametro = null;
    } else {
      const n = parseFloat(diametroRaw);
      if (isNaN(n) || n <= 0) {
        mostrarAviso('El diámetro debe ser un número positivo.', true);
        return false;
      }
      m.diametro = n;
    }

    if (m.etiquetaOffsetX !== null) {
      m.etiquetaOffsetX = null;
      m.etiquetaOffsetY = null;
    }

    // --- Aplicar reordenamiento por posición si se pidió ---
    if (moverA !== null) {
      moverItemAPosicion(m, moverA);
    }

    marc.cambios = true;
    dibujarMarc();
    dibujarListaMarcas();
    actualizarPanelPropiedades();
    actualizarBotonGuardar();
  });

  setTimeout(function () {
    $('inpTagMarca').focus();
    // Habilitar el input de posición solo cuando se tilda el checkbox.
    const chk = $('chkMoverPosMarca');
    const inp = $('inpMoverPosMarca');
    if (chk && inp) {
      chk.addEventListener('change', function () {
        inp.disabled = !chk.checked;
        if (chk.checked) { inp.focus(); inp.select(); }
      });
    }
  }, 50);
}

// Mueve la marca m a la posición indicada (1-based) dentro del listado,
// desplazando el resto (no borra ni sobreescribe). Renumera 1..N.
function moverItemAPosicion(m, posDestino) {
  const vivas = marc.todosLosItems
    .filter(function (it) { return !it.borrado; })
    .slice()
    .sort(function (a, b) {
      const na = (a.numero !== null && a.numero !== undefined) ? a.numero : 999999;
      const nb = (b.numero !== null && b.numero !== undefined) ? b.numero : 999999;
      if (na !== nb) return na - nb;
      return a.id - b.id;
    });

  // Referencia al item de "todosLosItems" que corresponde a esta marca.
  const itemActual = vivas.find(function (it) { return it.id === m.id; });
  if (!itemActual) return;

  // Quitar de su posición actual e insertar en la destino.
  const sinActual = vivas.filter(function (it) { return it !== itemActual; });
  const idx = Math.max(0, Math.min(sinActual.length, posDestino - 1));
  sinActual.splice(idx, 0, itemActual);

  // Renumerar 1..N sobre el nuevo orden.
  sinActual.forEach(function (it, i) { it.numero = i + 1; });

  // Sincronizar el número en marc.marcas y recalcular maxNumeroGlobal.
  if (typeof renumerarTodoElListado === 'function') renumerarTodoElListado();
}

function actualizarEstadoMarc() {
  const zoomEl = $('estadoZoomMarc');
  if (zoomEl) zoomEl.textContent = 'Zoom: ' + Math.round(marc.zoom * 100) + '%';
}

// ================================================================
// SELLO "DESACTUALIZADO" SOBRE EL PLANO
// ================================================================
// Se muestra solo cuando el P&ID abierto NO esta en la ultima revision
// de su hoja (mismo criterio que la etiqueta "Desactualizado" de las
// tablas: ultimaRevisionDeHoja(pid, hoja)).
//
// Geometria: el sello se centra en la hoja, se rota -30 grados y su ancho
// es 1/3 de la DIAGONAL de la imagen. El tamano de letra se deriva del
// ancho para que el texto entre siempre.
// Color: rojo al 25% de opacidad (= 75% de transparencia) en texto y borde.
// El borde usa el mismo grosor que el trazo de las letras (em).
function actualizarSelloDesactualizado() {
  const capa = $('capaSelloDesactualizado');
  if (!capa) return;

  // Sin imagen todavia: ocultar.
  if (!marc.imagen || !marc.ancho || !marc.alto) {
    capa.style.display = 'none';
    return;
  }

  // Solo si el P&ID abierto esta desactualizado respecto de su hoja.
  const ultima = (typeof ultimaRevisionDeHoja === 'function')
    ? ultimaRevisionDeHoja(marc.pid, marc.hojaTexto || marc.hoja)
    : undefined;
  const desactualizado = (ultima !== undefined) &&
    (String(marc.rev) !== String(ultima));

  if (!desactualizado) {
    capa.style.display = 'none';
    return;
  }

  // La capa cubre toda la imagen para que el centrado sea exacto.
  capa.style.display = 'block';
  capa.style.width = marc.ancho + 'px';
  capa.style.height = marc.alto + 'px';

  const sello = capa.firstElementChild;
  if (!sello) return;

  // 1/3 de la diagonal de la hoja.
  const diagonal = Math.sqrt(marc.ancho * marc.ancho + marc.alto * marc.alto);
  const anchoObjetivo = diagonal / 3;

  // Tamano de letra: se calcula con el texto MAS ANCHO de las dos lineas
  // del sello (titulo "DESACTUALIZADO" y subtitulo "Nuevo P&ID disponible
  // en Rev.X", que va a la mitad del tamano). Con Arial Black la caja aprox.
  // ocupa 0.72em por caracter. Se busca que el texto + padding quepa en el
  // ancho objetivo.
  const EM_POR_CARACTER = 0.72;
  const PADDING_EM = 0.14 * 2; // padding izq + der (ver CSS)
  const textoRev = 'Nuevo P&ID disponible en Rev.' + String(ultima);
  const emTitulo = 14 * EM_POR_CARACTER;                 // "DESACTUALIZADO"
  const emSub = textoRev.length * EM_POR_CARACTER * 0.5;
  const emTexto = Math.max(emTitulo, emSub);
  let fontSize = anchoObjetivo / (emTexto + PADDING_EM);
  // Limite defensivo: nunca mas grande que 1/4 del alto de la hoja.
  fontSize = Math.min(fontSize, marc.alto / 4);
  if (!isFinite(fontSize) || fontSize <= 0) fontSize = 20;

  sello.style.fontSize = fontSize + 'px';

  // Revision nueva DEBAJO del recuadro (hermano del .selloDesactualizado,
  // dentro de .selloDesactualizadoBloque).
  const bloque = sello.parentElement;
  const revEl = bloque ? bloque.querySelector('.selloRev') : null;
  if (revEl) revEl.textContent = textoRev;
}
