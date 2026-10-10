"""Rainfall is accumulated counter movement, not an average rain rate."""

import sqlite3
import tempfile
import unittest
from pathlib import Path

from publish_station import add_rain_totals, rain_totals


class RainTotalsTests(unittest.TestCase):
    def totals(self, rows):
        return rain_totals(rows, "America/Los_Angeles")

    def test_sustained_rain_counts_each_increment_once(self):
        daily, hourly = self.totals(
            [
                ("2026-10-10 21:36:00", 0),
                ("2026-10-10 21:37:00", 0.01),
                ("2026-10-10 21:38:00", 0.01),
                ("2026-10-10 22:01:00", 0.03),
            ]
        )
        self.assertAlmostEqual(daily["2026-10-10"], 0.03)
        # The tip across a multi-hour logging gap has no known hour.
        self.assertIsNone(hourly[("2026-10-10", "14")])
        self.assertIsNone(hourly[("2026-10-10", "15")])

    def test_midnight_credits_only_new_rain_to_new_day(self):
        daily, hourly = self.totals(
            [
                ("2026-10-10 06:58:00", 0),
                ("2026-10-10 06:59:00", 0.10),
                ("2026-10-10 07:00:00", 0.12),
                ("2026-10-10 07:01:00", 0.12),
            ]
        )
        self.assertAlmostEqual(daily["2026-10-09"], 0.10)
        self.assertAlmostEqual(daily["2026-10-10"], 0.02)
        self.assertAlmostEqual(hourly[("2026-10-10", "00")], 0.02)

    def test_multiple_events_and_jitter_do_not_double_count(self):
        daily, _ = self.totals(
            [
                ("2026-10-10 21:00:00", 0),
                ("2026-10-10 21:01:00", 0.10),
                ("2026-10-10 21:02:00", 0.09),
                ("2026-10-10 21:03:00", 0.10),
                ("2026-10-10 21:04:00", 0.11),
                ("2026-10-10 21:05:00", 0),
                ("2026-10-10 21:06:00", 0.02),
            ]
        )
        self.assertAlmostEqual(daily["2026-10-10"], 0.13)

    def test_gap_spanning_midnight_remains_unknown(self):
        daily, hourly = self.totals(
            [
                ("2026-10-10 06:40:00", 0),
                ("2026-10-10 07:20:00", 0.10),
            ]
        )
        self.assertIsNone(daily["2026-10-09"])
        self.assertIsNone(daily["2026-10-10"])
        self.assertIsNone(hourly[("2026-10-10", "00")])

    def test_initial_counter_and_missing_sensor_do_not_become_zero(self):
        daily, hourly = self.totals(
            [
                ("2026-10-10 21:00:00", 0.10),
                ("2026-10-10 21:01:00", None),
                ("2026-10-10 21:02:00", 0.12),
            ]
        )
        self.assertIsNone(daily["2026-10-10"])
        self.assertIsNone(hourly[("2026-10-10", "14")])

    def test_published_documents_share_totals_and_observation_cutoff(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "station.db"
            with sqlite3.connect(path) as conn:
                conn.execute("CREATE TABLE observations (ts TEXT, eventrain REAL)")
                conn.executemany(
                    "INSERT INTO observations VALUES (?, ?)",
                    [
                        ("2026-10-10 21:36:00", 0),
                        ("2026-10-10 21:37:00", 0.01),
                        ("2026-10-10 21:38:00", 0.02),
                    ],
                )
            documents = {
                "current.json": {
                    "data": {},
                    "metadata": {"observed_at": "2026-10-10 21:37:00"},
                },
                "daily.json": {"data": [{"date": "2026-10-10"}]},
                "hourly.json": {"data": {"2026-10-10": [None, {"hour": "14"}]}},
            }
            add_rain_totals(documents, str(path), "America/Los_Angeles")
            self.assertEqual(documents["current.json"]["data"]["rain_total_in"], 0.01)
            self.assertEqual(documents["daily.json"]["data"][0]["rain_total_in"], 0.01)
            self.assertEqual(
                documents["hourly.json"]["data"]["2026-10-10"][1]["rain_total_in"], 0.01
            )
            self.assertEqual(
                documents["current.json"]["metadata"]["observed_at"],
                "2026-10-10T21:37:00+00:00",
            )


if __name__ == "__main__":
    unittest.main()
