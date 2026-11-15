# FIREGUARD Cochabamba

Prototipo web adaptable para explorar detecciones históricas de focos de calor MODIS y VIIRS S-NPP. La app muestra resultados solo cuando el JSON se genera con datos de origen y cobertura mensual auditada. El estado inicial es deliberadamente “pendiente de datos”; no contiene resultados sintéticos. El mapa y el calendario son de consulta pública. Los reportes e incidentes requieren Firebase configurado.

## Requisitos

- Node.js compatible con Expo SDK 58.
- Python 3.10+ y pip para el procesamiento.
- CSV históricos de FIRMS cuando estén disponibles. Las solicitudes actuales son para 2020–2023; aún no se han recibido archivos.

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

1. Copiar `mobile/.env.example` como `mobile/.env` y completar las variables `EXPO_PUBLIC_FIREBASE_*` con la aplicación web del proyecto Firebase. No incluir claves administrativas, contraseñas ni `MAP_KEY` en estas variables.
2. Desde la raíz, iniciar Auth, Firestore, Functions y Storage Emulator:

   ```powershell
   npx firebase-tools emulators:start --config ..\..\firebase.json --project demo-fireguard
   ```

   Asegurarse de que `EXPO_PUBLIC_FIREBASE_USE_EMULATORS=true` y `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=127.0.0.1`, y ejecutar la app en otra terminal. El export estático no inicia ni verifica los emuladores.
3. Las reglas están en `firestore.rules` y `storage.rules`; Functions y configuración de puertos están en `firebase.json`. Las funciones se compilan desde `backend/functions` con `npm install` y `npm run build`.
4. Desde `backend/functions`, ejecutar `npm run test:rules` para las reglas y `npm run build` seguido de `npm run test:operations` para el flujo Auth → reporte → evaluación → asignación → intervención/cierre. Requiere Firebase Emulator Suite disponible; no son pruebas contra el proyecto real.
5. El primer administrador técnico debe habilitarse mediante un proceso de bootstrap seguro con Firebase Admin SDK fuera del cliente. Luego puede activar cuentas operativas desde Administración. No hay credenciales de Firebase ni privilegios presembrados en este repositorio.

Sin variables válidas, la interfaz indica que Firebase no está configurado. No se guardan reportes localmente ni se confirma su recepción. Las pruebas con emulador no equivalen a pruebas en el proyecto Firebase real.

## Roles y flujo operativo

- Visitante: mapa y calendario públicos.
- Ciudadano: crea reportes con correo y contraseña, fotografía, ubicación aproximada del posible incendio y hora observada; puede consultar su historial y eventos.
- Bombero: consulta incidentes asignados, registra observaciones/avances y cambia disponibilidad.
- Encargado: evalúa reportes, asigna brigadas e integrantes disponibles y supervisa su área.
- Mando operativo: revisa, asigna y dirige incidentes de sus áreas; las transferencias registran autor y motivo.
- Administrador técnico: activa cuentas operativas autorizadas y administra permisos técnicos. No adquiere mando automáticamente.

El backend valida cada operación callable y las reglas de Firestore/Storage bloquean escrituras directas desde el cliente. Los incidentes y eventos operativos solo son visibles para ciudadanía vinculada y personal autorizado. La asignación no significa desplazamiento; cada transición se registra aparte. La UI permite crear un incidente desde una evaluación y vincular otros reportes a incidentes abiertos.

La primera versión implementa una brigada e integrante asignados por operación. La asignación simultánea de varias brigadas, la administración CRUD de organizaciones/brigadas y las notificaciones push quedan pendientes. El backend admite activar cuentas contra brigadas previamente configuradas y actualizar disponibilidad; todavía no crea ni edita organizaciones, brigadas o sus integrantes.

## Preparar los datos reales

Ejecuta los comandos de esta sección desde la raíz del repositorio:

1. Consultar [docs/data-sources.md](../docs/data-sources.md). Las solicitudes para Bolivia en formato CSV (MODIS Collection 6.1 y Suomi-NPP VIIRS Collection 2, 2020–2023) fueron confirmadas el 14 de noviembre de 2026 y siguen pendientes de procesamiento y descarga.
2. Guardar los CSV separados por año y sensor en `analysis/data/raw/`, por ejemplo `modis_2020.csv` y `viirs_s_npp_2020.csv`. No subirlos al repositorio.
3. Crear el manifiesto mensual y verificar productos y metadatos recibidos:

   ```powershell
   python analysis\src\process_data.py --create-coverage-template analysis\data\raw\coverage.csv
   ```

   El manifiesto tiene 96 filas. Confirmar producto/versión/satélite/fecha y el nombre del archivo fuente; cambiar `complete` a `true` solo para los meses con cobertura completa verificada. La solicitud de 2023 termina el 1 de diciembre: dejar diciembre incompleto hasta que se confirme y reciba el complemento al 31 de diciembre. Entonces marcar `december_2023_supplement_confirmed=true` en ambas filas de diciembre antes de marcarlo completo. Un mes sin detecciones solo será cero si consta como completo.
4. Instalar la dependencia de procesamiento y generar el resultado web:

   ```powershell
   python -m pip install -r analysis\requirements.txt
   python analysis\src\process_data.py `
     --modis-csv analysis\data\raw\modis_2020.csv `
     --modis-csv analysis\data\raw\modis_2021.csv `
     --modis-csv analysis\data\raw\modis_2022.csv `
     --modis-csv analysis\data\raw\modis_2023.csv `
     --viirs-csv analysis\data\raw\viirs_s_npp_2020.csv `
     --viirs-csv analysis\data\raw\viirs_s_npp_2021.csv `
     --viirs-csv analysis\data\raw\viirs_s_npp_2022.csv `
     --viirs-csv analysis\data\raw\viirs_s_npp_2023.csv `
     --coverage-csv analysis\data\raw\coverage.csv
   ```

   Repetir cada opción de sensor solo para los archivos que existan. Los archivos se combinan por sensor, las duplicaciones idénticas se reportan y eliminan, y las claves duplicadas con atributos contradictorios detienen el proceso. El JSON se escribe en `mobile/public/data/fire-calendar.json`. Revisar sus metadatos y métricas antes de publicar.

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
