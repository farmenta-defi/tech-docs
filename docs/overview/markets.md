---
title: Markets
description: Farmenta has two isolated markets, Blue-chip and Meme, each with its own lenders, risk parameters and price source.
sidebar_position: 2
---

Farmenta has two markets. Each market holds its own USDG, with its own lenders, its own borrowers and its own rules. They share nothing, so a loss in one cannot reach the other.

Think of two separate safes in the same building. The building and the staff are the same, but the money in one safe is never used to cover a shortfall in the other.

| | Blue-chip market | Meme market |
|---|---|---|
| Collateral accepted | Positions in ETH/USDG and WETH/USDG pools | Positions in meme token/USDG pools |
| Asset lent | USDG | USDG |
| Lender share token | `fUSDG-BC` | `fUSDG-MEME` |
| Price source for the risk token | Chainlink | On-chain 30 minute TWAP |
| Risk level | Lower | Higher |

## Why two markets

An ETH position and a meme token position carry very different risk. A meme token can lose most of its value in minutes, and its price is easier to manipulate. If both kinds of collateral drew on the same USDG, lenders who only wanted ETH exposure would also carry meme token risk.

With two markets, each lender chooses the risk they accept. Lenders in the Meme market earn a higher rate for the same utilization and carry the higher risk. Lenders in the Blue-chip market do not.

## Parameters side by side

The numbers below are the presets of each market. They are also the loosest values the contract allows. A single pool can be listed with stricter values, never looser ones.

| Parameter | Blue-chip | Meme |
|---|---|---|
| Maximum loan to value when borrowing | 65% | 30% |
| Liquidation threshold | 75% | 40% |
| Liquidator bonus | 5% | 10% |
| Protocol liquidation fee | 0.5% of the repaid amount | 1% of the repaid amount |
| Close factor | 50%, or 100% if the health factor is below 0.9 or the debt is below 100 USDG | 100% |
| Debt cap per pool, at most | 500,000 USDG | 20,000 USDG |
| Debt cap for the whole market | 500,000 USDG | 50,000 USDG |
| Minimum debt | 10 USDG | 10 USDG |
| Minimum position value | $50 | $50 |
| Share of interest kept as reserve | 15% | 25% |
| Reserve floor | 1% of lender funds | 2.5% of lender funds |

A quick way to read this table: with a position worth $10,000 you can borrow up to $6,500 in the Blue-chip market and up to $3,000 in the Meme market. The loan becomes liquidatable when the debt rises above 75% of the position's value in Blue-chip and above 40% in Meme.

The full list, including the interest curves and oracle settings, is on the [risk parameters](../reference/risk-parameters.md) page.

## What decides the market of a position

Each token has a tier, set when the token is enabled. A pool takes the riskier tier of its two tokens. A market only accepts positions from pools of its own tier, so the Blue-chip market rejects a meme pool and the Meme market rejects an ETH pool.

Every accepted pair is quoted in USDG. Pairs between two risk tokens are not accepted.

## How prices differ between the markets

In the **Blue-chip market**, ETH and USDG are priced by Chainlink. The pool's own price is only used as a cross check: a borrow is rejected if the pool price is more than 2% away from the Chainlink price.

In the **Meme market**, there is no Chainlink feed for the meme token. The price comes from a time weighted average of the pool price over the last 30 minutes, recorded on-chain. Borrowing uses the lower of the current pool price and that average. See [price oracles and price gates](../concepts/price-oracles.md).

:::warning[The Meme market carries more risk]
Prices of meme tokens can be moved more easily than the price of ETH, and a meme token can lose nearly all of its value. Meme pools are not listed with real funds until a guard against single transaction price manipulation is in place. Read [oracle, market and chain risks](../risk/oracle-and-market-risks.md) before you supply to or borrow from this market.
:::

## Isolation in practice

- USDG supplied to one market is never lent to borrowers of the other.
- Each market has its own reserve. A reserve only absorbs bad debt from its own market.
- Bad debt that the reserve cannot cover lowers the share price of that market's lenders only.
- A pause applies to one market at a time.

## Related pages

- [How it works](./how-it-works.md)
- [Collateral: Uniswap v4 positions](../concepts/collateral.md)
- [Bad debt and loss absorption](../concepts/bad-debt.md)
- [Risk parameters](../reference/risk-parameters.md)
