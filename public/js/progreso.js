// ================================================================
// Barra de progreso BLOQUEANTE para exportaciones.
// ================================================================
// Se muestra un overlay centrado que impide interactuar con la app
// mientras se genera el archivo. Uso:
//
//   mostrarProgreso('Generando PDF...');
//   actualizarProgreso(45, 'P&ID 3 de 7');
//   ocultarProgreso();
//
// El porcentaje va de 0 a 100. Si se pasa null, la barra queda en modo
// indeterminado (animacion de barrido).

(function () {
  let _pct = 0;
  let _visible = false;

  function _overlay() {
    return document.getElementById('progresoOverlay');
  }

  function _barra() {
    return document.getElementById('progresoBarra');
  }

  function _texto() {
    return document.getElementById('progresoTexto');
  }

  function _titulo() {
    return document.getElementById('progresoTitulo');
  }

  function mostrarProgreso(titulo) {
    const ov = _overlay();
    if (!ov) return;
    _pct = 0;
    _visible = true;
    const t = _titulo();
    if (t) t.textContent = titulo || 'Procesando...';
    const tx = _texto();
    if (tx) tx.textContent = '';
    const b = _barra();
    if (b) {
      b.style.width = '0%';
      b.classList.remove('indeterminada');
    }
    ov.style.display = 'flex';
    // Bloquear scroll del body mientras esta visible.
    document.body.classList.add('conProgreso');
  }

  function actualizarProgreso(pct, texto) {
    if (!_visible) return;
    const b = _barra();
    const tx = _texto();
    if (tx && texto !== undefined) tx.textContent = texto;

    if (pct === null || pct === undefined) {
      // Modo indeterminado.
      if (b) {
        b.classList.add('indeterminada');
        b.style.width = '35%';
      }
      return;
    }

    // Solo avanza (nunca retrocede visualmente).
    const n = Math.max(0, Math.min(100, Number(pct) || 0));
    if (n > _pct) _pct = n;
    if (b) {
      b.classList.remove('indeterminada');
      b.style.width = _pct + '%';
    }
  }

  function ocultarProgreso() {
    const ov = _overlay();
    _visible = false;
    if (ov) ov.style.display = 'none';
    document.body.classList.remove('conProgreso');
  }

  window.mostrarProgreso = mostrarProgreso;
  window.actualizarProgreso = actualizarProgreso;
  window.ocultarProgreso = ocultarProgreso;
})();
