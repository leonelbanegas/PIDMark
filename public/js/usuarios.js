// ================================================================
// Administración de usuarios (solo admin)
// ================================================================

let usuariosLista = [];
let usuariosFiltro = '';
let usuariosModoAuth = 'windows';

function irAPantallaUsuarios() {
  if (!sesion || !sesion.admin) return;
  mostrarPantallaConFade('pantallaUsuarios', 'block', function () {
    marcarMenuActivo('menuUsuarios');
    cargarUsuariosAdmin();
  });
}

async function cargarUsuariosAdmin() {
  try {
    const r = await fetchAPI('/api/admin/usuarios');
    const d = await r.json();
    if (!r.ok) { mostrarAviso(d.error || 'No se pudieron cargar los usuarios.', true); return; }
    usuariosLista = d.usuarios || [];
    usuariosModoAuth = d.modoAuth || 'windows';

    const aviso = $('avisoModoWindows');
    if (aviso) aviso.style.display = (usuariosModoAuth === 'windows') ? '' : 'none';

    const btnNuevo = $('btnNuevoUsuario');
    if (btnNuevo) btnNuevo.style.display = (usuariosModoAuth === 'password') ? '' : 'none';

    dibujarTablaUsuarios();
  } catch (e) {
    mostrarAviso('Error al cargar usuarios: ' + e.message, true);
  }
}

function dibujarTablaUsuarios() {
  const cuerpo = $('cuerpoUsuarios');
  if (!cuerpo) return;
  cuerpo.innerHTML = '';

  const texto = usuariosFiltro.trim().toLowerCase();
  const filas = usuariosLista.filter(function (u) {
    return texto === '' || String(u.usuario).toLowerCase().indexOf(texto) !== -1;
  });

  if (filas.length === 0) {
    cuerpo.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888;">No hay usuarios para mostrar.</td></tr>';
    return;
  }

  const esPassword = usuariosModoAuth === 'password';
  const yoId = (sesion && sesion.usuarioId) ? sesion.usuarioId : null;

  filas.forEach(function (u, i) {
    const tr = document.createElement('tr');

    const rol = etiquetaRol(u.rol);
    const activo = u.activo ? 'Sí' : 'No';
    const creado = u.creado ? String(u.creado).replace('T', ' ').slice(0, 16) : '';

    let acciones = '<button class="btnMenu" data-accion="menu_usuario" data-id="' + u.id + '">⋮</button>';

    tr.innerHTML =
      '<td>' + (i + 1) + '</td>' +
      '<td>' + escaparHTML(u.usuario) + '</td>' +
      '<td>' + claseEtiquetaRol(u.rol) + '</td>' +
      '<td>' + (u.activo ? 'Sí' : '<span style="color:#e07070;">No</span>') + '</td>' +
      '<td style="text-align:center;">' + (u.cantidadListados || 0) + '</td>' +
      '<td>' + escaparHTML(creado) + '</td>' +
      '<td class="celdaAccionesCentrada">' + acciones + '</td>';

    cuerpo.appendChild(tr);
    void esPassword; void yoId; void rol; void activo;
  });
}

// Devuelve el texto visible del rol con las mayúsculas pedidas:
// Admin / SuperUsuario / Usuario.
function etiquetaRol(rol) {
  if (rol === 'admin') return 'Admin';
  if (rol === 'superusuario') return 'SuperUsuario';
  return 'Usuario';
}

// Devuelve el HTML de la etiqueta del rol con estilo propio.
function claseEtiquetaRol(rol) {
  if (rol === 'admin') return '<span class="etiqueta etiquetaPropia">Admin</span>';
  if (rol === 'superusuario') return '<span class="etiqueta etiquetaSuperUsuario">SuperUsuario</span>';
  return '<span class="etiqueta">Usuario</span>';
}

function opcionesMenuUsuario(u) {
  const esPassword = usuariosModoAuth === 'password';
  const yoId = (sesion && sesion.usuarioId) ? sesion.usuarioId : null;
  const esYo = (yoId !== null && u.id === yoId);

  const ops = [];

  if (esPassword) {
    ops.push({
      texto: 'Hacer Admin',
      deshabilitada: u.rol === 'admin',
      accion: function () { cambiarRolUsuario(u, 'admin'); }
    });
    ops.push({
      texto: 'Hacer SuperUsuario',
      deshabilitada: u.rol === 'superusuario',
      accion: function () { cambiarRolUsuario(u, 'superusuario'); }
    });
    ops.push({
      texto: 'Hacer Usuario',
      deshabilitada: u.rol === 'usuario',
      accion: function () { cambiarRolUsuario(u, 'usuario'); }
    });
    ops.push({
      texto: u.activo ? 'Desactivar' : 'Activar',
      deshabilitada: esYo,
      accion: function () { cambiarActivoUsuario(u, !u.activo); }
    });
    ops.push({ separador: true });
    ops.push({
      texto: 'Blanquear contraseña',
      accion: function () { blanquearPasswordUsuario(u); }
    });
    ops.push({ separador: true });
    ops.push({
      texto: 'Eliminar usuario',
      peligro: true,
      deshabilitada: esYo,
      accion: function () { eliminarUsuario(u); }
    });
  } else {
    ops.push({ texto: 'Solo lectura (modo windows)', deshabilitada: true });
  }

  return ops;
}

async function cambiarRolUsuario(u, nuevoRol) {
  try {
    const r = await fetchAPI('/api/admin/usuarios/' + u.id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rol: nuevoRol })
    });
    const d = await r.json().catch(function () { return {}; });
    if (!r.ok) { mostrarAviso(d.error || 'No se pudo cambiar el rol.', true); return; }
    mostrarAviso('Rol actualizado.');
    cargarUsuariosAdmin();
  } catch (e) {
    mostrarAviso('Error: ' + e.message, true);
  }
}

async function cambiarActivoUsuario(u, activar) {
  try {
    const r = await fetchAPI('/api/admin/usuarios/' + u.id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: activar })
    });
    const d = await r.json().catch(function () { return {}; });
    if (!r.ok) { mostrarAviso(d.error || 'No se pudo cambiar el estado.', true); return; }
    mostrarAviso(activar ? 'Usuario activado.' : 'Usuario desactivado.');
    cargarUsuariosAdmin();
  } catch (e) {
    mostrarAviso('Error: ' + e.message, true);
  }
}

function blanquearPasswordUsuario(u) {
  abrirModal('Blanquear contraseña',
    '<p style="margin-top:0;">Se generará una contraseña temporal para <strong>' + escaparHTML(u.usuario) + '</strong>.</p>' +
    '<p style="color:#888;font-size:12px;">El usuario deberá cambiarla al iniciar sesión. Se cerrarán sus sesiones activas.</p>',
    async function () {
      try {
        const r = await fetchAPI('/api/admin/usuarios/' + u.id + '/blanquear', { method: 'POST' });
        const d = await r.json().catch(function () { return {}; });
        if (!r.ok) { mostrarAviso(d.error || 'No se pudo blanquear.', true); return false; }

        abrirModal('Contraseña temporal',
          '<p style="margin-top:0;">Contraseña temporal para <strong>' + escaparHTML(d.usuario) + '</strong>:</p>' +
          '<p style="font-size:20px;font-weight:700;text-align:center;background:#121212;padding:10px;border-radius:6px;letter-spacing:1px;">' + escaparHTML(d.passwordTemporal) + '</p>' +
          '<p style="color:#888;font-size:12px;">Anotála y pasásela al usuario. No se volverá a mostrar.</p>',
          function () { cargarUsuariosAdmin(); },
          { textoAceptar: 'Entendido', sinCancelar: true }
        );
        return false;
      } catch (e) {
        mostrarAviso('Error: ' + e.message, true);
        return false;
      }
    },
    { textoAceptar: 'Blanquear' }
  );
}

function eliminarUsuario(u) {
  abrirModal('Eliminar usuario',
    '<p style="margin-top:0;">¿Seguro que querés eliminar a <strong>' + escaparHTML(u.usuario) + '</strong>?</p>' +
    (u.cantidadListados > 0
      ? '<p style="color:#e07070;font-size:12px;">Tiene ' + u.cantidadListados + ' listado(s); no se podrá eliminar hasta reasignarlos.</p>'
      : '<p style="color:#888;font-size:12px;">Esta acción no se puede deshacer.</p>'),
    async function () {
      try {
        const r = await fetchAPI('/api/admin/usuarios/' + u.id, { method: 'DELETE' });
        const d = await r.json().catch(function () { return {}; });
        if (!r.ok) { mostrarAviso(d.error || 'No se pudo eliminar.', true); return false; }
        mostrarAviso('Usuario eliminado.');
        cargarUsuariosAdmin();
        return true;
      } catch (e) {
        mostrarAviso('Error: ' + e.message, true);
        return false;
      }
    },
    { textoAceptar: 'Eliminar' }
  );
}

function abrirModalNuevoUsuario() {
  if (usuariosModoAuth !== 'password') return;

  const html =
    '<label>Usuario:' +
    '<input type="text" id="inpNuevoUsuarioNombre" autocomplete="off"></label>' +
    '<label>Clave (opcional, mínimo 6):' +
    '<input type="text" id="inpNuevoUsuarioPass" autocomplete="off" placeholder="Si la dejás vacía, la define el usuario al entrar"></label>' +
    '<div id="errNuevoUsuario" style="color:#e07070;font-size:12px;min-height:14px;"></div>';

  abrirModal('Nuevo usuario', html, async function () {
    const err = $('errNuevoUsuario');
    if (err) err.textContent = '';
    const usuario = $('inpNuevoUsuarioNombre').value.trim();
    const password = $('inpNuevoUsuarioPass').value;
    // Todo usuario nuevo se crea con rol 'usuario'. Para ascenderlo se usa
    // el menu de la fila (Hacer SuperUsuario / Hacer Admin).
    const rolSel = 'usuario';

    if (!usuario) { if (err) err.textContent = 'Falta el nombre de usuario.'; return false; }
    // La clave es opcional: si se deja vacia, el usuario la define al entrar.
    if (password && password.length < 6) { if (err) err.textContent = 'La clave debe tener al menos 6 caracteres.'; return false; }

    try {
      const r = await fetchAPI('/api/admin/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: usuario, password: password, rol: rolSel })
      });
      const d = await r.json().catch(function () { return {}; });
      if (!r.ok) { if (err) err.textContent = d.error || 'No se pudo crear.'; return false; }
      mostrarAviso(password
        ? 'Usuario creado. Deberá cambiar la contraseña al entrar.'
        : 'Usuario creado sin clave. La definirá la primera vez que ingrese.');
      cargarUsuariosAdmin();
      return true;
    } catch (e) {
      if (err) err.textContent = 'Error: ' + e.message;
      return false;
    }
  }, { textoAceptar: 'Crear' });
}

function engancharEventosUsuarios() {
  const menu = $('menuUsuarios');
  if (menu && !menu._usuariosEnganchado) {
    menu._usuariosEnganchado = true;
    menu.onclick = irAPantallaUsuarios;
  }

  const btnNuevo = $('btnNuevoUsuario');
  if (btnNuevo && !btnNuevo._usuariosEnganchado) {
    btnNuevo._usuariosEnganchado = true;
    btnNuevo.onclick = abrirModalNuevoUsuario;
  }

  const buscar = $('buscarUsuario');
  if (buscar && !buscar._usuariosEnganchado) {
    buscar._usuariosEnganchado = true;
    buscar.oninput = function (e) {
      usuariosFiltro = e.target.value || '';
      dibujarTablaUsuarios();
    };
    if (typeof engancharBuscador === 'function') engancharBuscador('buscarUsuario');
  }

  const cuerpo = $('cuerpoUsuarios');
  if (cuerpo && !cuerpo._usuariosEnganchado) {
    cuerpo._usuariosEnganchado = true;
    cuerpo.addEventListener('click', function (e) {
      const btn = e.target.closest('button[data-accion="menu_usuario"]');
      if (!btn) return;
      const id = parseInt(btn.getAttribute('data-id'), 10);
      const u = usuariosLista.find(function (x) { return x.id === id; });
      if (!u) return;
      abrirMenuDesdeBoton(btn, opcionesMenuUsuario(u));
    });
  }
}
