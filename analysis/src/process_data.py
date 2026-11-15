#!/usr/bin/env python3
"""Reproducibly prepare FIRMS monthly counts and an exploratory sensor adjustment."""

from __future__ import annotations

import argparse
import csv
import json
import math
from pathlib import Path
from typing import Any

import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
OUTPUT_DEFAULT = ROOT / "mobile" / "public" / "data" / "fire-calendar.json"
START_YEAR = 2020
END_YEAR = 2023
CALIBRATION_START = 2020
CALIBRATION_END = 2021
EVALUATION_START = 2022
EVALUATION_END = 2023
TRANSITION_MONTH = "2022-01"
MIN_CALIBRATION_MONTHS = 24
MIN_CALIBRATION_YEARS = 2
MIN_EVALUATION_MONTHS = 12
REFERENCE_MINIMUM_YEARS = 3
BBOX = {"west": -66.35, "south": -17.55, "east": -65.95, "north": -17.15}
MONTHS = [(year, month) for year in range(START_YEAR, END_YEAR + 1) for month in range(1, 13)]

SENSOR_ALIASES = {
    "MODIS": "MODIS",
    "MCD14ML": "MODIS",
    "VIIRS": "VIIRS",
    "VIIRS_S_NPP": "VIIRS",
    "SUOMI_NPP": "VIIRS",
    "SUOMI_VIIRS": "VIIRS",
    "SNPP": "VIIRS",
    "VNP14IMGML": "VIIRS",
    "VNP14IMGTML": "VIIRS",
}


def _normalize_sensor(value: Any) -> str:
    key = str(value).strip().upper().replace("-", "_").replace(" ", "_")
    if key not in SENSOR_ALIASES:
        raise ValueError(f"Sensor desconocido en coverage.csv: {value!r}")
    return SENSOR_ALIASES[key]


def _metadata_token(value: Any) -> str:
    return "".join(character for character in str(value).strip().upper() if character.isalnum())


def _validate_product(sensor: str, product: Any, context: str) -> None:
    allowed_products = {
        "MODIS": {"MCD14ML"},
        "VIIRS": {"VNP14IMGTML", "VNP14IMGML"},
    }
    if _metadata_token(product) not in allowed_products[sensor]:
        raise ValueError(f"{context}: producto {product!r} no corresponde a {sensor} Collection solicitada.")


def _validate_version(sensor: str, version: Any, context: str) -> None:
    allowed_versions = {
        "MODIS": {"COLLECTION61", "C61", "61"},
        "VIIRS": {"COLLECTION2", "C2", "2"},
    }
    if _metadata_token(version) not in allowed_versions[sensor]:
        raise ValueError(f"{context}: versión {version!r} no corresponde a {sensor} Collection solicitada.")


def _validate_product_version(sensor: str, product: Any, version: Any, context: str) -> None:
    _validate_product(sensor, product, context)
    _validate_version(sensor, version, context)


def _validate_coverage_satellites(sensor: str, satellites: Any) -> None:
    token = _metadata_token(satellites)
    allowed = {
        "MODIS": {"TERRAAQUA", "AQUATERRA"},
        "VIIRS": {"SUOMINPP", "SNPP", "NPP"},
    }
    if token not in allowed[sensor]:
        raise ValueError(f"coverage.csv: plataformas {satellites!r} no corresponden a {sensor}.")


def _validate_observation_metadata(observations: pd.DataFrame, sensor: str) -> None:
    product_columns = [column for column in ("product", "product_name") if column in observations.columns]
    version_columns = [column for column in ("version", "collection") if column in observations.columns]
    for product_column in product_columns:
        products = observations[product_column].dropna().astype(str).str.strip()
        products = products[products.ne("")]
        if not products.empty:
            if products.nunique() != 1:
                raise ValueError(f"CSV de {sensor}: se mezclan productos en {product_column}.")
            _validate_product(sensor, products.iloc[0], f"CSV de {sensor}")
    for version_column in version_columns:
        versions = observations[version_column].dropna().astype(str).str.strip()
        versions = versions[versions.ne("")]
        if not versions.empty:
            if versions.nunique() != 1:
                raise ValueError(f"CSV de {sensor}: se mezclan versiones de producto.")
            _validate_version(sensor, versions.iloc[0], f"CSV de {sensor}")


def _normalize_coverage(coverage: pd.DataFrame) -> dict[tuple[str, int, int], dict[str, Any]]:
    frame = coverage.copy()
    frame.columns = [str(column).strip().lower() for column in frame.columns]
    if "december_2023_supplement_confirmed" not in frame.columns:
        frame["december_2023_supplement_confirmed"] = "false"
    required = {"sensor", "year", "month", "complete", "product", "version", "satellites", "download_date"}
    missing = required.difference(frame.columns)
    if missing:
        raise ValueError(f"coverage.csv no contiene columnas obligatorias: {', '.join(sorted(missing))}")

    frame["sensor"] = frame["sensor"].map(_normalize_sensor)
    frame["year"] = pd.to_numeric(frame["year"], errors="raise").astype(int)
    frame["month"] = pd.to_numeric(frame["month"], errors="raise").astype(int)
    if not frame["month"].between(1, 12).all():
        raise ValueError("coverage.csv contiene meses fuera del rango 1–12.")
    if not frame["year"].between(START_YEAR, END_YEAR).all():
        raise ValueError(f"coverage.csv debe estar dentro de {START_YEAR}–{END_YEAR}.")

    def parse_bool(value: Any) -> bool:
        normalized = str(value).strip().lower()
        if normalized in {"true", "1", "yes", "si", "sí", "complete", "completo"}:
            return True
        if normalized in {"false", "0", "no", "incomplete", "incompleto"}:
            return False
        raise ValueError(f"Valor 'complete' inválido en coverage.csv: {value!r}")

    frame["complete"] = frame["complete"].map(parse_bool)
    frame["december_2023_supplement_confirmed"] = frame["december_2023_supplement_confirmed"].map(parse_bool)
    is_december_2023 = frame["year"].eq(2023) & frame["month"].eq(12)
    if (frame["december_2023_supplement_confirmed"] & ~is_december_2023).any():
        raise ValueError("La confirmación del complemento solo corresponde a diciembre de 2023.")
    if (frame.loc[is_december_2023, "complete"] & ~frame.loc[is_december_2023, "december_2023_supplement_confirmed"]).any():
        raise ValueError("Diciembre de 2023 requiere confirmar el complemento hasta el día 31 antes de marcarlo completo.")
    if (frame.loc[is_december_2023, "december_2023_supplement_confirmed"] & ~frame.loc[is_december_2023, "complete"]).any():
        raise ValueError("Marque diciembre de 2023 completo solo después de confirmar el complemento hasta el día 31.")
    for column in ("product", "version", "satellites"):
        frame[column] = frame[column].fillna("").astype(str).str.strip()
        if frame[column].eq("").any():
            raise ValueError(f"coverage.csv debe indicar {column} en todas sus filas.")
    download_dates = frame["download_date"].fillna("").astype(str).str.strip()
    if (frame["complete"] & download_dates.eq("")).any():
        raise ValueError("coverage.csv debe indicar la fecha de descarga de cada mes marcado como completo.")

    keys = ["sensor", "year", "month"]
    if frame.duplicated(keys).any():
        raise ValueError("coverage.csv contiene filas duplicadas para el mismo sensor, año y mes.")

    for sensor in ("MODIS", "VIIRS"):
        sensor_rows = frame.loc[frame["sensor"] == sensor]
        if sensor_rows.empty:
            continue
        for column in ("product", "version", "satellites"):
            if sensor_rows[column].nunique() != 1:
                raise ValueError(f"Mezcla de {column} en {sensor}; procesa un solo producto y versión a la vez.")
        source = sensor_rows.iloc[0]
        _validate_product_version(sensor, source["product"], source["version"], "coverage.csv")
        _validate_coverage_satellites(sensor, source["satellites"])

    return {
        (row.sensor, int(row.year), int(row.month)): row._asdict()
        for row in frame.itertuples(index=False)
    }


def _prepare_observations(frame: pd.DataFrame, sensor: str) -> pd.DataFrame:
    observations = frame.copy()
    observations.columns = [str(column).strip().lower() for column in observations.columns]
    _validate_observation_metadata(observations, sensor)
    required = {"latitude", "longitude", "acq_date", "acq_time", "confidence", "satellite"}
    missing = required.difference(observations.columns)
    if missing:
        raise ValueError(f"CSV de {sensor} sin columnas obligatorias: {', '.join(sorted(missing))}")

    for coordinate in ("latitude", "longitude"):
        parsed = pd.to_numeric(observations[coordinate], errors="coerce")
        if parsed.isna().any():
            raise ValueError(f"CSV de {sensor}: valores inválidos en {coordinate}.")
        observations[coordinate] = parsed
    acquired = pd.to_datetime(observations["acq_date"], errors="coerce", utc=True)
    if acquired.isna().any():
        raise ValueError(f"CSV de {sensor}: valores inválidos en acq_date.")
    observations["acq_date"] = acquired.dt.strftime("%Y-%m-%d")
    observations["acq_time"] = observations["acq_time"].fillna("").astype(str).str.strip()
    observations["satellite"] = observations["satellite"].fillna("").astype(str).str.strip()
    if observations["acq_time"].eq("").any() or observations["satellite"].eq("").any():
        raise ValueError(f"CSV de {sensor}: acq_time y satellite no pueden estar vacíos.")
    satellite_codes = observations["satellite"].map(_metadata_token)
    allowed_satellites = {
        "MODIS": {"TERRA", "AQUA", "T", "A"},
        "VIIRS": {"SUOMINPP", "SNPP", "NPP", "N"},
    }
    unknown_satellites = set(satellite_codes.unique()).difference(allowed_satellites[sensor])
    if unknown_satellites:
        raise ValueError(f"CSV de {sensor}: satélite inesperado: {', '.join(sorted(unknown_satellites))}.")

    confidence = observations["confidence"].fillna("").astype(str).str.strip().str.lower()
    if sensor == "MODIS":
        numeric_confidence = pd.to_numeric(confidence, errors="coerce")
        if confidence.ne("").any() and numeric_confidence[confidence.ne("")].isna().any():
            raise ValueError("La confianza MODIS debe ser numérica (escala 0–100).")
        observations = observations.loc[numeric_confidence >= 30].copy()
    else:
        confidence_codes = {
            "l": "low",
            "low": "low",
            "n": "nominal",
            "nominal": "nominal",
            "h": "high",
            "high": "high",
        }
        unknown = set(confidence[confidence.ne("")].unique()).difference(confidence_codes)
        if unknown:
            raise ValueError(f"Escala de confianza VIIRS desconocida: {', '.join(sorted(unknown))}")
        observations = observations.loc[confidence.map(confidence_codes).isin({"nominal", "high"})].copy()
        if "type" in observations.columns:
            fire_type = pd.to_numeric(observations["type"], errors="coerce")
            if fire_type.isna().any():
                raise ValueError("La columna type de VIIRS contiene valores no numéricos.")
            observations = observations.loc[fire_type == 0].copy()

    if "frp" in observations.columns:
        raw_frp = observations["frp"]
        observations["frp"] = pd.to_numeric(raw_frp, errors="coerce")
        invalid_frp = raw_frp.notna() & raw_frp.astype(str).str.strip().ne("") & observations["frp"].isna()
        if invalid_frp.any():
            raise ValueError(f"CSV de {sensor}: valores inválidos en frp.")
    else:
        observations["frp"] = float("nan")

    lat, lon = observations["latitude"], observations["longitude"]
    in_area = (
        lat.between(BBOX["south"], BBOX["north"])
        & lon.between(BBOX["west"], BBOX["east"])
    )
    dates = pd.to_datetime(observations["acq_date"], utc=True)
    in_period = dates.dt.year.between(START_YEAR, END_YEAR)
    observations = observations.loc[in_area & in_period].copy()
    duplicate_keys = ["latitude", "longitude", "acq_date", "acq_time", "satellite"]
    duplicate_mask = observations.duplicated(subset=duplicate_keys, keep=False)
    source_metadata = {"product", "product_name", "version", "collection"}
    comparison_columns = [
        column
        for column in observations.columns
        if column not in duplicate_keys and column not in source_metadata
    ]
    if duplicate_mask.any() and observations.loc[duplicate_mask].groupby(
        duplicate_keys, dropna=False
    )[comparison_columns].nunique(dropna=False).gt(1).any().any():
        raise ValueError(f"CSV combinado de {sensor}: claves duplicadas con atributos contradictorios.")
    unique = observations.drop_duplicates(subset=duplicate_keys).reset_index(drop=True)
    unique.attrs["duplicateRows"] = int(len(observations) - len(unique))
    unique.attrs["filteredRows"] = int(len(observations))
    return unique


def _monthly_aggregates(observations: pd.DataFrame) -> dict[tuple[int, int], dict[str, Any]]:
    if observations.empty:
        return {}
    dates = pd.to_datetime(observations["acq_date"], utc=True)
    frame = observations.assign(year=dates.dt.year, month=dates.dt.month)
    grouped = frame.groupby(["year", "month"], sort=True)
    result: dict[tuple[int, int], dict[str, Any]] = {}
    for (year, month), group in grouped:
        frp = group["frp"].sum(min_count=1)
        result[(int(year), int(month))] = {
            "count": int(len(group)),
            "frp_sum": float(frp) if pd.notna(frp) else None,
        }
    return result


def _monthly_frp(aggregates: dict[tuple[int, int], dict[str, Any]], key: tuple[int, int], complete: bool) -> float | None:
    if not complete:
        return None
    aggregate = aggregates.get(key)
    if aggregate is None:
        return 0.0
    return aggregate["frp_sum"]


def _mean_absolute_error(reference: list[float], predicted: list[float]) -> float | None:
    if not reference:
        return None
    return float(sum(abs(estimate - actual) for actual, estimate in zip(reference, predicted)) / len(reference))


def _metric(reference: list[float], predicted: list[float]) -> dict[str, float | None]:
    mae = _mean_absolute_error(reference, predicted)
    bias = None if not reference else float(sum(estimate - actual for actual, estimate in zip(reference, predicted)) / len(reference))
    return {"mae": mae, "bias": bias}


def build_results(
    modis_raw: pd.DataFrame,
    viirs_raw: pd.DataFrame,
    coverage_raw: pd.DataFrame,
    *,
    min_calibration_months: int = MIN_CALIBRATION_MONTHS,
    min_calibration_years: int = MIN_CALIBRATION_YEARS,
    min_evaluation_months: int = MIN_EVALUATION_MONTHS,
) -> dict[str, Any]:
    coverage = _normalize_coverage(coverage_raw)
    modis_prepared = _prepare_observations(modis_raw, "MODIS")
    viirs_prepared = _prepare_observations(viirs_raw, "VIIRS")
    modis = _monthly_aggregates(modis_prepared)
    viirs = _monthly_aggregates(viirs_prepared)

    calibration_pairs = []
    for year, month in MONTHS:
        modis_status = coverage.get(("MODIS", year, month), {}).get("complete", False)
        viirs_status = coverage.get(("VIIRS", year, month), {}).get("complete", False)
        if CALIBRATION_START <= year <= CALIBRATION_END and modis_status and viirs_status:
            calibration_pairs.append((year, modis.get((year, month), {}).get("count", 0), viirs.get((year, month), {}).get("count", 0)))

    calibration_years = {year for year, _, _ in calibration_pairs}
    calibration_modis_total = sum(modis_count for _, modis_count, _ in calibration_pairs)
    calibration_viirs_total = sum(viirs_count for _, _, viirs_count in calibration_pairs)
    factor = None
    if (
        len(calibration_pairs) >= min_calibration_months
        and len(calibration_years) >= min_calibration_years
        and calibration_viirs_total > 0
        and calibration_modis_total > 0
    ):
        factor = calibration_modis_total / calibration_viirs_total
        if not math.isfinite(factor):
            factor = None

    evaluation_pairs = []
    for year, month in MONTHS:
        modis_coverage = coverage.get(("MODIS", year, month), {}).get("complete", False)
        viirs_coverage = coverage.get(("VIIRS", year, month), {}).get("complete", False)
        if EVALUATION_START <= year <= EVALUATION_END and modis_coverage and viirs_coverage:
            evaluation_pairs.append(
                (year, month, modis.get((year, month), {}).get("count", 0), viirs.get((year, month), {}).get("count", 0))
            )
    evaluation_reference = [float(item[2]) for item in evaluation_pairs]
    evaluation_viirs = [float(item[3]) for item in evaluation_pairs]
    evaluation_adjusted = [value * factor for value in evaluation_viirs] if factor is not None else []
    before_metric = _metric(evaluation_reference, evaluation_viirs)
    after_metric = _metric(evaluation_reference, evaluation_adjusted)

    quarterly = []
    for quarter in range(1, 5):
        quarter_pairs = [pair for pair in evaluation_pairs if (pair[1] - 1) // 3 + 1 == quarter]
        actual = [float(pair[2]) for pair in quarter_pairs]
        original = [float(pair[3]) for pair in quarter_pairs]
        adjusted = [value * factor for value in original] if factor is not None else []
        quarterly.append(
            {
                "quarter": f"Q{quarter}",
                "samples": len(quarter_pairs),
                "beforeMae": _mean_absolute_error(actual, original) if len(quarter_pairs) >= 3 else None,
                "afterMae": _mean_absolute_error(actual, adjusted) if factor is not None and len(quarter_pairs) >= 3 else None,
            }
        )

    monthly = []
    for year, month in MONTHS:
        modis_coverage_row = coverage.get(("MODIS", year, month))
        viirs_coverage_row = coverage.get(("VIIRS", year, month))
        modis_complete = bool(modis_coverage_row and modis_coverage_row["complete"])
        viirs_complete = bool(viirs_coverage_row and viirs_coverage_row["complete"])
        modis_count = modis.get((year, month), {}).get("count", 0) if modis_complete else None
        viirs_count = viirs.get((year, month), {}).get("count", 0) if viirs_complete else None
        adjusted_count = viirs_count * factor if viirs_count is not None and factor is not None else None
        before_transition = f"{year:04d}-{month:02d}" < TRANSITION_MONTH
        final_source = "MODIS" if before_transition else "VIIRS ajustado"
        final_count = modis_count if before_transition else adjusted_count
        selected_coverage_row = modis_coverage_row if before_transition else viirs_coverage_row
        coverage_state = (
            "missing" if selected_coverage_row is None else
            "complete" if selected_coverage_row["complete"] else
            "incomplete"
        )
        monthly.append(
            {
                "year": year,
                "month": month,
                "modis_count": modis_count,
                "viirs_count": viirs_count,
                "viirs_adjusted": adjusted_count,
                "final_value": final_count,
                "final_source": final_source if final_count is not None else None,
                "final_kind": ("observado" if before_transition else "estimado") if final_count is not None else None,
                "coverage": coverage_state,
                "reference_median": None,
                "reference_years": 0,
                "reference_delta": None,
                "frp_modis_sum": _monthly_frp(modis, (year, month), modis_complete),
                "frp_viirs_sum": _monthly_frp(viirs, (year, month), viirs_complete),
                "modis_geojson": f"/data/detections/{year}-{month:02d}-modis.geojson" if modis_complete else None,
                "viirs_geojson": f"/data/detections/{year}-{month:02d}-viirs.geojson" if viirs_complete else None,
            }
        )

    for record in monthly:
        reference_values = [
            item["final_value"]
            for item in monthly
            if item["month"] == record["month"] and item["year"] != record["year"] and item["final_value"] is not None
        ]
        record["reference_years"] = len(reference_values)
        if len(reference_values) >= REFERENCE_MINIMUM_YEARS:
            reference = float(pd.Series(reference_values).median())
            record["reference_median"] = reference
            if record["final_value"] is not None:
                record["reference_delta"] = float(record["final_value"] - reference)

    sources = []
    for sensor in ("MODIS", "VIIRS"):
        sensor_rows = [row for (row_sensor, _, _), row in coverage.items() if row_sensor == sensor]
        if sensor_rows:
            source = sensor_rows[0]
            sources.append(
                {
                    "sensor": sensor,
                    "product": source["product"],
                    "version": source["version"],
                    "satellites": source["satellites"],
                    "downloadDates": sorted({str(row["download_date"]) for row in sensor_rows if str(row["download_date"]).strip()}),
                    "sourceFiles": sorted({str(row.get("source_file", "")) for row in sensor_rows if row.get("source_file")}),
                    "url": "https://firms.modaps.eosdis.nasa.gov/download/",
                }
            )

    result_status = "ready" if factor is not None and len(evaluation_pairs) >= min_evaluation_months else "insufficient"
    if factor is None:
        status_message = (
            "No se calculó el factor: se requiere cobertura coincidente suficiente y totales positivos en ambos sensores."
        )
    elif len(evaluation_pairs) < min_evaluation_months:
        status_message = (
            f"Hay {len(evaluation_pairs)} meses coincidentes en evaluación; se requieren al menos "
            f"{min_evaluation_months} para publicar métricas."
        )
    else:
        status_message = "Datos procesados; la evaluación usa meses reservados que no participaron del ajuste."
    if any(not coverage.get((sensor, 2023, 12), {}).get("complete", False) for sensor in ("MODIS", "VIIRS")):
        status_message += " Diciembre de 2023 permanece incompleto hasta confirmar y procesar su complemento de cobertura."

    return {
        "schemaVersion": 1,
        "status": result_status,
        "statusMessage": status_message,
        "metadata": {
            "areaName": "Bolivia · rectángulo de análisis piloto de Cochabamba",
            "bbox": BBOX,
            "timezone": "UTC",
            "period": {"startYear": START_YEAR, "endYear": END_YEAR},
            "calibration": {"startYear": CALIBRATION_START, "endYear": CALIBRATION_END},
            "evaluation": {"startYear": EVALUATION_START, "endYear": EVALUATION_END},
            "transitionMonth": TRANSITION_MONTH,
            "units": "detecciones mensuales equivalentes a MODIS",
            "referenceMinimumYears": REFERENCE_MINIMUM_YEARS,
            "confidenceFilters": {
                "MODIS": "numeric confidence >= 30",
                "VIIRS": "nominal/high; type == 0 when available",
            },
            "importSummary": {
                "MODIS": {
                    "inputRows": len(modis_raw),
                    "filteredRows": modis_prepared.attrs["filteredRows"],
                    "uniqueRows": len(modis_prepared),
                    "duplicateRowsRemoved": modis_prepared.attrs["duplicateRows"],
                },
                "VIIRS": {
                    "inputRows": len(viirs_raw),
                    "filteredRows": viirs_prepared.attrs["filteredRows"],
                    "uniqueRows": len(viirs_prepared),
                    "duplicateRowsRemoved": viirs_prepared.attrs["duplicateRows"],
                },
            },
            "sources": sources,
        },
        "harmonization": {
            "factor": factor,
            "calibrationMonths": len(calibration_pairs),
            "calibrationYears": sorted(calibration_years),
            "calibrationModisCount": calibration_modis_total,
            "calibrationViirsCount": calibration_viirs_total,
            "minimumCalibrationMonths": min_calibration_months,
            "minimumCalibrationYears": min_calibration_years,
        },
        "evaluation": {
            "sampleCount": len(evaluation_pairs),
            "minimumSamples": min_evaluation_months,
            "before": before_metric,
            "after": after_metric,
            "quarterly": quarterly,
        },
        "monthly": monthly,
    }


def write_coverage_template(destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("w", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)
        writer.writerow([
            "sensor",
            "year",
            "month",
            "complete",
            "product",
            "version",
            "satellites",
            "download_date",
            "source_file",
            "december_2023_supplement_confirmed",
        ])
        products = {
            "MODIS": ("MCD14ML", "Collection 6.1", "Terra + Aqua"),
            "VIIRS": ("VNP14IMGTML", "Collection 2", "Suomi-NPP"),
        }
        for sensor, (product, version, satellites) in products.items():
            for year, month in MONTHS:
                writer.writerow([sensor, year, month, "false", product, version, satellites, "", "", "false"])


def write_detection_files(
    observations: dict[str, pd.DataFrame],
    coverage: dict[tuple[str, int, int], dict[str, Any]],
    destination: Path,
) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    for (sensor, year, month), coverage_row in coverage.items():
        if not coverage_row["complete"]:
            continue
        frame = observations[sensor]
        dates = pd.to_datetime(frame["acq_date"], utc=True)
        month_rows = frame.loc[(dates.dt.year == year) & (dates.dt.month == month)]
        features = []
        for row in month_rows.itertuples(index=False):
            features.append(
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [float(row.longitude), float(row.latitude)],
                    },
                    "properties": {
                        "sensor": sensor,
                        "date": row.acq_date,
                        "time": row.acq_time,
                        "satellite": row.satellite,
                        "frp": float(row.frp) if pd.notna(row.frp) else None,
                    },
                }
            )
        sensor_slug = "modis" if sensor == "MODIS" else "viirs"
        file_path = destination / f"{year}-{month:02d}-{sensor_slug}.geojson"
        file_path.write_text(
            json.dumps(
                {"type": "FeatureCollection", "features": features},
                ensure_ascii=False,
                allow_nan=False,
                separators=(",", ":"),
            )
            + "\n",
            encoding="utf-8",
        )


def _read_sensor_csvs(paths: list[Path], sensor: str) -> pd.DataFrame:
    if not paths:
        raise ValueError(f"Se requiere al menos un CSV para {sensor}.")
    frames = []
    for path in paths:
        if not path.is_file():
            raise FileNotFoundError(f"Input file not found: {path}")
        frames.append(pd.read_csv(path, dtype=str))
    return pd.concat(frames, ignore_index=True, sort=False)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--modis-csv", type=Path, action="append", default=[], help="FIRMS MODIS CSV; repeat for annual files")
    parser.add_argument("--viirs-csv", type=Path, action="append", default=[], help="FIRMS VIIRS S-NPP CSV; repeat for annual files")
    parser.add_argument("--coverage-csv", type=Path, help="Audited per-month coverage and source manifest")
    parser.add_argument("--output", type=Path, default=OUTPUT_DEFAULT, help="Output JSON for the web app")
    parser.add_argument("--create-coverage-template", type=Path, help="Write a blank 2020–2023 monthly coverage ledger and exit")
    args = parser.parse_args()

    if args.create_coverage_template:
        write_coverage_template(args.create_coverage_template)
        print(f"Coverage template written: {args.create_coverage_template}")
        return

    missing_args = []
    if not args.modis_csv:
        missing_args.append("--modis-csv")
    if not args.viirs_csv:
        missing_args.append("--viirs-csv")
    if args.coverage_csv is None:
        missing_args.append("--coverage-csv")
    if missing_args:
        parser.error(f"Required unless --create-coverage-template is used: {', '.join(missing_args)}")

    if not args.coverage_csv.is_file():
        raise FileNotFoundError(f"Input file not found: {args.coverage_csv}")
    results = build_results(
        (modis_raw := _read_sensor_csvs(args.modis_csv, "MODIS")),
        (viirs_raw := _read_sensor_csvs(args.viirs_csv, "VIIRS")),
        (coverage_raw := pd.read_csv(args.coverage_csv, dtype=str)),
    )
    coverage = _normalize_coverage(coverage_raw)
    prepared = {
        "MODIS": _prepare_observations(modis_raw, "MODIS"),
        "VIIRS": _prepare_observations(viirs_raw, "VIIRS"),
    }
    detection_directory = args.output.parent / "detections"
    write_detection_files(prepared, coverage, detection_directory)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(results, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(f"Results written: {args.output}")
    print(f"Factor: {results['harmonization']['factor']}; evaluation months: {results['evaluation']['sampleCount']}")
    for sensor, summary in results["metadata"]["importSummary"].items():
        print(
            f"{sensor}: {summary['inputRows']} filas combinadas, "
            f"{summary['duplicateRowsRemoved']} duplicadas eliminadas."
        )


if __name__ == "__main__":
    main()
