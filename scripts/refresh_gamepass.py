import argparse
import json
import re
from datetime import date
from html import unescape
from pathlib import Path
from urllib.request import Request, urlopen
from xml.etree import ElementTree

FEED = "https://news.xbox.com/en-us/tag/xbox-game-pass/feed/"
MONTHS = "January February March April May June July August September October November December".split()


def download(url):
    with urlopen(Request(url, headers={"User-Agent": "Checkpoint-RSS/1.0"}), timeout=15) as response:
        return response.read(4_000_000).decode("utf-8-sig")


def text(markup):
    return " ".join(unescape(re.sub(r"<[^>]*>", " ", markup)).split())


def departures(markup, source, published):
    pattern = r"<h[2-4]\b[^>]*>(.*?)</h[2-4]>(.*?)(?=<h[2-4]\b|\Z)"
    for heading, section in re.findall(pattern, markup, re.I | re.S):
        match = re.fullmatch(r"Leaving\s+(\w+)\s+(\d{1,2})", text(heading), re.I)
        if not match or match[1].title() not in MONTHS:
            continue
        month = MONTHS.index(match[1].title()) + 1
        year = published.year + int(published.month == 12 and month == 1)
        try:
            deadline = date(year, month, int(match[2]))
        except ValueError:
            continue
        if deadline < date.today():
            continue
        listing = re.search(r"<ul\b[^>]*>(.*?)</ul>", section, re.I | re.S)
        if not listing:
            continue
        for row in re.findall(r"<li\b[^>]*>(.*?)</li>", listing[1], re.I | re.S):
            match = re.fullmatch(r"(.+?)\s*\(([^()]*)\)", text(row))
            if match and re.search(r"\bconsole\b", match[2], re.I):
                yield {"title": match[1], "date": deadline.isoformat(), "url": source}


def main(output):
    root = ElementTree.fromstring(download(FEED))
    results = {}
    processed = 0
    for entry in root.findall("./channel/item"):
        title = entry.findtext("title", "").lower()
        source = entry.findtext("link", "")
        published = re.match(r"https://news\.xbox\.com/en-us/(\d{4})/(\d{2})/(\d{2})/", source)
        if not title.startswith("coming to") or "game pass" not in title or not published:
            continue
        day = date(*(int(part) for part in published.groups()))
        content = entry.findtext("{http://purl.org/rss/1.0/modules/content/}encoded", "")
        if not re.search(r"Leaving\s+", content, re.I):
            content = download(source)
        for game in departures(content, source, day):
            results.setdefault(game["title"].casefold(), game)
        processed += 1
        if processed >= 3:
            break
    if not processed:
        raise SystemExit("Xbox Wire announcement unavailable")
    output.write_text(json.dumps(list(results.values()), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    main(parser.parse_args().output)
