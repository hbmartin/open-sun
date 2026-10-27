"""Publisher discovery stays local, explicit, and safe across project moves."""

from datetime import UTC, datetime, timedelta
import contextlib
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import publish_forecast as forecast
import publish_station as station


class PublisherPathsTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="publisher paths ")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        private_location = patch.dict(os.environ, {"LOCATION_LATITUDE": "34.25", "LOCATION_LONGITUDE": "-117.19"})
        private_location.start()
        self.addCleanup(private_location.stop)
        previous = Path.cwd()
        self.addCleanup(os.chdir, previous)
        os.chdir(self.root)
        for module in (forecast, station):
            self.addCleanup(setattr, module, "_log_stream", module._log_stream)
        source_path = patch.object(forecast, "__file__", str(self.root / "installed/publish_forecast.py"))
        source_path.start()
        self.addCleanup(source_path.stop)
        self.configuration = types.ModuleType("ambientweather2sqlite.configuration")
        self.configuration.get_config_path = Mock(return_value=self.root / "aw2sqlite.toml")
        self.configuration.load_config = Mock(
            return_value=types.SimpleNamespace(database_path="station data/observations.db")
        )
        modules = patch.dict(sys.modules, {
            "ambientweather2sqlite": types.ModuleType("ambientweather2sqlite"),
            "ambientweather2sqlite.configuration": self.configuration,
        })
        modules.start()
        self.addCleanup(modules.stop)

    def project(self, parent, name="grounded-weather-forecast"):
        project = parent / name
        project.mkdir(parents=True)
        (project / "pyproject.toml").write_text(f'[project]\nname = "{name}"\n')
        return project

    def document(self, path):
        path.write_text(
            json.dumps(
                {
                    "schema_version": 6,
                    "status": "ready",
                    "timezone": "America/Los_Angeles",
                    "latitude": 34.25,
                    "longitude": -117.19,
                    "dataset_fingerprint": "test",
                    "issued_at": "2026-10-19T18:35:00+00:00",
                    "hourly": [],
                    "daily": [],
                }
            )
        )
        return path

    def checkout(self, parent):
        checkout = parent / "open-sun"
        checkout.mkdir(parents=True)
        (checkout / "package.json").write_text('{"name":"open-sun"}')
        return checkout

    def test_active_forecast_takes_precedence_over_checkout_sibling(self):
        active = self.document(self.root / "forecast.json")
        checkout = self.checkout(self.root / "other")
        self.document(self.project(checkout.parent) / "forecast.json")
        with patch.object(forecast, "__file__", str(checkout / "scripts/publish_forecast.py")):
            self.assertEqual(forecast.resolve_source(), active)

    def test_checkout_invocation_discovers_validated_sibling(self):
        checkout = self.checkout(self.root)
        source = self.document(self.project(self.root) / "forecast.json")
        os.chdir(checkout)
        self.assertEqual(forecast.resolve_source(), source)

    def test_installed_script_has_no_unrelated_sibling_fallback(self):
        with self.assertRaisesRegex(forecast.RefusedError, "--source"):
            forecast.resolve_source()

    def test_explicit_source_does_not_require_any_project(self):
        source = self.document(self.root / "custom forecast.json")
        self.assertEqual(forecast.resolve_source(source), source)

    def test_missing_active_output_never_uses_another_checkout(self):
        active = self.project(self.root / "active")
        checkout = self.checkout(self.root / "other")
        self.document(self.project(checkout.parent) / "forecast.json")
        os.chdir(active)
        with patch.object(forecast, "__file__", str(checkout / "scripts/publish_forecast.py")):
            self.assertEqual(forecast.resolve_source(), active / "forecast.json")

    def test_wrong_sibling_identity_is_refused(self):
        checkout = self.checkout(self.root)
        sibling = self.project(self.root)
        (sibling / "pyproject.toml").write_text('[project]\nname = "unrelated"\n')
        self.document(sibling / "forecast.json")
        os.chdir(checkout)
        with self.assertRaisesRegex(forecast.RefusedError, "--source"):
            forecast.resolve_source()

    def test_ambiguous_checkout_siblings_are_refused(self):
        first = self.checkout(self.root / "first")
        second = self.checkout(self.root / "second")
        self.project(first.parent)
        self.project(second.parent)
        os.chdir(first)
        with (
            patch.object(forecast, "__file__", str(second / "scripts/publish_forecast.py")),
            self.assertRaisesRegex(forecast.RefusedError, "multiple forecast projects"),
        ):
            forecast.resolve_source()

    def test_missing_explicit_source_never_pushes_or_advances_stamp(self):
        self.document(self.root / "forecast.json")
        stamp = self.root / "last-published"
        stamp.write_text("previous\n")
        with (
            patch.object(forecast, "STAMP", stamp),
            patch.object(forecast, "push") as push,
            patch.object(forecast, "build_commit") as build,
            contextlib.redirect_stderr(io.StringIO()),
        ):
            self.assertEqual(forecast.main(["--source", "missing.json"]), 2)
        push.assert_not_called()
        build.assert_not_called()
        self.assertEqual(stamp.read_text(), "previous\n")

    def test_malformed_metadata_has_actionable_refusal(self):
        (self.root / "pyproject.toml").write_text("[broken")
        with contextlib.redirect_stderr(io.StringIO()) as output:
            self.assertEqual(forecast.main(["--dry-run"]), 2)
        self.assertIn("use --source", output.getvalue())

    def test_installed_copy_discovers_active_project_without_git(self):
        installed = self.root / "installed scripts"
        installed.mkdir()
        # Locate the reviewed source independently of the patched discovery anchor.
        script = Path(__file__).with_name("publish_forecast.py")
        shutil.copyfile(script, installed / script.name)
        shutil.copyfile(script.with_name("town_card.py"), installed / "town_card.py")
        (installed / "station-location.toml").write_text("[station]\nlatitude=34.25\nlongitude=-117.19\n")
        active = self.project(self.root)
        source = self.document(active / "forecast.json")
        document = json.loads(source.read_text())
        document.update(latitude=34.25, longitude=-117.19, timezone="America/Los_Angeles", issued_at=datetime.now(UTC).isoformat())
        document["hourly"] = [{
            "valid_time": (datetime.now(UTC).replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)).isoformat(),
            "lead_hours": 1, "lead_bucket": "1-3h", "values": {"temp_c": 10, "humidity_pct": 50},
        }]
        source.write_text(json.dumps(document))
        env = {key: value for key, value in os.environ.items() if key not in ("LOCATION_LATITUDE", "LOCATION_LONGITUDE")}
        result = subprocess.run(
            [sys.executable, str(installed / script.name), "--dry-run", "--print"],
            cwd=active, env=env, capture_output=True, text=True, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["status"], "ready")
        self.assertNotIn("omitting town-card", result.stderr)

    def test_station_uses_collector_config_and_relative_database_semantics(self):
        database = self.root / "station data/observations.db"
        database.parent.mkdir()
        database.touch()
        self.assertEqual(station.resolve_database(), database)
        self.configuration.load_config.assert_called_once_with(self.root / "aw2sqlite.toml")

    def test_explicit_database_overrides_collector_config(self):
        database = self.root / "custom observations.db"
        database.touch()
        self.assertEqual(station.resolve_database(database), database)
        self.configuration.get_config_path.assert_not_called()

    def test_database_discovery_failures_write_no_documents(self):
        for fault in ("no-config", "malformed", "missing-db", "invalid-key", "explicit-missing"):
            with self.subTest(fault=fault):
                self.configuration.get_config_path.return_value = self.root / "aw2sqlite.toml"
                self.configuration.load_config.side_effect = None
                self.configuration.load_config.return_value = types.SimpleNamespace(database_path="missing.db")
                args = ["--out-dir", str(self.root / "output")]
                match fault:
                    case "no-config":
                        self.configuration.get_config_path.return_value = None
                    case "malformed":
                        self.configuration.load_config.side_effect = ValueError("invalid config")
                    case "invalid-key":
                        self.configuration.load_config.return_value.database_path = ""
                    case "explicit-missing":
                        args += ["--db", "also-missing.db"]
                with (
                    patch.object(station, "build_documents") as build,
                    contextlib.redirect_stderr(io.StringIO()),
                ):
                    self.assertEqual(station.main(args), 2)
                build.assert_not_called()
                self.assertFalse((self.root / "output").exists())


if __name__ == "__main__":
    unittest.main()
