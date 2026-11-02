"""Offline receipts bind exact successful pushes, including a racing replacement."""

import base64
import hashlib
import json
import subprocess
import unittest
from pathlib import Path
from datetime import datetime
from unittest.mock import patch

import publish_forecast as publisher
import test_publish_town_card as integration

REAL_PUSH = publisher.push


class PublicationReceiptTests(unittest.TestCase):
    def setUp(self):
        self.t = integration.PublisherTownCardTest()
        self.t.setUp()
        self.addCleanup(self.t.doCleanups)

    def invoke(self, **kwargs):
        return publisher.run_with_receipt(
            source=self.t.source,
            include_dir=self.t.staged,
            now=integration.NOW,
            **kwargs,
        )

    def test_success_keeps_exact_consumed_source_and_forecast_bytes(self):
        original = self.t.source.read_bytes()
        read = type(self.t.source).read_bytes
        reads = []

        def tracked(path):
            if path.resolve() == self.t.source.resolve():
                reads.append(path)
            return read(path)

        capture = self.t.capture_tree

        def changed_after_read(*args):
            self.t.source.write_text('{"replaced":"after source read"}')
            capture(*args)

        self.t.push.side_effect = changed_after_read
        with patch.object(type(self.t.source), "read_bytes", tracked):
            result = self.invoke()
        self.assertEqual([p.resolve() for p in reads], [self.t.source.resolve()])
        self.assertEqual((result.exit_code, result.outcome), (0, "pushed"))
        receipt = result.receipt.to_dict()
        self.assertEqual(receipt["source_sha256"], hashlib.sha256(original).hexdigest())
        self.assertEqual(
            base64.b64decode(receipt["forecast_base64"]),
            self.t.trees[-1]["forecast.json"],
        )
        self.assertEqual(
            receipt["forecast_sha256"],
            hashlib.sha256(self.t.trees[-1]["forecast.json"]).hexdigest(),
        )
        self.assertEqual(receipt["commit"], self.t.push.call_args.args[3])
        self.assertEqual(len(receipt["commit"]), 40)

    def test_non_push_outcomes_never_return_receipts(self):
        for kwargs, outcome in (
            ({"dry_run": True}, "dry-run"),
            ({"no_push": True}, "built-only"),
        ):
            with self.subTest(outcome=outcome):
                result = self.invoke(**kwargs)
                self.assertEqual(result.outcome, outcome)
                self.assertIsNone(result.receipt)
        self.assertEqual(self.invoke().outcome, "pushed")
        result = self.invoke()
        self.assertEqual(result.outcome, "unchanged")
        self.assertIsNone(result.receipt)
        self.t.push.side_effect = publisher.GitError("rejected")
        result = self.invoke(force=True)
        self.assertEqual(
            (result.exit_code, result.outcome, result.receipt), (3, "failed", None)
        )
        self.t.source.write_text("{}")
        self.assertEqual(self.invoke().outcome, "refused")

    def test_receipt_survives_immediate_branch_replacement(self):
        remote = self.t.root / "remote.git"
        subprocess.run(
            [publisher.GIT, "init", "--bare", "--quiet", str(remote)], check=True
        )

        def racing_push(git_dir, _remote, branch, commit):
            REAL_PUSH(git_dir, str(remote), branch, commit)
            replacement = publisher.build_commit(
                {"forecast.json": b'{"racing":"replacement"}\n'},
                self.t.root / "replacement.git",
                branch,
                integration.NOW.isoformat(),
            )
            REAL_PUSH(self.t.root / "replacement.git", str(remote), branch, replacement)

        self.t.push.side_effect = racing_push
        result = self.invoke()
        receipt = result.receipt
        current = (
            subprocess.check_output(
                [
                    publisher.GIT,
                    "--git-dir",
                    str(remote),
                    "rev-parse",
                    "refs/heads/data",
                ]
            )
            .decode()
            .strip()
        )
        self.assertNotEqual(current, receipt.commit)
        original = subprocess.check_output(
            [
                publisher.GIT,
                "--git-dir",
                str(remote),
                "show",
                f"{receipt.commit}:forecast.json",
            ]
        )
        self.assertEqual(original, receipt.forecast_bytes)
        self.assertEqual(json.loads(original)["issued_at"], receipt.issued_at)

    def test_retry_pushes_the_same_explicit_commit(self):
        with (
            patch.object(
                publisher, "_git", side_effect=[publisher.GitError("retry"), ""]
            ) as git,
            patch.object(publisher.time, "sleep"),
        ):
            REAL_PUSH(self.t.root / "unused.git", "local-fixture", "data", "a" * 40)
        self.assertEqual(git.call_count, 2)
        for call in git.call_args_list:
            self.assertEqual(call.args[0][-1], "a" * 40 + ":refs/heads/data")

    def test_shared_contract_fixture_is_actual_transform_output(self):
        fixture = json.loads(
            Path(__file__)
            .with_name("fixtures")
            .joinpath("publication-receipt-v1.json")
            .read_text()
        )
        for case in fixture["cases"]:
            receipt = case["receipt"]
            source = base64.b64decode(case["source_base64"])
            output = publisher.serialise(
                publisher.transform(
                    json.loads(source), datetime.fromisoformat(receipt["published_at"])
                )
            )
            self.assertEqual(output, base64.b64decode(receipt["forecast_base64"]))
            self.assertEqual(
                hashlib.sha256(source).hexdigest(), receipt["source_sha256"]
            )
            self.assertEqual(
                hashlib.sha256(output).hexdigest(), receipt["forecast_sha256"]
            )
            self.assertEqual(receipt["publisher_version"], publisher.PUBLISHER_VERSION)
            self.assertEqual(
                receipt["public_schema_version"], publisher.CONTRACT_VERSION
            )
            commit = base64.b64decode(case["commit_base64"])
            tree = base64.b64decode(case["tree_base64"])
            expected_time = int(
                datetime.fromisoformat(receipt["published_at"]).timestamp()
            )
            identities = [
                (line.split(b" ", 1)[0], int(line.rsplit(b" ", 2)[1]))
                for line in commit.splitlines()
                if line.startswith((b"author ", b"committer "))
            ]
            self.assertEqual(
                identities, [(b"author", expected_time), (b"committer", expected_time)]
            )

            def git_hash(kind, body):
                return hashlib.sha1(
                    f"{kind} {len(body)}\0".encode() + body, usedforsecurity=False
                ).hexdigest()

            self.assertEqual(git_hash("commit", commit), receipt["commit"])
            self.assertEqual(
                commit.splitlines()[0], f"tree {git_hash('tree', tree)}".encode()
            )
            self.assertEqual(
                tree,
                b"100644 forecast.json\0" + bytes.fromhex(git_hash("blob", output)),
            )
        self.assertEqual(
            len({c["receipt"]["commit"] for c in fixture["cases"]}),
            len(fixture["cases"]),
        )


if __name__ == "__main__":
    unittest.main()
