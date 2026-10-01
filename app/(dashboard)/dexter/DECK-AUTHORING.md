# Making a Dexter deck that remembers answers

Dexter shows your HTML to a client at a private link. If your page has questions in it, Dexter saves what the client types and fills it back in next time they open the link. Five rules make that work.

**1. Build a normal web page.** One `index.html`, or a zip with `index.html` at the top and your CSS, images and fonts beside it, linked with relative paths (`assets/style.css`, never `/assets/…` or `C:\…`). Under 4 MB in all. Fonts and libraries from a CDN are fine.

**2. Add one line just before `</body>`:**

```html
<script src=".dexter.js"></script>
```

Yes, with the dot. It is a reserved name Dexter serves beside your file, so it can never clash with anything of yours. A page inside a folder (`pages/two.html`) uses the same line. Nothing to download — the file appears when the deck is opened through its link. Opened from your own disk, the page simply does not save; everything else works.

**3. Give every answer a `name`.** Any `<input>`, `<textarea>` or `<select>` with a `name` is saved; anything without one is not. Names must be unique across every page of the deck, and staff see them as labels, so make them readable: `name="preferred_move_in"`, not `name="q7"`. Works: text, email, number, date, range, checkbox, radio, textarea, select (single or multiple). A group of checkboxes sharing a `name` is saved as the list of ticked ones.

**4. Saving is automatic.** The client types; a moment later it is saved. Optionally give them a Send moment: a normal `<form>` with a `<button type="submit">Send</button>` and **no `action`** — pressing it marks the answers as sent (staff see "Sent"). You can show the state with CSS: Dexter sets `data-dexter="saving"`, `"saved"` or `"error"` on `<html>`, and `data-dexter-sent` once sent:

```css
html[data-dexter="saved"] .status::after {
  content: "Saved";
}
html[data-dexter-sent] .send-button {
  display: none;
}
```

**5. Don't use the browser's own memory.** `localStorage`, `sessionStorage`, cookies and `document.domain` are blocked inside Dexter — the page runs in a sandbox, by design. Everything you want kept goes through rule 3.

**Limits:** 200 named fields, 10,000 characters per text answer, 64 KB of answers in all. **Test:** open the link Goodearth gives you, type something, reload — it must come back. **Changing the page later:** Goodearth replaces the file at the same link; answers stay as long as the names do.

## A complete example

Save this as `index.html` and upload it as it is.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>A few questions</title>
    <style>
      body {
        font-family: sans-serif;
        max-width: 32rem;
        margin: 2rem auto;
        padding: 0 1rem;
      }
      label {
        display: block;
        margin-top: 1rem;
      }
      html[data-dexter="saved"] .status::after {
        content: "Saved";
      }
      html[data-dexter-sent] .send-button {
        display: none;
      }
    </style>
  </head>
  <body>
    <h1>A few questions</h1>
    <form>
      <label>Your name <input type="text" name="full_name" /></label>
      <label>Anything we should know? <textarea name="notes" rows="3"></textarea></label>
      <p>
        Do you want a balcony?
        <label><input type="radio" name="wants_balcony" value="yes" /> Yes</label>
        <label><input type="radio" name="wants_balcony" value="no" /> No</label>
      </p>
      <p>
        Rooms you need
        <label><input type="checkbox" name="rooms" value="study" /> Study</label>
        <label><input type="checkbox" name="rooms" value="guest" /> Guest room</label>
        <label><input type="checkbox" name="rooms" value="pooja" /> Pooja room</label>
      </p>
      <label
        >Preferred move-in
        <select name="preferred_move_in">
          <option value="">Choose…</option>
          <option value="this_year">This year</option>
          <option value="next_year">Next year</option>
        </select>
      </label>
      <p class="status"></p>
      <button type="submit" class="send-button">Send</button>
    </form>
    <script src=".dexter.js"></script>
  </body>
</html>
```
