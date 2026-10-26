// ================================================================
// Líneas de proceso - Render en canvas y hit-testing
// ================================================================
// Dibuja todas las líneas del P&ID actual en el canvas principal
// (y en la lupa, vía reutilización). También hit-test de línea y
// de tiradores de nodos. Los tiradores solo se dibujan si la línea
// está seleccionada y hay permiso de edición (no solo lectura).

var TIRADOR_RADIO_PANTALLA = 6;   // radio en px de pantalla
var TIRADOR_HIT_PANTALLA  = 10;   // radio de hit-test en px de pantalla

// ----------------------------------------------------------------
// Dibujo principal (canvas principal y lupa)
// ----------------------------------------------------------------

function dibujarLineasCanvas(ctx) {
  if (typeof marc !== 'undefined' && marc.mostrarLineas === false) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  lineas.delPidActual.forEach(function (ln) {
    if (ln.puntos.length < 2) return;
    // Parpadeo ("Ver en plano"): mientras dure, la línea alterna visible/oculto.
    if (lineas._parpadeoId === ln.id && lineas._parpadeoMostrando === false) return;
    const colorDef = COLORES_LINEA[ln.color_indice] || { color: '#888' };

    // Halo de selección
    if (lineas.seleccionada === ln.id) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.moveTo(ln.puntos[0].x, ln.puntos[0].y);
      for (let i = 1; i < ln.puntos.length; i++) ctx.lineTo(ln.puntos[i].x, ln.puntos[i].y);
      ctx.lineWidth = ln.grosor + 8;
      ctx.strokeStyle = '#00E5FF';
      ctx.stroke();
      ctx.restore();
    }

    ctx.globalAlpha = (ln.opacidad || 70) / 100;
    ctx.beginPath();
    ctx.moveTo(ln.puntos[0].x, ln.puntos[0].y);
    for (let i = 1; i < ln.puntos.length; i++) ctx.lineTo(ln.puntos[i].x, ln.puntos[i].y);
    ctx.lineWidth = ln.grosor;
    ctx.strokeStyle = colorDef.color;
    ctx.stroke();
  });

  // Trazo en curso (modo dibujando)
  if (lineas.modo === 'dibujando' && lineas.puntosEnCurso.length > 0) {
    const colorDef = COLORES_LINEA[lineas.colorIndice] || { color: '#888' };
    ctx.globalAlpha = (lineas.opacidad || 70) / 100;
    ctx.beginPath();
    ctx.moveTo(lineas.puntosEnCurso[0].x, lineas.puntosEnCurso[0].y);
    for (let i = 1; i < lineas.puntosEnCurso.length; i++) ctx.lineTo(lineas.puntosEnCurso[i].x, lineas.puntosEnCurso[i].y);
    if (lineas.puntoMouseActual) ctx.lineTo(lineas.puntoMouseActual.x, lineas.puntoMouseActual.y);
    ctx.lineWidth = lineas.grosor;
    ctx.strokeStyle = colorDef.color;
    ctx.stroke();

    // Puntos del trazo en curso
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#FFF';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    lineas.puntosEnCurso.forEach(function (p) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }

  ctx.restore();

  // Tiradores de nodos (solo si hay línea seleccionada y se puede editar)
  dibujarTiradoresNodos(ctx);
}

// ----------------------------------------------------------------
// Tiradores de nodos de la línea seleccionada
// ----------------------------------------------------------------
// Se dibujan en coordenadas de imagen pero con tamaño en píxeles de
// pantalla (dividiendo por el zoom), para que se vean siempre igual
// de grandes sin importar cuánto zoom tenga el plano.

function dibujarTiradoresNodos(ctx) {
  if (typeof marc === 'undefined') return;
  if (lineas.seleccionada === null) return;
  if (marc.soloLectura) return;

  const ln = lineas.delPidActual.find(function (l) { return l.id === lineas.seleccionada; });
  if (!ln || !ln.puntos || ln.puntos.length === 0) return;

  const zoom = (marc && marc.zoom) ? marc.zoom : 1;
  const radioImagen = TIRADOR_RADIO_PANTALLA / zoom;

  ctx.save();
  ctx.lineWidth = Math.max(1 / zoom, 0.5);
  ctx.strokeStyle = '#FFFFFF';
  ctx.fillStyle = '#00E5FF';

  for (let i = 0; i < ln.puntos.length; i++) {
    const p = ln.puntos[i];
    ctx.beginPath();
    ctx.arc(p.x, p.y, radioImagen, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

// ----------------------------------------------------------------
// Hit-test: línea y tirador de nodo
// ----------------------------------------------------------------

function hitTestLinea(p) {
  let hit = null, minDist = 15;
  lineas.delPidActual.forEach(function (ln) {
    for (let i = 0; i < ln.puntos.length - 1; i++) {
      const a = ln.puntos[i], b = ln.puntos[i + 1];
      const dist = distanciaPuntoSegmento(p.x, p.y, a.x, a.y, b.x, b.y);
      const tol = Math.max(minDist, (ln.grosor / 2) + 5);
      if (dist <= tol) { hit = ln; minDist = dist; }
    }
  });
  return hit;
}

// Devuelve { linea, indice } si el click cae sobre un tirador de la
// línea seleccionada. El hit-test se hace en píxeles de pantalla,
// así el tirador es igual de fácil de agarrar con cualquier zoom.
function hitTestTiradorNodo(p) {
  if (lineas.seleccionada === null) return null;
  if (typeof marc === 'undefined' || marc.soloLectura) return null;

  const ln = lineas.delPidActual.find(function (l) { return l.id === lineas.seleccionada; });
  if (!ln || !ln.puntos) return null;

  const zoom = (marc && marc.zoom) ? marc.zoom : 1;
  const toleranciaImagen = TIRADOR_HIT_PANTALLA / zoom;
  const tol2 = toleranciaImagen * toleranciaImagen;

  for (let i = 0; i < ln.puntos.length; i++) {
    const pt = ln.puntos[i];
    const dx = p.x - pt.x, dy = p.y - pt.y;
    if (dx * dx + dy * dy <= tol2) return { linea: ln, indice: i };
  }
  return null;
}

function distanciaPuntoSegmento(px, py, x1, y1, x2, y2) {
  const A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1;
  const dot = A * C + B * D, len_sq = C * C + D * D;
  let param = -1;
  if (len_sq !== 0) param = dot / len_sq;
  let xx, yy;
  if (param < 0) { xx = x1; yy = y1; }
  else if (param > 1) { xx = x2; yy = y2; }
  else { xx = x1 + param * C; yy = y1 + param * D; }
  return Math.sqrt((px - xx) ** 2 + (py - yy) ** 2);
}

// ----------------------------------------------------------------
// Parpadeo de una línea ("Ver en plano" desde la tabla de Líneas)
// ----------------------------------------------------------------
// Hace parpadear la línea `id` `veces` veces, alternando visible/oculto
// cada `intervaloMs / 2`. Cualquier llamada nueva cancela la anterior
// (token). Se cancela también al seleccionar otra línea, al salir del
// visor o al cambiar de pantalla (ver cancelarParpadeoLinea).
function iniciarParpadeoLinea(id, veces, intervaloMs) {
  veces = veces || 10;
  intervaloMs = intervaloMs || 500;

  lineas._parpadeoToken = (lineas._parpadeoToken || 0) + 1;
  const miToken = lineas._parpadeoToken;

  lineas._parpadeoId = id;
  lineas._parpadeoMostrando = true;

  let i = 0;
  function ciclo() {
    if (miToken !== lineas._parpadeoToken) return; // lo cortó otro parpadeo/cancelación

    if (i >= veces * 2) {
      lineas._parpadeoId = null;
      lineas._parpadeoMostrando = true;
      if (typeof dibujarMarc === 'function') dibujarMarc();
      return;
    }
    lineas._parpadeoMostrando = (i % 2 === 0);
    if (typeof dibujarMarc === 'function') dibujarMarc();
    i++;
    setTimeout(ciclo, intervaloMs / 2);
  }
  ciclo();
}

// Corta cualquier parpadeo de línea en curso.
function cancelarParpadeoLinea() {
  if (lineas._parpadeoId === null || lineas._parpadeoId === undefined) return;
  lineas._parpadeoToken = (lineas._parpadeoToken || 0) + 1;
  lineas._parpadeoId = null;
  lineas._parpadeoMostrando = true;
  if (typeof dibujarMarc === 'function') dibujarMarc();
}