# FIREGUARD Cochabamba

Prototipo web adaptable para explorar detecciones históricas de focos de calor MODIS y VIIRS S-NPP. La app muestra resultados solo cuando el JSON se genera con datos de origen y cobertura mensual auditada. El estado inicial es deliberadamente “pendiente de datos”; no contiene resultados sintéticos. El mapa y el calendario son de consulta pública. Los reportes e incidentes requieren Firebase configurado.

La ruta `/` presenta la portada pública; `/overview` conserva el inicio interno de la plataforma. Los visitantes pueden abrir el mapa y el calendario sin iniciar sesión, mientras que los reportes y módulos operativos mantienen sus controles de acceso.

## Requisitos

- Node.js compatible con Expo SDK 58.
- Python 3.10+ y pip para el procesamiento.
- Python 3.10+ y pip para el procesamiento; los CSV históricos recibidos se guardan bajo `analysis/data/raw/`.

## Instalación y ejecución web

En PowerShell:

```powershell
   cd mobile
   npm ci
   npm run web
```

La aplicación de desarrollo queda disponible en la URL que informa Expo. Para compilar y probar la versión estática:

```powershell
npx expo export --platform web
npx expo serve
```

El export queda en `mobile/dist/`. La carpeta `mobile/public/` se copia al export, incluido `public/data/fire-calendar.json`.

## Firebase y emuladores

1. Registrar una aplicación web en Firebase y copiar `mobile/.env.example` a `mobile/.env`. Completar `EXPO_PUBLIC_FIREBASE_API_KEY`, `AUTH_DOMAIN`, `PROJECT_ID`, `STORAGE_BUCKET`, `MESSAGING_SENDER_ID` y `APP_ID` con la configuración pública del SDK web. No son credenciales administrativas. Nunca agregues claves de Admin SDK, contraseñas ni `MAP_KEY` a variables `EXPO_PUBLIC_*`.
2. Habilitar **Correo electrónico/contraseña** en Firebase Authentication. Es el proveedor utilizado por el registro, el inicio de sesión y la recuperación de contraseña.
3. Desde `backend/functions`, instalar dependencias e iniciar Auth, Firestore, Functions y Storage Emulator:

   ```powershell
   npm ci
   npx firebase-tools emulators:start --config ..\..\firebase.json --project demo-fireguard
   ```

   Mantener `EXPO_PUBLIC_FIREBASE_USE_EMULATORS=true` y `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=127.0.0.1`, e iniciar el frontend en otra terminal (`cd mobile; npm run web`). En dispositivos físicos, configurar el host del emulador con la IP del equipo. El export estático no inicia ni verifica los emuladores.
4. Las reglas están en `firestore.rules` y `storage.rules`; índices, emuladores y Functions se configuran desde `firebase.json`. En otra terminal, desde `backend/functions`, ejecutar `npm run build`, `npm run test:rules` y `npm run test:operations`.
5. Para preparar el primer superadministrador, crear primero su cuenta desde la app y obtener su UID. Usar una sesión local confiable de Google Application Default Credentials o `GOOGLE_APPLICATION_CREDENTIALS` apuntando a un archivo fuera del repositorio. Ejecutar primero el modo de inspección:

   ```powershell
   npm run bootstrap:admin -- --project <project-id> --uid <auth-uid>
   ```

   Solo después de comprobar el proyecto y la cuenta, ejecutar con `--apply --confirm-production`. El script rechaza el bootstrap si ya detecta un administrador técnico, crea un registro de ejecución y no establece contraseñas. No existe una ruta pública de elevación.

6. El cliente crea `access/{uid}` como ciudadano únicamente mediante una callable autenticada, idempotente y que no altera accesos existentes. Los perfiles contienen exactamente `displayName`, `phone`, `createdAt` y `updatedAt`; las cuentas operativas se autorizan desde Functions.

Sin variables válidas, la interfaz indica que Firebase no está configurado. No se guardan reportes localmente ni se confirma su recepción. Los emuladores verifican reglas y operaciones sin escribir en producción; no equivalen a pruebas contra el proyecto Firebase real.

### Migrar datos del esquema anterior

El repositorio contiene código y fixtures del esquema anterior (`ownerUid`, campos adicionales en `users`, fotos bajo `report-images/`), pero no incluye una exportación de datos de producción. Antes de migrar un proyecto, ejecutar el inventario en modo dry-run y revisar cada fallo:

```powershell
Set-Location backend\functions
$env:FIREBASE_PROJECT_ID = "<project-id>"
$env:FIREBASE_STORAGE_BUCKET = "<bucket-del-proyecto>"
npm run migrate:legacy -- --project $env:FIREBASE_PROJECT_ID
```

El script requiere credenciales Admin locales para consultar Firestore y Storage. Con `--apply`, guarda el documento completo anterior en `migrationArchive/legacy-v1`, normaliza reportes/perfiles y copia fotos a `reportPhotos/{uid}/{reportId}/original`; nunca elimina el documento archivado ni la foto de origen. La escritura a un proyecto real requiere además `--confirm-production`. La migración no crea ni amplía `access/{uid}`: tras revisar el inventario, las cuentas deberán activarse mediante el flujo administrativo. Ejecuta primero sobre una copia o emulador y conserva el resultado del dry-run.

Si una subida de foto termina pero la creación del reporte falla, conserva la misma clave de reporte y reintenta: el cliente reutiliza la foto privada ya subida y la callable es idempotente. Para limpiar solo objetos huérfanos con más de siete días, inspecciona primero y revisa la lista de rutas:

```powershell
npm run cleanup:orphan-photos -- --project <project-id>
```

La eliminación requiere `--apply` (y `--confirm-production` en un proyecto real). El script no elimina archivos recientes ni fotos cuyo reporte exista, y no borra el origen de una migración.

## Roles y flujo operativo

- Visitante: mapa y calendario públicos.
- Ciudadano: crea reportes con correo y contraseña, fotografía, ubicación aproximada del posible incendio y hora observada; puede consultar su historial y eventos.
- Bombero: consulta incidentes asignados, registra observaciones/avances y cambia disponibilidad.
- Encargado: evalúa reportes, asigna brigadas e integrantes disponibles y supervisa su área.
- Mando operativo: revisa, asigna y dirige incidentes de sus áreas; las transferencias registran autor y motivo.
- Administrador técnico: activa cuentas operativas autorizadas y administra permisos técnicos. No adquiere mando automáticamente.

El backend valida cada operación callable y las reglas de Firestore/Storage bloquean escrituras directas desde el cliente. Las bandejas operativas se consultan mediante endpoints autorizados con paginación; la bitácora usa `incidents/{incidentId}/logs` y exige acceso activo. Las fotografías ciudadanas no tienen URLs públicas y solo su propietaria puede leerlas directamente. La asignación no significa desplazamiento; cada transición se registra aparte.

La callable de fotografía emite URLs firmadas válidas por cinco minutos para personal autorizado. Storage Emulator no puede firmarlas sin credenciales de firma, así que las pruebas locales verifican el rechazo de acceso no autorizado, no la emisión de una URL válida. Antes de habilitar esta función en un proyecto real, configura el permiso de firma del servicio de Functions y comprueba la callable en ese proyecto; no se ha probado ni desplegado en producción.

La primera versión implementa una brigada e integrante asignados por operación. La administración CRUD de organizaciones/brigadas, la gestión completa de invitaciones, las notificaciones push y el despliegue de datos satelitales a Firestore aún requieren configuración y/o implementación adicional; no se habilitan lecturas generales para suplirlas.

## Preparar los datos reales

Ejecuta los comandos de esta sección desde la raíz del repositorio:

1. Consultar [docs/data-sources.md](../docs/data-sources.md). Hay extractos FIRMS Archive adjuntos y NRT separados; no certifican cobertura completa. Las copias de trabajo están en `analysis/data/raw/` y esa carpeta está ignorada por Git.
2. Para otras descargas, guardar los CSV separados por sensor en `analysis/data/raw/`; no subir las fuentes al repositorio.
3. Crear o actualizar el manifiesto mensual y verificar productos y metadatos recibidos:

   ```powershell
   python analysis\src\process_data.py --create-coverage-template analysis\data\raw\coverage.csv
   ```

   El manifiesto tiene 96 filas. Confirmar producto/versión/satélite/fecha y el nombre del archivo fuente; cambiar `complete` a `true` solo para los meses con cobertura completa verificada. La solicitud de 2023 termina el 1 de diciembre: dejar diciembre incompleto hasta que se confirme y reciba el complemento al 31 de diciembre. Entonces marcar `december_2023_supplement_confirmed=true` en ambas filas de diciembre antes de marcarlo completo. Un mes sin detecciones solo será cero si consta como completo.
4. Generar los resultados estáticos desde la raíz para los extractos adjuntos:

   ```powershell
   python analysis\src\process_data.py `
     --modis-csv analysis\data\raw\fire_archive_M-C61_849210.csv `
     --viirs-csv analysis\data\raw\fire_archive_SV-C2_849212.csv `
     --coverage-csv analysis\data\coverage_attached.csv
   ```

   El manifiesto de estos extractos deja todos los meses incompletos. Se muestran conteos observados por sensor y puntos originales, pero no se calcula ni presenta una serie armonizada sin cobertura coincidente confirmada. Los archivos NRT quedan separados y no participan en el análisis histórico. El JSON se escribe en `mobile/public/data/fire-calendar.json` y las capas originales en `mobile/public/data/detections/`.

   La aplicación sirve estos archivos estáticos cuando no hay calendario publicado en Firebase; no hace falta configurar ni desplegar Firebase para verlos. Ejecutar localmente con `Set-Location mobile; npm run web`.

   Para procesar otras descargas completas, repetir cada opción del sensor solo para los archivos existentes y verificar los metadatos antes de completar meses. No convertir conteos observados en cobertura certificada.
5. Si se configura Firebase, revisar primero la importación sin escrituras. Para aplicar el resultado solo al emulador:

   ```powershell
   npx firebase-tools emulators:exec --config ..\..\firebase.json --project demo-fireguard --only firestore "node scripts/import-satellite-results.mjs --project demo-fireguard"
   npx firebase-tools emulators:exec --config ..\..\firebase.json --project demo-fireguard --only firestore "node scripts/import-satellite-results.mjs --project demo-fireguard --apply"
   ```

   El importador genera IDs SHA-256 estables para las detecciones, escribe agregados mensuales y cobertura, y registra el mismo identificador en `satelliteImports` y `harmonizationRuns`. Las consultas públicas del mapa se limitan a un mes y una versión de importación, paginadas en lotes de hasta 500. Los registros de importaciones anteriores no se eliminan. Para producción, configurar las credenciales Admin localmente, repetir el dry-run con el ID real y, solo tras revisarlo, ejecutar con `--apply --confirm-production`. Un estado pendiente no crea conteos ni detecciones ficticias.

## Verificación

Desde la raíz del repositorio:

```powershell
python -m unittest discover -s analysis/tests
```

Desde `mobile/`:

```powershell
npx tsc --noEmit
npx expo export --platform web
```

## Publicación

Publicar `mobile/dist/` en un hosting estático. Para habilitar operaciones, desplegar las reglas de Firebase y las Functions desde la raíz con Firebase CLI y configurar las variables públicas de la app en el hosting. El mapa/calendario puede publicarse sin backend; autenticación, reportes y operaciones no estarán disponibles hasta configurar Firebase. Para publicar actualizaciones satelitales, regenerar el JSON y volver a compilar. Nunca publicar credenciales administrativas o `MAP_KEY`.

## Interpretación

Consulta [la documentación de fuentes](../docs/data-sources.md) y del [método y validación](../docs/harmonization-method.md). Un foco satelital no equivale a un incendio independiente ni a superficie quemada. La armonización es exploratoria, no elimina todas las diferencias de observación y no predice riesgo.
