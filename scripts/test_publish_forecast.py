#!/usr/bin/env python3
"""Tests for the degraded-window hold in publish_forecast.

Stdlib unittest rather than pytest on purpose: this repo has no Python
toolchain, and the hold is the one piece of the publisher that decides whether
the public forecast changes character, so it should be testable with nothing
installed. Run from the repo root with::

    python3 -m unittest discover -s scripts -t scripts

Every test passes ``held``, ``max_age_seconds`` and ``now`` explicitly, so
nothing here touches the real ``~/Library/Application Support`` copy or a real
clock.
"""

from __future__ import annotations

import io
import json
import os
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from unittest.mock import patch

import publish_forecast
from publish_forecast import (
    RefusedError,
    _daily_row,
    _hourly_row,
    choose_source,
    remember_good,
    transform,
)

NOW = datetime(2026, 8, 8, 13, 0, tzinfo=UTC)


def _document(status: str, issued_at: datetime | str | None = NOW) -> dict[str, Any]:
    document: dict[str, Any] = {
        "schema_version": 5,
        "status": status,
        "timezone": "America/Los_Angeles",
        "latitude": 35.0,
        "longitude": -118.0,
        "dataset_fingerprint": "test",
    }
    if issued_at is not None:
        document["issued_at"] = (
            issued_at.isoformat() if isinstance(issued_at, datetime) else issued_at
        )
    return document


class HoldTestCase(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.candidate = self.root / "forecast.json"
        self.held = self.root / "state" / "last-good-forecast.json"
        for patcher in (
            patch.object(publish_forecast, "STAMP", self.root / "state/last-published"),
            patch.object(Path, "home", return_value=self.root),
            patch.dict(os.environ, {"HOME": str(self.root)}),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)

        # _log resolves the module global on every call, so this captures the
        # publisher's diagnostics instead of spraying them through the runner.
        self.logs = io.StringIO()
        previous = publish_forecast._log_stream
        publish_forecast._log_stream = self.logs
        self.addCleanup(setattr, publish_forecast, "_log_stream", previous)

    def write_candidate(self, content: Any) -> None:
        raw = content if isinstance(content, str) else json.dumps(content)
        self.candidate.write_text(raw, encoding="utf-8")

    def write_held(self, content: Any) -> None:
        self.held.parent.mkdir(parents=True, exist_ok=True)
        raw = content if isinstance(content, str) else json.dumps(content)
        self.held.write_text(raw, encoding="utf-8")

    def choose(self, **kwargs: Any) -> Path:
        kwargs.setdefault("now", NOW)
        return choose_source(self.candidate, self.held, **kwargs)


class RememberGoodTest(HoldTestCase):
    def test_creates_the_held_directory(self) -> None:
        """A fresh install has no state directory; the first hold must make it."""
        self.write_candidate(_document("ready"))
        self.assertFalse(self.held.parent.exists())

        remember_good(self.candidate, self.held, now=NOW)

        self.assertEqual(json.loads(self.held.read_text()), _document("ready"))

    def test_replaces_an_existing_document_and_leaves_no_partial(self) -> None:
        self.write_held(_document("ready", NOW - timedelta(hours=3)))
        self.write_candidate(_document("ready"))

        remember_good(self.candidate, self.held, now=NOW)

        self.assertEqual(json.loads(self.held.read_text()), _document("ready"))
        self.assertEqual(list(self.held.parent.glob("*.partial")), [])

    def test_compatibility_entry_point_refuses_non_ready_input(self) -> None:
        self.write_candidate(_document("degraded"))
        with self.assertRaisesRegex(RefusedError, "only a ready forecast"):
            remember_good(self.candidate, self.held, now=NOW)
        self.assertFalse(self.held.exists())

    def test_remembers_exact_validated_bytes_even_if_source_changes(self) -> None:
        content = (json.dumps(_document("ready"), indent=2) + "\r\n").encode()
        self.candidate.write_bytes(content)
        original = publish_forecast.prepare_forecast

        def prepare_then_change_source(*args):
            result = original(*args)
            self.candidate.write_text('{"status":"ready","bad":NaN}')
            return result

        with patch.object(
            publish_forecast, "prepare_forecast", side_effect=prepare_then_change_source
        ):
            self.choose()
        self.assertEqual(self.held.read_bytes(), content)
        self.assertNotEqual(self.candidate.read_bytes(), content)

    def test_failed_cache_write_or_replace_preserves_previous_snapshot(self) -> None:
        self.write_held(_document("ready", NOW - timedelta(hours=1)))
        previous = self.held.read_bytes()
        self.write_candidate(_document("ready"))
        original_temporary = tempfile.NamedTemporaryFile
        for operation in ("write", "replace"):
            with self.subTest(operation=operation):
                self.logs.seek(0)
                self.logs.truncate(0)

                @contextmanager
                def output_file(*args, **kwargs):
                    with original_temporary(*args, **kwargs) as output:
                        write = output.write

                        def truncated_write(data):
                            write(data[:10])
                            raise OSError("injected incomplete cache write")

                        with patch.object(
                            output,
                            "write",
                            side_effect=truncated_write
                            if operation == "write"
                            else write,
                        ):
                            yield output

                with (
                    patch.object(tempfile, "NamedTemporaryFile", output_file),
                    patch.object(
                        Path, "replace", side_effect=OSError("injected rename failure")
                    ),
                ):
                    self.assertEqual(self.choose(), self.candidate)
                self.assertEqual(self.held.read_bytes(), previous)
                self.assertEqual(list(self.held.parent.glob("*.partial")), [])
                self.assertIn("could not remember", self.logs.getvalue())
                self.assertIn(
                    "incomplete cache write"
                    if operation == "write"
                    else "rename failure",
                    self.logs.getvalue(),
                )

    def test_unexpected_core_errors_are_not_hidden_by_hold_guard(self) -> None:
        self.write_held(_document("ready", NOW - timedelta(hours=1)))
        previous = self.held.read_bytes()
        for status in ("ready", "degraded"):
            self.write_candidate(_document(status))
            for function, error in (
                ("transform", RuntimeError("programming failure")),
                ("transform", OSError("unexpected core I/O failure")),
                ("serialise", ValueError("serialization failure")),
            ):
                with self.subTest(status=status, function=function):
                    with (
                        patch.object(publish_forecast, function, side_effect=error),
                        self.assertRaises(type(error)),
                    ):
                        self.choose()
                    self.assertEqual(self.held.read_bytes(), previous)

    def test_overlapping_writers_cannot_publish_or_remove_another_partial(self) -> None:
        self.write_held(_document("ready", NOW - timedelta(hours=1)))
        old = self.held.read_bytes()
        first = json.dumps(_document("ready") | {"writer": "first"}).encode()
        delayed = json.dumps(_document("ready") | {"writer": "delayed"}).encode()
        original_temporary = tempfile.NamedTemporaryFile
        for interrupted in (False, True):
            with self.subTest(interrupted=interrupted):
                self.held.write_bytes(old)
                paused, release = threading.Event(), threading.Event()
                paths = []

                @contextmanager
                def output_file(*args, **kwargs):
                    with original_temporary(*args, **kwargs) as output:
                        paths.append(Path(output.name))
                        write = output.write

                        def staged_write(data):
                            if data != delayed:
                                return write(data)
                            write(data[:10])
                            output.flush()
                            paused.set()
                            if not release.wait(5):
                                raise RuntimeError("cache test scheduler timeout")
                            if interrupted:
                                raise OSError("interrupted concurrent write")
                            return write(data[10:])

                        with patch.object(output, "write", side_effect=staged_write):
                            yield output

                with (
                    patch.object(tempfile, "NamedTemporaryFile", output_file),
                    ThreadPoolExecutor(max_workers=1) as pool,
                ):
                    future = pool.submit(
                        publish_forecast._write_held_snapshot, delayed, self.held
                    )
                    try:
                        self.assertTrue(paused.wait(5), "delayed writer did not start")
                        self.assertEqual(self.held.read_bytes(), old)
                        publish_forecast._write_held_snapshot(first, self.held)
                        self.assertEqual(self.held.read_bytes(), first)
                        self.assertEqual(len(set(paths)), 2)
                        self.assertTrue(
                            paths[0].exists(),
                            "first writer removed another writer's partial",
                        )
                    finally:
                        release.set()
                    if interrupted:
                        with self.assertRaisesRegex(
                            OSError, "interrupted concurrent write"
                        ):
                            future.result(timeout=5)
                    else:
                        future.result(timeout=5)
                self.assertEqual(
                    self.held.read_bytes(), first if interrupted else delayed
                )
                self.assertEqual(list(self.held.parent.glob("*.partial")), [])

    def test_repeated_concurrent_writes_expose_only_complete_valid_snapshots(
        self,
    ) -> None:
        self.write_held(_document("ready"))
        sources = [self.root / f"writer-{index}.json" for index in range(4)]
        allowed = {self.held.read_bytes()}
        for index, source in enumerate(sources):
            source.write_text(json.dumps(_document("ready") | {"writer": index}))
            allowed.add(source.read_bytes())
        stop = threading.Event()
        started = threading.Event()

        def read_snapshots():
            count = 0
            while not stop.is_set():
                content = self.held.read_bytes()
                self.assertIn(content, allowed)
                self.assertEqual(json.loads(content)["status"], "ready")
                count += 1
                started.set()
            return count

        def write_snapshots(source):
            for _ in range(20):
                remember_good(source, self.held, now=NOW)

        with ThreadPoolExecutor(max_workers=5) as pool:
            reader = pool.submit(read_snapshots)
            try:
                self.assertTrue(started.wait(5), "reader did not start")
                writers = [pool.submit(write_snapshots, source) for source in sources]
                for writer in writers:
                    writer.result(timeout=5)
            finally:
                stop.set()
            self.assertGreater(reader.result(timeout=5), 0)
        self.assertIn(self.held.read_bytes(), allowed)
        self.assertEqual(list(self.held.parent.glob("*.partial")), [])


class ChooseSourceReadyTest(HoldTestCase):
    def test_ready_candidate_is_published_and_remembered(self) -> None:
        self.write_candidate(_document("ready"))

        self.assertEqual(self.choose(), self.candidate)
        self.assertEqual(json.loads(self.held.read_text()), _document("ready"))

    def test_ready_candidate_publishes_even_if_it_cannot_be_remembered(self) -> None:
        """The guard must never block a publish -- not even to save state."""
        blocker = self.root / "blocker"
        blocker.write_text("not a directory", encoding="utf-8")
        self.write_candidate(_document("ready"))

        result = choose_source(
            self.candidate, blocker / "state" / "held.json", now=NOW
        )

        self.assertEqual(result, self.candidate)
        self.assertIn("could not remember", self.logs.getvalue())


class ChooseSourceDegradedTest(HoldTestCase):
    def test_unexpected_held_validation_errors_still_propagate(self):
        self.write_candidate(_document("degraded"))
        self.write_held(_document("ready"))
        original = publish_forecast.prepare_forecast
        for error in (
            AttributeError("core bug"),
            TypeError("core bug"),
            OSError("core bug"),
            ValueError("core bug"),
        ):

            def prepare(document, clock):
                if document["status"] == "ready":
                    raise error
                return original(document, clock)

            with (
                self.subTest(error=type(error).__name__),
                patch.object(publish_forecast, "prepare_forecast", side_effect=prepare),
            ):
                with self.assertRaises(type(error)):
                    self.choose()

    def test_holds_a_fresh_ready_document(self) -> None:
        self.write_candidate(_document("degraded"))
        self.write_held(_document("ready", NOW - timedelta(hours=1)))

        self.assertEqual(self.choose(), self.held)
        self.assertIn("holding last ready document", self.logs.getvalue())

    def test_publishes_the_candidate_once_the_held_document_is_stale(self) -> None:
        self.write_candidate(_document("degraded"))
        self.write_held(_document("ready", NOW - timedelta(hours=7)))

        self.assertEqual(self.choose(), self.candidate)
        self.assertIn("too old (7.0h)", self.logs.getvalue())

    def test_naive_held_timestamp_falls_back_to_candidate(self) -> None:
        self.write_candidate(_document("degraded"))
        self.write_held(_document("ready", "2026-08-08T12:00:00"))

        self.assertEqual(self.choose(), self.candidate)
        self.assertIn("issued_at has no UTC offset", self.logs.getvalue())

    def test_refuses_to_hold_a_degraded_document(self) -> None:
        self.write_candidate(_document("degraded"))
        self.write_held(_document("degraded", NOW - timedelta(minutes=30)))

        self.assertEqual(self.choose(), self.candidate)
        self.assertIn("not ready", self.logs.getvalue())

    def test_publishes_the_candidate_when_nothing_is_held(self) -> None:
        self.write_candidate(_document("degraded"))

        self.assertEqual(self.choose(), self.candidate)
        self.assertIn("no usable held ready document", self.logs.getvalue())

    def test_publishes_the_candidate_when_the_held_document_is_unusable(self) -> None:
        self.write_candidate(_document("degraded"))
        for held in ("{ truncated", json.dumps({"status": "ready"}), "null"):
            with self.subTest(held=held):
                self.write_held(held)
                self.assertEqual(self.choose(), self.candidate)


class ClockSkewTest(HoldTestCase):
    """A backwards clock step must not disable the hold; a bad stamp must not pin it."""

    def test_holds_through_a_small_backwards_clock_step(self) -> None:
        self.write_candidate(_document("degraded"))
        self.write_held(_document("ready", NOW + timedelta(seconds=2)))

        self.assertEqual(self.choose(), self.held)

    def test_rejects_a_document_dated_far_in_the_future(self) -> None:
        self.write_candidate(_document("degraded"))
        self.write_held(_document("ready", NOW + timedelta(hours=4)))

        self.assertEqual(self.choose(), self.candidate)
        self.assertIn("240m in the future", self.logs.getvalue())

    def test_never_reports_a_negative_age(self) -> None:
        self.write_candidate(_document("degraded"))
        self.write_held(_document("ready", NOW + timedelta(hours=4)))

        self.choose()

        self.assertNotIn("-", self.logs.getvalue().rsplit("status=", 1)[-1])

    def test_hold_and_skew_boundaries_are_inclusive(self) -> None:
        self.write_candidate(_document("degraded"))
        for age, expected in (
            (21600, self.held),
            (21601, self.candidate),
            (-300, self.held),
            (-301, self.candidate),
        ):
            with self.subTest(age=age):
                self.write_held(_document("ready", NOW - timedelta(seconds=age)))
                self.assertEqual(self.choose(), expected)


class MalformedCandidateTest(HoldTestCase):
    def test_valid_json_that_is_not_an_object_does_not_raise(self) -> None:
        """load_document refuses these downstream; the guard must not crash first."""
        self.write_held(_document("ready", NOW - timedelta(minutes=30)))
        for candidate in ("null", "[1, 2]", '"ready"', "42"):
            with self.subTest(candidate=candidate):
                self.write_candidate(candidate)
                self.assertEqual(self.choose(), self.held)
                self.assertIn("rejected incoming document", self.logs.getvalue())

    def test_invalid_json_publishes_the_candidate(self) -> None:
        self.write_candidate('{"status": "ready"')

        self.assertEqual(self.choose(), self.candidate)

    def test_missing_candidate_publishes_the_candidate(self) -> None:
        self.assertEqual(self.choose(), self.candidate)

    def test_read_failures_consult_a_usable_hold(self) -> None:
        self.write_held(_document("ready"))
        for failure in ("missing", "permissions", "utf8"):
            with self.subTest(failure=failure):
                self.write_candidate(_document("ready"))
                original_read = Path.read_bytes

                def read(path):
                    if path == self.candidate and failure == "permissions":
                        raise PermissionError("injected unreadable candidate")
                    return original_read(path)

                if failure == "missing":
                    self.candidate.unlink()
                elif failure == "utf8":
                    self.candidate.write_bytes(b"\xff")
                with patch.object(Path, "read_bytes", read):
                    self.assertEqual(self.choose(), self.held)

    def test_malformed_held_rows_fall_back_and_expired_rows_are_never_transformed(
        self,
    ) -> None:
        self.write_candidate(_document("degraded"))
        original = publish_forecast.prepare_forecast
        for age in (1, 24, -1):
            with self.subTest(age=age):
                self.write_held(
                    _document("ready", NOW - timedelta(hours=age)) | {"hourly": [None]}
                )
                with patch.object(
                    publish_forecast, "prepare_forecast", wraps=original
                ) as prepare:
                    self.assertEqual(self.choose(), self.candidate)
                self.assertEqual(prepare.call_count, 2 if age == 1 else 1)

    def test_unreadable_held_copy_falls_back(self) -> None:
        self.write_candidate(_document("degraded"))
        self.write_held(_document("ready"))
        original_read = Path.read_bytes

        def read(path):
            if path == self.held:
                raise PermissionError("injected unreadable hold")
            return original_read(path)

        with patch.object(Path, "read_bytes", read):
            self.assertEqual(self.choose(), self.candidate)
        self.assertIn("injected unreadable hold", self.logs.getvalue())


class LeadBucketTest(unittest.TestCase):
    @staticmethod
    def _row(bucket: str) -> dict[str, Any]:
        return {
            "valid_time": "2026-08-08T12:00:00+00:00",
            "lead_hours": 60.0,
            "lead_bucket": bucket,
            "values": {"temp_c": 21.0},
        }

    def test_accepts_every_bucket_the_consumer_enum_knows(self) -> None:
        # The 96h horizon depends on these buckets; looping over the set alone
        # would silently shrink coverage if one were ever removed.
        self.assertIn("48-96h", publish_forecast.KNOWN_LEAD_BUCKETS)
        self.assertIn("96-168h", publish_forecast.KNOWN_LEAD_BUCKETS)
        for bucket in sorted(publish_forecast.KNOWN_LEAD_BUCKETS):
            with self.subTest(bucket=bucket):
                self.assertEqual(_hourly_row(self._row(bucket))["lead_bucket"], bucket)

    def test_refuses_a_bucket_beyond_the_published_horizon(self) -> None:
        with self.assertRaisesRegex(RefusedError, "unknown lead_bucket '168-240h'"):
            _hourly_row(self._row("168-240h"))


class CoreValidationTest(unittest.TestCase):
    def test_standalone_row_builders_refuse_non_objects(self):
        for builder in (_hourly_row, _daily_row):
            for value in (None, [], "", 0, False):
                with self.subTest(builder=builder.__name__, value=value):
                    with self.assertRaisesRegex(
                        RefusedError, "row: expected an object"
                    ):
                        builder(value)

    def test_transform_refuses_non_object_documents(self):
        for value in (None, [], "", 0, False):
            with self.subTest(value=value):
                with self.assertRaisesRegex(
                    RefusedError, "forecast: expected an object"
                ):
                    transform(value, NOW)

    def test_absent_and_null_optional_collections_keep_empty_defaults(self):
        for value in (None, []):
            document = _document("ready") | {"hourly": value, "daily": value}
            published = transform(document, NOW)
            self.assertEqual(published["hourly"], [])
            self.assertEqual(published["daily"], [])
        for product, row in (
            ("hourly", LeadBucketTest._row("0-1h")),
            ("daily", {"date_local": "2026-08-08", "lead_days": 0, "values": {}}),
        ):
            for optional in ({}, {"truth_semantics": None, "quantiles": None}):
                with self.subTest(product=product, optional=optional):
                    published = transform(
                        _document("ready") | {product: [row | optional]}, NOW
                    )
                    self.assertEqual(published["truth_semantics"], {})
                    self.assertEqual(published[product][0]["quantiles"], {})

    def test_oversized_in_memory_integers_are_contextual_refusals(self):
        for value in (10**400, -(10**400)):
            with self.subTest(sign=value > 0):
                with self.assertRaisesRegex(
                    RefusedError,
                    "hourly values.temp_c: conversion to temp_f overflowed",
                ):
                    publish_forecast._convert(
                        value,
                        publish_forecast.HOURLY_VARIABLES["temp_c"],
                        field="hourly values.temp_c",
                    )

    def test_nonnumeric_errors_include_product_variable_and_level(self):
        for field in ("hourly values.temp_c", "daily quantiles.temp_max_c['0.5']"):
            for value in (True, "warm", [], {}):
                with self.subTest(field=field, value=value):
                    with self.assertRaises(RefusedError) as error:
                        publish_forecast._convert(
                            value,
                            publish_forecast.HOURLY_VARIABLES["temp_c"],
                            field=field,
                        )
                    self.assertIn(f"{field}: expected a number", str(error.exception))

    def test_in_memory_nonfinite_cleanup_and_rounding_are_preserved(self):
        conversion = publish_forecast.HOURLY_VARIABLES["temp_c"]
        for value in (None, float("nan"), float("inf"), -float("inf")):
            self.assertIsNone(publish_forecast._convert(value, conversion))
        self.assertEqual(publish_forecast._convert(21.234, conversion), 70.22)
        self.assertEqual(publish_forecast._convert(0, conversion), 32)


class SelectionReasonsTest(unittest.TestCase):
    def test_hourly_reasons_are_renamed_to_consumer_variables(self) -> None:
        row = LeadBucketTest._row("0-1h")
        row["selection_reasons"] = {"temp_c": "lowest backtest MAE"}
        published = _hourly_row(row)
        self.assertEqual(published["selection_reasons"], {"temp_f": "lowest backtest MAE"})

    def test_daily_reasons_are_renamed_to_consumer_variables(self) -> None:
        row: dict[str, Any] = {
            "date_local": "2026-08-08",
            "lead_days": 0,
            "values": {"temp_max_c": 35.0},
            "selection_reasons": {"temp_max_c": "lowest backtest MAE"},
        }
        published = _daily_row(row)
        self.assertEqual(published["selection_reasons"], {"temp_max_f": "lowest backtest MAE"})

    def test_absent_reasons_publish_as_an_empty_map(self) -> None:
        self.assertEqual(_hourly_row(LeadBucketTest._row("0-1h"))["selection_reasons"], {})

    def test_an_unknown_reason_variable_is_refused(self) -> None:
        row = LeadBucketTest._row("0-1h")
        row["selection_reasons"] = {"vibes": "felt right"}
        with self.assertRaisesRegex(RefusedError, "unknown hourly variable"):
            _hourly_row(row)

    def test_a_non_object_reasons_map_is_refused(self) -> None:
        # Falsy non-objects included: only None may stand in for an absent map.
        for bad in ("lowest MAE", [], 0):
            with self.subTest(bad=bad):
                row = LeadBucketTest._row("0-1h")
                row["selection_reasons"] = bad
                with self.assertRaisesRegex(RefusedError, "expected an object"):
                    _hourly_row(row)

    def test_a_non_string_hourly_reason_is_refused(self) -> None:
        row = LeadBucketTest._row("0-1h")
        row["selection_reasons"] = {"temp_c": 7}
        with self.assertRaisesRegex(RefusedError, "hourly metadata for 'temp_c' is not a string"):
            _hourly_row(row)

    def test_a_non_string_daily_reason_is_refused(self) -> None:
        row: dict[str, Any] = {
            "date_local": "2026-08-08",
            "lead_days": 0,
            "values": {"temp_max_c": 35.0},
            "selection_reasons": {"temp_max_c": None},
        }
        with self.assertRaisesRegex(RefusedError, "daily metadata for 'temp_max_c' is not a string"):
            _daily_row(row)


class ReleaseCohortTest(unittest.TestCase):
    @staticmethod
    def _document(**overrides: Any) -> dict[str, Any]:
        document: dict[str, Any] = _document("ready") | {
            "issued_at": "2026-08-08T12:00:00+00:00",
            "observation_at": "2026-08-08T11:59:00+00:00",
            "hourly": [],
            "daily": [],
        }
        document.update(overrides)
        return document

    def _transform(self, **overrides: Any) -> dict[str, Any]:
        published_at = datetime(2026, 8, 8, 12, 5, tzinfo=UTC)
        return transform(self._document(**overrides), published_at)

    def test_the_cohort_list_passes_through_verbatim(self) -> None:
        published = self._transform(release_ids=["2a2b510af0e95621"])
        self.assertEqual(published["release_ids"], ["2a2b510af0e95621"])

    def test_missing_observation_time_remains_null(self) -> None:
        self.assertIsNone(self._transform(observation_at=None)["observation_at"])

    def test_malformed_observation_time_is_refused(self) -> None:
        with self.assertRaisesRegex(RefusedError, "observation_at is not a string"):
            self._transform(observation_at=123)

    def test_an_absent_cohort_publishes_as_an_empty_list(self) -> None:
        self.assertEqual(self._transform()["release_ids"], [])

    def test_a_non_list_cohort_is_refused(self) -> None:
        with self.assertRaisesRegex(RefusedError, "release_ids is not a list of strings"):
            self._transform(release_ids="2a2b510af0e95621")

    def test_the_publisher_version_names_this_contract(self) -> None:
        self.assertEqual(self._transform()["publisher_version"], "2.0.0")

    def test_schema_six_preserves_hourly_values_and_release_attribution(self) -> None:
        row = LeadBucketTest._row("0-1h")
        row.update(
            values={"temp_c": 20.0},
            methods={"temp_c": "equal_weight"},
            release_ids={"temp_c": "hourly-release"},
            quantiles={"temp_c": {"0.1": 18.0, "0.9": 22.0}},
            quantiles_source={"temp_c": "residual"},
        )
        published = self._transform(
            schema_version=6,
            release_ids=["hourly-release", "minutely-release"],
            hourly=[row],
            minutely=[{"release_ids": {"temp_c": "minutely-release"}}],
        )
        self.assertEqual(published["source_schema_version"], 6)
        self.assertEqual(published["schema_version"], 2)
        self.assertEqual(published["hourly"][0]["values"]["temp_f"], 68.0)
        self.assertEqual(
            published["hourly"][0]["release_ids"]["temp_f"], "hourly-release"
        )
        self.assertEqual(
            published["hourly"][0]["quantiles"]["temp_f"], {"0.1": 64.4, "0.9": 71.6}
        )
        self.assertNotIn("minutely", published)

    def test_schema_five_remains_compatible_for_held_documents(self) -> None:
        self.assertEqual(self._transform(schema_version=5)["source_schema_version"], 5)

    def test_future_schema_is_refused(self) -> None:
        for version in (7, "6", 6.0, True, None, [], {}):
            with self.subTest(version=version):
                with self.assertRaisesRegex(RefusedError, "source schema_version"):
                    self._transform(schema_version=version)

    def test_missing_observation_remains_nullable(self) -> None:
        self.assertIsNone(
            self._transform(schema_version=6, observation_at=None)["observation_at"]
        )


if __name__ == "__main__":
    unittest.main()
