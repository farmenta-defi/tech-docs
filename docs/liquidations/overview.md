---
title: Liquidations overview
description: What liquidation is, when a loan becomes liquidatable, what a liquidator pays and receives, and what the borrower keeps.
sidebar_position: 1
---

## Liquidation in one minute

A pawnbroker who lends against a watch does not wait until the watch is worth less than the loan. Once the safety margin gets too thin, part of the collateral is sold to bring the loan back to safety. Farmenta does the same, except that the collateral is a Uniswap v4 liquidity position and the party who steps in is any third party, called a liquidator.

A quick example: Budi owes 12,300 USDG against a position that is now worth $16,000, and his health factor has dropped to 0.976. Rina, a liquidator, repays 6,150 USDG of his debt and receives $6,457.50 worth of ETH and USDG taken out of his position. Budi keeps the rest of the position, owes half as much as before, and his health factor is back at 1.164.

The full calculation is in the [worked example](#worked-example) below.

## Why liquidation exists

Every USDG a borrower takes out belongs to the lenders of that market. If the collateral were allowed to fall below the debt, the loan could no longer be repaid in full and lenders would carry the loss.

Liquidation protects lenders by repaying debt while the collateral is still worth more than the debt. The bonus paid to the liquidator is the incentive that makes someone show up quickly.

## When a loan becomes liquidatable

A loan can be liquidated when its [health factor](../concepts/health-factor.md) (HF) is below 1:

```text
HF = collateralValue × LT / debtUsd
```

`LT` is the liquidation threshold of the pool: 75% on the Blue-chip market and 40% on the Meme market, or lower if the pool was listed with stricter terms.

Three things push a health factor down:

- The price of the non-USDG token falls, so the position is worth less.
- Interest accrues every second, so the debt grows.
- The owner lowers the liquidation threshold of the pool. See [pool listing](../concepts/pool-listing.md).

**Being out of range is not a trigger.** A position whose price has left its range stops earning fees, but it still holds tokens with a value. Below the range it holds only the risk token, so its value follows that token's price. Above the range it holds only USDG. In both cases the only question the contract asks is whether `HF < 1`.

The check is always made with debt that includes interest up to the current block, and with the liquidation price path of the [price oracle](../concepts/price-oracles.md). The price gates that can block new borrowing (USDG trading outside 0.97 to 1.03, or a pool price more than 2% away from the oracle) do not apply to liquidation, so they can never make an unhealthy loan impossible to clear.

## Who can liquidate

Anyone. `liquidate` has no allowlist and no priority for any party. The first valid transaction wins.

There is no auction. A liquidity position can be valued on-chain and cut into slices directly, so the liquidator receives tokens at a fixed bonus in the same transaction instead of bidding over time.

## What the liquidator pays and receives

The liquidator **pays USDG**:

```text
paid = repay + protocol liquidation fee
protocol liquidation fee = repay × (liquidator bonus / 10)
```

The repay amount reduces the borrower's debt. The protocol liquidation fee goes to the [reserves](../concepts/protocol-fees-and-reserves.md) of the market.

The liquidator **receives token0 and token1** of the pool, worth:

```text
seized value = repay × (1 + liquidator bonus)
```

A position NFT cannot be split. The market therefore removes a slice of liquidity from the position and hands the resulting tokens to the liquidator. The NFT itself stays in the market's custody, still recorded under the borrower, with less liquidity in it.

Because the protocol fee is one tenth of the bonus, the liquidator always keeps nine tenths of it: 4.5% of the repay amount on a pool with a 5% bonus, 9% on a pool with a 10% bonus.

## Close factor

The close factor is the largest share of a debt that one liquidation may repay.

| Market | Close factor |
|---|---|
| Blue-chip | 50% of the debt. 100% if `HF < 0.9` or the debt is below 100 USDG |
| Meme | 100% of the debt, always |

The 50% limit leaves a borrower with a position to recover with. It is lifted when the loan is already far under water or too small to be worth liquidating twice. Meme positions move fastest, so they can always be closed in one step.

## Worked example

Budi borrowed against an ETH/USDG position on the Blue-chip market. After a sharp fall in the ETH price, his position is valued as follows. The example assumes USDG is priced at exactly $1.00 and the pool has no removal haircut.

```text
principal                        $15,700.00
unclaimed fees                      $300.00
position value                   $16,000.00
debt                             $12,300.00

HF = $16,000 × 75% / $12,300     = 0.976      (below 1, liquidatable)
```

The health factor is still above 0.9 and the debt is above 100 USDG, so the close factor is 50%. Rina may repay at most half of the debt.

```text
repay            = $12,300 × 50%            =  $6,150.00
seized value     = $6,150 × (1 + 5%)        =  $6,457.50
protocol fee     = $6,150 × 0.5%            =     $30.75

Rina pays        = $6,150.00 + $30.75       =  $6,180.75
Rina receives (ETH + USDG)                  =  $6,457.50
Rina's net profit = $6,457.50 − $6,180.75   =    $276.75
```

Rina's profit is 4.5% of the amount she repaid, which is 90% of the 5% bonus.

The seized value is taken from unclaimed fees first, then from liquidity:

```text
fees given to Rina          = min($300, $6,457.50)     = $300.00
principal given to Rina     = $6,457.50 − $300.00      = $6,157.50
liquidity removed           = $6,157.50 / $15,700      = 39.22% of the position
```

After the liquidation:

```text
Budi's debt       = $12,300 − $6,150         =  $6,150.00
Budi's position   = $15,700 − $6,157.50      =  $9,542.50   (no unclaimed fees left)
HF                = $9,542.50 × 75% / $6,150 =  1.164       (healthy again)
reserves            + $30.75
```

The same scenario, with the steps before and after it, is told in the [liquidation chapter of the worked example](../worked-example/liquidation.md).

## What the borrower keeps

After a **partial liquidation** the borrower keeps:

- the position NFT, still held by the market as collateral, with the remaining liquidity
- the remaining debt, which keeps accruing interest
- every right they had before: repay, add liquidity, and withdraw the NFT once the debt is zero

Unclaimed fees are used first. If the position holds more fees than the liquidator is entitled to, the extra fees repay the remaining debt, and anything left after the debt is fully repaid is returned to the borrower. The details are in [liquidation mechanics](./mechanics.md).

If the position is worth less than `repay × (1 + bonus)` for the repay amount offered, the liquidator takes the **whole position** and the NFT is burned. The borrower loses the position but does not owe the uncovered remainder. That remainder is [bad debt](../concepts/bad-debt.md): it is absorbed by the market's reserves first and socialized to the lenders of that market if reserves are not enough.

:::warning[Liquidation costs the borrower the bonus]
A liquidation takes more collateral than the debt it clears. In the example above Budi gives up $6,457.50 of his position to clear $6,150.00 of debt, a loss of $307.50. On the Meme market the bonus is at least 10% and the whole debt can be closed in one transaction. Repaying or adding liquidity before the health factor reaches 1 is always cheaper than being liquidated.
:::

## Blue-chip and Meme parameters

| Parameter | Blue-chip | Meme |
|---|---|---|
| Liquidation threshold (LT) | 75% | 40% |
| Liquidator bonus | 5% | 10% |
| Protocol liquidation fee (bonus / 10, paid in USDG) | 0.5% of repay | 1% of repay |
| Liquidator net margin | 4.5% of repay | 9% of repay |
| Close factor | 50%; 100% if `HF < 0.9` or debt `< 100 USDG` | 100% |
| Price of the non-USDG token at liquidation | Chainlink | 30 minute TWAP; pool spot price if it is more than 25% below the TWAP; spot price minus 20% if the TWAP is unavailable |
| Auction | None | None |

These values are presets and also the loosest values allowed. A pool can only be listed with stricter terms: a lower LT or a higher bonus. The protocol fee is derived from the bonus at the moment of liquidation, so a pool listed with a 7% bonus pays a 0.7% protocol fee and leaves the liquidator 6.3%. All presets are listed in the [risk parameters reference](../reference/risk-parameters.md).

## Related pages

- [Liquidation mechanics](./mechanics.md): the exact rules, rounding and execution order
- [Guide for liquidators and keepers](./liquidator-guide.md): how to find and execute liquidations
- [Health factor](../concepts/health-factor.md)
- [Position valuation](../concepts/position-valuation.md)
- [Bad debt](../concepts/bad-debt.md)
- [Glossary](../resources/glossary.md)
