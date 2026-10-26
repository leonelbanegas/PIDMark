// ================================================================
// Líneas de proceso - Dibujo de nuevas líneas
// ================================================================
// Modo "dibujando": agregar puntos, terminar, cancelar.
// También el atajo Enter que agrega punto sin finalizar.
//
// NOTA IMPORTANTE: este módulo NO toca marc.cambios. Ese flag es
// exclusivo para marcas (círculos/rectangulares). Los cambios de líneas
// se detectan con lineas.pendientes*. Mezclar ambos flags provocaba
// falsos positivos al reabrir un P&ID ya guardado.
//
// DOBLE CLICK: el navegador dispara, para un doble click:
//   mousedown → mouseup → click → mousedown → mouseup → click → dblclick
// Es decir, DOS mousedown. Cada uno agrega un punto si estamos en
// modo "dibujando". Entonces al llegar el dblclick hay un punto
// "de más" (el del 2do mousedown). La estrategia es:
//   1) agregarPuntoLineaEnCurso SIEMPRE agrega (sin filtro). Así
//      no frenamos clicks legítimos rápidos.
//   2) finalizarLineaPorDobleClick SIEMPRE hace pop() del último
//      punto (el del 2do mousedown del doble) y termina con los
//      anteriores.
//   3) Si después del pop quedan menos de 2 puntos, no se crea la
//      línea (caso "solo doble click": 1 solo punto real).
//
// Además, al terminar se filtran puntos consecutivos duplicados por
// coordenadas redondeadas a 2 decimales, como defensa extra.

function accionNuevaLinea() {
  if (typeof marc !== 'undefined' && marc.soloLectura) {
    mostrarAviso('Listado en modo solo lectura.', true);
    return;
  }
  if (!lineas.cargado) return;

  lineas.modo = 'dibujando';
  lineas.puntosEnCurso = [];
  lineas.puntoMouseActual = null;
  seleccionarLinea(null);

  // Mientras se dibuja, los hipervínculos NO deben capturar el clic: así se
  // puede empezar/continuar una línea justo encima de una zona de link.
  if (typeof setHipervinculosMarcInteractivos === 'function') setHipervinculosMarcInteractivos(false);

  const lienzo = $('lienzoMarc');
  if (lienzo) lienzo.style.cursor = 'crosshair';
  dibujarMarc();

  const btn = $('btnNuevaLinea');
  if (btn) { btn.textContent = 'Terminar línea'; btn.onclick = terminarLineaEnCurso; }
}

// ----------------------------------------------------------------
// Agregar punto (sin filtro: el doble click se maneja al final)
// ----------------------------------------------------------------

function agregarPuntoLineaEnCurso(p) {
  if (!p) return false;
  // Rechazar el punto si cae FUERA del area calibrada (marco del plano).
  // Si el P&ID no tiene calibracion, se usa la imagen completa como area
  // (fallback en puntoDentroAreaCalibrada).
  if (typeof puntoDentroAreaCalibrada === 'function' && !puntoDentroAreaCalibrada(p)) {
    mostrarAviso('El punto de la línea debe estar dentro del área calibrada del plano.', true);
    return false;
  }
  lineas.puntosEnCurso.push({ x: p.x, y: p.y });
  dibujarMarc();
  return true;
}

// ----------------------------------------------------------------
// Terminar línea: filtra puntos duplicados consecutivos
// ----------------------------------------------------------------

function _filtrarPuntosDuplicados(puntos) {
  if (!Array.isArray(puntos) || puntos.length === 0) return [];
  const out = [];
  let ultimo = null;
  for (let i = 0; i < puntos.length; i++) {
    const p = puntos[i];
    const x = Math.round(p.x * 100) / 100;
    const y = Math.round(p.y * 100) / 100;
    if (ultimo && ultimo.x === x && ultimo.y === y) continue;
    out.push({ x: x, y: y });
    ultimo = { x: x, y: y };
  }
  return out;
}

function terminarLineaEnCurso() {
  if (lineas.modo !== 'dibujando') return;

  const puntosLimpios = _filtrarPuntosDuplicados(lineas.puntosEnCurso);

  if (puntosLimpios.length >= 2) {
    const nueva = {
      id: -Date.now(),
      pid_nombre: lineas._pidNombre,
      pid_hoja: lineas._pidHoja,
      pid_revision: lineas._pidRev,
      color_indice: lineas.colorIndice,
      grosor: lineas.grosor,
      opacidad: lineas.opacidad,
      puntos: puntosLimpios,
      nuevo: true
    };
    lineas.delPidActual.push(nueva);
    lineas.pendientesGuardar.push(nueva);

    if (typeof actualizarBotonGuardar === 'function') actualizarBotonGuardar();
    mostrarAviso('Línea agregada. Acordate de Guardar.');
  } else {
    mostrarAviso('La línea necesita al menos 2 puntos distintos.', true);
  }
  cancelarLineaEnCurso();
}

// ----------------------------------------------------------------
// Cierre por DOBLE CLICK
// ----------------------------------------------------------------
// El 2do mousedown del doble click ya agregó un punto "de más".
// Lo descartamos SIEMPRE con pop(), y terminamos con los anteriores.
// Casos:
//   - "Click + doble click": [A, B] → pop → [A] → termina con 1
//     → no crea línea (el usuario quería que B sea el cierre, no
//     un punto extra; pero A y B estaban lejos → son 2 puntos
//     distintos → línea de 2). Ver más abajo.
//   - "Solo doble click": [B] → pop → [] → no crea línea.
//
// OJO: el caso "Click + doble click" da [A] después del pop, que
// NO alcanza. Eso es porque el 2do mousedown del doble agregó B, y
// el 1er mousedown del doble agregó... ¡también B! (son dos
// mousedown en el mismo lugar). Entonces en realidad:
//   "Click + doble click": [A, B, B] → pop → [A, B] → línea de 2 ✅
//   "Solo doble click":    [B, B]    → pop → [B]    → no crea línea
//   "Click A + click B + doble click C":
//                          [A, B, C, C] → pop → [A, B, C] → línea de 3
//
// Esa es la clave: el doble click agrega DOS puntos (uno por cada
// mousedown), y el pop descarta el segundo. Queda UN punto del
// doble click (el del 1er mousedown), que es el que el usuario
// quería como cierre.
function finalizarLineaPorDobleClick() {
  if (lineas.modo !== 'dibujando') return;

  // El doble click agrega DOS puntos (uno por mousedown). Quitamos el
  // ultimo SOLO si es duplicado del anterior: eso indica que el 2do
  // mousedown si agrego el punto "de mas". Si el 2do mousedown no agrego
  // nada (ej. zona donde no se actualizo marc.virtual), NO poppeamos,
  // para no comernos un punto real y dejar la linea con < 2 puntos.
  const pts = lineas.puntosEnCurso;
  if (pts.length >= 2) {
    const a = pts[pts.length - 1];
    const b = pts[pts.length - 2];
    const ax = Math.round(a.x * 100) / 100;
    const ay = Math.round(a.y * 100) / 100;
    const bx = Math.round(b.x * 100) / 100;
    const by = Math.round(b.y * 100) / 100;
    if (ax === bx && ay === by) {
      pts.pop();
    }
  }

  terminarLineaEnCurso();
}

function cancelarLineaEnCurso() {
  lineas.modo = 'inactivo';
  lineas.puntosEnCurso = [];
  lineas.puntoMouseActual = null;
  seleccionarLinea(null);

  // Re-activar los hipervínculos al salir del modo dibujar (terminar o cancelar).
  if (typeof setHipervinculosMarcInteractivos === 'function') setHipervinculosMarcInteractivos(true);

  const lienzo = $('lienzoMarc');
  if (lienzo) lienzo.style.cursor = '';
  const btn = $('btnNuevaLinea');
  if (btn) { btn.textContent = '+ Nueva marcación de línea'; btn.onclick = accionNuevaLinea; }
  dibujarMarc();
}

function marcarLineaModificada(ln) {
  if (ln.nuevo) return;
  if (ln.id && !lineas.pendientesModificar.includes(ln.id)) lineas.pendientesModificar.push(ln.id);
}

// =================================================================
// INTERCEPTAR LA TECLA ENTER DURANTE EL DIBUJO
// =================================================================
window.addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && lineas.modo === 'dibujando') {
    if (lineas.puntoMouseActual) {
      e.preventDefault();
      e.stopPropagation();
      agregarPuntoLineaEnCurso(lineas.puntoMouseActual);
    }
  }
}, true);