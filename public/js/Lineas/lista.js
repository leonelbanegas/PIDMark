// ================================================================
// Líneas de proceso - Lista del panel + selección
// ================================================================
// Renderiza la lista de líneas del P&ID y gestiona la selección.
// Cada fila tiene un botón "×" a la derecha para borrar esa línea
// (pide confirmación y queda pendiente hasta Guardar).

function renderizarListaLineas() {
  const cont = $('listaLineas');
  if (!cont) return;

  if (!lineas.cargado) {
    cont.innerHTML = '<div style="color:#666;font-size:11px;">Cargando…</div>';
    return;
  }
  if (lineas.delPidActual.length === 0) {
    cont.innerHTML = '<div style="color:#666;font-size:11px;">Sin líneas todavía. Usá "+ Nueva marcación de línea".</div>';
    return;
  }

  cont.innerHTML = lineas.delPidActual.map(function (ln) {
    const colorDef = COLORES_LINEA[ln.color_indice] || { color: '#888' };
    const nombre = lineas.nombres[ln.color_indice] || ('Color ' + (ln.color_indice + 1));
    const sel = lineas.seleccionada === ln.id ? ' seleccionada' : '';
    const pendiente = ln.id < 0 ? ' <span style="color:#FFA726;font-size:10px;">(sin guardar)</span>' : '';
    return '<div class="itemListaLinea' + sel + '" data-id="' + ln.id + '">' +
      '<span class="muestraLinea" style="background:' + colorDef.color + ';"></span>' +
      '<span class="textoLinea">' + escaparHTML(nombre) + ' · ' + Math.round(ln.grosor) + 'px · ' + ln.puntos.length + ' pts' + pendiente + '</span>' +
      '<button type="button" class="btnBorrarLinea" data-id="' + ln.id + '" title="Borrar línea">×</button>' +
    '</div>';
  }).join('');

  // Click en la fila = seleccionar
  cont.querySelectorAll('.itemListaLinea').forEach(function (el) {
    el.onclick = function (ev) {
      // Si el click fue en la X, no seleccionar
      if (ev.target && ev.target.classList && ev.target.classList.contains('btnBorrarLinea')) return;
      seleccionarLinea(parseInt(el.getAttribute('data-id'), 10));
    };
  });

  // Click en la X = borrar (con confirmación)
  cont.querySelectorAll('.btnBorrarLinea').forEach(function (btn) {
    btn.onclick = function (ev) {
      ev.stopPropagation();
      const id = parseInt(btn.getAttribute('data-id'), 10);
      if (typeof solicitarBorrarLinea === 'function') {
        solicitarBorrarLinea(id);
      }
    };
  });
}

function seleccionarLinea(id) {
  // Si había un parpadeo en curso ("Ver en plano") y se selecciona una
  // línea distinta, se corta.
  if (typeof cancelarParpadeoLinea === 'function' && lineas._parpadeoId !== null && lineas._parpadeoId !== id) {
    cancelarParpadeoLinea();
  }
  lineas.seleccionada = id;
  if (id) {
    const ln = lineas.delPidActual.find(l => l.id === id);
    if (ln) {
      lineas.colorIndice = ln.color_indice;
      lineas.grosor = ln.grosor;
      lineas.opacidad = ln.opacidad;
      if ($('inpGrosorLinea')) $('inpGrosorLinea').value = ln.grosor;
      if ($('inpOpacidadLinea')) $('inpOpacidadLinea').value = ln.opacidad;
      renderizarPaletaColores();
    }
  }
  renderizarListaLineas();
  if (typeof dibujarMarc === 'function') dibujarMarc();
}