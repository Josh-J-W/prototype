# EtymoTree

A static prototype that reads **one** Wiktionary page and draws its etymology as a small
graph: oldest form at the top, the searched word at the bottom, and the morphemes a form
was built from sitting *above* the form they make.

## Running it

It is plain HTML/CSS/JS with no build step, but it must be served over http — a `file://`
page cannot call the Wikimedia API.

```
cd etymotree
python3 -m http.server 8000
# open http://localhost:8000
```

Deploying to GitHub Pages: push the folder as-is.

Parser tests (node, no network): `node tests/parser.test.js`

## The three layers

| Layer | Files | Responsibility |
|---|---|---|
| Fetching | `js/api.js` | Builds the single `action=parse&prop=wikitext&origin=*` URL, returns the response or a structured error. Nothing else. |
| Parsing | `js/wikitext.js`, `js/sections.js`, `js/parser.js`, `js/layout.js` | Wikitext → nodes, edges, diagnostics → rows. No DOM, no network. |
| Display | `js/render.js`, `js/app.js`, `css/styles.css` | Draws a normalized graph. Contains no Wiktionary template knowledge. |

`js/fallback.js` is hardcoded demonstration data for *father*, kept deliberately outside the
parser. It is only offered behind a button, only when the parser finds no relationships at
all, and everything it produces is flagged `fallback: true`.

## Data model

```js
{
  entry: { term, language, languageName, nodeId, etymologyId },
  nodes: [{ id, term, displayTerm, language, languageName, languageKnown,
            reconstructed, uncertain, role, gloss, sources }],
  edges: [{ from, to, relationship, subtype, uncertain, inferredFrom, note, sources }],
  diagnostics: [...], unparsed: [...]
}
```

Edges run **older → newer**, so `from` is always the thing that came first.
`relationship` is one of `inherited`, `borrowed`, `derived`, `component`, `related`;
finer distinctions (calque, learned borrowing, doublet, cognate, surface analysis,
compound vs. suffix) live in `subtype` so the five core types stay stable.

`related` edges — doublets, cognates, surface analyses, and anything the parser could not
attach — are excluded from the vertical tree by `layout.js` and listed separately under it.

## What the live wikitext actually looks like, and what changed

The brief's examples use the colon/angle-bracket etymon syntax
(`{{etymon|en|:inh|enm:fader<id:father>|id=male parent}}`). The current
[Template:etymon documentation](https://en.wiktionary.org/wiki/Template:etymon) and the
2024 vote that introduced trees both show a different spelling: keywords as bare positional
arguments and etymons written `lang>term>id`, e.g.
`{{etymon|en|id=male parent|inh|enm>fader>father}}`.

Rather than pick one, `parseEtymon()` accepts both:

* keywords with or without a leading colon (`:inh` and `inh`);
* etymons as `lang:term`, `lang>term>id`, `lang>term`, `term>id`, or a bare term
  (language then assumed from `|1=`, as documented, and flagged in the notes);
* `<id:…>`, `<unc>`, `<t:…>` modifiers wherever they appear.

Two further things the real data forced:

1. **The chain is in the prose, not in `{{etymon}}`.** The etymon template on *father*
   encodes a single step (father ← Middle English *fader*); the rest of the lineage lives in
   the sentence `from {{inh|en|ang|fæder}}, from {{inh|en|gmw-pro|*fader}}, …`. So the parser
   reads the prose *between* templates: a run of derivation templates is chained only when the
   connective contains a from-word, and `possibly`/`perhaps` marks the edge and node uncertain,
   `compare`/`cognate with`/`akin to` breaks the chain. Every such edge records the exact
   connective in `inferredFrom`, so nothing is joined up invisibly.
2. **`{{etymon|1=}}` is not always the entry's language.** An etymon block written for
   `ine-pro` anchors to the Proto-Indo-European node in the graph (matched by `|title=` or by
   language), never to the English headword. If no node of that language is present, its
   etymons are kept as unattached nodes and the situation is reported — the parser will not
   guess that PIE roots are direct components of an English word.

Components from `{{af}}`/`{{compound}}`/`{{suffix}}` attach to the most recent lineage node in
the affix template's own language, which is what puts `*peh₂-` and `*-tḗr` above `*ph₂tḗr`
rather than below it. `{{surf}}` is treated as a synchronic analysis, not a historical
component. `{{root}}`, `{{etydate}}`, references and inflection templates are skipped with a
note. Anything else is listed verbatim under "Wikitext the parser could not turn into graph
data".

## Verification status

`tests/parser.test.js` runs the parser and the layout over fixtures in the shapes described
above (prose chain + affix + doublet + cognate, both etymon syntaxes, an unanchorable etymon,
a compound headword, multiple etymologies, and six error cases) and asserts the resulting
nodes, edges, flags and row positions.

The sandbox this was written in has no outbound network access, so the parser has **not** yet
been run against a live API response. That is the first thing to do: open the app, search
*father*, and compare the Raw wikitext tab with the Parsed graph tab. If a template shows up
under "could not turn into graph data", its name and raw text are printed there and can be
added to the tables at the top of `js/parser.js`.

## Not done yet, on purpose

No ancestor lookups, no second API call, no backend, no HTML scraping, no invented
relationships, no ranking of etymologies.
