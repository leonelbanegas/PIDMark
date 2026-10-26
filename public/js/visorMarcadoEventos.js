// ================================================================
// Visor de marcado - Eventos e interacción
// ================================================================

function detenerParpadeoMarc() {
  if (!marc) return;
  marc.parpadeoActivo = false;
  marc.parpadeoMostrando = true;
}

function actualizarPanelPropiedades() {
  const tagInput = $('propTag'), diametroInput = $('propDiametro'), descInput = $('propDescripcion');
  const estadoSel = $('propEstado'), formaSel = $('propForma'), csoInput = $('propCsoCsc');
  if (!tagInput || !diametroInput || !descInput || !estadoSel || !formaSel || !csoInput) return;

  const m = (marc.seleccionada !== null) ? marc.marcas.find(function (x) { return x.tempId === marc.seleccionada && !x.borrado; }) : null;
  const cambioSeleccion = (marc.seleccionada !== marc.ultimaSeleccionadaEnPanel);
  marc.ultimaSeleccionadaEnPanel = marc.seleccionada;
  const habilitar = !!m && !marc.soloLectura;

  tagInput.disabled = diametroInput.disabled = descInput.disabled = estadoSel.disabled = formaSel.disabled = csoInput.disabled = !habilitar;

  if (!m) {
    if (document.activeElement !== tagInput) tagInput.value = '';
    if (document.activeElement !== diametroInput) diametroInput.value = '';
    if (document.activeElement !== descInput) descInput.value = '';
    if (document.activeElement !== estadoSel) estadoSel.value = '';
    if (document.activeElement !== formaSel) formaSel.value = '';
    if (document.activeElement !== csoInput) csoInput.checked = false;
    return;
  }

  if (cambioSeleccion || document.activeElement !== tagInput) tagInput.value = m.tag || '';
  if (cambioSeleccion || document.activeElement !== diametroInput) diametroInput.value = (m.diametro !== null && m.diametro !== undefined) ? m.diametro : '';
  if (cambioSeleccion || document.activeElement !== descInput) descInput.value = m.descripcion || '';
  if (cambioSeleccion || document.activeElement !== estadoSel) estadoSel.value = m.estado || 'otro';
  if (cambioSeleccion || document.activeElement !== formaSel) formaSel.value = m.forma || 'circulo';
  if (cambioSeleccion || document.activeElement !== csoInput) csoInput.checked = (m.csoCsc === 1);
}

function aplicarCambioPropiedad(campo, valor) {
  if (marc.soloLectura || marc.seleccionada === null) return;
  const m = marc.marcas.find(function (x) { return x.tempId === marc.seleccionada && !x.borrado; });
  if (!m) return;

  if (campo === 'tag') m.tag = String(valor);
  else if (campo === 'descripcion') m.descripcion = String(valor).slice(0, LARGO_MAX_DESCRIPCION);
  else if (campo === 'diametro') {
    const s = String(valor).trim();
    if (s === '') m.diametro = null;
    else { const n = parseFloat(s); if (isNaN(n) || n <= 0) return; m.diametro = n; }
  } else if (campo === 'estado' && valor !== '') m.estado = String(valor);
  else if (campo === 'forma' && valor !== '') { if (valor === 'circulo') m.tamanoY = m.tamano; m.forma = String(valor); }
  else if (campo === 'cso_csc') m.csoCsc = valor ? 1 : 0;

  marc.cambios = true;
  dibujarMarc();
  dibujarListaMarcas();
  actualizarBotonGuardar();
}

function actualizarBotonGuardar() {
  const btn = $('btnGuardarMarc');
  if (!btn) return;
  if (marc.soloLectura) { btn.disabled = true; return; }
  
  const hayBorrados = marc.marcas.some(function (m) { return m.borrado; });
  const hayNuevos = marc.marcas.some(function (m) { return m.nuevo; });
  let hayLineasPendientes = false;
  
  if (typeof lineas !== 'undefined') {
    hayLineasPendientes = (lineas.pendientesGuardar.length > 0 || lineas.pendientesBorrar.length > 0 || lineas.pendientesModificar.length > 0);
  }
  
  btn.disabled = !(marc.cambios || hayBorrados || hayNuevos || hayLineasPendientes);
}

function crearMarcaEnPosicion(px, py, estadoForzado) {
  if (marc.soloLectura) return;

  // Clampear al area calibrada (marco del plano). Si no hay calibracion,
  // usa la imagen completa (fallback en clampearAlAreaCalibrada).
  if (typeof clampearAlAreaCalibrada === 'function') {
    const pc = clampearAlAreaCalibrada({ x: px, y: py });
    px = pc.x;
    py = pc.y;
  }
  const cfgMarc = (sesion.config && sesion.config.Marcadores) || {};
  const ultima = typeof ultimaMarcaValida === 'function' ? ultimaMarcaValida() : null;

  const formaHeredada = ultima ? ultima.forma : (cfgMarc.FormaPorDefecto || 'circulo');
  const tamanoHeredado = ultima ? ultima.tamano : (cfgMarc.TamanoPorDefecto || 14);
  const tamanoYHeredado = ultima ? (ultima.tamanoY || ultima.tamano) : (cfgMarc.TamanoPorDefecto || 14);
  const diametroHeredado = ultima ? ultima.diametro : null;
  const estadoElegido = estadoForzado || (ultima ? ultima.estado : 'otro');

  // Numero = maximo de numeros vivos + 1. Asi no dependemos de que
  // maxNumeroGlobal este perfectamente sincronizado tras borrados/altas
  // sin guardar (evita numeros repetidos o salteados).
  let maxVivo = 0;
  marc.todosLosItems.forEach(function (it) {
    if (!it.borrado && typeof it.numero === 'number' && it.numero > maxVivo) maxVivo = it.numero;
  });
  const nuevoNumero = maxVivo + 1;
  if (nuevoNumero > marc.maxNumeroGlobal) marc.maxNumeroGlobal = nuevoNumero;

  const idTemp = marc.tempIdItemNegativo--;
  const tempId = marc.tempIdSiguiente++;

  const nueva = {
    // id negativo = marca nueva aun no guardada. Asi renumerarTodoElListado
    // (que matchea it.id === m.id) y el borrado funcionan igual que con las
    // marcas ya persistidas, que tienen id positivo.
    id: idTemp, idTemp: idTemp, tempId: tempId, numero: nuevoNumero, tag: '', descripcion: '', diametro: diametroHeredado,
    csoCsc: 0, estado: estadoElegido, forma: formaHeredada, tamano: tamanoHeredado, tamanoY: tamanoYHeredado,
    x: px, y: py, etiquetaOffsetX: null, etiquetaOffsetY: null, nuevo: true, borrado: false
  };
  marc.marcas.push(nueva);

  marc.todosLosItems.push({
    id: idTemp, numero: nuevoNumero, pid_nombre: marc.pid, pid_hoja: marc.hojaTexto || marc.hoja, pid_revision: marc.rev, borrado: false
  });

  marc.seleccionada = tempId;
  marc.cambios = true;

  // Reconciliar la numeracion global (incluye esta marca nueva).
  if (typeof renumerarTodoElListado === 'function') renumerarTodoElListado();

  dibujarMarc();
  dibujarListaMarcas();
  actualizarPanelPropiedades();
  actualizarBotonGuardar();
}

function manejarTeclasEstado(e) {
  if ($('pantallaMarcado').style.display === 'none' || marc.soloLectura) return false;
  if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return false;
  
  const lienzo = $('lienzoMarc'), activo = document.activeElement;
  if (!lienzo || !activo || (activo !== lienzo && !lienzo.contains(activo))) return false;
  if (focoEnInput()) return false;

  const k = String(e.key || '').toLowerCase();
  let estado = null;
  if (k === '1' || k === 'a') estado = 'abierto';
  else if (k === '2' || k === 'c') estado = 'cerrado';
  else if (k === '3' || k === 'o') estado = 'otro';
  else return false;

  if (!marc.virtual) return false;

  const px = marc.virtual.x, py = marc.virtual.y;
  if (typeof puntoDentroAreaCalibrada === 'function' && !puntoDentroAreaCalibrada({ x: px, y: py })) {
    mostrarAviso('La marca debe estar dentro del área calibrada del plano.', true);
    e.preventDefault();
    return true;
  }

  crearMarcaEnPosicion(px, py, estado);
  e.preventDefault();
  return true;
}

function manejarFlechas(e, estado, tipoVisor) {
  if (focoEnInput()) return false;
  if (tipoVisor === 'cal' && $('pantallaCalibracion').style.display === 'none') return false;
  if (tipoVisor === 'marc' && $('pantallaMarcado').style.display === 'none') return false;

  const paso = pasoFlecha(e);
  let dx = 0, dy = 0;
  switch (e.key) {
    case 'ArrowUp': dy = -paso; break; case 'ArrowDown': dy = paso; break;
    case 'ArrowLeft': dx = -paso; break; case 'ArrowRight': dx = paso; break;
    default: return false;
  }

  if (tipoVisor === 'marc') {
    if (!estado.soloLectura && estado.seleccionada !== null) {
      const m = estado.marcas.find(function (x) { return x.tempId === estado.seleccionada; });
      if (m) {
        m.x += dx; m.y += dy;
        if (typeof clampearAlAreaCalibrada === 'function') {
          const pc = clampearAlAreaCalibrada({ x: m.x, y: m.y });
          m.x = pc.x; m.y = pc.y;
        } else {
          if (m.x < 0) m.x = 0; if (m.y < 0) m.y = 0;
          if (m.x > marc.ancho) m.x = marc.ancho; if (m.y > marc.alto) m.y = marc.alto;
        }
        estado.cambios = true;
        estado.virtual = { x: m.x, y: m.y };
        dibujarMarc(); actualizarBotonGuardar(); actualizarLupaMarc();
        if (typeof autoScrollHaciaPunto === 'function') autoScrollHaciaPunto(estado, m.x, m.y);
        e.preventDefault();
        return true;
      }
    }
    moverCursorVirtual(estado, dx, dy, 'marc');
    e.preventDefault();
    return true;
  }
  if (tipoVisor === 'cal') { moverCursorVirtual(estado, dx, dy, 'cal'); e.preventDefault(); return true; }
  return false;
}

function manejarEnter(e, estado, tipoVisor) {
  if (focoEnInput() || e.key !== 'Enter') return false;
  
  if (typeof lineas !== 'undefined' && estado.tabActiva === 'lineas' && lineas.modo === 'dibujando') {
    if (typeof terminarLineaEnCurso === 'function') terminarLineaEnCurso();
    e.preventDefault();
    return true;
  }

  if (tipoVisor === 'cal') {
    if ($('pantallaCalibracion').style.display === 'none' || !estado.modoMarcar || !estado.virtual) return false;
    const p = { x: estado.virtual.x, y: estado.virtual.y };
    const eraCero = (estado.modoMarcar === '00');
    if (eraCero) estado.punto00 = p;
    else if (estado.modoMarcar === '100') estado.punto100 = p;
    estado.modoMarcar = null;
    dibujarCal();
    if (eraCero) {
      estado.modoMarcar = '100';
      actualizarEstadoCal();
      mostrarAviso('Ahora marcá el punto 100,100 (esquina superior derecha, la contraria).');
    } else {
      estado.cambiosCal = true;
      actualizarEstadoCal();
    }
    e.preventDefault(); return true;
  }

  if (tipoVisor === 'marc') {
    if ($('pantallaMarcado').style.display === 'none' || estado.soloLectura || estado.seleccionada !== null || !estado.virtual) return false;
    crearMarcaEnPosicion(estado.virtual.x, estado.virtual.y);
    e.preventDefault(); return true;
  }
  return false;
}

function manejarEscape(e, estado, tipoVisor) {
  if (focoEnInput() || e.key !== 'Escape') return false;
  
  if (typeof lineas !== 'undefined' && estado.tabActiva === 'lineas' && lineas.modo === 'dibujando') {
    if (typeof cancelarLineaEnCurso === 'function') cancelarLineaEnCurso();
    e.preventDefault();
    return true;
  }

  if (tipoVisor === 'cal') {
    if ($('pantallaCalibracion').style.display === 'none' || !estado.modoMarcar) return false;
    estado.modoMarcar = null;
    dibujarCal(); actualizarEstadoCal();
    e.preventDefault(); return true;
  }
  return false;
}

function manejarCtrlZ(e) {
  if (!(e.ctrlKey && String(e.key).toLowerCase() === 'z')) return false;
  if ($('pantallaMarcado').style.display === 'none') return false;
  if (focoEnInput()) return false;
  if (typeof lineas === 'undefined') return false;

  if (marc.tabActiva === 'lineas' && lineas.modo === 'dibujando') {
    if (lineas.puntosEnCurso.length > 0) {
      lineas.puntosEnCurso.pop();
      dibujarMarc();
    }
    e.preventDefault();
    return true;
  }

  if (marc.tabActiva === 'lineas' && lineas.seleccionada !== null) {
    if (typeof deshacerEdicionLinea === 'function' && deshacerEdicionLinea()) {
      e.preventDefault();
      return true;
    }
  }

  return false;
}

function engancharTecladoGlobal() {
  document.addEventListener('keydown', function (e) {
    if (manejarTeclasEstado(e)) return;
    if (manejarCtrlZ(e)) return;
    if (manejarFlechas(e, cal, 'cal')) return;
    if (manejarFlechas(e, marc, 'marc')) return;
    if (manejarEnter(e, cal, 'cal')) return;
    if (manejarEnter(e, marc, 'marc')) return;
    if (manejarEscape(e, cal, 'cal')) return;
  });
}

function engancharEventosMarcado() {
  const lienzo = $('lienzoMarc');
  if (!lienzo) return;

  lienzo.style.userSelect = lienzo.style.webkitUserSelect = 'none';

  $('btnCancelarMarc').onclick = cancelarVisorMarc;
  $('btnAjustarMarc').onclick = function () { ajustarMarcAPantalla(); actualizarEstadoMarc(); dibujarMarc(); };
  $('btnGuardarMarc').onclick = guardarCambiosMarc; 

  const btnLupaMenosMarcEl = $('btnLupaMenosMarc');
  if (btnLupaMenosMarcEl) {
    btnLupaMenosMarcEl.onclick = function () { marc.lupaZoom = Math.max(1, marc.lupaZoom - 0.5); actualizarControlLupa(); };
  }
  $('btnLupaMasMarc').onclick = function () { marc.lupaZoom = Math.min(5, marc.lupaZoom + 0.5); actualizarControlLupa(); };

  lienzo.addEventListener('wheel', function (e) {
    e.preventDefault();
    marc.acumuladorWheel += e.deltaY;
    if (Math.abs(marc.acumuladorWheel) < 100) return;
    const direccion = marc.acumuladorWheel > 0 ? -1 : 1;
    marc.acumuladorWheel = 0;
    const factor = direccion > 0 ? 1.25 : 1 / 1.25;
    const antes = pantallaAPixelMarc(e.clientX, e.clientY);
    marc.zoom = Math.max(marc.zoomMin, Math.min(marc.zoomMax, marc.zoom * factor));
    const rect = lienzo.getBoundingClientRect();
    marc.offsetX = (e.clientX - rect.left) - antes.x * marc.zoom;
    marc.offsetY = (e.clientY - rect.top) - antes.y * marc.zoom;
    clampearMarc();
    dibujarMarc();
    actualizarEstadoMarc();
  }, { passive: false });

  lienzo.addEventListener('mousedown', function (e) {
    // Si el click cae sobre una zona de hipervínculo (o su capa), NO crear
    // marca: el div overlay maneja el click para navegar. EXCEPCIÓN: si se
    // está dibujando una línea, el clic debe pasar al lienzo para agregar el
    // punto (se puede dibujar encima de un link).
    const dibujandoLinea = (typeof lineas !== 'undefined' && lineas && lineas.modo === 'dibujando');
    if (!dibujandoLinea && e.target && e.target.closest && e.target.closest('#capaHipervinculosMarc, .hipervinculoRect')) {
      return;
    }

    e.preventDefault();
    lienzo.focus();

    if (e.button === 1) {
      marc.arrastrando = true;
      marc.arrastreIni = { x: e.clientX, y: e.clientY };
      marc.arrastreOffset = { x: marc.offsetX, y: marc.offsetY };
      return;
    }

    if (e.button === 2) {
      detenerParpadeoMarc();
      if (marc.seleccionada !== null) {
        marc.seleccionada = null;
        dibujarMarc(); dibujarListaMarcas(); actualizarPanelPropiedades();
      }
      if (typeof lineas !== 'undefined' && lineas.seleccionada !== null) {
        if (typeof seleccionarLinea === 'function') seleccionarLinea(null);
      }
      return;
    }

    if (e.button === 0) {
      // Fallback: marc.virtual puede ser null/estar desactualizado si el
      // mousemove no llego a actualizarlo (ej. borde de la hoja). Calculamos
      // el punto desde el evento para no perder el clic.
      let p = null;
      if (marc.virtual) {
        p = { x: marc.virtual.x, y: marc.virtual.y };
      } else if (typeof pantallaAPixelMarc === 'function') {
        p = pantallaAPixelMarc(e.clientX, e.clientY);
        if (typeof clampearPuntoImagen === 'function') clampearPuntoImagen(marc, p);
      }
      if (!p) return;

      if (marc.tabActiva === 'lineas') {
        if (typeof lineas !== 'undefined') {
          if (lineas.modo === 'dibujando') {
            agregarPuntoLineaEnCurso(p);
            return;
          }

          const hitTirador = hitTestTiradorNodo(p);
          if (hitTirador) {
            iniciarDragNodo(hitTirador.linea, hitTirador.indice, p);
            return;
          }

          const hit = hitTestLinea(p);
          if (hit) {
            if (lineas.seleccionada === hit.id) {
              iniciarDragLineaCompleta(hit, p);
            } else {
              if (typeof seleccionarLinea === 'function') seleccionarLinea(hit.id);
            }
          } else {
            if (typeof seleccionarLinea === 'function') seleccionarLinea(null);
          }
        }
        return;
      }

      if (marc.soloLectura) {
        const infosRO = calcularLayoutMarcas(false);
        const etiquetaRO = hitTestEtiqueta(p, infosRO);
        if (etiquetaRO) {
          detenerParpadeoMarc();
          marc.seleccionada = etiquetaRO.m.tempId;
          dibujarMarc(); dibujarListaMarcas(); actualizarPanelPropiedades();
          return;
        }
        const marcaRO = hitTestMarca(p, marc.marcas);
        if (marcaRO) {
          detenerParpadeoMarc();
          marc.seleccionada = marcaRO.tempId;
          dibujarMarc(); dibujarListaMarcas(); actualizarPanelPropiedades();
        }
        return;
      }

      const tiradorRedim = e.target && e.target.closest ? e.target.closest('.tiradorMarca') : null;
      if (tiradorRedim) {
        const marcaSel = marc.marcas.find(function (x) { return x.tempId === marc.seleccionada && !x.borrado; });
        if (marcaSel) {
          marc.redimensionandoMarca = true;
          marc.redimIni = { x: p.x, y: p.y };
          marc.redimTamIni = marcaSel.tamano;
          marc.redimTamYIni = (marcaSel.tamanoY !== null && marcaSel.tamanoY !== undefined) ? marcaSel.tamanoY : marcaSel.tamano;
          const posEt = posicionEtiquetaAproximada(marcaSel);
          marc.redimOffsetIni = { x: posEt.x - marcaSel.x, y: posEt.y - marcaSel.y };
        }
        return;
      }

      const tiradorEtiq = e.target && e.target.closest ? e.target.closest('.tiradorEtiqueta') : null;
      if (tiradorEtiq) {
        const marcaSel = marc.marcas.find(function (x) { return x.tempId === marc.seleccionada && !x.borrado; });
        if (marcaSel) {
          const posEt = posicionEtiquetaAproximada(marcaSel);
          marc.arrastrandoEtiqueta = true;
          marc.etiquetaIni = { x: p.x, y: p.y };
          marc.etiquetaOffsetIni = {
            x: (marcaSel.etiquetaOffsetX !== null) ? marcaSel.etiquetaOffsetX : (posEt.x - marcaSel.x),
            y: (marcaSel.etiquetaOffsetY !== null) ? marcaSel.etiquetaOffsetY : (posEt.y - marcaSel.y)
          };
        }
        return;
      }

      const infos = calcularLayoutMarcas(false);
      const etiquetaHit = hitTestEtiqueta(p, infos);
      if (etiquetaHit) {
        detenerParpadeoMarc();
        marc.seleccionada = etiquetaHit.m.tempId;
        marc.arrastrandoMarca = false;
        dibujarMarc(); dibujarListaMarcas(); actualizarPanelPropiedades(); actualizarLupaMarc();
        return;
      }

      const marcaHit = hitTestMarca(p, marc.marcas);
      if (marcaHit) {
        detenerParpadeoMarc();
        marc.seleccionada = marcaHit.tempId;
        marc.arrastrandoMarca = true;
        dibujarMarc(); dibujarListaMarcas(); actualizarPanelPropiedades();
        return;
      }

      if (typeof puntoDentroAreaCalibrada === 'function' && !puntoDentroAreaCalibrada(p)) {
        mostrarAviso('La marca debe estar dentro del área calibrada del plano.', true);
        return;
      }
      crearMarcaEnPosicion(p.x, p.y);
    }
  });

  lienzo.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  lienzo.addEventListener('auxclick', function (e) { if (e.button === 1) e.preventDefault(); });

  // --- CONTROL DE VISIBILIDAD DE LA LUPA ---
  lienzo.addEventListener('mouseenter', function () {
    lienzo.classList.add('cursorOculto');
    marc.mouseSobreLienzo = true;
    actualizarLupaMarc();
  });

  // Devuelve true si (clientX, clientY) cae dentro del área VISIBLE de la
  // hoja (la imagen del P&ID ya escalada y desplazada), no del lienzo.
  // El lienzo incluye las franjas vacías alrededor del plano al "Ajustar".
  function puntoSobreLaHoja(clientX, clientY) {
    const r = lienzo.getBoundingClientRect();
    const izq = r.left + marc.offsetX;
    const arr = r.top + marc.offsetY;
    const der = izq + marc.ancho * marc.zoom;
    const aba = arr + marc.alto * marc.zoom;
    const tol = 2;
    return clientX >= izq + tol && clientX <= der - tol &&
           clientY >= arr + tol && clientY <= aba - tol;
  }

  function ocultarLupaYRestaurarCursor() {
    lienzo.classList.remove('cursorOculto');
    marc.mouseSobreLienzo = false;
    const lupa = $('lupaMarc');
    if (lupa) lupa.style.display = 'none';
  }

  lienzo.addEventListener('mouseleave', ocultarLupaYRestaurarCursor);
  window.addEventListener('blur', ocultarLupaYRestaurarCursor);

  lienzo.addEventListener('mousemove', function (e) {
    // Refuerzo: si llegamos acá, el mouse está sobre el lienzo.
    marc.mouseSobreLienzo = true;
    if (!lienzo.classList.contains('cursorOculto')) lienzo.classList.add('cursorOculto');
    const p = pantallaAPixelMarc(e.clientX, e.clientY);
    marc.virtual = { x: p.x, y: p.y };
    clampearPuntoImagen(marc, marc.virtual);
    actualizarCruzVirtual(marc, marc.cruzVirtualEl);
    actualizarLupaMarc();
    
    if (typeof lineas !== 'undefined' && lineas.modo === 'dibujando') {
      lineas.puntoMouseActual = marc.virtual;
      dibujarMarc();
    }
  });

  document.addEventListener('mousemove', function (e) {
    // Si el mouse está fuera de la HOJA VISIBLE, la lupa no debe verse y el
    // cursor de Windows debe mostrarse normalmente.
    if ($('pantallaMarcado') && $('pantallaMarcado').style.display !== 'none') {
      if (!puntoSobreLaHoja(e.clientX, e.clientY)) ocultarLupaYRestaurarCursor();
    }

    if (typeof lineas !== 'undefined' && lineas._leyendaArrastrando) {
      if (typeof moverArrastreLeyenda === 'function') moverArrastreLeyenda(e);
      return;
    }

    if (typeof lineas !== 'undefined' && hayDragNodoEnCurso && hayDragNodoEnCurso()) {
      const p = pantallaAPixelMarc(e.clientX, e.clientY);
      moverDragNodo(p);
      return;
    }

    if (marc.soloLectura) return;

    if (marc.arrastrando) {
      const dx = e.clientX - marc.arrastreIni.x;
      const dy = e.clientY - marc.arrastreIni.y;
      marc.offsetX = marc.arrastreOffset.x + dx;
      marc.offsetY = marc.arrastreOffset.y + dy;
      clampearMarc();
      dibujarMarc();
    } else if (marc.redimensionandoMarca && marc.seleccionada !== null) {
      const m = marc.marcas.find(function (x) { return x.tempId === marc.seleccionada; });
      if (m) {
        const p = pantallaAPixelMarc(e.clientX, e.clientY);
        const dx = p.x - m.x, dy = p.y - m.y;
        if (e.shiftKey) {
          const dist = Math.sqrt(dx * dx + dy * dy);
          let nuevoTam = Math.round(dist);
          if (nuevoTam < TAMANO_MARCA_MIN) nuevoTam = TAMANO_MARCA_MIN;
          if (nuevoTam > TAMANO_MARCA_MAX) nuevoTam = TAMANO_MARCA_MAX;
          m.tamano = m.tamanoY = nuevoTam;
        } else {
          let nuevoX = Math.round(Math.abs(dx)), nuevoY = Math.round(Math.abs(dy));
          if (nuevoX < TAMANO_MARCA_MIN) nuevoX = TAMANO_MARCA_MIN;
          if (nuevoY < TAMANO_MARCA_MIN) nuevoY = TAMANO_MARCA_MIN;
          if (nuevoX > TAMANO_MARCA_MAX) nuevoX = TAMANO_MARCA_MAX;
          if (nuevoY > TAMANO_MARCA_MAX) nuevoY = TAMANO_MARCA_MAX;
          m.tamano = nuevoX; m.tamanoY = nuevoY;
        }
        if (marc.redimOffsetIni) {
          const ratioX = m.tamano / marc.redimTamIni;
          const ratioY = m.tamanoY / (marc.redimTamYIni || m.tamano);
          let offX = marc.redimOffsetIni.x * ratioX;
          let offY = marc.redimOffsetIni.y * ratioY;
          // Clampear con el tamaño real de la etiqueta: al achicar la marca, la
          // etiqueta debe mantenerse a la distancia mínima (no encima de ella).
          if (typeof _clampearCentroEtiqueta === 'function') {
            let anchoEt = 60, altoEt = Math.max(16, Math.round(m.tamano * 0.9) + 10);
            const infosC = calcularLayoutMarcas(false);
            const infoC = infosC && infosC.find(function (i) { return i.m === m; });
            if (infoC) { anchoEt = infoC.anchoEt; altoEt = infoC.altoEt; }
            const c = _clampearCentroEtiqueta(m, m.x + offX, m.y + offY, anchoEt, altoEt);
            offX = c.x - m.x;
            offY = c.y - m.y;
          }
          m.etiquetaOffsetX = offX;
          m.etiquetaOffsetY = offY;
          marc.redimOffsetIni.x = m.etiquetaOffsetX; marc.redimOffsetIni.y = m.etiquetaOffsetY;
          marc.redimTamIni = m.tamano; marc.redimTamYIni = m.tamanoY;
        }
        marc.cambios = true;
        dibujarMarc(); actualizarPanelPropiedades(); actualizarBotonGuardar();
      }
    } else if (marc.arrastrandoEtiqueta && marc.seleccionada !== null) {
      const m = marc.marcas.find(function (x) { return x.tempId === marc.seleccionada; });
      if (m) {
        const p = pantallaAPixelMarc(e.clientX, e.clientY);
        m.etiquetaOffsetX = marc.etiquetaOffsetIni.x + (p.x - marc.etiquetaIni.x);
        m.etiquetaOffsetY = marc.etiquetaOffsetIni.y + (p.y - marc.etiquetaIni.y);
        marc.cambios = true;
        dibujarMarc(); actualizarBotonGuardar();
      }
    } else if (marc.arrastrandoMarca && marc.seleccionada !== null) {
      const m = marc.marcas.find(function (x) { return x.tempId === marc.seleccionada; });
      if (m) {
        const p = pantallaAPixelMarc(e.clientX, e.clientY);
        if (typeof clampearAlAreaCalibrada === 'function') {
          const pc = clampearAlAreaCalibrada({ x: p.x, y: p.y });
          m.x = pc.x;
          m.y = pc.y;
        } else {
          m.x = Math.max(0, Math.min(marc.ancho, p.x));
          m.y = Math.max(0, Math.min(marc.alto, p.y));
        }
        marc.cambios = true;
        dibujarMarc(); actualizarBotonGuardar();
      }
    }
  });

  document.addEventListener('mouseup', function (e) {
    if (typeof lineas !== 'undefined' && lineas._leyendaArrastrando) {
      if (typeof finalizarArrastreLeyenda === 'function') finalizarArrastreLeyenda(e);
      return;
    }

    if (typeof lineas !== 'undefined' && hayDragNodoEnCurso && hayDragNodoEnCurso()) {
      if (typeof finalizarDragNodo === 'function') finalizarDragNodo();
      return;
    }

    if (e.button === 1) marc.arrastrando = false;
    if (e.button === 0) {
      if (marc.arrastrandoEtiqueta && marc.seleccionada !== null) {
        const m = marc.marcas.find(function (x) { return x.tempId === marc.seleccionada; });
        if (m && typeof _clampearCentroEtiqueta === 'function') {
          // Medir el tamaño real de la etiqueta de esta marca y corregir
          // el offset guardado para que respete la separación mínima.
          let anchoEt = 60, altoEt = Math.max(16, Math.round(m.tamano * 0.9) + 10);
          const infos = calcularLayoutMarcas(false);
          const info = infos && infos.find(function (i) { return i.m === m; });
          if (info) { anchoEt = info.anchoEt; altoEt = info.altoEt; }
          const cx = m.x + m.etiquetaOffsetX;
          const cy = m.y + m.etiquetaOffsetY;
          const c = _clampearCentroEtiqueta(m, cx, cy, anchoEt, altoEt);
          m.etiquetaOffsetX = c.x - m.x;
          m.etiquetaOffsetY = c.y - m.y;
          dibujarMarc();
        }
      }
      marc.arrastrandoMarca = false; marc.redimensionandoMarca = false;
      marc.redimOffsetIni = null; marc.redimTamYIni = null; marc.arrastrandoEtiqueta = false;
    }
  });

  lienzo.addEventListener('dblclick', function (e) {
    // Finalizar la linea SIEMPRE que estemos en modo dibujando, sin depender
    // del tab activo (evita que un dblclick se pierda como punto nuevo).
    if (typeof lineas !== 'undefined' && lineas.modo === 'dibujando') {
      if (typeof finalizarLineaPorDobleClick === 'function') finalizarLineaPorDobleClick();
      return;
    }
    if (marc.soloLectura || !marc.virtual) return;
    const p = { x: marc.virtual.x, y: marc.virtual.y };
    const m = hitTestMarca(p, marc.marcas);
    if (m && typeof editarMarcaPorTempId === 'function') {
      detenerParpadeoMarc();
      editarMarcaPorTempId(m.tempId);
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.repeat) return;
    if ($('pantallaMarcado').style.display === 'none' || e.key !== 'Delete' || marc.soloLectura || marc.seleccionada === null || focoEnInput()) return;
    
    if (marc.tabActiva === 'lineas' && typeof lineas !== 'undefined' && lineas.seleccionada !== null) {
      abrirModal(
        'Confirmar borrado', '<p>¿Seguro que querés borrar esta línea?</p>',
        function () {
          const ln = lineas.delPidActual.find(l => l.id === lineas.seleccionada);
          if (ln) {
            if (ln.id) lineas.pendientesBorrar.push(ln.id);
            lineas.delPidActual = lineas.delPidActual.filter(l => l.id !== lineas.seleccionada);
          }
          if (typeof seleccionarLinea === 'function') seleccionarLinea(null);
          marc.cambios = true;
          dibujarMarc(); renderizarListaLineas(); actualizarBotonGuardar();
        },
        { textoAceptar: 'Borrar' }
      );
      e.preventDefault();
      return;
    }

    if (marc.tabActiva !== 'marcas') return;

    const marcaSel = marc.marcas.find(function (x) { return x.tempId === marc.seleccionada && !x.borrado; });
    if (!marcaSel) return;

    abrirModal('Confirmar borrado',
      '<p>¿Seguro que querés borrar la marca <strong>' + escaparHTML(textoListaMarca(marcaSel)) + '</strong>?</p>' +
      '<p style="color:#888;">Las marcas siguientes se van a renumerar. Los cambios se aplican recién al guardar.</p>',
      function () {
        marcaSel.borrado = true; marc.cambios = true; marc.seleccionada = null;
        const ref = marc.todosLosItems.find(function (it) { return it.id === marcaSel.id; });
        if (ref) ref.borrado = true;
        renumerarTodoElListado();
        dibujarMarc(); dibujarListaMarcas(); actualizarPanelPropiedades(); actualizarBotonGuardar();
      },
      { textoAceptar: 'Borrar' }
    );
    e.preventDefault();
  });

  window.addEventListener('resize', function () {
    if ($('pantallaMarcado').style.display !== 'none') {
      const w = lienzo.clientWidth, h = lienzo.clientHeight;
      marc.zoomMin = Math.min(w / marc.ancho, h / marc.alto);
      if (marc.zoom < marc.zoomMin) marc.zoom = marc.zoomMin;
      clampearMarc();
      dibujarMarc();
      if (typeof lineas !== 'undefined' && (!lineas._leyendaPos || !lineas._leyendaPos.anclada)) {
        if (typeof aplicarPosicionLeyenda === 'function') aplicarPosicionLeyenda();
      }
    }
  });
}

function engancharEventosPanelPropiedades() {
  const tagInput = $('propTag');
  if (tagInput) tagInput.addEventListener('input', function () { aplicarCambioPropiedad('tag', tagInput.value); });

  const diametroInput = $('propDiametro');
  if (diametroInput) {
    diametroInput.addEventListener('input', function () { aplicarCambioPropiedad('diametro', diametroInput.value); });
    diametroInput.addEventListener('change', function () { aplicarCambioPropiedad('diametro', diametroInput.value); });
  }

  const descInput = $('propDescripcion');
  if (descInput) descInput.addEventListener('input', function () { aplicarCambioPropiedad('descripcion', descInput.value); });

  const estadoSel = $('propEstado');
  if (estadoSel) estadoSel.addEventListener('change', function () { aplicarCambioPropiedad('estado', estadoSel.value); });

  const formaSel = $('propForma');
  if (formaSel) formaSel.addEventListener('change', function () { aplicarCambioPropiedad('forma', formaSel.value); });

  const csoInput = $('propCsoCsc');
  if (csoInput) csoInput.addEventListener('change', function () { aplicarCambioPropiedad('cso_csc', csoInput.checked); });
}