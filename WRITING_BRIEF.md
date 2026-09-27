# Writing brief for the Farmenta documentation site

Rules every page on this site follows. Readers are DeFi users (lenders and
borrowers), liquidators and keeper operators, and developers who integrate with the
contracts. Every page must stand on its own.

## Hard rules

1. **English only.** Write the way good protocol documentation reads.
2. **The contract code is the truth.** Function names, signatures, events, errors
   and constants are copied from the Solidity source, never from memory or notes.
   Where a description and the code disagree, the code wins.
3. **No internal references.** A published page never contains ticket ids, pull
   request numbers, commit hashes, branch names, version tags of internal notes,
   section references to internal notes, dates of internal decisions, names of team
   members, bytecode sizes, test names, or the story of how a rule was decided.
   State only how the protocol works now.
4. **No links to internal material.** Allowed external links:
   - the public code repositories (`smart-contract`, `indexer`, `frontend`)
   - the block explorer, `https://robinhoodchain.blockscout.com/address/<address>`
   - third party documentation home pages (Uniswap v4, Chainlink, Robinhood Chain,
     Morpho, EIP-4626)
5. **No em dashes and no en dashes used as punctuation.** Use a comma, a colon,
   parentheses, or a new sentence. Ranges are written "0.97 to 1.03".
6. **Addresses are printed in full**, inside backticks, with an explorer link.
   Never shorten an address and never reconstruct one from a shortened form.
   Farmenta's own addresses are printed only on `docs/reference/addresses.md`.
7. **Number format is English**: `$100,000.00`, `1.269`, `0.5%`.
8. **Describe what exists.** Planned features are not documented. A risk page may
   say what is not protected today.

## Style

- Plain language first. Open each page with one or two sentences a newcomer can
  follow, where possible with a small everyday analogy, then one small example with
  real numbers, then the precise rules. Tables and code come after the explanation,
  not instead of it.
- Second person ("you") for actions a reader takes. Present tense.
- Short paragraphs. Sentence case headings. Start the body at `##`: the page title
  comes from front matter.
- Define a term the first time it appears on a page, or link to the glossary.
- Formulas go in fenced `text` code blocks. No LaTeX.
- Solidity signatures go in `solidity` blocks.
- Diagrams use Mermaid. Keep them small, with plain labels and no custom colours:
  the site theme colours them.
- Pages are parsed as MDX. In running text, comparisons and braces must be inside
  backticks: write `HF < 1`, never a bare less-than sign.
- Callouts: `:::info`, `:::note` and `:::tip` are for neutral content.
  `:::warning` and `:::danger` are reserved for risk content only (loss of funds,
  liquidation, owner powers). A title goes in square brackets:

  ```
  :::warning[Title here]
  Text.
  :::
  ```
- Every page starts with front matter:

  ```
  ---
  title: Page title
  description: One sentence, under 160 characters.
  sidebar_position: 1
  ---
  ```
- Internal links are relative file links with the `.md` extension, for example
  `[health factor](../concepts/health-factor.md)`. End most pages with a short
  "Related pages" list.

## Vocabulary

| Term | Use |
|---|---|
| collateral | The position NFT held by the market |
| lender, borrower, liquidator | The three user roles |
| owner | The admin account |
| market | Blue-chip market, Meme market |
| cash | Idle USDG in the market |
| lender funds (`totalAssets`) | Cash plus total borrows minus reserves |
| share token | `fUSDG-BC`, `fUSDG-MEME` |
| reserve floor | The part of the reserve the owner cannot withdraw |
| seizure, full seizure, liquidity slice | What a liquidation takes |
| removal haircut | `removeHaircutBps` |
| stale mode | The TWAP is unavailable |
| price gate | A price check that can block an action |
| socialized to lenders | How uncovered bad debt is shared |

Worked example cast: **Lina** (lender), **Budi** (borrower), **Rina** (liquidator).

## Before publishing

1. `pnpm build` must pass. It fails on broken links, anchors and Markdown links.
2. Search the pages for ticket ids, pull request numbers, internal version tags,
   dashes used as punctuation, and numbers in a non-English format.
3. Check every printed address against the explorer.
