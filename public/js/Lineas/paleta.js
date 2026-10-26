// ================================================================
// Líneas de proceso - Paleta de colores (render del panel)
// ================================================================
// Dibuja los 10 colores en el panel lateral, permite seleccionar
// el color activo y renombrar los 7 colores configurables.
// Al renombrar, se actualizan: paleta, lista de líneas y leyenda.
//
// El input del modal de renombrar arranca con TODO el texto
// seleccionado: se logra con onfocus + select(), para que al
// presionar una tecla se reemplace el nombre completo.

function renderizarPaletaColores() {
  const cont = $('paletaColoresLineas');
  if (!cont) return;
  cont.innerHTML = '';

  COLORES_LINEA.forEach(function (c) {
    const nombre = lineas.nombres[c.indice] || ('Color ' + (c.indice + 1));
    const activo = lineas.colorIndice === c.indice ? ' activo' : '';

    const div = document.createElement('div');
    div.className = 'colorLinea' + activo;
    div.setAttribute('data-indice', c.indice);
    div.title = nombre;

    div.innerHTML = '<span class="muestraColor" style="background:' + c.color + ';"></span>' +
      '<span class="nombreColor">' + escaparHTML(nombre) + '</span>' +
      (!c.fijo ? '<button type="button" class="btnRenombrarColor" title="Renombrar">✎</button>' : '');

    div.onclick = function (ev) {
      if (ev.target && ev.target.closest && ev.target.closest('.btnRenombrarColor')) return;
      lineas.colorIndice = c.indice;
      if (lineas.seleccionada) {
        const ln = lineas.delPidActual.find(l => l.id === lineas.seleccionada);
        if (ln) {
          ln.color_indice = c.indice;
          marcarLineaModificada(ln);
          if (typeof actualizarBotonGuardar === 'function') actualizarBotonGuardar();
        }
      }
      renderizarPaletaColores();
      renderizarListaLineas();
      dibujarMarc();
    };

    const btnRen = div.querySelector('.btnRenombrarColor');
    if (btnRen) btnRen.onclick = function (ev) { ev.stopPropagation(); renombrarColorLinea(c.indice); };
    cont.appendChild(div);
  });
}

function renombrarColorLinea(indice) {
  if (indice < 3) return;
  const nombreActual = lineas.nombres[indice] || ('Color ' + (indice + 1));

  abrirModal('Renombrar color', '<label>Nombre para el color ' + (indice + 1) + ':' +
    '<input type="text" id="inpNombreColor" maxlength="40" value="' + escaparHTML(nombreActual) + '"></label>',
    function () {
      const inp = $('inpNombreColor'), nuevo = (inp ? inp.value : '').trim();
      if (!nuevo) { mostrarAviso('El nombre no puede estar vacío.', true); return false; }

      fetchAPI('/api/pids/' + encodeURIComponent(lineas._pidNombre) + '/' + encodeURIComponent(lineas._pidHoja) + '/nombres-colores/' + indice, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre: nuevo })
      }).then(r => r.json()).then(d => {
          if (d.error) { mostrarAviso(d.error, true); return; }
          lineas.nombres[indice] = nuevo;

          // Refrescar TODOS los lugares donde aparece el nombre:
          renderizarPaletaColores();     // panel de colores
          renderizarListaLineas();       // lista de líneas del P&ID
          if (typeof renderizarLeyendaLineas === 'function') {
            renderizarLeyendaLineas();   // leyenda flotante movible
          }

          mostrarAviso('Nombre actualizado.');
      });
    }
  );

  // Enganchar el input del modal en cuanto exista en el DOM.
  // Usamos onfocus + select() para que, sin importar quién le dé
  // el foco (nosotros, el modal, el navegador), el texto quede
  // seleccionado completo. Al presionar una tecla, se reemplaza.
  _engancharSelectAllNombreColor();
}

// Espera a que el input exista (el modal lo agrega al DOM en el
// mismo tick o en el siguiente) y le engancha el onfocus+select.
function _engancharSelectAllNombreColor() {
  let intentos = 0;
  const MAX_INTENTOS = 20; // ~400ms
  const esperar = setInterval(function () {
    intentos++;
    const inp = $('inpNombreColor');
    if (inp) {
      clearInterval(esperar);

      // onfocus: cada vez que reciba foco, seleccionar todo.
      inp.onfocus = function () {
        // Un setTimeout 0 para que el navegador termine de
        // posicionar el cursor antes de seleccionar.
        setTimeout(function () { try { inp.select(); } catch (e) {} }, 0);
      };

      // Foco inicial: dejamos que se dispare el onfocus.
      inp.focus();

      // Refuerzo: si por alguna razón el navegador reubica el
      // cursor después del foco, re-seleccionamos.
      setTimeout(function () {
        if (document.activeElement === inp) {
          try { inp.select(); } catch (e) {}
        }
      }, 50);

      return;
    }
    if (intentos >= MAX_INTENTOS) clearInterval(esperar);
  }, 20);
}