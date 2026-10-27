// ================================================================
// Menú lateral deslizante
// ================================================================
// - Por defecto la barra está colapsada (fuera de pantalla).
// - Al pasar el mouse por la franja izquierda (zonaHoverMenu) se abre.
// - Al salir el mouse de la barra se cierra (con un pequeño retardo para
//   evitar parpadeos al cruzar el borde).
// - El botón hamburguesa fijo abre/cierra manualmente. Si se abre con el
//   botón, el hover no la cierra hasta que el mouse salga después de
//   haber entrado. Para simplificar, el hover siempre abre y el
//   mouseleave siempre cierra; el botón sirve como atajo para abrir
//   (y para cerrar si ya está abierta).

function inicializarMenuLateral() {
  const barra = document.getElementById('barraLateral');
  const zona = document.getElementById('zonaHoverMenu');
  const btn = document.getElementById('btnHamburguesa');
  if (!barra || !zona) return;

  let temporizadorCierre = null;
  // Mientras el usuario interactua con el desplegable de usuario, el hover
  // no debe cerrar la barra (el select nativo puede sacar el puntero).
  let manteniendoAbierto = false;

  function abrir() {
    if (temporizadorCierre) {
      clearTimeout(temporizadorCierre);
      temporizadorCierre = null;
    }
    barra.classList.add('abierta');
    document.body.classList.add('menuAbierto');
  }

  function cerrarInmediato() {
    if (temporizadorCierre) {
      clearTimeout(temporizadorCierre);
      temporizadorCierre = null;
    }
    barra.classList.remove('abierta');
    document.body.classList.remove('menuAbierto');
  }

  function programarCierre() {
    if (manteniendoAbierto) return;
    if (temporizadorCierre) clearTimeout(temporizadorCierre);
    temporizadorCierre = setTimeout(function () {
      barra.classList.remove('abierta');
      document.body.classList.remove('menuAbierto');
      temporizadorCierre = null;
    }, 150);
  }

  // Hover sobre la franja izquierda: abrir.
  zona.addEventListener('mouseenter', abrir);

  // Hover dentro de la barra: mantener abierta (cancelar cierre pendiente).
  barra.addEventListener('mouseenter', abrir);

  // Salir de la barra: cerrar con retardo.
  barra.addEventListener('mouseleave', programarCierre);

  // Botón hamburguesa: toggle.
  if (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (barra.classList.contains('abierta')) cerrarInmediato();
      else abrir();
    });
  }

  // Click en una opcion del menu: navegar y cerrar la barra.
  barra.addEventListener('click', function (e) {
    const opcion = e.target.closest('.menuItem');
    if (!opcion) return;
    cerrarInmediato();
  });

  // Escape: cerrar.
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && barra.classList.contains('abierta')) {
      cerrarInmediato();
    }
  });
}

document.addEventListener('DOMContentLoaded', inicializarMenuLateral);
