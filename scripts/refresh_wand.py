"""Build a Checkpoint index from Wand's public map directory."""
import argparse
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import urlopen

BASE = "https://wand.com/maps"
PATH = re.compile(r"/maps/[a-z0-9-]+(?:/[a-z0-9-]+)?")


class StructuredData(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.blocks = []
        self.capture = False
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        if tag == "script" and dict(attrs).get("type") == "application/ld+json":
            self.capture = True

    def handle_endtag(self, tag):
        if tag == "script":
            self.capture = False

    def handle_data(self, data):
        if not self.capture:
            return
        try:
            self.blocks.append(json.loads(data))
        except json.JSONDecodeError:
            pass


def objects(value, kind):
    if isinstance(value, dict):
        if value.get("@type") == kind:
            yield value
        for item in value.values():
            yield from objects(item, kind)
    elif isinstance(value, list):
        for item in value:
            yield from objects(item, kind)


def directory_rows(html):
    decoder = json.JSONDecoder()
    for match in re.finditer(r'self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)', html):
        payload = json.loads(match[1])
        marker = '"initialItems":'
        pos = payload.find(marker)
        if pos < 0:
            continue
        try:
            rows, _ = decoder.raw_decode(payload[pos + len(marker):])
        except json.JSONDecodeError:
            continue
        if isinstance(rows, list):
            for row in rows:
                slug = row.get("titleSlug", "")
                if re.fullmatch(r"[a-z0-9-]+", slug) and isinstance(row.get("titleName"), str):
                    item = {"title": row["titleName"], "path": "/maps/" + slug}
                    if str(row.get("steamId", "")).isdigit():
                        item["steamId"] = str(row["steamId"])
                    yield item


def path_from(row):
    url = urlsplit(row.get("url", ""))
    return url.path if url.hostname == "wand.com" and PATH.fullmatch(url.path) else ""


def fetch(url):
    with urlopen(url, timeout=15) as response:
        return response.read().decode("utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, help="Use a saved copy of the public directory.")
    parser.add_argument("--regions", type=Path, nargs="*", default=[], help="Add regions from saved game pages.")
    args = parser.parse_args()
    html = args.directory.read_text(encoding="utf-8-sig") if args.directory else fetch(BASE)
    games = {}
    for row in objects(StructuredData(html).blocks, "VideoGame"):
        path = path_from(row)
        if path and path.count("/") == 2 and isinstance(row.get("name"), str):
            games[path] = {"title": row["name"], "path": path}
    games.update((item["path"], item) for item in directory_rows(html))
    if len(games) < 10:
        raise SystemExit("Wand directory returned too few games. Keeping the previous snapshot.")

    output = Path(__file__).resolve().parents[1] / "assets/wand-maps.json"
    if output.exists():
        for item in json.loads(output.read_text(encoding="utf-8")):
            parent = games.get(item["path"])
            if parent and item.get("regions"):
                parent["regions"] = item["regions"]
    for page in args.regions:
        regions = {}
        for row in objects(StructuredData(page.read_text(encoding="utf-8-sig")).blocks, "CreativeWork"):
            path = path_from(row)
            if path and path.count("/") == 3 and row.get("name"):
                regions[path] = {"name": row["name"], "path": path}
        for path, region in regions.items():
            parent = games.get(path.rsplit("/", 1)[0])
            if parent:
                saved = parent.setdefault("regions", [])
                if not any(item["path"] == path for item in saved):
                    saved.append(region)
    output.write_text(json.dumps(list(games.values()), ensure_ascii=False, separators=(",", ":"))+"\n", encoding="utf-8")
    print(f"Indexed {len(games)} games and {sum(len(item.get('regions', [])) for item in games.values())} regions.")


if __name__ == "__main__":
    main()
