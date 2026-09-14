from __future__ import annotations

import subprocess
import sys


def test_db_metadata_import_does_not_load_pandas() -> None:
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            (
                "import sys; import chart.shared.db; "
                "assert 'pandas' not in sys.modules"
            ),
        ],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
