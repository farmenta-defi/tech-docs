---
title: Health factor, LTV and liquidation threshold
description: How much you can borrow against a position, when a loan becomes liquidatable, and what moves your health factor.
sidebar_position: 4
---

## The idea

Imagine a loan against a house. The bank lends you at most 65% of the appraised value. If your debt ever exceeds 75% of the value, the bank may step in. The gap between 65% and 75% is your safety margin.

Farmenta works the same way, with a Uniswap v4 position in place of the house:

- **Max LTV** is the most you can borrow, as a share of the collateral value.
- **Liquidation threshold (LT)** is the point where the loan may be liquidated.
- **Health factor (HF)** squeezes the distance to that point into one number. Above 1 you are safe. Below 1 anyone may liquidate the position.

## A worked example

Budi deposits an ETH/USDG position with a collateral value of $20,300 into the Blue-chip market (max LTV 65%, LT 75%). He borrows 12,000 USDG, with USDG at $1.00.

```text
max borrow = $20,300 × 65%             = $13,195
LTV        = $12,000 / $20,300         = 59.1%
HF         = $20,300 × 75% / $12,000   = 1.269
```

Budi could borrow another 1,195 USDG. His loan becomes liquidatable if the collateral value falls below $16,000 (because $16,000 × 75% = $12,000), a drop of 21.2% from today.

## The formulas

```text
collateralValue = (principalUsd + min(feesUsd, principalUsd / 10)) × (1 − removalHaircut)

LTV = debtUsd / collateralValue

HF  = collateralValue × LT / debtUsd
```

- `collateralValue` is explained in [how positions are valued](./position-valuation.md).
- `debtUsd` is your USDG debt converted to USD with the USDG oracle price.
- Liquidation is possible when `HF < 1`.
- A position with no debt has no health factor to worry about. The lens returns the largest possible number for it.

### Tier parameters

| Parameter | Blue-chip | Meme |
|---|---|---|
| Max LTV at borrow | 65% | 30% |
| Liquidation threshold (LT) | 75% | 40% |
| Minimum debt | 10 USDG | 10 USDG |
| HF right after borrowing the maximum | 1.154 | 1.333 |

These are the loosest values a pool can have. A pool listing can be stricter, with a lower max LTV or a lower LT. See [pool listing](./pool-listing.md) and [risk parameters](../reference/risk-parameters.md).

## Your safety margin

Suppose you borrow exactly the maximum. How far can the collateral value fall before you can be liquidated?

```text
buffer = 1 − maxLTV / LT

Blue-chip: 1 − 65 / 75 = 13.33%
Meme:      1 − 30 / 40 = 25%
```

With Budi's position: borrowing the full $13,195 gives `HF = 1.154`. If the collateral value falls 13.33% to $17,593, then $17,593 × 75% = $13,195 and `HF = 1`.

The buffer is measured as a fall in collateral value. A liquidity position does not fall one to one with ETH: inside its range part of it is USDG. Below its range it is entirely the risk token and follows it fully.

:::warning[Borrowing the maximum leaves a thin margin]
Crypto prices can move 13.33% in a short time, and interest shrinks the margin every second. If you are liquidated you pay the liquidator bonus. If you cannot watch the position, borrow well below the maximum.
:::

## What moves your health factor

| Event | Effect on HF |
|---|---|
| Price of the risk token falls | Down |
| Price of the risk token rises | Up (no further once the position is entirely USDG) |
| Interest accrues on your debt | Down, slowly and constantly |
| You claim fees with `collectFees` | Down: counted fees leave the position |
| You remove liquidity with `decreaseLiquidity` | Down: principal leaves the position |
| You borrow more | Down |
| The owner lowers the pool's LT, at once or through a ramp | Down |
| The owner raises the pool's removal haircut | Down |
| You repay | Up |
| You add liquidity with `increaseLiquidity` | Usually up (it also claims your fees first) |
| The position earns fees | Up, until fees reach 10% of principal |

:::warning[The owner can change LT on existing loans]
A lower liquidation threshold applies immediately to loans that already exist. A healthy loan can become liquidatable without the borrower doing anything. See [admin powers](../risk/admin-powers.md).
:::

## Checked after your action, not forever

The market checks your position right after each action you take. It refuses the action if it would leave the position in a bad state.

| Your action | Condition that must hold afterwards |
|---|---|
| `borrow` | `debtUsd <= collateralValue × maxLTV` |
| `collectFees` | `HF >= 1` |
| `increaseLiquidity` | `HF >= 1` |
| `decreaseLiquidity` | `debtUsd <= collateralValue × min(maxLTV, LT)` |

`decreaseLiquidity` uses the stricter borrowing limit on purpose. Removing principal lowers the health factor exactly like borrowing. If `HF >= 1` were enough, you could borrow at max LTV and then remove liquidity until the loan sat right at the liquidation threshold.

This is a promise about your own actions only. The market never accepts a borrower action that leaves the position unhealthy. It does **not** promise that the health factor stays above 1 over time. Interest accrues and prices move, and either one can push `HF` below 1 with no action from you. That is exactly the situation liquidation exists for.

Example: Budi does nothing for a year while his debt grows 2.5% to 12,300 USDG.

```text
HF = $20,300 × 75% / $12,300 = 1.238
```

If the collateral value then falls to $16,000:

```text
HF = $16,000 × 75% / $12,300 = 0.976    (liquidatable)
```

## Debt is converted at the USDG oracle price

Debt is recorded in USDG. Collateral is valued in USD. Before comparing them, the market converts debt with the Chainlink USDG/USD price. It does not assume that 1 USDG is $1.00.

```text
debtUsd = debt × price(USDG) / 10^6
```

With USDG at $0.99, a debt of 12,000 USDG counts as $11,880. The USDG inside your position is valued at the same $0.99, so both sides of the ratio use one price.

If USDG leaves the range 0.97 to 1.03, borrowing and the other gated actions are blocked. Liquidation keeps running with the USDG price as reported. See [price oracles](./price-oracles.md).

## Two health factor readings

The lens contract offers two functions. They answer different questions.

| | `healthFactor(tokenId)` | `liquidationHealthFactor(tokenId)` |
|---|---|---|
| Prices | Borrowing prices | Liquidation prices |
| Debt | As of the last accrual | Projected with interest up to the current block |
| Use it for | Display, and deciding how much to borrow | Deciding whether a position can be liquidated now |

Both are scaled by `1e18`, so `1.269` is returned as `1269000000000000000`.

On the **Blue-chip market** both readings use the same Chainlink prices. They differ only by the interest accrued since the last accrual.

On the **Meme market** they can differ clearly, because the meme token is priced differently for each purpose:

| Situation | Borrowing price | Liquidation price |
|---|---|---|
| Spot above TWAP | TWAP | TWAP |
| Spot below TWAP by 25% or less | Spot | TWAP |
| Spot more than 25% below TWAP | Spot | Spot |
| Stale mode | Not available (the call reverts) | Spot × 0.8 |

So on the Meme market `healthFactor` can show a value below 1 while the position is not yet liquidatable, and in stale mode a position can be liquidatable while `healthFactor` cannot be read at all. Liquidators and keepers should always use `liquidationHealthFactor`.

## How to raise your health factor

- Repay part of the debt with `repay`.
- Add liquidity to the position with `increaseLiquidity`.

Repaying is never blocked. It works while the market is paused and while the pool is frozen.

Depositing a second position does not help the first one. Each position has its own loan and its own health factor.

## Related pages

- [How positions are valued](./position-valuation.md)
- [Price oracles and price gates](./price-oracles.md)
- [Interest rates](./interest-rates.md)
- [Managing a position while it is collateral](./managing-collateral.md)
- [Liquidation overview](../liquidations/overview.md)
- [MarketLens reference](../reference/market-lens.md)
- [Glossary](../resources/glossary.md)
