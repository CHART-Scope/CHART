# Data Ingestion

This module lists and checks external data sources used by CHART.

## DHIS2

DHIS2 is treated as a health data source, not as CHART's identity or geography
authority.

Use environment variables for credentials:

```bash
DHIS2_BASE_URL=https://dhis2.example.org
DHIS2_API_VERSION=41
DHIS2_AUTH_MODE=pat
DHIS2_API_TOKEN=d2pat_...
```

Preferred auth mode is `pat` with a dedicated read-only DHIS2 service user.
Supported modes are:

- `pat`: sends `Authorization: ApiToken <token>`.
- `basic`: sends `Authorization: Basic <base64(username:password)>`.
- `oauth2`: sends `Authorization: Bearer <token>`.

The API only returns masked configuration:

```txt
GET /sources/dhis2/config
POST /sources/dhis2/test-connection
```

Map DHIS2 organisation units into CHART geographies with
`external_geography_mappings`. Do not make DHIS2 organisation units replace CHART's
generic geography hierarchy.
