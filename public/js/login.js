// ================================================================
// Pantalla de login
// ================================================================
// Dos pasos:
//   1) usuario + contrasena (lo normal).
//   2) si el backend responde { sinPassword: true } (usuario recien creado
//      por el admin, SIN clave asignada), se muestra un formulario para que
//      el usuario cree su clave. Al crearla queda logueado.

(function () {
  // Tema (mismo criterio que app.js)
  try {
    if (localStorage.getItem('tema') === 'claro') document.body.classList.add('temaClaro');
  } catch (e) {}

  const form = document.getElementById('formLogin');
  const inpUsuario = document.getElementById('inpUsuario');
  const inpPassword = document.getElementById('inpPassword');
  const btn = document.getElementById('btnIngresar');
  const err = document.getElementById('loginError');

  const titulo = document.getElementById('loginTitulo');
  const bloqueLogin = document.getElementById('bloqueLogin');
  const bloqueCrear = document.getElementById('bloqueCrearClave');
  const txtCrearUsuario = document.getElementById('txtCrearClaveUsuario');
  const inpClaveNueva = document.getElementById('inpClaveNueva');
  const inpClaveNueva2 = document.getElementById('inpClaveNueva2');
  const btnCrearClave = document.getElementById('btnCrearClave');
  const btnVolverLogin = document.getElementById('btnVolverLogin');

  // Guarda: si falta el form (HTML cambiado), no rompemos el script.
  if (!form || !inpUsuario || !inpPassword || !btn) return;

  // Usuario pendiente de crear su clave (paso 2).
  let usuarioPendiente = '';

  const LARGO_MIN_CLAVE = 6;

  function mostrarError(msg) {
    if (err) err.textContent = msg || '';
  }

  function irAlLogin() {
    usuarioPendiente = '';
    if (bloqueCrear) bloqueCrear.style.display = 'none';
    if (bloqueLogin) bloqueLogin.style.display = '';
    if (titulo) titulo.textContent = 'Iniciar sesión';
    if (inpClaveNueva) inpClaveNueva.value = '';
    if (inpClaveNueva2) inpClaveNueva2.value = '';
    mostrarError('');
  }

  function irACrearClave(usuario) {
    usuarioPendiente = usuario;
    if (bloqueLogin) bloqueLogin.style.display = 'none';
    if (bloqueCrear) bloqueCrear.style.display = '';
    if (titulo) titulo.textContent = 'Crear contraseña';
    if (txtCrearUsuario) txtCrearUsuario.textContent = usuario;
    mostrarError('');
    if (inpClaveNueva) setTimeout(function () { inpClaveNueva.focus(); }, 50);
  }

  // Si ya hay sesión válida, ir directo a la app.
  fetch('/api/sesion', { credentials: 'same-origin' })
    .then(function (r) { return r.json().catch(function () { return {}; }); })
    .then(function (d) {
      if (d && d.modoAuth === 'password' && d.autenticado) {
        window.location.href = '/';
      } else if (d && d.modoAuth === 'windows') {
        // En modo windows no hay login: la app se abre directamente.
        window.location.href = '/';
      }
    })
    .catch(function () {});

  // ---- PASO 1: login normal ----
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    // Si estamos en el paso 2, Enter no debe disparar el login.
    if (bloqueCrear && bloqueCrear.style.display !== 'none') return;

    mostrarError('');
    const usuario = inpUsuario.value.trim();
    const password = inpPassword.value;
    // Solo el usuario es obligatorio: un usuario SIN clave asignada puede
    // entrar con la contrasena vacia y despues define la suya (paso 2).
    if (!usuario) {
      mostrarError('Completá el usuario.');
      return;
    }

    btn.disabled = true;
    fetch('/api/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: usuario, password: password })
    })
      .then(function (r) {
        return r.json().then(function (d) { return { ok: r.ok, status: r.status, data: d }; });
      })
      .then(function (res) {
        if (!res.ok) {
          mostrarError((res.data && res.data.error) || 'No se pudo iniciar sesión.');
          btn.disabled = false;
          return;
        }
        // Usuario SIN clave: pasar al paso 2.
        if (res.data && res.data.sinPassword) {
          btn.disabled = false;
          irACrearClave(res.data.usuario || usuario);
          return;
        }
        window.location.href = '/';
      })
      .catch(function (e2) {
        mostrarError('Error de conexión: ' + e2.message);
        btn.disabled = false;
      });
  });

  // ---- PASO 2: crear la clave ----
  function crearClave() {
    mostrarError('');
    const clave = inpClaveNueva ? inpClaveNueva.value : '';
    const clave2 = inpClaveNueva2 ? inpClaveNueva2.value : '';

    if (!usuarioPendiente) { irAlLogin(); return; }
    if (!clave || clave.length < LARGO_MIN_CLAVE) {
      mostrarError('La clave debe tener al menos ' + LARGO_MIN_CLAVE + ' caracteres.');
      return;
    }
    if (clave !== clave2) {
      mostrarError('Las claves no coinciden.');
      return;
    }

    btnCrearClave.disabled = true;
    fetch('/api/definir-password', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: usuarioPendiente, password: clave })
    })
      .then(function (r) {
        return r.json().then(function (d) { return { ok: r.ok, status: r.status, data: d }; });
      })
      .then(function (res) {
        if (!res.ok) {
          mostrarError((res.data && res.data.error) || 'No se pudo crear la clave.');
          btnCrearClave.disabled = false;
          return;
        }
        // Clave creada + sesión iniciada -> entrar a la app.
        window.location.href = '/';
      })
      .catch(function (e2) {
        mostrarError('Error de conexión: ' + e2.message);
        btnCrearClave.disabled = false;
      });
  }

  if (btnCrearClave) btnCrearClave.addEventListener('click', crearClave);
  if (btnVolverLogin) btnVolverLogin.addEventListener('click', irAlLogin);

  // Enter dentro de los campos de la clave nueva dispara "crear".
  [inpClaveNueva, inpClaveNueva2].forEach(function (inp) {
    if (!inp) return;
    inp.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      crearClave();
    });
  });
})();
