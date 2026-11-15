# Método de armonización y evaluación

## Estado

Las solicitudes FIRMS para 2020–2023 fueron confirmadas el 14 de noviembre de 2026; siguen pendientes de procesamiento y descarga. No hay observaciones, factor ni métricas reales que reportar. La app muestra el estado pendiente y no incluye cifras sintéticas.

## Preparación

1. Combinar todos los CSV anuales de cada sensor y validar columnas y cualquier metadato de producto, colección y satélite presente.
2. Comprobar la coherencia de los productos y versiones del manifiesto mensual. El producto VIIRS S-NPP exacto permanece pendiente de confirmación contra los archivos recibidos.
3. Validar fechas y coordenadas; conservar solo observaciones del rectángulo piloto WGS 84 y de 2020–2023.
4. Aplicar filtros propios del producto: MODIS confianza `>= 30`; VIIRS nominal/alta y tipo 0 cuando el campo exista. No se comparan directamente las escalas de confianza.
5. Deduplicar por coordenada, fecha, hora de adquisición y satélite. Se informa el número de filas idénticas eliminadas; una clave duplicada con atributos contradictorios detiene el proceso.
6. Agregar detecciones por mes, en tiempo UTC. Se conserva suma de valores FRP mensuales (MW) si está disponible; esa suma de observaciones no es energía acumulada.
7. Consultar el manifiesto mensual de cobertura. Solo un mes que conste completo puede tener conteo cero por ausencia de detecciones; la falta de cobertura se serializa como `null` y estado `missing`/`incomplete`.

## Ajuste

Para mantener una evaluación independiente dentro de la ventana solicitada, la calibración usa 2020–2021 y la evaluación reservada usa 2022–2023. Para cada sensor se requieren meses completos coincidentes.

```text
factor = suma(conteos MODIS en meses coincidentes válidos de 2020–2021)
         / suma(conteos VIIRS en esos mismos meses)

VIIRS ajustado = conteo VIIRS × factor
```

Se exige un mínimo de 24 meses completos repartidos en al menos dos años y totales positivos en ambos sensores; si no se cumple, el factor queda indisponible. No se sustituye por cero ni se estima con los años de evaluación.

La escala se denomina **detecciones mensuales equivalentes a MODIS**. MODIS es una referencia de escala, no una verdad de terreno ni una medición perfecta de actividad.

## Evaluación separada

Período reservado: 2022–2023. En cada mes completo coincidente se compara el conteo MODIS observado contra VIIRS original y contra VIIRS multiplicado por el factor ya fijado en 2020–2021.

Se calculan sesgo medio (`predicción − MODIS`) y error absoluto medio (MAE), ambos en detecciones por mes. Las métricas se muestran solo si hay al menos 12 meses completos coincidentes. También se reporta MAE por trimestre cuando hay tres o más meses disponibles en ese trimestre. Ningún mes de evaluación participa del ajuste. La evaluación solo puede ser completa hasta donde lo permita la cobertura verificada; el complemento de diciembre de 2023 sigue pendiente.

Una mejora se puede afirmar solo si las métricas reservadas muestran menor error; si no, se presentan ambas mediciones sin afirmar mejora. Un factor único puede corregir la escala promedio sin resolver diferencias estacionales, espaciales, de horario, resolución o detección.

## Serie histórica y referencia mensual

- Transición fija: 2022-01.
- Hasta diciembre de 2021: conteo MODIS observado.
- Desde enero de 2022: conteo VIIRS ajustado estimado.
- Los sensores no se suman durante el solapamiento.
- Si la cobertura o el factor requerido falta, el valor de la serie es faltante.
- La referencia es la mediana de la serie final disponible para el mismo mes calendario en otros años, excluyendo el año consultado. Se requieren al menos tres años válidos para mostrar la mediana/diferencia; no se calcula un porcentaje cuando la referencia es cero.

## Salida web

El procesador genera `mobile/public/data/fire-calendar.json`, consumido por el calendario, gráfica, detalle mensual y métricas de evaluación. Campos no disponibles son `null`, no ceros implícitos. Archivos de entrada voluminosos deben mantenerse fuera de Git.

## Interpretación y límites

- Un foco de calor es una detección de píxel satelital, no necesariamente un incendio independiente.
- Los conteos de focos no representan superficie quemada.
- La resolución y oportunidad de observación de MODIS y VIIRS difieren; el ajuste no elimina todas esas diferencias ni demuestra la causa de cambios reales.
- Los meses incompletos no se interpretan como actividad cero; 2023 no debe marcarse como año completo mientras falte confirmar diciembre.
- La serie describe actividad detectada y no predice riesgo o incendios futuros.

## Reproducibilidad

Usar Python y pandas conforme a [analysis/requirements.txt](../analysis/requirements.txt), ejecutar las pruebas desde la raíz con `python -m unittest discover -s analysis/tests`, y volver a generar el JSON con los comandos documentados en [mobile/README.md](../mobile/README.md).
