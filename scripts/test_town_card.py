"""Contract parity, missing data and absolute-hour regression tests."""
import copy
import json
import unittest
import subprocess
import tempfile
from datetime import UTC, datetime
from pathlib import Path

from publish_forecast import build_commit, serialise
from town_card import bands, build_town_card, quantile_at

FIXTURE = json.loads((Path(__file__).resolve().parent.parent / 'lib/__fixtures__/town-card.json').read_text())


class TownCardTest(unittest.TestCase):
    def test_shared_document(self):
        self.assertEqual(build_town_card(**FIXTURE['input']), FIXTURE['expected'])

    def test_one_git_commit_contains_forecast_station_and_card(self):
        with tempfile.TemporaryDirectory() as temporary:
            git_dir = Path(temporary) / "repo.git"
            data = FIXTURE["input"]
            extras = {"current.json": serialise(data["current"]), "daily.json": b'{"data":[]}'}
            commit = build_commit(serialise(data["forecast"]), git_dir, "data", data["forecast"]["issued_at"], extras)
            def show(path):
                return subprocess.check_output(["git", "--git-dir", str(git_dir), "show", f"{commit}:{path}"])
            self.assertEqual(json.loads(show("town-card.json")), FIXTURE["expected"])
            self.assertEqual(json.loads(show("current.json")), data["current"])
            self.assertEqual(show("daily.json"), extras["daily.json"])
            self.assertEqual(json.loads(show("forecast.json")), data["forecast"])

    def test_missing_station_and_partial_forecast(self):
        forecast = copy.deepcopy(FIXTURE['input']['forecast'])
        forecast['hourly'] = forecast['hourly'][7:9]
        result = build_town_card(forecast, None)
        self.assertIsNone(result['observation'])
        self.assertEqual(len(result['forecast']['hours']), 24)
        self.assertIsNone(result['forecast']['hours'][0]['temp_f'])
        self.assertIsNone(result['forecast']['outlook'])
        self.assertEqual(result['forecast']['hours'][0]['bands'], [])

    def test_quantile_interpolation(self):
        self.assertAlmostEqual(quantile_at({'0.1': 10, '0.9': 90}, .2), 20)
        self.assertEqual(bands({}), [])
        self.assertEqual(len(bands({'0.05': 0, '0.95': 100})), 3)

    def test_station_identity_and_expired_forecast(self):
        forecast = copy.deepcopy(FIXTURE['input']['forecast'])
        forecast['latitude'] = 40
        with self.assertRaises(ValueError):
            build_town_card(forecast, None)
        forecast['latitude'] = 34.2768
        forecast['issued_at'] = '2020-01-01T00:00:00Z'
        self.assertIsNone(build_town_card(forecast, FIXTURE['input']['current'])['forecast'])

    def test_daylight_saving_keeps_24_consecutive_instants(self):
        forecast = copy.deepcopy(FIXTURE['input']['forecast'])
        forecast['published_at'] = forecast['issued_at'] = '2026-11-01T07:00:00Z'
        result = build_town_card(forecast, None)
        hours = result['forecast']['hours']
        instants = [datetime.fromisoformat(h['valid_time']).astimezone(UTC).timestamp() for h in hours]
        self.assertEqual(len(set(instants)), 24)
        self.assertTrue(all(b - a == 3600 for a, b in zip(instants, instants[1:])))


if __name__ == '__main__':
    unittest.main()
