"""Local rollback floors and cooperating-process publication ordering."""

import io
import json
import os
import subprocess
import sys
import time
import unittest
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

import publish_forecast as publisher
import test_publish_town_card as integration

NOW = integration.NOW

PROCESS = """\
import json,sys,time
from datetime import datetime
from pathlib import Path
import publish_forecast as p
source,role,timeout=sys.argv[1:]
root=Path.home()
p.PUBLICATION_LOCK_TIMEOUT_S=float(timeout)
flock=p.fcntl.flock
def tracked_flock(*args):
    try: return flock(*args)
    except BlockingIOError:
        (root / (role+'.waiting')).touch()
        if (root/'new.state-entry').exists():
            (root/(role+'.waiting-for-state')).touch()
        raise
p.fcntl.flock=tracked_flock
def wait_for(name):
    deadline=time.monotonic()+10
    while not (root/name).exists():
        if time.monotonic()>deadline: raise RuntimeError('test scheduler timeout: '+name)
        time.sleep(0.01)
if role=='holder':
    with p.publication_lock(p.DEFAULT_REMOTE,p.DEFAULT_BRANCH):
        (root/'holder.locked').touch()
        sys.stdin.read()
    raise SystemExit(0)
def push(*args):
    (root/(role+'.pushed')).touch()
    if role=='new': wait_for('release-push')
p.push=push
write=p.write_publication_state
def state(*args):
    (root/(role+'.state-entry')).touch()
    if role=='new': wait_for('release-state')
    write(*args)
p.write_publication_state=state
raise SystemExit(p.run(source=source,force=True,now=datetime.fromisoformat('2026-10-22T14:00:00+00:00')))
"""


class PublicationHistoryTests(unittest.TestCase):
    def setUp(self):
        self.t = integration.PublisherTownCardTest()
        self.t.setUp()
        self.addCleanup(self.t.doCleanups)

    def test_successful_publication_cannot_go_back_in_time_even_with_force(self):
        t = self.t
        self.assertEqual(t.invoke()[0], 0)
        old = t.source.read_bytes()
        t.document["issued_at"] = (NOW + timedelta(hours=1)).isoformat()
        t.save_source()
        self.assertEqual(t.invoke()[0], 0)
        self.assertEqual(
            json.loads(t.state.read_bytes())["issued_at"], t.document["issued_at"]
        )
        previous = t.stamp.read_bytes(), t.state.read_bytes()
        t.source.write_bytes(old)
        for options in ({}, {"force": True}):
            with (
                self.subTest(options=options),
                patch.object(publisher, "build_commit") as build,
            ):
                code, _, error = t.invoke(**options)
                self.assertEqual(code, 2)
                self.assertIn("older than the last known publication", error)
                self.assertNotIn("Traceback", error)
                build.assert_not_called()
                self.assertEqual((t.stamp.read_bytes(), t.state.read_bytes()), previous)
        self.assertEqual(len(t.trees), 2)
        for options in ({"dry_run": True}, {"no_push": True}):
            with self.subTest(options=options):
                self.assertEqual(t.invoke(**options)[0], 0)
                self.assertEqual((t.stamp.read_bytes(), t.state.read_bytes()), previous)
        self.assertEqual(t.push.call_count, 2)

    def test_held_rollback_uses_incoming_degraded_or_refuses_invalid_input(self):
        t = self.t
        held = t.root / "held.json"
        held.write_bytes(t.source.read_bytes())
        t.document["issued_at"] = (NOW + timedelta(hours=1)).isoformat()
        t.save_source()
        t.invoke()
        history = t.stamp.read_bytes(), t.state.read_bytes()
        t.source.write_text('{"broken"')
        with patch.object(publisher, "_log_stream", io.StringIO()) as logs:
            selected = publisher.choose_source(
                t.source, held, now=NOW + timedelta(hours=2)
            )
        self.assertEqual(selected, t.source)
        self.assertIn("older than", logs.getvalue())
        self.assertEqual(t.invoke(source=selected)[0], 2)
        self.assertEqual((t.stamp.read_bytes(), t.state.read_bytes()), history)
        t.document.update(
            status="degraded", issued_at=(NOW + timedelta(hours=2)).isoformat()
        )
        t.save_source()
        with patch.object(publisher, "_log_stream", io.StringIO()):
            selected = publisher.choose_source(
                t.source, held, now=NOW + timedelta(hours=2)
            )
        self.assertEqual(selected, t.source)
        self.assertEqual(t.invoke(source=selected)[0], 0)
        self.assertEqual(json.loads(t.trees[-1]["forecast.json"])["status"], "degraded")

    def test_equal_instants_and_changed_same_issue_content_can_publish(self):
        t = self.t
        t.invoke()
        t.document["issued_at"] = "2026-10-22T05:46:00-07:00"
        t.document["status_reason"] = "same issue update"
        t.save_source()
        self.assertEqual(t.invoke(force=True)[0], 0)
        self.assertEqual(t.push.call_count, 2)

    def test_floors_are_destination_specific_and_use_newest_production_history(self):
        t = self.t
        t.invoke()
        old = t.source.read_bytes()
        held = t.root / "held.json"
        held.write_bytes(old)
        t.document["issued_at"] = (NOW + timedelta(hours=1)).isoformat()
        t.save_source()
        t.invoke()
        newer = t.stamp.read_bytes()
        t.source.write_bytes(old)
        for options in ({"branch": "scratch"}, {"remote": "alternate"}):
            with self.subTest(options=options):
                self.assertEqual(t.invoke(**options)[0], 0)
                t.source.write_text('{"broken"')
                with patch.object(publisher, "_log_stream", io.StringIO()):
                    self.assertEqual(
                        publisher.choose_source(t.source, held, now=NOW, **options),
                        held,
                    )
                    self.assertEqual(
                        publisher.choose_source(t.source, held, now=NOW), t.source
                    )
                t.source.write_bytes(old)
                self.assertEqual(t.stamp.read_bytes(), newer)
        # A newer state protects production even if the legacy stamp is stale.
        t.stamp.write_text(json.loads(old)["issued_at"])
        self.assertEqual(t.invoke()[0], 2)
        # A newer stamp protects production if the record is lost or downgraded.
        t.stamp.write_bytes(newer)
        for contents in (None, '{"schema_version":1}', "{broken"):
            with self.subTest(contents=contents):
                if contents is None:
                    t.state.unlink(missing_ok=True)
                else:
                    t.state.write_text(contents)
                self.assertEqual(t.invoke(force=True)[0], 2)

    def test_unknown_history_and_version_one_upgrade_allow_initial_publication(self):
        t = self.t
        for value in (None, "{broken", '{"schema_version":1}', "[]"):
            with self.subTest(value=value):
                t.stamp.unlink(missing_ok=True)
                t.state.parent.mkdir(parents=True, exist_ok=True)
                if value is None:
                    t.state.unlink(missing_ok=True)
                else:
                    t.state.write_text(value)
                code, log, _ = t.invoke()
                self.assertEqual(code, 0)
                self.assertIn("rollback protection unavailable", log)
                state = json.loads(t.state.read_bytes())
                self.assertEqual(state["schema_version"], 2)
                self.assertEqual(state["issued_at"], t.document["issued_at"])

    def test_failed_state_write_remains_nonfatal_and_stamp_preserves_production_floor(
        self,
    ):
        t = self.t
        t.invoke()
        old = t.source.read_bytes()
        previous = t.state.read_bytes()
        t.document["issued_at"] = (NOW + timedelta(hours=1)).isoformat()
        t.save_source()
        replace = Path.replace

        def fail_state(path, target):
            if target == t.state:
                raise OSError("injected state replacement failure")
            return replace(path, target)

        with patch.object(Path, "replace", fail_state):
            code, log, _ = t.invoke()
        self.assertEqual(code, 0)
        self.assertIn("could not write publication state", log)
        self.assertEqual(t.state.read_bytes(), previous)
        t.source.write_bytes(old)
        for force in (False, True):
            self.assertEqual(t.invoke(force=force)[0], 2)

    def test_unreadable_or_malformed_local_records_have_no_floor(self):
        t = self.t
        t.invoke(branch="scratch")
        path = publisher.publication_state_path(publisher.DEFAULT_REMOTE, "scratch")
        read = Path.read_bytes

        def unreadable(source):
            if source == path:
                raise PermissionError("injected history read failure")
            return read(source)

        with patch.object(Path, "read_bytes", unreadable):
            self.assertIsNone(
                publisher.read_publication_state(publisher.DEFAULT_REMOTE, "scratch")
            )
            self.assertEqual(t.invoke(branch="scratch")[0], 0)
        t.stamp.write_bytes(b"\xff")
        self.assertIsNone(
            publisher.publication_floor(
                publisher.DEFAULT_REMOTE, publisher.DEFAULT_BRANCH, None
            )
        )

    def test_lock_io_failures_exit_three_before_build_or_push(self):
        t = self.t
        for function in ("open", "flock"):
            with self.subTest(function=function):
                target = publisher.os if function == "open" else publisher.fcntl
                with (
                    patch.object(
                        target,
                        function,
                        side_effect=PermissionError("injected lock failure"),
                    ),
                    patch.object(publisher, "build_commit") as build,
                ):
                    code, _, error = t.invoke()
                self.assertEqual(code, 3)
                self.assertIn("cannot acquire publication lock", error)
                self.assertNotIn("Traceback", error)
                build.assert_not_called()
                t.push.assert_not_called()
                self.assertFalse(t.stamp.exists())
                self.assertFalse(t.state.exists())

    def start_process(self, source, role, timeout=5):
        home = self.t.root
        (home / "Library/Caches").mkdir(parents=True, exist_ok=True)
        process = subprocess.Popen(
            [sys.executable, "-B", "-c", PROCESS, str(source), role, str(timeout)],
            env=dict(
                os.environ,
                HOME=str(home),
                PYTHONPATH=str(Path(publisher.__file__).parent),
            ),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

        def cleanup():
            if process.poll() is None:
                process.kill()
            process.communicate(timeout=5)

        self.addCleanup(cleanup)
        return process

    def wait_marker(self, name):
        deadline = time.monotonic() + 5
        while not (self.t.root / name).exists():
            if time.monotonic() > deadline:
                self.fail(f"process scheduler timeout waiting for {name}")
            time.sleep(0.01)

    def test_competing_publishers_wait_through_push_and_history_write(self):
        t = self.t
        old = t.root / "old.json"
        old.write_bytes(t.source.read_bytes())
        t.document["issued_at"] = (NOW + timedelta(hours=1)).isoformat()
        t.save_source()
        newer = self.start_process(t.source, "new")
        self.wait_marker("new.pushed")
        older = self.start_process(old, "old")
        self.wait_marker("old.waiting")
        self.assertFalse((t.root / "old.pushed").exists())
        (t.root / "release-push").touch()
        self.wait_marker("new.state-entry")
        self.wait_marker("old.waiting-for-state")
        self.assertIsNone(older.poll())
        self.assertFalse((t.root / "old.state-entry").exists())
        (t.root / "release-state").touch()
        _, error = newer.communicate(timeout=10)
        self.assertEqual(newer.returncode, 0, error)
        _, error = older.communicate(timeout=10)
        self.assertEqual(older.returncode, 2, error)
        self.assertIn("older than the last known publication", error)
        self.assertFalse((t.root / "old.pushed").exists())
        actual = t.root / "Library/Application Support/grounded-weather-forecast"
        state = json.loads(
            next((actual / "last-published-states").glob("*.json")).read_bytes()
        )
        self.assertEqual(state["issued_at"], t.document["issued_at"])

    def test_lock_timeout_and_process_death_release(self):
        t = self.t
        holder = self.start_process(t.source, "holder")
        self.wait_marker("holder.locked")
        blocked = self.start_process(t.source, "blocked", timeout=0.1)
        _, error = blocked.communicate(timeout=5)
        self.assertEqual(blocked.returncode, 3, error)
        self.assertIn("timed out waiting for publication lock", error)
        self.assertFalse((t.root / "blocked.pushed").exists())
        holder.kill()
        holder.communicate(timeout=5)
        freed = self.start_process(t.source, "freed", timeout=0.1)
        _, error = freed.communicate(timeout=10)
        self.assertEqual(freed.returncode, 0, error)
        self.assertTrue((t.root / "freed.pushed").exists())


if __name__ == "__main__":
    unittest.main()
