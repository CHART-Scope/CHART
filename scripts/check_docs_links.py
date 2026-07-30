#!/usr/bin/env python3
from __future__ import annotations

import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlparse

site_origin = "https://chart-scope.github.io"
site_prefix = "/CHART/docs/"
local_hosts = frozenset({"127.0.0.1", "localhost", "::1"})


class PageLinks(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.hrefs: list[str] = []
        self.ids: set[str] = set()

    def handle_starttag(
        self, tag: str, attrs: list[tuple[str, str | None]]
    ) -> None:
        attributes = dict(attrs)
        element_id = attributes.get("id")
        if element_id:
            self.ids.add(element_id)
        if tag == "a":
            href = attributes.get("href")
            if href:
                self.hrefs.append(href)


def read_page(path: Path) -> PageLinks:
    page = PageLinks()
    page.feed(path.read_text(encoding="utf-8"))
    return page


def public_url(site_dir: Path, page_path: Path) -> str:
    relative = page_path.relative_to(site_dir)
    if relative.name == "index.html":
        page_part = relative.parent.as_posix().strip("/")
        suffix = f"{page_part}/" if page_part else ""
    else:
        suffix = relative.as_posix()
    return f"{site_origin}{site_prefix}{suffix}"


def local_target(site_dir: Path, path: str) -> Path:
    relative = unquote(path.removeprefix(site_prefix)).lstrip("/")
    target = site_dir / relative
    if path.endswith("/") or not relative:
        target = target / "index.html"
    return target


def check_site(site_dir: Path) -> list[str]:
    errors: list[str] = []
    pages = sorted(site_dir.rglob("*.html"))
    parsed_pages = {page: read_page(page) for page in pages}
    link_count = 0

    for page_path, page in parsed_pages.items():
        page_url = public_url(site_dir, page_path)
        for href in page.hrefs:
            link_count += 1
            if href.startswith(("mailto:", "javascript:", "data:")):
                continue

            resolved = urlparse(urljoin(page_url, href))
            if resolved.hostname in local_hosts:
                errors.append(
                    f"{page_path}: local address must be code, not a link: {href}"
                )
                continue
            if resolved.scheme not in {"http", "https"}:
                continue
            if resolved.netloc != urlparse(site_origin).netloc:
                continue
            if not resolved.path.startswith(site_prefix):
                errors.append(f"{page_path}: link leaves the documentation path: {href}")
                continue

            target = local_target(site_dir, resolved.path)
            if not target.is_file():
                errors.append(f"{page_path}: missing internal link target: {href}")
                continue

            if resolved.fragment and target.suffix == ".html":
                target_page = parsed_pages.get(target)
                if target_page is None:
                    target_page = read_page(target)
                    parsed_pages[target] = target_page
                if resolved.fragment not in target_page.ids:
                    errors.append(f"{page_path}: missing link fragment: {href}")

    print(f"Checked {link_count} links across {len(pages)} documentation pages.")
    return errors


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: check_docs_links.py <built-site-directory>", file=sys.stderr)
        return 2

    site_dir = Path(sys.argv[1]).resolve()
    if not site_dir.is_dir():
        print(f"Built site directory does not exist: {site_dir}", file=sys.stderr)
        return 2

    errors = check_site(site_dir)
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
