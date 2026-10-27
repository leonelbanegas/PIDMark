// ================================================================
// Exportación: PNG por P&ID, PDF A3 horizontal y PDF combinado
// ================================================================
// 100% cliente para el render (canvas offscreen a resolución nativa
// de la imagen). El PDF lo arma el server con pdfkit.
//
// Reglas:
//  - PNG: imagen + líneas + leyenda + marcas (círculo/rectangular + #N).
//  - Sin etiqueta flotante de TAG/Ø ni tiradores.
//  - Sin lupa ni cruz virtual.
//  - PDF A3 horizontal, una página por P&ID, con margen 20pt.
//  - PDF combinado: portada + una página por P&ID del listado.

// ----------------------------------------------------------------
// Helpers de dibujo en canvas offscreen
// ----------------------------------------------------------------

/**
 * Dibuja la etiqueta flotante (#N) de una marca, replicando el layout del
 * visor DOM: recuadro con borde del color del estado, texto centrado, y
 * línea conectora entre el borde de la marca y el borde de la etiqueta.
 *
 * zoomReferencia: zoom con el que el usuario está viendo el plano. En el
 * visor, la etiqueta tiene tamaño fijo en píxeles de pantalla y se divide
 * por zoom para pasar a coords de imagen. Acá hacemos lo mismo: el tamaño
 * en imagen es tamanoPantalla / zoomReferencia.
 */
function dibujarEtiquetaMarcaEnCanvasExport(ctx, m, zoomReferencia) {
  if (!m || m.borrado) return;
  if (m.x === null || m.x === undefined) return;
  if (m.y === null || m.y === undefined) return;

  const colorBorde = colorSegunEstado(m.estado);

  // El visor NO compensa el tamaño de la etiqueta por zoom: la capa DOM se
  // escala con scale(zoom), así que en coords de imagen la etiqueta tiene un
  // tamaño fijo. Acá hacemos lo mismo: calculamos todo en coords de imagen.
  // 1. Tamaño de fuente en coords de imagen (idéntico al visor).
  const etiquetaMax = tamanoEtiquetaMaxActual();
  const dimTexto = (m.forma === 'rectangular' && m.tamanoY) ? (m.tamano + m.tamanoY) / 2 : m.tamano;
  const tamanoParaTexto = Math.min(dimTexto, etiquetaMax);
  const tamFuente = Math.max(8, Math.round(tamanoParaTexto * 0.9));

  // 2. Medir el texto a ese tamaño.
  ctx.save();
  ctx.font = 'bold ' + tamFuente + 'px system-ui, sans-serif';
  const texto = textoEtiquetaMarca(m);
  const anchoTexto = ctx.measureText(texto).width;
  ctx.restore();

  // 3. El visor aplica un padding del 20% extra (10% por lado) sobre el texto medido.
  const paddingX = (anchoTexto * 1.2 - anchoTexto) / 2;
  const paddingY = (tamFuente * 1.2 - tamFuente) / 2;

  // 4. Dimensiones totales (incluye padding y borde de 2px).
  const bordePx = 2;
  const anchoEt = anchoTexto + paddingX * 2 + bordePx * 2;
  const altoEt = tamFuente + paddingY * 2 + bordePx * 2;

  // posicionEtiquetaRealConTamano devuelve el CENTRO de la etiqueta, porque
  // el CSS usa transform: translate(-50%, -50%).
  const posEt = posicionEtiquetaRealConTamano(m, anchoEt, altoEt);
  const cx = posEt.x;
  const cy = posEt.y;

  // Línea conectora: del borde de la marca al borde del recuadro de la etiqueta.
  const tramo = calcularTramoLinea(m, posEt, anchoEt, altoEt);
  if (tramo) {
    ctx.save();
    ctx.strokeStyle = colorBorde;
    // Grosor igual que en el visor.
    ctx.lineWidth = GROSOR_BORDE_MARCA;
    ctx.beginPath();
    ctx.moveTo(tramo.a.x, tramo.a.y);
    ctx.lineTo(tramo.b.x, tramo.b.y);
    ctx.stroke();
    ctx.restore();
  }

  // Recuadro de la etiqueta: esquina superior izquierda = centro - mitad.
  const x0 = cx - anchoEt / 2;
  const y0 = cy - altoEt / 2;
  // Radio de 10px de pantalla, igual que el CSS (.etiquetaMarcaTag { border-radius: 10px; }).
  const radio = 10;

  ctx.save();

  // Fondo: rgba(0,0,0,0.55)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  dibujarRectanguloRedondeado(ctx, x0, y0, anchoEt, altoEt, radio);
  ctx.fill();

  // Borde: solid 2px del color del estado (sin dividir por zoom).
  ctx.strokeStyle = colorBorde;
  ctx.lineWidth = bordePx;
  dibujarRectanguloRedondeado(ctx, x0, y0, anchoEt, altoEt, radio);
  ctx.stroke();

  // Texto blanco con sombra.
  ctx.font = 'bold ' + tamFuente + 'px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowOffsetX = 0;
  // Sombra de 1px de pantalla, igual que el CSS (text-shadow: 0 1px 2px).
  ctx.shadowOffsetY = 1;
  ctx.shadowBlur = 2;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(texto, cx, cy);

  ctx.restore();
}

/**
 * Dibuja las marcas (círculo/rectangular) y su etiqueta flotante (#N) en
 * coordenadas de imagen, replicando el estilo del canvas principal.
 */
function dibujarMarcasEnCanvasExport(ctx, marcas, zoomReferencia) {
  if (!Array.isArray(marcas)) return;

  marcas.forEach(function (m) {
    if (!m || m.borrado) return;
    if (m.x === null || m.x === undefined) return;
    if (m.y === null || m.y === undefined) return;

    const colorBorde = colorSegunEstado(m.estado);
    const colorRelleno = colorRellenoPorEstado(m.estado);

    ctx.save();
    ctx.strokeStyle = colorBorde;
    ctx.fillStyle = colorRelleno;
    ctx.lineWidth = GROSOR_BORDE_MARCA;

    if (m.forma === 'rectangular') {
      const rX = m.tamano;
      const rY = (m.tamanoY !== null && m.tamanoY !== undefined) ? m.tamanoY : m.tamano;
      ctx.beginPath();
      ctx.rect(m.x - rX, m.y - rY, rX * 2, rY * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.tamano, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    dibujarEtiquetaMarcaEnCanvasExport(ctx, m, zoomReferencia);
  });
}

/**
 * Calcula el rect de la leyenda para exportación:
 *  - usa zoom=1 (no compensa zoom de pantalla),
 *  - usa la posición anclada si existe, si no la default,
 *  - NO muta lineas._leyendaPos.
 * Devuelve { x, y, w, h } en coords de imagen, o null.
 */
function obtenerRectLeyendaParaExport(ctx, ancho, alto, lineasOverride, zoomReferencia, offsetXOverride, offsetYOverride, leyendaPosOverride, opciones) {
  if (typeof lineas === 'undefined' || typeof marc === 'undefined') return null;

  // En el PDF combinado no hay un visor activo, así que lineas.cargado
  // puede ser false. Usamos las líneas que nos pasan explícitamente
  // (lineasOverride) o, si no, las del P&ID actual.
  const lineasParaLeyenda = Array.isArray(lineasOverride) ? lineasOverride : lineas.delPidActual;
  if (!Array.isArray(lineasParaLeyenda) || lineasParaLeyenda.length === 0) return null;

  const colores = obtenerColoresLeyendaUsadosParaExport(lineasParaLeyenda);
  if (!colores || colores.length === 0) return null;

  const med = medirLeyenda(colores, ctx);
  if (!med) return null;

  // El zoom de referencia es el mismo que se usa para las etiquetas de marcas,
  // así la leyenda y las etiquetas se ven a la misma escala relativa que en
  // el visor (que escala con scale(zoom)).
  const zoom = (zoomReferencia && zoomReferencia > 0) ? zoomReferencia : 1;
  // Opcion 1: misma formula que el visor. Escala efectiva = ESCALA_LEYENDA/ref.
  // IMPORTANTE: el ref debe ser el de ESTE P&ID. En el PDF combinado no hay un
  // visor activo para cada pagina, asi que NO usamos marc._zoomLeyendaRef (que
  // es global del visor abierto). Solo lo usamos si este P&ID ES el abierto;
  // si no, caemos al zoom de referencia calculado por pagina (obtenerCanvas...).
  const esPidAbierto = (typeof marc !== 'undefined' && marc &&
                        marc._zoomLeyendaRef &&
                        marc.pid === (opciones && opciones._pidNombreExport) &&
                        (marc.hojaTexto || marc.hoja) === (opciones && opciones._pidHojaExport) &&
                        String(marc.rev) === String(opciones && opciones._pidRevExport));
  const eBase = (typeof ESCALA_LEYENDA === 'number' && ESCALA_LEYENDA > 0) ? ESCALA_LEYENDA : 1;
  const refLey = (esPidAbierto && marc._zoomLeyendaRef) ? marc._zoomLeyendaRef : zoom;
  const escala = eBase / refLey;
  const wImg = med.ancho * escala;
  const hImg = med.alto * escala;

  let x, y;

  const leyendaPos = (leyendaPosOverride !== undefined) ? leyendaPosOverride : lineas._leyendaPos;

  if (leyendaPos && leyendaPos.anclada &&
      leyendaPos.x !== null && leyendaPos.y !== null) {
    // Posición anclada: ya está en coords de imagen, se respeta tal cual.
    x = leyendaPos.x;
    y = leyendaPos.y;
  } else {
    // Default: replicar el cálculo del visor (obtenerRectLeyendaEnImagen),
    // que ubica la leyenda pegada al borde inferior de la PANTALLA y pasa a
    // coords de imagen con (pantalla - offset) / zoom. Usamos los offsets
    // reales del visor (pasados explícitamente) en lugar de simularlos.
    const vh = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 800;

    // Alto visible del lienzo del visor (clientHeight), igual que el visor.
    let hView = vh;
    if (typeof $ === 'function') {
      const lienzo = $('lienzoMarc');
      if (lienzo && lienzo.clientHeight > 0) hView = lienzo.clientHeight;
    }

    const offsetX = (offsetXOverride !== null && offsetXOverride !== undefined) ? offsetXOverride : 0;
    const offsetY = (offsetYOverride !== null && offsetYOverride !== undefined) ? offsetYOverride : 0;

    const pantallaX = LEYENDA_MARGEN_LATERAL;
    let pantallaY = hView - med.alto - LEYENDA_MARGEN_INFERIOR;
    if (pantallaY < 0) pantallaY = 0;

    x = (pantallaX - offsetX) / zoom;
    y = (pantallaY - offsetY) / zoom;
  }

  // Clamp a la imagen.
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x + wImg > ancho) x = ancho - wImg;
  if (y + hImg > alto) y = alto - hImg;
  if (x < 0) x = 0;
  if (y < 0) y = 0;

  return { x: x, y: y, w: wImg, h: hImg, colores: colores, med: med, zoom: zoom, escala: escala };
}

/**
 * Construye un canvas offscreen con imagen + líneas + leyenda + marcas.
 * Devuelve el canvas listo (no lo inserta en el DOM).
 */
function construirCanvasExportacion(opciones) {
  const imagen = opciones.imagen;
  const ancho = opciones.ancho;
  const alto = opciones.alto;
  const marcas = opciones.marcas || [];
  const lineasDelPid = opciones.lineasDelPid || null;
  const zoomReferencia = (opciones.zoomReferencia && opciones.zoomReferencia > 0) ? opciones.zoomReferencia : 1;
  const offsetXOverride = (opciones.offsetXOverride !== null && opciones.offsetXOverride !== undefined) ? opciones.offsetXOverride : null;
  const offsetYOverride = (opciones.offsetYOverride !== null && opciones.offsetYOverride !== undefined) ? opciones.offsetYOverride : null;
  const leyendaPosOverride = (opciones.leyendaPosOverride !== undefined) ? opciones.leyendaPosOverride : undefined;
  const pidNombre = opciones.pidNombre || null;
  const pidHoja = opciones.pidHoja || null;
  const pidRev = (opciones.pidRev !== undefined && opciones.pidRev !== null) ? String(opciones.pidRev) : null;

  const canvas = document.createElement('canvas');
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  // Fondo blanco por si la imagen tiene transparencias.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, ancho, alto);

  // 1) Imagen
  if (imagen) ctx.drawImage(imagen, 0, 0, ancho, alto);

  // 2) Líneas de proceso
  //    dibujarLineasCanvas lee lineas.delPidActual (global). Para exportar
  //    desde fuera del visor (PDF combinado), swapeamos temporalmente.
  const backupLineas = (typeof lineas !== 'undefined') ? lineas.delPidActual : null;
  if (typeof lineas !== 'undefined' && Array.isArray(lineasDelPid)) {
    lineas.delPidActual = lineasDelPid;
  }
  try {
    if (typeof dibujarLineasCanvas === 'function') {
      dibujarLineasCanvas(ctx);
    }
  } finally {
    if (typeof lineas !== 'undefined' && Array.isArray(backupLineas)) {
      lineas.delPidActual = backupLineas;
    }
  }

  // 3) Leyenda: mismo criterio que el visor (Opcion 1: tamano en imagen, sin escala).
  try {
    // Pasamos la identidad del P&ID para que obtenerRectLeyendaParaExport
    // decida si puede usar marc._zoomLeyendaRef (solo si ES el P&ID abierto).
    const rectLey = obtenerRectLeyendaParaExport(ctx, ancho, alto, lineasDelPid, zoomReferencia, offsetXOverride, offsetYOverride, leyendaPosOverride, {
      _pidNombreExport: opciones.pidNombre || null,
      _pidHojaExport: opciones.pidHoja || null,
      _pidRevExport: opciones.pidRev || null
    });
    if (rectLey) {
      // Usamos la escala YA calculada por obtenerRectLeyendaParaExport
      // (misma ref que el rect), para que posicion y tamano coincidan.
      const escala = (rectLey.escala && rectLey.escala > 0) ? rectLey.escala : 1;
      ctx.save();
      ctx.translate(rectLey.x, rectLey.y);
      ctx.scale(escala, escala);
      dibujarCajaLeyenda(ctx, 0, 0, rectLey.colores, rectLey.med);
      ctx.restore();
    }
  } catch (e) {
    console.warn('Error al dibujar leyenda en exportación:', e);
  }

  // 4) Marcas (con etiqueta flotante + línea conectora)
  dibujarMarcasEnCanvasExport(ctx, marcas, zoomReferencia);

  return canvas;
}

// ----------------------------------------------------------------
// Helpers de descarga y base64
// ----------------------------------------------------------------

function descargarBlob(blob, nombreArchivo) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

// Genera y descarga un archivo JSON o CSV con las marcas del listado actual.
function descargarArchivoMarcas(nombreArchivo, formato) {
  const marcas = (Array.isArray(itemsDelListado) ? itemsDelListado : []).map(function (it) {
    return {
      numero: it.numero,
      tag: it.tag || '',
      descripcion: it.descripcion || '',
      diametro: it.diametro,
      cso_c: it.cso_csc,
      estado: it.estado || '',
      ubicacion: it.ubicacion || '',
      pid_nombre: it.pid_nombre || '',
      pid_hoja: it.pid_hoja || '',
      pid_revision: it.pid_revision || '',
      x: it.x,
      y: it.y,
      forma: it.forma || '',
      tamano_x: it.tamano,
      tamano_y: it.tamano_y,
      etiqueta_offset_x: it.etiqueta_offset_x,
      etiqueta_offset_y: it.etiqueta_offset_y
    };
  });

  // Fecha/hora local de Argentina (UTC-3 fijo, sin horario de verano)
  // en formato ISO 8601 con offset: YYYY-MM-DDTHH:mm:ss-03:00
  const ahoraArg = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const generadoArg = ahoraArg.toISOString().replace(/\.\d{3}Z$/, '-03:00');

  const datos = {
    version: 1,
    generado: generadoArg,
    origen: {
      listado_id: listadoActual.id,
      listado_nombre: listadoActual.nombre || '',
      usuario: (sesion && sesion.usuario) ? sesion.usuario : ''
    },
    total_marcas: marcas.length,
    marcas: marcas
  };

  let contenido, tipoMime;
  if (formato === 'csv') {
    const columnas = [
      'version', 'generado', 'listado_id', 'listado_nombre', 'usuario',
      'numero', 'tag', 'descripcion', 'diametro', 'cso_c', 'estado',
      'ubicacion', 'pid_nombre', 'pid_hoja', 'pid_revision', 'x', 'y',
      'forma', 'tamano_x', 'tamano_y', 'etiqueta_offset_x', 'etiqueta_offset_y'
    ];
    const filas = marcas.map(function (marca) {
      return columnas.map(function (columna) {
        if (Object.prototype.hasOwnProperty.call(marca, columna)) return marca[columna];
        if (columna === 'version') return datos.version;
        if (columna === 'generado') return datos.generado;
        if (columna === 'listado_id') return datos.origen.listado_id;
        if (columna === 'listado_nombre') return datos.origen.listado_nombre;
        if (columna === 'usuario') return datos.origen.usuario;
        return '';
      });
    });
    const escaparCampo = function (valor) {
      let texto = (valor === null || valor === undefined) ? '' : String(valor);
      if (/^[\u0000-\u0020]*[=+\-@]/.test(texto)) texto = "'" + texto;
      return '"' + texto.replace(/"/g, '""') + '"';
    };
    contenido = '\uFEFF' + [columnas].concat(filas)
      .map(function (fila) { return fila.map(escaparCampo).join(','); })
      .join('\r\n');
    tipoMime = 'text/csv;charset=utf-8';
  } else {
    contenido = JSON.stringify(datos, null, 2);
    tipoMime = 'application/json';
  }

  const blob = new Blob([contenido], { type: tipoMime });
  descargarBlob(blob, nombreArchivo);
}

function canvasABase64PNG(canvas) {
  const dataUrl = canvas.toDataURL('image/png');
  const idx = dataUrl.indexOf(',');
  if (idx === -1) return '';
  return dataUrl.substring(idx + 1);
}

function nombreArchivoSeguro(pid, hojaTexto, rev) {
  const s = (pid || 'PID') + '_Hoja' + (hojaTexto || '1de1') + '_Rev' + (rev || '0');
  return s.replace(/[^A-Za-z0-9_\-\.]/g, '_');
}

// ----------------------------------------------------------------
// Exportar PNG del P&ID actual (visor abierto)
// ----------------------------------------------------------------

async function obtenerCanvasExportacionDePid(pidNombre, hojaTexto, rev, img) {
  const marcas = await obtenerMarcasDelPID(pidNombre, hojaTexto, rev);
  const lineasDelPid = await obtenerLineasDelPidEnListado(pidNombre, hojaTexto, rev);

  const nombresOriginales = (typeof lineas !== 'undefined' && Array.isArray(lineas.nombres))
    ? lineas.nombres.slice()
    : null;
  const nombres = listadoActual
    ? await obtenerNombresColores(listadoActual.id, pidNombre, hojaTexto)
    : null;

  // Posición anclada de la leyenda para este P&ID (igual que el visor).
  // Si el P&ID es el abierto, se usa la del visor; si no, se consulta el server.
  let leyendaPosOverride = undefined;
  const esPidAbierto = (typeof marc !== 'undefined' && marc.pid === pidNombre &&
                        marc.hojaTexto === hojaTexto && marc.rev === rev);
  if (esPidAbierto && typeof lineas !== 'undefined') {
    leyendaPosOverride = lineas._leyendaPos || null;
  } else {
    leyendaPosOverride = await obtenerPosicionLeyendaDelPid(
      pidNombre, hojaTexto, img.naturalWidth, img.naturalHeight
    );
  }

  // Determinamos las dimensiones del lienzo y el zoom/offset, ya sea que el P&ID
  // esté abierto en el visor o no. En ambos casos, la lógica debe ser la misma
  // que la que ocurre al hacer clic en "Ajustar" en el visor.
  let zoomRef = 1;
  let offX = 0;
  let offY = 0;
  const anchoImg = img.naturalWidth;
  const altoImg = img.naturalHeight;

  if (typeof marc !== 'undefined' && marc.pid === pidNombre && marc.hojaTexto === hojaTexto && marc.rev === rev) {
    // Está abierto: usamos el zoom y offset reales del visor.
    zoomRef = marc.zoom || 1;
    offX = marc.offsetX || 0;
    offY = marc.offsetY || 0;
  } else {
    // No está abierto: replicamos exactamente ajustarMarcAPantalla(), que usa
    // el tamaño real del lienzo del visor (clientWidth/Height). Si el lienzo no
    // está visible (0), caemos a un viewport fijo determinístico.
    const lienzo = (typeof $ === 'function') ? $('lienzoMarc') : null;
    let w = lienzo ? lienzo.clientWidth : 0;
    let h = lienzo ? lienzo.clientHeight : 0;
    if (w === 0 || h === 0) {
      w = 1200;
      h = 800;
    }
    const escalaX = w / anchoImg;
    const escalaY = h / altoImg;
    zoomRef = Math.min(escalaX, escalaY);
    offX = (w - anchoImg * zoomRef) / 2;
    offY = (h - altoImg * zoomRef) / 2;
  }

  // La leyenda lee los nombres desde el estado global del visor.
  if (typeof lineas !== 'undefined') {
    lineas.nombres = nombres || NOMBRES_COLORES_LINEA_DEFAULT.slice();
  }
  try {
    return construirCanvasExportacion({
      imagen: img,
      ancho: anchoImg,
      alto: altoImg,
      marcas: marcas,
      lineasDelPid: lineasDelPid,
      zoomReferencia: zoomRef,
      offsetXOverride: offX,
      offsetYOverride: offY,
      leyendaPosOverride: leyendaPosOverride,
      pidNombre: pidNombre,
      pidHoja: hojaTexto,
      pidRev: rev
    });
  } finally {
    if (nombresOriginales && typeof lineas !== 'undefined') {
      lineas.nombres = nombresOriginales;
    }
  }
}

function exportarPNGActual() {
  if (typeof marc === 'undefined' || !marc.imagen) {
    mostrarAviso('No hay un P&ID abierto para exportar.', true);
    return;
  }

  mostrarProgreso('Generando PNG...');
  actualizarProgreso(10, 'Preparando el plano');

  try {
    const canvas = construirCanvasExportacion({
      imagen: marc.imagen,
      ancho: marc.ancho,
      alto: marc.alto,
      marcas: marc.marcas,
      lineasDelPid: (typeof lineas !== 'undefined' && lineas.cargado) ? lineas.delPidActual : null,
      zoomReferencia: marc.zoom || 1,
      offsetXOverride: marc.offsetX,
      offsetYOverride: marc.offsetY,
      pidNombre: marc.pid,
      pidHoja: marc.hojaTexto || marc.hoja,
      pidRev: marc.rev
    });

    actualizarProgreso(70, 'Codificando imagen');

    canvas.toBlob(function (blob) {
      try {
        if (!blob) {
          mostrarAviso('No se pudo generar el PNG.', true);
          return;
        }
        actualizarProgreso(95, 'Descargando');
        const nombre = nombreArchivoSeguro(marc.pid, marc.hojaTexto || marc.hoja, marc.rev) + '.png';
        descargarBlob(blob, nombre);
        mostrarAviso('PNG exportado: ' + nombre);
      } finally {
        ocultarProgreso();
      }
    }, 'image/png');

  } catch (e) {
    ocultarProgreso();
    console.error(e);
    mostrarAviso('Error al exportar PNG: ' + e.message, true);
  }
}

// ----------------------------------------------------------------
// Exportar PDF del P&ID actual (visor abierto)
// ----------------------------------------------------------------

async function exportarPDFActual() {
  if (typeof marc === 'undefined' || !marc.imagen) {
    mostrarAviso('No hay un P&ID abierto para exportar.', true);
    return;
  }

  mostrarProgreso('Generando PDF...');
  actualizarProgreso(10, 'Preparando el plano');

  try {
    const canvas = construirCanvasExportacion({
      imagen: marc.imagen,
      ancho: marc.ancho,
      alto: marc.alto,
      marcas: marc.marcas,
      lineasDelPid: (typeof lineas !== 'undefined' && lineas.cargado) ? lineas.delPidActual : null,
      zoomReferencia: marc.zoom || 1,
      offsetXOverride: marc.offsetX,
      offsetYOverride: marc.offsetY,
      pidNombre: marc.pid,
      pidHoja: marc.hojaTexto || marc.hoja,
      pidRev: marc.rev
    });

    actualizarProgreso(45, 'Codificando imagen');
    const pngBase64 = canvasABase64PNG(canvas);

    const paginas = [{
      pid: marc.pid,
      hoja: marc.hojaTexto || marc.hoja,
      rev: marc.rev,
      pngBase64: pngBase64,
      anchoImg: marc.ancho,
      altoImg: marc.alto
    }];

    const titulo = (listadoActual ? listadoActual.nombre + ' — ' : '') +
                   marc.pid + ' Hoja ' + (marc.hojaTexto || marc.hoja) + ' Rev' + marc.rev;

    actualizarProgreso(70, 'Armando el PDF en el servidor');
    const blob = await pedirPDFAlServer({ paginas: paginas, titulo: titulo, portada: false });
    if (!blob) return;

    actualizarProgreso(95, 'Descargando');
    const nombre = nombreArchivoSeguro(marc.pid, marc.hojaTexto || marc.hoja, marc.rev) + '.pdf';
    descargarBlob(blob, nombre);
    mostrarAviso('PDF exportado: ' + nombre);

  } catch (e) {
    console.error(e);
    mostrarAviso('Error al exportar PDF: ' + e.message, true);
  } finally {
    ocultarProgreso();
  }
}

// ----------------------------------------------------------------
// Exportar PDF combinado (todos los P&ID del listado)
// ----------------------------------------------------------------

function exportarPDFCombinado() {
  if (!listadoActual || !listadoActual.id) {
    mostrarAviso('No hay listado abierto.', true);
    return;
  }

  const hayPids = Array.isArray(pidsDelListado) && pidsDelListado.length > 0;
  const hayItems = Array.isArray(itemsDelListado) && itemsDelListado.length > 0;

  if (!hayPids && !hayItems) {
    mostrarAviso('El listado no tiene P&ID ni marcaciones para exportar.', true);
    return;
  }

  // Orden: Portada, Listado, archivo de marcas, P&ID.
  // Los tildes se recuerdan por USUARIO en localStorage (clave
  // 'exportOpciones_<usuario>'). Si no hay nada guardado, todos tildados.
  const opc = leerOpcionesExport();
  const chkPortada =
    '<label class="campoCheckboxModal"><input type="checkbox" id="chkExportPortada"' + (opc.portada ? ' checked' : '') + '> Incluir portada</label>';

  const chkListado = hayItems
    ? '<label class="campoCheckboxModal"><input type="checkbox" id="chkExportListado"' + (opc.listado ? ' checked' : '') + '> Incluir listado de marcaciones (' + itemsDelListado.length + ')</label>'
    : '<label class="campoCheckboxModal" style="opacity:0.5;"><input type="checkbox" id="chkExportListado" disabled> Incluir listado de marcaciones (sin ítems)</label>';

  const chkJson = hayItems
    ? '<label class="campoCheckboxModal"><input type="checkbox" id="chkExportJson"' + (opc.json ? ' checked' : '') + '> Incluir archivo de marcas</label>'
    : '<label class="campoCheckboxModal" style="opacity:0.5;"><input type="checkbox" id="chkExportJson" disabled> Incluir archivo de marcas (sin ítems)</label>';

  const formatoArchivo = (opc.formatoArchivo === 'csv') ? 'csv' : 'json';
  const formatoDeshabilitado = (!hayItems || !opc.json) ? ' disabled' : '';
  const radiosFormatoArchivo =
    '<div style="display:flex;gap:14px;margin-left:24px;">' +
      '<label><input type="radio" name="formatoArchivoExport" value="json"' + (formatoArchivo === 'json' ? ' checked' : '') + formatoDeshabilitado + '> JSON</label>' +
      '<label><input type="radio" name="formatoArchivoExport" value="csv"' + (formatoArchivo === 'csv' ? ' checked' : '') + formatoDeshabilitado + '> CSV</label>' +
    '</div>';

  const chkPids = hayPids
    ? '<label class="campoCheckboxModal"><input type="checkbox" id="chkExportPids"' + (opc.pids ? ' checked' : '') + '> Incluir P&ID del listado (' + pidsDelListado.length + ')</label>'
    : '<label class="campoCheckboxModal" style="opacity:0.5;"><input type="checkbox" id="chkExportPids" disabled> Incluir P&ID del listado (sin P&ID)</label>';

  const contenido =
    '<p style="margin-top:0;">Elegí qué incluir en el PDF y si querés descargar el archivo JSON o CSV por separado:</p>' +
    '<div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">' +
      chkPortada + chkListado + chkJson + radiosFormatoArchivo + chkPids +
    '</div>';

  abrirModal('Exportar', contenido, function () {
    const incluirPids = !!(hayPids && $('chkExportPids').checked);
    const incluirPortada = !!$('chkExportPortada').checked;
    const incluirListado = !!(hayItems && $('chkExportListado').checked);
    const incluirJson = !!(hayItems && $('chkExportJson').checked);
    const radioFormatoSeleccionado = document.querySelector('input[name="formatoArchivoExport"]:checked');
    const formatoArchivo = radioFormatoSeleccionado ? radioFormatoSeleccionado.value : 'json';

    if (!incluirPids && !incluirPortada && !incluirListado && !incluirJson) {
      mostrarAviso('Elegí al menos una sección para exportar.', true);
      return false;
    }

    // Recordar los tildes para la próxima exportación de este usuario.
    guardarOpcionesExport({
      portada: incluirPortada,
      listado: incluirListado,
      json: incluirJson,
      formatoArchivo: formatoArchivo,
      pids: incluirPids
    });

    generarPDFCombinado({
      incluirPids: incluirPids,
      incluirPortada: incluirPortada,
      incluirListado: incluirListado,
      incluirJson: incluirJson,
      formatoArchivo: formatoArchivo
    });
    return true;
  }, { textoAceptar: 'Exportar' });

  // El formato del archivo es independiente de incluir el listado en el PDF.
  const chkJ = document.getElementById('chkExportJson');
  const radiosFormato = document.querySelectorAll('input[name="formatoArchivoExport"]');
  function sincronizarFormatoArchivo() {
    radiosFormato.forEach(function (radio) {
      radio.disabled = !chkJ || chkJ.disabled || !chkJ.checked;
    });
  }
  if (chkJ) chkJ.addEventListener('change', sincronizarFormatoArchivo);
}

// ----------------------------------------------------------------
// Persistencia de las opciones de exportación (por usuario)
// ----------------------------------------------------------------
// Se guardan en localStorage con la clave 'exportOpciones_<usuario>'.
// Si no hay nada guardado, devuelve todos tildados (comportamiento viejo).

function _claveOpcionesExport() {
  const usuario = (typeof sesion !== 'undefined' && sesion && sesion.usuario)
    ? String(sesion.usuario)
    : 'anonimo';
  return 'exportOpciones_' + usuario;
}

function leerOpcionesExport() {
  const def = { portada: true, listado: true, json: true, formatoArchivo: 'json', pids: true };
  try {
    const raw = localStorage.getItem(_claveOpcionesExport());
    if (!raw) return def;
    const d = JSON.parse(raw);
    if (!d || typeof d !== 'object') return def;
    return {
      portada: (typeof d.portada === 'boolean') ? d.portada : true,
      listado: (typeof d.listado === 'boolean') ? d.listado : true,
      json: (typeof d.json === 'boolean') ? d.json : true,
      formatoArchivo: d.formatoArchivo === 'csv' ? 'csv' : 'json',
      pids: (typeof d.pids === 'boolean') ? d.pids : true
    };
  } catch (e) {
    return def;
  }
}

function guardarOpcionesExport(opc) {
  if (!opc || typeof opc !== 'object') return;
  try {
    localStorage.setItem(_claveOpcionesExport(), JSON.stringify({
      portada: !!opc.portada,
      listado: !!opc.listado,
      json: !!opc.json,
      formatoArchivo: opc.formatoArchivo === 'csv' ? 'csv' : 'json',
      pids: !!opc.pids
    }));
  } catch (e) {}
}

async function generarPDFCombinado(opciones) {
  const incluirPids = !!opciones.incluirPids;
  const incluirPortada = !!opciones.incluirPortada;
  const incluirListado = !!opciones.incluirListado;
  const incluirJson = !!opciones.incluirJson;
  const incluirPDF = incluirPids || incluirPortada || incluirListado;

  mostrarProgreso(incluirPDF ? 'Generando exportación...' : 'Generando archivo de marcas...');
  actualizarProgreso(2, 'Preparando');

  try {
    const paginas = [];

    if (incluirPDF && incluirPids && Array.isArray(pidsDelListado)) {
      for (let i = 0; i < pidsDelListado.length; i++) {
        const p = pidsDelListado[i];
        // Recolección de páginas: 2% a 70%.
        const pctBase = 2 + Math.round((i / Math.max(1, pidsDelListado.length)) * 68);
        actualizarProgreso(pctBase, 'P&ID ' + (i + 1) + ' de ' + pidsDelListado.length + ': ' + p.pid);
        const pidNombre = p.pid;
        const hojaTexto = formatearHoja(p.hojaTexto || p.hoja);
        const rev = String(p.revision);

        const img = await cargarImagenPID(pidNombre, hojaTexto, rev);
        if (!img) {
          console.warn('No se pudo cargar imagen de', pidNombre, hojaTexto, rev);
          continue;
        }

        // Usamos la función unificada, exactamente igual que la exportación individual.
        const canvas = await obtenerCanvasExportacionDePid(pidNombre, hojaTexto, rev, img);
        const pngBase64 = canvasABase64PNG(canvas);

        paginas.push({
          pid: pidNombre,
          hoja: hojaTexto,
          rev: rev,
          pngBase64: pngBase64,
          anchoImg: img.naturalWidth,
          altoImg: img.naturalHeight
        });
      }

      if (paginas.length === 0) {
        mostrarAviso('No se pudo generar ninguna página de P&ID.', true);
        return;
      }
    }

    const itemsListado = incluirListado && Array.isArray(itemsDelListado)
      ? itemsDelListado.map(function (it) {
          return {
            numero: it.numero,
            tag: it.tag || '',
            diametro: it.diametro,
            descripcion: it.descripcion || '',
            estado: it.estado || '',
            cso_csc: it.cso_csc,
            pid_nombre: it.pid_nombre || '',
            pid_hoja: it.pid_hoja || '',
            pid_revision: it.pid_revision || '',
            ubicacion: it.ubicacion || ''
          };
        })
      : [];

    const titulo = 'Listado: ' + listadoActual.nombre;

    // Hoja del listado: usamos la del primer P&ID asignado (o '1de1' si no hay).
    let hojaListado = '1de1';
    if (Array.isArray(pidsDelListado) && pidsDelListado.length > 0) {
      hojaListado = formatearHoja(pidsDelListado[0].hojaTexto || pidsDelListado[0].hoja);
    }

    const baseNombre = 'Listado_' + listadoActual.id + '_' +
                       (listadoActual.nombre || 'sin_nombre').replace(/[^A-Za-z0-9_\-\.]/g, '_');
    let pdfExportado = false;
    if (incluirPDF) {
      actualizarProgreso(75, 'Armando el PDF en el servidor');

      const blob = await pedirPDFAlServer({
        paginas: paginas,
        titulo: titulo,
        portada: incluirPortada,
        incluirListado: incluirListado,
        itemsListado: itemsListado,
        nombreListado: listadoActual.nombre || '',
        hojaListado: hojaListado,
        usuario: (sesion && sesion.usuario) ? sesion.usuario : ''
      });
      if (!blob) return;

      actualizarProgreso(95, 'Descargando PDF');
      descargarBlob(blob, baseNombre + '.pdf');
      pdfExportado = true;
    }

    // El archivo de marcas se puede exportar sin incluir el listado en el PDF.
    if (incluirJson) {
      const extension = opciones.formatoArchivo === 'csv' ? '.csv' : '.json';
      descargarArchivoMarcas(baseNombre + extension, opciones.formatoArchivo);
    }

    const partes = [];
    if (incluirPortada) partes.push('portada');
    if (paginas.length > 0) partes.push(paginas.length + ' P&ID');
    if (incluirListado) partes.push(itemsListado.length + ' marcaciones');
    if (incluirJson) partes.push(opciones.formatoArchivo === 'csv' ? 'CSV' : 'JSON');
    if (pdfExportado && incluirJson) {
      mostrarAviso('PDF y archivo de marcas exportados (' + partes.join(' + ') + ').');
    } else if (pdfExportado) {
      mostrarAviso('PDF combinado exportado (' + partes.join(' + ') + ').');
    } else if (incluirJson) {
      mostrarAviso((opciones.formatoArchivo === 'csv' ? 'CSV' : 'JSON') + ' exportado.');
    }

  } catch (e) {
    console.error(e);
    mostrarAviso('Error al exportar PDF combinado: ' + e.message, true);
  } finally {
    ocultarProgreso();
  }
}

// ----------------------------------------------------------------
// Helpers de carga para el PDF combinado
// ----------------------------------------------------------------

function cargarImagenPID(pid, hoja, rev) {
  return new Promise(function (resolve) {
    const img = new Image();
    img.onload = function () { resolve(img); };
    img.onerror = function () { resolve(null); };
    img.src = '/api/pid/' + encodeURIComponent(pid) + '/' +
              encodeURIComponent(hoja) + '/' +
              encodeURIComponent(rev) + '/imagen';
  });
}

async function obtenerMarcasDelPID(pid, hoja, rev) {
  try {
    const r = await fetchAPI('/api/listados/' + listadoActual.id + '/items/' +
                             encodeURIComponent(pid) + '/' +
                             encodeURIComponent(hoja) + '/' +
                             encodeURIComponent(rev));
    const d = await r.json();
    if (!d || !Array.isArray(d.items)) return [];
    return d.items.map(function (it) {
      return {
        id: it.id,
        numero: (it.numero !== undefined && it.numero !== null) ? it.numero : null,
        tag: it.tag || '',
        descripcion: it.descripcion || '',
        diametro: it.diametro,
        estado: it.estado || 'otro',
        forma: it.forma || 'circulo',
        tamano: it.tamano || 14,
        tamanoY: (it.tamano_y !== null && it.tamano_y !== undefined) ? it.tamano_y : (it.tamano || 14),
        x: it.x,
        y: it.y,
        etiquetaOffsetX: (it.etiqueta_offset_x !== null && it.etiqueta_offset_x !== undefined) ? it.etiqueta_offset_x : null,
        etiquetaOffsetY: (it.etiqueta_offset_y !== null && it.etiqueta_offset_y !== undefined) ? it.etiqueta_offset_y : null,
        borrado: false
      };
    });
  } catch (e) {
    return [];
  }
}

async function obtenerLineasDelPidEnListado(pid, hoja, rev) {
  if (!listadoActual) return [];
  try {
    const r = await fetchAPI('/api/listados/' + listadoActual.id + '/lineas/' +
                             encodeURIComponent(pid) + '/' +
                             encodeURIComponent(hoja) + '/' +
                             encodeURIComponent(rev));
    const d = await r.json();
    if (!d || !Array.isArray(d.lineas)) return [];
    return d.lineas;
  } catch (e) {
    return [];
  }
}

/**
 * Trae la posición anclada de la leyenda para un P&ID del listado, igual
 * que cargarPosicionLeyenda() del visor. Devuelve { x, y, anclada: true }
 * o null si no hay posición guardada.
 */
async function obtenerPosicionLeyendaDelPid(pid, hoja, anchoImg, altoImg) {
  try {
    const url = '/api/listados/' + listadoActual.id +
                '/leyenda-lineas/' +
                encodeURIComponent(pid) + '/' +
                encodeURIComponent(hoja);
    const r = await fetchAPI(url);
    const d = await r.json();
    if (d && d.x !== null && d.y !== null && !isNaN(d.x) && !isNaN(d.y)) {
      if (d.x >= 0 && d.x <= anchoImg && d.y >= 0 && d.y <= altoImg) {
        return { x: d.x, y: d.y, anclada: true };
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}

// ----------------------------------------------------------------
// Pedido de PDF al server
// ----------------------------------------------------------------

async function pedirPDFAlServer(payload) {
  try {
    const resp = await fetchAPI('/api/exportar/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      let msg = 'HTTP ' + resp.status;
      try {
        const err = await resp.json();
        if (err && err.error) msg = err.error;
      } catch (e) {}
      mostrarAviso('Error del servidor: ' + msg, true);
      return null;
    }

    const blob = await resp.blob();
    return blob;

  } catch (e) {
    console.error(e);
    mostrarAviso('Error al pedir el PDF: ' + e.message, true);
    return null;
  }
}

// ----------------------------------------------------------------
// Enganche de botones
// ----------------------------------------------------------------

function inicializarExportacion() {
  const btnPNG = $('btnExportarMarc');
  if (btnPNG && !btnPNG._expEnganchado) {
    btnPNG.onclick = exportarPNGActual;
    btnPNG._expEnganchado = true;
  }

  const btnPDF = $('btnExportarPDFMarc');
  if (btnPDF && !btnPDF._expEnganchado) {
    btnPDF.onclick = exportarPDFActual;
    btnPDF._expEnganchado = true;
  }

  const btnCombinado = $('btnExportarPDFCombinado');
  if (btnCombinado && !btnCombinado._expEnganchado) {
    btnCombinado.onclick = exportarPDFCombinado;
    btnCombinado._expEnganchado = true;
  }
}