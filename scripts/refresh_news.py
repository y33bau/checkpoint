import argparse
import json
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from html import unescape
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from xml.etree import ElementTree

FEEDS = {
    "ppe": "https://www.ppe.pl/rss.html",
    "gram": "https://www.gram.pl/rss/content.xml",
    "planetagracza": "https://planetagracza.pl/feed/",
    "ignpl": "https://pl.ign.com/feed.xml",
    "gryonline": "https://www.gry-online.pl/rss/news.xml",
    "eurogamerpl": "https://www.eurogamer.pl/feed/news",
    "cdaction": "https://cdaction.pl/feed",
    "eurogamer": "https://www.eurogamer.net/feed/news",
    "pcgamer": "https://www.pcgamer.com/rss/",
    "rps": "https://www.rockpapershotgun.com/feed/news",
}


# Gram.pl publishes RFC-style dates with Polish weekday and month names.
POLISH_MONTHS = dict(zip(
    ("sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"),
    ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"),
))


def article_date(value, source):
    if source == "gram":
        value = re.sub(r"^.*?,\s*", "", value)
        value = re.sub(r"(?<=\d )([^\W\d_]{3})(?= \d{4})",
                       lambda match: POLISH_MONTHS.get(match[1].lower(), match[1]), value)
    try:
        published = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return None
    if published.tzinfo is None:
        published = published.replace(tzinfo=timezone.utc)
    return published.astimezone(timezone.utc).isoformat()


def read_feed(source, feed):
    request = Request(feed, headers={"User-Agent": "Checkpoint-RSS/1.0"})
    with urlopen(request, timeout=15) as response:
        root = ElementTree.fromstring(response.read(3_000_000))
    articles = []
    for item in root.findall("./channel/item"):
        title = unescape(item.findtext("title", "")).strip()
        url = item.findtext("link", "").strip()
        if urlsplit(url).scheme == "http":
            url = urlsplit(url)._replace(scheme="https").geturl()
        if not title or urlsplit(url).scheme != "https":
            continue
        published = article_date(item.findtext("pubDate", ""), source)
        articles.append({"source": source, "title": title, "url": url, "publishedAt": published})
    if not articles:
        raise ValueError(f"{source} returned no articles")
    return articles[:15]


def main(output):
    existing = json.loads(output.read_text(encoding="utf-8")) if output.exists() else {}
    articles = []
    successful = 0
    with ThreadPoolExecutor(max_workers=len(FEEDS)) as pool:
        tasks = {source: pool.submit(read_feed, source, url) for source, url in FEEDS.items()}
        for source, task in tasks.items():
            try:
                articles.extend(task.result())
                successful += 1
            except Exception as error:
                print(f"{source}: {error}")
                articles.extend(item for item in existing.get("articles", []) if item["source"] == source)
    if not successful:
        raise SystemExit("All RSS sources failed")
    unique = {item["url"]: item for item in articles}
    ordered = sorted(unique.values(), key=lambda item: item["publishedAt"] or "", reverse=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({"articles": ordered}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    main(parser.parse_args().output)
