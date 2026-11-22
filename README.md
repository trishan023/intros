# intros

*a friend of a friend.* A spinnable globe of people friends recommend. Each pin sits at a city centre (never an exact address). Tap a pin to see a first name, photo, city, one-liner and who recommended them.

It's a static site with no build step. Everything, including three.js, the font and the avatars, is in this repo, so nothing loads from a CDN or DiceBear at runtime. The pages carry `noindex`, and `robots.txt` disallows everything.

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000/        (add ?card=priya to open a card)
```

You need a local server because the page fetches `people.json`. Opening `index.html` straight from disk won't work.

## People: add, edit or remove

All people live in **`people.json`**. Edit it on GitHub (pencil icon) or locally, then commit to `main`. GitHub Pages redeploys in a minute or two.

```json
{
  "id": "priya",
  "first_name": "Priya",
  "photo": "assets/avatars/priya.png",
  "city": "Mumbai",
  "lat": 19.076,
  "lng": 72.8777,
  "one_liner": "Knows every bookstore, and the best coffee next to it.",
  "recommended_by": "Ananya",
  "agreed": true
}
```

| Field | Notes |
|---|---|
| `id` | Short, unique and lowercase (used for `?card=<id>`). Optional; it defaults to the first name. |
| `first_name` | First name only. |
| `photo` | Path to an image in the repo, e.g. `assets/photos/name.jpg`. A square image of about 400×400 works best; it's shown as a circle. |
| `city` | City name as it should appear on the card. |
| `lat`, `lng` | The **city centre's** coordinates, never a home or work address. Look up "<city> coordinates" and use about 2–4 decimals. |
| `one_liner` | One short sentence. |
| `recommended_by` | The friend's first name. It shows as "Recommended by …". |
| `agreed` | `true` only once she has said yes to being listed. Anyone set to `false` (or without the field) is **not shown**. |

- **Add someone:** put their photo in `assets/photos/`, then copy an entry in `people.json`, change the fields and keep the commas between entries valid. Set `agreed` to `true` only after she's agreed.
- **Edit someone:** change the fields in place.
- **Remove someone:** delete their entry (and their photo file). To hide someone temporarily, set `agreed` to `false`.
- The pin-count pill updates itself from the people shown.
- Check the JSON before committing: `python3 -m json.tool people.json > /dev/null && echo ok`.

> The 8 people shipped here are **placeholders** (illustrated DiceBear "Lorelei" avatars, CC0). Remove them when the real people go in.

## Privacy notes

- GitHub Pages sites are **public to anyone with the link**, even when the repo is private. `noindex` and `robots.txt` only ask search engines not to list it.
- Photos and `people.json` are public files on the site, so only add people who have agreed.
- The `robots.txt` here sits under `/intros/`. Crawlers only read the domain-root `robots.txt`, so the `noindex` meta tag is what actually keeps the page out of search results.

## Credits

- [three.js](https://threejs.org) r16x: MIT, vendored in `vendor/three.min.js`.
- [Fredoka](https://fonts.google.com/specimen/Fredoka): SIL Open Font License 1.1.
- Avatars: [DiceBear](https://www.dicebear.com) "Lorelei" by Lisa Wischofsky, CC0 1.0.
- Globe texture generated from Natural Earth land data (public domain).
