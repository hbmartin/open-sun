"""Station identity must protect the hold cache as well as the public branch."""

import io
import json
import os
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import publish_forecast as publisher
import test_publish_town_card as integration


class StationHoldTests(unittest.TestCase):
    def setUp(self):
        self.fixture = integration.PublisherTownCardTest()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.held = self.fixture.root / "held.json"
        self.good = self.fixture.source.read_bytes()

    def select(self):
        with patch.object(publisher, "_log_stream", io.StringIO()):
            return publisher.choose_source(
                self.fixture.source,
                self.held,
                now=integration.NOW,
            )

    def wrong_source(self, location):
        document = json.loads(self.good)
        document.update(latitude=location[0], longitude=location[1])
        return publisher.serialise(document)

    def test_wrong_ready_preserves_good_hold_and_publishes_fallback(self):
        t = self.fixture
        for location in ((34.27, -117.19), (40, -120)):
            with self.subTest(location=location):
                self.held.write_bytes(self.good)
                self.held.chmod(0o600)
                t.source.write_bytes(self.wrong_source(location))
                selected = self.select()
                self.assertEqual(selected, self.held)
                self.assertEqual(self.held.read_bytes(), self.good)
                self.assertEqual(self.held.stat().st_mode & 0o777, 0o600)
                self.assertEqual(t.invoke(source=selected, force=True)[0], 0)
                t.assert_core_files(card=True)
                self.assertEqual(
                    json.loads(t.trees[-1]["forecast.json"])["status"],
                    "ready",
                )

    def test_remember_good_rejects_wrong_station_without_touching_hold(self):
        t = self.fixture
        self.held.write_bytes(self.good)
        self.held.chmod(0o600)
        for location in ((34.27, -117.19), (40, -120)):
            with self.subTest(location=location):
                t.source.write_bytes(self.wrong_source(location))
                with self.assertRaises(publisher.RefusedError):
                    publisher.remember_good(t.source, self.held, now=integration.NOW)
                self.assertEqual(self.held.read_bytes(), self.good)
                self.assertEqual(self.held.stat().st_mode & 0o777, 0o600)

    def test_poisoned_hold_cannot_pin_valid_degraded_input(self):
        t = self.fixture
        for location in ((34.27, -117.19), (40, -120)):
            with self.subTest(location=location):
                poisoned = self.wrong_source(location)
                self.held.write_bytes(poisoned)
                document = json.loads(self.good) | {"status": "degraded"}
                t.source.write_bytes(publisher.serialise(document))
                selected = self.select()
                self.assertEqual(selected, t.source)
                self.assertEqual(self.held.read_bytes(), poisoned)
                code, _, error = t.invoke(source=selected, force=True)
                self.assertEqual(code, 0, error)
                self.assertEqual(
                    json.loads(t.trees[-1]["forecast.json"])["status"],
                    "degraded",
                )
                t.source.write_bytes(self.good)
                self.assertEqual(self.select(), t.source)
                self.assertEqual(self.held.read_bytes(), self.good)

    def test_wrong_station_without_hold_refuses_without_git(self):
        t = self.fixture
        for location in ((34.27, -117.19), (40, -120)):
            with self.subTest(location=location):
                t.source.write_bytes(self.wrong_source(location))
                self.assertEqual(self.select(), t.source)
                with patch.object(publisher, "_git") as git:
                    self.assertEqual(t.invoke()[0], 2)
                git.assert_not_called()
                t.push.assert_not_called()
                self.assertFalse(self.held.exists())
                self.assertFalse(t.stamp.exists())
                self.assertFalse(t.state.exists())

    def test_publication_revalidates_file_changed_after_selection(self):
        t = self.fixture
        selected = self.select()
        self.assertEqual(selected, t.source)
        t.source.write_bytes(self.wrong_source((34.27, -117.19)))
        with patch.object(publisher, "_git") as git:
            self.assertEqual(t.invoke(source=selected)[0], 2)
        git.assert_not_called()
        self.assertEqual(self.held.read_bytes(), self.good)
        self.assertFalse(t.stamp.exists())
        self.assertFalse(t.state.exists())

    def test_configuration_is_loaded_once_per_operation(self):
        t = self.fixture
        self.held.write_bytes(self.good)
        t.source.write_bytes(self.wrong_source((34.27, -117.19)))
        with patch.object(
            publisher,
            "configured_station_location",
            wraps=publisher.configured_station_location,
        ) as configured:
            self.assertEqual(self.select(), self.held)
            configured.assert_called_once()
            configured.reset_mock()
            publisher.remember_good(
                self.held, now=integration.NOW, held=t.root / "other.json"
            )
            configured.assert_called_once()
            configured.reset_mock()
            self.assertEqual(t.invoke(source=self.held, dry_run=True)[0], 0)
            configured.assert_called_once()

    def test_invalid_config_never_reads_or_changes_the_hold(self):
        t = self.fixture
        self.held.write_bytes(self.good)
        for error in ("missing private configuration", "invalid private configuration"):
            with (
                self.subTest(error=error),
                patch.object(
                    publisher,
                    "configured_station_location",
                    side_effect=publisher.RefusedError(error),
                ),
                patch.object(publisher, "_read_document") as read,
            ):
                self.assertEqual(self.select(), t.source)
                read.assert_not_called()
                with self.assertRaises(publisher.RefusedError):
                    publisher.remember_good(t.source, self.held, now=integration.NOW)
                read.assert_not_called()
            self.assertEqual(self.held.read_bytes(), self.good)

    def test_installed_selector_then_publisher_refuses_bad_config(self):
        t = self.fixture
        harness = t.install_harness()
        harness.write_text(
            harness.read_text().replace(
                "publisher.push = mocked_push\n",
                "publisher.push = mocked_push\nsource = publisher.choose_source(Path(source), Path.home() / 'held.json', now=datetime.fromisoformat(now))\n",
            )
        )
        config = harness.with_name("station-location.toml")
        for index, text in enumerate(
            (None, "[broken", "[station]\nlatitude=40\nlongitude=-120\n")
        ):
            if text is not None:
                config.write_text(text)
            home = t.root / f"bad-config-{index}"
            (home / "Library/Caches").mkdir(parents=True)
            held = home / "held.json"
            held.write_bytes(self.good)
            result = subprocess.run(
                [
                    sys.executable,
                    "-B",
                    "-S",
                    str(harness),
                    str(t.source),
                    str(t.staged),
                    "publish",
                    integration.NOW.isoformat(),
                ],
                env={"HOME": str(home), "PATH": os.defpath},
                capture_output=True,
                text=True,
                check=False,
                timeout=20,
            )
            self.assertEqual(result.returncode, 2, result.stderr)
            self.assertNotIn("Traceback", result.stderr)
            self.assertEqual(held.read_bytes(), self.good)
            self.assertFalse((home / "pushed-tree.json").exists())
            self.assertFalse(
                (
                    home / "Library/Application Support/grounded-weather-forecast"
                ).exists()
            )

    def test_private_location_changes_do_not_change_public_weather(self):
        t = self.fixture
        t.document["hourly"][0]["values"]["temp_c"] = 1.25
        for location in ((34.25, -117.19), (34.23456789, -117.21234567)):
            t.document.update(latitude=location[0], longitude=location[1])
            t.save_source()
            with patch.dict(
                os.environ,
                {
                    "LOCATION_LATITUDE": str(location[0]),
                    "LOCATION_LONGITUDE": str(location[1]),
                },
            ):
                self.assertEqual(t.invoke(force=True)[0], 0)
        for name in ("forecast.json", "town-card.json"):
            self.assertEqual(t.trees[-2][name], t.trees[-1][name])
            raw = t.trees[-1][name].decode()
            self.assertNotRegex(raw, r'"(?:latitude|longitude|lat|lon)"\s*:')
        self.assertEqual(
            json.loads(t.trees[-1]["forecast.json"])["hourly"][0]["values"]["temp_f"],
            34.25,
        )


if __name__ == "__main__":
    unittest.main()
