// ================================================================
// Visor de marcado - Canvas y layout (DOM)
// ================================================================

function offsetEtiquetaBase(m, anchoEt, altoEt) {
  const altoMarca = m.forma === 'rectangular' ? (m.tamanoY || m.tamano) : m.tamano;
  const distY = altoMarca + SEPARACION_TAG + (altoEt / 2);
  return { x: 0, y: -distY };
}

// Garantiza que el rectángulo de la etiqueta (centrado en cx,cy con tamaño
// anchoEt/altoEt) nunca quede a menos de SEPARACION_TAG px del borde de la
// marca. Para rectangulares usa el borde más cercano del rectángulo de la
// marca; para círculos usa la circunferencia (radio + margen).
function _clampearCentroEtiqueta(m, cx, cy, anchoEt, altoEt) {
  const margen = SEPARACION_TAG;
  const mediaW = anchoEt / 2;
  const mediaH = altoEt / 2;

  if (m.forma === 'rectangular') {
    const halfX = m.tamano;
    const halfY = (m.tamanoY !== null && m.tamanoY !== undefined) ? m.tamanoY : m.tamano;

    // Zona de exclusión: rectángulo de la marca expandido por el margen.
    const exMinX = m.x - halfX - margen, exMaxX = m.x + halfX + margen;
    const exMinY = m.y - halfY - margen, exMaxY = m.y + halfY + margen;

    // Rectángulo de la etiqueta centrado en (cx,cy).
    const etMinX = cx - mediaW, etMaxX = cx + mediaW;
    const etMinY = cy - mediaH, etMaxY = cy + mediaH;

    const interX = etMaxX > exMinX && etMinX < exMaxX;
    const interY = etMaxY > exMinY && etMinY < exMaxY;

    if (interX && interY) {
      // Empujar por el eje que requiera menos desplazamiento.
      const pushArriba = etMaxY - exMinY; // mover cy hacia -Y
      const pushAbajo = exMaxY - etMinY;  // mover cy hacia +Y
      const pushIzq = etMaxX - exMinX;    // mover cx hacia -X
      const pushDer = exMaxX - etMinX;    // mover cx hacia +X
      const minPush = Math.min(pushArriba, pushAbajo, pushIzq, pushDer);
      if (minPush === pushArriba) cy -= pushArriba;
      else if (minPush === pushAbajo) cy += pushAbajo;
      else if (minPush === pushIzq) cx -= pushIzq;
      else cx += pushDer;
    }
  } else {
    // Círculo: exigir que la distancia del centro de la marca al PUNTO MÁS
    // CERCANO del rectángulo de la etiqueta sea >= radio + margen.
    // Usar la esquina sobreestima la distancia cuando la etiqueta está
    // alineada arriba/abajo/izq/der, y por eso el borde del rectángulo podía
    // tocar el círculo. Acá calculamos el punto más cercano del rectángulo.
    const r = m.tamano + margen;
    // Punto más cercano del rectángulo (centrado en cx,cy) al centro (m.x,m.y)
    const closestX = Math.max(cx - mediaW, Math.min(m.x, cx + mediaW));
    const closestY = Math.max(cy - mediaH, Math.min(m.y, cy + mediaH));
    let dxE = closestX - m.x, dyE = closestY - m.y;
    let distE = Math.sqrt(dxE * dxE + dyE * dyE);
    if (distE < r) {
      // Si el punto más cercano coincide con el centro (rectángulo contiene
      // al centro), empujar en la dirección del centro del rectángulo.
      if (distE < 0.0001) {
        let ux = cx - m.x, uy = cy - m.y;
        const dl = Math.sqrt(ux * ux + uy * uy) || 1;
        ux /= dl; uy /= dl;
        // Desplazar hasta que el borde del rectángulo quede a r del centro:
        // aproximamos moviendo el centro del rectángulo por (r - distE) en
        // la dirección del vector, más el margen del semieje correspondiente.
        const extra = (r - distE) + Math.min(mediaW, mediaH);
        cx += ux * extra;
        cy += uy * extra;
      } else {
        const falta = r - distE;
        const ux = dxE / distE, uy = dyE / distE;
        cx += ux * falta;
        cy += uy * falta;
      }
    }
  }

  return { x: cx, y: cy };
}

function posicionEtiquetaRealConTamano(m, anchoEt, altoEt) {
  let cx, cy;
  if (m.etiquetaOffsetX !== null && m.etiquetaOffsetY !== null) {
    cx = m.x + m.etiquetaOffsetX;
    cy = m.y + m.etiquetaOffsetY;
  } else {
    const off = offsetEtiquetaBase(m, anchoEt, altoEt);
    cx = m.x + off.x;
    cy = m.y + off.y;
  }
  return _clampearCentroEtiqueta(m, cx, cy, anchoEt, altoEt);
}

function posicionEtiquetaAproximada(m) {
  const anchoAprox = 60;
  const altoAprox = Math.max(16, Math.round(m.tamano * 0.9) + 10);
  let cx, cy;
  if (m.etiquetaOffsetX !== null && m.etiquetaOffsetY !== null) {
    cx = m.x + m.etiquetaOffsetX;
    cy = m.y + m.etiquetaOffsetY;
  } else {
    const off = offsetEtiquetaBase(m, anchoAprox, altoAprox);
    cx = m.x + off.x;
    cy = m.y + off.y;
  }
  return _clampearCentroEtiqueta(m, cx, cy, anchoAprox, altoAprox);
}

function posicionTiradorRedimension(m) {
  const altoM = (m.forma === 'rectangular' && m.tamanoY) ? m.tamanoY : m.tamano;
  if (m.forma === 'rectangular') {
    return { x: m.x + m.tamano, y: m.y + altoM };
  }
  return { x: m.x + m.tamano * 0.7071, y: m.y + m.tamano * 0.7071 };
}

function calcularTramoLinea(m, posEt, anchoEt, altoEt) {
  const cxM = m.x, cyM = m.y, cxE = posEt.x, cyE = posEt.y;
  let dx = cxE - cxM, dy = cyE - cyM;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 0.0001) return null;
  const ux = dx / dist, uy = dy / dist;

  let tMarca;
  if (m.forma === 'rectangular') {
    const halfX = m.tamano;
    const halfY = (m.tamanoY !== null && m.tamanoY !== undefined) ? m.tamanoY : m.tamano;
    const tX = (ux !== 0) ? (halfX / Math.abs(ux)) : Infinity;
    const tY = (uy !== 0) ? (halfY / Math.abs(uy)) : Infinity;
    tMarca = Math.min(tX, tY);
  } else {
    tMarca = m.tamano;
  }

  const semAnchoEt = anchoEt / 2;
  const semAltoEt = altoEt / 2;
  let tEtiqueta = Infinity;

  if (ux !== 0) {
    let t = (cxE - semAnchoEt - cxM) / ux;
    if (t > 0) { const y = cyM + t * uy; if (y >= cyE - semAltoEt && y <= cyE + semAltoEt) tEtiqueta = Math.min(tEtiqueta, t); }
    t = (cxE + semAnchoEt - cxM) / ux;
    if (t > 0) { const y = cyM + t * uy; if (y >= cyE - semAltoEt && y <= cyE + semAltoEt) tEtiqueta = Math.min(tEtiqueta, t); }
  }
  if (uy !== 0) {
    let t = (cyE - semAltoEt - cyM) / uy;
    if (t > 0) { const x = cxM + t * ux; if (x >= cxE - semAnchoEt && x <= cxE + semAnchoEt) tEtiqueta = Math.min(tEtiqueta, t); }
    t = (cyE + semAltoEt - cyM) / uy;
    if (t > 0) { const x = cxM + t * ux; if (x >= cxE - semAnchoEt && x <= cxE + semAnchoEt) tEtiqueta = Math.min(tEtiqueta, t); }
  }

  if (!isFinite(tEtiqueta) || tEtiqueta <= tMarca) return null;

  const a = { x: cxM + ux * tMarca, y: cyM + uy * tMarca };
  const b = { x: cxM + ux * tEtiqueta, y: cyM + uy * tEtiqueta };
  return { a: a, b: b };
}

function crearLineaConectora(pA, pB, color, grosor) {
  const dx = pB.x - pA.x, dy = pB.y - pA.y;
  const largo = Math.sqrt(dx * dx + dy * dy);
  const angulo = Math.atan2(dy, dx) * 180 / Math.PI;
  const linea = document.createElement('div');
  linea.className = 'lineaConectora';
  linea.style.left = pA.x + 'px';
  linea.style.top = (pA.y - grosor / 2) + 'px';
  linea.style.width = largo + 'px';
  linea.style.height = grosor + 'px';
  linea.style.background = color;
  linea.style.transformOrigin = '0 50%';
  linea.style.transform = 'rotate(' + angulo + 'deg)';
  return linea;
}

function calcularLayoutMarcas(ignorarParpadeo) {
  if (typeof marc !== 'undefined' && marc.mostrarMarcas === false) return [];

  const etiquetaMax = tamanoEtiquetaMaxActual();
  const capa = $('capaMarcadoresMarc');
  const resultados = [];

  marc.marcas.forEach(function (m) {
    if (m.borrado || m.x === null || m.y === null) return;
    if (!ignorarParpadeo && marc.parpadeoActivo && marc.seleccionada === m.tempId && marc.parpadeoMostrando === false) return;

    const colorBorde = colorSegunEstado(m.estado);
    const dimTexto = (m.forma === 'rectangular' && m.tamanoY) ? (m.tamano + m.tamanoY) / 2 : m.tamano;
    const tamanoParaTexto = Math.min(dimTexto, etiquetaMax);
    const tamañoFuente = Math.max(8, Math.round(tamanoParaTexto * 0.9));

    const et = document.createElement('div');
    et.className = 'etiquetaMarcaTag';
    et.textContent = textoEtiquetaMarca(m);
    et.style.fontSize = tamañoFuente + 'px';
    et.style.padding = '0px';
    et.style.borderStyle = 'solid';
    et.style.borderWidth = '2px';
    et.style.borderColor = colorBorde;
    et.style.lineHeight = '1';
    et.style.display = 'inline-block';
    et.style.visibility = 'hidden';
    et.style.left = '0px';
    et.style.top = '0px';
    capa.appendChild(et);

    const rectTexto = et.getBoundingClientRect();
    const anchoTexto = rectTexto.width / marc.zoom;
    const altoTexto = rectTexto.height / marc.zoom;

    const anchoObjetivo = anchoTexto * 1.2;
    const altoObjetivo = altoTexto * 1.2;
    et.style.padding = Math.max(0, altoObjetivo - altoTexto) / 2 + 'px ' + Math.max(0, anchoObjetivo - anchoTexto) / 2 + 'px';

    const rectEt = et.getBoundingClientRect();
    const anchoEt = rectEt.width / marc.zoom;
    const altoEt = rectEt.height / marc.zoom;

    const posEt = posicionEtiquetaRealConTamano(m, anchoEt, altoEt);
    const tramo = calcularTramoLinea(m, posEt, anchoEt, altoEt);

    resultados.push({ m: m, et: et, anchoEt: anchoEt, altoEt: altoEt, posEt: posEt, tramo: tramo, colorBorde: colorBorde, tamañoFuente: tamañoFuente });
  });

  return resultados;
}

function hitTestEtiqueta(p, infos) {
  if (!infos) return null;
  for (let i = infos.length - 1; i >= 0; i--) {
    const info = infos[i];
    const et = info.et;
    if (!et || et.style.visibility === 'hidden') continue;
    // posEt es el CENTRO de la etiqueta (ver _clampearCentroEtiqueta y
    // dibujarMarc, donde el div se centra en posEt). Por eso el area de
    // impacto se calcula desde el centro, no como esquina superior izquierda.
    const cx = info.posEt.x, cy = info.posEt.y, w = info.anchoEt, h = info.altoEt;
    if (p.x >= cx - w / 2 && p.x <= cx + w / 2 &&
        p.y >= cy - h / 2 && p.y <= cy + h / 2) return info;
  }
  return null;
}

function hitTestMarca(p, marcas) {
  if (!marcas) return null;
  for (let i = marcas.length - 1; i >= 0; i--) {
    const m = marcas[i];
    if (!m || m.borrado || m.x === null || m.y === null) continue;
    if (m.forma === 'rectangular') {
      const halfX = m.tamano;
      const halfY = (m.tamanoY !== null && m.tamanoY !== undefined) ? m.tamanoY : m.tamano;
      if (Math.abs(p.x - m.x) <= halfX && Math.abs(p.y - m.y) <= halfY) return m;
    } else {
      if (Math.sqrt((p.x - m.x) ** 2 + (p.y - m.y) ** 2) <= m.tamano) return m;
    }
  }
  return null;
}

function dibujarMarc() {
  const canvas = $('canvasMarc');
  const capa = $('capaMarcadoresMarc');
  if (!canvas || !capa) return;

  canvas.width = marc.ancho;
  canvas.height = marc.alto;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, marc.ancho, marc.alto);
  if (marc.imagen) ctx.drawImage(marc.imagen, 0, 0);

  // --- DIBUJAR LÍNEAS DE PROCESO ---
  if (typeof dibujarLineasCanvas === 'function') {
    dibujarLineasCanvas(ctx);
  }

  // --- LEYENDA DE LÍNEAS (dibujada en el canvas) ---
  // Va después de las líneas y antes de aplicar el CSS transform,
  // porque dibujarLeyendaEnCanvasPrincipal() compensa el zoom
  // internamente para que el texto se vea nítido.
  if (typeof dibujarLeyendaEnCanvasPrincipal === 'function') {
    dibujarLeyendaEnCanvasPrincipal(ctx);
  }

  // --- SELLO 'DESACTUALIZADO' ---
  // Se dibuja en su propia capa (debajo de marcas e hipervinculos) y se
  // escala con el mismo transform que el canvas. El tamano del sello se
  // recalcula en px de IMAGEN para que ocupe 1/3 de la hoja sin importar
  // el zoom (ver actualizarSelloDesactualizado en visorMarcado.js).
  if (typeof actualizarSelloDesactualizado === 'function') {
    actualizarSelloDesactualizado();
  }

  const t = 'translate(' + marc.offsetX + 'px,' + marc.offsetY + 'px) scale(' + marc.zoom + ')';
  canvas.style.transform = t;
  capa.style.transform = t;
  const capaSello = $('capaSelloDesactualizado');
  if (capaSello) capaSello.style.transform = t;
  const capaHip = $('capaHipervinculosMarc');
  if (capaHip) {
    capaHip.style.transform = t;
    if (typeof dibujarHipervinculosMarc === 'function') dibujarHipervinculosMarc();
  }

  capa.innerHTML = '';
  if (marc.cruzVirtualEl) {
    capa.appendChild(marc.cruzVirtualEl);
  } else {
    marc.cruzVirtualEl = crearCruzVirtual('capaMarcadoresMarc');
  }

  const infos = calcularLayoutMarcas(false);

  infos.forEach(function (info) {
    info.et.style.left = info.posEt.x + 'px';
    info.et.style.top = info.posEt.y + 'px';
    info.et.style.visibility = 'visible';
  });

  infos.forEach(function (info) {
    if (info.tramo) {
      const linea = crearLineaConectora(info.tramo.a, info.tramo.b, info.colorBorde, GROSOR_BORDE_MARCA);
      capa.insertBefore(linea, capa.firstChild);
    }
  });

  infos.forEach(function (info) {
    const m = info.m;
    const colorRelleno = colorRellenoPorEstado(m.estado);
    const anchoMarca = m.tamano * 2;
    const altoMarca = (m.forma === 'rectangular' && m.tamanoY) ? (m.tamanoY * 2) : (m.tamano * 2);

    const div = document.createElement('div');
    div.className = 'marcaMarc' + (marc.seleccionada === m.tempId ? ' seleccionada' : '');
    div.style.left = m.x + 'px';
    div.style.top = m.y + 'px';
    div.style.width = anchoMarca + 'px';
    div.style.height = altoMarca + 'px';
    div.style.marginLeft = -m.tamano + 'px';
    div.style.marginTop = -(altoMarca / 2) + 'px';
    div.style.borderColor = info.colorBorde;
    div.style.background = colorRelleno;
    if (m.forma === 'rectangular') div.style.borderRadius = '0';
    capa.insertBefore(div, info.et);
  });

  if (!marc.soloLectura) {
    infos.forEach(function (info) {
      if (marc.seleccionada !== info.m.tempId) return;
      const m = info.m;
      const posT = posicionTiradorRedimension(m);

      const tiradorT = document.createElement('div');
      tiradorT.className = 'tiradorMarca';
      tiradorT.setAttribute('data-tempid', m.tempId);
      tiradorT.style.left = (posT.x - 7) + 'px';
      tiradorT.style.top = (posT.y - 7) + 'px';
      capa.appendChild(tiradorT);

      const tiradorE = document.createElement('div');
      tiradorE.className = 'tiradorEtiqueta';
      tiradorE.setAttribute('data-tempid', m.tempId);
      tiradorE.style.left = (info.posEt.x + info.anchoEt / 2 - 4) + 'px';
      tiradorE.style.top = (info.posEt.y + info.altoEt / 2 - 4) + 'px';
      capa.appendChild(tiradorE);
    });
  }

  if (typeof actualizarCruzVirtual === 'function') {
    actualizarCruzVirtual(marc, marc.cruzVirtualEl);
  }
}

function dibujarListaMarcas() {
  const cont = $('listaMarcas');
  if (!cont) return;
  if (typeof marc !== 'undefined' && marc.mostrarMarcas === false) {
    cont.innerHTML = '<div style="color:#666;font-size:11px;">Capa de marcas oculta.</div>';
    return;
  }

  const visibles = marc.marcas.filter(function (m) { return !m.borrado; });
  if (visibles.length === 0) {
    cont.innerHTML = '<div style="color:#666;font-size:11px;">Sin marcas todavía. Hacé clic en el plano para agregar.</div>';
    return;
  }

  visibles.sort(function (a, b) {
    const na = (a.numero !== null && a.numero !== undefined) ? a.numero : 999999;
    const nb = (b.numero !== null && b.numero !== undefined) ? b.numero : 999999;
    return na - nb;
  });

  cont.innerHTML = visibles.map(function (m) {
    const sel = marc.seleccionada === m.tempId ? ' seleccionada' : '';
    const txt = textoListaMarca(m) + (m.nuevo ? ' *' : '');
    return '<div class="itemListaMarca' + sel + '" data-tempid="' + m.tempId + '">' + escaparHTML(txt) + '</div>';
  }).join('');

  cont.querySelectorAll('.itemListaMarca').forEach(function (el) {
    el.onclick = function () {
      const tid = parseInt(el.getAttribute('data-tempid'), 10);
      marc.seleccionada = tid;
      const m = marc.marcas.find(function (x) { return x.tempId === tid; });
      if (m && typeof asegurarMarcaVisible === 'function') {
        asegurarMarcaVisible(m);
        marc.virtual = { x: m.x, y: m.y };
      }
      dibujarMarc();
      dibujarListaMarcas();
      if (typeof actualizarPanelPropiedades === 'function') actualizarPanelPropiedades();
      if (typeof actualizarLupaMarc === 'function') actualizarLupaMarc();
      if (typeof parpadearMarca === 'function') {
        const cfgM = (sesion && sesion.config && sesion.config.Marcadores) || {};
        parpadearMarca(tid, cfgM.ParpadeoVeces || 5, cfgM.ParpadeoIntervalo || 250);
      }
    };
    el.ondblclick = function () {
      if (marc.soloLectura || typeof editarMarcaPorTempId !== 'function') return;
      editarMarcaPorTempId(parseInt(el.getAttribute('data-tempid'), 10));
    };
  });
}

function colorSegunEstado(estado) {
  if (!sesion || !sesion.config || !sesion.config.Marcadores) return '#00C853';
  const m = sesion.config.Marcadores;
  if (estado === 'abierto') return m.ColorAbierto;
  if (estado === 'cerrado') return m.ColorCerrado;
  return m.ColorOtro;
}

function colorRellenoPorEstado(estado) {
  return hexAAlpha(colorSegunEstado(estado), 0.5);
}

function hexAAlpha(hex, alpha) {
  if (!hex || hex.charAt(0) !== '#') return hex;
  let h = hex.slice(1);
  // Soportar #RGB -> #RRGGBB. Si no es un hex valido, devolver el color tal cual.
  if (h.length === 3) {
    h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return hex;
  const r = parseInt(h.substr(0, 2), 16);
  const g = parseInt(h.substr(2, 2), 16);
  const b = parseInt(h.substr(4, 2), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

function pantallaAPixelMarc(clientX, clientY) {
  const lienzo = $('lienzoMarc');
  const rect = lienzo.getBoundingClientRect();
  return {
    x: (clientX - rect.left - marc.offsetX) / marc.zoom,
    y: (clientY - rect.top - marc.offsetY) / marc.zoom
  };
}