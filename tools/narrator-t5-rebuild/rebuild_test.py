from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


class RebuildObserverFixtureTest(unittest.TestCase):
    def test_hashes_tiny_pair_and_rejects_extra_runtime_file(self) -> None:
        with tempfile.TemporaryDirectory(prefix="grind2-t5-rebuild-test-") as temporary:
            root = Path(temporary)
            source = root / "source"
            source.mkdir()
            source_bytes = b"source fixture\n"
            (source / "source.bin").write_bytes(source_bytes)
            runtime_files = [
                {"path": "config.json", "role": "configuration"},
                {"path": "generation_config.json", "role": "configuration"},
                {"path": "onnx/decoder_model_merged_quantized.onnx", "role": "weights"},
                {"path": "onnx/encoder_model_quantized.onnx", "role": "weights"},
                {"path": "tokenizer.json", "role": "tokenizer"},
                {"path": "tokenizer_config.json", "role": "tokenizer"},
            ]
            builds = []
            for ordinal in (1, 2):
                build = root / f"build-{ordinal}"
                builds.append(build)
                (build / "raw").mkdir(parents=True)
                (build / "staged" / "onnx").mkdir(parents=True)
                (build / "logs").mkdir()
                for name in (
                    "config.json", "decoder_model.onnx", "decoder_model_merged.onnx", "decoder_with_past_model.onnx",
                    "encoder_model.onnx", "generation_config.json", "special_tokens_map.json", "spiece.model",
                    "tokenizer.json", "tokenizer_config.json",
                ):
                    (build / "raw" / name).write_text(f"{name}\n")
                for item in runtime_files:
                    path = build / "staged" / item["path"]
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_text(f"{item['path']}\n")
                (build / "logs" / f"build-{ordinal}.stdout.log").write_text("stdout fixture\n")
                (build / "logs" / f"build-{ordinal}.stderr.log").write_text("stderr fixture\n")
                (build / "build-process.json").write_text(json.dumps({
                    "schemaVersion": 1,
                    "runId": f"fixture:{ordinal}",
                    "ordinal": ordinal,
                    "pythonProcessId": ordinal,
                    "pythonHashSeed": "0",
                }) + "\n")
            lock = {
                "schemaVersion": 2,
                "source": {
                    "repository": "example/fixture",
                    "revision": "1" * 40,
                    "spdxLicense": "MIT",
                    "licenseEvidencePath": "source.bin",
                    "files": [{
                        "path": "source.bin",
                        "byteLength": len(source_bytes),
                        "sha256": hashlib.sha256(source_bytes).hexdigest(),
                    }],
                },
                "platform": {"pythonHashSeed": "0"},
                "harness": {
                    "harnessPath": "tools/narrator-t5-rebuild/rebuild.py",
                    "harnessSha256": hashlib.sha256(Path("tools/narrator-t5-rebuild/rebuild.py").read_bytes()).hexdigest(),
                },
                "toolchainRepositories": {},
                "distributions": {},
                "wheelhouse": {
                    "indexes": [],
                    "files": [{"path": f"wheel-{index}.whl", "byteLength": 1, "sha256": "1" * 64} for index in range(34)],
                    "totalBytes": 34,
                },
                "recipe": {},
                "sessions": [],
                "runtimeFiles": runtime_files,
            }
            lock_path = root / "lock.json"
            receipt_path = root / "receipt.json"
            lock_path.write_text(json.dumps(lock) + "\n")
            command = [
                sys.executable,
                "tools/narrator-t5-rebuild/rebuild.py",
                "observe-pair",
                "--fixture",
                "--lock", str(lock_path),
                "--source", str(source),
                "--build-a", str(builds[0]),
                "--build-b", str(builds[1]),
                "--receipt", str(receipt_path),
                "--run-a", "fixture:1",
                "--run-b", "fixture:2",
            ]
            subprocess.run(command, check=True, capture_output=True, text=True)
            receipt = json.loads(receipt_path.read_text())
            self.assertEqual(receipt["disposition"], "deterministic-test-fixture")
            self.assertEqual(receipt["schemaVersion"], 2)
            self.assertEqual(receipt["processIsolation"], "fresh-python-process-per-build")
            self.assertEqual(receipt["reproducibility"], "byte-identical-isolated-processes")
            self.assertFalse(receipt["modelAdmitted"])
            self.assertFalse(receipt["displayAuthorized"])
            (builds[1] / "staged" / "unexpected.bin").write_text("nope\n")
            refused = subprocess.run(command, check=False, capture_output=True, text=True)
            self.assertNotEqual(refused.returncode, 0)
            self.assertIn("runtime closure differs", refused.stderr)
            (builds[1] / "staged" / "unexpected.bin").unlink()
            (builds[1] / "raw" / "encoder_model.onnx").write_text("different intermediate\n")
            refused = subprocess.run(command, check=False, capture_output=True, text=True)
            self.assertNotEqual(refused.returncode, 0)
            self.assertIn("non-identical intermediate artifacts", refused.stderr)

            (builds[1] / "raw" / "encoder_model.onnx").write_text("encoder_model.onnx\n")
            process_path = builds[1] / "build-process.json"
            process_evidence = json.loads(process_path.read_text())
            process_path.write_text(json.dumps({**process_evidence, "pythonHashSeed": "random"}) + "\n")
            refused = subprocess.run(command, check=False, capture_output=True, text=True)
            self.assertNotEqual(refused.returncode, 0)
            self.assertIn("process evidence differs", refused.stderr)


if __name__ == "__main__":
    unittest.main()
