# Fuentes y estado de los datos

## Descarga pendiente

Las solicitudes a NASA FIRMS fueron confirmadas el 14 de noviembre de 2026 y siguen pendientes de procesamiento y descarga. Todavía no hay CSV ni resultados reales en el repositorio. La página oficial de archivo FIRMS indica que las descargas históricas requieren iniciar sesión con Earthdata o validar un código enviado por correo. No se guardan credenciales ni se usan datos sintéticos.

La solicitud se hizo para Bolivia en formato CSV. El análisis del prototipo se limita al rectángulo de Cochabamba descrito abajo: los registros fuera del rectángulo se descartan durante el procesamiento. La fecha real de descarga y la cobertura mensual se completarán al recibir los archivos.

## Productos solicitados

| Sensor | Producto solicitado | Versión solicitada | Plataformas |
|---|---|---|---|
| MODIS | MCD14ML, focos activos históricos | Collection 6.1 | Terra + Aqua |
| VIIRS | Active Fire VIIRS | Collection 2 | Suomi-NPP (S-NPP) |

El código exacto del producto VIIRS que entregue el selector y los metadatos de los CSV está pendiente de verificación. `VNP14IMGTML` y `VNP14IMGML` son variantes que el importador reconoce; no se afirmará cuál se recibió hasta inspeccionar los archivos. No mezclar NRT, plataformas VIIRS distintas ni colecciones.

## Área y períodos

- Área solicitada a FIRMS: Bolivia.
- Rectángulo aplicado al análisis: oeste `-66.35`, sur `-17.55`, este `-65.95`, norte `-17.15` (longitud/latitud WGS 84).
- El rectángulo es un recorte piloto de Cochabamba; no representa ni pretende reemplazar un límite municipal o departamental.
- Ventana inicial de estudio: 2020–2023 inclusive.
- Calibración: 2020–2021, con dos años coincidentes requeridos como mínimo.
- Evaluación reservada: 2022–2023; la evaluación nunca se usa para fijar el factor.
- Transición de la serie final: 2022-01; MODIS hasta 2021-12 y VIIRS ajustado desde 2022-01.
- La solicitud de 2023 termina el 1 de diciembre. El complemento hasta el 31 de diciembre está pendiente de confirmación; diciembre de 2023 debe permanecer incompleto y el año no se marcará como completo hasta revisar esa cobertura.
- Descarga real, producto VIIRS exacto y meses cubiertos: pendientes.

La separación 2020–2021 / 2022–2023 permite calibrar el factor con dos años completos y mantener una evaluación temporalmente separada dentro del intervalo solicitado. Si no se alcanza el mínimo de cobertura, el factor o las métricas quedan indisponibles.

## Importación y cobertura

Los archivos pueden estar separados por año y sensor. Se combinan todos los CSV de cada sensor antes de filtrar el rectángulo y el período. Las filas idénticas según coordenada, fecha, hora y satélite se cuentan y eliminan; si esa misma clave tiene atributos contradictorios, el proceso falla para evitar elegir arbitrariamente una fila. Los productos, colección y satélites declarados en la cobertura, y cualquier metadato equivalente incluido en los CSV, se validan antes de publicar.

1. Abrir [FIRMS Archive Download](https://firms.modaps.eosdis.nasa.gov/download/) y descargar las solicitudes CSV de MODIS y VIIRS S-NPP.
2. Guardar los originales fuera del control de versiones, por ejemplo `analysis/data/raw/modis_2020.csv`, `modis_2021.csv`, `viirs_s_npp_2020.csv`, etc.
3. Generar el manifiesto mensual (96 filas: dos sensores × cuatro años × doce meses):

   ```powershell
   python analysis\src\process_data.py --create-coverage-template analysis\data\raw\coverage.csv
   ```

4. Verificar los códigos de producto y colección contra los metadatos recibidos. Actualizar `product`, `version`, `satellites`, `download_date` y `source_file` en cada fila; marcar `complete=true` solo si ese sensor, mes y rectángulo están cubiertos. Mantener diciembre de 2023 incompleto hasta confirmar el complemento solicitado. Para marcarlo completo, confirmar también `december_2023_supplement_confirmed=true` en ambas filas (MODIS y VIIRS).
5. Combinar y procesar los archivos usando las opciones repetibles `--modis-csv` y `--viirs-csv` indicadas en el README de `mobile/`.

Un mes completo sin detecciones después de los filtros tiene conteo cero. Un mes sin cobertura confirmada permanece faltante. Los archivos fuente quedan bajo `analysis/data/raw/`, ruta ignorada por Git.

## Filtros de calidad y limitaciones

- MODIS: conserva detecciones con confianza numérica `>= 30` en la escala del producto.
- VIIRS: conserva confianza nominal o alta (`n`/`h` o su etiqueta completa); si existe `type`, conserva `type == 0`.
- Las escalas de confianza no se consideran equivalentes entre sensores.
- Se excluyen coordenadas fuera del rectángulo; se deduplica por coordenada, fecha, hora y satélite, manteniendo pasos de observación y plataformas distintos.
- Los meses incompletos no se interpretan como actividad cero.
- Se preservan conteo, FRP mensual cuando está disponible, filas duplicadas eliminadas y metadatos de fuente en el resultado.

## Referencias oficiales consultadas

- [FIRMS Archive Download](https://firms.modaps.eosdis.nasa.gov/download/) — acceso, solicitudes históricas y formatos.
- [FIRMS Web Services](https://firms.modaps.eosdis.nasa.gov/web-services/) — servicios programáticos; no usados por el prototipo.
- [NASA Earthdata: FIRMS](https://www.earthdata.nasa.gov/data/tools/firms) — descripción, resolución MODIS/VIIRS, plataformas y colecciones.
- [FIRMS FAQ](https://www.earthdata.nasa.gov/data/tools/firms/faq) — diferencia entre productos estándar y NRT, y plataformas.
- [VIIRS Collection 2 Active Fire User Guide, v1.2](https://www.earthdata.nasa.gov/s3fs-public/2025-06/VIIRS_C2_AF-375m_User_Guide_1.2.pdf).
- [MODIS Collection 6/6.1 Active Fire User Guide](https://www.earthdata.nasa.gov/s3fs-public/2023-09/MODIS_C6_C6.1_Fire_User_Guide_1.0.pdf).

## Reconocimiento

Se debe reconocer el uso de datos y/o imágenes del NASA Fire Information for Resource Management System (FIRMS), parte de NASA Land, Atmosphere Near real-time Capability for Earth observations (LANCE) y NASA Earth Science Data and Information System (ESDIS), conforme a las [indicaciones oficiales](https://www.earthdata.nasa.gov/data/tools/firms).
