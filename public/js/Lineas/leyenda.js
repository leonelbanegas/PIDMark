// ================================================================
// Líneas de proceso - Leyenda de colores (dibujada en canvas)
// ================================================================
// La leyenda es parte del canvas principal y de la lupa.
// Se dibuja en coords de imagen.
//
// CAMBIO: el drag cuenta como modificación (marc.cambios = true),
// pero NO se guarda de fondo. El guardado se dispara desde el
// botón "Guardar cambios" mediante un listener de captura.
// Si el usuario cancela, la posición no se persiste.

var LEYENDA_MARGEN_LATERAL = 32;
var LEYENDA_MARGEN_INFERIOR = 32;

var LEYENDA_ALTO_FILA = 16;
var LEYENDA_TAM_CUADRO = 11;
var LEYENDA_SEP_CUADRO = 6;
var LEYENDA_FUENTE = 11;
var LEYENDA_PADDING = 6;
var LEYENDA_RADIO_FONDO = 4;
// Factor de escala visual de la leyenda respecto del tamano "ideal" al
// abrir el P&ID (1 = tamano ideal).
var ESCALA_LEYENDA = 1;

function obtenerColoresLeyendaUsados() {
  if (typeof marc !== 'undefined' && marc.mostrarLineas === false) return [];
  if (typeof lineas === 'undefined' || !lineas.cargado) return [];
  if (!lineas.delPidActual || lineas.delPidActual.length === 0) return [];

  return obtenerColoresLeyendaUsadosParaExport(lineas.delPidActual);
}

/**
 * Variante para exportación: recibe las líneas explícitamente, así no
 * depende de lineas.cargado ni de lineas.delPidActual. Sirve para el
 * PDF combinado, donde no hay visor activo.
 */
function obtenerColoresLeyendaUsadosParaExport(lineasParaLeyenda) {
  if (typeof marc !== 'undefined' && marc.mostrarLineas === false) return [];
  if (!Array.isArray(lineasParaLeyenda) || lineasParaLeyenda.length === 0) return [];

  const usados = {};
  lineasParaLeyenda.forEach(function (ln) {
    if (!ln || ln.color_indice === undefined || ln.color_indice === null) return;
    usados[ln.color_indice] = true;
  });
  const indices = Object.keys(usados).map(Number).sort(function (a, b) { return a - b; });
  if (indices.length === 0) return [];

  return indices.map(function (idx) {
    const colorDef = COLORES_LINEA[idx] || { color: '#888' };
    const nombre = lineas.nombres[idx] || ('Color ' + (idx + 1));
    return { indice: idx, color: colorDef.color, nombre: nombre };
  });
}

function medirLeyenda(colores, ctx) {
  if (!colores || colores.length === 0) return null;

  ctx.save();
  ctx.font = LEYENDA_FUENTE + 'px system-ui, sans-serif';
  let anchoTextoMax = 0;
  colores.forEach(function (c) {
    const w = ctx.measureText(c.nombre).width;
    if (w > anchoTextoMax) anchoTextoMax = w;
  });
  ctx.restore();

  const anchoContenido = LEYENDA_TAM_CUADRO + LEYENDA_SEP_CUADRO + anchoTextoMax;
  const altoContenido = colores.length * LEYENDA_ALTO_FILA;
  const ancho = anchoContenido + LEYENDA_PADDING * 2;
  const alto = altoContenido + LEYENDA_PADDING * 2;

  return { colores: colores, ancho: ancho, alto: alto, anchoTextoMax: anchoTextoMax };
}

function obtenerRectLeyendaEnImagen(ctx) {
  if (typeof lineas === 'undefined' || typeof marc === 'undefined') return null;
  if (marc.mostrarLineas === false || !lineas.cargado) return null;

  const colores = obtenerColoresLeyendaUsados();
  if (colores.length === 0) return null;

  const med = medirLeyenda(colores, ctx);
  if (!med) return null;

  const zoom = marc.zoom || 1;
  // Opcion 1: la leyenda vive en el PLANO (coords de imagen) y escala junto
  // con el P&ID al hacer zoom (no salta). Pero su TAMANO EN IMAGEN se fija
  // respecto de un zoom de referencia (el del momento de abrir el P&ID,
  // tipicamente zoomMin). Asi al abrir se ve del tamano ideal (med en
  // pantalla) y al hacer zoom se agranda/achica junto con el plano.
  if (!marc._zoomLeyendaRef || marc._zoomLeyendaRef <= 0) {
    marc._zoomLeyendaRef = zoom;
  }
  const ref = marc._zoomLeyendaRef;
  // Tamano en imagen = tamano ideal (med) escalado por ESCALA_LEYENDA.
  const wImg = (med.ancho / ref) * ESCALA_LEYENDA;
  const hImg = (med.alto / ref) * ESCALA_LEYENDA;

  // Si está anclada, usamos las coords en imagen y clampeamos (SIN mutar
  // _leyendaPos: asi la posicion persistida no cambia al hacer zoom).
  if (lineas._leyendaPos && lineas._leyendaPos.anclada &&
      lineas._leyendaPos.x !== null && lineas._leyendaPos.y !== null) {

    let x = lineas._leyendaPos.x;
    let y = lineas._leyendaPos.y;

    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x + wImg > marc.ancho) x = marc.ancho - wImg;
    if (y + hImg > marc.alto) y = marc.alto - hImg;
    if (x < 0) x = 0;
    if (y < 0) y = 0;

    return { x: x, y: y, w: wImg, h: hImg, esDefault: false };
  }

  // Si NO está anclada todavia, calculamos la posicion inicial UNA SOLA VEZ
  // (en pantalla -> imagen, con el zoom/offset actuales) y la ANCLAMOS.
  // Asi, de ahi en mas, su posicion NO depende del zoom (no se mueve al
  // hacer zoom/pan). Sigue siendo arrastrable con el mouse. Se marca
  // origenDefault para no persistirla hasta que el usuario la mueva.
  const lienzo = $('lienzoMarc');
  if (!lienzo) return null;
  const hView = lienzo.clientHeight;

  const pantallaX = LEYENDA_MARGEN_LATERAL;
  let pantallaY = hView - med.alto - LEYENDA_MARGEN_INFERIOR;

  if (pantallaY < 0) {
    pantallaY = 0;
  }

  let imgX = (pantallaX - marc.offsetX) / zoom;
  let imgY = (pantallaY - marc.offsetY) / zoom;

  // Clamp a la imagen (por si el calculo cae fuera).
  if (imgX < 0) imgX = 0;
  if (imgY < 0) imgY = 0;
  if (imgX + wImg > marc.ancho) imgX = marc.ancho - wImg;
  if (imgY + hImg > marc.alto) imgY = marc.alto - hImg;
  if (imgX < 0) imgX = 0;
  if (imgY < 0) imgY = 0;

  // Anclar: coords fijas en imagen (misma forma que al arrastrarla).
  lineas._leyendaPos = { x: imgX, y: imgY, anclada: true, origenDefault: true };

  return { x: imgX, y: imgY, w: wImg, h: hImg, esDefault: true };
}

function dibujarLeyendaEnCanvasPrincipal(ctx) {
  try {
    if (typeof lineas === 'undefined' || typeof marc === 'undefined') return;
    if (!lineas.cargado || marc.mostrarLineas === false) return;

    const rect = obtenerRectLeyendaEnImagen(ctx);
    if (!rect) return;

    const colores = obtenerColoresLeyendaUsados();
    if (colores.length === 0) return;

    const med = medirLeyenda(colores, ctx);
    if (!med) return;

    // Opcion 1: sin compensar zoom; la leyenda se dibuja a su tamano en
    // coords de imagen y el transform del canvas la escala junto con el plano.
    // La escala efectiva es ESCALA_LEYENDA / ref, para que el ancho dibujado
    // coincida EXACTO con wImg (el que usa el clamp de arrastre). Si no,
    // clamp y dibujado usan anchos distintos y queda una zona muerta.
    const ref = marc._zoomLeyendaRef || 1;
    const escalaDibujo = ESCALA_LEYENDA / ref;
    ctx.save();
    ctx.translate(rect.x, rect.y);
    ctx.scale(escalaDibujo, escalaDibujo);
    dibujarCajaLeyenda(ctx, 0, 0, colores, med);
    ctx.restore();
  } catch (e) {
    console.warn('Error al dibujar leyenda en canvas principal:', e);
  }
}

function dibujarCajaLeyenda(ctx, x0, y0, colores, med) {
  const ancho = med.ancho;
  const alto = med.alto;

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  dibujarRectanguloRedondeado(ctx, x0, y0, ancho, alto, LEYENDA_RADIO_FONDO);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = 1;
  dibujarRectanguloRedondeado(ctx, x0, y0, ancho, alto, LEYENDA_RADIO_FONDO);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.font = LEYENDA_FUENTE + 'px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  colores.forEach(function (c, i) {
    const filaY = y0 + LEYENDA_PADDING + i * LEYENDA_ALTO_FILA + LEYENDA_ALTO_FILA / 2;
    const cuadroX = x0 + LEYENDA_PADDING;

    ctx.fillStyle = c.color;
    ctx.fillRect(cuadroX, filaY - LEYENDA_TAM_CUADRO / 2, LEYENDA_TAM_CUADRO, LEYENDA_TAM_CUADRO);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cuadroX, filaY - LEYENDA_TAM_CUADRO / 2, LEYENDA_TAM_CUADRO, LEYENDA_TAM_CUADRO);

    ctx.fillStyle = '#fff';
    ctx.fillText(c.nombre, cuadroX + LEYENDA_TAM_CUADRO + LEYENDA_SEP_CUADRO, filaY);
  });

  ctx.restore();
}

function dibujarRectanguloRedondeado(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

async function cargarPosicionLeyenda() {
  if (typeof lineas === 'undefined') return;
  lineas._leyendaPos = null;
  if (!lineas._listadoId || !lineas._pidNombre || !lineas._pidHoja) return;

  try {
    const url = '/api/listados/' + lineas._listadoId +
                '/leyenda-lineas/' +
                encodeURIComponent(lineas._pidNombre) + '/' +
                encodeURIComponent(lineas._pidHoja);
    const r = await fetchAPI(url);
    const d = await r.json();
    if (d && d.x !== null && d.y !== null && !isNaN(d.x) && !isNaN(d.y)) {
      if (d.x >= 0 && d.x <= (marc ? marc.ancho : 99999) && d.y >= 0 && d.y <= (marc ? marc.alto : 99999)) {
        lineas._leyendaPos = { x: d.x, y: d.y, anclada: true };
      } else {
        lineas._leyendaPos = null;
      }
    }
  } catch (e) {
    lineas._leyendaPos = null;
  }
}

async function guardarLeyendaPendiente() {
  if (typeof lineas === 'undefined' || typeof marc === 'undefined') return;
  if (!lineas._listadoId || !lineas._pidNombre || !lineas._pidHoja) return;
  if (!lineas._leyendaPos || !lineas._leyendaPos.anclada) return;
  // Posicion por defecto (no elegida por el usuario): no persistir.
  if (lineas._leyendaPos.origenDefault) return;
  if (marc.soloLectura) return;

  try {
    const url = '/api/listados/' + lineas._listadoId +
                '/leyenda-lineas/' +
                encodeURIComponent(lineas._pidNombre) + '/' +
                encodeURIComponent(lineas._pidHoja);
    await fetchAPI(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: lineas._leyendaPos.x, y: lineas._leyendaPos.y })
    });
  } catch (e) {
    console.warn('No se pudo guardar la posición de la leyenda:', e.message);
  }
}

function engancharEventosLeyenda() {
  const lienzo = $('lienzoMarc');
  if (!lienzo || lienzo._leyendaEnganchada) return;
  lienzo._leyendaEnganchada = true;

  // 1) Listener del mouse para arrastrar la leyenda
  lienzo.addEventListener('mousedown', function (e) {
    try {
      if (e.button !== 0) return;
      if (typeof lineas === 'undefined' || typeof marc === 'undefined') return;
      if (marc.mostrarLineas === false || !lineas.cargado) return;

      const rect = lienzo.getBoundingClientRect();
      const imgX = (e.clientX - rect.left - marc.offsetX) / marc.zoom;
      const imgY = (e.clientY - rect.top - marc.offsetY) / marc.zoom;

      const canvasPrincipal = $('canvasMarc');
      if (!canvasPrincipal) return;
      const ctx = canvasPrincipal.getContext('2d');
      const rectLey = obtenerRectLeyendaEnImagen(ctx);
      if (!rectLey) return;

      if (imgX < rectLey.x || imgX > rectLey.x + rectLey.w) return;
      if (imgY < rectLey.y || imgY > rectLey.y + rectLey.h) return;

      e.preventDefault();
      e.stopPropagation();

      if (!lineas._leyendaPos || !lineas._leyendaPos.anclada) {
        lineas._leyendaPos = { x: rectLey.x, y: rectLey.y, anclada: true };
      }
      // Al empezar a moverla, ya deja de ser "posicion por defecto":
      // a partir de aca se puede persistir al guardar.
      delete lineas._leyendaPos.origenDefault;

      lineas._leyendaArrastrando = true;
      lineas._leyendaDragIni = {
        imgX: imgX,
        imgY: imgY,
        leyX: lineas._leyendaPos.x,
        leyY: lineas._leyendaPos.y
      };

      if (typeof marc !== 'undefined') {
        marc.arrastrando = false;
        marc.arrastrandoMarca = false;
        marc.redimensionandoMarca = false;
        marc.arrastrandoEtiqueta = false;
      }

      if (typeof dibujarMarc === 'function') dibujarMarc();
    } catch (err) {
      console.warn('Error en mousedown leyenda:', err);
    }
  }, true);

  // 2) Listener en el botón "Guardar cambios"
  //    Interceptamos el click para asegurarnos de mandar la posición de la
  //    leyenda junto con el resto de los cambios, SIN tocar visorMarcado.js.
  const btnGuardar = $('btnGuardarMarc');
  if (btnGuardar && !btnGuardar._leyendaEnganchada) {
    btnGuardar._leyendaEnganchada = true;
    btnGuardar.addEventListener('click', function () {
      if (typeof marc !== 'undefined' && marc.cambios && lineas._leyendaPos && lineas._leyendaPos.anclada) {
        guardarLeyendaPendiente();
      }
    }, true); // <-- captura: se ejecuta antes que el visor guarde/cierre
  }
}

function moverArrastreLeyenda(ev) {
  try {
    if (!lineas._leyendaArrastrando || !lineas._leyendaDragIni) return;
    if (!lineas._leyendaPos || !lineas._leyendaPos.anclada) return;

    const lienzo = $('lienzoMarc');
    if (!lienzo) return;
    const rect = lienzo.getBoundingClientRect();
    const imgX = (ev.clientX - rect.left - marc.offsetX) / marc.zoom;
    const imgY = (ev.clientY - rect.top - marc.offsetY) / marc.zoom;

    const dx = imgX - lineas._leyendaDragIni.imgX;
    const dy = imgY - lineas._leyendaDragIni.imgY;

    let nuevaX = lineas._leyendaDragIni.leyX + dx;
    let nuevaY = lineas._leyendaDragIni.leyY + dy;

    const canvasPrincipal = $('canvasMarc');
    if (canvasPrincipal) {
      const ctx = canvasPrincipal.getContext('2d');
      const rectLey = obtenerRectLeyendaEnImagen(ctx);
      if (rectLey) {
        if (nuevaX < 0) nuevaX = 0;
        if (nuevaY < 0) nuevaY = 0;
        if (nuevaX + rectLey.w > marc.ancho) nuevaX = marc.ancho - rectLey.w;
        if (nuevaY + rectLey.h > marc.alto) nuevaY = marc.alto - rectLey.h;
      }
    }

    lineas._leyendaPos = { x: nuevaX, y: nuevaY, anclada: true };

    if (typeof dibujarMarc === 'function') dibujarMarc();
    if (typeof actualizarLupaMarc === 'function') actualizarLupaMarc();
  } catch (err) {
    console.warn('Error en moverArrastreLeyenda:', err);
  }
}

function finalizarArrastreLeyenda(ev) {
  try {
    if (!lineas._leyendaArrastrando) return;
    lineas._leyendaArrastrando = false;
    lineas._leyendaDragIni = null;

    if (lineas._leyendaPos && lineas._leyendaPos.anclada) {
      if (typeof marc !== 'undefined') {
        // Marcamos que hay cambios pendientes para habilitar el botón.
        marc.cambios = true;
        if (typeof actualizarBotonGuardar === 'function') actualizarBotonGuardar();
      }
      // OJO: no guardamos de fondo acá. Solo lo hacemos al hacer click en Guardar.
    }
  } catch (err) {
    console.warn('Error en finalizarArrastreLeyenda:', err);
  }
}

function renderizarLeyendaLineas() {
  if (typeof dibujarMarc === 'function') dibujarMarc();
}

function aplicarPosicionLeyenda() {
  if (typeof dibujarMarc === 'function') dibujarMarc();
}