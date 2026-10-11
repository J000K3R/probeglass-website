# probeglass-website

The landing page for [ProbeGlass](https://github.com/j000k3r/probeglass) —
a small, self-hosted watchdog for your homelab.

It is published at **https://j000k3r.github.io/probeglass-website/**.

## What this repository is, and is not

Three repositories make up the project, and they have three different jobs:

| Repository | Holds | Published at |
|---|---|---|
| [`probeglass`](https://github.com/j000k3r/probeglass) | The program itself | `ghcr.io/j000k3r/probeglass` |
| [`probeglass-docs`](https://github.com/j000k3r/probeglass-docs) | Reference documentation, built with Docusaurus | `/probeglass-docs/` |
| **`probeglass-website`** (this one) | The landing page: what it is, what it does, how to install it | `/probeglass-website/` |

The split is deliberate. The website answers *"should I run this?"* and the
documentation answers *"how do I do X?"*. Putting both in one place produces a
front page that is neither.

## No build step

`site/` contains finished HTML, CSS and SVG. Nothing is compiled, bundled or
minified, and the deploy job only uploads the directory. Three consequences
worth stating plainly:

- **Nothing to install.** No Node, no npm, no lockfile. Editing
  `site/index.html` and reloading the browser is the whole development loop.
- **Nothing to break.** A green CI badge cannot turn into a red one because a
  dependency published a new major version.
- **Nothing to attack.** No build step means no build-time supply chain, and
  the page loads no third-party script, font or stylesheet. It works on a LAN
  with no internet access, which is the same promise the product makes.

The one JavaScript file, `site/assets/site.js`, is about sixty lines and adds a
menu toggle and copy buttons. With it blocked or broken, the page still reads
completely and every command is still selectable by hand.

## Layout

```
site/
  index.html            the page
  roadmap.html          what is built, what is next, what is not
  demo.html             a redirect to demo/, for links made before it existed
  demo/                 the clickable demo — generated, see below
  assets/style.css      the whole stylesheet
  assets/site.js        menu toggle + copy buttons, ~60 lines
  img/*.svg             illustrations, generated
.github/workflows/
  deploy.yml            uploads site/ to GitHub Pages
  demo.yml              fails when the demo is no longer the current dashboard
```

## The roadmap

`site/roadmap.html` is a page of its own rather than a section on the front
page, because it answers a different question from the rest of the site: not
*should I run this* but *where is it going, and will it still be here*. It has
its own `<head>` and the same `.topbar` and `.footer` as the front page; the
navigation carries its links back as `index.html#features` and the like, because
the front page's in-page anchors mean nothing on a different page.

Its content mirrors the roadmap in the documentation, which mirrors
`docs/ROADMAP.md` in the program's repository. That is the source of truth:
when it changes, this page changes with it, by hand, like everything else here.

## The demo

`site/demo/` is the dashboard itself, running in the browser on example data,
reached from the navigation and from the tour section. It is not a lookalike and
not a rebuild: `site/demo/assets/` is `internal/web/assets` out of the program,
copied byte for byte, and `site/demo/index.html` is that dashboard's own page
with its five absolute paths made relative. The map, the wall, the widgets, the
search box, the guided tour and the language switch are all there because they
are the same code.

Two generated files make it work with no server behind it. `fixtures.js` is every
answer the interface asked for, recorded from the real handler. `shim.js`
replaces `fetch` and `EventSource` so those answers are handed back, which is all
the dashboard needs — it uses no other network API. Settings changed in the demo
are applied in memory and are gone on reload, which is what the bar above the
page promises, and nothing is written to `localStorage`.

None of that directory is edited by hand. It is written by `cmd/demogen` in the
program's repository, which is expected to sit beside this one:

```bash
cd ../probeglass
make demo          # regenerate site/demo/
make demo-check    # is the published one still what this tree would write?
```

`site/demo/fingerprint.txt` is what the demo is made of: the dashboard's files,
the shim and the bar, and the *shape* of every recorded answer — the values left
out, because a week of invented history ends at whatever moment it was recorded
and a checksum over those would change on every run. The **Demo** workflow runs
the same check on every push, so a dashboard change that is not followed by
`make demo` fails the build instead of quietly shipping yesterday's interface.

`site/demo.html` is a redirect to `site/demo/`, kept for the links that pointed
at the old address.

## The illustrations

`site/img/dashboard.svg`, `detail.svg` and `alerts.svg` are **drawings, not
screenshots**, and the page says so in the captions. They are laid out from the
real dashboard markup and use its real palette and its real labels, so that they
stay honest — but a drawing cannot go stale the way a screenshot does, and it
stays crisp at any size.

They were generated by a script rather than hand-written, because each one holds
a couple of dozen aligned elements and hand-editing those is exactly how they
drift apart. That script is deliberately *not* checked in — a generator wired
into the repository is a build step in disguise, and this repository does not
have one. The SVGs are ordinary, editable text; change them directly.

## Adding real screenshots

Illustrations are the right default here, but a real screenshot is better
evidence. If you want to add one:

1. Put it in `site/img/`, ideally at 2× the display size.
2. Replace the matching `<img>` in `site/index.html`.
3. Update the `<figcaption>`, because it currently says the image is a drawing
   and leaving that line in would make the page lie.

## Deploying

Push to `main`. The workflow does the rest.

**One-time setup:** *Settings → Pages → Source* must be set to **GitHub
Actions**. Until it is, `configure-pages` finds no Pages site to configure and
the run fails there, having published nothing. A private repository cannot have
Pages at all on a free account, so that is what to expect for as long as this
one is private; the workflow itself needs no change when it goes public.

Alternatively, with no workflow at all: *Settings → Pages → Source: Deploy from
a branch → `main` / `/site`*. That is the same no-build site served directly.

## Local preview

There is nothing to build. Opening `site/index.html` directly in a browser works
— every reference is a relative path, so the stylesheet and the images resolve
next to it.

Serving the directory is closer to how it is actually delivered, and is worth it
when checking anything involving fetch, cookies or caching:

```bash
cd site && python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## License

MIT — see [LICENSE](LICENSE).
