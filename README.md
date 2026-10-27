# PID Mark

Aplicación local para consultar planos P&ID y administrar listados, marcadores,
líneas e hipervínculos sobre los planos.

## Requisitos

### Windows

- Windows.
- Node.js 22.13.0 o posterior.
- Google Chrome.

### Ubuntu Server

- Ubuntu Server 22.04 LTS o posterior.
- Node.js 22.13.0 o posterior (incluye `node:sqlite`).
- Google Chrome en los equipos cliente.
- Acceso a la intranet para los usuarios; el servidor no requiere Internet
  durante el uso normal.
- Un proxy inverso HTTPS (por ejemplo Nginx) delante de PID Mark para el
  acceso de otros equipos.

La versión de Windows se mantiene compatible. En sistemas distintos de
Windows, la aplicación usa autenticación por contraseña por defecto y rechaza
el modo `windows`, que no puede identificar de forma segura a cada usuario
remoto.

## Instalación y configuración

1. Instala las dependencias:

   ```powershell
   npm install
   ```

2. Copia `config.example.ini` como `config.ini`.

3. Edita `config.ini` y configura las rutas locales para imágenes, datos,
   backups, logs y base de datos. En modo `windows`, completa también
   `Administracion.AdminUsuarios` con los usuarios administradores autorizados.

4. En modo `password`, crea el primer administrador desde PowerShell:

   ```powershell
   node server.js --crear-admin <usuario> <contraseña>
   ```

   Usa una contraseña de al menos cuatro caracteres y reemplaza los valores
   entre `< >`. Después, inicia la aplicación normalmente.

5. Inicia el servidor:

   ```powershell
   npm start
   ```

El servidor escucha en `http://127.0.0.1:4123` e intenta abrir la aplicación
en Google Chrome.

## Instalación en Ubuntu Server

1. Instala Node.js 22.13.0 o posterior y copia el proyecto a
   `/opt/pid-mark`.
2. Instala las dependencias de producción desde esa carpeta:

   ```bash
   cd /opt/pid-mark
   npm ci --omit=dev
   ```

3. Crea el usuario de servicio `pidmark` y las carpetas persistentes bajo
   `/var/lib/pid-mark`. Asigna esas carpetas al usuario de servicio.
4. Copia `config.ubuntu.example.ini` a `/etc/pid-mark/config.ini`, ajusta sus
   rutas y limita su lectura al usuario de servicio.
5. Crea el administrador inicial con `node server.js --crear-admin <usuario>
   <contraseña>` usando un procedimiento seguro para introducir la contraseña.
   No guardes esa contraseña en scripts o archivos de configuración.
6. Copia `deploy/pid-mark.service` a `/etc/systemd/system/`, revisa usuario,
   rutas y binario Node.js; luego ejecuta:

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now pid-mark
   sudo systemctl status pid-mark
   ```

El servicio escucha por defecto solo en `127.0.0.1:4123` y no intenta abrir
Chrome. Configura Nginx o el proxy corporativo para terminar HTTPS y reenviar
las solicitudes a `http://127.0.0.1:4123`. No expongas directamente el puerto
de PID Mark a la red. Se puede ajustar la dirección y el puerto mediante
`PID_HOST` y `PID_PORT`.

Guarda la base de datos, imágenes, respaldos y logs en almacenamiento local
persistente del servidor. Define y prueba un procedimiento de copia de
seguridad antes de cargar datos reales.

## Planos P&ID

Los planos se guardan en la carpeta configurada como `Rutas.CarpetaImagenes`.
Los archivos PNG deben seguir el formato:

```text
NOMBRE_1de2_RevA.png
```

El nombre debe incluir la hoja (`XdeY`) y la revisión (`Rev` seguida de una
letra o un número). La aplicación también permite cargar archivos PDF desde la
interfaz.

## Datos locales

La base SQLite, los planos, las calibraciones y los backups se gestionan en las
rutas indicadas en `config.ini`. No se incluyen en este repositorio; cada
instalación debe mantener sus propios datos y configurar sus propias rutas.

## Desarrollo

```powershell
npm start
```

El proyecto usa las dependencias fijadas en `package-lock.json`. Los datos y la
configuración local están excluidos mediante `.gitignore`.
