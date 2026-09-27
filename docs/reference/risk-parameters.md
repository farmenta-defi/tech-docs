---
title: Risk parameters
description: Every risk parameter of the Blue-chip and Meme markets, with units, plain-language meanings, and the values a pool listing can tighten.
sidebar_position: 12
---

Risk parameters are the numbers that decide how much you can borrow against a position, when a loan can be liquidated, and what a liquidator earns. They work like the terms a pawnshop posts on its wall: how much it lends against an item, and the point at which it may sell that item to recover the loan.

A small example. Budi deposits an ETH/USDG position worth $1,000 into the Blue-chip market, in a pool listed at the preset values. The max LTV of 65% lets him borrow up to 650 USDG. The liquidation threshold of 75% means his loan can be liquidated once his debt is worth more than 75% of his collateral. If he borrows the full 650 USDG, that point is reached when the collateral value falls below $866.67, a drop of 13.33% (ignoring interest, with USDG at $1.00).

The rest of this page lists every parameter, its unit, and who can change it.

## Presets and pool listings

Each market belongs to one tier: Blue-chip or Meme. Each tier has a preset, and a preset is two things at once:

- the default values for the tier, and
- the loosest values the contracts accept.

Every pool is listed one by one by the owner (the admin account), and each listing carries its own numbers. `CollateralPolicy` rejects a listing value that is looser than the preset with the error `LooserThanPreset`. "Stricter" points in a different direction for each parameter:

| Parameter | A listing may only be |
|---|---|
| Max LTV | equal to or lower than the preset |
| Liquidation threshold (LT) | equal to or lower than the preset |
| Liquidator bonus | equal to or higher than the preset |
| Pool debt cap | equal to or smaller than the preset |
| Minimum position value | equal to or higher than the preset |
| Removal haircut | between 0% and the 20% ceiling |

Parameters fall into three groups:

| Group | Parameters | Who sets them |
|---|---|---|
| Per pool | Max LTV, LT, liquidator bonus, removal haircut, pool debt cap, minimum position value | The owner, in each pool listing, inside the preset bounds |
| Per tier (one value per market) | Close factor, reserve factor, reserve floor, interest curve, market debt cap, price check at borrow | Fixed in the contracts, not adjustable per pool |
| Shared by both markets | Minimum debt, fee cap, removal haircut ceiling, oracle parameters | Fixed in the contracts, not adjustable per pool |

The values in the second and third groups have no setter function. They change only through a contract upgrade, which has to wait out a two day timelock. See [admin powers](../risk/admin-powers.md).

:::info[Live values are read on-chain]
This page shows the presets. The terms that apply to a given pool are stored in its listing and can be stricter than the tables below.

- `CollateralPolicy.termsOf(poolId)` returns the terms in force right now, with the LT already resolved through any active LT ramp.
- `CollateralPolicy.listingOf(poolId)` returns the raw listing record, including the frozen flag and the ramp schedule.

See the [CollateralPolicy reference](./collateral-policy.md).
:::

## Per pool parameters

The Blue-chip and Meme columns show the preset, which is also the loosest value a listing can use.

| Parameter | Field | Blue-chip | Meme | Meaning |
|---|---|---|---|---|
| Max LTV at borrow | `maxLtvBps` | 65% (6,500 bps) | 30% (3,000 bps) | The largest debt you can take, as a share of your collateral value. A borrow that would push your loan above it reverts. |
| Liquidation threshold (LT) | `ltBps` | 75% (7,500 bps) | 40% (4,000 bps) | The share of collateral value that counts when the health factor is computed. When debt grows past it, `HF < 1` and the loan can be liquidated. |
| Liquidator bonus | `liquidatorBonusBps` | 5% (500 bps) | 10% (1,000 bps) | The extra collateral value a liquidator receives on top of the debt they repay. It is the gross bonus, before the protocol liquidation fee. |
| Removal haircut | `removeHaircutBps` | 0% to 20% | 0% to 20% | The share of value that the pool's hook takes when liquidity is removed. Collateral value is reduced by it. It is 0 for a pool whose hook takes nothing. |
| Pool debt cap | `debtCapUsdg` | 500,000 USDG | 20,000 USDG | The most debt that all loans backed by this pool can owe together. |
| Minimum position value | `minPositionUsd` | $50 | $50 | The smallest position the market accepts as collateral. |

Rules that apply to these values:

- **Borrowing room.** While a pool accepts new positions, its max LTV must be above zero and strictly below its LT. A frozen pool takes no new positions or borrows, so its LT may be lowered to the max LTV or below. That is how an [LT ramp](../concepts/pool-listing.md) winds a pool down.
- **Removal haircut.** A haircut above zero is accepted only for a pool whose hook has the permission to return a delta when liquidity is removed. A hook that would take more than 20% is treated as unsuitable collateral, not as a reason for a larger discount. Raising the haircut of a pool that is already listed requires the pool to be frozen first.
- **Minimum position value.** It is measured on the principal alone, after the removal haircut. Unclaimed fees do not count, because they can be claimed a moment later. The check runs when a position is deposited and when liquidity is removed from it.
- **Pool debt cap.** It is stored as an absolute USDG amount and compared with the pool's debt in USDG, so no price is needed.

:::warning[New terms apply to existing loans]
The owner can tighten a pool's terms at any time, and the new terms take effect immediately for loans that already exist. A lower LT can make a healthy loan liquidatable. See [admin powers](../risk/admin-powers.md).
:::

## Per tier parameters

These values belong to the market. Every pool in the market shares them.

| Parameter | Blue-chip | Meme | Meaning |
|---|---|---|---|
| Close factor | 50%. It becomes 100% if `HF < 0.9` or debt `< 100 USDG` | 100% | The largest share of a loan's debt that one liquidation may repay. |
| Reserve factor | 15% (1,500 bps) | 25% (2,500 bps) | The share of borrower interest that goes to the protocol reserves. The rest goes to lenders. |
| Reserve floor | 1% of `totalAssets` (100 bps) | 2.5% of `totalAssets` (250 bps) | The amount of reserves the owner cannot withdraw. Only reserves above the floor can leave the market. |
| Interest curve: kink | 80% | 70% | The utilization at which the borrow rate starts to climb steeply. |
| Interest curve: slope 1 | 4% per year | 8% per year | The borrow rate reached at the kink. |
| Interest curve: slope 2 | 60% per year | 100% per year | The extra borrow rate added between the kink and 100% utilization. |
| Market debt cap | 500,000 USDG | 50,000 USDG | The most debt the whole market can owe. It is compared with `totalBorrows`. |
| Price check at borrow | Pool spot price within 2% of the Chainlink price | Meme token valued at `min(spot, TWAP)` | The protection against borrowing at a manipulated price. |

Notes:

- **Close factor.** The 100 in the Blue-chip rule is 100 USDG of debt, not $100. The health factor used for this rule is the one computed with liquidation prices. Details are in [liquidation mechanics](../liquidations/mechanics.md).
- **Reserve floor.** The floor does not add funds. It keeps part of the reserves that have already accumulated inside the market, where they absorb bad debt before lenders do. See [protocol fees and reserves](../concepts/protocol-fees-and-reserves.md).
- **Two debt caps.** A borrow must fit under both the pool debt cap and the market debt cap.

### Interest curve

The borrow rate depends only on utilization, the share of the market's USDG (cash plus outstanding debt) that is currently borrowed.

```text
if utilization <= kink:
    borrowRate = slope1 × utilization / kink
else:
    borrowRate = slope1 + slope2 × (utilization - kink) / (1 - kink)
```

| Utilization | Blue-chip borrow rate | Meme borrow rate |
|---|---|---|
| 0% | 0% | 0% |
| Half of the kink (40% and 35%) | 2% | 4% |
| At the kink (80% and 70%) | 4% | 8% |
| 100% | 64% | 108% |

Rates are annual. The contract divides the annual rate by 31,536,000 (the seconds in 365 days) and applies it per second. See [interest rates](../concepts/interest-rates.md) and the [InterestRateModel reference](./interest-rate-model.md).

## Parameters shared by both markets

| Parameter | Value | Meaning |
|---|---|---|
| Minimum debt | 10 USDG | A borrow must leave the position with at least 10 USDG of total debt. Smaller loans are not worth liquidating. |
| Fee cap | 10% of principal value | Unclaimed fees count as collateral only up to one tenth of the principal value. |
| Removal haircut ceiling | 20% (2,000 bps) | The largest removal haircut a listing can record. |

## Protocol liquidation fee

The protocol liquidation fee is not stored anywhere. It is derived from the pool's liquidator bonus at the moment of liquidation:

```text
protocolLiqFeeBps = liquidatorBonusBps / 10        (integer division, rounded down)
protocolFee       = repay × protocolLiqFeeBps / 10,000
```

The liquidator pays the fee in USDG on top of the repaid amount, and it is credited to the market's reserves.

| | Blue-chip preset | Meme preset |
|---|---|---|
| Liquidator bonus | 5% | 10% |
| Protocol liquidation fee | 0.5% of repay | 1% of repay |
| Liquidator net margin | 4.5% of repay | 9% of repay |

Because the fee follows the bonus, a pool listed with a higher bonus pays a higher protocol fee automatically. Rounding down always favors the liquidator: a bonus of 555 bps gives a fee of 55 bps.

For example, Rina repays 1,000 USDG on a Blue-chip pool at the preset values, with USDG at $1.00. She receives collateral worth $1,050 and pays a 5 USDG protocol fee. Her margin is $45, or 4.5% of the repaid amount, before gas and swap costs.

## Oracle parameters

These values are the same in both markets. Chainlink prices ETH, WETH and USDG. Meme tokens are priced by the on-chain `TwapRecorder`, in USDG, and then converted with the Chainlink USDG price. See [price oracles](../concepts/price-oracles.md).

| Parameter | Value | Meaning |
|---|---|---|
| Chainlink staleness limit | 25 hours | A Chainlink price older than this is refused, and the call that needs it reverts with `StalePrice`. The ETH/USD feed has a 24 hour heartbeat, so the limit leaves one hour of slack. |
| USDG price bounds | 0.97 to 1.03 USD | Outside this range, borrowing is blocked, and so is any action that takes value out of a position that has debt. Inside the range, USDG is valued at its feed price. It is never assumed to be exactly $1. |
| Spot deviation gate (Blue-chip) | 2% (200 bps) | If the pool's spot price is more than 2% away from the Chainlink price, borrowing against positions in that pool is blocked, and so is any action that takes value out of a position that has debt. Liquidations are not blocked: they keep using the Chainlink price. |
| TWAP window | 1,800 s (30 minutes) | The period over which the time-weighted average price of a meme token is computed. |
| TWAP staleness limit | 900 s (15 minutes) | If the newest observation of a pool is older than this, the TWAP is unavailable and the pool is in stale mode. |
| Crash threshold | 25% (2,500 bps) | In a liquidation, a meme token is valued at the TWAP. If the spot price is more than 25% below the TWAP, the spot price is used instead, because the average is lagging behind a real crash. |
| Stale haircut | 20% (2,000 bps) | In stale mode, liquidations value the meme token at the spot price minus 20%. A borrow records a fresh observation first, so it ends stale mode by itself when the pool has at least 30 minutes of recorded history. Borrowing is blocked only while the pool has less than 30 minutes of history. |
| Observation capacity | 2,048 per pool | The number of price observations the recorder keeps for each pool. The recorder writes at most one observation per second, so the buffer always covers the 30 minute window. |

For a pool that already has 30 minutes of recorded history, stale mode ends as soon as anyone calls `TwapRecorder.record` for the pool, which is a permissionless function. Every market action on a meme pool except `liquidate` makes this call itself before it reads the price. The USDG bounds and the spot deviation gate apply to borrowing and to actions that take value out of a position that has debt. They never stop a liquidation. See the [TwapRecorder reference](./twap-recorder.md) and [oracle and market risks](../risk/oracle-and-market-risks.md).

## Units

| Quantity | Unit | Example |
|---|---|---|
| Percentages in listings and events | Basis points (bps). 10,000 bps is 100% | `6500` is 65% |
| USDG amounts (debt, caps, reserves, `repay`) | USDG with 6 decimals | `500000000000` is 500,000 USDG |
| USD values (prices, position value, `minPositionUsd`) | USD scaled by 1e18 | `50000000000000000000` is $50 |
| Health factor | Scaled by 1e18 | `1000000000000000000` is an HF of 1 |
| Utilization and interest rates | Scaled by 1e18 | `800000000000000000` is 80% |
| Tier | Enum | `0` is none, `1` is Blue-chip, `2` is Meme |

The pool debt cap and the minimum position value sit next to each other in a listing but use different units. `debtCapUsdg` is USDG with 6 decimals. `minPositionUsd` is USD scaled by 1e18.

## Derived figures

These numbers are not stored. They follow from the presets.

```text
collateralValue = (principalUsd + min(feesUsd, principalUsd / 10)) × (1 - removalHaircut)
HF              = collateralValue × LT / debtUsd
LTV             = debtUsd / collateralValue
buffer          = 1 - maxLTV / LT
```

| Figure | Blue-chip | Meme | Meaning |
|---|---|---|---|
| Safety margin between max LTV and LT | 13.33% | 25% | How far the collateral value can fall before a loan opened exactly at max LTV becomes liquidatable. |
| Liquidator net margin | 4.5% | 9% | The liquidator bonus minus the protocol liquidation fee, as a share of the repaid amount. |
| Health factor of a loan opened at max LTV | 1.154 | 1.333 | `LT / maxLTV`. The starting point of a loan that borrows the maximum. |

The buffer is measured as a fall in collateral value. It ignores interest, which slowly raises the debt and brings a loan closer to liquidation even when prices do not move. See [health factor](../concepts/health-factor.md).

## Related pages

- [Markets](../overview/markets.md)
- [Pool listing](../concepts/pool-listing.md)
- [Health factor](../concepts/health-factor.md)
- [Price oracles](../concepts/price-oracles.md)
- [Liquidation mechanics](../liquidations/mechanics.md)
- [CollateralPolicy reference](./collateral-policy.md)
- [Admin powers](../risk/admin-powers.md)
