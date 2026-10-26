# PID Mark

Aplicación local para consultar planos P&ID y administrar listados, marcadores,
líneas e hipervínculos sobre los planos.

## Requisitos

- Windows.
- Node.js 22.13.0 o posterior.
- Google Chrome.

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
