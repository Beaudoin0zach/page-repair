# Test fixtures

`fixtures/synthetic-broken.html` is hand-crafted and committed. The
real-page fixtures are third-party HTML, so they are gitignored; regenerate
them with:

```sh
curl -sL https://news.ycombinator.com/ -o fixtures/hackernews.html
curl -sL https://sfbay.craigslist.org/ -o fixtures/craigslist.html
curl -sL https://en.wikipedia.org/wiki/Accessibility -o fixtures/wikipedia.html
```

Live pages drift, so audit counts will differ from the numbers in the
README's measured table — that table records the snapshot the prototype was
built against.

## Running

```sh
npm test               # unit tests (selector round-trip, headings, accname, apply/undo)
node test/latency.mjs        # audit timings across fixtures
node test/latency.mjs --llm  # + one live labeling call (needs ANTHROPIC_API_KEY)
```
