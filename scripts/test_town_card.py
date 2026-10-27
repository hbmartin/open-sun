"""Shared contracts, invalid inputs, and populated DST regression tests."""

import copy
import json
import unittest
from datetime import timedelta
from functools import partial
from pathlib import Path
from unittest.mock import patch

from town_card import (
    TZ,
    CardInputError,
    bands,
    PUBLIC_LOCATION,
    build_town_card as _build_town_card,
    condition,
    instant,
    is_daytime,
    quantile_at,
    station_sun_times,
    summary,
)

FIXTURES = Path(__file__).resolve().parent.parent / "lib/__fixtures__"
FIXTURE = json.loads((FIXTURES / "town-card.json").read_text())
EDGES = json.loads((FIXTURES / "town-card-edges.json").read_text())


build_town_card = partial(_build_town_card, station_location=(34.25, -117.19))


class TownCardTest(unittest.TestCase):
    def forecast(self):
        return copy.deepcopy(FIXTURE["input"]["forecast"])

    def test_shared_document(self):
        self.assertEqual(build_town_card(**FIXTURE["input"]), FIXTURE["expected"])

    def test_condition_requires_one_of_its_actual_inputs(self):
        inputs = {
            "precip_in": (0.1, "rain"),
            "pop": (0.6, "drizzle"),
            "humidity_pct": (90, "cloudy"),
            "wind_speed_mph": (25, "wind"),
        }
        for field, (finite, expected) in inputs.items():
            with self.subTest(field=field):
                self.assertEqual(condition({field: finite}, True), expected)
                self.assertEqual(condition({field: 0}, True), "sunny")
                self.assertEqual(condition({field: 0}, False), "clear-night")
                for absent in (
                    None,
                    float("nan"),
                    float("inf"),
                    -float("inf"),
                    True,
                    "0",
                ):
                    self.assertIsNone(condition({field: absent}, True))
                    self.assertIsNone(condition({field: absent}, False))
        self.assertIsNone(condition({}, True))
        self.assertIsNone(condition({"temp_f": 50, "pressure_sea_inhg": 30}, False))

    def test_non_condition_readings_cannot_invent_an_outlook(self):
        for field in (
            "pressure_sea_inhg",
            "dew_point_f",
            "wind_gust_mph",
            "temp_f",
            "bands",
        ):
            with self.subTest(field=field):
                forecast = self.forecast()
                forecast["daily"] = []
                for row in forecast["hourly"]:
                    row["values"] = {field: 30} if field != "bands" else {}
                    row["quantiles"] = (
                        {"temp_f": {"0.5": 40}} if field == "bands" else {}
                    )
                card = build_town_card(forecast, FIXTURE["input"]["current"])
                if field in ("temp_f", "bands"):
                    view = card["forecast"]
                    self.assertIsNotNone(view)
                    self.assertIsNone(view["outlook"])
                    if field == "temp_f":
                        self.assertEqual(
                            [hour["temp_f"] for hour in view["hours"]], [30] * 24
                        )
                    else:
                        self.assertTrue(all(hour["bands"] for hour in view["hours"]))
                else:
                    self.assertIsNone(card["forecast"])
                    with self.assertRaisesRegex(CardInputError, "no usable"):
                        build_town_card(forecast, None)

    def test_non_exportable_duplicate_cannot_replace_temperature(self):
        for field in ("pressure_sea_inhg", "dew_point_f", "wind_gust_mph"):
            with self.subTest(field=field):
                forecast = self.forecast()
                first = forecast["hourly"][0]
                expected = first["values"]["temp_f"]
                forecast["hourly"].append(dict(first, values={field: 30}, quantiles={}))
                hour = build_town_card(forecast, None)["forecast"]["hours"][0]
                self.assertEqual(hour["temp_f"], expected)

    def assert_bands(self, actual, expected):
        self.assertEqual(len(actual), len(expected))
        for a, b in zip(actual, expected):
            self.assertEqual(a["coverage"], b["coverage"])
            self.assertAlmostEqual(a["low_f"], b["low_f"])
            self.assertAlmostEqual(a["high_f"], b["high_f"])

    def test_shared_quantile_edges_and_missing_point_values(self):
        for case in EDGES["quantiles"]:
            with self.subTest(case=case["name"]):
                self.assertAlmostEqual(
                    quantile_at(case["grid"], case["at"]["probability"]),
                    case["at"]["value"],
                )
                self.assert_bands(bands(case["grid"]), case["card_bands"])
                forecast = self.forecast()
                forecast["hourly"][0]["values"]["temp_f"] = case["temp_f"]
                forecast["hourly"][0]["quantiles"]["temp_f"] = case["grid"]
                hour = build_town_card(forecast, None)["forecast"]["hours"][0]
                self.assertEqual(hour["temp_f"], case["temp_f"])
                self.assert_bands(hour["bands"], case["card_bands"])

    def test_empty_nonfinite_and_single_level_quantiles(self):
        self.assertEqual(bands({}), [])
        self.assertEqual(
            bands({"bad": 4, "0.5": float("nan"), "0.9": float("inf")}), []
        )
        self.assertEqual(
            bands({"0.5": 4}),
            [
                {"coverage": coverage, "low_f": 4, "high_f": 4}
                for coverage in (0.9, 0.6, 0.3)
            ],
        )
        self.assertEqual(quantile_at({"0.1": 10, "0.9": 90}, 0), 10)
        self.assertEqual(quantile_at({"0.1": 10, "0.9": 90}, 1), 90)

    def test_shared_daylight_edges(self):
        for case in EDGES["daylight"]:
            with self.subTest(at=case["valid_time"]):
                self.assertEqual(
                    is_daytime(instant(case["valid_time"]), *PUBLIC_LOCATION),
                    case["is_daytime"],
                )
        for case in EDGES["sun_events"]:
            rise, sunset = station_sun_times(
                instant(case["sunrise"]).astimezone(TZ).date(), *PUBLIC_LOCATION
            )
            self.assertEqual(rise, instant(case["sunrise"]))
            self.assertEqual(sunset, instant(case["sunset"]))
        at = instant("2026-03-15T14:00:00Z")
        sunrise, sunset = station_sun_times(
            at.astimezone(TZ).date(), *PUBLIC_LOCATION
        )
        self.assertEqual(sunrise.isoformat(), '2026-03-15T14:00:37.339000+00:00')
        for boundary in (sunrise, sunset):
            self.assertTrue(is_daytime(boundary, *PUBLIC_LOCATION))
        self.assertFalse(
            is_daytime(sunrise - timedelta(milliseconds=1), *PUBLIC_LOCATION)
        )
        self.assertFalse(
            is_daytime(sunset + timedelta(milliseconds=1), *PUBLIC_LOCATION)
        )

    def test_missing_station_and_partial_forecast(self):
        forecast = self.forecast()
        forecast["hourly"] = forecast["hourly"][7:9]
        result = build_town_card(forecast, None)
        self.assertIsNone(result["observation"])
        self.assertEqual(len(result["forecast"]["hours"]), 24)
        self.assertIsNone(result["forecast"]["hours"][0]["temp_f"])
        self.assertIsNone(result["forecast"]["outlook"])
        self.assertEqual(result["forecast"]["hours"][0]["bands"], [])

    def test_invalid_current_shapes_and_times_have_field_diagnostics(self):
        cases = [
            ([], "current"),
            ({"metadata": []}, "current.metadata"),
            ({"metadata": None}, "current.metadata"),
            ({"data": []}, "current.data"),
        ]
        for value in ("", 4, "yesterday", "2026-10-22T12:00:00"):
            cases.append(
                ({"metadata": {"observed_at": value}}, "current.metadata.observed_at")
            )
        for current, field in cases:
            with self.subTest(current=current):
                diagnostics = []
                card = build_town_card(
                    self.forecast(), current, diagnostic=diagnostics.append
                )
                self.assertIsNone(card["observation"])
                self.assertIsNotNone(card["forecast"])
                self.assertTrue(any(field in message for message in diagnostics))

    def test_invalid_forecast_shapes_and_times_have_field_diagnostics(self):
        for key, value in [
            ("published_at", None),
            ("issued_at", "2026-10-22"),
        ]:
            with (
                self.subTest(key=key, value=value),
                self.assertRaisesRegex(CardInputError, f"forecast.{key}"),
            ):
                forecast = self.forecast()
                forecast[key] = value
                build_town_card(forecast, None)

    def test_bad_product_arrays_and_rows_preserve_other_data(self):
        for key, value in [
            ("hourly", None),
            ("daily", {}),
            ("hourly", [None]),
            ("hourly", [{"valid_time": 3}]),
        ]:
            with self.subTest(key=key, value=value):
                forecast = self.forecast()
                forecast[key] = value
                diagnostics = []
                card = build_town_card(forecast, None, diagnostic=diagnostics.append)
                self.assertIsNotNone(card["forecast"])
                self.assertTrue(
                    any(f"forecast.{key}" in message for message in diagnostics)
                )

    def test_bad_values_leave_gaps_and_bad_quantiles_only_remove_bands(self):
        for key in ("values", "quantiles", "temp_f"):
            forecast = self.forecast()
            original = forecast["hourly"][0]["values"]["temp_f"]
            if key == "temp_f":
                forecast["hourly"][0]["quantiles"][key] = None
            else:
                forecast["hourly"][0][key] = []
            diagnostics = []
            hour = build_town_card(forecast, None, diagnostic=diagnostics.append)[
                "forecast"
            ]["hours"][0]
            self.assertEqual(hour["temp_f"], None if key == "values" else original)
            self.assertEqual(hour["bands"], [])
            self.assertTrue(any(key in message for message in diagnostics))

    def test_irrelevant_rows_and_expired_forecast_are_not_validated(self):
        forecast = self.forecast()
        expected = build_town_card(forecast, None)
        forecast["hourly"].append(
            {"valid_time": "2027-01-01T00:00:00Z", "values": [], "quantiles": []}
        )
        forecast["daily"].insert(0, {"date_local": "2027-01-01", "values": []})
        diagnostics = []
        self.assertEqual(
            build_town_card(forecast, None, diagnostic=diagnostics.append), expected
        )
        self.assertEqual(diagnostics, [])
        forecast["published_at"] = (
            instant(forecast["issued_at"]) + timedelta(hours=12, seconds=1)
        ).isoformat()
        forecast["hourly"] = forecast["daily"] = None
        card = build_town_card(
            forecast, FIXTURE["input"]["current"], diagnostic=diagnostics.append
        )
        self.assertIsNone(card["forecast"])
        self.assertIsNotNone(card["observation"])
        self.assertEqual(diagnostics, [])

    def test_daily_first_match_is_authoritative_even_if_empty_or_bad(self):
        for first in ({}, None, []):
            with self.subTest(first=first):
                forecast = self.forecast()
                row = forecast["daily"][0]
                forecast["daily"] = [dict(row, values=first), row]
                diagnostics = []
                view = build_town_card(forecast, None, diagnostic=diagnostics.append)[
                    "forecast"
                ]
                self.assertIsNone(view["high_f"])
                self.assertIsNone(view["low_f"])
                self.assertEqual(
                    bool(diagnostics), first is None or isinstance(first, list)
                )

    def test_last_usable_hourly_duplicate_wins(self):
        forecast = self.forecast()
        first = forecast["hourly"][0]
        later = copy.deepcopy(first)
        later["values"]["temp_f"] = 99
        forecast["hourly"].extend(
            [later, dict(first, values=[]), dict(first, values={}, quantiles={})]
        )
        diagnostics = []
        hour = build_town_card(forecast, None, diagnostic=diagnostics.append)[
            "forecast"
        ]["hours"][0]
        self.assertEqual(hour["temp_f"], 99)
        self.assertTrue(any("values" in message for message in diagnostics))

    def test_condition_only_duplicate_replaces_the_whole_hour(self):
        for case in EDGES["condition_only_duplicates"]:
            with self.subTest(name=case["name"]):
                forecast = self.forecast()
                first = forecast["hourly"][0]
                forecast["hourly"].append(
                    dict(first, values=case["values"], quantiles={})
                )
                hour = build_town_card(forecast, None)["forecast"]["hours"][0]
                self.assertEqual(
                    hour,
                    {
                        "valid_time": first["valid_time"],
                        "temp_f": None,
                        "pop": None,
                        "bands": [],
                    },
                )

    def test_temperature_only_policy_keeps_values_without_ui_default_outlook(self):
        case = EDGES["temperature_only"]
        forecast = self.forecast()
        forecast["published_at"] = FIXTURE["expected"]["forecast"]["hours"][0][
            "valid_time"
        ]
        forecast["hourly"] = [
            dict(
                valid_time=hour["valid_time"],
                values={"temp_f": case["temp_f"]},
                quantiles={},
            )
            for hour in FIXTURE["expected"]["forecast"]["hours"]
        ]
        view = build_town_card(forecast, None)["forecast"]
        self.assertEqual(view["outlook"], case["card_outlook"])
        self.assertEqual(
            [hour["temp_f"] for hour in view["hours"]], [case["temp_f"]] * 24
        )

    def test_empty_or_all_null_forecast_is_absent(self):
        for values in (
            {},
            {"temp_f": None, "humidity_pct": None},
            {"temp_f": float("nan")},
        ):
            with self.subTest(values=values):
                forecast = self.forecast()
                forecast["daily"] = []
                for row in forecast["hourly"]:
                    row["values"] = values
                    row["quantiles"] = {}
                card = build_town_card(forecast, FIXTURE["input"]["current"])
                self.assertIsNone(card["forecast"])
                with self.assertRaisesRegex(CardInputError, "no usable"):
                    build_town_card(forecast, None)

    def test_each_exported_forecast_kind_makes_a_section_usable(self):
        for kind in ("high", "low", "temp", "pop", "bands", "outlook"):
            with self.subTest(kind=kind):
                forecast = self.forecast()
                forecast["daily"] = []
                for row in forecast["hourly"]:
                    row["values"] = {}
                    row["quantiles"] = {}
                if kind in ("high", "low"):
                    forecast["daily"] = [
                        {
                            "date_local": "2026-10-22",
                            "values": {
                                f"temp_{'max' if kind == 'high' else 'min'}_f": 0
                            },
                        }
                    ]
                elif kind == "bands":
                    forecast["hourly"][0]["quantiles"] = {"temp_f": {"0.5": 40}}
                elif kind == "outlook":
                    for row in forecast["hourly"]:
                        row["values"] = {"humidity_pct": 90}
                else:
                    forecast["hourly"][0]["values"] = {
                        "temp_f" if kind == "temp" else "pop": 0
                    }
                self.assertIsNotNone(build_town_card(forecast, None)["forecast"])

    def test_observation_requires_a_finite_reading_but_accepts_zero_and_old_dates(self):
        forecast = self.forecast()
        for current in (
            None,
            {},
            {"data": {"outTemp": 50}},
            {
                "metadata": {"observed_at": "2020-01-01T00:00:00Z"},
                "data": {"outTemp": None, "avgwind": True, "gustspeed": float("inf")},
            },
        ):
            self.assertIsNone(build_town_card(forecast, current)["observation"])
        current = {
            "metadata": {"observed_at": "2020-01-01T00:00:00Z"},
            "data": {"rain_total_in": 0},
        }
        observation = build_town_card(forecast, current)["observation"]
        self.assertEqual(observation["rain_total_in"], 0)
        self.assertEqual(observation["rain_date"], "2019-12-31")
        self.assertEqual(observation["observed_at"], "2020-01-01T00:00:00+00:00")

    def test_station_identity_and_exact_expiry(self):
        forecast = self.forecast()
        with self.assertRaisesRegex(CardInputError, "Lake Arrowhead"):
            build_town_card(forecast, None, station_location=(40, -120))
        forecast["issued_at"] = (
            instant(forecast["published_at"]) - timedelta(hours=12)
        ).isoformat()
        self.assertIsNotNone(build_town_card(forecast, None)["forecast"])
        forecast["published_at"] = (
            instant(forecast["published_at"]) + timedelta(seconds=1)
        ).isoformat()
        self.assertIsNone(
            build_town_card(forecast, FIXTURE["input"]["current"])["forecast"]
        )
        with self.assertRaisesRegex(CardInputError, "no usable"):
            build_town_card(
                forecast, {"metadata": {"observed_at": forecast["issued_at"]}}
            )

    def test_next_full_hour_includes_an_exact_hour(self):
        forecast = self.forecast()
        for published, expected in [
            ("2026-10-22T13:00:00Z", "2026-10-22T13:00:00+00:00"),
            ("2026-10-22T13:00:01Z", "2026-10-22T14:00:00+00:00"),
        ]:
            forecast["published_at"] = published
            self.assertEqual(
                build_town_card(forecast, None)["forecast"]["hours"][0]["valid_time"],
                expected,
            )

    def test_populated_dst_windows_preserve_values_bands_dates_and_summary_groups(self):
        for case in EDGES["dst"]:
            with self.subTest(case=case["name"]):
                forecast = self.forecast()
                forecast["published_at"] = forecast["issued_at"] = case["published_at"]
                start = instant(case["published_at"])
                times = [start + timedelta(hours=i) for i in range(24)]
                forecast["hourly"] = [
                    {
                        "valid_time": at.isoformat(),
                        "values": {
                            "temp_f": 40 + i,
                            "humidity_pct": 30 if at.astimezone(TZ).hour < 6 else 90,
                        },
                        "quantiles": {"temp_f": {"0.05": 30 + i, "0.95": 50 + i}},
                    }
                    for i, at in enumerate(times)
                ]
                day = start.astimezone(TZ).date().isoformat()
                forecast["daily"] = [
                    {"date_local": day, "values": {"temp_max_f": 70, "temp_min_f": 30}}
                ]
                result = build_town_card(forecast, None)["forecast"]
                hours = result["hours"]
                self.assertEqual([instant(h["valid_time"]) for h in hours], times)
                self.assertEqual(len(set(h["valid_time"] for h in hours)), 24)
                self.assertEqual([h["temp_f"] for h in hours], list(range(40, 64)))
                self.assertEqual(
                    [h["bands"][0]["low_f"] for h in hours], list(range(30, 54))
                )
                local_times = [
                    instant(h["valid_time"]).astimezone(TZ).isoformat() for h in hours
                ]
                self.assertEqual(local_times[:4], case["first_local_times"])
                self.assertEqual(result["date_local"], day)
                self.assertEqual(result["high_f"], 70)
                self.assertEqual(
                    result["outlook"], "Clear skies overnight, cloudy this morning."
                )
                # A sparse first morning hour must belong to Morning even at DST.
                sparse = [
                    (
                        at,
                        "clear-night"
                        if i == 0
                        else "rain"
                        if i == case["morning_offset"]
                        else None,
                    )
                    for i, at in enumerate(times)
                ]
                self.assertEqual(
                    summary(sparse), "Clear skies overnight, rain this morning."
                )


if __name__ == "__main__":
    unittest.main()
