"""Convert the Goodreads "Best Books Ever" CSV into the compact books.json the site loads.

Usage: python3 scripts/build_data.py path/to/books_1.Best_Books_Ever.csv books.json

Dataset: Lorena Casanova Lozano & Sergio Costa Planells (2020), Best Books Ever Dataset,
Zenodo, doi:10.5281/zenodo.4265096 (CC BY-NC 4.0).
"""
import ast
import csv
import json
import re
import sys
from collections import Counter

MIN_RATINGS = 50          # drop near-empty entries
MAX_GENRES_PER_BOOK = 8   # Goodreads lists genres in vote order; keep the top ones
COVER_PREFIX = "https://i.gr-assets.com/images/S/compressed.photo.goodreads.com/books/"


def parse_list(s):
    try:
        v = ast.literal_eval(s)
        return [x.strip() for x in v if isinstance(x, str) and x.strip()]
    except Exception:
        return []


def parse_year(s):
    s = (s or "").strip()
    if not s:
        return None
    m = re.fullmatch(r"\d{1,2}/\d{1,2}/(\d{2})", s)
    if m:  # mm/dd/yy — dataset was scraped in 2020
        yy = int(m.group(1))
        return 2000 + yy if yy <= 20 else 1900 + yy
    m = re.search(r"(\d{4})", s)
    if m:
        y = int(m.group(1))
        return y if 0 < y <= 2021 else None
    return None


def to_int(s):
    try:
        return int(float(s))
    except Exception:
        return None


def main(src, dst):
    csv.field_size_limit(10**9)
    seen = set()
    books = []
    genre_counts = Counter()
    lang_counts = Counter()
    with open(src, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            bid = row["bookId"].strip()
            n = to_int(row["numRatings"])
            try:
                r = float(row["rating"])
            except ValueError:
                continue
            if not bid or bid in seen or not n or n < MIN_RATINGS or not (0 < r <= 5):
                continue
            seen.add(bid)
            genres = parse_list(row["genres"])[:MAX_GENRES_PER_BOOK]
            year = parse_year(row["firstPublishDate"]) or parse_year(row["publishDate"])
            cover = row["coverImg"].strip()
            if cover.startswith(COVER_PREFIX):
                cover = cover[len(COVER_PREFIX):]
            elif not cover.startswith("https://"):
                cover = ""
            lang = row["language"].strip()
            series = row["series"].strip()  # e.g. "The Hunger Games #1"
            num_id = re.match(r"\d+", bid)
            if not num_id:
                continue
            num_id = num_id.group(0)
            # cover paths look like "1586722975l/2767052.jpg"; store just the first part when it ends with the id
            if cover.endswith("/" + num_id + ".jpg"):
                cover = cover[: -len(num_id) - 5]
            p = to_int(row["pages"])
            b = {
                "i": int(num_id),
                "t": row["title"].strip(),
                "a": re.sub(r"\s*\([^)]*\)", "", row["author"].split(",")[0]).strip(),
                "r": round(r, 2),
                "n": n,
                "g": genres,
                "y": year or 0,
                "p": p if p and 0 < p < 20000 else 0,
                "l": lang,
                "s": series,
                "c": cover,
                # star counts as [5★, 4★, 3★, 2★, 1★]
                "h": [to_int(x) or 0 for x in parse_list(row["ratingsByStars"])][:5],
            }
            if len(b["h"]) != 5 or not any(b["h"]):
                b["h"] = []
            books.append(b)
            genre_counts.update(genres)
            if lang: lang_counts[lang] += 1

    # The list holds several editions of some books; keep the one with the most ratings.
    def key(b):
        t = re.sub(r"\s*[(:].*$", "", b["t"]).lower()
        t = re.sub(r"[^a-z0-9]+", " ", t).strip()
        return (t, b["a"].lower())
    best = {}
    for b in books:
        k = key(b)
        if k not in best or b["n"] > best[k]["n"]:
            best[k] = b
    keep = set(id(b) for b in best.values())
    dropped = [b for b in books if id(b) not in keep]
    books = [b for b in books if id(b) in keep]
    for b in dropped:
        for g in b["g"]:
            genre_counts[g] -= 1
        if b["l"]: lang_counts[b["l"]] -= 1

    total = sum(b["n"] for b in books)
    mean = sum(b["r"] * b["n"] for b in books) / total
    genres = [g for g, c in genre_counts.most_common() if c >= 50]
    langs = [l for l, c in lang_counts.most_common()]
    gi = {g: k for k, g in enumerate(genres)}
    li = {l: k for k, l in enumerate(langs)}
    # Rows are arrays to keep the file small:
    # [id, title, author, rating, numRatings, genreIdxs, year, pages, langIdx, series, cover, stars5to1]
    rows = [[b["i"], b["t"], b["a"], b["r"], b["n"], [gi[g] for g in b["g"] if g in gi],
             b["y"], b["p"], li.get(b["l"], -1), b["s"], b["c"], b["h"]] for b in books]
    out = {
        "meanRating": round(mean, 3),
        "coverPrefix": COVER_PREFIX,
        "genres": genres,
        "languages": langs,
        "books": rows,
    }
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(books)} books ({len(dropped)} duplicate editions dropped), {len(out['genres'])} genres, mean rating {mean:.3f}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
