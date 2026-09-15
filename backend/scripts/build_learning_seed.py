"""Convert the curated Learning Hub spreadsheet into ``chart/learning/seed.json``.

Run once by hand when the reference sheet changes; the backend never reads
xlsx at runtime. Usage::

    python backend/scripts/build_learning_seed.py "~/Downloads/Learning Hub references.xlsx"

The sheet is a hand-compiled reference list assembled from three passes, so it
carries real defects that this script is responsible for repairing: drifting
track names, ``;``-joined multi-value cells, four different YouTube URL shapes,
a column that mixes Excel date serials with bare years, free-text durations,
and three rows about unrelated products that merely share the CHART name.
"""

from __future__ import annotations

import json
import re
import sys
import zipfile
from collections import OrderedDict
from datetime import date, timedelta
from pathlib import Path
from xml.etree import ElementTree as ET

M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

REPO_ROOT = Path(__file__).resolve().parents[2]
OUTPUT = REPO_ROOT / "backend" / "chart" / "learning" / "seed.json"
# The web app keeps a small slice checked in so the hub renders before the
# API answers. Emitted here so the copy cannot drift from the seed.
FALLBACK_OUTPUT = (
    REPO_ROOT / "web" / "src" / "features" / "learning" / "data" / "fallback.ts"
)
FALLBACK_COUNT = 9
# Storybook-only: every published row, so the mosaic can be judged at the
# scale it will actually run at. Never imported by the app itself.
FIXTURE_OUTPUT = (
    REPO_ROOT
    / "web"
    / "src"
    / "features"
    / "learning"
    / "data"
    / "catalogue.fixture.ts"
)

# The eight pathway stops, in the order a newcomer should meet them: establish
# the link, widen it, then move from evidence to money to action.
TRACKS = [
    (
        "why-climate-and-health",
        "Why climate and health are connected",
        "The science linking climate hazards to health outcomes — in six minutes, "
        "or over a full certificate course.",
    ),
    (
        "one-health",
        "How climate change impacts One Health",
        "Why the health, veterinary and environment departments are looking at "
        "the same problem.",
    ),
    (
        "heat-and-pregnancy",
        "Extreme heat and climate stress on pregnancy",
        "What heat does to pregnant women, newborns and the midwives caring for "
        "them.",
    ),
    (
        "flooding-and-drought",
        "Flooding and drought",
        "Early warning, evacuation and the health services that follow the water.",
    ),
    (
        "no-single-department",
        "Why no single department can solve this alone",
        "The case for a coordinated, multi-sectoral response.",
    ),
    (
        "funding-case",
        "Building the funding case for anticipatory response",
        "Early action protocols that release funding before the flood, not after "
        "it.",
    ),
    (
        "risk-map-to-action",
        "From risk map to recommended action",
        "How a heat forecast becomes school closures, water points and cool " "roofs.",
    ),
    (
        "what-chart-does",
        "What CHART does for your planning and funding",
        "From risk data to a fundable action plan.",
    ),
]

# Every spelling seen across the three sheets, folded to a canonical slug.
TRACK_ALIASES = {
    "why climate and health are connected": "why-climate-and-health",
    "why climate and health connected": "why-climate-and-health",
    "how climate change impacts one health": "one-health",
    "one health": "one-health",
    "extreme heat and climate stress on pregnancy": "heat-and-pregnancy",
    "heat and mnch": "heat-and-pregnancy",
    "flooding and drought": "flooding-and-drought",
    "why no single department can solve this alone": "no-single-department",
    "why no single dept alone": "no-single-department",
    "multisectoral coordination": "no-single-department",
    "partnerships": "no-single-department",
    "building the funding case": "funding-case",
    "building the funding case for anticipatory response": "funding-case",
    "from risk map to recommended action": "risk-map-to-action",
    "risk map to action": "risk-map-to-action",
    "what chart does for planning and funding": "what-chart-does",
    "what chart does for your planning": "what-chart-does",
}

# Rows whose URL host belongs to a different product also called CHART. The
# Gemini sheet files all three under "What CHART Does for Planning and
# Funding", where they would actively mislead a planner.
NAMESAKE_HOSTS = {
    "earthlab.uw.edu",
    "change.deohs.washington.edu",
    "climate.sph.emory.edu",
}

# Rows like "Youtube link for above course recordings" annotate the row above
# rather than standing alone, and render as an empty card if kept.
CONTINUATION_TITLE = re.compile(r"^(youtube |video )?link (for|to) (the )?above", re.I)

# Health outcomes, matched against title, objectives, audience and tags at
# ingest so the vocabulary is reviewable data rather than hidden logic.
# Roughly half the catalogue carries no outcome: a great deal of it is
# general climate-health, governance or funding material that is not about
# one outcome, and forcing those into a bucket would be a lie.
HEALTH_OUTCOMES = {
    "Maternal & newborn health": r"maternal|neonat|pregnan|birth weight|\blbw\b|mnch|midwif|infant|stillbirth|paediatric|pediatric|child health",
    "Heat-related illness": r"heat stroke|heat-related|heat illness|hyperthermi|heat stress|heat action|heat wave|heatwave|heat season|cooling|heat mortalit|extreme heat",
    "Infectious & zoonotic disease": r"zoonos|zoonot|one health|vector-borne|vector borne|malaria|dengue|infectious|outbreak|epidemic|cholera",
    "Water & sanitation-related disease": r"diarrh|sanitation|\bwash\b|water-borne|waterborne|water and sanitation|safe water",
    "Nutrition & food security": r"nutrition|food security|food insecurit|malnutri|famine|stunting",
    "Respiratory & air quality": r"air quality|air pollution|respirator|asthma|particulate|pm2\.5",
    "Mental health": r"mental health|psychosocial|eco-anxiety",
    "Health system capacity": r"health system|facility preparedness|health workforce|surge capacit|health-care facilit|resilient health",
}

COURSE_HINTS = ("coursera.org", "unccelearn.org", "/course", "courses-tra")
ARTICLE_HOSTS = (
    "nature.com",
    "link.springer.com",
    "sciencedirect.com",
    "frontiersin.org",
    "jamanetwork.com",
    "thelancet.com",
    "theindiaforum.in",
    "heatshed.substack.com",
)

SHEETS = [
    ("top-vids", "xl/worksheets/sheet1.xml", 100),
    ("gemini", "xl/worksheets/sheet3.xml", 50),
    ("claude", "xl/worksheets/sheet2.xml", 25),
]

# Column letter -> field, per sheet family.
WIDE = {
    "A": "url",
    "B": "title",
    "C": "provider",
    "D": "track",
    "E": "location",
    "F": "language",
    "G": "duration",
    "I": "date",
    "J": "format",
    "K": "audience",
    "L": "objectives",
    "M": "access",
}
NARROW = {
    "A": "url",
    "B": "title",
    "C": "location",
    "D": "language",
    "E": "provider",
    "F": "track",
    "G": "format",
    "H": "date",
    "I": "duration",
}

HEADER_VALUES = {
    "video title",
    "title",
    "sponsoring body",
    "curricular module",
    "link",
    "topic",
    "source",
}


def column(ref: str) -> str:
    out = ""
    for ch in ref:
        if ch.isalpha():
            out += ch
        else:
            break
    return out


def read_rows(archive: zipfile.ZipFile, path: str, strings: list[str]):
    sheet = ET.fromstring(archive.read(path))
    for row in sheet.iter(M + "row"):
        cells: dict[str, str] = {}
        for cell in row.iter(M + "c"):
            value_node = cell.find(M + "v")
            kind = cell.get("t")
            if kind == "inlineStr":
                inline = cell.find(M + "is")
                value = (
                    "".join(t.text or "" for t in inline.iter(M + "t"))
                    if inline is not None
                    else ""
                )
            elif value_node is None:
                value = ""
            elif kind == "s":
                value = strings[int(value_node.text)]
            else:
                value = value_node.text or ""
            value = value.strip()
            if value:
                cells[column(cell.get("r"))] = value
        if cells:
            yield cells


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")[:120]


def youtube_id(url: str) -> str | None:
    match = re.search(r"(?:v=|youtu\.be/|/embed/|/shorts/)([A-Za-z0-9_-]{11})", url)
    return match.group(1) if match else None


def host_of(url: str) -> str:
    return re.sub(r"^https?://(www\.)?", "", url).split("/")[0].lower()


def canonical_url(url: str) -> str:
    url = url.strip().rstrip("&?")
    vid = youtube_id(url)
    if vid and "playlist" not in url:
        return f"https://www.youtube.com/watch?v={vid}"
    return url


def parse_duration(raw: str) -> tuple[int | None, str | None]:
    """Return (seconds, display label). Free text keeps its own label."""
    if not raw:
        return None, None
    text = raw.strip()
    if text.lower().startswith("unknown"):
        return None, None
    if "under 1 min" in text.lower():
        return 60, "Under 1 min"
    match = re.search(r"(\d+(?:\.\d+)?)\s*min", text, re.I)
    if not match:
        return None, text
    minutes = float(match.group(1))
    label = f"{minutes:g} min+" if "+" in text else f"{minutes:g} min"
    return int(minutes * 60), label


def parse_published(raw: str) -> str | None:
    """The column mixes Excel serials with bare years; branch on magnitude."""
    if not raw:
        return None
    try:
        number = float(raw)
    except ValueError:
        return None
    if 1900 <= number <= 2100:
        return f"{int(number)}-01-01"
    if number > 20000:
        return (date(1899, 12, 30) + timedelta(days=int(number))).isoformat()
    return None


def parse_languages(raw: str) -> list[str]:
    if not raw:
        return []
    text = re.sub(r"\([^)]*\)", " ", raw)
    parts = re.split(r"[&/,]| and ", text)
    seen: list[str] = []
    for part in parts:
        name = part.strip().title()
        if name and name not in seen:
            seen.append(name)
    return seen


COUNTRY_WORDS = (
    "Kenya",
    "India",
    "Nigeria",
    "Italy",
    "USA",
    "Ethiopia",
    "Bangladesh",
    "Pakistan",
    "Brazil",
    "Ghana",
    "Tanzania",
)


def parse_countries(location: str, section: str) -> list[str]:
    found = [word for word in COUNTRY_WORDS if word.lower() in location.lower()]
    if not found and section in {"Kenya", "India"}:
        found = [section]
    return found


def derive_health_outcomes(
    title: str, objectives: str, audience: str, tags: list[str]
) -> list[str]:
    """Match the free text against the outcome vocabulary. May return none."""

    haystack = " ".join([title, objectives, audience, " ".join(tags)]).lower()
    return [
        name
        for name, pattern in HEALTH_OUTCOMES.items()
        if re.search(pattern, haystack)
    ]


def classify_kind(url: str, vid: str | None, fmt: str) -> str:
    lowered = url.lower()
    if vid:
        return "video"
    if lowered.endswith(".pdf"):
        return "report"
    if any(hint in lowered for hint in COURSE_HINTS):
        return "course"
    if any(host in lowered for host in ARTICLE_HOSTS):
        return "article"
    if "video" in fmt.lower():
        return "video"
    return "toolkit"


def classify_embed(access: str, vid: str | None) -> str:
    lowered = access.lower()
    if "unverified" in lowered:
        return "open_unverified"
    if "embeddable" in lowered:
        return "embeddable"
    if not access and vid:
        return "open_unverified"
    return "open_unverified" if access else "restricted"


def split_tracks(raw: str) -> tuple[list[str], list[str]]:
    """Return (track slugs, leftover tag labels)."""
    tracks: list[str] = []
    tags: list[str] = []
    for piece in re.split(r"[;\n]", raw or ""):
        label = piece.strip()
        if not label or label.lower() in HEADER_VALUES:
            continue
        if label.lower() == "all modules":
            continue
        slug = TRACK_ALIASES.get(label.lower())
        if slug:
            if slug not in tracks:
                tracks.append(slug)
        elif label not in tags:
            tags.append(label)
    return tracks, tags


def _write_web_fallback(payload: dict) -> None:
    """Emit the checked-in slice the Learning hub shows before the API answers."""

    items = [
        item for item in payload["items"] if item["isPublished"] and item["isFeatured"]
    ][:FALLBACK_COUNT]

    def field(name: str, value) -> str:
        return f"    {name}: {json.dumps(value, ensure_ascii=False)},"

    def resource(item: dict) -> str:
        keys = [
            ("slug", "slug"),
            ("url", "url"),
            ("canonical_url", "canonicalUrl"),
            ("youtube_id", "youtubeId"),
            ("kind", "kind"),
            ("title", "title"),
            ("provider", "provider"),
            ("objectives", "objectives"),
            ("audience_summary", "audienceSummary"),
            ("location_label", "locationLabel"),
            ("countries", "countries"),
            ("languages", "languages"),
            ("duration_seconds", "durationSeconds"),
            ("duration_label", "durationLabel"),
            ("format_label", "formatLabel"),
            ("published_on", "publishedOn"),
            ("access_label", "accessLabel"),
            ("embed_status", "embedStatus"),
            ("tracks", "tracks"),
            ("tags", "tags"),
            ("health_outcomes", "healthOutcomes"),
            ("is_featured", "isFeatured"),
        ]
        body = "\n".join(field(ts, item[src]) for ts, src in keys)
        return "  {\n" + body + "\n  },"

    def track(entry: dict) -> str:
        body = "\n".join(
            [
                field("slug", entry["slug"]),
                field("title", entry["title"]),
                field("summary", entry["summary"]),
                field("position", entry["position"]),
                field("resource_count", 0),
                field("completed_count", 0),
            ]
        )
        return "  {\n" + body + "\n  },"

    lines = [
        "/**",
        " * A slice of the seeded catalogue, checked in so the Learning hub renders",
        " * something real before the backend answers — the same fallback approach",
        " * `RecommendedActionsPanel` takes.",
        " *",
        " * Generated by backend/scripts/build_learning_seed.py. Do not edit by hand.",
        " */",
        "",
        'import type { LearningResource, LearningTrack } from "@/lib/learningClient";',
        "",
        "export const FALLBACK_TRACKS: readonly LearningTrack[] = [",
        *[track(entry) for entry in payload["tracks"]],
        "];",
        "",
        "export const FALLBACK_RESOURCES: readonly LearningResource[] = [",
        *[resource(item) for item in items],
        "];",
        "",
    ]
    FALLBACK_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    FALLBACK_OUTPUT.write_text("\n".join(lines))
    print(f"wrote {FALLBACK_OUTPUT.relative_to(REPO_ROOT)} ({len(items)} resources)")


def _write_web_fixture(payload: dict) -> None:
    """Emit the full published catalogue for Storybook review."""

    items = [item for item in payload["items"] if item["isPublished"]]
    lines = [
        "/**",
        " * Every published resource, for Storybook only — reviewing the mosaic",
        " * against eight cards tells you nothing about how it behaves at ninety.",
        " *",
        " * Generated by backend/scripts/build_learning_seed.py. Do not edit by hand.",
        " */",
        "",
        'import type { LearningResource } from "@/lib/learningClient";',
        "",
        "export const CATALOGUE_FIXTURE: readonly LearningResource[] = [",
    ]
    keys = [
        ("slug", "slug"),
        ("url", "url"),
        ("canonical_url", "canonicalUrl"),
        ("youtube_id", "youtubeId"),
        ("kind", "kind"),
        ("title", "title"),
        ("provider", "provider"),
        ("objectives", "objectives"),
        ("audience_summary", "audienceSummary"),
        ("location_label", "locationLabel"),
        ("countries", "countries"),
        ("languages", "languages"),
        ("duration_seconds", "durationSeconds"),
        ("duration_label", "durationLabel"),
        ("format_label", "formatLabel"),
        ("published_on", "publishedOn"),
        ("access_label", "accessLabel"),
        ("embed_status", "embedStatus"),
        ("tracks", "tracks"),
        ("tags", "tags"),
        ("health_outcomes", "healthOutcomes"),
        ("is_featured", "isFeatured"),
    ]
    for item in items:
        lines.append("  {")
        for ts_key, src in keys:
            lines.append(f"    {ts_key}: {json.dumps(item[src], ensure_ascii=False)},")
        lines.append("  },")
    lines += ["];", ""]

    FIXTURE_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE_OUTPUT.write_text("\n".join(lines))
    print(f"wrote {FIXTURE_OUTPUT.relative_to(REPO_ROOT)} ({len(items)} resources)")


def main() -> int:
    source = Path(
        sys.argv[1] if len(sys.argv) > 1 else "~/Downloads/Learning Hub references.xlsx"
    ).expanduser()
    archive = zipfile.ZipFile(source)
    shared = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    strings = [
        "".join(t.text or "" for t in si.iter(M + "t")) for si in shared.iter(M + "si")
    ]

    merged: "OrderedDict[str, dict]" = OrderedDict()
    namesakes = 0

    for sheet_name, sheet_path, weight in SHEETS:
        mapping = NARROW if sheet_name == "claude" else WIDE
        section = "General"
        for cells in read_rows(archive, sheet_path, strings):
            if len(cells) == 1 and "A" in cells:
                section = cells["A"]
                continue
            row = {field: cells.get(letter, "") for letter, field in mapping.items()}
            url = row["url"]
            if not url.startswith("http"):
                continue
            if (
                row["title"].lower() in HEADER_VALUES
                or row["provider"].lower() in HEADER_VALUES
            ):
                continue
            # A pointer back to the row above it, not a resource of its own.
            if CONTINUATION_TITLE.match(row["title"]):
                continue

            vid = youtube_id(url)
            key = vid or canonical_url(url).lower()
            tracks, tags = split_tracks(row["track"])
            countries = parse_countries(row["location"], section)
            seconds, duration_label = parse_duration(row["duration"])
            is_namesake = host_of(url) in NAMESAKE_HOSTS

            if is_namesake:
                tracks = [t for t in tracks if t != "what-chart-does"]
                if "External tool sharing the CHART name" not in tags:
                    tags.append("External tool sharing the CHART name")

            existing = merged.get(key)
            if existing is None:
                if is_namesake:
                    namesakes += 1
                merged[key] = {
                    "slug": slugify(row["title"]) or slugify(key),
                    "url": url,
                    "canonicalUrl": canonical_url(url),
                    "youtubeId": vid,
                    "kind": classify_kind(url, vid, row["format"]),
                    "title": row["title"],
                    "provider": row["provider"],
                    "objectives": row.get("objectives", ""),
                    "audienceSummary": row.get("audience", ""),
                    "locationLabel": row["location"],
                    "countries": countries,
                    "languages": parse_languages(row["language"]),
                    "durationSeconds": seconds,
                    "durationLabel": duration_label,
                    "formatLabel": row["format"],
                    "publishedOn": parse_published(row["date"]),
                    "accessLabel": row.get("access", ""),
                    "embedStatus": classify_embed(row.get("access", ""), vid),
                    "tracks": tracks,
                    "tags": tags,
                    "healthOutcomes": derive_health_outcomes(
                        row["title"],
                        row.get("objectives", ""),
                        row.get("audience", ""),
                        tags,
                    ),
                    "isPublished": not is_namesake,
                    # Row came from the curated "Top Vids" sheet.
                    "isFeatured": weight >= 100 and not is_namesake,
                    "sortWeight": weight,
                }
                continue

            # Later sheets only fill gaps; the curated shortlist wins on scalars.
            for field, value in (
                ("provider", row["provider"]),
                ("objectives", row.get("objectives", "")),
                ("audienceSummary", row.get("audience", "")),
                ("locationLabel", row["location"]),
                ("formatLabel", row["format"]),
                ("accessLabel", row.get("access", "")),
            ):
                if not existing[field] and value:
                    existing[field] = value
            if existing["durationSeconds"] is None and seconds is not None:
                existing["durationSeconds"] = seconds
                existing["durationLabel"] = duration_label
            if not existing["publishedOn"]:
                existing["publishedOn"] = parse_published(row["date"])
            for field, values in (
                ("tracks", tracks),
                ("tags", tags),
                ("countries", countries),
                ("languages", parse_languages(row["language"])),
            ):
                for value in values:
                    if value not in existing[field]:
                        existing[field].append(value)
            existing["healthOutcomes"] = derive_health_outcomes(
                existing["title"],
                existing["objectives"],
                existing["audienceSummary"],
                existing["tags"],
            )
            if existing["accessLabel"]:
                existing["embedStatus"] = classify_embed(
                    existing["accessLabel"], existing["youtubeId"]
                )

    # Slugs must be unique; collisions get a numeric suffix.
    seen_slugs: dict[str, int] = {}
    for item in merged.values():
        base = item["slug"]
        if base in seen_slugs:
            seen_slugs[base] += 1
            item["slug"] = f"{base}-{seen_slugs[base]}"
        else:
            seen_slugs[base] = 1

    payload = {
        "version": 1,
        "tracks": [
            {"slug": slug, "title": title, "summary": summary, "position": index}
            for index, (slug, title, summary) in enumerate(TRACKS, start=1)
        ],
        "items": list(merged.values()),
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    _write_web_fallback(payload)
    _write_web_fixture(payload)

    items = payload["items"]
    kinds: dict[str, int] = {}
    for item in items:
        kinds[item["kind"]] = kinds.get(item["kind"], 0) + 1
    print(f"wrote {OUTPUT.relative_to(REPO_ROOT)}")
    print(f"  items            {len(items)}")
    print(f"  by kind          {kinds}")
    print(
        f"  embeddable       {sum(1 for i in items if i['embedStatus'] == 'embeddable')}"
    )
    print(f"  with a track     {sum(1 for i in items if i['tracks'])}")
    print(f"  with a duration  {sum(1 for i in items if i['durationSeconds'])}")
    print(
        f"  unpublished      {sum(1 for i in items if not i['isPublished'])} (CHART namesakes: {namesakes})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
