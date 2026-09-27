---
title: "Step 1: Supplying, depositing collateral, borrowing"
description: Lina supplies USDG, Budi deposits his position NFT and borrows against it. None of the three actions carries a protocol fee.
sidebar_position: 2
---

## What happens

Lina puts USDG into the market. Budi hands over his liquidity position NFT and borrows USDG against it. It works like a pawn shop that lends out its lenders' money: the item stays in the shop's safe while the loan is open.

None of these three actions costs a protocol fee. You pay only network gas.

## T0: Lina supplies $100,000 USDG

The market is an [ERC-4626](https://eips.ethereum.org/EIPS/eip-4626) vault, so supplying is a standard `deposit`. USDG has 6 decimals.

```solidity
// deposit(uint256 assets, address receiver)
market.deposit(100_000e6, lina);
```

Lina receives `fUSDG-BC` share tokens. The number of tokens she holds will not change. Their exchange rate against USDG rises as interest comes in.

```text
Market state after T0

cash                 $100,000.00
total debt                 $0.00
reserve                    $0.00
lender funds         $100,000.00
```

**The protocol charges nothing here.** This is a deliberate choice. A fee at the door would penalize the very people the market needs to attract, and every extra fee adds attack surface without adding meaningful revenue.

## T1: Budi deposits his collateral

Budi signs one permit message. In a single transaction the NFT is approved and moved into the market's custody.

```solidity
market.depositCollateralWithPermit(tokenId, deadline, nonce, signature);
```

The signature is Uniswap's own permit for position NFTs. If Budi has already approved the market, he can call `depositCollateral(tokenId)` instead.

Before accepting the position, the contract runs every acceptance check:

- The pool is listed and not frozen.
- The pool belongs to this market's tier.
- Both tokens are enabled and the pair is quoted in USDG.
- The pool's hook is permitted.
- The position is not empty.
- The principal, after the pool's removal haircut, is worth at least the pool's minimum position value ($50). Unclaimed fees do not count toward this minimum, because they can be claimed a second later.

If any check fails, the transaction reverts and Budi keeps his NFT. See [collateral](../concepts/collateral.md) and [pool listing](../concepts/pool-listing.md) for the rules.

### What the position is worth

The `PositionValuer` contract reads the position at oracle prices:

```text
principal (value of the liquidity)      $20,000.00
unclaimed Uniswap fees                     $300.00
                                        ----------
position value                          $20,300.00
```

Unclaimed fees count as collateral, but only up to 10% of the principal:

```text
fee cap        = $20,000 × 10%          =  $2,000.00
fees counted   = min($300, $2,000)      =    $300.00
```

The $300 is well under the cap, so all of it counts. This pool has no removal haircut, so the collateral value equals the position value: $20,300. See [position valuation](../concepts/position-valuation.md) for the full formula.

The market state does not change at T1. No USDG moves. The market now owns the NFT and records it as Budi's collateral.

**The protocol charges nothing here.** There is no registration fee and no upfront deduction.

## T2: Budi borrows $12,000

```solidity
// borrow(uint256 tokenId, uint256 amount, address to)
market.borrow(tokenId, 12_000e6, budi);
```

### How much he can borrow

```text
maximum borrow = $20,300 × 65%          = $13,195.00
Budi takes                                $12,000.00
```

**Budi receives exactly $12,000.** Nothing is deducted upfront. Up to this moment the protocol has collected nothing. Charging only starts once time passes.

### How healthy the loan is

```text
LTV = $12,000 / $20,300                 = 59.1%
HF  = $20,300 × 75% / $12,000           = 1.269
```

A [health factor](../concepts/health-factor.md) of 1.269 is comfortably above 1. The position value would have to fall to $16,000 before the loan reaches `HF = 1` at this debt.

### What can block a borrow

The 65% limit is not the only gate. `borrow` reverts if any of the following is true.

| Condition | Error |
|---|---|
| The market is paused | `EnforcedPause` |
| The caller is not the depositor of the position | `BorrowerNotAuthorized` |
| The pool is frozen | `PoolNotOpenForBorrowing` |
| The new debt would exceed max LTV | `BorrowExceedsMaxLtv` |
| The position's total debt would be under the 10 USDG minimum | `BorrowBelowMinimum` |
| The pool's debt would exceed that pool's debt cap | `PoolDebtCapExceeded` |
| The market's debt would exceed the market cap (500,000 USDG) | `MarketDebtCapExceeded` |
| The pool's spot price is more than 2% away from the Chainlink price | `SpotPriceDeviation` |
| The USDG price is outside the range 0.97 to 1.03 | `UsdgPriceOutOfBounds` |
| A Chainlink feed is older than 25 hours | `StalePrice` |

A borrow also fails if the market does not hold enough idle cash to pay it out.

In this example every check passes. See [price oracles](../concepts/price-oracles.md) for the price gates and [errors](../reference/errors.md) for the full list.

:::info[Units]
Debt is recorded in USDG (6 decimals), while position values are in USD (18 decimals). The contract converts the debt to USD at the Chainlink USDG price before comparing the two. This example treats 1 USDG as $1.
:::

```text
Market state after T2

cash                  $88,000.00
total debt            $12,000.00
reserve                    $0.00
lender funds         $100,000.00
```

Lender funds stay at $100,000. The $12,000 has only moved from "idle" to "on loan".

**The protocol charges nothing here.**

## Summary of step 1

| Step | Action | Protocol fee |
|---|---|---|
| T0 | Lina supplies $100,000 USDG | None |
| T1 | Budi deposits a position worth $20,300 | None |
| T2 | Budi borrows $12,000, `HF = 1.269` | None |

## Related pages

- [Collateral](../concepts/collateral.md)
- [Position valuation](../concepts/position-valuation.md)
- [Health factor](../concepts/health-factor.md)
- [FarmentaMarket reference](../reference/farmenta-market.md)

Next: [Step 2: A year of interest and the reserve](./interest-and-reserves.md).
