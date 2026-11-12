"""Build MP division-level VRA indicator values from downloaded public sources.

Reproduces:
  mp_districts_source.csv  district-level values actually used
  mp_divisions_vra.csv     division values in the CHART VRA upload template format
  spotchecks.csv           automated cross-checks (official per-district PDFs, independent CSV mirror,
                           internal Census consistency)
  district_name_map.csv    every source district spelling -> crosswalk district -> division

Run:  .venv/bin/python build.py      (needs pdftotext from poppler on PATH, openpyxl, xlrd)
All inputs are in raw/; nothing is typed in by hand except the indicator-number/label mapping
and the district-name aliases, both of which are asserted against the source text.
"""

from __future__ import annotations

import csv
import re
import subprocess
from collections import defaultdict
from pathlib import Path

import openpyxl
import xlrd

HERE = Path(__file__).resolve().parent
RAW = HERE / "raw"
CROSSWALK = Path("pipelines/boundaries/data/mp_district_division_crosswalk.csv")

# --------------------------------------------------------------------------------------
# Sources (URLs recorded in SOURCES.md; these strings go into the output CSV)
# --------------------------------------------------------------------------------------
NFHS_SRC = (
    "NFHS-5 (2019-21) District Fact Sheets compendium, Madhya Pradesh (IIPS/MoHFW)",
    "https://web.archive.org/web/20230420150640/http://rchiips.org/nfhs/NFHS-5_FCTS/COMPENDIUM/Madhya_Pradesh.pdf",
)
PCA_SRC = (
    "Census of India 2011, Primary Census Abstract - State and district level (ORGI)",
    "https://censusindia.gov.in/nada/index.php/catalog/6191",
)
A1_SRC = (
    "Census of India 2011, Table A-1 (villages, towns, households, population and area) + PCA (ORGI)",
    "https://censusindia.gov.in/nada/index.php/catalog/42526",
)
C14_SRC = (
    "Census of India 2011, Table C-14 population by five-year age group, Madhya Pradesh (ORGI)",
    "https://censusindia.gov.in/nada/index.php/catalog/1561",
)
C20_SRC = (
    "Census of India 2011, Table C-20 disabled population, Madhya Pradesh (ORGI) + PCA",
    "https://censusindia.gov.in/nada/index.php/catalog/43392",
)
B18_SRC = (
    "Census of India 2011, Table B-18 industrial classification of workers, Madhya Pradesh (ORGI) + PCA",
    "https://censusindia.gov.in/nada/index.php/catalog/43257",
)
SLUM_SRC = (
    "Census of India 2011, PCA for slums (town level) + PCA TV town-district codes + PCA (ORGI)",
    "https://censusindia.gov.in/nada/index.php/catalog/6190",
)
MPI_SRC = (
    "NITI Aayog, National Multidimensional Poverty Index: A Progress Review 2023 (district table, NFHS-5)",
    "https://www.niti.gov.in/sites/default/files/2023-08/India-National-Multidimentional-Poverty-Index-2023.pdf",
)

# --------------------------------------------------------------------------------------
# District names: every spelling seen in a source -> current_district in the crosswalk
# --------------------------------------------------------------------------------------
ALIASES = {
    "Khargone (West Nimar)": "Khargone",
    "Khandwa (East Nimar)": "Khandwa",
    "Narsimhapur": "Narsinghpur",
    "Hoshangabad (Narmadapuram)": "Hoshangabad",
    "Narmadapuram": "Hoshangabad",
}
DIVISION_CODES = {
    "Bhopal": "bhopal",
    "Chambal": "chambal",
    "Gwalior": "gwalior",
    "Indore": "indore",
    "Jabalpur": "jabalpur",
    "Narmadapuram": "narmadapuram",
    "Rewa": "rewa",
    "Sagar": "sagar",
    "Shahdol": "shahdol",
    "Ujjain": "ujjain",
}
# Agar Malwa (2013) = these Census-2011 sub-districts of Shajapur (agarmalwa.nic.in, raw/misc/)
AGAR_MALWA_TEHSILS = {"Agar", "Badod", "Susner", "Nalkheda"}

name_log: dict[tuple[str, str], str] = {}


def load_crosswalk() -> dict[str, str]:
    with CROSSWALK.open() as f:
        return {r["current_district"]: r["division"] for r in csv.DictReader(f)}


XWALK = load_crosswalk()


def canon(name: str, source: str) -> str:
    n = re.sub(r"\s+", " ", name).strip()
    c = ALIASES.get(n, n)
    if c not in XWALK:
        raise SystemExit(f"unmapped district name {name!r} from {source}")
    name_log[(source, n)] = c
    return c


def division_of(district: str) -> str:
    return DIVISION_CODES[XWALK[district]]


# --------------------------------------------------------------------------------------
# NFHS-5 district fact sheets
# --------------------------------------------------------------------------------------
# fact-sheet item number -> (indicator code, label regex that must match the item text)
NFHS_ITEMS = {
    8: ("ac.improved_water_source", r"improved drinking-water source"),
    9: ("ac.improved_sanitation", r"improved sanitation facility"),
    10: ("ac.clean_cooking_fuel", r"clean fuel for cooking"),
    12: ("ac.health_insurance", r"health insurance/financing scheme"),
    15: ("ac.women_10yr_schooling", r"Women with 10 or more years of schooling"),
    39: (
        "ac.oop_delivery_public",
        r"out-of-pocket expenditure per delivery in a public health facility",
    ),
    49: (
        "ac.full_vaccination",
        r"fully vaccinated based on information from either vaccination card or",
    ),
    73: ("sens.child_stunting", r"under 5 years who are stunted"),
    74: ("sens.child_wasting", r"under 5 years who are wasted"),
    76: ("sens.child_underweight", r"under 5 years who are underweight"),
    77: ("sens.child_overweight", r"under 5 years who are overweight"),
    84: ("sens.anaemia_women", r"All women age 15-49 years who are anaemic"),
    88: (
        "sens.high_blood_sugar_women",
        r"high or very high .*taking medicine to control blood sugar",
    ),
    91: (
        "sens.high_blood_sugar_men",
        r"high or very high .*taking medicine to control blood sugar",
    ),
    94: (
        "sens.high_bp_women",
        r"Elevated blood pressure .*or taking medicine to control",
    ),
    97: (
        "sens.high_bp_men",
        r"Elevated blood pressure .*or taking medicine to control",
    ),
}
# section header that must precede the item (women vs men blocks)
NFHS_SEX = {88: "Women", 91: "Men", 94: "Women", 97: "Men"}
VAL = r"(?:\(?-?[\d,]+(?:\.\d+)?\)?|\*|na)"
ITEM_RE = re.compile(r"^\s*(\d{1,3})\.\s+(.*)$")
TAIL_RE = re.compile(rf"\s{{2,}}({VAL})(?:\s{{2,}}({VAL}))?\s*$")


def pdftext(path: Path, first: int | None = None, last: int | None = None) -> str:
    cmd = ["pdftotext", "-layout"]
    if first:
        cmd += ["-f", str(first), "-l", str(last or first)]
    return subprocess.run(
        cmd + [str(path), "-"], check=True, capture_output=True, text=True
    ).stdout


def parse_value(tok: str) -> tuple[float | None, str]:
    if tok in ("*", "na"):
        return None, (
            "suppressed (*: fewer than 25 unweighted cases)" if tok == "*" else "na"
        )
    flag = ""
    if tok.startswith("("):
        flag = "based on 25-49 unweighted cases"
        tok = tok.strip("()")
    return float(tok.replace(",", "")), flag


def parse_factsheet_text(
    text: str,
) -> dict[str, dict[int, tuple[float | None, str, str]]]:
    """Return {district_header_name: {item_no: (value, flag, label)}} for district pages only."""
    out: dict[str, dict[int, tuple[float | None, str, str]]] = {}
    current = None
    sex = None
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        m = re.match(r"^\s*(.+?), Madhya Pradesh - Key Indicators\s*$", line)
        if m:
            current = m.group(1).strip()
            out.setdefault(current, {})
        elif re.match(r"^\s*Madhya Pradesh - Key Indicators\s*$", line):
            current = None  # state pages (Urban/Rural/Total columns) are skipped
        s = line.strip()
        if s in ("Women", "Men"):
            sex = s
        im = ITEM_RE.match(line)
        if current and im:
            no = int(im.group(1))
            label = im.group(2)
            tm = TAIL_RE.search(line)
            j = i
            # wrapped item: the value sits on a continuation line
            while not tm and j + 1 < len(lines) and j - i < 3:
                j += 1
                nxt = lines[j]
                if ITEM_RE.match(nxt):
                    break
                label += " " + nxt.strip()
                tm = TAIL_RE.search(nxt)
            if tm:
                label = TAIL_RE.sub("", label).strip()
                val, flag = parse_value(tm.group(1))
                out[current][no] = (val, flag, f"{sex or ''}|{label}")
        i += 1
    return out


def load_nfhs() -> dict[str, dict[str, tuple[float | None, str]]]:
    raw = parse_factsheet_text(pdftext(RAW / "NFHS5_MP_district_compendium.pdf"))
    res: dict[str, dict[str, tuple[float | None, str]]] = {}
    for dname, items in raw.items():
        d = canon(dname, "NFHS-5 compendium")
        res[d] = {}
        for no, (code, pat) in NFHS_ITEMS.items():
            if no not in items:
                raise SystemExit(f"NFHS item {no} missing for {dname}")
            val, flag, label = items[no]
            sex, text = label.split("|", 1)
            if not re.search(pat, text):
                raise SystemExit(f"NFHS item {no} label mismatch for {dname}: {text!r}")
            if no in NFHS_SEX and sex != NFHS_SEX[no]:
                raise SystemExit(
                    f"NFHS item {no} sex block mismatch for {dname}: {sex}"
                )
            res[d][code] = (val, flag)
    if len(res) != 51:
        raise SystemExit(f"expected 51 NFHS-5 MP districts, got {len(res)}")
    return res


# --------------------------------------------------------------------------------------
# Census 2011
# --------------------------------------------------------------------------------------
def xlsx_rows(path: Path):
    wb = openpyxl.load_workbook(path, read_only=True)
    return list(wb.worksheets[0].iter_rows(values_only=True))


def load_pca() -> dict[str, dict[str, dict[str, int]]]:
    """{district: {'Total'|'Rural'|'Urban': {column: value}}}, plus district code."""
    rows = xlsx_rows(RAW / "census2011/DDW_PCA0000_2011_Indiastatedist.xlsx")
    head = rows[0]
    out: dict[str, dict[str, dict]] = {}
    for r in rows[1:]:
        if r[0] == "23" and r[6] == "DISTRICT":
            d = canon(r[7], "Census 2011 PCA")
            rec = dict(zip(head, r))
            out.setdefault(d, {})[r[8]] = rec
    if len(out) != 50:
        raise SystemExit(f"expected 50 Census-2011 MP districts, got {len(out)}")
    return out


def load_a1() -> tuple[dict[str, dict], dict[str, int]]:
    rows = xlsx_rows(
        RAW / "census2011/A-1_NO_OF_VILLAGES_TOWNS_HOUSEHOLDS_POPULATION_AND_AREA.xlsx"
    )
    dist, agar = {}, {"persons": 0, "tehsils": []}
    shajapur_code = None
    for r in rows:
        if str(r[0]) == "23" and r[3] == "DISTRICT" and r[5] == "Total":
            d = canon(r[4], "Census 2011 A-1")
            dist[d] = {"persons": int(r[10]), "area_km2": float(r[13]), "code": r[1]}
            if d == "Shajapur":
                shajapur_code = r[1]
    for r in rows:
        if (
            str(r[0]) == "23"
            and r[1] == shajapur_code
            and r[3] == "SUB-DISTRICT"
            and r[5] == "Total"
            and r[4].strip() in AGAR_MALWA_TEHSILS
        ):
            agar["persons"] += int(r[10])
            agar["tehsils"].append(r[4].strip())
    if sorted(agar["tehsils"]) != sorted(AGAR_MALWA_TEHSILS):
        raise SystemExit(f"Agar Malwa tehsils not all found: {agar['tehsils']}")
    return dist, agar


def load_c14() -> dict[str, dict[str, dict[str, float]]]:
    b = xlrd.open_workbook(RAW / "census2011/DDW-2300C-14.xls")
    s = b.sheet_by_index(0)
    out: dict[str, dict[str, dict[str, float]]] = {}
    for i in range(s.nrows):
        r = s.row_values(i)
        if (
            r[1] == "23"
            and r[2] not in ("000", "")
            and str(r[3]).startswith("District")
        ):
            name = re.sub(r"^District\s*-\s*|\s*\(\d+\)\s*$", "", r[3]).strip()
            d = canon(name, "Census 2011 C-14")
            out.setdefault(d, {})[str(r[4]).strip()] = {"P": r[5], "M": r[6], "F": r[7]}
    return out


def load_c20() -> dict[str, int]:
    out = {}
    for r in xlsx_rows(RAW / "census2011/DDW-C20-2300.xlsx"):
        if (
            r
            and r[1] == "23"
            and r[2] not in ("000", None)
            and r[4] == "Total"
            and r[5] == "Total"
        ):
            d = canon(re.sub(r"^District-", "", r[3]), "Census 2011 C-20")
            out[d] = int(r[6])
    return out


def load_b18_construction() -> dict[str, int]:
    rows = xlsx_rows(RAW / "census2011/DDW-B18-2300-nic-final.xlsx")
    names, out = {}, defaultdict(int)
    code_to_d = {}
    for r in rows:
        if (
            r
            and r[1] == "23"
            and r[4] in ("41", "42", "43")
            and r[5] == "000"
            and r[6] == "0000"
        ):
            names[r[4]] = r[7]
            if r[2] == "000":
                continue
            area = re.sub(r"^DISTRICT\s*-\s*", "", str(r[3]), flags=re.I).strip()
            d = code_to_d.setdefault(
                r[2],
                canon(area.title() if area.isupper() else area, "Census 2011 B-18"),
            )
            out[d] += int(r[8]) + int(
                r[17]
            )  # main workers total persons + marginal workers total persons
    for k, v in names.items():
        if "onstruction" not in v and "ivil engineering" not in v:
            raise SystemExit(f"NIC division {k} is not construction: {v}")
    return dict(out)


def load_slum(pca_codes: dict[str, str]) -> tuple[dict[str, float], dict]:
    """Slum population per 2011 district: town-level slum PCA joined to town->district codes from PCA TV."""
    tv_dir = RAW / "census2011/pca_tv"
    # only files whose download completed (size == Content-Length), as logged by raw/census2011/pca_tv/fetch.sh
    done = set()
    if (tv_dir / "fetched.txt").exists():
        done = {
            ln.split()[1]
            for ln in (tv_dir / "fetched.txt").read_text().splitlines()
            if ln.strip()
        }
    files = sorted(tv_dir / f"{idno}.xlsx" for idno in done)
    town_to_dcode: dict[str, str] = {}
    for f in files:
        for r in xlsx_rows(f):
            if r and str(r[0]) == "23" and str(r[6]).upper() == "TOWN":
                town_to_dcode[str(r[3])] = str(r[1])
    b = xlrd.open_workbook(RAW / "census2011/slum_data_census_2011.xls")
    s = b.sheet_by_index(0)
    dcode_to_d = {v: k for k, v in pca_codes.items()}
    out: dict[str, float] = defaultdict(float)
    unmatched, n = [], 0
    for i in range(1, s.nrows):
        r = s.row_values(i)
        if r[0] == "23" and r[1] != "000000":
            n += 1
            dc = town_to_dcode.get(str(r[1]))
            if dc is None:
                unmatched.append((r[1], r[2]))
                continue
            out[dcode_to_d[dc]] += r[4]
    return dict(out), {
        "pca_tv_files": len(files),
        "slum_towns": n,
        "unmatched": unmatched,
    }


# --------------------------------------------------------------------------------------
# NITI Aayog MPI 2023 district table
# --------------------------------------------------------------------------------------
def load_mpi() -> dict[str, float]:
    text = pdftext(RAW / "niti/India-National-Multidimentional-Poverty-Index-2023.pdf")
    start = text.index("Madhya Pradesh: Overview of District")
    block = text[start : start + 8000].splitlines()
    out = {}
    pct = r"(?:–|-|\d+\.\d+%)"
    row = re.compile(
        rf"^\s{{0,4}}([A-Z][A-Za-z() ]+?)\s+{pct}\s+{pct}\s+(?:–|-|\d\.\d+)\s+(\d+\.\d+)%\s+(\d+\.\d+)%\s+(\d\.\d+)\s*$"
    )
    for line in block:
        m = row.match(line)
        if m:
            name = m.group(1).strip()
            if name == "Hoshangabad":
                name = "Hoshangabad (Narmadapuram)"
            out[canon(name, "NITI MPI 2023")] = float(m.group(2))
        if line.strip().startswith("Vidisha"):
            break
    if len(out) != 51:
        raise SystemExit(f"expected 51 MPI districts, got {len(out)}: {sorted(out)}")
    return out


# --------------------------------------------------------------------------------------
# Spot checks
# --------------------------------------------------------------------------------------
SSK_LABELS = {
    "ac.improved_water_source": "Population living in households with an improved drinkingwater source (%)",
    "ac.improved_sanitation": "Population living in households that use an improved sanitation facility (%)",
    "ac.clean_cooking_fuel": "Households using clean fuel for cooking (%)",
    "ac.health_insurance": "Households with any usual member covered under a health insurance/financing scheme (%)",
    "ac.women_10yr_schooling": "Women with 10 or more years of schooling (%)",
    "ac.oop_delivery_public": "Average out-of-pocket expenditure per delivery in a public health facility (Rs)",
    "ac.full_vaccination": "Children age 12-23 months fully vaccinated based on information from either vaccination card or mother's recall (%)",
    "sens.child_stunting": "Children under 5 years who are stunted (height for age) (%)",
    "sens.child_wasting": "Children under 5 years who are wasted (weight for height) (%)",
    "sens.child_underweight": "Children under 5 years who are underweight (weight for age) (%)",
    "sens.child_overweight": "Children under 5 years who are overweight (weight fo rheight)20 (%)",
    "sens.anaemia_women": "All women age 15-49 years who are anaemic (%)",
    "sens.high_blood_sugar_women": "Female Blood sugar level  high or very high (>140 mg/dl) or taking medicine to control blood sugar level (%)",
    "sens.high_blood_sugar_men": "Male Blood sugar level  high or very high (>140 mg/dl) or taking medicine to control blood sugar level (%)",
    "sens.high_bp_women": "Female Elevated blood pressure or taking medicine to control blood pressure (%)",
    "sens.high_bp_men": "Male Elevated blood pressure or taking medicine to control blood pressure (%)",
}


def state_totals() -> dict[str, float | None]:
    """NFHS-5 Madhya Pradesh state fact sheet (compendium pp. 7-12), 'Total' column (3rd of Urban/Rural/Total/NFHS-4).
    State numbering differs from district sheets, so items are matched by label (and Women/Men block).
    """
    lines = pdftext(RAW / "NFHS5_MP_district_compendium.pdf", 7, 12).splitlines()
    tail = re.compile(rf"\s{{2,}}({VAL})\s+({VAL})\s+({VAL})(?:\s+({VAL}))?\s*$")
    sex_of = {NFHS_ITEMS[n][0]: x for n, x in NFHS_SEX.items()}
    out: dict[str, float | None] = {}
    sex = None
    for i, line in enumerate(lines):
        if line.strip() in ("Women", "Men"):
            sex = line.strip()
        im = ITEM_RE.match(line)
        if not im:
            continue
        nxt = (
            lines[i + 1]
            if i + 1 < len(lines) and not ITEM_RE.match(lines[i + 1])
            else ""
        )
        label = im.group(2) + " " + nxt.strip()
        m = tail.search(line) or (tail.search(nxt) if nxt else None)
        for code, pat in NFHS_ITEMS.values():
            if code in out or not m or not re.search(pat, label):
                continue
            if code in sex_of and sex_of[code] != sex:
                continue
            out[code] = parse_value(m.group(3))[0]
    return out


def spot_checks(nfhs, pca, a1, c14, weight) -> list[dict]:
    checks = []
    # 0. plausibility of the population-weight approximation: weighted mean of all 51 districts vs state value
    st = state_totals()
    for code, _ in NFHS_ITEMS.values():
        vals = [
            (weight[d], v[code][0]) for d, v in nfhs.items() if v[code][0] is not None
        ]
        est = sum(w * x for w, x in vals) / sum(w for w, _ in vals)
        ref = st.get(code)
        checks.append(
            {
                "check": "state_value_vs_weighted_district_mean(approximation, not exact)",
                "district": "Madhya Pradesh",
                "indicator_code": code,
                "value_used": round(est, 2),
                "reference": ref,
                "reference_source": "compendium state fact sheet Total column",
                "match": ref is not None
                and abs(est - ref) <= max(1.0, 0.05 * abs(ref)),
            }
        )
    # 1. compendium vs individual official district PDFs (archived rchiips.org originals)
    for pdf in sorted((RAW / "nfhs5_official_wayback").glob("*.pdf")):
        parsed = parse_factsheet_text(pdftext(pdf))
        for dname, items in parsed.items():
            d = canon(dname, "NFHS-5 district PDF")
            for no, (code, _) in NFHS_ITEMS.items():
                v = items[no][0]
                c = nfhs[d][code][0]
                checks.append(
                    {
                        "check": "compendium_vs_official_district_pdf",
                        "district": d,
                        "indicator_code": code,
                        "value_used": c,
                        "reference": v,
                        "reference_source": f"raw/nfhs5_official_wayback/{pdf.name}",
                        "match": v == c,
                    }
                )
    # 2. compendium vs independent CSV extraction (SaiSiddhardhaKalla/NFHS _states/MP.csv)
    with (RAW / "ssk_MP.csv").open(encoding="utf-8-sig") as f:
        ssk = defaultdict(dict)
        for r in csv.DictReader(f):
            ssk[canon(r["District Name"], "SSK NFHS CSV mirror")][r["Indicator"]] = r[
                "NFHS 5"
            ]
    for d, vals in ssk.items():
        for code, lab in SSK_LABELS.items():
            ref = vals.get(lab, "")
            try:
                refv = (
                    float(ref.replace(",", "").strip("()"))
                    if ref not in ("", "*", "na")
                    else None
                )
            except ValueError:
                refv = None
            checks.append(
                {
                    "check": "compendium_vs_ssk_csv_mirror",
                    "district": d,
                    "indicator_code": code,
                    "value_used": nfhs[d][code][0],
                    "reference": refv,
                    "reference_source": "raw/ssk_MP.csv",
                    "match": refv == nfhs[d][code][0],
                }
            )
    # 3. Census internal consistency: PCA total population == A-1 == C-14 'All ages'
    for d in pca:
        p = pca[d]["Total"]["TOT_P"]
        checks.append(
            {
                "check": "census_pca_vs_a1_population",
                "district": d,
                "indicator_code": "population",
                "value_used": p,
                "reference": a1[d]["persons"],
                "reference_source": "A-1",
                "match": p == a1[d]["persons"],
            }
        )
        checks.append(
            {
                "check": "census_pca_vs_c14_population",
                "district": d,
                "indicator_code": "population",
                "value_used": p,
                "reference": c14[d]["All ages"]["P"],
                "reference_source": "C-14",
                "match": p == c14[d]["All ages"]["P"],
            }
        )
    return checks


# --------------------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------------------
def r2(x: float) -> float:
    return round(x, 2)


def main() -> None:
    nfhs = load_nfhs()
    pca = load_pca()
    a1, agar = load_a1()
    c14 = load_c14()
    c20 = load_c20()
    constr = load_b18_construction()
    mpi = load_mpi()
    pca_codes = {d: v["Total"]["District"] for d, v in pca.items()}
    slum, slum_meta = load_slum(pca_codes)

    # Census-2011 population weights for NFHS/MPI districts (Agar Malwa split from Shajapur by tehsil)
    weight = {d: pca[d]["Total"]["TOT_P"] for d in pca}
    weight["Agar Malwa"] = agar["persons"]
    weight["Shajapur"] = pca["Shajapur"]["Total"]["TOT_P"] - agar["persons"]

    district_rows = []  # (district, division, code, value, vintage, source, note)

    # NFHS (51 districts)
    for d, vals in sorted(nfhs.items()):
        for code, (v, flag) in vals.items():
            if v is not None:
                district_rows.append(
                    (d, division_of(d), code, v, "2019-21", NFHS_SRC[0], flag)
                )
            else:
                district_rows.append(
                    (d, division_of(d), code, "", "2019-21", NFHS_SRC[0], flag)
                )
    for d, v in sorted(mpi.items()):
        district_rows.append(
            (
                d,
                division_of(d),
                "ac.multidimensional_poverty",
                v,
                "2019-21",
                MPI_SRC[0],
                "",
            )
        )

    # Census numerators / denominators per 2011 district
    census_parts: dict[str, dict[str, tuple[float, float]]] = defaultdict(dict)
    for d in sorted(pca):
        t = pca[d]["Total"]
        work = t["TOT_WORK_P"]
        agri = t["MAIN_CL_P"] + t["MAIN_AL_P"] + t["MARG_CL_P"] + t["MARG_AL_P"]
        ages = c14[d]
        old = sum(ages[g]["P"] for g in ("65-69", "70-74", "75-79", "80+"))
        women_20_49 = sum(
            ages[g]["F"] for g in ("20-24", "25-29", "30-34", "35-39", "40-44", "45-49")
        )
        parts = {
            "exp.population_density": (a1[d]["persons"], a1[d]["area_km2"]),
            "exp.workers_share": (work, t["TOT_P"]),
            "exp.agri_workers_share": (agri, work),
            "exp.construction_workers_share": (constr[d], work),
            "sens.child_0_6_share": (t["P_06"], t["TOT_P"]),
            "sens.elderly_share": (old, ages["All ages"]["P"]),
            "sens.women_20_49_share": (women_20_49, ages["All ages"]["P"]),
            "sens.adolescent_girls_share": (ages["15-19"]["F"], ages["All ages"]["P"]),
            "sens.disability_share": (c20[d], t["TOT_P"]),
        }
        if slum_meta["pca_tv_files"] == 50 and not slum_meta["unmatched"]:
            parts["sens.slum_population_share"] = (
                slum.get(d, 0.0),
                pca[d]["Urban"]["TOT_P"],
            )
        census_parts[d] = parts
        src = {
            "exp.population_density": A1_SRC,
            "sens.elderly_share": C14_SRC,
            "sens.women_20_49_share": C14_SRC,
            "sens.adolescent_girls_share": C14_SRC,
            "sens.disability_share": C20_SRC,
            "exp.construction_workers_share": B18_SRC,
            "sens.slum_population_share": SLUM_SRC,
        }
        for code, (num, den) in parts.items():
            val = num / den if code == "exp.population_density" else 100 * num / den
            district_rows.append(
                (
                    d,
                    division_of(d),
                    code,
                    r2(val),
                    "2011",
                    src.get(code, PCA_SRC)[0],
                    f"numerator={num:.10g}; denominator={den:.10g}",
                )
            )

    # ---- division aggregation
    div_rows = []
    div_names = {v: f"{k} Division" for k, v in DIVISION_CODES.items()}
    sources = {r[2]: (r[5], r[4]) for r in district_rows}
    src_url = {
        NFHS_SRC[0]: NFHS_SRC[1],
        MPI_SRC[0]: MPI_SRC[1],
        PCA_SRC[0]: PCA_SRC[1],
        A1_SRC[0]: A1_SRC[1],
        C14_SRC[0]: C14_SRC[1],
        C20_SRC[0]: C20_SRC[1],
        B18_SRC[0]: B18_SRC[1],
        SLUM_SRC[0]: SLUM_SRC[1],
    }
    # weighted means (NFHS, MPI)
    rate_codes = [c for c, _ in NFHS_ITEMS.values()] + ["ac.multidimensional_poverty"]
    for code in rate_codes:
        acc = defaultdict(lambda: [0.0, 0.0, [], [], []])
        for d, div, c, v, _vint, _src, flag in district_rows:
            if c != code:
                continue
            if v == "":
                acc[div][3].append(d)
                continue
            acc[div][0] += weight[d] * v
            acc[div][1] += weight[d]
            acc[div][2].append(d)
            if flag:
                acc[div][4].append(d)
        for div in sorted(DIVISION_CODES.values()):
            sw, w, used, missing, small = acc[div]
            if not used:
                continue
            note = f"population-weighted mean of {len(used)} districts (weights: Census 2011 total population)"
            if missing:
                note += f"; excluded as suppressed (*) in source: {', '.join(missing)}"
            if small:
                note += (
                    f"; based on 25-49 unweighted cases in source: {', '.join(small)}"
                )
            note += f"; districts: {', '.join(sorted(used))}"
            name, vint = sources[code]
            div_rows.append(
                (div, div_names[div], code, r2(sw / w), vint, name, src_url[name], note)
            )
    # exact ratios (Census)
    census_codes = sorted({c for p in census_parts.values() for c in p})
    for code in census_codes:
        acc = defaultdict(lambda: [0.0, 0.0, 0])
        for d, parts in census_parts.items():
            num, den = parts[code]
            div = division_of(d)
            acc[div][0] += num
            acc[div][1] += den
            acc[div][2] += 1
        for div in sorted(DIVISION_CODES.values()):
            num, den, n = acc[div]
            val = num / den if code == "exp.population_density" else 100 * num / den
            name, vint = sources[code]
            div_rows.append(
                (
                    div,
                    div_names[div],
                    code,
                    r2(val),
                    vint,
                    name,
                    src_url[name],
                    f"sum of numerators/denominators over {n} Census-2011 districts",
                )
            )

    div_rows.sort(key=lambda r: (r[0], r[2]))
    with (HERE / "mp_divisions_vra.csv").open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(
            [
                "area_code",
                "area_name",
                "indicator_code",
                "value",
                "vintage",
                "source_name",
                "source_url",
                "notes",
            ]
        )
        w.writerows(div_rows)
    with (HERE / "mp_districts_source.csv").open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(
            [
                "district",
                "division",
                "indicator_code",
                "value",
                "vintage",
                "source",
                "notes",
                "weight_census2011_pop (NFHS/MPI rows only)",
            ]
        )
        for r in sorted(district_rows, key=lambda r: (r[2], r[0])):
            w.writerow(list(r) + [weight[r[0]] if r[4] == "2019-21" else ""])
    with (HERE / "district_name_map.csv").open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(
            ["source", "source_district_name", "crosswalk_current_district", "division"]
        )
        for (src, n), c in sorted(name_log.items()):
            w.writerow([src, n, c, XWALK[c]])
    checks = spot_checks(nfhs, pca, a1, c14, weight)
    with (HERE / "spotchecks.csv").open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(checks[0]))
        w.writeheader()
        w.writerows(checks)

    # ---- manifest of every raw input with SHA-256
    import hashlib

    with (HERE / "raw_manifest.csv").open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["path", "bytes", "sha256"])
        for fp in sorted(RAW.rglob("*")):
            if fp.is_file():
                w.writerow(
                    [
                        str(fp.relative_to(HERE)),
                        fp.stat().st_size,
                        hashlib.sha256(fp.read_bytes()).hexdigest(),
                    ]
                )

    # ---- summary
    print(f"districts: NFHS={len(nfhs)} Census={len(pca)} MPI={len(mpi)}")
    print(
        f"Agar Malwa 2011 weight from tehsils {sorted(agar['tehsils'])}: {agar['persons']}"
    )
    print(
        f"slum: {slum_meta['pca_tv_files']} PCA TV files, {slum_meta['slum_towns']} MP slum towns, "
        f"unmatched={slum_meta['unmatched'][:5]}"
    )
    per_code = defaultdict(int)
    for r in div_rows:
        per_code[r[2]] += 1
    for c in sorted(per_code):
        print(f"  {c}: {per_code[c]} divisions")
    by_check = defaultdict(lambda: [0, 0])
    for c in checks:
        by_check[c["check"]][0] += 1
        by_check[c["check"]][1] += bool(c["match"])
    for k, (n, ok) in by_check.items():
        print(f"check {k}: {ok}/{n} match")


if __name__ == "__main__":
    main()
