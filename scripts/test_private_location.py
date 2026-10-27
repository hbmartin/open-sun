"""Private identity preflight, including the real installed-file path."""

import json
import os
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import publish_forecast as publisher
import test_publish_town_card as integration


class PrivateLocationTests(unittest.TestCase):
    def setUp(self):
        self.fixture = integration.PublisherTownCardTest()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)

    def test_configuration_failures_never_build_push_or_change_state(self):
        t = self.fixture
        self.assertEqual(t.invoke()[0], 0)
        previous = t.stamp.read_bytes(), t.state.read_bytes()
        pushes = t.push.call_count
        missing_script = t.root / "without-config/publish_forecast.py"
        for env in (
            {},
            {"LOCATION_LATITUDE": "34.25"},
            {"LOCATION_LATITUDE": "", "LOCATION_LONGITUDE": "-117.19"},
            {"LOCATION_LATITUDE": "0x22", "LOCATION_LONGITUDE": "-117.19"},
            {"LOCATION_LATITUDE": "3_4.25", "LOCATION_LONGITUDE": "-117.19"},
            {"LOCATION_LATITUDE": "nan", "LOCATION_LONGITUDE": "-117.19"},
            {"LOCATION_LATITUDE": "1e999", "LOCATION_LONGITUDE": "-117.19"},
            {"LOCATION_LATITUDE": "40", "LOCATION_LONGITUDE": "-120"},
            {"LOCATION_LATITUDE": "34.27", "LOCATION_LONGITUDE": "-117.19"},
        ):
            with (
                self.subTest(env=env),
                patch.dict(os.environ, env, clear=True),
                patch.object(publisher, "__file__", str(missing_script)),
                patch.object(publisher, "build_commit") as build,
                patch.object(publisher, "_git") as git,
                patch.object(publisher, "prepare_town_card") as card,
            ):
                code, _, error = t.invoke(force=True)
                self.assertEqual(code, 2, error)
                self.assertIn("private station location", error)
                self.assertNotIn("Traceback", error)
                build.assert_not_called()
                git.assert_not_called()
                card.assert_not_called()
                self.assertEqual(t.push.call_count, pushes)
                self.assertEqual((t.stamp.read_bytes(), t.state.read_bytes()), previous)

    def test_real_toml_diagnostics_and_environment_precedence(self):
        t = self.fixture
        script = t.root / "publish_forecast.py"
        config = script.with_name("station-location.toml")
        with patch.object(publisher, "__file__", str(script)), patch.dict(os.environ, {}, clear=True):
            for text, message in (
                ("[broken", "valid station-location.toml"),
                ("latitude=34.25", "[station] table"),
                ("[station]\nlatitude=34.25", "longitude: missing"),
                ('[station]\nlatitude="34.23456789"\nlongitude=-117.19', "latitude: expected a number"),
                ("[station]\nlatitude=true\nlongitude=-117.19", "latitude: expected a number"),
                ("[station]\nlatitude=nan\nlongitude=-117.19", "latitude: expected a finite number"),
                ("[station]\nlatitude=91\nlongitude=-117.19", "latitude: must be between"),
                ("[station]\nlatitude=40\nlongitude=-120", "Lake Arrowhead region"),
            ):
                with self.subTest(text=text):
                    config.write_text(text)
                    with self.assertRaises(publisher.RefusedError) as error:
                        publisher.configured_station_location()
                    self.assertIn(message, str(error.exception))
                    self.assertNotIn("34.23456789", str(error.exception))
            config.write_text("[station]\nlatitude=34.25\nlongitude=-117.19\n")
            self.assertEqual(publisher.configured_station_location(), (34.25, -117.19))
            with patch.dict(os.environ, {"LOCATION_LATITUDE": ""}):
                with self.assertRaisesRegex(publisher.RefusedError, "LOCATION_LATITUDE"):
                    publisher.configured_station_location()
            with patch.dict(os.environ, {"LOCATION_LATITUDE": " +3.425e1 ", "LOCATION_LONGITUDE": "-1.1719E2"}):
                config.write_text("[broken")
                self.assertEqual(publisher.configured_station_location(), (34.25, -117.19))

    def test_installed_publisher_reads_colocated_file_and_refuses_bad_overrides(self):
        t = self.fixture
        harness = t.install_harness()
        config = harness.with_name("station-location.toml")
        config.write_text("[station]\nlatitude=34.25\nlongitude=-117.19\n")
        config.chmod(0o600)
        valid = config.read_text()
        for index, (text, overrides) in enumerate((
            (valid, {}),
            ("[broken", {"LOCATION_LATITUDE": "34.25", "LOCATION_LONGITUDE": "-117.19"}),
            (valid, {"LOCATION_LATITUDE": ""}),
            (valid, {"LOCATION_LATITUDE": "34.27", "LOCATION_LONGITUDE": "-117.19"}),
            ("[broken", {}),
            (None, {}),
        )):
            if text is None:
                config.unlink()
            else:
                config.write_text(text)
            home = t.root / f"file-home-{index}"
            (home / "Library/Caches").mkdir(parents=True)
            env = {"HOME": str(home), "PATH": os.defpath, **overrides}
            result = subprocess.run(
                [sys.executable, "-B", "-S", str(harness), str(t.source), str(t.staged), "publish", integration.NOW.isoformat()],
                env=env, capture_output=True, text=True, check=False, timeout=20,
            )
            with self.subTest(overrides=overrides):
                self.assertEqual(result.returncode, 0 if index < 2 else 2, result.stderr)
                tree_path = home / "pushed-tree.json"
                if index < 2:
                    tree = json.loads(tree_path.read_text())
                    self.assertIn("town-card.json", tree)
                    self.assertNotIn('"latitude"', tree["town-card.json"])
                else:
                    self.assertFalse(tree_path.exists())
                    self.assertFalse((home / "Library/Application Support/grounded-weather-forecast/last-published").exists())


if __name__ == "__main__":
    unittest.main()
