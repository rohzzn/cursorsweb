# Cursors website

The landing page for [Cursors](https://github.com/rohzzn/cursors), one-click cursor packs for Windows. Visitors can
try nineteen real packs on the page itself: clicking a card puts that pack's arrow, link hand and text beam on the
whole page, animated ones included, and the choice is remembered in the browser until they take it off.

## Files

- `index.html`, `css/site.css`: the page
- `js/cursor.js`: wears a pack. Browsers can't play Windows `.ani` cursors, so animated packs are played by stepping a
  CSS custom property through their PNG frames at the timings the pack sets.
- `js/packs.js`, `cursors/`: the packs, written by the export below. Don't edit by hand.
- `tools/export_cursors.py`: converts `.cur` and `.ani` files to PNG frames with their hotspots and timings.

## Changing the packs

The list is `PACKS` at the top of `tools/export_cursors.py`. Bundled packs come from a checkout of the Cursors repo;
community sets are fetched from their rw-designer.com pages. Only use community sets whose authors released them
to the public domain or under an open license, and keep franchise characters out.

```bash
python tools/export_cursors.py ../cursors/packs .
```

Needs Python 3 with Pillow.

## Preview locally

```bash
python -m http.server 5180
```

Open http://localhost:5180. The page needs to be served, not opened as a file, for the cursors to load.

## Credits

Every pack belongs to its author; the page lists each one with its license and source. The bundled packs are
redistributed under their own licenses as listed in the Cursors repo's `packs/NOTICE.md`.
