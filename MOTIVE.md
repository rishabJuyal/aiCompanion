# Why Loupe exists

Keep this file around. When the code grows, or a new feature seems tempting,
read this first and check it still fits.

## The problem

Learning to code means constantly running into things you don't recognize —
a panel in an IDE, an error message, a bit of unfamiliar syntax, an icon in
someone else's screen-share. The normal fix is: alt-tab away, open ChatGPT,
describe what you're looking at in words, wait for an answer, alt-tab back.
That context switch is the whole cost. By the time you've explained the
problem in text, you've often half-forgotten why you were confused.

## The idea

Don't switch windows — point at the thing directly.

Loupe captures the screen, looks at it, and tells you what's on it in plain
language: a short list of things worth explaining. You pick one (or type
your own question), and it teaches you that one thing — briefly, clearly,
with a tiny example if it helps. Then it floats there, on top of whatever
you're doing, the same way a video call's picture-in-picture window does, so
asking "what's that?" never costs you your place.

## Who it's for

Someone learning to code who wants an answer *about the screen in front of
them*, right now, without narrating it first.

## What "done" looks like for a session

capture → tag → pick → explain → (optionally) ask a follow-up → done.

That loop is the whole product. Everything in this app should serve that
loop directly.

## Design decisions worth remembering

- **Picture-in-Picture is the point, not a bonus feature.** The floating
  window is what makes this different from "just open a chatbot." If a
  future change makes the panel harder to pop out or keep on top, that's a
  regression even if the change seems unrelated.
- **One screenshot, multiple explanations.** Tags stay clickable after the
  first explanation, so one capture can answer several questions before a
  retake is needed. Don't collapse this back into a single Q&A.
- **The screenshot is the shared context**, not a one-off attachment. Once
  captured, it stays in the conversation history sent to the model, so
  follow-up questions ("what about the second one?") still make sense
  without re-sending the image every time.
- **No dead ends.** If tagging fails, or the model call errors, the person
  can still type what they want explained by hand. The tool should never
  block someone just because the automatic part didn't work.
- **Runs from a local key, on a local machine.** This was built to run on
  someone's own computer with their own API key — not to be deployed
  publicly with that key exposed client-side. If it ever needs to go public,
  the model calls belong behind a small backend proxy instead (noted in
  README.md).

## What this is *not*

- Not a general-purpose chatbot — every conversation starts from something
  visible on the screen.
- Not a screen recorder or monitoring tool — it captures a single frame on
  request, never continuously, and nothing is stored beyond the current
  session.
- Not trying to replace reading docs or actually writing code — it's for
  the "wait, what is that" moment in between.
