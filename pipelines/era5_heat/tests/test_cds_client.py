from era5_heat.cds_client import build_request, cache_key


BBOX = (26.87, 74.02, 21.08, 82.82)


def test_exact_month_request_does_not_download_a_full_year() -> None:
    request = build_request(2026, BBOX, (6, 5, 6))

    assert request["year"] == "2026"
    assert request["month"] == ["05", "06"]


def test_exact_months_are_part_of_the_cache_identity() -> None:
    may_june = cache_key(2026, BBOX, (5, 6))
    full_year = cache_key(2026, BBOX)

    assert may_june != full_year
