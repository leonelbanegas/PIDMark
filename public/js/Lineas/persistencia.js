// ================================================================
// Líneas de proceso - Persistencia (backend)
// ================================================================
// Este archivo NO parchea funciones globales ni agrega listeners.
// La lógica de guardar se maneja directamente desde visorMarcado.js
// llamando a guardarLineasPendientes().

async function obtenerNombresColores(pidNombre, pidHoja) {
  try {
    const r = await fetchAPI('/api/pids/' + encodeURIComponent(pidNombre) + '/' + encodeURIComponent(pidHoja) + '/nombres-colores');
    const d = await r.json();
    if (d && Array.isArray(d.nombres) && d.nombres.length === COLORES_LINEA.length) {
      return d.nombres.slice();
    }
  } catch (e) {}
  return null;
}

async function obtenerLineasDelPIDActual(listadoId, pidNombre, pidHoja, pidRev) {
  if (!listadoId) return null;
  try {
    const url = '/api/listados/' + listadoId + '/lineas/' +
                encodeURIComponent(pidNombre) + '/' +
                encodeURIComponent(pidHoja) + '/' +
                encodeURIComponent(pidRev);
    const r = await fetchAPI(url);
    const d = await r.json();
    if (d && Array.isArray(d.lineas)) return d.lineas;
    return [];
  } catch (e) {
    return null;
  }
}

async function refrescarLineasActuales() {
  const ln = await obtenerLineasDelPIDActual(
    lineas._listadoId, lineas._pidNombre, lineas._pidHoja, lineas._pidRev
  );
  if (Array.isArray(ln)) {
    const clave = _claveCache(lineas._listadoId, lineas._pidNombre, lineas._pidHoja, lineas._pidRev);
    delete cacheLineas[clave];
    lineas.delPidActual = ln;

    // Actualizamos la línea base tras guardar
    lineas._lineaBase = _obtenerSnapshot();

    renderizarListaLineas();
    if (typeof dibujarMarc === 'function') dibujarMarc();
    if (typeof actualizarBotonGuardar === 'function') actualizarBotonGuardar();
  }
}

async function guardarLineasPendientes() {
  if (lineas.pendientesGuardar.length === 0 &&
      lineas.pendientesBorrar.length === 0 &&
      lineas.pendientesModificar.length === 0) return true;
  if (!lineas._listadoId) {
    mostrarAviso('Error: No hay listado actual.', true);
    return false;
  }

  lineas.guardando = true;
  let exito = true;

  // 1) Nuevas líneas
  // OJO: se van quitando de pendientesGuardar a medida que se confirman,
  // para que si una falla a mitad (break), las ya creadas NO se vuelvan
  // a enviar en un reintento (evita duplicados en la BD).
  for (const ln of lineas.pendientesGuardar.slice()) {
    try {
      const res = await fetchAPI('/api/listados/' + lineas._listadoId + '/lineas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pid_nombre: ln.pid_nombre,
          pid_hoja: ln.pid_hoja,
          pid_revision: ln.pid_revision,
          color_indice: ln.color_indice,
          grosor: ln.grosor,
          opacidad: ln.opacidad,
          puntos: ln.puntos
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      ln.id = data.id;
      ln.nuevo = false;
      // Confirmada: sacarla de pendientes (ya existe en el server).
      lineas.pendientesGuardar = lineas.pendientesGuardar.filter(function (x) { return x !== ln; });
    } catch (e) {
      console.error(e);
      mostrarAviso('Error guardando línea: ' + e.message, true);
      exito = false;
      break;
    }
  }

  if (!exito) {
    // Las que fallaron / quedaron sin procesar siguen en pendientesGuardar.
    lineas.guardando = false;
    return false;
  }

  // 2) Líneas modificadas
  // Solo se quitan de pendientesModificar las que se actualizaron OK;
  // las que fallen quedan para reintentar.
  for (const id of lineas.pendientesModificar.slice()) {
    const ln = lineas.delPidActual.find(l => l.id === id);
    if (!ln) {
      lineas.pendientesModificar = lineas.pendientesModificar.filter(function (x) { return x !== id; });
      continue;
    }
    try {
      await fetchAPI('/api/lineas/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          color_indice: ln.color_indice,
          grosor: ln.grosor,
          opacidad: ln.opacidad,
          puntos: ln.puntos
        })
      });
      lineas.pendientesModificar = lineas.pendientesModificar.filter(function (x) { return x !== id; });
    } catch (e) {
      console.error(e);
      mostrarAviso('Error actualizando línea: ' + e.message, true);
      exito = false;
    }
  }

  // 3) Líneas borradas
  // Igual: solo se quitan de pendientesBorrar las que se borraron OK.
  for (const id of lineas.pendientesBorrar.slice()) {
    try {
      await fetchAPI('/api/lineas/' + id, { method: 'DELETE' });
      lineas.pendientesBorrar = lineas.pendientesBorrar.filter(function (x) { return x !== id; });
    } catch (e) {
      console.error(e);
      mostrarAviso('Error borrando línea: ' + e.message, true);
      exito = false;
    }
  }

  lineas.guardando = false;

  if (exito) {
    await refrescarLineasActuales();
  }

  return exito;
}