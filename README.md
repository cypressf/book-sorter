# Book Sorter

A small, framework-free website for searching and filtering Goodreads books and sorting them by a Bayesian weighted rating, with a Letterboxd-style star histogram for every book.

**Live site:** https://cypressf.github.io/book-sorter/

## Features

- Search by title, author or series
- Filter by genres (include all / exclude any), minimum average rating, minimum number of ratings, publication year, page count, language, and standalone vs. series
- Sort by weighted rating, average rating, number of ratings, year or length
- Tap a book's histogram to see its full 1–5 star breakdown
- Links to each book on Goodreads and a StoryGraph search
- Filters live in the URL, so any view can be bookmarked or shared

## Weighted rating

`score = (n·r + m·C) / (n + m)`, where `r` is the book's average, `n` its number of ratings, `C` the average across all books, and `m` the "weighting strength" chosen on the page (default 1,000). Books with few ratings get pulled toward `C`; heavily rated books keep their real average.

## Data

~45,000 books from the Goodreads "Best Books Ever" list, scraped in 2020:
Lorena Casanova Lozano & Sergio Costa Planells (2020), *Best Books Ever Dataset*, Zenodo, [doi:10.5281/zenodo.4265096](https://doi.org/10.5281/zenodo.4265096), licensed CC BY-NC 4.0. Ratings reflect that snapshot.

StoryGraph has no public API or dataset, so StoryGraph ratings aren't included.

`books.json` is generated with:

```sh
python3 scripts/build_data.py books_1.Best_Books_Ever.csv books.json
```

## Files

- `index.html`, `style.css`, `app.js` — the whole site, plain HTML/CSS/JS
- `books.json` — the compact data file
- `scripts/build_data.py` — rebuilds `books.json` from the dataset CSV

Not affiliated with Goodreads or StoryGraph.
