// ================================================================
// Líneas de proceso - Orquestador del módulo
// ================================================================
// Define el estado global `lineas`, engancha eventos de UI
// (tabs, checkboxes, inputs, botón nueva línea) y expone la API
// pública del módulo. Los módulos en `lineas/` implementan cada
// responsabilidad específica (paleta, render, lista, dibujo,
// persistencia, caché, leyenda).

var lineas = {
  delPidActual: [],
  _lineaBase: [],           // Snapshot para detectar cambios
  nombres: NOMBRES_COLORES_LINEA_DEFAULT.slice(),
  colorIndice: 0,
  grosor: 16,
  opacidad: 70,
  modo: 'inactivo',
  puntosEnCurso: [],
  puntoMouseActual: null,
  seleccionada: null,
  cargado: false,
  guardando: false,
  _pidNombre: null,
  _pidHoja: null,
  _pidRev: null,
  _listadoId: null,
  pendientesGuardar: [],
  pendientesModificar: [],
  pendientesBorrar: [],
  _initToken: 0,

  // Parpadeo de una línea ("Ver en plano" desde la tabla de Líneas).
  _parpadeoId: null,
  _parpadeoMostrando: true,
  _parpadeoToken: 0,
  // Parpadeo pendiente para ejecutar apenas terminen de cargarse las líneas
  // del P&ID: { id, pid, hoja, rev }. Lo usa verLineaEnPlano().
  _parpadeoPendiente: null,

  // Leyenda de colores (overlay flotante movible)
  _leyendaPos: null,          // { x, y, anclada } en píxeles de pantalla
  _leyendaArrastrando: false,
  _leyendaDragIni: null
};

// =================================================================
// ENGANCHE DE EVENTOS DE UI (tabs, checkboxes, inputs, botón)
// =================================================================
function engancharEventosLineas() {
  const tabMarcas = $('tabMarcas'), tabLineas = $('tabLineas');
  if (tabMarcas && !tabMarcas._enganchada) {
    tabMarcas.onclick = function () { cambiarTabActiva('marcas'); };
    tabMarcas._enganchada = true;
  }
  if (tabLineas && !tabLineas._enganchada) {
    tabLineas.onclick = function () { cambiarTabActiva('lineas'); };
    tabLineas._enganchada = true;
  }

  const chkMarcas = $('chkVerMarcas'), chkLineas = $('chkVerLineas');
  if (chkMarcas && !chkMarcas._enganchado) { chkMarcas.onchange = actualizarFiltrosCapas; chkMarcas._enganchado = true; }
  if (chkLineas && !chkLineas._enganchado) { chkLineas.onchange = actualizarFiltrosCapas; chkLineas._enganchado = true; }

  const btnNueva = $('btnNuevaLinea');
  if (btnNueva && !btnNueva._enganchado) { btnNueva.onclick = accionNuevaLinea; btnNueva._enganchado = true; }

  const inpGrosor = $('inpGrosorLinea');
  if (inpGrosor && !inpGrosor._enganchado) {
    inpGrosor.oninput = function () {
      let v = parseInt(inpGrosor.value, 10) || 16;
      if (v < 2) v = 2;
      if (v > 40) v = 40;
      lineas.grosor = v;
      if (lineas.seleccionada) {
        const ln = lineas.delPidActual.find(l => l.id === lineas.seleccionada);
        if (ln) {
          ln.grosor = v;
          marcarLineaModificada(ln);
          dibujarMarc();
          renderizarListaLineas();
          if (typeof actualizarBotonGuardar === 'function') actualizarBotonGuardar();
        }
      }
    };
    inpGrosor._enganchado = true;
  }

  const inpOpacidad = $('inpOpacidadLinea');
  if (inpOpacidad && !inpOpacidad._enganchado) {
    inpOpacidad.oninput = function () {
      let v = parseInt(inpOpacidad.value, 10) || 70;
      if (v < 10) v = 10;
      if (v > 100) v = 100;
      lineas.opacidad = v;
      if (lineas.seleccionada) {
        const ln = lineas.delPidActual.find(l => l.id === lineas.seleccionada);
        if (ln) {
          ln.opacidad = v;
          marcarLineaModificada(ln);
          dibujarMarc();
          if (typeof actualizarBotonGuardar === 'function') actualizarBotonGuardar();
        }
      } else {
        dibujarMarc();
      }
    };
    inpOpacidad._enganchado = true;
  }

  // Enganche de la leyenda (drag)
  if (typeof engancharEventosLeyenda === 'function') {
    engancharEventosLeyenda();
  }
}

// =================================================================
// FILTROS DE CAPAS (marcas / líneas visibles)
// =================================================================
function actualizarFiltrosCapas() {
  const chkMarcas = $('chkVerMarcas'), chkLineas = $('chkVerLineas');
  if (typeof marc !== 'undefined') {
    if (chkMarcas) marc.mostrarMarcas = !!chkMarcas.checked;
    if (chkLineas) marc.mostrarLineas = !!chkLineas.checked;
  }
  if (typeof dibujarMarc === 'function') dibujarMarc();
  if (typeof actualizarLupaMarc === 'function') actualizarLupaMarc();
  if (typeof renderizarLeyendaLineas === 'function') renderizarLeyendaLineas();
}

// =================================================================
// CAMBIO DE TAB (Marcas <-> Líneas)
// =================================================================
function cambiarTabActiva(tab) {
  const btnMarcas = $('tabMarcas'), btnLineas = $('tabLineas');
  const contMarcas = $('contenidoTabMarcas'), contLineas = $('contenidoTabLineas');
  if (!btnMarcas || !btnLineas || !contMarcas || !contLineas) return;

  if (tab === 'lineas') {
    btnMarcas.classList.remove('activa');
    btnLineas.classList.add('activa');
    contMarcas.style.display = 'none';
    contLineas.style.display = 'block';
    if (typeof marc !== 'undefined' && marc.seleccionada !== null) {
      marc.seleccionada = null;
      dibujarMarc();
      dibujarListaMarcas();
      actualizarPanelPropiedades();
    }
  } else {
    btnMarcas.classList.add('activa');
    btnLineas.classList.remove('activa');
    contMarcas.style.display = 'block';
    contLineas.style.display = 'none';
    if (lineas.modo === 'dibujando') cancelarLineaEnCurso();
    if (lineas.seleccionada !== null) {
      lineas.seleccionada = null;
      renderizarListaLineas();
      dibujarMarc();
    }
  }
  if (typeof marc !== 'undefined') marc.tabActiva = (tab === 'lineas') ? 'lineas' : 'marcas';
}