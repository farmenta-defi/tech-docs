---
title: How positions are valued
description: Farmenta values a Uniswap v4 position at oracle prices, counts unclaimed fees up to a cap, and always rounds down.
sidebar_position: 2
---

## The short version

A liquidity position is a basket of two tokens plus some unclaimed fees. Farmenta works out how many of each token the basket holds, multiplies by the oracle price of each token, and adds the result up in US dollars.

The important detail is which price decides the contents of the basket. Farmenta uses the **oracle price**, not the price currently showing in the pool. It is like an appraiser who values a house from the official land registry instead of the price tag the seller just hung on the door.

## A small example

Budi holds an ETH/USDG position. The oracle says ETH is $2,500 and USDG is $1.00. At that price, his range and liquidity work out to 4 ETH and 10,000 USDG. The position has also earned 0.04 ETH and 200 USDG in fees that he has not claimed.

```text
principal  = 4 ETH × $2,500 + 10,000 USDG × $1.00     = $20,000
fees       = 0.04 ETH × $2,500 + 200 USDG × $1.00     =    $300
fee cap    = 10% of principal                         =  $2,000
fees counted = min($300, $2,000)                      =    $300

collateral value = ($20,000 + $300) × (1 − 0%)        = $20,300
```

The pool has no removal haircut in this example, so nothing is deducted at the end.

## The formula

```text
principalUsd = amount0 × price0 / 10^decimals0
             + amount1 × price1 / 10^decimals1

feesUsd      = fees0 × price0 / 10^decimals0
             + fees1 × price1 / 10^decimals1

collateralValue = (principalUsd + min(feesUsd, principalUsd / 10))
                  × (1 − removalHaircut)
```

| Term | Meaning |
|---|---|
| `amount0`, `amount1` | Token amounts the position's liquidity holds at the oracle derived price |
| `fees0`, `fees1` | Swap fees earned and not yet claimed, in raw token units |
| `price0`, `price1` | USD price of one whole token from the [price oracle](./price-oracles.md), 18 decimals |
| `decimals0`, `decimals1` | Token decimals recorded when the token was listed |
| `removalHaircut` | The pool's `removeHaircutBps`: the share a hook takes when liquidity is removed. Zero for pools whose hook takes nothing. |

`collateralValue` is the number used for your borrowing limit and for your [health factor](./health-factor.md). The lens contract exposes it as `positionValue(tokenId)`.

## Why the oracle price and not the pool price

The token amounts inside a concentrated liquidity position depend on the price. If Farmenta read the amounts at the pool's current price (the spot price), anyone could push the pool with a large swap, change what the position appears to hold, borrow against the distorted value, and then let the pool snap back.

So the valuer does this:

1. Read the USD price of both tokens from the oracle.
2. Turn the two prices into the price ratio the pool would have if it agreed with the oracle. This is the oracle derived price.
3. Compute the token amounts the position holds at that price.
4. Value those amounts, and the unclaimed fees, in USD.

Moving the pool price does not change the token amounts used in the valuation.

The pool's spot price is still read, for one purpose only: to measure how far it has drifted from the oracle.

```text
spotDeviationBps = |spotPrice − oraclePrice| × 10,000 / oraclePrice
```

The deviation is compared on price, not on the square root of price. The valuer reports it, and the market uses it as a gate: on the Blue-chip market you cannot borrow while the pool is more than 2% away from the oracle. See [price oracles and price gates](./price-oracles.md).

:::note[Meme market]
On the Meme market the oracle price of the meme token is itself built from the pool: a 30 minute average (TWAP) and the spot price. The valuation method is the same, only the price source differs.
:::

## The three range cases

A position only holds both tokens while the price is inside its range. The valuer compares the oracle derived price with the two ends of the range.

| Oracle derived price | The position holds | In an ETH/USDG pool |
|---|---|---|
| At or below the lower end | 100% `currency0` | All ETH |
| Inside the range | A mix, split at the price | ETH and USDG |
| At or above the upper end | 100% `currency1` | All USDG |

In an ETH/USDG pool, native ETH is always `currency0`. In other pools the order depends on the token addresses, so USDG can be either side.

## Principal and fees

**Principal** is the value of the liquidity itself. **Fees** are swap fees the position has earned and you have not claimed yet.

Uniswap v4 does not store a "fees owed" balance. Fees exist only as the difference between the pool's fee growth inside the range and the value saved on the position. The valuer computes them from that difference.

### The 10% cap

Unclaimed fees count as collateral, but only up to 10% of principal. The cap applies to both your borrowing limit and your health factor.

| Principal | Unclaimed fees | Fees counted | Collateral value (no haircut) |
|---|---|---|---|
| $20,000 | $300 | $300 | $20,300 |
| $20,000 | $2,000 | $2,000 | $22,000 |
| $20,000 | $2,600 | $2,000 | $22,000 |

The cap exists because fee balances are easier to inflate than liquidity, above all in a thin pool. Limiting them to a tenth of principal limits what an inflated fee balance can add to borrowing power. Fees above the cap are still yours: you can claim them with `collectFees`.

The valuer itself reports fees uncapped. The cap is a risk rule, so the market applies it.

:::info[Liquidation uses the full fee balance]
When a position is liquidated, the health check uses the capped collateral value shown here. The amount a liquidator may seize is measured against what the position really contains: principal plus all fees, after the removal haircut. See [liquidation mechanics](../liquidations/mechanics.md).
:::

## Rounding and precision

- **Rounding is always down.** A position must never be valued above what it can return, because that value backs a loan.
- **USD values have 18 decimals.** $20,300 is stored as `20300 × 10^18`.
- **Token decimals are recorded at listing** and never read live from the token. USDG has 6 decimals, ETH and WETH have 18. A token that could change the decimals it reports could otherwise change the value of every position.
- **Debt is in USDG with 6 decimals.** It is converted to USD with the USDG oracle price before it is compared with a position value.

## Why tiny positions are not accepted

Every pool has a minimum position value of at least $5. There are two reasons.

1. **Precision.** When one side of a position is only a few of the smallest token units, rounding dominates and the position cannot be valued precisely.
2. **Liquidations.** A liquidator is paid a share of the debt they repay, so a position has to be large enough for that share to be worth a transaction.

The minimum is measured on principal after the removal haircut, with fees excluded:

```text
principalUsd × (1 − removalHaircut) >= minPositionUsd
```

Fees are left out because they can be claimed right after the deposit. A position that only clears the minimum thanks to its fees would fall below it one transaction later.

The same floor applies to what remains after you remove liquidity. See [managing a position while it is collateral](./managing-collateral.md).

## Reading a valuation

`PositionValuer` is a stateless contract with no owner and no risk parameters. It exposes:

```solidity
function value(uint256 tokenId) external view returns (Valuation memory);
function valueForLiquidation(uint256 tokenId) external view returns (Valuation memory);
function feesOf(uint256 tokenId) external view returns (uint256 fees0, uint256 fees1);
```

`value` uses borrowing prices, `valueForLiquidation` uses liquidation prices, and `feesOf` returns the unclaimed fees in raw token units without reading any price. Details are in the [PositionValuer reference](../reference/position-valuer.md).

## Related pages

- [Price oracles and price gates](./price-oracles.md)
- [Health factor, LTV and liquidation threshold](./health-factor.md)
- [Collateral: Uniswap v4 positions](./collateral.md)
- [Risk parameters](../reference/risk-parameters.md)
