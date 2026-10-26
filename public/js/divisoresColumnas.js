// ================================================================
// Divisor de panel derecho y redimensionado de columnas de tablas
// ================================================================

let divisor = { activo: false, panelId: null, divisorId: null, anchoInicial: 0, xInicial: 0 };

const ANCHO_PANEL_DEFECTO = 192;
const ANCHO_PANEL_MIN = 140;
const ANCHO_PANEL_MAX = 500;

const ANCHO_COLUMNA_MIN_EXTERNA = 20;
const ANCHO_COLUMNA_MIN_RELATIVO = 0.05;

// ============ Divisor de panel ============
function inicializarDivisores() {
  const anchoGuardado = parseInt(localStorage.getItem('anchoPanelDerecho'), 10);
  const anchoInicial = (anchoGuardado >= ANCHO_PANEL_MIN && anchoGuardado <= ANCHO_PANEL_MAX)
    ? anchoGuardado
    : ANCHO_PANEL_DEFECTO;

  aplicarAnchoPanel(anchoInicial);

  ['divisorCal', 'divisorMarc'].forEach(function (id) {
    const div = $(id);
    if (!div) return;

    div.addEventListener('mousedown', function (e) {
      const panelId = id === 'divisorCal' ? 'panelCal' : 'panelMarc';
      const panel = $(panelId);
      if (!panel) return;

      e.preventDefault();
      divisor.activo = true;
      divisor.divisorId = id;
      divisor.panelId = panelId;
      divisor.anchoInicial = panel.clientWidth;
      divisor.xInicial = e.clientX;

      div.classList.add('arrastrando');
      document.body.classList.add('redimensionando');
    });
  });

  // Guarda: los listeners de document se enganchan UNA sola vez.
  // Si inicializarDivisores() se llamara de nuevo, no se acumulan.
  if (!document._divisoresEnganchados) {
    document._divisoresEnganchados = true;
    _engancharListenersDivisorDocument();
  }
}

function _engancharListenersDivisorDocument() {
  document.addEventListener('mousemove', function (e) {
    if (!divisor.activo) return;
    const panel = $(divisor.panelId);
    if (!panel) return;

    const dx = divisor.xInicial - e.clientX;
    let nuevoAncho = divisor.anchoInicial + dx;
    if (nuevoAncho < ANCHO_PANEL_MIN) nuevoAncho = ANCHO_PANEL_MIN;
    if (nuevoAncho > ANCHO_PANEL_MAX) nuevoAncho = ANCHO_PANEL_MAX;
    panel.style.width = nuevoAncho + 'px';
  });

  document.addEventListener('mouseup', function () {
    if (!divisor.activo) return;
    const div = $(divisor.divisorId);
    if (div) div.classList.remove('arrastrando');
    document.body.classList.remove('redimensionando');
    const panel = $(divisor.panelId);
    if (panel) localStorage.setItem('anchoPanelDerecho', String(panel.clientWidth));
    divisor.activo = false;
    divisor.divisorId = null;
    divisor.panelId = null;
    if ($('pantallaCalibracion').style.display !== 'none') {
      setTimeout(function () { ajustarCalAPantalla(); dibujarCal(); }, 20);
    }
    if ($('pantallaMarcado').style.display !== 'none') {
      setTimeout(function () { ajustarMarcAPantalla(); dibujarMarc(); }, 20);
    }
  });
}

function aplicarAnchoPanel(ancho) {
  ['panelCal', 'panelMarc'].forEach(function (id) {
    const p = $(id);
    if (p) p.style.width = ancho + 'px';
  });
}

// ============ Redimensionado de columnas ============
function hacerColumnasRedimensionables(tablaId, storageKey) {
  const tabla = $(tablaId);
  if (!tabla) return;

  const ths = Array.prototype.slice.call(tabla.querySelectorAll('thead th'));
  const n = ths.length;
  if (n === 0) return;

  function minimoDeColumna(indice) {
    if (indice === 0 || indice === n - 1) return ANCHO_COLUMNA_MIN_EXTERNA;
    const anchoTabla = tabla.getBoundingClientRect().width;
    return Math.max(ANCHO_COLUMNA_MIN_EXTERNA,
                    Math.round(anchoTabla * ANCHO_COLUMNA_MIN_RELATIVO));
  }

  let anchosGuardados = null;
  try {
    const s = localStorage.getItem(storageKey);
    if (s) anchosGuardados = JSON.parse(s);
  } catch (e) { anchosGuardados = null; }

  if (anchosGuardados && Array.isArray(anchosGuardados) && anchosGuardados.length === n) {
    ths.forEach(function (th, i) {
      const v = anchosGuardados[i];
      if (typeof v === 'number' && v > 0) {
        th.style.width = v + 'px';
      }
    });
  }

  function leerAnchos() {
    return ths.map(function (th) {
      return Math.round(th.getBoundingClientRect().width);
    });
  }

  function aplicarAnchos(anchos) {
    anchos.forEach(function (a, i) {
      ths[i].style.width = Math.round(a) + 'px';
    });
  }

  function guardarAnchos() {
    const a = leerAnchos();
    try { localStorage.setItem(storageKey, JSON.stringify(a)); } catch (e) {}
  }

  ths.forEach(function (th, indice) {
    if (th.querySelector('.resizerColumna')) return;

    const resizer = document.createElement('div');
    resizer.className = 'resizerColumna';
    resizer.title = 'Arrastrar para redimensionar';
    th.appendChild(resizer);

    resizer.addEventListener('mousedown', function (e) {
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const anchosIni = leerAnchos();

      resizer.classList.add('arrastrando');
      document.body.classList.add('redimensionandoColumna');

      const esUltima = (indice === n - 1);

      function onMove(ev) {
        const dx = ev.clientX - startX;

        if (!esUltima) {
          const a = anchosIni[indice];
          const b = anchosIni[indice + 1];
          const minA = minimoDeColumna(indice);
          const minB = minimoDeColumna(indice + 1);

          const total = a + b;

          let aNuevo = a + dx;
          let bNuevo = total - aNuevo;

          if (aNuevo < minA) { aNuevo = minA; bNuevo = total - aNuevo; }
          if (bNuevo < minB) { bNuevo = minB; aNuevo = total - bNuevo; }

          const nuevos = anchosIni.slice();
          nuevos[indice] = aNuevo;
          nuevos[indice + 1] = bNuevo;
          aplicarAnchos(nuevos);
          return;
        }

        const ultimoIni = anchosIni[n - 1];
        const anterioresIni = anchosIni.slice(0, n - 1);
        const sumaAnteriores = anterioresIni.reduce(function (s, v) { return s + v; }, 0);

        const minUltimo = minimoDeColumna(n - 1);
        const minAnteriores = [];
        for (let i = 0; i < n - 1; i++) minAnteriores.push(minimoDeColumna(i));
        const sumaMinAnteriores = minAnteriores.reduce(function (s, v) { return s + v; }, 0);

        let nuevoUltimo = ultimoIni + dx;
        let nuevaSumaAnteriores = sumaAnteriores - dx;

        if (nuevoUltimo < minUltimo) {
          const ajuste = minUltimo - nuevoUltimo;
          nuevoUltimo = minUltimo;
          nuevaSumaAnteriores -= ajuste;
        }
        if (nuevaSumaAnteriores < sumaMinAnteriores) {
          const ajuste = sumaMinAnteriores - nuevaSumaAnteriores;
          nuevaSumaAnteriores = sumaMinAnteriores;
          nuevoUltimo -= ajuste;
        }

        const nuevasAnteriores = [];
        if (sumaAnteriores > 0) {
          for (let i = 0; i < n - 1; i++) {
            const proporcion = anterioresIni[i] / sumaAnteriores;
            nuevasAnteriores.push(nuevaSumaAnteriores * proporcion);
          }
        } else {
          const igual = nuevaSumaAnteriores / (n - 1);
          for (let i = 0; i < n - 1; i++) nuevasAnteriores.push(igual);
        }

        let deficit = 0;
        for (let i = 0; i < n - 1; i++) {
          if (nuevasAnteriores[i] < minAnteriores[i]) {
            deficit += minAnteriores[i] - nuevasAnteriores[i];
            nuevasAnteriores[i] = minAnteriores[i];
          }
        }
        if (deficit > 0) {
          const conMargen = [];
          for (let i = 0; i < n - 1; i++) {
            const margen = nuevasAnteriores[i] - minAnteriores[i];
            if (margen > 0) conMargen.push(i);
          }
          const sumaMargenes = conMargen.reduce(function (s, i) {
            return s + (nuevasAnteriores[i] - minAnteriores[i]);
          }, 0);
          if (sumaMargenes > 0) {
            conMargen.forEach(function (i) {
              const margen = nuevasAnteriores[i] - minAnteriores[i];
              const recorte = deficit * (margen / sumaMargenes);
              nuevasAnteriores[i] -= recorte;
            });
          } else {
            nuevoUltimo -= deficit;
          }
        }

        const nuevos = nuevasAnteriores.slice();
        nuevos.push(nuevoUltimo);
        aplicarAnchos(nuevos);
      }

      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        resizer.classList.remove('arrastrando');
        document.body.classList.remove('redimensionandoColumna');
        guardarAnchos();
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });
}