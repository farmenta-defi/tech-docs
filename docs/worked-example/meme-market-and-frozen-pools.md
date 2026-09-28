---
title: "Variations: the Meme market and frozen pools"
description: How the same loan would look in the stricter Meme market, and what happens to a borrower when the owner freezes a pool or lowers its LT.
sidebar_position: 7
---

## What this page covers

The main example ran in the Blue-chip market with a pool in good standing. This page changes two things, one at a time.

First, the same ideas in the **Meme market**, where prices are less reliable and every limit is tighter. Second, what happens when the owner **freezes a pool or lowers its liquidation threshold** while Budi's loan is open.

## The Meme market

The Meme market accepts positions in meme token/USDG pools. Chainlink has no feeds for these tokens, so the meme side is priced from the pool itself through the on-chain `TwapRecorder`, which keeps a 30 minute time-weighted average price (TWAP).

A pool price can be pushed around, so the rules always pick the more cautious reading.

| Situation | Price used for the meme side |
|---|---|
| Borrowing | `min(spot, TWAP)`: the lower of the pool's current price and the 30 minute TWAP |
| Liquidation, normal case | The TWAP |
| Liquidation, real crash | The spot price, but only when spot is more than 25% below the TWAP |
| TWAP unavailable (stale mode) | Liquidation uses `spot × 80%`. A borrow records a fresh observation first, so it is refused only while the pool has less than 30 minutes of recorded history |

The TWAP is unavailable when the newest observation is older than 900 seconds, or when the pool has less than 30 minutes of recorded history.

Deposits of collateral, `borrow`, `collectFees`, `increaseLiquidity` and `decreaseLiquidity` on a meme pool record a TWAP observation first. `liquidate` records last, so the health check reads the recorder as it stands. `repay`, `withdrawCollateral` and the vault functions do not record. See [price oracles](../concepts/price-oracles.md) and the [TwapRecorder reference](../reference/twap-recorder.md).

### Parameters side by side

| Parameter | Blue-chip | Meme |
|---|---|---|
| Max LTV (limit at borrow) | 65% | 30% |
| LT (liquidation threshold) | 75% | 40% |
| Liquidator bonus | 5% | 10% |
| Protocol liquidation fee | 0.5% of repay | **1%** of repay (10% of the bonus) |
| Net liquidator profit | 4.5% | 9% |
| Close factor | 50%; 100% if `HF < 0.9` or debt `< 100 USDG` | Always 100% |
| Reserve factor | 15% | 25% |
| Reserve floor | 1% of lender funds | 2.5% of lender funds |
| Interest curve (kink, slope1, slope2) | 80%, 4%, 60% | 70%, 8%, 100% |
| Debt cap per pool (maximum, set by the owner per pool) | 500,000 USDG | 20,000 USDG |
| Debt cap for the whole market | 500,000 USDG | 50,000 USDG |

These values are presets and also the loosest terms allowed. A pool listing may only be stricter.

### The same position in the Meme market

Take a position worth $20,300, as Budi's was at T1, but in a meme token/USDG pool.

```text
maximum borrow       = $20,300 × 30%            = $6,090.00    (Blue-chip: $13,195.00)
```

Suppose the borrower takes $6,000 and the position value later falls to $14,000. Interest is left out to keep the numbers short.

```text
HF                   = $14,000 × 40% / $6,000   = 0.933        below 1, can be liquidated
close factor                                    = 100%         always, in this market

liquidator repays                               = $6,000.00
value seized         = $6,000 × (1 + 10%)       = $6,600.00
protocol fee         = $6,000 × 1%              =    $60.00    goes to the reserve
liquidator pays      = $6,000 × 1.01            = $6,060.00
liquidator's profit  = $6,600.00 - $6,060.00    =   $540.00    9% of the amount repaid
```

The borrower gets much less credit for the same collateral, and one liquidation closes the entire debt.

### Markets are fully isolated

The two markets are separate contracts with separate cash, debt, reserves and share tokens (`fUSDG-BC` and `fUSDG-MEME`). Bad debt in the Meme market never touches lenders of the Blue-chip market, and the reverse is also true. See [markets](../overview/markets.md).

## When a pool is frozen or its LT is lowered

The owner can freeze Budi's ETH/USDG pool with `setFrozen`, and can lower its liquidation threshold either in one step with `updateTerms` or gradually with a scheduled LT ramp (`scheduleLtRamp`). These tools exist so the protocol can step away from a pool that has gone bad. Each of these calls waits two days in the owner's queue before it runs. The freeze alone can also come from the guardian, at once, with `freeze`.

### What stops and what continues

| Stops in a frozen pool | Continues in a frozen pool |
|---|---|
| New collateral: `depositCollateral`, `depositCollateralWithPermit`, `mintAndDeposit` | Interest accrual |
| `borrow` | `repay` |
| `increaseLiquidity` | `collectFees` and `decreaseLiquidity` |
| | `withdrawCollateral` once the debt is repaid |
| | `liquidate` |

Freezing never traps collateral and never switches off liquidation. Doing either would create the bad debt that freezing is meant to avoid.

### The example: LT drops from 75% to 60%

Go back to the end of T3. Budi's position is still worth $20,300 and his debt has grown to $12,300. At the normal threshold he is healthy:

```text
HF at LT 75% = $20,300 × 75% / $12,300          = 1.238
```

Now the pool is frozen and the owner lowers its LT to 60%. The new LT was scheduled two days earlier. When that call runs, the new threshold applies to existing loans:

```text
HF at LT 60% = $20,300 × 60% / $12,300          = 0.990     below 1, can be liquidated
```

Nothing about Budi's position changed. The price did not move and he took no action. Only the rule changed.

:::warning[A change of terms can make a healthy loan liquidatable]
Lowering LT applies to loans that already exist. If Budi does not act during the two days the change waits in the owner's queue, he becomes liquidatable and pays the liquidator's bonus without any move in price. There is no lower bound on how far the owner can tighten a pool. See [admin powers](../risk/admin-powers.md).
:::

### What protects the borrower

One thing: visibility. Every change of terms waits two days in the owner's queue, where anyone can read it. When the change is made through an LT ramp, the schedule is stored on-chain as well. The threshold falls in a straight line from its current value to the target between the start time and the end time, and anyone can read it.

```solidity
// The liquidation threshold in force right now, resolved through any ramp
policy.effectiveLt(poolId);

// The full listing record, including ltStartBps, ltTargetBps, rampStart, rampDuration
policy.listingOf(poolId);
```

So Budi can see when his position will cross `HF = 1` and repay part of his debt before that moment. A direct `updateTerms` has no ramp: its only notice is the two days in the owner's queue.

Two further rules limit the damage:

- LT can be lowered to or below max LTV only while the pool is frozen. An open pool always keeps room between the two, so no new loan is handed out already liquidatable. In the example, 60% is under the 65% max LTV, which is why the pool had to be frozen first.
- A ramp can only go down. It starts from the threshold in force at that moment, so a second ramp cannot raise the LT again.

If you borrow against a pool, watch the timelock's `CallScheduled` event for calls to the policy, and the pool's `PoolFrozen`, `PoolTermsUpdated` and `LtRampScheduled` events. See [pool listing](../concepts/pool-listing.md) for the listing lifecycle and the [CollateralPolicy reference](../reference/collateral-policy.md).

## Notes on rounding and simplification

These notes apply to the whole worked example.

- **Interest.** The example uses simple interest over one year. The contract accrues by the second and adds interest to the debt each time the market is touched, so real results are slightly higher.
- **Utilization.** Utilization is held at 50% for the year. In practice it changes each time someone borrows, repays, supplies or withdraws, and the borrow rate moves with it.
- **Protocol liquidation fee.** Dividing the bonus by ten rounds down, so any rounding difference always falls in the liquidator's favor.
- **Prices in the Blue-chip market.** Every dollar value comes from Chainlink prices, not from the pool price. The pool is only used to check that its price has not drifted more than 2% from the oracle before a borrow is allowed. The Meme market is different: the pool price feeds the valuation through the TWAP and `min(spot, TWAP)`.
- **USDG.** The example treats 1 USDG as $1. The contract values debt at the Chainlink USDG price.
- **Cents.** Amounts are rounded to cents and are illustrative.

## Related pages

- [Markets](../overview/markets.md)
- [Pool listing](../concepts/pool-listing.md)
- [Price oracles](../concepts/price-oracles.md)
- [Admin powers](../risk/admin-powers.md)
- [Risk parameters](../reference/risk-parameters.md)

Back to the start: [Worked example overview](./index.md).
