from __future__ import annotations

import argparse
import os

from chart.identity.service import IdentityError, recover_admin


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Recover an existing CHART administrator in Keycloak.",
    )
    parser.add_argument("--username", required=True)
    parser.add_argument("--email", required=True)
    parser.add_argument(
        "--confirm",
        required=True,
        help="Repeat the username to confirm this privileged operation.",
    )
    args = parser.parse_args()

    username = args.username.strip()
    email = args.email.strip().lower()
    password = os.getenv("CHART_ADMIN_RECOVERY_PASSWORD", "")
    if args.confirm != username:
        parser.error("--confirm must exactly match --username")
    if not password:
        parser.error("CHART_ADMIN_RECOVERY_PASSWORD is required")

    try:
        recovered = recover_admin(
            username=username,
            email=email,
            password=password,
        )
    except IdentityError as error:
        parser.error(error.code)

    print(f"Recovered CHART administrator '{recovered.username}'.")


if __name__ == "__main__":
    main()
