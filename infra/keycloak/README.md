# Keycloak

Keycloak is the identity system. CHART is the policy system (geography, workspace, roles).

## Local start

```bash
make identity
make identity-sync
```

`make identity-sync` re-applies seed groups and users to an existing realm. Run it after changing `chart-realm.json` or after a volume reset.

Use `make identity-restart` after changing local theme files.

Admin console: `http://localhost:8080` — `admin` / `admin` — realm `chart`

## Seed users

| Username             | Password   |
| -------------------- | ---------- |
| `chart-admin`        | `password` |
| `u1-health-region`   | `password` |
| `u2-sector-region`   | `password` |
| `u3-health-district` | `password` |
| `u4-sector-district` | `password` |

## Roles

Client roles on `chart-api`:

- `chart_admin`
- `content_editor`
- `health_planning_lead`
- `cross_sector_planning_lead`
- `health_implementation_officer`
- `cross_sector_implementation_officer`
- `public_viewer`

## Geography groups

Geography scope is represented by Keycloak groups. The local realm uses fixture groups; real deployments should load their own.

```
/country-a/region-a
/country-a/region-a/district-a
/country-b/region-b
/country-b/region-b/district-c
```
