import sys
import tempfile
import unittest
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import process_data


def observation(date, sensor, count, confidence, satellite, frp=10):
    rows = []
    for index in range(count):
        rows.append(
            {
                "latitude": -17.3,
                "longitude": -66.1,
                "acq_date": date,
                "acq_time": f"{1000 + index:04d}",
                "confidence": confidence,
                "satellite": satellite,
                "frp": frp,
                **({"type": 0} if sensor == "VIIRS" else {}),
            }
        )
    return rows


def coverage_row(sensor, year, month, complete=True, supplement_confirmed=False):
    product, version, satellites = (
        ("MCD14ML", "Collection 6.1", "Terra + Aqua")
        if sensor == "MODIS"
        else ("VNP14IMGTML", "Collection 2", "Suomi-NPP")
    )
    return {
        "sensor": sensor,
        "year": year,
        "month": month,
        "complete": complete,
        "product": product,
        "version": version,
        "satellites": satellites,
        "download_date": "2026-11-14",
        "source_file": f"{product}.csv",
        "december_2023_supplement_confirmed": supplement_confirmed,
    }


class FireDataProcessingTests(unittest.TestCase):
    def build(self, modis, viirs, coverage, **kwargs):
        columns = ["latitude", "longitude", "acq_date", "acq_time", "confidence", "satellite", "frp", "type"]
        return process_data.build_results(
            pd.DataFrame(modis, columns=columns),
            pd.DataFrame(viirs, columns=columns),
            pd.DataFrame(coverage),
            min_calibration_months=kwargs.get("min_calibration_months", 1),
            min_calibration_years=kwargs.get("min_calibration_years", 1),
            min_evaluation_months=kwargs.get("min_evaluation_months", 1),
        )

    def test_adjustment_factor_uses_calibration_years_only(self):
        coverage = [
            coverage_row("MODIS", 2020, 1),
            coverage_row("VIIRS", 2020, 1),
            coverage_row("MODIS", 2022, 1),
            coverage_row("VIIRS", 2022, 1),
        ]
        result = self.build(
            observation("2020-01-03", "MODIS", 2, 60, "Terra")
            + observation("2022-01-03", "MODIS", 6, 60, "Terra"),
            observation("2020-01-03", "VIIRS", 1, "n", "Suomi-NPP")
            + observation("2022-01-03", "VIIRS", 2, "h", "Suomi-NPP"),
            coverage,
        )

        self.assertEqual(result["harmonization"]["factor"], 2)
        self.assertEqual(result["evaluation"]["before"]["mae"], 4)
        self.assertEqual(result["evaluation"]["after"]["mae"], 2)
        self.assertEqual(result["metadata"]["period"], {"startYear": 2020, "endYear": 2023})
        self.assertEqual(result["metadata"]["calibration"], {"startYear": 2020, "endYear": 2021})
        self.assertEqual(result["metadata"]["evaluation"], {"startYear": 2022, "endYear": 2023})
        final_month = next(row for row in result["monthly"] if (row["year"], row["month"]) == (2022, 1))
        self.assertEqual(final_month["final_value"], 4)
        self.assertEqual(final_month["final_source"], "VIIRS ajustado")

    def test_confirmed_zero_is_not_missing_and_transition_never_adds_sensors(self):
        coverage = [
            coverage_row("MODIS", 2020, 1),
            coverage_row("VIIRS", 2020, 1),
            coverage_row("MODIS", 2020, 2),
            coverage_row("VIIRS", 2020, 2),
            coverage_row("MODIS", 2022, 1),
            coverage_row("VIIRS", 2022, 1, complete=False),
        ]
        result = self.build(
            observation("2020-01-03", "MODIS", 1, 60, "Terra")
            + observation("2020-02-03", "MODIS", 2, 60, "Terra")
            + observation("2022-01-03", "MODIS", 20, 60, "Terra"),
            observation("2020-01-03", "VIIRS", 1, "n", "Suomi-NPP"),
            coverage,
        )

        february = next(row for row in result["monthly"] if (row["year"], row["month"]) == (2020, 2))
        self.assertEqual(february["viirs_count"], 0)
        self.assertEqual(february["frp_viirs_sum"], 0.0)
        january_2022 = next(row for row in result["monthly"] if (row["year"], row["month"]) == (2022, 1))
        self.assertIsNone(january_2022["final_value"])
        self.assertEqual(january_2022["coverage"], "incomplete")
        self.assertIsNone(january_2022["final_source"])

    def test_partial_sensor_counts_keep_algorithm_versions_without_claiming_completeness(self):
        modis = pd.DataFrame(
            observation("2020-01-03", "MODIS", 1, 60, "Terra")
            + observation("2020-01-04", "MODIS", 1, 60, "Aqua")
        )
        modis.loc[0, "acq_time"] = "0306"
        modis["version"] = ["6.03", "61.03"]
        viirs = pd.DataFrame(observation("2020-01-03", "VIIRS", 1, "n", "Suomi-NPP"))
        viirs["version"] = "2"
        result = process_data.build_results(
            modis,
            viirs,
            pd.DataFrame([
                coverage_row("MODIS", 2020, 1, complete=False),
                coverage_row("VIIRS", 2020, 1, complete=False),
            ]),
        )

        january = next(row for row in result["monthly"] if (row["year"], row["month"]) == (2020, 1))
        self.assertEqual(january["modis_count"], 2)
        self.assertEqual(january["viirs_count"], 1)
        self.assertEqual(january["coverage"], "incomplete")
        self.assertIsNone(january["final_value"])
        self.assertIsNone(result["harmonization"]["factor"])
        modis_source = next(source for source in result["metadata"]["sources"] if source["sensor"] == "MODIS")
        self.assertEqual(modis_source["algorithmVersions"], ["6.03", "61.03"])

        prepared = {
            "MODIS": process_data._prepare_observations(modis, "MODIS"),
            "VIIRS": process_data._prepare_observations(viirs, "VIIRS"),
        }
        coverage = process_data._normalize_coverage(pd.DataFrame([
            coverage_row("MODIS", 2020, 1, complete=False),
            coverage_row("VIIRS", 2020, 1, complete=False),
        ]))
        with tempfile.TemporaryDirectory() as temporary_directory:
            process_data.write_detection_files(prepared, coverage, Path(temporary_directory))
            points = Path(temporary_directory, "2020-01-modis.geojson").read_text(encoding="utf-8")
        self.assertIn('"version":"6.03"', points)
        self.assertIn('"acq_time":"0306"', points)

    def test_zero_viirs_calibration_denominator_leaves_factor_unavailable(self):
        result = self.build(
            observation("2020-01-03", "MODIS", 1, 60, "Terra"),
            [],
            [
                coverage_row("MODIS", 2020, 1),
                coverage_row("VIIRS", 2020, 1),
                coverage_row("MODIS", 2022, 1),
                coverage_row("VIIRS", 2022, 1),
            ],
        )

        self.assertIsNone(result["harmonization"]["factor"])
        self.assertEqual(result["monthly"][0]["final_value"], 1)
        january_2022 = next(row for row in result["monthly"] if (row["year"], row["month"]) == (2022, 1))
        self.assertIsNone(january_2022["final_value"])

    def test_unknown_viirs_confidence_is_reported_instead_of_silently_dropped(self):
        with self.assertRaisesRegex(ValueError, "confianza VIIRS desconocida"):
            self.build(
                [],
                observation("2020-01-03", "VIIRS", 1, "uncertain", "Suomi-NPP"),
                [coverage_row("VIIRS", 2020, 1)],
            )

    def test_duplicate_rows_are_removed_without_collapsing_distinct_acquisition_times(self):
        rows = observation("2020-01-03", "MODIS", 1, 60, "Terra")
        later_pass = observation("2020-01-03", "MODIS", 1, 60, "Terra")
        later_pass[0]["acq_time"] = "1200"
        rows = rows + rows + later_pass
        prepared = process_data._prepare_observations(pd.DataFrame(rows), "MODIS")

        self.assertEqual(len(prepared), 2)
        self.assertEqual(prepared.attrs["duplicateRows"], 1)

    def test_annual_csvs_are_combined_and_cross_file_duplicates_are_reported(self):
        rows = observation("2020-01-03", "MODIS", 1, 60, "Terra")
        with tempfile.TemporaryDirectory() as temporary_directory:
            first = Path(temporary_directory) / "modis_2020.csv"
            second = Path(temporary_directory) / "modis_2021.csv"
            pd.DataFrame(rows).to_csv(first, index=False)
            pd.DataFrame(rows).to_csv(second, index=False)

            combined = process_data._read_sensor_csvs([first, second], "MODIS")
            prepared = process_data._prepare_observations(combined, "MODIS")

        self.assertEqual(len(combined), 2)
        self.assertEqual(len(prepared), 1)
        self.assertEqual(prepared.attrs["duplicateRows"], 1)

    def test_conflicting_duplicates_and_unexpected_product_metadata_are_rejected(self):
        duplicate_rows = observation("2020-01-03", "MODIS", 1, 60, "Terra")
        conflicting_row = dict(duplicate_rows[0], frp=99)
        with self.assertRaisesRegex(ValueError, "atributos contradictorios"):
            process_data._prepare_observations(
                pd.DataFrame(duplicate_rows + [conflicting_row]),
                "MODIS",
            )

        invalid_metadata = pd.DataFrame(
            observation("2020-01-03", "VIIRS", 1, "n", "Suomi-NPP")
        )
        invalid_metadata["product"] = "VNP14IMGTDL"
        with self.assertRaisesRegex(ValueError, "producto"):
            process_data._prepare_observations(invalid_metadata, "VIIRS")

    def test_2023_december_is_not_treated_as_complete_without_confirmation(self):
        result = self.build(
            [],
            [],
            [
                coverage_row("MODIS", 2023, 12, complete=False),
                coverage_row("VIIRS", 2023, 12, complete=False),
            ],
        )

        december = next(row for row in result["monthly"] if (row["year"], row["month"]) == (2023, 12))
        self.assertIsNone(december["final_value"])
        self.assertIn("Diciembre de 2023 permanece incompleto", result["statusMessage"])

    def test_2023_december_cannot_be_marked_complete_before_supplement_confirmation(self):
        with self.assertRaisesRegex(ValueError, "requiere confirmar el complemento"):
            self.build(
                [],
                [],
                [
                    coverage_row("MODIS", 2023, 12),
                    coverage_row("VIIRS", 2023, 12),
                ],
            )

        confirmed = [
            coverage_row("MODIS", 2023, 12, supplement_confirmed=True),
            coverage_row("VIIRS", 2023, 12, supplement_confirmed=True),
        ]
        process_data._normalize_coverage(pd.DataFrame(confirmed))

    def test_coverage_template_contains_four_years_and_leaves_december_pending(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            destination = Path(temporary_directory) / "coverage.csv"
            process_data.write_coverage_template(destination)
            coverage = pd.read_csv(destination)

        self.assertEqual(len(coverage), 96)
        december = coverage[(coverage["year"] == 2023) & (coverage["month"] == 12)]
        self.assertEqual(len(december), 2)
        self.assertFalse(december["complete"].any())
        self.assertFalse(december["december_2023_supplement_confirmed"].any())


if __name__ == "__main__":
    unittest.main()
