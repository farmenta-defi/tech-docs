# Farmenta · Documentation

The public documentation site for Farmenta, built with [Docusaurus](https://docusaurus.io/) 3.

## Develop

```bash
pnpm install
pnpm start        # http://localhost:3001
```

The dev server runs on port 3001 so that it does not collide with the Farmenta app on port 3000. Search is only available in a production build (`pnpm build && pnpm serve`).

## Build

```bash
pnpm build        # static site in build/
pnpm serve        # preview the build on http://localhost:3001
```

The build fails on any broken internal link, broken anchor or broken Markdown link.

## Configuration

Two values in `docusaurus.config.ts` can be set through the environment. Both have working defaults:

| Variable | Default | Meaning |
|---|---|---|
| `DOCS_URL` | `https://tech-docs-pearl.vercel.app` | Public address of this site |
| `FARMENTA_APP_URL` | `https://app-farmenta.vercel.app/` | Target of the "Launch App" button |

## Structure

- `docs/`: the pages. One folder per sidebar section, ordered by `_category_.json` and by each page's `sidebar_position`.
- `src/pages/index.tsx`: the landing page.
- `src/css/custom.css`: the theme.
- `static/img/`: logo and favicon.
- `WRITING_BRIEF.md`: the rules every page follows (language, vocabulary, number format, what must never appear).

## Design system

The site uses the same palette as the Farmenta app, sampled from the logo:

- **cold = identity**: brand, links, navigation, neutral callouts (`note`, `info`, `tip`)
- **warm = risk, and only risk**: `warning` and `danger` callouts, and the risk section card

Nothing neutral renders orange or red, and there is no green. The site is dark only. Type: Plus Jakarta Sans (headings), Inter (body), JetBrains Mono (code, addresses).

## After the contracts are deployed

1. Fill the "Farmenta contracts" table in `docs/reference/addresses.md`.
2. Remove the "Contracts are not deployed yet" note in `docs/intro.md`.
3. Set `DOCS_URL`.
