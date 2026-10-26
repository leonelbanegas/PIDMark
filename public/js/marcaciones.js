// ================================================================
// Pantalla del listado plano de marcaciones
// ================================================================
// Tabla plana con drag & drop para reordenar, doble clic para
// editar y menú ⋮ por fila.
// MODIFICACIÓN: se agregó la columna UBICACION (grilla imaginaria).

// ============ Marcaciones ============
async function abrirMarcaciones() {
  const r = await fetchAPI('/api/listados/' + listadoActual.id + '/items');
  const d = await r.json();
  itemsDelListado = d.items || [];

  mostrarPantallaConFade('pantallaListadoAbierto', 'block', function () {
    marcarMenuActivo('menuListados');
  });
  if (typeof activarPestanaListado === 'function') activarPestanaListado('marcaciones');

  aplicarTituloListado($('tituloListado'), listadoActual.nombre);
  if (typeof actualizarEtiquetaDuenioListado === 'function') actualizarEtiquetaDuenioListado();
  actualizarDescripcionEnPantalla();
  dibujarTablaItems();
}

function dibujarTablaItems() {
  const cuerpo = $('cuerpoItems');
  const vacio = $('mensajeVacioMarc');
  const tabla = $('tablaItems');

  if (itemsDelListado.length === 0) {
    cuerpo.innerHTML = '';
    tabla.style.display = 'none';
    vacio.style.display = 'block';
    return;
  }

  tabla.style.display = '';
  vacio.style.display = 'none';

  const esPropio = !!(listadoActual && listadoActual.esPropio);

  if (esPropio) {
    tabla.classList.remove('tablaSoloLectura');
  } else {
    tabla.classList.add('tablaSoloLectura');
  }

  cuerpo.innerHTML = itemsDelListado.map(function (it, i) {
    const textoNum = (it.numero !== undefined && it.numero !== null) ? ('#' + it.numero) : '—';
    const textoTAG = escaparHTML(it.tag || '');
    const diametroTexto = textoDiametroConSimbolo(it.diametro);
    const descripcionTexto = it.descripcion ? String(it.descripcion) : '';
    const csoTildado = (it.cso_csc === 1 || it.cso_csc === true) ? 'checked' : '';

    const revHTML = (it.pid_nombre && it.pid_revision !== null && it.pid_revision !== undefined)
      ? formatearRevision(it.pid_nombre, it.pid_revision, formatearHoja(it.hoja || it.pid_hoja))
      : '—';

    const hojaTexto = formatearHoja(it.hoja || it.pid_hoja);
    
    // Columna Ubicación: se lee del backend o se calcula por las dudas.
    let ubicacionTexto = it.ubicacion;
    if (!ubicacionTexto && typeof calcularUbicacionGrilla === 'function' && it.x !== null && it.y !== null) {
      // Como no tenemos marc.ancho/alto acá, si no vino del backend no la podemos calcular con precisión.
      // Pero como el backend la va a devolver siempre de ahora en más, no debería hacer falta.
      ubicacionTexto = '—';
    }
    if (!ubicacionTexto) ubicacionTexto = '—';

    return (
      '<tr class="filaArrastrable" data-id="' + it.id + '" draggable="' + (esPropio ? 'true' : 'false') + '">' +
        '<td class="agarre">' + (esPropio ? '⋮⋮' : '') + '</td>' +
        '<td class="celdaNumero colCentrada">' + textoNum + '</td>' +
        '<td title="' + textoTAG + '">' + (textoTAG || '—') + '</td>' +
        '<td class="colCentrada">' + (diametroTexto || '—') + '</td>' +
        '<td title="' + escaparHTML(descripcionTexto) + '">' + (descripcionTexto ? escaparHTML(descripcionTexto) : '—') + '</td>' +
        '<td>' + etiquetaEstado(it.estado) + '</td>' +
        '<td><input type="checkbox" class="checkCsoCsc" tabindex="-1" ' + csoTildado + '></td>' +
        '<td title="' + escaparHTML(it.pid_nombre || '') + '">' + escaparHTML(it.pid_nombre || '—') + '</td>' +
        '<td>' + escaparHTML(hojaTexto) + '</td>' +
        '<td>' + revHTML + '</td>' +
        '<td class="colCentrada">' + escaparHTML(ubicacionTexto) + '</td>' +
        '<td class="celdaAccionesCentrada">' +
          '<button type="button" class="btnMenu" data-accion="menu_item" data-id="' + it.id + '" title="Acciones">&#8942;</button>' +
        '</td>' +
      '</tr>'
    );
  }).join('');

  engancharDragAndDrop();
  engancharDobleClicEditar();
}

function opcionesMenuItem(it) {
  const esPropio = !!(listadoActual && listadoActual.esPropio);
  const ops = [];

  if (it.pid_nombre && it.pid_revision !== null && it.pid_revision !== undefined &&
      it.x !== null && it.y !== null) {
    ops.push({
      texto: 'Ver en plano',
      accion: function () {
        abrirVisorMarcadoYCentrar(
          it.pid_nombre,
          formatearHoja(it.hoja || it.pid_hoja),
          it.pid_revision,
          it.id,
          it.numero
        );
      }
    });
  }

  if (esPropio) {
    if (ops.length > 0) ops.push({ separador: true });
    ops.push({ texto: 'Editar', accion: function () { accionEditarItem(it.id); } });
    ops.push({ separador: true });
    ops.push({ texto: 'Borrar', peligro: true, accion: function () { accionBorrarItem(it.id); } });
  }

  return ops;
}

function engancharDobleClicEditar() {
  const cuerpo = $('cuerpoItems');
  if (!cuerpo) return;

  if (cuerpo._dblHandler) {
    cuerpo.removeEventListener('dblclick', cuerpo._dblHandler);
  }

  function onDblClick(e) {
    if (!listadoActual || !listadoActual.esPropio) return;
    if (e.target.closest('button')) return;
    if (e.target.closest('input[type="checkbox"]')) return;

    const tr = e.target.closest('tr');
    if (!tr) return;
    if (tr.parentNode !== cuerpo) return;

    const id = parseInt(tr.getAttribute('data-id'), 10);
    if (!id) return;

    accionEditarItem(id);
  }

  cuerpo.addEventListener('dblclick', onDblClick);
  cuerpo._dblHandler = onDblClick;
}

function engancharDragAndDrop() {
  const cuerpo = $('cuerpoItems');
  if (!cuerpo) return;

  if (cuerpo._dndHandlers) {
    cuerpo.removeEventListener('dragstart', cuerpo._dndHandlers.dragstart);
    cuerpo.removeEventListener('dragover', cuerpo._dndHandlers.dragover);
    cuerpo.removeEventListener('dragleave', cuerpo._dndHandlers.dragleave);
    cuerpo.removeEventListener('drop', cuerpo._dndHandlers.drop);
    cuerpo.removeEventListener('dragend', cuerpo._dndHandlers.dragend);
  }

  let filaArrastrada = null;

  function getFilaDeEvento(e) {
    const tr = e.target.closest('tr');
    if (!tr) return null;
    if (tr.parentNode !== cuerpo) return null;
    return tr;
  }

  function limpiarMarcadores() {
    cuerpo.querySelectorAll('tr').forEach(function (f) {
      f.classList.remove('sobreArriba', 'sobreAbajo', 'arrastrando');
    });
  }

  function onDragStart(e) {
    if (!listadoActual || !listadoActual.esPropio) {
      e.preventDefault();
      return;
    }

    const fila = getFilaDeEvento(e);
    if (!fila) return;

    filaArrastrada = fila;
    fila.classList.add('arrastrando');

    try {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', fila.getAttribute('data-id') || '');
    } catch (err) { /* noop */ }
  }

  function onDragOver(e) {
    if (!filaArrastrada) return;

    const fila = getFilaDeEvento(e);
    if (!fila) return;
    if (fila === filaArrastrada) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    cuerpo.querySelectorAll('tr').forEach(function (f) {
      f.classList.remove('sobreArriba', 'sobreAbajo');
    });

    const rect = fila.getBoundingClientRect();
    const mitad = rect.top + rect.height / 2;

    if (e.clientY < mitad) fila.classList.add('sobreArriba');
    else fila.classList.add('sobreAbajo');
  }

  function onDragLeave(e) {
    const relacionado = e.relatedTarget;
    if (relacionado && cuerpo.contains(relacionado)) return;

    cuerpo.querySelectorAll('tr').forEach(function (f) {
      f.classList.remove('sobreArriba', 'sobreAbajo');
    });
  }

  function onDrop(e) {
    if (!filaArrastrada) return;

    const fila = getFilaDeEvento(e);
    if (!fila) return;

    e.preventDefault();

    if (fila === filaArrastrada) {
      limpiarMarcadores();
      return;
    }

    const rect = fila.getBoundingClientRect();
    const mitad = rect.top + rect.height / 2;
    const insertarAntes = e.clientY < mitad;

    if (insertarAntes) cuerpo.insertBefore(filaArrastrada, fila);
    else cuerpo.insertBefore(filaArrastrada, fila.nextSibling);

    const ids = Array.from(cuerpo.querySelectorAll('tr')).map(function (f) {
      return parseInt(f.getAttribute('data-id'), 10);
    });

    limpiarMarcadores();
    filaArrastrada = null;

    itemsDelListado.sort(function (a, b) {
      return ids.indexOf(a.id) - ids.indexOf(b.id);
    });

    renumerarCeldasNumeroEnTabla();

    fetchAPI('/api/listados/' + listadoActual.id + '/reordenar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ids })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.error) {
          mostrarAviso(d.error, true);
          abrirMarcaciones();
        }
      })
      .catch(function (e) {
        mostrarAviso('Error al reordenar: ' + e.message, true);
        abrirMarcaciones();
      });
  }

  function onDragEnd() {
    limpiarMarcadores();
    filaArrastrada = null;
  }

  cuerpo.addEventListener('dragstart', onDragStart);
  cuerpo.addEventListener('dragover', onDragOver);
  cuerpo.addEventListener('dragleave', onDragLeave);
  cuerpo.addEventListener('drop', onDrop);
  cuerpo.addEventListener('dragend', onDragEnd);

  cuerpo._dndHandlers = {
    dragstart: onDragStart,
    dragover: onDragOver,
    dragleave: onDragLeave,
    drop: onDrop,
    dragend: onDragEnd
  };
}

function renumerarCeldasNumeroEnTabla() {
  const cuerpo = $('cuerpoItems');
  if (!cuerpo) return;

  const filas = Array.from(cuerpo.querySelectorAll('tr'));
  filas.forEach(function (fila, i) {
    const celda = fila.querySelector('.celdaNumero');
    if (celda) celda.textContent = '#' + (i + 1);
    // Mantener sincronizado el numero en los objetos (evita mostrar # viejo
    // al abrir el modal de edicion sin recargar la pantalla).
    const id = parseInt(fila.getAttribute('data-id'), 10);
    const it = itemsDelListado.find(function (x) { return x.id === id; });
    if (it) it.numero = i + 1;
  });
}

function accionEditarItem(id) {
  const it = itemsDelListado.find(function (x) { return x.id === id; });
  if (!it) return;
  abrirModalItem(it);
}

function accionBorrarItem(id) {
  const it = itemsDelListado.find(function (x) { return x.id === id; });
  if (!it) return;

  const textoNum = (it.numero !== undefined && it.numero !== null) ? ('#' + it.numero) : '(sin número)';

  abrirModal(
    'Confirmar borrado',
    '<p>¿Seguro que querés borrar la marcación <strong>' + textoNum + '</strong>?</p>' +
    '<p style="color:#888;">Las marcas siguientes se van a renumerar automáticamente.</p>',
    function () {
      fetchAPI('/api/items/' + id, { method: 'DELETE' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.error) { mostrarAviso(d.error, true); return; }
          mostrarAviso('Marcación borrada.');
          abrirMarcaciones();
        });
    }
  );
}

function abrirModalItem(item) {
  const it = item;
  const textoNum = (it.numero !== undefined && it.numero !== null) ? ('#' + it.numero) : '(sin número)';
  const csoTildado = (it.cso_csc === 1 || it.cso_csc === true) ? ' checked' : '';
  const hojaTexto = formatearHoja(it.hoja || it.pid_hoja);

  // Total de marcas del listado (para limitar la posición a la que se puede mover).
  const totalItems = itemsDelListado.length;

  const html =
    '<p style="margin-top:0;font-size:16px;"><strong>Marcación ' + textoNum + '</strong></p>' +

    '<label class="campoCheckboxModal" style="margin-bottom:6px;">' +
      '<input type="checkbox" id="chkMoverPosItem">' +
      '<span>Mover a posición:</span>' +
      '<input type="number" id="inpMoverPosItem" min="1" max="' + totalItems + '" step="1" ' +
        'value="' + (it.numero !== undefined && it.numero !== null ? it.numero : '') + '" ' +
        'style="width:80px;margin-left:8px;" disabled>' +
    '</label>' +

    '<label>Tag:' +
    '<input type="text" id="inpTag" value="' + escaparHTML(it.tag || '') + '" placeholder="Ej: FV-101"></label>' +

    '<label>Diámetro (pulg):' +
    '<input type="number" id="inpDiametro" min="0" step="0.1" value="' + (it.diametro !== null && it.diametro !== undefined ? it.diametro : '') + '" placeholder="Ej: 4"></label>' +

    '<label>Descripción:' +
    '<input type="text" id="inpDescripcion" maxlength="' + LARGO_MAX_DESCRIPCION + '" value="' + escaparHTML(it.descripcion || '') + '" placeholder="Ej: Válvula de corte línea principal"></label>' +

    '<div class="filaCampos">' +
      '<label>Estado:' +
        '<select id="inpEstado">' +
          '<option value="abierto"' + (it.estado === 'abierto' ? ' selected' : '') + '>Abierto</option>' +
          '<option value="cerrado"' + (it.estado === 'cerrado' ? ' selected' : '') + '>Cerrado</option>' +
          '<option value="otro"' + (it.estado === 'otro' ? ' selected' : '') + '>Otro</option>' +
        '</select>' +
      '</label>' +
      '<label>Forma:' +
        '<select id="inpForma">' +
          '<option value="circulo"' + (it.forma === 'circulo' ? ' selected' : '') + '>Círculo</option>' +
          '<option value="rectangular"' + (it.forma === 'rectangular' ? ' selected' : '') + '>Rectangular</option>' +
        '</select>' +
      '</label>' +
    '</div>' +

    '<label class="campoCheckboxModal">' +
      '<input type="checkbox" id="inpCsoCsc"' + csoTildado + '>' +
      '<span>CSO/C</span>' +
    '</label>' +

    '<label>P&amp;ID: <strong>' + escaparHTML(it.pid_nombre || '—') +
      ' (Hoja ' + escaparHTML(hojaTexto) + ')' +
      ' Rev' + escaparHTML(it.pid_revision !== null && it.pid_revision !== undefined ? it.pid_revision : '—') + '</strong></label>';

  abrirModal('Editar marcación', html, function () {
    const diametroRaw = $('inpDiametro').value.trim();

    // --- Mover a posición (opcional) ---
    const chkMover = $('chkMoverPosItem');
    const inpMover = $('inpMoverPosItem');
    let moverA = null;
    if (chkMover && chkMover.checked) {
      const rawPos = inpMover ? String(inpMover.value).trim() : '';
      const pos = parseInt(rawPos, 10);
      if (isNaN(pos) || pos < 1 || pos > totalItems) {
        mostrarAviso('La posición debe ser un número entero entre 1 y ' + totalItems + '.', true);
        return false;
      }
      moverA = pos;
    }

    const cuerpo = {
      tag: $('inpTag').value.trim(),
      descripcion: $('inpDescripcion').value.trim(),
      estado: $('inpEstado').value,
      forma: $('inpForma').value,
      cso_csc: $('inpCsoCsc').checked ? 1 : 0
    };

    if (diametroRaw === '') {
      cuerpo.diametro = null;
    } else {
      const n = parseFloat(diametroRaw);
      if (isNaN(n) || n <= 0) {
        mostrarAviso('El diámetro debe ser un número positivo.', true);
        return false;
      }
      cuerpo.diametro = n;
    }

    fetchAPI('/api/items/' + it.id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo)
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.error) { mostrarAviso(d.error, true); return; }

        // Si se pidió mover, reordenamos itemsDelListado y persistimos.
        if (moverA !== null) {
          moverItemDelListadoAPosicion(it.id, moverA);
          const ids = itemsDelListado.map(function (x) { return x.id; });
          return fetchAPI('/api/listados/' + listadoActual.id + '/reordenar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: ids })
          })
            .then(function (r) { return r.json(); })
            .then(function (dr) {
              if (dr && dr.error) { mostrarAviso(dr.error, true); }
              else { mostrarAviso('Marcación actualizada y reordenada.'); }
              abrirMarcaciones();
            })
            .catch(function (e) {
              mostrarAviso('Error al reordenar: ' + e.message, true);
              abrirMarcaciones();
            });
        }

        mostrarAviso('Marcación actualizada.');
        abrirMarcaciones();
      });
  });

  setTimeout(function () {
    $('inpTag').focus();
    // Habilitar el input de posición solo cuando se tilda el checkbox.
    const chk = $('chkMoverPosItem');
    const inp = $('inpMoverPosItem');
    if (chk && inp) {
      chk.addEventListener('change', function () {
        inp.disabled = !chk.checked;
        if (chk.checked) { inp.focus(); inp.select(); }
      });
    }
  }, 50);
}

// Mueve el ítem (por id) a la posición indicada (1-based) dentro de
// itemsDelListado, desplazando el resto, y renumera 1..N.
function moverItemDelListadoAPosicion(idItem, posDestino) {
  const idxActual = itemsDelListado.findIndex(function (x) { return x.id === idItem; });
  if (idxActual === -1) return;
  const copia = itemsDelListado.slice();
  const [movido] = copia.splice(idxActual, 1);
  const idx = Math.max(0, Math.min(copia.length, posDestino - 1));
  copia.splice(idx, 0, movido);
  copia.forEach(function (x, i) { x.numero = i + 1; });
  itemsDelListado.length = 0;
  Array.prototype.push.apply(itemsDelListado, copia);
}
