// ================================================================
// Actualizaciones de PID Mark (solo admin en Linux)
// ================================================================

let actualizacionWebPendienteVersion = null;
let actualizacionWebReintentos = 0;
let temporizadorActualizacionWeb = null;

function irAPantallaActualizacionAdmin() {
  if (!sesion || !sesion.admin || sesion.plataforma !== 'linux') return;
  mostrarPantallaConFade('pantallaActualizacionAdmin', 'block', function () {
    marcarMenuActivo('menuActualizacionAdmin');
    cargarActualizacionesAdmin();
  });
}

function mostrarEstadoActualizacionAdmin(texto, error) {
  const estado = $('estadoActualizacionAdmin');
  if (!estado) return;
  estado.textContent = texto;
  estado.style.color = error ? '#ff7777' : '';
}

function versionActualizacionPosterior(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] > pb[i];
  }
  return false;
}

function mostrarResultadoActualizacionAdmin(estado) {
  if (!estado) return;
  const texto = estado.message || '';
  if (estado.state === 'running') {
    mostrarEstadoActualizacionAdmin(texto || 'Actualización en curso; el servidor puede reiniciarse.');
  } else if (estado.state === 'success') {
    mostrarEstadoActualizacionAdmin(texto || 'Actualización completada.');
  } else if (estado.state === 'error') {
    mostrarEstadoActualizacionAdmin(texto || 'La actualización falló.', true);
  }
  const salida = $('salidaActualizacionAdmin');
  if (salida) {
    salida.textContent = estado.output || '';
    salida.style.display = estado.output ? '' : 'none';
  }
}

function activarOpcionesActualizacionAdmin(datos) {
  const version = $('versionActualizacionAdmin');
  const instalada = $('versionInstaladaAdmin');
  if (!version || !instalada) return;
  instalada.textContent = 'Versión instalada: v' + datos.versionActual;
  version.replaceChildren();
  const nuevas = (datos.etiquetas || []).filter(function (etiqueta) {
    return versionActualizacionPosterior(etiqueta.version, datos.versionActual);
  });
  nuevas.forEach(function (etiqueta) {
    const opcion = document.createElement('option');
    opcion.value = etiqueta.version;
    opcion.textContent = 'v' + etiqueta.version;
    version.appendChild(opcion);
  });
  const tieneActualizacion = nuevas.length > 0;
  $('btnActualizarDesdeGitHub').disabled = !tieneActualizacion;
  $('btnActualizarDesdeZip').disabled = !tieneActualizacion;
  if (!tieneActualizacion) mostrarEstadoActualizacionAdmin('No hay versiones más nuevas publicadas en GitHub.');
  else mostrarEstadoActualizacionAdmin('Última versión publicada: v' + nuevas[0].version + '.');
  mostrarResultadoActualizacionAdmin(datos.estado);
}

async function cargarActualizacionesAdmin() {
  if (!sesion || !sesion.admin || sesion.plataforma !== 'linux') return;
  const btnConsultar = $('btnConsultarActualizaciones');
  if (btnConsultar) btnConsultar.disabled = true;
  mostrarEstadoActualizacionAdmin('Consultando versiones publicadas en GitHub...');
  try {
    const respuesta = await fetchAPI('/api/admin/actualizaciones');
    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(datos.error || 'No se pudieron consultar las actualizaciones.');
    activarOpcionesActualizacionAdmin(datos);
    if (datos.estado && datos.estado.state === 'running') {
      actualizacionWebPendienteVersion = datos.estado.version || 'unknown';
      actualizacionWebReintentos = 0;
      iniciarSeguimientoActualizacionAdmin();
    }
  } catch (error) {
    mostrarEstadoActualizacionAdmin(error.message, true);
  } finally {
    if (btnConsultar) btnConsultar.disabled = false;
  }
}

function confirmarInicioActualizacionAdmin(version, fuente, archivo) {
  const origen = fuente === 'github'
    ? 'descargar directamente desde GitHub'
    : 'validar que el ZIP sea idéntico al archivo oficial de GitHub';
  abrirModal(
    'Confirmar actualización',
    '<p>Se instalará PID Mark <strong>v' + escaparHTML(version) +
      '</strong> al ' + origen + '.</p>' +
      '<p>El servicio se reiniciará y puede quedar unos minutos inaccesible. ' +
      'Se conservará el respaldo para rollback.</p>',
    async function () {
      try {
        const respuesta = fuente === 'github'
          ? await fetchAPI('/api/admin/actualizaciones/github', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ version: version })
            })
          : await fetchAPI('/api/admin/actualizaciones/zip?version=' + encodeURIComponent(version), {
              method: 'POST',
              headers: { 'Content-Type': 'application/zip' },
              body: archivo
            });
        const datos = await respuesta.json();
        if (!respuesta.ok) throw new Error(datos.error || 'No se pudo iniciar la actualización.');
        actualizacionWebPendienteVersion = version;
        actualizacionWebReintentos = 0;
        mostrarEstadoActualizacionAdmin(datos.message || 'Actualización iniciada.');
        iniciarSeguimientoActualizacionAdmin();
        return true;
      } catch (error) {
        mostrarEstadoActualizacionAdmin(error.message, true);
        return false;
      }
    },
    { textoAceptar: 'Actualizar' }
  );
}

function revisarZipActualizacionAdmin() {
  const archivoInput = $('archivoZipActualizacionAdmin');
  const archivo = archivoInput && archivoInput.files && archivoInput.files[0];
  const version = $('versionActualizacionAdmin').value;
  if (!archivo) {
    mostrarEstadoActualizacionAdmin('Selecciona primero un ZIP fuente descargado desde GitHub.', true);
    return;
  }
  if (!/\.zip$/i.test(archivo.name) || archivo.size > 100 * 1024 * 1024) {
    mostrarEstadoActualizacionAdmin('Selecciona un archivo ZIP de hasta 100 MB.', true);
    return;
  }
  confirmarInicioActualizacionAdmin(version, 'zip', archivo);
}

function iniciarSeguimientoActualizacionAdmin() {
  if (temporizadorActualizacionWeb) clearTimeout(temporizadorActualizacionWeb);
  consultarEstadoActualizacionAdmin();
}

async function consultarEstadoActualizacionAdmin() {
  actualizacionWebReintentos += 1;
  try {
    const respuesta = await fetchAPI('/api/admin/actualizaciones/estado');
    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(datos.error || 'No se pudo consultar el estado.');
    mostrarResultadoActualizacionAdmin(datos.estado);
    if (actualizacionWebPendienteVersion) {
      if (actualizacionWebPendienteVersion === 'unknown' && datos.estado.version) {
        actualizacionWebPendienteVersion = datos.estado.version;
      }
      if (datos.estado.state === 'error') {
        actualizacionWebPendienteVersion = null;
        return;
      }
      if (datos.estado.state === 'success' &&
          datos.estado.version === actualizacionWebPendienteVersion) {
        actualizacionWebPendienteVersion = null;
        mostrarEstadoActualizacionAdmin(datos.estado.message || 'Actualización completada. Recargando PID Mark...');
        setTimeout(function () { window.location.reload(); }, 1500);
        return;
      }
      if (actualizacionWebReintentos >= 90) {
        actualizacionWebPendienteVersion = null;
        mostrarEstadoActualizacionAdmin(
          'No se pudo confirmar la actualización. Revisa el servidor con sudo journalctl -u pid-mark-web-update.service -n 80 --no-pager.',
          true
        );
        return;
      }
      temporizadorActualizacionWeb = setTimeout(consultarEstadoActualizacionAdmin, 2500);
    }
  } catch (error) {
    if (actualizacionWebPendienteVersion && actualizacionWebReintentos < 90) {
      mostrarEstadoActualizacionAdmin('Esperando que PID Mark vuelva a estar disponible...');
      temporizadorActualizacionWeb = setTimeout(consultarEstadoActualizacionAdmin, 2500);
      return;
    }
    mostrarEstadoActualizacionAdmin(error.message, true);
  }
}

function engancharEventosActualizacionAdmin() {
  const menu = $('menuActualizacionAdmin');
  if (menu) menu.onclick = irAPantallaActualizacionAdmin;

  const btnConsultar = $('btnConsultarActualizaciones');
  if (btnConsultar) btnConsultar.onclick = cargarActualizacionesAdmin;

  const btnGitHub = $('btnActualizarDesdeGitHub');
  if (btnGitHub) {
    btnGitHub.onclick = function () {
      const version = $('versionActualizacionAdmin').value;
      if (version) confirmarInicioActualizacionAdmin(version, 'github', null);
    };
  }

  const btnZip = $('btnActualizarDesdeZip');
  if (btnZip) btnZip.onclick = revisarZipActualizacionAdmin;
}
