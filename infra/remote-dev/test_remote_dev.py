"""Offline checks for development isolation and SSH forwarding behavior."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


HERE = Path(__file__).resolve().parent


class ComposeIsolationTests(unittest.TestCase):
    def test_only_private_development_resources_are_declared(self):
        result = subprocess.run(
            [
                "docker",
                "compose",
                "-f",
                str(HERE / "docker-compose.yml"),
                "-p",
                "chart-dev",
                "config",
                "--format",
                "json",
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        config = json.loads(result.stdout)
        self.assertEqual(config["name"], "chart-dev")
        self.assertEqual(
            config["services"]["postgres"]["command"],
            ["postgres", "-c", "cluster_name=chart-dev"],
        )
        self.assertEqual(set(config["services"]), {"postgres", "keycloak", "mailpit"})
        for service in config["services"].values():
            self.assertNotIn("container_name", service)
            self.assertNotIn("network_mode", service)
            self.assertEqual(service["networks"], {"default": None})
            for port in service["ports"]:
                self.assertEqual(port["host_ip"], "127.0.0.1")
                self.assertIn(
                    str(port["published"]), {"15434", "18080", "11025", "18025"}
                )
        self.assertEqual(
            config["volumes"]["postgres-data"]["name"], "chart-dev_postgres-data"
        )
        self.assertEqual(config["networks"]["default"]["name"], "chart-dev_default")


class TunnelTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        root = Path(self.directory.name)
        script_dir = root / "infra" / "remote-dev"
        script_dir.mkdir(parents=True)
        self.script = script_dir / "tunnel.sh"
        shutil.copyfile(HERE / "tunnel.sh", self.script)
        bin_dir = root / "bin"
        bin_dir.mkdir()
        self.calls = root / "calls"
        fake_ssh = bin_dir / "ssh"
        fake_ssh.write_text(
            "#!/usr/bin/env bash\n"
            'printf "%s\\n" "$*" >> "$SSH_CALLS"\n'
            'if [[ " $* " == *" -O check "* ]]; then exit "${CHECK_EXIT:-1}"; fi\n'
            'exit "${CONNECT_EXIT:-0}"\n'
        )
        fake_ssh.chmod(0o755)
        self.environment = {
            **os.environ,
            "PATH": f"{bin_dir}:{os.environ['PATH']}",
            "SSH_CALLS": str(self.calls),
            "CHART_SSH_HOST": "chart",
            "CHECK_EXIT": "1",
            "CONNECT_EXIT": "0",
        }

    def run_tunnel(self, action="connect"):
        return subprocess.run(
            ["bash", str(self.script), action],
            env=self.environment,
            capture_output=True,
            text=True,
        )

    def test_connection_binds_every_forward_to_loopback(self):
        self.assertEqual(self.run_tunnel().returncode, 0)
        calls = self.calls.read_text()
        for mapping in [
            "5434:127.0.0.1:15434",
            "8080:127.0.0.1:18080",
            "1025:127.0.0.1:11025",
            "8025:127.0.0.1:18025",
        ]:
            self.assertIn(f"-L 127.0.0.1:{mapping}", calls)
        self.assertIn("ExitOnForwardFailure=yes", calls)
        self.assertIn("ServerAliveInterval=30", calls)
        self.assertNotIn("StrictHostKeyChecking=no", calls)

    def test_existing_tunnel_is_reused(self):
        self.environment["CHECK_EXIT"] = "0"
        self.assertEqual(self.run_tunnel().returncode, 0)
        self.assertEqual(len(self.calls.read_text().splitlines()), 1)

    def test_failed_forward_is_not_reported_as_connected(self):
        self.environment["CONNECT_EXIT"] = "255"
        result = self.run_tunnel()
        self.assertEqual(result.returncode, 255)
        self.assertNotIn("Connected to", result.stdout)

    def test_host_cannot_inject_ssh_options(self):
        self.environment["CHART_SSH_HOST"] = "-oProxyCommand=bad"
        self.assertEqual(self.run_tunnel().returncode, 2)
        self.assertFalse(self.calls.exists())

    def test_disconnect_targets_only_our_control_socket(self):
        self.environment["CHECK_EXIT"] = "0"
        self.assertEqual(self.run_tunnel("disconnect").returncode, 0)
        self.assertIn("-O exit chart", self.calls.read_text())


if __name__ == "__main__":
    unittest.main()
