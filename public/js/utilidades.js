// ================================================================
// Utilidades generales del cliente
// ================================================================
// Funciones helper sin estado propio. Dependen de variables
// globales (sesion, cal, marc) pero no las modifican.

// ============ Utilidades generales ============
function $(id) { return document.getElementById(id); }

function fetchAPI(url, opciones) {
  opciones = opciones || {};
  const headers = Object.assign({}, opciones.headers || {});
  if (usuarioSimulado) headers['X-Usuario-Simulado'] = usuarioSimulado;
  return fetch(url, Object.assign({}, opciones, { headers: headers }));
}

function tamanoEtiquetaMaxActual() {
  if (sesion && sesion.config && sesion.config.Marcadores &&
      typeof sesion.config.Marcadores.TamanoEtiquetaMax === 'number') {
    return sesion.config.Marcadores.TamanoEtiquetaMax;
  }
  return 150;
}

function mostrarAviso(texto, esError) {
  const el = $('aviso');
  el.textContent = texto;
  el.className = 'aviso' + (esError ? ' avisoError' : '');
  el.style.display = 'block';
  setTimeout(function () { el.style.display = 'none'; }, 3000);
}

function formatearFecha(iso) {
  if (!iso) return '';
  const partes = iso.replace(' ', 'T');
  const d = new Date(partes);
  if (isNaN(d)) return iso;
  const pad = function (n) { return String(n).padStart(2, '0'); };
  return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() +
         ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function escaparHTML(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function etiquetaEstado(estado) {
  if (estado === 'abierto') return '<span class="etiqueta etiquetaEstadoAbierto">Abierto</span>';
  if (estado === 'cerrado') return '<span class="etiqueta etiquetaEstadoCerrado">Cerrado</span>';
  return '<span class="etiqueta etiquetaEstadoOtro">Otro</span>';
}

function textoEtiquetaMarca(m) {
  const num = (m.numero !== null && m.numero !== undefined) ? ('#' + m.numero) : '#?';
  return num;
}

function formatearDiametro(valor) {
  if (valor === null || valor === undefined || valor === '') return '';
  const n = parseFloat(valor);
  if (isNaN(n) || n <= 0) return '';
  if (Number.isInteger(n)) return String(n);
  return String(n);
}

function textoListaMarca(m) {
  const num = (m.numero !== null && m.numero !== undefined) ? ('#' + m.numero) : '#?';
  const tag = (m.tag !== undefined && m.tag !== null) ? String(m.tag).trim() : '';
  const diam = formatearDiametro(m.diametro);

  let texto = num;
  if (tag) texto += ' - ' + tag;
  if (diam) texto += ' · Ø' + diam;
  return texto;
}

function textoDiametroConSimbolo(valor) {
  const s = formatearDiametro(valor);
  if (!s) return '';
  return 'Ø' + s;
}

// ============ Hoja (XdeY) ============
function formatearHoja(hoja) {
  if (hoja === null || hoja === undefined || hoja === '') return '1de1';

  if (typeof hoja === 'string') {
    const m = hoja.match(/^(\d+)[Dd][Ee](\d+)$/);
    if (!m) return '1de1';
    const a = parseInt(m[1], 10);
    const t = parseInt(m[2], 10);
    if (!isFinite(a) || !isFinite(t) || a < 1 || t < 1 || a > t) return '1de1';
    return a + 'de' + t;
  }

  if (typeof hoja === 'object') {
    if (hoja.texto) return formatearHoja(hoja.texto);
    const a = parseInt(hoja.actual, 10);
    const t = parseInt(hoja.total, 10);
    if (!isFinite(a) || !isFinite(t) || a < 1 || t < 1 || a > t) return '1de1';
    return a + 'de' + t;
  }

  return '1de1';
}

// ============ Buscadores con botón ✕ ============
function engancharBuscador(inputId, alLimpiar) {
  const input = $(inputId);
  if (!input) return;

  const contenedor = input.closest('.buscadorConX') || input.parentElement;
  if (!contenedor) return;

  let btn = contenedor.querySelector('.btnLimpiarBusqueda');
  if (!btn) {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btnLimpiarBusqueda';
    btn.title = 'Limpiar filtro';
    btn.textContent = '✕';
    contenedor.appendChild(btn);
  }

  function actualizarVisibilidad() {
    if (input.value && input.value.length > 0) {
      btn.classList.add('visible');
    } else {
      btn.classList.remove('visible');
    }
  }

  function limpiar() {
    if (input.value === '') return;

    input.value = '';
    actualizarVisibilidad();

    input.dispatchEvent(new Event('input', { bubbles: true }));

    if (typeof alLimpiar === 'function') alLimpiar();

    input.focus();
  }

  input.addEventListener('input', actualizarVisibilidad);

  btn.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    limpiar();
  });

  input.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (input.value === '') return;
    e.preventDefault();
    e.stopPropagation();
    limpiar();
  });

  actualizarVisibilidad();
}

// ============ Revisión: comparación y formato ============
// SEMANTICA NATURAL:
//   - Devolver > 0 significa que 'a' es mas NUEVA que 'b'.
//   - Devolver < 0 significa que 'a' es mas VIEJA que 'b'.
//   - Números > letras. Entre números gana el mayor (3 > 2 > 1).
//   - Entre letras gana la posterior del alfabeto (Z > Y > ... > A).
//
// OJO: los listados que quieren mostrar la mas NUEVA PRIMERO deben llamar
// compararRevision(b.revision, a.revision) (argumentos invertidos).
// Esta funcion se usa en TODOS los listados de P&ID (global y dentro de un
// listado) y tambien para calcular la ultima revision de cada hoja.
function compararRevision(a, b) {
  const sa = String(a);
  const sb = String(b);
  const aEsLetra = /^[A-Za-z]$/.test(sa);
  const bEsLetra = /^[A-Za-z]$/.test(sb);

  if (aEsLetra && bEsLetra) {
    return sa.toUpperCase().localeCompare(sb.toUpperCase());
  }
  if (!aEsLetra && !bEsLetra) {
    return parseInt(sa, 10) - parseInt(sb, 10);
  }
  // Los números son "más nuevos" que las letras.
  return aEsLetra ? -1 : 1;
}

function calcularUltimasRevisiones() {
  ultimasRevisiones = {};
  pids.forEach(function (p) {
    const actual = ultimasRevisiones[p.pid];
    if (actual === undefined || compararRevision(p.revision, actual) > 0) {
      ultimasRevisiones[p.pid] = p.revision;
    }
  });
}

function esUltimaRevision(pidNombre, revision) {
  const ultima = ultimasRevisiones[pidNombre];
  if (ultima === undefined) return true;
  return String(revision) === String(ultima);
}

// Devuelve la última revisión de un P&ID considerando pid + hoja.
// IMPORTANTE: el criterio es SIEMPRE por pid + hoja. NO se cae al criterio
// por pid solo, porque eso marcaba como "desactualizada" una hoja distinta
// (ej: la 1de2 quedaba vieja porque la 2de2 tenia una Rev mas nueva).
// Si no hay otra revisión para ese pid+hoja, devuelve undefined
// (el llamador lo interpreta como "es la última de su hoja").
function ultimaRevisionDeHoja(pidNombre, hoja) {
  const hojaNorm = formatearHoja(hoja);
  let ultima = undefined;
  if (typeof pids !== 'undefined' && Array.isArray(pids)) {
    pids.forEach(function (p) {
      if (String(p.pid) !== String(pidNombre)) return;
      if (formatearHoja(p.hojaTexto || p.hoja) !== hojaNorm) return;
      if (ultima === undefined || compararRevision(p.revision, ultima) > 0) {
        ultima = p.revision;
      }
    });
  }
  return ultima;
}

// true si el destino del hipervínculo (pid + hoja + rev) no está en su
// última revisión disponible.
function esDestinoDesactualizado(pidNombre, hoja, revision) {
  const ultima = ultimaRevisionDeHoja(pidNombre, hoja);
  if (ultima === undefined) return false;
  return String(revision) !== String(ultima);
}

// Formatea la revisión. Si se pasa la hoja, el criterio de "desactualizada"
// es por pid + hoja (correcto). Si NO se pasa (llamadores viejos), cae al
// criterio por pid solo, por compatibilidad.
function formatearRevision(pidNombre, revision, hoja) {
  const revStr = escaparHTML(revision);

  let esUltima;
  if (hoja !== undefined && hoja !== null && String(hoja) !== '') {
    const ultima = (typeof ultimaRevisionDeHoja === 'function')
      ? ultimaRevisionDeHoja(pidNombre, hoja)
      : undefined;
    // Sin otra revisión para ese pid+hoja -> esta es la última de su hoja.
    esUltima = (ultima === undefined) || (String(revision) === String(ultima));
  } else {
    esUltima = esUltimaRevision(pidNombre, revision);
  }

  if (esUltima) {
    return '<span class="revUltima">' + revStr + '</span>';
  }
  return '<span class="revDesactualizada">' + revStr + '</span>' +
         ' <span class="etiqueta etiquetaDesactualizado">Desactualizado</span>';
}

// ============ Cruz virtual ============
function crearCruzVirtual(capaId) {
  const capa = $(capaId);
  if (!capa) return null;
  let cruz = capa.querySelector('.cruzVirtual');
  if (cruz) return cruz;
  cruz = document.createElement('div');
  cruz.className = 'cruzVirtual';
  cruz.style.display = 'none';
  capa.appendChild(cruz);
  return cruz;
}

function actualizarCruzVirtual(estado, cruzEl) {
  if (!cruzEl) return;
  if (!estado.virtual) {
    cruzEl.style.display = 'none';
    return;
  }
  cruzEl.style.display = 'block';
  cruzEl.style.left = estado.virtual.x + 'px';
  cruzEl.style.top = estado.virtual.y + 'px';
  const factor = 1 / estado.zoom;
  cruzEl.style.transform = 'translate(-50%, -50%) scale(' + factor + ')';
}

// ============ Foco / teclado ============
function focoEnInput() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName ? el.tagName.toUpperCase() : '';
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function pasoFlecha(e) {
  if (e.ctrlKey && e.shiftKey) return 50;
  if (e.ctrlKey) return 25;
  if (e.shiftKey) return 10;
  return 1;
}

function clampearPuntoImagen(estado, p) {
  if (p.x < 0) p.x = 0;
  if (p.y < 0) p.y = 0;
  if (p.x > estado.ancho) p.x = estado.ancho;
  if (p.y > estado.alto) p.y = estado.alto;
  return p;
}

function autoScrollHaciaPunto(estado, px, py) {
  const lienzoId = (estado === cal) ? 'lienzoCal' : 'lienzoMarc';
  const lienzo = $(lienzoId);
  if (!lienzo) return;

  const w = lienzo.clientWidth;
  const h = lienzo.clientHeight;

  const xPant = px * estado.zoom + estado.offsetX;
  const yPant = py * estado.zoom + estado.offsetY;

  let dx = 0, dy = 0;

  if (xPant < MARGEN_AUTOSCROLL) dx = MARGEN_AUTOSCROLL - xPant;
  else if (xPant > w - MARGEN_AUTOSCROLL) dx = (w - MARGEN_AUTOSCROLL) - xPant;

  if (yPant < MARGEN_AUTOSCROLL) dy = MARGEN_AUTOSCROLL - yPant;
  else if (yPant > h - MARGEN_AUTOSCROLL) dy = (h - MARGEN_AUTOSCROLL) - yPant;

  if (dx === 0 && dy === 0) return;

  estado.offsetX += dx;
  estado.offsetY += dy;

  if (estado === cal) { clampear(); dibujarCal(); }
  else { clampearMarc(); dibujarMarc(); }
}

function asegurarCursorVirtual(estado, tipoVisor) {
  if (estado.virtual) return;
  const lienzoId = (tipoVisor === 'cal') ? 'lienzoCal' : 'lienzoMarc';
  const lienzo = $(lienzoId);
  if (!lienzo) return;
  const w = lienzo.clientWidth;
  const h = lienzo.clientHeight;
  estado.virtual = {
    x: (w / 2 - estado.offsetX) / estado.zoom,
    y: (h / 2 - estado.offsetY) / estado.zoom
  };
  clampearPuntoImagen(estado, estado.virtual);
}

function moverCursorVirtual(estado, dx, dy, tipoVisor) {
  asegurarCursorVirtual(estado, tipoVisor);

  estado.virtual.x += dx;
  estado.virtual.y += dy;
  clampearPuntoImagen(estado, estado.virtual);

  if (tipoVisor === 'cal') {
    dibujarCal();
    actualizarLupa();
  } else {
    dibujarMarc();
    actualizarLupaMarc();
  }

  autoScrollHaciaPunto(estado, estado.virtual.x, estado.virtual.y);
}