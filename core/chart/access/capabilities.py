"""The capabilities code enforces, and the defaults a workspace starts with.

Modules and levels are fixed here because code checks them. Roles and
departments are rows: these defaults are only what a new workspace is
seeded with (``chart.access.workspaces``).
"""

from __future__ import annotations

MODULES = (
    "risk",
    "data",
    "vra",
    "actions",
    "plans",
    "seasons",
    "people",
    "departments",
    "workspace",
)
LEVELS = ("read", "write", "manage")
RANK = {level: index for index, level in enumerate(LEVELS)}

# Writes in these modules reach only resources owned by one of the member's
# departments, unless they manage the module; reads are never narrowed.
DEPARTMENT_SCOPED = frozenset({"actions", "data", "vra"})

_READ_ALL = {module: "read" for module in MODULES if module != "workspace"}

# key: (name, {module: level}), highest first.
DEFAULT_ROLES: dict[str, tuple[str, dict[str, str]]] = {
    "workspace_admin": (
        "Workspace admin",
        {module: "manage" for module in MODULES},
    ),
    "planning_lead": (
        "Planning lead",
        {
            **_READ_ALL,
            "risk": "write",
            "actions": "manage",
            "plans": "write",
            "people": "write",
            "departments": "write",
        },
    ),
    "implementation_officer": (
        "Implementation officer",
        {**_READ_ALL, "actions": "write", "plans": "write"},
    ),
    "data_officer": (
        "Data officer",
        {**_READ_ALL, "data": "write", "vra": "write"},
    ),
    "viewer": ("Viewer", dict(_READ_ALL)),
}

DEFAULT_DEPARTMENTS = (
    "Health",
    "Climate change",
    "Environment",
    "Water",
    "Disaster management",
    "Urban development",
    "Labour",
)


def higher(a: str | None, b: str | None) -> str | None:
    if a is None:
        return b
    if b is None:
        return a
    return a if RANK[a] >= RANK[b] else b
