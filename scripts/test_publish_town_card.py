"""Publisher behavior against real temporary Git trees; network pushes are mocked."""

import builtins
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
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfoNotFoundError

import publish_forecast as publisher
import town_card

NOW = datetime(2026, 10, 22, 12, 48, 11, tzinfo=UTC)

# A fresh interpreter derives all paths from HOME. Only the network push is
# replaced; input parsing, Git construction, and state writes are production code.
INSTALLED_HARNESS = """\
import json
import sys
from datetime import datetime
from pathlib import Path
import publish_forecast as publisher

source, staged, mode, now = sys.argv[1:]

def mocked_push(git_dir, remote, branch):
    if mode == "fail":
        raise publisher.GitError("injected failed push")
    env = publisher._git_env(git_dir)
    names = publisher._git(["ls-tree", "-r", "--name-only", branch], env).splitlines()
    tree = {name: publisher._git(["show", f"{branch}:{name}"], env) for name in names}
    (Path.home() / "pushed-tree.json").write_text(json.dumps(tree), encoding="utf-8")

publisher.push = mocked_push
raise SystemExit(publisher.run(
    source=source, include_dir=staged, now=datetime.fromisoformat(now),
    dry_run=mode == "dry-run", no_push=mode == "no-push",
    force=mode in {"fail", "dry-run", "no-push"},
))
"""


class PublisherTownCardTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="town publisher ")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        (self.root / "Library/Caches").mkdir(parents=True)
        self.stamp = self.root / "state/last-published"
        for patcher in (
            patch.object(Path, "home", return_value=self.root),
            patch.dict(os.environ, {
                "HOME": str(self.root),
                "LOCATION_LATITUDE": "34.25",
                "LOCATION_LONGITUDE": "-117.19",
            }),
            patch.object(publisher, "STAMP", self.stamp),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)
        self.state = publisher.publication_state_path(
            publisher.DEFAULT_REMOTE, publisher.DEFAULT_BRANCH
        )
        self.addCleanup(setattr, publisher, "_log_stream", publisher._log_stream)
        self.source = self.root / "forecast.json"
        self.document = {
            "schema_version": 6,
            "status": "ready",
            "issued_at": "2026-10-22T12:46:00+00:00",
            "latitude": 34.25,
            "longitude": -117.19,
            "timezone": "America/Los_Angeles",
            "dataset_fingerprint": "test",
            "hourly": [
                {
                    "valid_time": (
                        NOW.replace(minute=0, second=0) + timedelta(hours=i + 1)
                    ).isoformat(),
                    "lead_hours": i + 1,
                    "lead_bucket": "1-3h",
                    "values": {"temp_c": 10 + i},
                    "quantiles": {"temp_c": {"0.05": 5 + i, "0.95": 15 + i}},
                }
                for i in range(24)
            ],
            "daily": [
                {
                    "date_local": "2026-10-22",
                    "lead_days": 0,
                    "values": {"temp_max_c": 20, "temp_min_c": 5},
                }
            ],
        }
        self.save_source()
        self.staged = self.root / "staged"
        self.staged.mkdir()
        self.current = {
            "metadata": {"observed_at": "2026-10-22T12:47:00+00:00"},
            "data": {"outTemp": 50},
        }
        (self.staged / "current.json").write_bytes(publisher.serialise(self.current))
        for name in ("daily.json", "hourly.json"):
            (self.staged / name).write_bytes(b'{"data":[]}\n')
        self.trees = []
        patcher = patch.object(publisher, "push", side_effect=self.capture_tree)
        self.push = patcher.start()
        self.addCleanup(patcher.stop)

    def save_source(self):
        self.source.write_text(json.dumps(self.document))

    def install_harness(self):
        installed = self.root / "harness-install"
        installed.mkdir()
        for name in ("publish_forecast.py", "town_card.py"):
            shutil.copyfile(Path(publisher.__file__).with_name(name), installed / name)
        harness = installed / "run_publisher.py"
        harness.write_text(INSTALLED_HARNESS, encoding="utf-8")
        return harness

    def invoke_installed(self, harness, home, mode):
        (home / "Library/Caches").mkdir(parents=True, exist_ok=True)
        return subprocess.run(
            [
                sys.executable,
                "-B",
                "-S",
                str(harness),
                str(self.source),
                str(self.staged),
                mode,
                NOW.isoformat(),
            ],
            env={
                "HOME": str(home),
                "PATH": os.defpath,
                "PYTHONIOENCODING": "utf-8",
                "LOCATION_LATITUDE": "34.25",
                "LOCATION_LONGITUDE": "-117.19",
            },
            capture_output=True,
            text=True,
            check=False,
        )

    def capture_tree(self, git_dir, remote, branch):
        def git(*args):
            return subprocess.check_output(
                [publisher.GIT, *args], env=publisher._git_env(git_dir)
            )

        names = git("ls-tree", "-r", "--name-only", branch).decode().splitlines()
        self.trees.append({name: git("show", f"{branch}:{name}") for name in names})
        self.assertEqual(git("rev-list", "--count", branch).strip(), b"1")

    def invoke(self, *, station=True, **kwargs):
        options = {"source": self.source, "now": NOW}
        if station:
            options["include_dir"] = self.staged
        options.update(kwargs)
        with (
            contextlib.redirect_stdout(io.StringIO()) as out,
            contextlib.redirect_stderr(io.StringIO()) as err,
        ):
            code = publisher.run(**options)
        return code, out.getvalue(), err.getvalue()

    def assert_core_files(self, *, card):
        expected = {
            "README.md",
            "forecast.json",
            "vercel.json",
            "current.json",
            "daily.json",
            "hourly.json",
        }
        if card:
            expected.add("town-card.json")
        self.assertEqual(set(self.trees[-1]), expected)
        for name in ("current.json", "daily.json", "hourly.json"):
            self.assertEqual(self.trees[-1][name], (self.staged / name).read_bytes())
        self.assertEqual(
            json.loads(self.trees[-1]["forecast.json"])["publisher_version"], "2.1.0"
        )

    def test_single_card_build_and_one_commit_contains_all_documents(self):
        with patch.object(
            town_card, "build_town_card", wraps=town_card.build_town_card
        ) as build:
            self.assertEqual(self.invoke()[0], 0)
        build.assert_called_once()
        self.assertNotIn("latitude", build.call_args.args[0])
        self.assertNotIn("longitude", build.call_args.args[0])
        self.assertEqual(build.call_args.kwargs["station_location"], (34.25, -117.19))
        self.assert_core_files(card=True)
        card = json.loads(self.trees[-1]["town-card.json"])
        self.assertEqual(card["observation"]["temp_f"], 50)
        self.assertEqual(
            card["forecast"]["hours"][0]["valid_time"], "2026-10-22T13:00:00+00:00"
        )
        self.assertEqual(self.stamp.read_text(), self.document["issued_at"] + "\n")
        self.assertEqual(json.loads(self.state.read_text())["schema_version"], 2)

    def test_both_public_documents_omit_private_coordinates(self):
        self.document.update(latitude=34.23456789, longitude=-117.21234567)
        self.save_source()
        with patch.dict(os.environ, {
            "LOCATION_LATITUDE": str(self.document["latitude"]),
            "LOCATION_LONGITUDE": str(self.document["longitude"]),
        }):
            self.assertEqual(self.invoke()[0], 0)
        self.assert_core_files(card=True)
        for name in ("forecast.json", "town-card.json"):
            content = self.trees[-1][name].decode()
            payload = json.loads(content)
            self.assertEqual(payload["schema_version"], 2)
            self.assertNotIn('"latitude"', content)
            self.assertNotIn('"longitude"', content)
            for key in ("latitude", "longitude"):
                self.assertNotIn(str(self.document[key]), content)

    def test_invalid_current_recovers_observation_and_wrong_station_refuses_publication(self):
        for current in (
            [],
            {"metadata": None},
            {"metadata": []},
            {"data": []},
            {"metadata": {"observed_at": "2026-10-22T12:47:00"}},
        ):
            with self.subTest(current=current):
                (self.staged / "current.json").write_bytes(publisher.serialise(current))
                code, _, error = self.invoke()
                self.assertEqual(code, 0)
                self.assertIn("warning: town-card.json: current", error)
                self.assertNotIn("Traceback", error)
                self.assert_core_files(card=True)
                card = json.loads(self.trees[-1]["town-card.json"])
                self.assertIsNone(card["observation"])
                self.assertIsNotNone(card["forecast"])
        self.document["latitude"] = 40
        self.save_source()
        pushes = self.push.call_count
        code, _, error = self.invoke()
        self.assertEqual(code, 2)
        self.assertIn("Lake Arrowhead", error)
        self.assertEqual(self.push.call_count, pushes)

    def test_unexpected_card_error_and_serialization_error_keep_tracebacks(self):
        for options in (
            {"side_effect": KeyError("card programming bug")},
            {"return_value": {"bad": float("nan")}},
            {"return_value": []},
        ):
            with (
                self.subTest(options=options),
                patch.object(town_card, "build_town_card", **options),
            ):
                code, _, error = self.invoke(force=True)
            self.assertEqual(code, 0)
            self.assertIn("Traceback", error)
            self.assertIn("omitting town-card.json", error)
            self.assert_core_files(card=False)

    def test_failed_import_does_not_block_core(self):
        with patch.dict(sys.modules, {"town_card": None}):
            code, _, error = self.invoke()
        self.assertEqual(code, 0)
        self.assertIn("helper unavailable", error)
        self.assertIn("ModuleNotFoundError", error)
        self.assert_core_files(card=False)

    def test_timezone_import_failure_still_commits_core_documents(self):
        original_import = builtins.__import__

        def without_timezone(name, *args, **kwargs):
            if name == "town_card":
                raise ZoneInfoNotFoundError("America/Los_Angeles")
            return original_import(name, *args, **kwargs)

        with patch.object(builtins, "__import__", side_effect=without_timezone):
            code, _, error = self.invoke()
        self.assertEqual(code, 0)
        self.assertIn("ZoneInfoNotFoundError", error)
        self.assert_core_files(card=False)

    def test_installed_publisher_starts_without_helper_or_timezone_database(self):
        installed = self.root / "installed"
        installed.mkdir()
        script = Path(publisher.__file__)
        shutil.copyfile(script, installed / script.name)
        env = {
            "HOME": str(self.root),
            "PATH": os.defpath,
            "PYTHONTZPATH": str(self.root / "no-timezones"),
            "LOCATION_LATITUDE": "34.25",
            "LOCATION_LONGITUDE": "-117.19",
        }
        for helper in (False, True):
            if helper:
                shutil.copyfile(
                    script.with_name("town_card.py"), installed / "town_card.py"
                )
            with self.subTest(helper=helper):
                result = subprocess.run(
                    [
                        sys.executable,
                        "-S",
                        str(installed / script.name),
                        "--source",
                        str(self.source),
                        "--dry-run",
                        "--print",
                    ],
                    env=env,
                    capture_output=True,
                    text=True,
                    check=False,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(
                    json.loads(result.stdout)["publisher_version"], "2.1.0"
                )
                self.assertIn(
                    "ZoneInfoNotFoundError" if helper else "ModuleNotFoundError",
                    result.stderr,
                )
        actual_state_dir = (
            self.root / "Library/Application Support/grounded-weather-forecast"
        )
        self.assertFalse((actual_state_dir / "last-published").exists())
        self.assertFalse((actual_state_dir / "last-published-states").exists())
        self.assertFalse((actual_state_dir / "last-published-state.json").exists())

    def test_installed_publisher_updates_actual_home_state_only_after_success(self):
        harness = self.install_harness()
        home = self.root / "subprocess-home"
        result = self.invoke_installed(harness, home, "publish")
        self.assertEqual(result.returncode, 0, result.stderr)
        state_dir = home / "Library/Application Support/grounded-weather-forecast"
        stamp = state_dir / "last-published"
        state = state_dir / "last-published-states" / self.state.name
        self.assertEqual(stamp.read_text().strip(), self.document["issued_at"])
        self.assertEqual(
            json.loads(state.read_text())["remote"], publisher.DEFAULT_REMOTE
        )
        tree_path = home / "pushed-tree.json"
        tree = json.loads(tree_path.read_text())
        self.assertEqual(
            set(tree),
            {
                "forecast.json",
                "town-card.json",
                "current.json",
                "daily.json",
                "hourly.json",
                "README.md",
                "vercel.json",
            },
        )
        self.assertEqual(
            json.loads(tree["town-card.json"])["observation"]["temp_f"], 50
        )
        previous = stamp.read_bytes(), state.read_bytes()
        for mode in ("fail", "dry-run", "no-push", "skip"):
            with self.subTest(mode=mode):
                tree_path.unlink(missing_ok=True)
                result = self.invoke_installed(harness, home, mode)
                self.assertEqual(
                    result.returncode, 3 if mode == "fail" else 0, result.stderr
                )
                self.assertFalse(tree_path.exists())
                self.assertEqual((stamp.read_bytes(), state.read_bytes()), previous)
                if mode == "no-push":
                    repos = list(
                        (home / "Library/Caches").glob("grounded-publish.*/repo.git")
                    )
                    self.assertEqual(len(repos), 1)
                    names = publisher._git(
                        ["ls-tree", "-r", "--name-only", "data"],
                        publisher._git_env(repos[0]),
                    )
                    self.assertIn("town-card.json", names.splitlines())
        failed_home = self.root / "failed-home"
        self.assertEqual(
            self.invoke_installed(harness, failed_home, "fail").returncode, 3
        )
        failed_state = (
            failed_home / "Library/Application Support/grounded-weather-forecast"
        )
        self.assertFalse((failed_state / "last-published").exists())
        self.assertEqual(list(failed_state.rglob("*.json")), [])

    def test_installed_old_and_incompatible_helpers_publish_core_tree_only(self):
        harness = self.install_harness()
        helper_path = harness.with_name("town_card.py")
        stub = "class CardInputError(ValueError): pass\ndef build_town_card(forecast, current):\n    raise AssertionError('incompatible helper was called')\n"
        for index, source in enumerate(
            (stub, "TOWN_CARD_API_VERSION = 1\n" + stub, "TOWN_CARD_API_VERSION = 1\n")
        ):
            with self.subTest(source=source):
                helper_path.write_text(source, encoding="utf-8")
                home = self.root / f"mismatched-home-{index}"
                result = self.invoke_installed(harness, home, "publish")
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn("incompatible helper API", result.stderr)
                self.assertIn(str(helper_path), result.stderr)
                self.assertNotIn("Traceback", result.stderr)
                tree = json.loads((home / "pushed-tree.json").read_text())
                self.assertNotIn("town-card.json", tree)
                self.assertEqual(
                    set(tree),
                    {
                        "forecast.json",
                        "current.json",
                        "daily.json",
                        "hourly.json",
                        "README.md",
                        "vercel.json",
                    },
                )

    def test_core_refusals_do_not_publish_but_core_programming_errors_propagate(self):
        self.document["schema_version"] = 999
        self.save_source()
        self.assertEqual(self.invoke()[0], 2)
        self.push.assert_not_called()
        self.assertFalse(self.state.exists())
        with patch.object(
            publisher, "transform", side_effect=KeyError("core programming bug")
        ):
            with self.assertRaisesRegex(KeyError, "core programming bug"):
                self.invoke()
        self.push.assert_not_called()
        self.assertFalse(self.stamp.exists())

    def test_invalid_utf8_source_is_a_clean_refusal(self):
        self.source.write_bytes(b"\xff\xfe")
        code, _, error = self.invoke()
        self.assertEqual(code, 2)
        self.assertIn("cannot read", error)
        self.assertNotIn("Traceback", error)
        self.push.assert_not_called()
        self.assertFalse(self.stamp.exists())
        self.assertFalse(self.state.exists())

    def test_invalid_station_json_remains_a_core_refusal(self):
        (self.staged / "current.json").write_bytes(b"{truncated")
        self.assertEqual(self.invoke()[0], 2)
        self.push.assert_not_called()
        self.assertFalse(self.state.exists())

    def test_nonfinite_source_and_station_numbers_are_refused_before_git(self):
        self.invoke()
        previous = self.stamp.read_bytes(), self.state.read_bytes()
        pushes = self.push.call_count
        valid_source = self.source.read_bytes()
        valid_station = {path: path.read_bytes() for path in self.staged.glob("*.json")}
        marker = "__INVALID_NUMBER__"
        tokens = (
            "NaN",
            "Infinity",
            "-Infinity",
            "1e999",
            "-1e999",
            "9" * 400,
            "-" + "9" * 400,
        )
        for target in (
            "latitude",
            "weather",
            "current.json",
            "daily.json",
            "hourly.json",
        ):
            for token in tokens:
                with self.subTest(target=target, token=token[:30]):
                    self.source.write_bytes(valid_source)
                    for path, content in valid_station.items():
                        path.write_bytes(content)
                    if target == "latitude":
                        invalid = dict(self.document, latitude=marker)
                        path = self.source
                    elif target == "weather":
                        first = dict(
                            self.document["hourly"][0], values={"temp_c": marker}
                        )
                        invalid = dict(self.document, hourly=[first])
                        path = self.source
                    else:
                        invalid = {"data": {"outTemp": marker}}
                        path = self.staged / target
                    path.write_text(
                        json.dumps(invalid).replace(json.dumps(marker), token),
                        encoding="utf-8",
                    )
                    with patch.object(publisher, "build_commit") as build:
                        code, _, error = self.invoke()
                    self.assertEqual(code, 2)
                    self.assertIn(str(path), error)
                    self.assertIn("not valid JSON", error)
                    self.assertNotIn("Traceback", error)
                    build.assert_not_called()
                    self.assertEqual(self.push.call_count, pushes)
                    self.assertEqual(
                        (self.stamp.read_bytes(), self.state.read_bytes()), previous
                    )

    def test_strict_json_preserves_null_strings_and_finite_numeric_values(self):
        # Numeric validation must not coerce integers or mistake strings for constants.
        content = b'{"constant":"NaN","value":null,"integer":9007199254740993,"fraction":0.25,"large":1e308}'
        document = publisher.strict_json_loads(content, self.source)
        self.assertEqual(document["constant"], "NaN")
        self.assertIsNone(document["value"])
        self.assertIs(type(document["integer"]), int)
        self.assertEqual(document["integer"], 9007199254740993)
        self.assertEqual(document["fraction"], 0.25)
        self.assertEqual(document["large"], 1e308)
        self.document["hourly"][0]["values"]["temp_c"] = None
        self.save_source()
        self.assertEqual(self.invoke()[0], 0)
        self.assertIsNone(
            json.loads(self.trees[-1]["forecast.json"])["hourly"][0]["values"]["temp_f"]
        )

    def test_invalid_ready_inputs_cannot_poison_or_pin_the_hold_cache(self):
        self.invoke()
        baseline = self.stamp.read_bytes(), self.state.read_bytes()
        valid = self.source.read_bytes()
        held = self.root / "held/last-good-forecast.json"
        invalid = []
        for name in ("NaN", "1e999", "conversion", "schema", "bucket", "metadata"):
            document = json.loads(valid)
            if name in ("NaN", "1e999"):
                document["latitude"] = "__BAD_NUMBER__"
            elif name == "conversion":
                document["hourly"][0]["values"] = {"temp_c": 1e308}
            elif name == "schema":
                document["schema_version"] = 999
            elif name == "bucket":
                document["hourly"][0]["lead_bucket"] = "168-240h"
            else:
                document["hourly"][0]["methods"] = {"temp_c": 3}
            content = json.dumps(document).replace('"__BAD_NUMBER__"', name).encode()
            invalid.append((name, content))

        for name, content in invalid:
            with self.subTest(name=name):
                self.stamp.write_bytes(baseline[0])
                self.state.write_bytes(baseline[1])
                self.source.write_bytes(valid)
                with contextlib.redirect_stdout(io.StringIO()):
                    self.assertEqual(
                        publisher.choose_source(self.source, held, now=NOW), self.source
                    )
                self.assertEqual(held.read_bytes(), valid)
                previous = self.stamp.read_bytes(), self.state.read_bytes()
                pushes = self.push.call_count
                self.source.write_bytes(content)
                with patch.object(publisher, "_log_stream", io.StringIO()) as logs:
                    selected = publisher.choose_source(self.source, held, now=NOW)
                self.assertEqual(selected, held)
                self.assertEqual(held.read_bytes(), valid)
                self.assertIn("rejected incoming document", logs.getvalue())
                with patch.object(publisher, "build_commit") as build:
                    code, _, error = self.invoke(source=self.source)
                self.assertEqual(code, 2)
                self.assertIn("refusing to publish", error)
                self.assertNotIn("Traceback", error)
                build.assert_not_called()
                self.assertEqual(self.push.call_count, pushes)
                self.assertEqual(
                    (self.stamp.read_bytes(), self.state.read_bytes()), previous
                )

                degraded = json.loads(valid)
                degraded.update(
                    status="degraded", issued_at=(NOW + timedelta(hours=1)).isoformat()
                )
                self.source.write_text(json.dumps(degraded), encoding="utf-8")
                clock = NOW + timedelta(hours=1)
                with contextlib.redirect_stdout(io.StringIO()):
                    self.assertEqual(
                        publisher.choose_source(self.source, held, now=clock), held
                    )
                # A poisoned cache left by an older publisher must not pin valid input.
                held.write_bytes(content)
                with patch.object(publisher, "_log_stream", io.StringIO()) as logs:
                    selected = publisher.choose_source(self.source, held, now=clock)
                self.assertEqual(selected, self.source)
                self.assertIn("no usable held ready document", logs.getvalue())
                code, _, error = self.invoke(source=selected, now=clock, force=True)
                self.assertEqual(code, 0, error)
                published = json.loads(self.trees[-1]["forecast.json"])
                self.assertEqual(published["status"], "degraded")
                self.assertEqual(published["issued_at"], degraded["issued_at"])
                self.assert_core_files(card=True)

    def test_conversion_overflow_refuses_actual_values_and_quantiles_before_git(self):
        self.invoke()
        previous = self.stamp.read_bytes(), self.state.read_bytes()
        pushes = self.push.call_count
        for product, variables in (
            ("hourly", ("temp_c", "dew_point_c", "wind_speed_ms", "wind_gust_ms")),
            ("daily", ("temp_max_c", "temp_min_c")),
        ):
            for variable in variables:
                for container in ("values", "quantiles"):
                    for value in (1e308, -1e308):
                        with self.subTest(
                            product=product,
                            variable=variable,
                            container=container,
                            value=value,
                        ):
                            document = json.loads(json.dumps(self.document))
                            document[product][0][container] = {
                                variable: value
                                if container == "values"
                                else {"0.5": value}
                            }
                            self.source.write_text(
                                json.dumps(document), encoding="utf-8"
                            )
                            with patch.object(publisher, "build_commit") as build:
                                code, _, error = self.invoke()
                            self.assertEqual(code, 2)
                            self.assertIn(f"{product} {container}.{variable}", error)
                            self.assertIn("non-finite", error)
                            self.assertNotIn("Traceback", error)
                            build.assert_not_called()
                            self.assertEqual(self.push.call_count, pushes)
                            self.assertEqual(
                                (self.stamp.read_bytes(), self.state.read_bytes()),
                                previous,
                            )

    def test_malformed_core_structures_refuse_with_context_before_git(self):
        self.invoke()
        previous = self.stamp.read_bytes(), self.state.read_bytes()
        cases = []
        for product in ("hourly", "daily"):
            row = self.document[product][0]
            for bad in ({}, "", 0, False, True, "not an array"):
                cases.append(({product: bad}, product))
            for bad in (None, [], "", 0, False):
                cases.append(({product: [bad]}, f"{product}[0]"))
            for field in ("truth_semantics", "quantiles"):
                for bad in ([], "", 0, False, True):
                    cases.append(
                        ({product: [dict(row, **{field: bad})]}, f"{product}[0]")
                    )
            variable = "temp_c" if product == "hourly" else "temp_max_c"
            for bad in (None, [], 0, False):
                cases.append(
                    (
                        {product: [dict(row, truth_semantics={variable: bad})]},
                        f"{product}[0].truth_semantics",
                    )
                )
            for bad in (None, [], "", 0, False):
                cases.append(
                    ({product: [dict(row, quantiles={variable: bad})]}, f"{product}[0]")
                )
        for bad in (None, [], {}, False, 0):
            cases.append(({"status": bad}, "status"))
            cases.append(
                (
                    {"hourly": [dict(self.document["hourly"][0], lead_bucket=bad)]},
                    "hourly[0]",
                )
            )
        for overrides, expected in cases:
            with self.subTest(overrides=overrides):
                pushes = self.push.call_count
                self.source.write_text(json.dumps(self.document | overrides))
                with patch.object(publisher, "build_commit") as build:
                    code, _, error = self.invoke()
                self.assertEqual(code, 2)
                self.assertIn(expected, error)
                self.assertIn("refusing to publish", error)
                self.assertNotIn("Traceback", error)
                build.assert_not_called()
                self.assertEqual(self.push.call_count, pushes)
                self.assertEqual(
                    (self.stamp.read_bytes(), self.state.read_bytes()), previous
                )

    def test_invalid_candidates_use_only_eligible_valid_holds_and_keep_station_updates(
        self,
    ):
        self.invoke()
        valid = self.source.read_bytes()
        held = self.root / "last-good-forecast.json"
        original_read = Path.read_bytes
        index = 0
        for status in ("ready", "degraded"):
            for failure in (
                "NaN",
                "1e999",
                "conversion",
                "structure",
                "schema",
                "missing",
                "permissions",
            ):
                index += 1
                clock = NOW + timedelta(hours=1, minutes=index)
                document = json.loads(valid)
                document["status"] = status
                if failure in ("NaN", "1e999"):
                    document["latitude"] = "BAD_NUMBER"
                elif failure == "conversion":
                    document["hourly"][0]["values"] = {"temp_c": 1e308}
                elif failure == "structure":
                    document["hourly"] = [None]
                elif failure == "schema":
                    document["schema_version"] = 999
                self.source.write_text(
                    json.dumps(document).replace('"BAD_NUMBER"', failure)
                )
                if failure == "missing":
                    self.source.unlink()

                def read(path):
                    if (
                        path.resolve() == self.source.resolve()
                        and failure == "permissions"
                    ):
                        raise PermissionError("injected unreadable candidate")
                    return original_read(path)

                for availability in (
                    "fresh",
                    "missing",
                    "expired",
                    "future",
                    "malformed",
                ):
                    with self.subTest(
                        status=status, failure=failure, hold=availability
                    ):
                        if availability == "missing":
                            held.unlink(missing_ok=True)
                        else:
                            snapshot = json.loads(valid)
                            if availability == "expired":
                                snapshot["issued_at"] = (
                                    clock - timedelta(hours=7)
                                ).isoformat()
                            elif availability == "future":
                                snapshot["issued_at"] = (
                                    clock + timedelta(hours=1)
                                ).isoformat()
                            elif availability == "malformed":
                                snapshot["hourly"] = [None]
                            held.write_bytes(
                                valid
                                if availability == "fresh"
                                else publisher.serialise(snapshot)
                            )
                        before = held.read_bytes() if held.exists() else None
                        previous = self.stamp.read_bytes(), self.state.read_bytes()
                        pushes = self.push.call_count
                        with (
                            patch.object(Path, "read_bytes", read),
                            patch.object(
                                publisher, "_log_stream", io.StringIO()
                            ) as logs,
                        ):
                            selected = publisher.choose_source(
                                self.source, held, now=clock
                            )
                            self.assertIn("rejected incoming document", logs.getvalue())
                            if availability == "fresh":
                                self.assertEqual(selected, held)
                                self.current["metadata"]["observed_at"] = (
                                    clock.isoformat()
                                )
                                self.current["data"]["outTemp"] = 50 + index
                                (self.staged / "current.json").write_bytes(
                                    publisher.serialise(self.current)
                                )
                                code, _, error = self.invoke(source=selected, now=clock)
                                self.assertEqual(code, 0, error)
                                self.assertEqual(self.push.call_count, pushes + 1)
                                self.assert_core_files(card=True)
                                forecast = json.loads(self.trees[-1]["forecast.json"])
                                card = json.loads(self.trees[-1]["town-card.json"])
                                self.assertEqual(forecast["status"], "ready")
                                self.assertEqual(
                                    forecast["issued_at"], self.document["issued_at"]
                                )
                                self.assertEqual(
                                    card["published_at"], clock.isoformat()
                                )
                                self.assertEqual(
                                    card["observation"]["temp_f"], 50 + index
                                )
                                self.assertEqual(
                                    card["forecast"]["hours"][0]["valid_time"],
                                    (
                                        clock.replace(minute=0, second=0)
                                        + timedelta(hours=1)
                                    ).isoformat(),
                                )
                            else:
                                self.assertEqual(selected, self.source)
                            # Direct run never consults the hold, even after wrapper fallback succeeds.
                            unchanged = self.stamp.read_bytes(), self.state.read_bytes()
                            current_pushes = self.push.call_count
                            with patch.object(publisher, "build_commit") as build:
                                code, _, error = self.invoke(
                                    source=self.source, now=clock
                                )
                            self.assertEqual(code, 2)
                            self.assertIn("refusing to publish", error)
                            self.assertNotIn("Traceback", error)
                            build.assert_not_called()
                            self.assertEqual(self.push.call_count, current_pushes)
                            self.assertEqual(
                                (self.stamp.read_bytes(), self.state.read_bytes()),
                                unchanged,
                            )
                        self.assertEqual(
                            held.read_bytes() if held.exists() else None, before
                        )
                        if availability != "fresh":
                            self.assertEqual(self.push.call_count, pushes)
                            self.assertEqual(
                                (self.stamp.read_bytes(), self.state.read_bytes()),
                                previous,
                            )

    def test_station_read_failures_refuse_before_git_without_changing_state(self):
        self.invoke()
        previous = self.stamp.read_bytes(), self.state.read_bytes()
        pushes = self.push.call_count
        read_bytes = Path.read_bytes
        for name in ("current.json", "daily.json", "hourly.json"):
            target = self.staged / name
            content = target.read_bytes()
            for failure in ("disappeared", "permissions"):
                with self.subTest(name=name, failure=failure):

                    def read(path):
                        if path == target:
                            if failure == "permissions":
                                raise PermissionError("injected permissions")
                            path.unlink()
                        return read_bytes(path)

                    try:
                        with (
                            patch.object(Path, "read_bytes", read),
                            patch.object(publisher, "build_commit") as build,
                        ):
                            code, _, error = self.invoke()
                        self.assertEqual(code, 2)
                        self.assertIn(str(target), error)
                        self.assertIn("cannot read", error)
                        self.assertNotIn("Traceback", error)
                        build.assert_not_called()
                        self.assertEqual(self.push.call_count, pushes)
                        self.assertEqual(
                            (self.stamp.read_bytes(), self.state.read_bytes()), previous
                        )
                    finally:
                        target.write_bytes(content)

    def test_unexpected_core_serialization_errors_keep_their_traceback(self):
        original = publisher.transform

        def broken_transform(*args, **kwargs):
            payload = original(*args, **kwargs)
            payload["latitude"] = float("nan")
            return payload

        with (
            patch.object(publisher, "transform", side_effect=broken_transform),
            self.assertRaises(ValueError),
        ):
            self.invoke()
        self.push.assert_not_called()
        self.assertFalse(self.state.exists())

    def test_missing_or_unsupported_helper_api_omits_only_card_without_calling_builder(
        self,
    ):
        for api in (None, 1, 2, 4, "3", True):
            with (
                self.subTest(api=api),
                patch.dict(town_card.__dict__),
                patch.object(town_card, "build_town_card") as build,
            ):
                if api is None:
                    del town_card.TOWN_CARD_API_VERSION
                else:
                    town_card.TOWN_CARD_API_VERSION = api
                code, _, error = self.invoke(force=True)
                self.assertEqual(code, 0)
                self.assertIn("incompatible helper API", error)
                self.assertIn("expected 3", error)
                self.assertIn(f"actual {api!r}", error)
                self.assertIn(town_card.__file__, error)
                self.assertNotIn("Traceback", error)
                build.assert_not_called()
                self.assert_core_files(card=False)
        # A compatible helper restores the card even with the same issue/window.
        self.invoke()
        self.assert_core_files(card=True)

    def test_incompatible_helper_is_checked_before_resolving_any_exports(self):
        for api in (None, 1, 2, 4, "3", True):
            helper = types.ModuleType("town_card")
            helper.__file__ = str(self.root / "future-helper.py")
            if api is not None:
                helper.TOWN_CARD_API_VERSION = api
            with self.subTest(api=api), patch.dict(sys.modules, {"town_card": helper}):
                code, _, error = self.invoke(force=True)
            self.assertEqual(code, 0)
            self.assertIn("incompatible helper API", error)
            self.assertIn("expected 3", error)
            self.assertIn(f"actual {api!r}", error)
            self.assertIn(helper.__file__, error)
            self.assertNotIn("Traceback", error)
            self.assert_core_files(card=False)
        self.invoke()
        self.assert_core_files(card=True)

    def test_supported_helper_with_broken_exports_is_an_unexpected_card_failure(self):
        for missing in ("build_town_card", "CardInputError", "invalid_exports"):
            helper = types.ModuleType("town_card")
            helper.TOWN_CARD_API_VERSION = 3
            helper.build_town_card = town_card.build_town_card
            helper.CardInputError = town_card.CardInputError
            if missing == "invalid_exports":
                helper.CardInputError = None
            else:
                delattr(helper, missing)
            with (
                self.subTest(missing=missing),
                patch.dict(sys.modules, {"town_card": helper}),
            ):
                code, _, error = self.invoke(force=True)
            self.assertEqual(code, 0)
            self.assertIn("unexpected error", error)
            self.assertIn("Traceback", error)
            self.assert_core_files(card=False)

    def test_generic_helper_exception_classes_are_broken_exports(self):
        self.invoke()
        for exception in (Exception, ValueError, RuntimeError, BaseException):
            helper = types.ModuleType("town_card")
            helper.TOWN_CARD_API_VERSION = 3
            helper.CardInputError = exception
            with patch.object(
                town_card, "build_town_card", side_effect=RuntimeError("builder bug")
            ) as build:
                helper.build_town_card = build
                with (
                    self.subTest(exception=exception),
                    patch.dict(sys.modules, {"town_card": helper}),
                ):
                    code, _, error = self.invoke(force=True)
                self.assertEqual(code, 0)
                self.assertIn("custom exception class", error)
                self.assertIn("Traceback", error)
                build.assert_not_called()
                self.assert_core_files(card=False)
        self.invoke()
        self.assert_core_files(card=True)

    def test_custom_helper_exception_is_expected_but_programming_errors_are_not(self):
        class ValidationError(Exception):
            pass

        helper = types.ModuleType("town_card")
        helper.TOWN_CARD_API_VERSION = 3
        helper.CardInputError = ValidationError
        for exception, traceback_expected in (
            (ValidationError("bad input"), False),
            (RuntimeError("builder bug"), True),
        ):
            with patch.object(
                town_card, "build_town_card", side_effect=exception
            ) as build:
                helper.build_town_card = build
                with (
                    self.subTest(exception=exception),
                    patch.dict(sys.modules, {"town_card": helper}),
                ):
                    code, _, error = self.invoke(force=True)
                self.assertEqual(code, 0)
                self.assertIn(str(exception), error)
                self.assertEqual("Traceback" in error, traceback_expected)
                build.assert_called_once()
                self.assert_core_files(card=False)

    def test_alternate_destinations_cannot_advance_production_stamp(self):
        self.invoke()
        production_stamp = self.stamp.read_bytes()
        production_state = self.state.read_bytes()
        original_issue = self.document["issued_at"]
        for index, options in enumerate(
            (
                {"branch": "scratch"},
                {"remote": "another-remote"},
                {"remote": "ssh://git@github.com/hbmartin/open-sun.git"},
            )
        ):
            self.document["issued_at"] = (NOW + timedelta(minutes=index)).isoformat()
            self.save_source()
            self.assertEqual(self.invoke(**options)[0], 0)
            self.assertEqual(self.stamp.read_bytes(), production_stamp)
            self.assertEqual(self.state.read_bytes(), production_state)
            remote = options.get("remote", publisher.DEFAULT_REMOTE)
            branch = options.get("branch", publisher.DEFAULT_BRANCH)
            self.assertTrue(publisher.publication_state_path(remote, branch).is_file())
        self.document["issued_at"] = original_issue
        self.save_source()
        self.assertIn("unchanged; skipping", self.invoke()[1])
        self.assertEqual(self.stamp.read_bytes(), production_stamp)
        self.document["issued_at"] = NOW.isoformat()
        self.save_source()
        self.invoke()
        self.assertEqual(self.stamp.read_text().strip(), self.document["issued_at"])
        self.assertNotEqual(self.stamp.read_bytes(), production_stamp)

    def test_no_push_builds_unchanged_tree_without_force(self):
        for station in (True, False):
            with self.subTest(station=station):
                self.invoke(station=station, force=True)
                previous = self.stamp.read_bytes(), self.state.read_bytes()
                count = self.push.call_count
                with patch.object(
                    publisher, "build_commit", wraps=publisher.build_commit
                ) as build:
                    code, log, _ = self.invoke(station=station, no_push=True)
                self.assertEqual(code, 0)
                self.assertIn("not pushed", log)
                build.assert_called_once()
                _, git_dir, branch, _ = build.call_args.args
                self.assertTrue(git_dir.is_dir())
                self.capture_tree(git_dir, publisher.DEFAULT_REMOTE, branch)
                self.assertIn("forecast.json", self.trees[-1])
                self.assertIn("town-card.json", self.trees[-1])
                self.assertEqual("current.json" in self.trees[-1], station)
                self.assertEqual(self.push.call_count, count)
                self.assertEqual(
                    (self.stamp.read_bytes(), self.state.read_bytes()), previous
                )
        with patch.object(publisher, "build_commit") as build:
            self.invoke(dry_run=True, no_push=True)
        build.assert_not_called()

    def test_station_json_is_parsed_once_and_card_uses_parsed_current(self):
        current_bytes = (self.staged / "current.json").read_bytes()
        with (
            patch.object(publisher.json, "loads", wraps=json.loads) as loads,
            patch.object(
                town_card, "build_town_card", wraps=town_card.build_town_card
            ) as build,
        ):
            self.invoke()
        self.assertEqual(
            sum(call.args[0] == current_bytes for call in loads.call_args_list), 1
        )
        self.assertEqual(build.call_args.args[1], self.current)

    def test_no_forecast_content_keeps_observations_or_omits_card(self):
        for row in self.document["hourly"]:
            row["values"] = {"temp_c": None}
            row["quantiles"] = {}
        self.document["daily"][0]["values"] = {}
        self.save_source()
        self.invoke()
        self.assert_core_files(card=True)
        card = json.loads(self.trees[-1]["town-card.json"])
        self.assertIsNone(card["forecast"])
        self.assertIsNotNone(card["observation"])
        self.invoke(station=False)
        self.assertNotIn("town-card.json", self.trees[-1])

    def test_destinations_retain_independent_publication_state(self):
        self.invoke()
        production = self.state.read_bytes()
        for options in ({"remote": "alternate"}, {"branch": "alternate"}):
            with self.subTest(options=options):
                remote = options.get("remote", publisher.DEFAULT_REMOTE)
                branch = options.get("branch", publisher.DEFAULT_BRANCH)
                self.invoke(**options)
                alternate_path = publisher.publication_state_path(remote, branch)
                alternate = alternate_path.read_bytes()
                count = self.push.call_count
                self.invoke()
                self.invoke(**options)
                self.assertEqual(self.push.call_count, count)
                self.assertEqual(self.state.read_bytes(), production)
                self.assertEqual(alternate_path.read_bytes(), alternate)
        self.push.side_effect = publisher.GitError("failed alternate push")
        self.assertEqual(self.invoke(branch="failed")[0], 3)
        self.assertFalse(
            publisher.publication_state_path(
                publisher.DEFAULT_REMOTE, "failed"
            ).exists()
        )
        self.assertEqual(self.state.read_bytes(), production)

    def test_legacy_singleton_does_not_skip_the_first_scoped_publication(self):
        self.invoke()
        legacy = self.stamp.with_name("last-published-state.json")
        legacy_bytes = self.state.read_bytes()
        legacy.write_bytes(legacy_bytes)
        self.state.unlink()
        count = self.push.call_count
        self.invoke()
        self.assertEqual(self.push.call_count, count + 1)
        self.assertTrue(self.state.exists())
        self.assertEqual(legacy.read_bytes(), legacy_bytes)

    def test_identical_state_skips_with_or_without_station_files(self):
        for station in (True, False):
            with self.subTest(station=station):
                self.assertEqual(self.invoke(station=station, force=True)[0], 0)
                previous = (self.stamp.read_bytes(), self.state.read_bytes())
                count = self.push.call_count
                code, log, _ = self.invoke(
                    station=station, now=NOW + timedelta(minutes=5)
                )
                self.assertEqual(code, 0)
                self.assertIn("unchanged; skipping", log)
                self.assertEqual(self.push.call_count, count)
                self.assertEqual(
                    (self.stamp.read_bytes(), self.state.read_bytes()), previous
                )

    def test_same_issue_refreshes_changed_forecast_station_window_and_destination(self):
        self.invoke()
        changes = [
            lambda: self.document["hourly"][0]["values"].update(temp_c=11),
            lambda: (self.staged / "current.json").write_bytes(
                publisher.serialise(dict(self.current, data={"outTemp": 51}))
            ),
        ]
        for change in changes:
            count = self.push.call_count
            change()
            self.save_source()
            self.invoke()
            self.assertEqual(self.push.call_count, count + 1)
        for options in (
            {"now": NOW + timedelta(hours=1)},
            {"remote": "another-remote"},
            {"branch": "another-branch"},
            {"force": True},
        ):
            # Compare each alternative to the same default destination/window.
            self.invoke()
            count = self.push.call_count
            self.invoke(**options)
            self.assertEqual(self.push.call_count, count + 1)
        self.assertEqual(self.stamp.read_text().strip(), self.document["issued_at"])

    def test_exact_expiry_changes_card_state_and_removes_card_without_observations(
        self,
    ):
        issued = datetime.fromisoformat(self.document["issued_at"])
        for station in (True, False):
            with self.subTest(station=station):
                self.invoke(
                    station=station, now=issued + timedelta(hours=12), force=True
                )
                card = json.loads(self.trees[-1]["town-card.json"])
                self.assertIsNotNone(card["forecast"])
                self.invoke(
                    station=station, now=issued + timedelta(hours=12, seconds=1)
                )
                if station:
                    card = json.loads(self.trees[-1]["town-card.json"])
                    self.assertIsNone(card["forecast"])
                    self.assertIsNotNone(card["observation"])
                else:
                    self.assertNotIn("town-card.json", self.trees[-1])

    def test_card_removal_and_restoration_publish_with_same_issue_and_window(self):
        self.invoke()
        with patch.dict(sys.modules, {"town_card": None}):
            self.invoke()
            self.assert_core_files(card=False)
            count = self.push.call_count
            self.invoke()
            self.assertEqual(self.push.call_count, count)
        self.invoke()
        self.assert_core_files(card=True)
        self.assertEqual(self.push.call_count, 3)

    def test_missing_corrupt_and_unsupported_state_cannot_skip(self):
        self.invoke()
        valid_state = json.loads(self.state.read_text())
        for contents in (
            None,
            "{",
            "[]",
            json.dumps(dict(valid_state, schema_version=1)),
            json.dumps(dict(valid_state, schema_version=True)),
            json.dumps(dict(valid_state, remote="wrong")),
            json.dumps(dict(valid_state, branch="wrong")),
            json.dumps(dict(valid_state, fingerprint="F" * 64)),
            json.dumps(dict(valid_state, issued_at=None)),
            json.dumps(dict(valid_state, issued_at="2026-10-22T12:00:00")),
            '{"schema_version":1,"fingerprint":"bad"}',
        ):
            with self.subTest(contents=contents):
                if contents is None:
                    self.state.unlink()
                else:
                    self.state.write_text(contents)
                count = self.push.call_count
                self.invoke()
                self.assertEqual(self.push.call_count, count + 1)

    def test_failed_push_dry_run_no_push_and_skip_do_not_advance_state(self):
        self.invoke()
        previous = self.stamp.read_bytes(), self.state.read_bytes()
        for options in (
            {"dry_run": True, "now": NOW + timedelta(hours=1)},
            {"no_push": True, "now": NOW + timedelta(hours=1)},
            {},
        ):
            self.invoke(**options, force=bool(options))
            self.assertEqual(
                (self.stamp.read_bytes(), self.state.read_bytes()), previous
            )
        self.document["status_reason"] = "changed"
        self.save_source()
        self.push.side_effect = publisher.GitError("push failed")
        self.assertEqual(self.invoke()[0], 3)
        self.assertEqual((self.stamp.read_bytes(), self.state.read_bytes()), previous)
        self.push.side_effect = self.capture_tree
        self.invoke()
        self.assertNotEqual(self.state.read_bytes(), previous[1])

    def test_state_replace_failure_preserves_previous_state_and_is_nonfatal(self):
        self.invoke()
        previous = self.state.read_bytes()
        with (
            patch.object(Path, "replace", side_effect=OSError("atomic replace failed")),
            patch.object(publisher, "_log_stream", io.StringIO()) as out,
        ):
            publisher.write_publication_state(
                "f" * 64,
                publisher.DEFAULT_REMOTE,
                publisher.DEFAULT_BRANCH,
                self.document["issued_at"],
            )
        self.assertEqual(self.state.read_bytes(), previous)
        self.assertIn("could not write publication state", out.getvalue())
        self.assertEqual(
            sorted(p.name for p in self.state.parent.glob("*.json")),
            [self.state.name],
        )

    def test_fingerprint_excludes_only_owned_top_level_publication_times(self):
        payload = {
            "published_at": "a",
            "issued_at": "fixed",
            "nested": {"published_at": "keep"},
        }
        blobs = {
            "forecast.json": publisher.PreparedFile.document(payload),
            "town-card.json": publisher.PreparedFile.document(payload),
            "current.json": publisher.PreparedFile.raw(b'{"published_at":"a"}'),
            "README.md": publisher.PreparedFile.raw(b"readme"),
            "vercel.json": publisher.PreparedFile.raw(b"{}"),
        }
        fingerprint = publisher.publication_fingerprint(blobs, "remote", "data")
        same = dict(blobs)
        for name in ("forecast.json", "town-card.json"):
            same[name] = publisher.PreparedFile.document(
                dict(reversed(list(dict(payload, published_at="b").items())))
            )
        self.assertEqual(
            publisher.publication_fingerprint(same, "remote", "data"), fingerprint
        )
        for name in blobs:
            changed = dict(blobs)
            if name in ("forecast.json", "town-card.json"):
                changed[name] = publisher.PreparedFile.document(
                    dict(payload, nested={"published_at": "changed"})
                )
            else:
                changed[name] = publisher.PreparedFile.raw(changed[name].content + b" ")
            self.assertNotEqual(
                publisher.publication_fingerprint(changed, "remote", "data"),
                fingerprint,
            )
        for remote, branch in (("other", "data"), ("remote", "other")):
            self.assertNotEqual(
                publisher.publication_fingerprint(blobs, remote, branch), fingerprint
            )
        # Normalization is attached to the entry, not inferred from a filename.
        renamed = {"another-name.json": publisher.PreparedFile.document(payload)}
        with patch.object(
            publisher.json, "loads", side_effect=AssertionError("reparsed")
        ):
            before = publisher.publication_fingerprint(renamed, "remote", "data")
            renamed["another-name.json"] = publisher.PreparedFile.document(
                dict(payload, published_at="b")
            )
            self.assertEqual(
                publisher.publication_fingerprint(renamed, "remote", "data"), before
            )

    def test_fingerprint_preserves_duplicate_quantile_order(self):
        grid = {"0.10": 10, "0.1": 20, "0.9": 90}
        payload = {"published_at": "a", "hourly": [{"quantiles": {"temp_f": grid}}]}
        first = publisher.PreparedFile.document(payload)
        payload["hourly"][0]["quantiles"]["temp_f"] = dict(reversed(list(grid.items())))
        second = publisher.PreparedFile.document(payload)
        self.assertNotEqual(first.comparison_digest, second.comparison_digest)


if __name__ == "__main__":
    unittest.main()
