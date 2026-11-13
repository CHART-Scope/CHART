from __future__ import annotations

import argparse

from chart.access.principal import forget
from chart.identity.service import IdentityError, recover_admin
from chart.shared.db.models import AppUser
from chart.shared.db.session import get_session_factory


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Recover a CHART platform admin: re-enable their Keycloak account and "
            "restore the platform-admin flag in CHART's database. They then sign "
            "in with a code sent to the email address."
        ),
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
    if args.confirm != username:
        parser.error("--confirm must exactly match --username")

    try:
        recovered = recover_admin(username=username, email=email)
    except IdentityError as error:
        parser.error(error.code)

    _restore_platform_admin(recovered.user_id, recovered.username, email)
    print(f"Recovered CHART administrator '{recovered.username}'.")


def _restore_platform_admin(user_id: str, username: str, email: str) -> None:
    with get_session_factory()() as session:
        user = session.get(AppUser, user_id)
        if user is None:
            user = AppUser(id=user_id, username=username, display_name=username)
            session.add(user)
        user.email = email
        user.status = "active"
        user.is_platform_admin = True
        session.commit()
    forget(user_id)


if __name__ == "__main__":
    main()
