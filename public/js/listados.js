// ================================================================
// Pantalla de listados + pantalla de edición del listado
// ================================================================
// Listados: tabla con filtro Míos/Todos, acciones (abrir, renombrar,
// borrar, copiar, cambiar dueño).
// Edición: P&ID del listado + descripción editable + agregar/quitar
// P&ID.

// ============ Listados ============
async function cargarListados() {
  const r = await fetchAPI('/api/listados');
  const d = await r.json();
  listados = d.listados;
  dibujarTablaListados();
}

function dibujarTablaListados() {
  const cuerpo = $('cuerpoTabla');
  const vacio = $('mensajeVacio');
  const tabla = $('tablaListados');

  const filtro = listadoFiltroTexto.trim().toLowerCase();

  const visibles = listados.filter(function (l) {
    if (filtroActual === 'mios' && !l.esPropio) return false;

    if (!filtro) return true;
    // Busca por nombre, dueño y también por el # (id) del listado.
    // Se quita un '#' inicial por si el usuario escribe "#12".
    const filtroSinNumeral = filtro.charAt(0) === '#' ? filtro.slice(1) : filtro;
    const texto = (String(l.nombre) + ' ' + String(l.usuario) + ' #' + String(l.id) + ' ' + String(l.id)).toLowerCase();
    return texto.indexOf(filtro) !== -1 || texto.indexOf(filtroSinNumeral) !== -1;
  });

  if (visibles.length === 0) {
    cuerpo.innerHTML = '';
    tabla.style.display = 'none';
    vacio.style.display = 'block';
    return;
  }

  tabla.style.display = '';
  vacio.style.display = 'none';

  // El número de listado es su id (único e irrepetible). Al borrar un
  // listado su número no se reutiliza: el hueco queda visible.
  cuerpo.innerHTML = visibles.map(function (l) {
    const etiqueta = l.esPropio
      ? '<span class="etiqueta etiquetaPropia">Propio</span>'
      : '<span class="etiqueta etiquetaOtro">De ' + escaparHTML(l.usuario) + '</span>';

    const descripcion = l.descripcion ? String(l.descripcion) : '';
    const titleAttr = descripcion ? ' title="' + escaparHTML(descripcion) + '"' : '';

    return (
      '<tr class="filaAbrible" data-id="' + l.id + '">' +
        '<td>' + l.id + '</td>' +
        '<td' + titleAttr + '>' +
          '<div class="celdaNombreListado">' +
            '<span class="nombreListadoTexto">' + escaparHTML(l.nombre) + '</span>' +
            etiqueta +
          '</div>' +
        '</td>' +
        '<td>' + escaparHTML(l.usuario) + '</td>' +
        '<td>' + l.cantidad_pids + '</td>' +
        '<td>' + l.cantidad_items + '</td>' +
        '<td>' + formatearFecha(l.modificado) + '</td>' +
        '<td class="celdaAccionesCentrada">' +
          '<button type="button" class="btnMenu" data-accion="menu_listado" data-id="' + l.id + '" title="Acciones">&#8942;</button>' +
        '</td>' +
      '</tr>'
    );
  }).join('');
}

function opcionesMenuListado(l) {
  const esAdmin = !!(sesion && sesion.admin);
  const ops = [];

  ops.push({ texto: 'Abrir', accion: function () { abrirListado(l.id); } });

  if (l.esPropio) {
    // Propio: Abrir, Renombrar, Borrar. Si es admin tambien puede
    // cambiar el dueño (dejaria de ser propio).
    ops.push({ texto: 'Renombrar', accion: function () { accionRenombrar(l.id); } });
    ops.push({ separador: true });
    ops.push({ texto: 'Borrar', peligro: true, accion: function () { accionBorrar(l.id); } });
    if (esAdmin) {
      ops.push({ separador: true });
      ops.push({ texto: 'Cambiar dueño', accion: function () { accionCambiarDuenio(l.id); } });
    }
  } else if (esAdmin) {
    // Ajeno + admin: Abrir, Copiar, Renombrar, Borrar, Cambiar dueño.
    ops.push({ texto: 'Copiar a mi usuario', accion: function () { accionCopiar(l.id); } });
    ops.push({ texto: 'Renombrar', accion: function () { accionRenombrar(l.id); } });
    ops.push({ separador: true });
    ops.push({ texto: 'Borrar', peligro: true, accion: function () { accionBorrar(l.id); } });
    ops.push({ separador: true });
    ops.push({ texto: 'Cambiar dueño', accion: function () { accionCambiarDuenio(l.id); } });
  } else {
    // Ajeno + no admin: Abrir, Copiar.
    ops.push({ texto: 'Copiar a mi usuario', accion: function () { accionCopiar(l.id); } });
  }

  return ops;
}

function accionNuevo() {
  const contenido =
    '<label>Nombre del listado:' +
    '<input type="text" id="inputNombreListado" maxlength="' + LARGO_MAX_NOMBRE_LISTADO + '" placeholder="Ej: Válvulas Línea 1"></label>' +
    '<div class="contadorCaracteres"><span id="contadorNombreListado">' + LARGO_MAX_NOMBRE_LISTADO + '</span> caracteres restantes</div>';

  abrirModal('Nuevo listado', contenido, function () {
    const nombre = $('inputNombreListado').value.trim();
    if (!nombre) { mostrarAviso('El nombre no puede estar vacío.', true); return false; }

    fetchAPI('/api/listados', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: nombre, pids: [] })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.error) { mostrarAviso(d.error, true); return; }
        mostrarAviso('Listado creado.');
        cargarListados();
      });
  });

  engancharContadorNombreListado();
  setTimeout(function () { $('inputNombreListado').focus(); }, 50);
}

// Contador de caracteres restantes del nombre del listado (modal nuevo/renombrar).
function engancharContadorNombreListado() {
  const input = $('inputNombreListado');
  const contador = $('contadorNombreListado');
  if (!input || !contador) return;

  function actualizar() {
    const restantes = LARGO_MAX_NOMBRE_LISTADO - input.value.length;
    contador.textContent = String(restantes);
    if (restantes <= 0) contador.classList.add('alLimite');
    else contador.classList.remove('alLimite');
  }

  input.addEventListener('input', actualizar);
  actualizar();
}

function accionRenombrar(id) {
  const l = listados.find(function (x) { return x.id === id; });
  if (!l) return;

  abrirModal(
    'Renombrar listado',
    '<label>Nuevo nombre:' +
    '<input type="text" id="inputNombreListado" maxlength="' + LARGO_MAX_NOMBRE_LISTADO + '" value="' + escaparHTML(l.nombre) + '"></label>' +
    '<div class="contadorCaracteres"><span id="contadorNombreListado">' + LARGO_MAX_NOMBRE_LISTADO + '</span> caracteres restantes</div>',
    function () {
      const nombre = $('inputNombreListado').value.trim();
      if (!nombre) { mostrarAviso('Nombre vacío.', true); return false; }
      fetchAPI('/api/listados/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombre })
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.error) { mostrarAviso(d.error, true); return; }
          mostrarAviso('Listado renombrado.');
          cargarListados();
        });
    }
  );
  engancharContadorNombreListado();
  setTimeout(function () { const i = $('inputNombreListado'); i.focus(); i.select(); }, 50);
}

function accionBorrar(id) {
  const l = listados.find(function (x) { return x.id === id; });
  if (!l) return;

  abrirModal(
    'Confirmar borrado',
    '<p>¿Seguro que querés borrar el listado <strong>' + escaparHTML(l.nombre) + '</strong>?</p>' +
    '<p style="color:#b71c1c;">Esta acción no se puede deshacer.</p>',
    function () {
      fetchAPI('/api/listados/' + id, { method: 'DELETE' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.error) { mostrarAviso(d.error, true); return; }
          mostrarAviso('Listado borrado.');
          cargarListados();
        });
    }
  );
}

function accionCopiar(id) {
  const l = listados.find(function (x) { return x.id === id; });
  if (!l) return;

  abrirModal(
    'Copiar listado a mi usuario',
    '<p>Se va a crear una copia del listado <strong>' + escaparHTML(l.nombre) + '</strong> en tu usuario, con sus P&amp;ID e ítems.</p>' +
    '<label>Nombre de la copia:' +
    '<input type="text" id="inputNombreListado" value="' + escaparHTML(l.nombre + ' (copia)') + '"></label>',
    function () {
      const nombre = $('inputNombreListado').value.trim();
      if (!nombre) { mostrarAviso('Nombre vacío.', true); return false; }
      fetchAPI('/api/listados/' + id + '/copiar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombre })
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.error) { mostrarAviso(d.error, true); return; }
          mostrarAviso('Copiado con ' + d.pidsCopiados + ' P&ID y ' + d.itemsCopiados + ' ítems.');
          cargarListados();
        });
    }
  );
  setTimeout(function () { const i = $('inputNombreListado'); i.focus(); i.select(); }, 50);
}

function accionCambiarDuenio(id) {
  if (!sesion || !sesion.admin) {
    mostrarAviso('Solo el administrador puede cambiar el dueño.', true);
    return;
  }

  const l = listados.find(function (x) { return x.id === id; });
  if (!l) return;

  fetchAPI('/api/usuarios')
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.error) { mostrarAviso(d.error, true); return; }

      const usuarios = d.usuarios || [];

      // Nombres existentes (lowercase) para saber si hay que confirmar la creacion.
      const nombresExistentes = usuarios.map(function (u) {
        return String(u.nombre_windows).toLowerCase();
      });

      const contenido =
        '<p>Listado: <strong>' + escaparHTML(l.nombre) + '</strong></p>' +
        '<p style="margin-top:-6px;color:#999;">Dueño actual: <strong>' + escaparHTML(l.usuario) + '</strong></p>' +
        '<label>Nuevo dueño:' +
          '<span class="contenedorSugerenciasDuenio">' +
            '<input type="text" id="inputNuevoDuenio" ' +
                   'placeholder="Elegí uno o escribí uno nuevo" autocomplete="off">' +
            '<div class="sugerenciasDuenio" id="sugerenciasDuenio" style="display:none;"></div>' +
          '</span>' +
        '</label>' +
        '<p style="color:#888;font-size:12px;">Si el usuario no existe, se te pedirá confirmación antes de crearlo.</p>';

      // Envía el cambio de dueño al backend. Al terminar, cierra el modal
      // principal (si se pasó) y recarga la lista.
      function ejecutarCambioDuenio(nuevo, modalPrincipal) {
        fetchAPI('/api/listados/' + id + '/cambiar-duenio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nuevo_usuario: nuevo })
        })
          .then(function (r) { return r.json(); })
          .then(function (resp) {
            if (resp.error) {
              mostrarAviso(resp.error, true);
              return;
            }
            if (modalPrincipal && typeof modalPrincipal.cerrar === 'function') {
              modalPrincipal.cerrar();
            }
            mostrarAviso('Dueño cambiado: "' + resp.duenio_anterior + '" → "' + resp.duenio_nuevo + '".');
            cargarListados();
          });
      }

      const modal = abrirModal('Cambiar dueño del listado', contenido, function () {
        const nuevo = $('inputNuevoDuenio').value.trim();
        if (!nuevo) {
          mostrarAviso('Ingresá un nombre de usuario.', true);
          return false;
        }

        if (nuevo.toLowerCase() === String(l.usuario).toLowerCase()) {
          mostrarAviso('El listado ya pertenece a "' + l.usuario + '".', true);
          return false;
        }

        // Si el usuario no existe en la base, se pide confirmación antes de
        // crearlo. El modal principal queda abierto hasta resolver.
        const existe = nombresExistentes.indexOf(nuevo.toLowerCase()) !== -1;
        if (!existe) {
          abrirModal('Crear usuario nuevo',
            '<p>El usuario <strong>' + escaparHTML(nuevo) + '</strong> no existe en la base de datos.</p>' +
            '<p>Se creará automáticamente y quedará como dueño de este listado.</p>' +
            '<p>¿Querés continuar?</p>',
            function () {
              ejecutarCambioDuenio(nuevo, modal);
              return true;
            },
            { textoAceptar: 'Crear y asignar' });
          // Mantener abierto el modal de cambiar dueño.
          return false;
        }

        ejecutarCambioDuenio(nuevo, modal);
        // El cierre lo hace ejecutarCambioDuenio al terminar el POST.
        return false;
      });

      // Clase propia: modal un poco mas alto y sin scroll propio, asi la
      // unica barra visible es la del dropdown de sugerencias.
      const cajaModal = $('modalCaja');
      if (cajaModal) cajaModal.classList.add('modalCambiarDuenio');
      if (modal && typeof modal.alCerrar === 'function') {
        modal.alCerrar(function () {
          const c = $('modalCaja');
          if (c) c.classList.remove('modalCambiarDuenio');
        });
      }

      setTimeout(function () {
        const inp = $('inputNuevoDuenio');
        const caja = $('sugerenciasDuenio');
        if (!inp || !caja) { if (inp) inp.focus(); return; }

        let indiceResaltado = -1;

        function cerrarSugerencias() {
          caja.style.display = 'none';
          caja.innerHTML = '';
          indiceResaltado = -1;
        }

        function resaltar(nuevo) {
          const items = caja.querySelectorAll('.itemSugerenciaDuenio');
          if (!items.length) { indiceResaltado = -1; return; }
          if (nuevo < 0) nuevo = items.length - 1;
          if (nuevo >= items.length) nuevo = 0;
          Array.prototype.forEach.call(items, function (el, i) {
            el.classList.toggle('resaltada', i === nuevo);
          });
          indiceResaltado = nuevo;
          const activo = items[nuevo];
          if (activo && activo.scrollIntoView) activo.scrollIntoView({ block: 'nearest' });
        }

        function elegir(nombre) {
          inp.value = nombre;
          cerrarSugerencias();
          inp.focus();
        }

        function renderSugerencias() {
          const texto = inp.value.trim().toLowerCase();
          if (!texto) { cerrarSugerencias(); return; }

          const coincidencias = usuarios.filter(function (u) {
            return String(u.nombre_windows).toLowerCase().indexOf(texto) !== -1;
          });

          if (coincidencias.length === 0) { cerrarSugerencias(); return; }

          caja.innerHTML = coincidencias.map(function (u, i) {
            return '<div class="itemSugerenciaDuenio" data-nombre="' +
              escaparHTML(u.nombre_windows) + '" data-indice="' + i + '">' +
              escaparHTML(u.nombre_windows) + '</div>';
          }).join('');
          caja.style.display = 'block';
          indiceResaltado = -1;
        }

        inp.addEventListener('input', renderSugerencias);

        inp.addEventListener('keydown', function (e) {
          const abierta = caja.style.display !== 'none' &&
            caja.querySelectorAll('.itemSugerenciaDuenio').length > 0;

          if (e.key === 'ArrowDown') {
            if (!abierta) { renderSugerencias(); return; }
            e.preventDefault();
            resaltar(indiceResaltado + 1);
          } else if (e.key === 'ArrowUp') {
            if (!abierta) return;
            e.preventDefault();
            resaltar(indiceResaltado - 1);
          } else if (e.key === 'Enter') {
            if (abierta && indiceResaltado >= 0) {
              e.preventDefault();
              e.stopPropagation();
              const el = caja.querySelectorAll('.itemSugerenciaDuenio')[indiceResaltado];
              if (el) elegir(el.getAttribute('data-nombre'));
            }
          } else if (e.key === 'Escape') {
            if (abierta) {
              e.preventDefault();
              e.stopPropagation();
              cerrarSugerencias();
            }
          }
        });

        // Clic en una sugerencia. mousedown + preventDefault para que el input
        // no pierda el foco antes de procesar el clic.
        caja.addEventListener('mousedown', function (e) {
          const item = e.target.closest('.itemSugerenciaDuenio');
          if (!item) return;
          e.preventDefault();
          elegir(item.getAttribute('data-nombre'));
        });

        inp.addEventListener('blur', function () {
          // Pequeña demora para permitir el clic (aunque mousedown ya lo cubre).
          setTimeout(cerrarSugerencias, 120);
        });

        inp.focus();
      }, 50);
    })
    .catch(function (e) {
      mostrarAviso('Error al obtener usuarios: ' + e.message, true);
    });
}

// ============ Pantalla de edición del listado ============
// Carga los datos del listado (listadoActual + pidsDelListado) y refresca
// los textos/etiquetas/tabla, SIN cambiar de pantalla. Devuelve true si OK.
// Lo usan abrirListado (que luego navega a Marcaciones) y
// recargarPidsDelListadoActual (que se queda en la pantalla de P&ID).
async function _cargarDatosListado(id) {
  // Refrescar SIEMPRE el catalogo global de P&IDs: el arbol de la pestaña
  // 'P&ID asignados' usa ultimaRevisionDeHoja(), que recorre la variable
  // global 'pids'. Si esa lista quedo vieja (p.ej. se cargo/modifico un
  // P&ID despues de la primera carga), no encuentra la revision nueva y
  // NINGUNA fila se marca como hija: el arbol desaparece.
  // asegurarPIDsCargados() NO alcanza porque no recarga si ya hay datos.
  await cargarPIDs();

  const r = await fetchAPI('/api/listados/' + id);
  const d = await r.json();
  if (d.error) { mostrarAviso(d.error, true); return false; }

  listadoActual = d.listado;
  pidsDelListado = d.pids;

  aplicarTituloListado($('tituloListado'), listadoActual.nombre);

  actualizarDescripcionEnPantalla();

  const et = $('etiquetaDuenio');
  if (listadoActual.esPropio) {
    et.textContent = 'Propio';
    et.className = 'etiqueta etiquetaPropia';
  } else {
    et.textContent = 'De ' + listadoActual.usuario;
    et.className = 'etiqueta etiquetaOtro';
  }
  actualizarEtiquetaSoloLectura();

  dibujarTablaPidsDelListado();
  return true;
}

async function abrirListado(id) {
  const ok = await _cargarDatosListado(id);
  if (!ok) return;

  // Al abrir un listado se entra directo a la pantalla de Marcaciones.
  abrirMarcaciones();
}

// Activa una pestaña de la pantalla unificada del listado abierto:
// 'marcaciones' | 'pids' | 'lineas'.
function activarPestanaListado(nombre) {
  const validas = ['marcaciones', 'pids', 'lineas'];
  if (validas.indexOf(nombre) === -1) nombre = 'marcaciones';

  const botones = document.querySelectorAll('#pantallaListadoAbierto .pestana');
  Array.prototype.forEach.call(botones, function (b) {
    const esActiva = (b.getAttribute('data-pestana') === nombre);
    b.classList.toggle('activa', esActiva);
    b.setAttribute('aria-selected', esActiva ? 'true' : 'false');
  });

  const secciones = [
    { id: 'pestanaContenidoMarcaciones', p: 'marcaciones' },
    { id: 'pestanaContenidoPids', p: 'pids' },
    { id: 'pestanaContenidoLineas', p: 'lineas' }
  ];
  secciones.forEach(function (s) {
    const el = $(s.id);
    if (el) el.style.display = (s.p === nombre) ? '' : 'none';
  });

  // Al entrar a la pestaña Líneas, cargar/refrescar la tabla.
  if (nombre === 'lineas' && typeof cargarLineasDelListado === 'function') {
    cargarLineasDelListado();
  }
}

// ================================================================
// PESTAÑA LÍNEAS: tabla plana con todas las líneas del listado
// ================================================================

// Cache en memoria de las líneas cargadas (una fila por línea, con su P&ID).
let lineasDelListado = [];

// Carga las líneas de TODOS los P&ID del listado (el endpoint es por P&ID).
async function cargarLineasDelListado() {
  if (!listadoActual) return;
  const cuerpo = $('cuerpoLineas');
  if (cuerpo) cuerpo.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#888;">Cargando…</td></tr>';

  const acumuladas = [];
  const pids = Array.isArray(pidsDelListado) ? pidsDelListado : [];

  for (let i = 0; i < pids.length; i++) {
    const p = pids[i];
    const hojaTexto = formatearHoja(p.hojaTexto || p.hoja);
    const rev = String(p.revision);
    try {
      const r = await fetchAPI('/api/listados/' + listadoActual.id + '/lineas/' +
        encodeURIComponent(p.pid) + '/' +
        encodeURIComponent(hojaTexto) + '/' +
        encodeURIComponent(rev));
      const d = await r.json();
      if (d && Array.isArray(d.lineas)) {
        d.lineas.forEach(function (ln) {
          acumuladas.push({
            id: ln.id,
            orden: ln.orden,
            pid_nombre: ln.pid_nombre,
            pid_hoja: ln.pid_hoja,
            pid_revision: String(ln.pid_revision),
            color_indice: ln.color_indice,
            grosor: ln.grosor,
            opacidad: ln.opacidad,
            descripcion: ln.descripcion || null,
            puntos: ln.puntos || []
          });
        });
      }
    } catch (e) { /* seguimos con el resto */ }
  }

  // Orden: por P&ID (alfabético) -> hoja -> rev -> orden de la línea.
  acumuladas.sort(function (a, b) {
    if (a.pid_nombre !== b.pid_nombre) return String(a.pid_nombre).localeCompare(String(b.pid_nombre));
    if (a.pid_hoja !== b.pid_hoja) return String(a.pid_hoja).localeCompare(String(b.pid_hoja));
    if (a.pid_revision !== b.pid_revision) return String(a.pid_revision).localeCompare(String(b.pid_revision));
    return (a.orden || 0) - (b.orden || 0);
  });

  lineasDelListado = acumuladas;
  dibujarTablaLineas();
}

// Nombre visible del color de una línea (Gas / Petróleo / Agua / Color N).
function _nombreColorLinea(indice) {
  const nombres = (typeof lineas !== 'undefined' && Array.isArray(lineas.nombres))
    ? lineas.nombres
    : (typeof NOMBRES_COLORES_LINEA_DEFAULT !== 'undefined' ? NOMBRES_COLORES_LINEA_DEFAULT : []);
  return nombres[indice] || ('Color ' + (indice + 1));
}

function _colorHexLinea(indice) {
  if (typeof COLORES_LINEA !== 'undefined' && COLORES_LINEA[indice]) return COLORES_LINEA[indice].color;
  return '#888';
}

function dibujarTablaLineas() {
  const cuerpo = $('cuerpoLineas');
  const vacio = $('mensajeVacioLineas');
  const tabla = $('tablaLineas');
  if (!cuerpo || !tabla) return;

  if (!lineasDelListado || lineasDelListado.length === 0) {
    cuerpo.innerHTML = '';
    tabla.style.display = 'none';
    if (vacio) vacio.style.display = 'block';
    return;
  }

  tabla.style.display = '';
  if (vacio) vacio.style.display = 'none';

  const puedeEditar = !!(listadoActual && listadoActual.puedeEditar);

  cuerpo.innerHTML = lineasDelListado.map(function (ln) {
    const color = _colorHexLinea(ln.color_indice);
    const nombreColor = _nombreColorLinea(ln.color_indice);
    const hojaTexto = formatearHoja(ln.pid_hoja);
    const desc = ln.descripcion ? String(ln.descripcion) : '';
    return '<tr class="filaLinea" data-id="' + ln.id + '" ' +
        'data-pid="' + escaparHTML(ln.pid_nombre) + '" ' +
        'data-hoja="' + escaparHTML(hojaTexto) + '" ' +
        'data-rev="' + escaparHTML(ln.pid_revision) + '">' +
      '<td class="colCentrada">' + (ln.orden !== null && ln.orden !== undefined ? ln.orden : '—') + '</td>' +
      '<td title="' + escaparHTML(desc) + '">' + (desc ? escaparHTML(desc) : '—') + '</td>' +
      '<td title="' + escaparHTML(ln.pid_nombre) + '">' + escaparHTML(ln.pid_nombre) + '</td>' +
      '<td>' + escaparHTML(hojaTexto) + '</td>' +
      '<td>' + formatearRevision(ln.pid_nombre, ln.pid_revision, hojaTexto) + '</td>' +
      '<td><span class="muestraColorLinea" style="background:' + color + ';"></span>' + escaparHTML(nombreColor) + '</td>' +
      '<td class="colCentrada">' + Math.round(ln.grosor) + ' px</td>' +
      '<td class="colCentrada">' + (ln.opacidad !== null && ln.opacidad !== undefined ? ln.opacidad + '%' : '—') + '</td>' +
      '<td class="colCentrada">' + (Array.isArray(ln.puntos) ? ln.puntos.length : 0) + '</td>' +
      '<td class="celdaAccionesCentrada">' +
        '<button type="button" class="btnMenu" data-accion="menu_linea" data-id="' + ln.id + '" title="Acciones">&#8942;</button>' +
      '</td>' +
    '</tr>';
  }).join('');

  // Doble clic en una fila -> Ver en plano.
  Array.prototype.forEach.call(cuerpo.querySelectorAll('tr.filaLinea'), function (tr) {
    tr.addEventListener('dblclick', function (e) {
      if (e.target.closest('button')) return;
      const id = parseInt(tr.getAttribute('data-id'), 10);
      verLineaEnPlano(id);
    });
  });
}

function opcionesMenuLinea(ln) {
  const puedeEditar = !!(listadoActual && listadoActual.puedeEditar);
  const ops = [];

  ops.push({ texto: 'Ver en plano', accion: function () { verLineaEnPlano(ln.id); } });

  if (puedeEditar) {
    ops.push({ texto: 'Editar', accion: function () { abrirModalEditarLinea(ln.id); } });
    ops.push({ separador: true });
    ops.push({ texto: 'Borrar', peligro: true, accion: function () { accionBorrarLinea(ln.id); } });
  }

  return ops;
}

// Abre el visor en el P&ID de la línea y hace parpadear la línea 10 veces (0.5 s).
function verLineaEnPlano(idLinea) {
  const ln = lineasDelListado.find(function (x) { return x.id === idLinea; });
  if (!ln) return;

  const esPidAbierto = (typeof marc !== 'undefined' && marc.pid === ln.pid_nombre &&
    formatearHoja(marc.hojaTexto || marc.hoja) === formatearHoja(ln.pid_hoja) &&
    String(marc.rev) === String(ln.pid_revision));

  if (esPidAbierto) {
    // Ya está abierto: asegurar la capa de líneas visible y parpadear.
    if (typeof lineas !== 'undefined') {
      const chkLineas = $('chkVerLineas');
      if (chkLineas && !chkLineas.checked) { chkLineas.checked = true; if (typeof actualizarFiltrosCapas === 'function') actualizarFiltrosCapas(); }
    }
  }

  // Abrir el visor en ese P&ID. El parpadeo se dispara cuando las líneas
  // terminen de cargarse (inicializarModoLineas consume _parpadeoPendiente).
  // Si el P&ID ya estaba abierto, igual entramos al visor para que el
  // parpadeo se vea (el canvas detrás de la tabla está oculto) y para que
  // volverDeMarcado caiga en la pestaña Líneas.
  if (typeof abrirVisorMarcado !== 'function') return;

  // Dejar registrado el parpadeo pendiente (se consume al cargar las líneas).
  if (typeof lineas !== 'undefined') {
    lineas._parpadeoPendiente = {
      id: idLinea,
      pid: ln.pid_nombre,
      hoja: formatearHoja(ln.pid_hoja),
      rev: String(ln.pid_revision)
    };
  }

  abrirVisorMarcado(ln.pid_nombre, formatearHoja(ln.pid_hoja), String(ln.pid_revision), 'lineas');

  // Fallback: si por algún motivo las líneas ya estaban cargadas para ese
  // P&ID (cambio de pestaña sin recargar), disparar igual el parpadeo.
  setTimeout(function () {
    if (typeof lineas === 'undefined' || !lineas.cargado) return;
    if (!lineas._parpadeoPendiente) return;
    const pp = lineas._parpadeoPendiente;
    const mismo = (pp.pid === ln.pid_nombre &&
      formatearHoja(pp.hoja) === formatearHoja(ln.pid_hoja) &&
      String(pp.rev) === String(ln.pid_revision));
    if (mismo) {
      lineas._parpadeoPendiente = null;
      if (typeof iniciarParpadeoLinea === 'function') iniciarParpadeoLinea(pp.id, 10, 500);
    }
  }, 300);
}

function abrirModalEditarLinea(idLinea) {
  const ln = lineasDelListado.find(function (x) { return x.id === idLinea; });
  if (!ln) return;
  if (!listadoActual || !listadoActual.puedeEditar) {
    mostrarAviso('Solo el dueño del listado o un Admin puede editar líneas.', true);
    return;
  }

  const colores = (typeof COLORES_LINEA !== 'undefined') ? COLORES_LINEA : [];
  const opcionesColor = colores.map(function (c) {
    const nom = _nombreColorLinea(c.indice);
    return '<option value="' + c.indice + '"' + (ln.color_indice === c.indice ? ' selected' : '') + '>' +
      escaparHTML(nom) + '</option>';
  }).join('');

  const html =
    '<label>Color:' +
      '<select id="inpColorLineaModal">' + opcionesColor + '</select>' +
    '</label>' +
    '<div class="filaCampos">' +
      '<label>Grosor (px):' +
        '<input type="number" id="inpGrosorLineaModal" min="2" max="40" step="1" value="' + Math.round(ln.grosor) + '">' +
      '</label>' +
      '<label>Opacidad (%):' +
        '<input type="number" id="inpOpacidadLineaModal" min="10" max="100" step="5" value="' + (ln.opacidad || 70) + '">' +
      '</label>' +
    '</div>' +
    '<label>Descripción:' +
      '<input type="text" id="inpDescLineaModal" maxlength="200" value="' + escaparHTML(ln.descripcion || '') + '" placeholder="Ej: Línea de vapor principal">' +
    '</label>';

  abrirModal('Editar línea', html, function () {
    const color = parseInt($('inpColorLineaModal').value, 10);
    const grosor = parseInt($('inpGrosorLineaModal').value, 10);
    const opacidad = parseInt($('inpOpacidadLineaModal').value, 10);
    const descripcion = String($('inpDescLineaModal').value || '').trim().slice(0, 200);

    if (isNaN(color) || color < 0) { mostrarAviso('Color inválido.', true); return false; }
    if (isNaN(grosor) || grosor < 2 || grosor > 40) { mostrarAviso('El grosor debe estar entre 2 y 40.', true); return false; }
    if (isNaN(opacidad) || opacidad < 10 || opacidad > 100) { mostrarAviso('La opacidad debe estar entre 10 y 100.', true); return false; }

    fetchAPI('/api/lineas/' + ln.id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        color_indice: color,
        grosor: grosor,
        opacidad: opacidad,
        descripcion: descripcion || null
      })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.error) { mostrarAviso(d.error, true); return; }
        ln.color_indice = color;
        ln.grosor = grosor;
        ln.opacidad = opacidad;
        ln.descripcion = descripcion || null;
        dibujarTablaLineas();
        mostrarAviso('Línea actualizada.');
      })
      .catch(function (e) { mostrarAviso('Error al editar: ' + e.message, true); });
  });

  setTimeout(function () { const i = $('inpDescLineaModal'); if (i) i.focus(); }, 50);
}

function accionBorrarLinea(idLinea) {
  const ln = lineasDelListado.find(function (x) { return x.id === idLinea; });
  if (!ln) return;
  if (!listadoActual || !listadoActual.puedeEditar) {
    mostrarAviso('Solo el dueño del listado o un Admin puede borrar líneas.', true);
    return;
  }

  abrirModal('Borrar línea',
    '<p>¿Seguro que querés borrar esta línea del P&amp;ID <strong>' + escaparHTML(ln.pid_nombre) +
      '</strong> (Hoja ' + escaparHTML(formatearHoja(ln.pid_hoja)) + ' Rev' + escaparHTML(ln.pid_revision) + ')?</p>' +
    '<p style="color:#888;font-size:12px;">Esta acción no se puede deshacer.</p>',
    function () {
      fetchAPI('/api/lineas/' + ln.id, { method: 'DELETE' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.error) { mostrarAviso(d.error, true); return; }
          lineasDelListado = lineasDelListado.filter(function (x) { return x.id !== ln.id; });
          dibujarTablaLineas();
          mostrarAviso('Línea borrada.');
        })
        .catch(function (e) { mostrarAviso('Error al borrar: ' + e.message, true); });
    },
    { textoAceptar: 'Borrar' });
}

// Engancha los clicks de las pestañas (una sola vez).
function engancharPestanasListado() {
  const cont = $('pantallaListadoAbierto');
  if (!cont || cont._pestanasEnganchadas) return;
  cont._pestanasEnganchadas = true;
  Array.prototype.forEach.call(cont.querySelectorAll('.pestana'), function (b) {
    b.addEventListener('click', function () {
      activarPestanaListado(b.getAttribute('data-pestana'));
    });
  });
}

// Refresca el listado actual y se QUEDA en la pestaña de P&ID asignados.
// Se usa tras Agregar P&ID o Quitar P&ID.
// Ademas de los P&ID, recarga las MARCACIONES y las LINEAS, porque quitar
// un P&ID borra sus items y sus lineas en el listado. Sin esto, las pestañas
// Marcaciones y Lineas seguian mostrando datos viejos hasta apretar F5.
async function recargarPidsDelListadoActual() {
  if (!listadoActual) { irAPantallaListados(); return; }
  const id = listadoActual.id;
  const ok = await _cargarDatosListado(id);
  if (!ok) return;

  // Recargar marcaciones (itemsDelListado es global y lo leen las pestañas
  // Marcaciones y el exportador). Se hace aca, sin navegar.
  try {
    const rItems = await fetchAPI('/api/listados/' + id + '/items');
    const dItems = await rItems.json();
    itemsDelListado = dItems.items || [];
    if (typeof dibujarTablaItems === 'function') dibujarTablaItems();
  } catch (e) {
    console.warn('No se pudieron recargar las marcaciones:', e);
  }

  // Recargar lineas del listado (cache en memoria + tabla de la pestaña Lineas).
  if (typeof cargarLineasDelListado === 'function') {
    try { await cargarLineasDelListado(); } catch (e) {
      console.warn('No se pudieron recargar las lineas:', e);
    }
  }

  mostrarPantallaConFade('pantallaListadoAbierto', 'block', function () {
    marcarMenuActivo('menuListados');
  });
  activarPestanaListado('pids');
}

// Muestra la pantalla del listado abierto en la pestaña de P&ID asignados
// (datos ya cargados), sin recargar.
function abrirPidsAsignados() {
  if (!listadoActual) { irAPantallaListados(); return; }

  mostrarPantallaConFade('pantallaListadoAbierto', 'block', function () {
    marcarMenuActivo('menuListados');
  });
  activarPestanaListado('pids');

  aplicarTituloListado($('tituloListado'), listadoActual.nombre);
  actualizarEtiquetaDuenioListado();
  dibujarTablaPidsDelListado();
}

// Vuelve a la pestaña de Marcaciones (misma pantalla), sin recargar.
function volverAMarcaciones() {
  if (!listadoActual) { irAPantallaListados(); return; }

  mostrarPantallaConFade('pantallaListadoAbierto', 'block', function () {
    marcarMenuActivo('menuListados');
  });
  activarPestanaListado('marcaciones');

  aplicarTituloListado($('tituloListado'), listadoActual.nombre);
  actualizarEtiquetaDuenioListado();
  actualizarDescripcionEnPantalla();
  dibujarTablaItems();
}

// Pinta la etiqueta Propio / De ... de la cabecera unica del listado.
function actualizarEtiquetaDuenioListado() {
  const et = $('etiquetaDuenio');
  if (!et || !listadoActual) return;
  if (listadoActual.esPropio) {
    et.textContent = 'Propio';
    et.className = 'etiqueta etiquetaPropia';
  } else {
    et.textContent = 'De ' + listadoActual.usuario;
    et.className = 'etiqueta etiquetaOtro';
  }
  actualizarEtiquetaSoloLectura();
}

// Pinta la etiqueta Propio / De ... del titulo de Marcaciones.
function actualizarEtiquetaDuenioMarc() {
  const et = $('etiquetaDuenioMarc');
  if (!et || !listadoActual) return;
  if (listadoActual.esPropio) {
    et.textContent = 'Propio';
    et.className = 'etiqueta etiquetaPropia';
  } else {
    et.textContent = 'De ' + listadoActual.usuario;
    et.className = 'etiqueta etiquetaOtro';
  }
  actualizarEtiquetaSoloLectura();
}

// Muestra la etiqueta roja 'Solo lectura' al lado del duenio cuando el
// listado NO es propio (el usuario no puede editar ni quitar P&IDs).
// Aplica a las dos cabeceras (Edicion y Marcaciones).
function actualizarEtiquetaSoloLectura() {
  const soloLectura = !!(listadoActual && !listadoActual.esPropio);
  const eEd = $('etiquetaSoloLectura');
  const eMarc = $('etiquetaSoloLecturaMarc');
  if (eEd) eEd.style.display = soloLectura ? '' : 'none';
  if (eMarc) eMarc.style.display = soloLectura ? '' : 'none';
}

// Pone el nombre en el título y le ajusta la letra si es muy largo
// (2 renglones como máximo; si no entra, se achica).
function aplicarTituloListado(el, nombre) {
  if (!el) return;
  const texto = String(nombre || '');

  // En la cabecera del listado abierto el titulo lleva el prefijo
  // 'Listado: ' (el resto de usos, si hubiera, queda con el texto plano).
  if (el.id === 'tituloListado') {
    el.textContent = '';
    const prefijo = document.createElement('span');
    prefijo.className = 'tituloListadoPrefijo';
    prefijo.textContent = 'Listado: ';
    el.appendChild(prefijo);
    el.appendChild(document.createTextNode(texto));
  } else {
    el.textContent = texto;
  }

  el.classList.remove('largo', 'muyLargo');
  if (texto.length > 60) el.classList.add('muyLargo');
  else if (texto.length > 32) el.classList.add('largo');
}

function actualizarDescripcionEnPantalla() {
  const cont = $('descripcionListado');
  if (!cont) return;

  const desc = (listadoActual && listadoActual.descripcion) ? String(listadoActual.descripcion) : '';

  if (desc) {
    cont.textContent = desc;
    cont.classList.remove('vacia');
  } else {
    const puedeEditar = !!(listadoActual && listadoActual.esPropio);
    cont.textContent = puedeEditar ? '(sin descripción — doble clic para agregar)' : '(sin descripción)';
    cont.classList.add('vacia');
  }
}

function abrirModalEditarDescripcion() {
  if (!listadoActual) return;

  if (!listadoActual.esPropio) {
    mostrarAviso('Solo el dueño puede editar la descripción.', true);
    return;
  }

  const actual = listadoActual.descripcion ? String(listadoActual.descripcion) : '';

  const contenido =
    '<label>Descripción del listado:' +
      '<textarea id="inputDescripcionListado" maxlength="' + LARGO_MAX_DESCRIPCION_LISTADO + '" ' +
                'placeholder="Ej: Válvulas de la línea 1, revisión semanal de octubre.">' +
        escaparHTML(actual) +
      '</textarea>' +
    '</label>' +
    '<div class="contadorCaracteres"><span id="contadorDescripcion">0</span>/' + LARGO_MAX_DESCRIPCION_LISTADO + '</div>';

  abrirModal('Editar descripción', contenido, function () {
    const texto = $('inputDescripcionListado').value;
    guardarDescripcionListado(texto);
    return true;
  });

  const textarea = $('inputDescripcionListado');
  const contador = $('contadorDescripcion');

  function actualizarContador() {
    const n = textarea.value.length;
    contador.textContent = String(n);
    if (n >= LARGO_MAX_DESCRIPCION_LISTADO) {
      contador.classList.add('alLimite');
    } else {
      contador.classList.remove('alLimite');
    }
  }

  textarea.addEventListener('input', actualizarContador);
  actualizarContador();

  // Un solo listener: Enter (sin salto previo) o Ctrl/Cmd+Enter aceptan;
  // Escape cancela. Antes habia dos listeners y el segundo (Escape) nunca
  // llegaba porque el primero hacia 'return' en Enter.
  textarea.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      $('modalCancelar').click();
      return;
    }
    if (e.key === 'Enter') {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        $('modalAceptar').click();
        return;
      }
      const tieneSalto = textarea.value.indexOf('\n') !== -1;
      if (!tieneSalto) {
        e.preventDefault();
        e.stopPropagation();
        $('modalAceptar').click();
      }
    }
  });

  setTimeout(function () {
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, 50);
}

function guardarDescripcionListado(texto) {
  if (!listadoActual) return;

  let valor = texto === undefined || texto === null ? '' : String(texto);
  if (valor.length > LARGO_MAX_DESCRIPCION_LISTADO) {
    valor = valor.slice(0, LARGO_MAX_DESCRIPCION_LISTADO);
  }
  const aEnviar = (valor.trim() === '') ? null : valor;

  fetchAPI('/api/listados/' + listadoActual.id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ descripcion: aEnviar })
  })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.error) { mostrarAviso(d.error, true); return; }
      listadoActual.descripcion = d.descripcion || null;
      actualizarDescripcionEnPantalla();
      mostrarAviso('Descripción actualizada.');
    })
    .catch(function (e) {
      mostrarAviso('Error al guardar la descripción: ' + e.message, true);
    });
}

function dibujarTablaPidsDelListado() {
  const cuerpo = $('cuerpoPidsDelListado');
  const vacio = $('mensajeVacioPids');
  const tabla = $('tablaPidsDelListado');

  if (!pidsDelListado || pidsDelListado.length === 0) {
    cuerpo.innerHTML = '';
    tabla.style.display = 'none';
    vacio.style.display = 'block';
    return;
  }

  tabla.style.display = '';
  vacio.style.display = 'none';

  cuerpo.innerHTML = pidsDelListado.map(function (p, i) {
    const hojaTexto = formatearHoja(p.hojaTexto || p.hoja);
    // OJO: en la tabla del LISTADO no se dibuja el arbol (sin desplazamiento
    // ni flecha). Un listado puede tener una revision vieja a proposito: la
    // tabla global es la que muestra la jerarquia. Aca solo se marca la
    // columna Rev. con 'Desactualizado' (lo hace formatearRevision).
    return (
      '<tr class="filaAbrible" data-pid="' + escaparHTML(p.pid) + '" ' +
          'data-hoja="' + escaparHTML(hojaTexto) + '" ' +
          'data-rev="' + escaparHTML(p.revision) + '">' +
        '<td class="celdaNombrePid" title="' + escaparHTML(p.pid) + '">' + escaparHTML(p.pid) + '</td>' +
        '<td>' + escaparHTML(hojaTexto) + '</td>' +
        '<td>' + formatearRevision(p.pid, p.revision, hojaTexto) + '</td>' +
        '<td>' + p.cantidad_items + '</td>' +
        '<td class="celdaAccionesCentrada">' +
          '<button type="button" class="btnMenu" data-accion="menu_pid_listado" ' +
                  'data-pid="' + escaparHTML(p.pid) + '" ' +
                  'data-hoja="' + escaparHTML(hojaTexto) + '" ' +
                  'data-rev="' + escaparHTML(p.revision) + '" ' +
                  'title="Acciones">&#8942;</button>' +
        '</td>' +
      '</tr>'
    );
  }).join('');
}

function opcionesMenuPidDelListado(p) {
  const puedeEditar = listadoActual && listadoActual.puedeEditar;
  const ops = [];

  ops.push({
    texto: 'Abrir y marcar',
    accion: function () { abrirVisorMarcado(p.pid, p.hojaTexto || p.hoja, p.revision); }
  });

  // La revision mas nueva se busca por pid + hoja (NO por pid solo: cada
  // hoja tiene su propia ultima revision).
  const hojaPid = formatearHoja(p.hojaTexto || p.hoja);
  const revUltimaHoja = (typeof ultimaRevisionDeHoja === 'function')
    ? ultimaRevisionDeHoja(p.pid, hojaPid)
    : undefined;
  const hayRevMasNueva = (revUltimaHoja !== undefined) &&
    (String(p.revision) !== String(revUltimaHoja));

  if (puedeEditar && hayRevMasNueva) {
    ops.push({
      texto: 'Actualizar a Rev' + revUltimaHoja,
      accion: function () { accionActualizarPID(p.pid, p.hojaTexto || p.hoja, p.revision, revUltimaHoja); }
    });
  }

  if (puedeEditar) {
    ops.push({ separador: true });
    ops.push({
      texto: 'Quitar del listado',
      peligro: true,
      accion: function () { accionQuitarPID(p.pid, p.hojaTexto || p.hoja, p.revision); }
    });
  }

  return ops;
}

function accionActualizarPID(pid, hoja, revVieja, revNueva) {
  const hojaNorm = formatearHoja(hoja);
  const p = pidsDelListado.find(function (x) {
    return String(x.pid) === String(pid)
        && formatearHoja(x.hojaTexto || x.hoja) === hojaNorm
        && String(x.revision) === String(revVieja);
  });
  const cant = p ? p.cantidad_items : 0;

  const texto =
    '<p>Se va a actualizar <strong>' + escaparHTML(pid) + ' Hoja ' + escaparHTML(hojaNorm) +
    '</strong> de <strong>Rev' + escaparHTML(revVieja) + '</strong> a <strong>Rev' + escaparHTML(revNueva) + '</strong>.</p>' +
    '<p>Se moverán ' + cant + ' marca(s) y las líneas de proceso a la revisión nueva.</p>' +
    '<p style="color:#b71c1c;"><strong>Importante:</strong> al cambiar el P&ID, las posiciones de las marcas y de las líneas pueden haberse desplazado. Verificá las posiciones en el visor después de actualizar.</p>';

  abrirModal('Actualizar P&ID', texto, function () {
    fetchAPI('/api/listados/' + listadoActual.id + '/pids/' +
            encodeURIComponent(pid) + '/' +
            encodeURIComponent(hojaNorm) + '/' +
            encodeURIComponent(revVieja) + '/actualizar', {
      method: 'POST'
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.error) { mostrarAviso(d.error, true); return; }
        mostrarAviso(
          'Actualizado a Rev' + d.revisionNueva +
          '. Se movieron ' + d.itemsMovidos + ' marca(s) y ' + d.lineasMovidas + ' línea(s). ' +
          'Verificá las posiciones en el visor.',
          false
        );
        // Quedarse en la pantalla de P&ID del listado (no navegar a
        // Marcaciones). recargarPidsDelListadoActual refresca la tabla
        // y mantiene la pantalla de P&ID asignados.
        recargarPidsDelListadoActual();
      })
      .catch(function (e) {
        mostrarAviso('Error al actualizar: ' + e.message, true);
      });
  });
}

function accionAgregarPIDAlListado() {
  asegurarPIDsCargados().then(function () {
    const yaAsignados = {};
    pidsDelListado.forEach(function (p) {
      const h = formatearHoja(p.hojaTexto || p.hoja);
      yaAsignados[String(p.pid) + '|' + h + '|' + String(p.revision)] = true;
    });

    const disponibles = pids.filter(function (p) {
      const h = formatearHoja(p.hojaTexto || p.hoja);
      return p.calibrado && !yaAsignados[String(p.pid) + '|' + h + '|' + String(p.revision)];
    });

    if (disponibles.length === 0) {
      mostrarAviso('No hay P&ID calibrados disponibles para agregar.', true);
      return;
    }

    const lista = disponibles.map(function (p) {
      const hojaTexto = formatearHoja(p.hojaTexto || p.hoja);
      const busqueda = (p.pid + ' rev' + p.revision + ' hoja ' + hojaTexto).toLowerCase();
      return '<div class="itemSeleccionPidConVer" data-busqueda="' + escaparHTML(busqueda) + '">' +
        '<label class="itemSeleccionPid">' +
          '<input type="checkbox" class="chkPidNuevo" ' +
                 'data-pid="' + escaparHTML(p.pid) + '" ' +
                 'data-hoja="' + escaparHTML(hojaTexto) + '" ' +
                 'data-rev="' + escaparHTML(p.revision) + '">' +
          '<span>' + escaparHTML(p.pid) + ' &nbsp;Hoja ' + escaparHTML(hojaTexto) +
            ' &nbsp;·&nbsp;Rev' + escaparHTML(p.revision) +
          '</span>' +
        '</label>' +
        '<button type="button" class="btnSecundario btnChico btnVerPid" ' +
                'data-pid="' + escaparHTML(p.pid) + '" ' +
                'data-hoja="' + escaparHTML(hojaTexto) + '" ' +
                'data-rev="' + escaparHTML(p.revision) + '">Ver</button>' +
      '</div>';
    }).join('');

    const contenido =
      '<div class="buscadorPids">' +
        '<span class="buscadorConX" style="width:100%;">' +
          '<input type="text" id="buscadorPids" class="inputBusqueda" placeholder="Buscar P&ID..." autocomplete="off">' +
          '<button type="button" class="btnLimpiarBusqueda" title="Limpiar filtro">✕</button>' +
        '</span>' +
      '</div>' +
      '<label class="campoCheckboxModal">' +
        '<input type="checkbox" id="chkSeleccionarTodosPids"> <span id="txtSeleccionarTodosPids">Seleccionar todos</span>' +
      '</label>' +
      '<div class="listaSeleccionPids" id="listaSeleccionPidsModal">' + lista + '</div>';

    const modal = abrirModal(
      'Agregar P&ID al listado',
      contenido,
      function () {
        const seleccion = [];
        document.querySelectorAll('.chkPidNuevo:checked').forEach(function (chk) {
          seleccion.push({
            pid: chk.getAttribute('data-pid'),
            hoja: chk.getAttribute('data-hoja'),
            revision: chk.getAttribute('data-rev')
          });
        });

        if (seleccion.length === 0) { mostrarAviso('No seleccionaste ninguno.', true); return false; }

        let pendientes = seleccion.length;
        let errores = 0;

        seleccion.forEach(function (s) {
          fetchAPI('/api/listados/' + listadoActual.id + '/pids', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(s)
          })
            .then(function (r) { return r.json(); })
            .then(function (d) { if (d.error) errores++; })
            .finally(function () {
              pendientes--;
              if (pendientes === 0) {
                if (errores) mostrarAviso('Algunos P&ID no se pudieron agregar.', true);
                else mostrarAviso('P&ID agregados.');
                // Quedarse en la pantalla de P&ID del listado (no ir a Marcaciones).
                recargarPidsDelListadoActual();
              }
            });
        });
      },
      { grande: true }
    );

    // Escape: misma funcion que el boton Cancelar/cerrar del modal.
    if (modal && typeof modal.cerrar === 'function') {
      document.addEventListener('keydown', function _escAgregarPid(e) {
        if (e.key !== 'Escape') return;
        if ($('modalFondo').style.display === 'none') {
          document.removeEventListener('keydown', _escAgregarPid, true);
          return;
        }
        // Si hay una vista previa de P&ID abierta (boton "Ver"), el Escape
        // debe cerrar SOLO la vista previa. Su handler (calibracion.js) corre
        // en captura; aca no hacemos nada para no cerrar tambien el modal.
        if (typeof vistaPrevia !== 'undefined' && vistaPrevia && vistaPrevia.visible) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        document.removeEventListener('keydown', _escAgregarPid, true);
        modal.cerrar();
      }, true);
    }

    // --- Seleccionar todos (respeta el filtro del buscador) ---
    const chkTodos = $('chkSeleccionarTodosPids');
    const txtTodos = $('txtSeleccionarTodosPids');

    // Devuelve los .itemSeleccionPidConVer visibles (los que pasan el filtro).
    function itemsVisibles() {
      const items = document.querySelectorAll('#listaSeleccionPidsModal .itemSeleccionPidConVer');
      return Array.prototype.filter.call(items, function (el) {
        return el.style.display !== 'none';
      });
    }

    // Sincroniza el estado del checkbox maestro con los checkboxes visibles:
    // - ninguno marcado  -> desmarcado
    // - todos marcados   -> marcado
    // - algunos marcados -> indeterminado (indeterminate)
    function sincronizarCheckTodos() {
      if (!chkTodos) return;
      const visibles = itemsVisibles();
      const checks = visibles.map(function (el) { return el.querySelector('.chkPidNuevo'); }).filter(Boolean);
      const marcados = checks.filter(function (c) { return c.checked; }).length;
      chkTodos.indeterminate = (marcados > 0 && marcados < checks.length);
      chkTodos.checked = (checks.length > 0 && marcados === checks.length);
      if (txtTodos) {
        txtTodos.textContent = checks.length > 0
          ? 'Seleccionar todos (' + checks.length + ')'
          : 'Seleccionar todos';
      }
    }

    if (chkTodos) {
      chkTodos.addEventListener('change', function () {
        const marcar = chkTodos.checked;
        itemsVisibles().forEach(function (el) {
          const c = el.querySelector('.chkPidNuevo');
          if (c) c.checked = marcar;
        });
        chkTodos.indeterminate = false;
        sincronizarCheckTodos();
      });
    }

    // Cada checkbox individual actualiza el estado del maestro.
    const contListaChk = $('listaSeleccionPidsModal');
    if (contListaChk) {
      contListaChk.addEventListener('change', function (e) {
        if (e.target && e.target.classList && e.target.classList.contains('chkPidNuevo')) {
          sincronizarCheckTodos();
        }
      });
    }

    const buscador = $('buscadorPids');
    if (buscador) {
      buscador.addEventListener('input', function () {
        const filtro = buscador.value.trim().toLowerCase();
        const items = document.querySelectorAll('#listaSeleccionPidsModal .itemSeleccionPidConVer');
        items.forEach(function (el) {
          const txt = el.getAttribute('data-busqueda') || '';
          const coincide = (!filtro || txt.indexOf(filtro) !== -1);
          el.style.display = coincide ? '' : 'none';
        });
        sincronizarCheckTodos();
      });

      engancharBuscador('buscadorPids');

      setTimeout(function () { buscador.focus(); }, 50);
    }

    const contLista = $('listaSeleccionPidsModal');
    if (contLista) {
      contLista.addEventListener('click', function (e) {
        const btn = e.target.closest('.btnVerPid');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        const pid = btn.getAttribute('data-pid');
        const hoja = btn.getAttribute('data-hoja');
        const rev = btn.getAttribute('data-rev');
        abrirVistaPreviaPID(pid, hoja, rev);
      });
    }
  });
}

function accionQuitarPID(pid, hoja, rev) {
  // Solo el duenio del listado o un admin puede quitar un P&ID asignado.
  if (!listadoActual || !listadoActual.puedeEditar) {
    mostrarAviso('Solo el dueño del listado o un Admin puede quitar P&ID.', true);
    return;
  }
  const hojaNorm = formatearHoja(hoja);
  const p = pidsDelListado.find(function (x) {
    return String(x.pid) === String(pid)
        && formatearHoja(x.hojaTexto || x.hoja) === hojaNorm
        && String(x.revision) === String(rev);
  });
  const cant = p ? p.cantidad_items : 0;

  let texto = '<p>¿Querés quitar <strong>' + escaparHTML(pid) + ' Hoja ' + escaparHTML(hojaNorm) +
              ' Rev' + escaparHTML(rev) + '</strong> de este listado?</p>';
  if (cant > 0) {
    texto += '<p style="color:#b71c1c;">Se van a borrar también ' + cant + ' ítem(s) marcados en este P&ID (solo en este listado).</p>';
  }

  abrirModal('Confirmar', texto, function () {
    fetchAPI('/api/listados/' + listadoActual.id + '/pids/' +
            encodeURIComponent(pid) + '/' +
            encodeURIComponent(hojaNorm) + '/' +
            encodeURIComponent(rev), {
      method: 'DELETE'
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.error) { mostrarAviso(d.error, true); return; }
        mostrarAviso('P&ID quitado (' + d.itemsBorrados + ' ítems borrados).');
        // Quedarse en la pantalla de P&ID del listado (no ir a Marcaciones).
        recargarPidsDelListadoActual();
      });
  });
}

function volverAListados() {
  listadoActual = null;
  pidsDelListado = [];
  itemsDelListado = [];
  irAPantallaListados();
}