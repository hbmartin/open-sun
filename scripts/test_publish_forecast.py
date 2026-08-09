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
import tempfile
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

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
    document: dict[str, Any] = {"schema_version": 5, "status": status}
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

        remember_good(self.candidate, self.held)

        self.assertEqual(json.loads(self.held.read_text()), _document("ready"))

    def test_replaces_an_existing_document_and_leaves_no_partial(self) -> None:
        self.write_held(_document("ready", NOW - timedelta(hours=3)))
        self.write_candidate(_document("ready"))

        remember_good(self.candidate, self.held)

        self.assertEqual(json.loads(self.held.read_text()), _document("ready"))
        self.assertFalse(self.held.with_suffix(".partial").exists())


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

    def test_treats_a_naive_issued_at_as_utc(self) -> None:
        self.write_candidate(_document("degraded"))
        self.write_held(_document("ready", "2026-08-08T12:00:00"))

        self.assertEqual(self.choose(), self.held)

    def test_refuses_to_hold_a_degraded_document(self) -> None:
        self.write_candidate(_document("degraded"))
        self.write_held(_document("degraded", NOW - timedelta(minutes=30)))

        self.assertEqual(self.choose(), self.candidate)
        self.assertIn("not ready", self.logs.getvalue())

    def test_publishes_the_candidate_when_nothing_is_held(self) -> None:
        self.write_candidate(_document("degraded"))

        self.assertEqual(self.choose(), self.candidate)
        self.assertIn("no held ready document", self.logs.getvalue())

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


class MalformedCandidateTest(HoldTestCase):
    def test_valid_json_that_is_not_an_object_does_not_raise(self) -> None:
        """load_document refuses these downstream; the guard must not crash first."""
        self.write_held(_document("ready", NOW - timedelta(minutes=30)))
        for candidate in ("null", "[1, 2]", '"ready"', "42"):
            with self.subTest(candidate=candidate):
                self.write_candidate(candidate)
                self.assertEqual(self.choose(), self.candidate)

    def test_invalid_json_publishes_the_candidate(self) -> None:
        self.write_candidate('{"status": "ready"')

        self.assertEqual(self.choose(), self.candidate)

    def test_missing_candidate_publishes_the_candidate(self) -> None:
        self.assertEqual(self.choose(), self.candidate)


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
        document: dict[str, Any] = {
            "schema_version": 5,
            "status": "ready",
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

    def test_an_absent_cohort_publishes_as_an_empty_list(self) -> None:
        self.assertEqual(self._transform()["release_ids"], [])

    def test_a_non_list_cohort_is_refused(self) -> None:
        with self.assertRaisesRegex(RefusedError, "release_ids is not a list of strings"):
            self._transform(release_ids="2a2b510af0e95621")

    def test_the_publisher_version_names_this_contract(self) -> None:
        self.assertEqual(self._transform()["publisher_version"], "1.3.0")


if __name__ == "__main__":
    unittest.main()
