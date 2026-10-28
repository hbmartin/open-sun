"""Shared consumer-contract cases and isolated publication boundary regressions."""

import copy
import io
import json
import os
import shutil
import stat
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import publish_forecast as publisher
import test_publish_town_card as integration

FIXTURE = (
    Path(__file__).resolve().parents[1] / "lib/__fixtures__/forecast-contract.json"
)
NOW = integration.NOW


def contract_cases():
    fixture = json.loads(FIXTURE.read_bytes())
    for case in fixture["cases"]:
        document = copy.deepcopy(fixture["source"])
        for change in case["changes"]:
            parent = document
            for key in change["path"][:-1]:
                parent = parent[key]
            key = change["path"][-1]
            if change.get("remove"):
                parent.pop(key, None)
            else:
                parent[key] = change["value"]
        yield case, document


def prepared_contract_cases():
    """Called by Vitest to check real Python output with the production schema."""
    results = []
    for case, document in contract_cases():
        try:
            payload, _ = publisher.prepare_forecast(document, NOW)
        except publisher.RefusedError as exc:
            results.append({"name": case["name"], "accepted": False, "error": str(exc)})
        else:
            results.append({"name": case["name"], "accepted": True, "payload": payload})
    return results


class SourceContractTests(unittest.TestCase):
    def test_conversion_does_not_read_private_configuration(self):
        base = json.loads(FIXTURE.read_bytes())["source"]
        with patch.object(
            publisher,
            "configured_station_location",
            side_effect=AssertionError("private config read"),
        ):
            payload, _ = publisher.prepare_forecast(
                base | {"latitude": 40, "longitude": -120}, NOW
            )
        self.assertNotIn("latitude", payload)
        self.assertNotIn("longitude", payload)

    def test_shared_contract_cases(self):
        cases = list(contract_cases())
        for (case, _), result in zip(cases, prepared_contract_cases(), strict=True):
            with self.subTest(name=case["name"]):
                self.assertEqual(result["accepted"], case["accepted"], result)
                if not case["accepted"]:
                    self.assertIn(case["field"], result["error"])

    def test_in_memory_metadata_must_be_finite_and_numeric(self):
        base = json.loads(FIXTURE.read_bytes())["source"]
        for field in ("latitude", "longitude"):
            for value in (float("nan"), float("inf"), 10**400, True):
                with self.subTest(field=field, value_type=type(value).__name__):
                    with self.assertRaisesRegex(publisher.RefusedError, field):
                        publisher.prepare_forecast(base | {field: value}, NOW)


class FileBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.fixture = integration.PublisherTownCardTest()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)

    def test_invalid_contract_files_refuse_without_git_or_cache_changes(self):
        t = self.fixture
        self.assertEqual(t.invoke()[0], 0)
        previous = t.stamp.read_bytes(), t.state.read_bytes()
        held = t.root / "held.json"
        held.write_bytes(t.source.read_bytes())
        retained = held.read_bytes()
        pushes = t.push.call_count
        for case, document in contract_cases():
            if case["accepted"]:
                continue
            with self.subTest(name=case["name"]):
                t.source.write_text(json.dumps(document))
                with patch.object(publisher, "build_commit") as build:
                    code, _, error = t.invoke()
                self.assertEqual(code, 2)
                self.assertIn(case["field"], error)
                self.assertNotIn("Traceback", error)
                build.assert_not_called()
                with self.assertRaises(publisher.RefusedError):
                    publisher.remember_good(t.source, held, now=NOW)
                self.assertEqual(held.read_bytes(), retained)
                with patch.object(publisher, "_log_stream", io.StringIO()) as logs:
                    selected = publisher.choose_source(t.source, held, now=NOW)
                self.assertEqual(selected, held)
                self.assertIn("rejected incoming", logs.getvalue())
                self.assertEqual(t.push.call_count, pushes)
                self.assertEqual((t.stamp.read_bytes(), t.state.read_bytes()), previous)

    def test_decoder_recursion_is_local_to_the_parsing_boundary(self):
        t = self.fixture
        raw = t.source.read_text()
        held = t.root / "held.json"
        held.write_text(raw)
        original = publisher.json.loads
        for target in (t.source, held, t.staged / "current.json"):
            with self.subTest(target=target.name):
                target.write_text('{"deep":[' + "[" * 30 + "0" + "]" * 31 + "}")
                broken = target.read_bytes()

                def loads(content, *args, **kwargs):
                    if content == broken or content == broken.decode():
                        raise RecursionError("injected decoder depth limit")
                    return original(content, *args, **kwargs)

                with patch.object(publisher.json, "loads", side_effect=loads):
                    if target == held:
                        t.source.write_text('{"broken"')
                        with patch.object(
                            publisher, "_log_stream", io.StringIO()
                        ) as logs:
                            self.assertEqual(
                                publisher.choose_source(t.source, held, now=NOW),
                                t.source,
                            )
                        self.assertIn(str(held), logs.getvalue())
                    else:
                        with patch.object(publisher, "build_commit") as build:
                            code, _, error = t.invoke()
                        self.assertEqual(code, 2)
                        self.assertIn(str(target), error)
                        self.assertIn("decoder depth limit", error)
                        self.assertNotIn("Traceback", error)
                        build.assert_not_called()
                    if target == t.source:
                        with patch.object(publisher, "_log_stream", io.StringIO()):
                            self.assertEqual(
                                publisher.choose_source(t.source, held, now=NOW), held
                            )
                t.source.write_text(raw)
        t.push.assert_not_called()
        with patch.object(
            publisher, "transform", side_effect=RecursionError("core bug")
        ):
            with self.assertRaisesRegex(RecursionError, "core bug"):
                t.invoke()

    def test_actual_deep_files_on_available_python_runtimes(self):
        t = self.fixture
        source = t.root / "deep.json"
        source.write_text('{"deep":' + "[" * 10000 + "0" + "]" * 10000 + "}")
        program = """\
import sys
from pathlib import Path
import publish_forecast as p
try:
    p.load_document(Path(sys.argv[1]))
except p.RefusedError as exc:
    print(exc)
    raise SystemExit(2)
"""
        runtimes = {sys.executable}
        runtimes.update(
            path
            for name in ("python3.12", "python3.13")
            if (path := shutil.which(name))
        )
        for executable in runtimes:
            result = subprocess.run(
                [executable, "-B", "-c", program, str(source)],
                env=dict(os.environ, PYTHONPATH=str(Path(publisher.__file__).parent)),
                capture_output=True,
                text=True,
                timeout=10,
            )
            with self.subTest(runtime=executable):
                self.assertIn(result.returncode, (0, 2), result.stderr)
                self.assertNotIn("Traceback", result.stderr)
                if result.returncode == 2:
                    self.assertIn(str(source), result.stdout)

    def test_cache_permissions_and_cheap_status_check(self):
        t = self.fixture
        held = t.root / "held.json"
        for mode in (None, 0o644, 0o600):
            with self.subTest(mode=mode):
                if mode is not None:
                    held.chmod(mode)
                publisher.remember_good(t.source, held, now=NOW)
                self.assertEqual(stat.S_IMODE(held.stat().st_mode), mode or 0o600)
                self.assertEqual(held.read_bytes(), t.source.read_bytes())
        before = held.read_bytes()
        held.chmod(0o644)
        with patch.object(
            Path, "replace", side_effect=OSError("injected rename failure")
        ):
            with self.assertRaisesRegex(OSError, "rename failure"):
                publisher.remember_good(t.source, held, now=NOW)
        self.assertEqual(stat.S_IMODE(held.stat().st_mode), 0o644)
        self.assertEqual(held.read_bytes(), before)
        self.assertEqual(list(t.root.glob("*.partial")), [])
        t.source.write_text('{"status":"degraded","schema_version":999}')
        with (
            patch.object(publisher, "prepare_forecast") as prepare,
            patch.object(
                Path, "read_bytes", return_value=t.source.read_bytes()
            ) as read,
        ):
            with self.assertRaisesRegex(publisher.RefusedError, "only a ready"):
                publisher.remember_good(t.source, held, now=NOW)
        prepare.assert_not_called()
        read.assert_called_once_with()
        self.assertEqual(held.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
