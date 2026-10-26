// ================================================================
// Visor de marcado - Lupa
// ================================================================

// Throttle: la lupa se redibuja como maximo una vez por frame.
// calcularLayoutMarcas() crea/mide/borra DOM, asi que llamarla en cada
// mousemove era costoso. Con rAF se agrupan las llamadas.
var _lupaRafPendiente = false;

function actualizarLupaMarc() {
  if (_lupaRafPendiente) return;
  _lupaRafPendiente = true;
  const fn = function () {
    _lupaRafPendiente = false;
    _dibujarLupaMarc();
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(fn);
  } else {
    setTimeout(fn, 16);
  }
}

function _dibujarLupaMarc() {
  const lupa = $('lupaMarc');
  const lupaCanvas = $('lupaCanvasMarc');
  // Guarda: si los elementos de la lupa no existen en el DOM, no hacemos nada.
  if (!lupa || !lupaCanvas) return;

  // Si el mouse no está sobre el lienzo, forzamos el ocultamiento.
  if (typeof marc !== 'undefined' && marc.mouseSobreLienzo === false) {
    lupa.style.display = 'none';
    return;
  }

  if (!marc.lupaActiva || !marc.imagen) { lupa.style.display = 'none'; return; }
  if (!marc.virtual) { lupa.style.display = 'none'; return; }

  const p = { x: marc.virtual.x, y: marc.virtual.y };

  const tam = marc.lupaTamano;
  const zoomLupa = marc.lupaZoom;

  lupa.style.display = 'block';
  lupa.style.width = tam + 'px';
  lupa.style.height = tam + 'px';
  lupaCanvas.width = tam;
  lupaCanvas.height = tam;

  const ctx = lupaCanvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, tam, tam);

  const offX = (tam / 2) - (p.x * zoomLupa);
  const offY = (tam / 2) - (p.y * zoomLupa);

  ctx.save();
  ctx.translate(offX, offY);
  ctx.scale(zoomLupa, zoomLupa);

  // Imagen base
  ctx.drawImage(marc.imagen, 0, 0, marc.ancho, marc.alto);

  // 1) Líneas
  if (typeof dibujarLineasCanvas === 'function') {
    if (typeof marc === 'undefined' || marc.mostrarLineas !== false) {
      dibujarLineasCanvas(ctx);
    }
  }

  // 2) LEYENDA (dibujada nativamente en la escena, escalada por zoomLupa)
  if (typeof lineas !== 'undefined' && typeof obtenerRectLeyendaEnImagen === 'function') {
    try {
      const rectLey = obtenerRectLeyendaEnImagen(ctx);
      if (rectLey) {
        const colores = obtenerColoresLeyendaUsados();
        const med = medirLeyenda(colores, ctx);
        
        if (colores.length > 0 && med) {
          ctx.save();
          ctx.translate(rectLey.x, rectLey.y);

          // Opcion 1: la leyenda esta en coords de imagen; la lupa solo
          // aplica su propio zoom (ya no se divide por marc.zoom).
          const eBase = (typeof ESCALA_LEYENDA === 'number' && ESCALA_LEYENDA > 0) ? ESCALA_LEYENDA : 1;
          const refLey = (marc && marc._zoomLeyendaRef) ? marc._zoomLeyendaRef : 1;
          const escala = eBase / refLey;
          ctx.scale(zoomLupa * escala, zoomLupa * escala);

          dibujarCajaLeyenda(ctx, 0, 0, colores, med);
          ctx.restore();
        }
      }
    } catch (e) {
      console.warn('Error al dibujar leyenda en lupa:', e);
    }
  }

  const mostrarMarcas = sesion && sesion.config && sesion.config.Lupa &&
                        sesion.config.Lupa.MostrarMarcaciones;

  if (mostrarMarcas) {
    const infos = calcularLayoutMarcas(true);

    infos.forEach(function (info) {
      if (info.et && info.et.parentNode) info.et.parentNode.removeChild(info.et);
    });

    infos.forEach(function (info) {
      if (!info.tramo) return;
      ctx.save();
      ctx.strokeStyle = info.colorBorde;
      ctx.lineWidth = GROSOR_BORDE_MARCA / zoomLupa;
      ctx.beginPath();
      ctx.moveTo(info.tramo.a.x, info.tramo.a.y);
      ctx.lineTo(info.tramo.b.x, info.tramo.b.y);
      ctx.stroke();
      ctx.restore();
    });

    infos.forEach(function (info) {
      const m = info.m;
      const colorRelleno = hexAAlpha(info.colorBorde, 0.5);

      ctx.save();
      ctx.strokeStyle = info.colorBorde;
      ctx.fillStyle = colorRelleno;
      ctx.lineWidth = GROSOR_BORDE_MARCA / zoomLupa;

      if (m.forma === 'rectangular') {
        const rX = m.tamano;
        const rY = (m.tamanoY !== null && m.tamanoY !== undefined) ? m.tamanoY : m.tamano;
        ctx.fillRect(m.x - rX, m.y - rY, rX * 2, rY * 2);
        ctx.strokeRect(m.x - rX, m.y - rY, rX * 2, rY * 2);
      } else {
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.tamano, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    });

    infos.forEach(function (info) {
      const m = info.m;
      const posEt = info.posEt;
      const anchoEt = info.anchoEt;
      const altoEt = info.altoEt;

      const x0 = posEt.x - anchoEt / 2;
      const y0 = posEt.y - altoEt / 2;

      const radio = Math.min(anchoEt, altoEt) * 0.25;
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      dibujarRectanguloRedondeadoLupa(ctx, x0, y0, anchoEt, altoEt, radio);
      ctx.fill();

      ctx.strokeStyle = info.colorBorde;
      ctx.lineWidth = 2;
      dibujarRectanguloRedondeadoLupa(ctx, x0, y0, anchoEt, altoEt, radio);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold ' + info.tamañoFuente + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(textoEtiquetaMarca(m), posEt.x, posEt.y);
      ctx.restore();
    });
  }

  ctx.restore();

  const colorCruz = colorDeCruzAdecuadoMarc(p.x, p.y);
  dibujarCruz(ctx, tam, colorCruz);

  const lienzo = $('lienzoMarc');
  const rect = lienzo.getBoundingClientRect();
  const xPant = p.x * marc.zoom + marc.offsetX + rect.left;
  const yPant = p.y * marc.zoom + marc.offsetY + rect.top;

  let lx = xPant + 20;
  let ly = yPant + 20;
  if (lx + tam > window.innerWidth) lx = xPant - tam - 20;
  if (ly + tam > window.innerHeight) ly = yPant - tam - 20;
  lupa.style.left = lx + 'px';
  lupa.style.top = ly + 'px';
}

function dibujarRectanguloRedondeadoLupa(ctx, x, y, w, h, r) {
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

function colorDeCruzAdecuadoMarc(pxImagen, pyImagen) {
  if (!marc.imagen) return '#fff';
  const ctx = canvasBrillo.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, canvasBrillo.width, canvasBrillo.height);

  try {
    ctx.drawImage(marc.imagen,
      Math.floor(pxImagen - 20), Math.floor(pyImagen - 20), 40, 40,
      0, 0, canvasBrillo.width, canvasBrillo.height);
  } catch (e) { return '#fff'; }

  let datos;
  try { datos = ctx.getImageData(0, 0, canvasBrillo.width, canvasBrillo.height).data; }
  catch (e) { return '#fff'; }

  let suma = 0, cuenta = 0;
  for (let i = 0; i < datos.length; i += 4) {
    suma += 0.299 * datos[i] + 0.587 * datos[i + 1] + 0.114 * datos[i + 2];
    cuenta++;
  }
  const brillo = suma / cuenta;
  return brillo > 128 ? 'rgba(0,0,0,0.9)' : 'rgba(255,255,255,0.95)';
}

function dibujarCruz(ctx, tam, color) {
  const largoLinea = 16;
  const colorHalo = (color.indexOf('0,0,0') !== -1) ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';

  ctx.strokeStyle = colorHalo;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(tam / 2, tam / 2 - largoLinea);
  ctx.lineTo(tam / 2, tam / 2 + largoLinea);
  ctx.moveTo(tam / 2 - largoLinea, tam / 2);
  ctx.lineTo(tam / 2 + largoLinea, tam / 2);
  ctx.stroke();

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(tam / 2, tam / 2 - largoLinea);
  ctx.lineTo(tam / 2, tam / 2 + largoLinea);
  ctx.moveTo(tam / 2 - largoLinea, tam / 2);
  ctx.lineTo(tam / 2 + largoLinea, tam / 2);
  ctx.stroke();
}