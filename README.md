# Loupe — a floating, screen-reading coding tutor

Loupe captures your screen, tags the things it can see, and explains whichever
one you pick — in plain language, like a quick coding lesson. Pop it out and
it floats over any window on your desktop, the same way a video call's
picture-in-picture window does.

1. **Capture** the screen (one click).
2. Loupe **tags 4–7 things** it noticed on it.
3. **Pick a tag** (or just type a question) and get a short, clear explainer.
4. Keep asking follow-ups, or capture again for a new screen.

---

## Requirements

- **Node.js 18 or newer** — check with `node -v`. Get it from
  [nodejs.org](https://nodejs.org) if you don't have it.
- **Google Chrome or Microsoft Edge on desktop.** Loupe uses two real browser
  APIs — `getDisplayMedia` (screen capture) and the Document Picture-in-Picture
  API (the floating window) — that currently only exist in Chromium-based
  desktop browsers. It will still run in other browsers, just without
  screen capture or the pop-out window.
- **A Google Gemini API key.** Get one at
  [aistudio.google.com/apikey](https://aistudio.google.com/apikey). It should
  start with `AIzaSy...` — that's how you know it's a proper API key and not
  some other kind of Google credential.

## Run it

```bash
# 1. Install dependencies
npm install

# 2. Start the dev server
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`) in Chrome or Edge.

On first load, paste your Gemini API key into the box on the left, pick a
model (Gemini 3.6 Flash by default, Gemini 2.5 Flash as an alternative), and
hit **Save**. The key is stored only in your browser's local storage and sent
straight from your machine to Google's Gemini API — nothing else touches it.
That also means: don't deploy this as-is to a public website, since anyone
visiting it would be using your key. It's built for running locally on your
own machine.

> **If you've ever pasted an API key into a chat, email, or any other place
> outside of your own `.env` file or password manager, treat it as
> compromised and regenerate it** at
> [aistudio.google.com/apikey](https://aistudio.google.com/apikey) before
> using it here. Keys are meant to stay between you and the provider's
> console.

## Using it

- Click **Capture screen** — your browser will ask which screen, window, or
  tab to share. Pick whichever one you want Loupe to look at.
- Loupe reads it and offers a handful of tagged things it noticed.
- Click a tag to get an explainer, or type your own question in the box at
  the bottom (you can also add extra context there before picking a tag).
- Click the **pop-out icon** (top right of the panel) to float Loupe over
  your desktop — drag or resize the floating window like any other. Click
  the dock icon inside it, or just close the floating window, to bring it
  back into the page.
- The **circular arrow icon** clears the current screenshot and conversation
  so you can start fresh.

## Building for production

```bash
npm run build
npm run preview   # serve the production build locally to check it
```

This outputs a static site in `dist/`. Remember the API key caveat above if
you ever host the built output somewhere others can reach — swap the direct
browser call in `src/App.jsx` (`callGemini`) for a small backend proxy that
holds the key server-side instead.

## Project structure

```
loupe-app/
├── index.html          # entry HTML, loads Tailwind via CDN
├── package.json
├── vite.config.js
├── MOTIVE.md            # why this app exists — read before adding features
├── src/
│   ├── main.jsx         # React root
│   └── App.jsx          # Loupe itself — capture, tagging, chat, PiP logic
└── README.md
```

## About the model list

The dropdown includes every Gemini model, but only some of them actually work
for this app's capture → tag → explain flow — the ones that take image + text
input and return text:

**Use these:** Gemini 3.6 Flash, Gemini 3.5 Flash, Gemini 3.5 Flash Lite,
Gemini 3.1 Pro, Gemini 3.1 Flash Lite, Gemini 3 Flash, Gemini 2.5 Flash,
Gemini 2.5 Flash Lite.

**Listed but won't work here** (different endpoint or modality — picking one
of these will error instead of explaining anything): Gemini Omni Flash
(video generation), the TTS models (speech output), the Embedding models
(vectors, not text answers), and the Robotics-ER models (built for
controlling robots, not screen tutoring). They're in the dropdown because
they were asked for, each labelled with why it doesn't fit.

## Project notes

See `MOTIVE.md` for why this app exists and the design decisions behind it —
worth a read before adding features, so anything new still serves the same
loop: capture → tag → pick → explain.

## Troubleshooting

- **"Pop-out isn't supported in this browser"** — use Chrome or Edge on
  desktop; the Document Picture-in-Picture API isn't available elsewhere yet.
- **"Screen capture isn't available here"** — same requirement; also make
  sure you're running over `http://localhost` or `https://`, not a plain
  file path.
- **Nothing happens after clicking Capture screen** — check you picked a
  screen/window in the browser's share picker rather than cancelling it.
- **API errors** — double-check the key was saved (the header in the left
  panel should say "Gemini API key added"), that it starts with `AIzaSy...`,
  and that it's active in your Google AI Studio console.
- **"That doesn't look like a Gemini API key"** — you likely pasted an OAuth
  token or some other credential instead. Generate a proper API key at
  [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
