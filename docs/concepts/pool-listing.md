---
title: Pool listing, freezing and LT ramps
description: How pools are reviewed and listed one by one, what a listing stores, and how a pool is frozen or wound down with an LT ramp.
sidebar_position: 8
---

## A curated list

Farmenta does not accept positions from just any Uniswap v4 pool. The owner (the admin account) lists pools one by one, after a review. A position from a pool that is not listed is refused, whatever its tokens are.

It works like a pawn shop with a written list of the items it accepts and the terms for each. The list can be tightened or closed for an item at any time, but the shop always lets you redeem what it already holds.

A small example: the owner lists an ETH/USDG pool on the Blue-chip market with max LTV 60%, LT 72% and a debt cap of 200,000 USDG. These are stricter than the tier's loosest values (65%, 75% and 500,000 USDG). Positions from that pool can now be deposited, and loans against them follow those terms.

## What the review checks

The review happens off-chain. Its result is written on-chain by the owner as a token configuration and a pool listing.

**Tokens**

| Check | Reason |
|---|---|
| Not fee-on-transfer | The amount received must equal the amount sent |
| Not rebasing | Balances must not change on their own |
| Not pausable, no blacklist | A transfer that can be blocked can block a liquidation |
| Supply not freely mintable | Unlimited minting destroys the collateral value |
| Decimals recorded | Decimals are stored at listing and never read live |

The review does not yet screen for per wallet maximums or anti-bot transfer rules, which are common on meme tokens. If such a rule blocks a transfer to you during a liquidation, the leftover fees owed to you stay in the market and your claim to them is lost. See [liquidation mechanics](../liquidations/mechanics.md#returning-the-excess-to-the-borrower).

**Pools**

| Check | Requirement |
|---|---|
| Total value locked | At least $50,000 |
| Age | At least 7 days |
| Active positions | More than one |
| Hook | Passes the hook permission bit check, or is reviewed by hand and allowlisted |
| Meme pools only | The `TwapRecorder` holds at least 30 minutes of price history |
| Meme pools only | Not listed with real funds until a guard against single transaction price manipulation is in place. See [oracle and market risks](../risk/oracle-and-market-risks.md) |

A hook reviewed by hand is checked for what it does when liquidity is removed or added (can it revert, does it take a cut, does it charge the caller) and whether the hook itself can be upgraded. If a hook takes a cut on removal, that cut is recorded as the pool's removal haircut. A hook that takes more than 20% is not accepted.

:::info[USDG is the deliberate exception]
USDG is the asset lenders supply and borrowers borrow, and every accepted pool is quoted in it. Its issuer can freeze addresses and pause the token, which would fail the token checks above. Farmenta cannot exist without USDG, so the rule is handled in code instead: a USDG transfer to a borrower that fails does not block a liquidation. A pause of USDG itself stops every USDG transfer, including repayments, liquidations and lender withdrawals, for as long as it lasts. See [oracle and market risks](../risk/oracle-and-market-risks.md).
:::

These checks are a process, not a contract rule. The contract enforces what is described in the rest of this page.

## What a listing stores

Tokens and pools are configured in the `CollateralPolicy` contract.

### Token configuration

| Field | Meaning |
|---|---|
| `enabled` | Whether the token may appear in new collateral |
| `tier` | Blue-chip or Meme |
| `decimals` | Token decimals, recorded at listing |
| `priceFeed` | The USD price feed of the token. Required for an enabled Blue-chip token. |

A pool's tier is not chosen by hand. It is derived from its two tokens: the pool takes the riskier tier of the two. A meme token paired with USDG makes a Meme pool.

### Pool listing

```solidity
struct Listing {
    bool listed;
    bool frozen;
    Tier tier;
    uint16 maxLtvBps;
    uint16 ltStartBps;
    uint16 ltTargetBps;
    uint40 rampStart;
    uint40 rampDuration;
    uint16 liquidatorBonusBps;
    uint16 removeHaircutBps;
    uint128 debtCapUsdg;
    uint128 minPositionUsd;
}
```

| Field | Meaning |
|---|---|
| `listed` | The pool has been listed |
| `frozen` | The pool takes no new collateral, no new borrowing and no added liquidity |
| `tier` | Which market accepts the pool |
| `maxLtvBps` | Max LTV at borrow, in basis points (6500 is 65%) |
| `ltStartBps` | Liquidation threshold at the start of a ramp. Equal to the target when there is no ramp. |
| `ltTargetBps` | Liquidation threshold at the end of a ramp |
| `rampStart` | Timestamp at which the ramp begins. Zero when there is no ramp. |
| `rampDuration` | Length of the ramp in seconds. Zero when there is no ramp. |
| `liquidatorBonusBps` | Bonus a liquidator receives. The protocol liquidation fee is one tenth of it. |
| `removeHaircutBps` | Share a hook takes when liquidity is removed, deducted from every valuation. Zero for hooks that take nothing. |
| `debtCapUsdg` | Most USDG that can be borrowed against positions of this pool, in USDG with 6 decimals |
| `minPositionUsd` | Smallest position value accepted, in USD with 18 decimals |

Anyone can read a listing with `listingOf(poolId)`, the terms in force with `termsOf(poolId)`, and the current liquidation threshold with `effectiveLt(poolId)`.

## Stricter only

Each tier has a preset. The preset is also the loosest value the contract accepts. A listing may deviate from it in one direction only.

| Parameter | Blue-chip preset | Meme preset | A listing may only be |
|---|---|---|---|
| Max LTV | 65% | 30% | Lower |
| Liquidation threshold | 75% | 40% | Lower |
| Liquidator bonus | 5% | 10% | Higher |
| Debt cap per pool | 500,000 USDG | 20,000 USDG | Smaller |
| Minimum position value | $50 | $50 | Higher |
| Removal haircut (ceiling) | 20% | 20% | At or below the ceiling |

A looser value reverts with `LooserThanPreset`. A removal haircut above the ceiling reverts with `HaircutTooLarge`. "Stricter" is measured against the tier preset, not against the pool's previous terms: `updateTerms` can move a parameter in either direction as long as it stays within the preset.

Some parameters are fixed per tier and cannot be set per pool: the close factor, the reserve factor, the reserve floor, the interest curve and the market debt cap. See [risk parameters](../reference/risk-parameters.md).

Rules for listing and `updateTerms`:

- While the pool accepts new positions, max LTV must be above zero and below LT (`NoBorrowingRoom` otherwise).
- A removal haircut above zero is only valid for a hook whose address carries both the `afterRemoveLiquidity` and the `afterRemoveLiquidityReturnsDelta` flags. A hook without them cannot take a cut.
- Raising the removal haircut is only possible while the pool is frozen. Lowering it works at any time.
- `updateTerms` clears any active ramp.

## Freezing a pool

`setFrozen(poolId, true)` freezes a pool. Freezing is how a pool is delisted: it closes the door for new risk and leaves existing loans fully serviceable.

| Stops | Keeps working |
|---|---|
| `depositCollateral` and `depositCollateralWithPermit` | Interest accrual |
| `mintAndDeposit` | `repay` |
| `borrow` | `collectFees` |
| `increaseLiquidity` | `decreaseLiquidity` |
| | `withdrawCollateral` (once debt is zero) |
| | `liquidate` |

Collateral must never be trapped by an operational decision, and switching off liquidation would create the bad debt that freezing is meant to avoid.

## LT ramps

An LT ramp lowers a pool's liquidation threshold gradually, along a schedule that is stored on-chain. It is how Farmenta leaves a pool it no longer wants exposure to: loans are pushed toward repayment or liquidation over a published window instead of all at once.

The effective LT is interpolated linearly at the moment it is read:

```text
before rampStart:                effectiveLT = ltStart
after rampStart + rampDuration:  effectiveLT = ltTarget
in between:
    effectiveLT = ltStart − (ltStart − ltTarget) × elapsed / rampDuration
```

### Example

A frozen ETH/USDG pool has LT 75%. The owner schedules a ramp to 60% over 10 days.

| Day | Effective LT | Budi's HF (collateral $20,300, debt 12,300 USDG) |
|---|---|---|
| 0 | 75% | 1.238 |
| 4 | 69% | 1.139 |
| 8 | 63% | 1.040 |
| 10 | 60% | 0.990 |

With no price move at all, Budi's loan becomes liquidatable a little before day 10. Because the schedule is public, Budi, keepers and any interface can compute that date in advance and Budi can repay in time.

### Rules the contract enforces

| Rule | Error if broken |
|---|---|
| `rampStart` is not in the past | `RampStartInThePast` |
| `rampDuration` is greater than zero | `RampDurationIsZero` |
| The target is not above the current effective LT | `LooserThanPreset` |
| A target at or below max LTV requires a frozen pool | `RampBelowMaxLtvRequiresFreeze` |
| A pool cannot be unfrozen while max LTV is at or above the ramp target | `UnfreezeWouldLeaveNoBorrowingRoom` |

A ramp always starts from the current effective LT, so a second ramp can never move the threshold back up.

The idea behind the freeze rules: as long as a pool hands out new loans, max LTV stays below LT. Emptying a pool means removing that room, which is only allowed once the pool is frozen. The unfreeze check looks at where the threshold is heading (the target), not where it stands today, so a pool cannot be reopened just before its ramp drops below max LTV.

## Parameter changes apply to existing loans

:::warning[Changes to a listing apply to existing loans]
Changes to a listing apply to loans that already exist. Each change waits two days in the owner's queue before it runs. If the owner lowers LT, through a ramp or in one step with `updateTerms`, or raises the removal haircut on a frozen pool, the health factor of every loan in that pool falls, and a loan close to its limit can become liquidatable.

The owner's queue and a ramp's schedule are both on-chain, so borrowers can see the change coming. Borrowing below the maximum leaves room for it.

Example: LT is lowered from 75% to 60% while a position is worth $20,300 and owes 12,300 USDG. The health factor drops from 1.238 to 0.990 and the position can be liquidated.

See [admin powers](../risk/admin-powers.md).
:::

This power exists so the owner can react quickly to a broken oracle, a hook that changes behaviour or a token that collapses.

## Owner functions and events

| Function | Effect | Event |
|---|---|---|
| `setTokenConfig` | Enables or disables a token, sets tier, decimals and price feed | `TokenConfigured` |
| `setHookAllowlist` | Allows or removes a hand reviewed hook | `HookAllowlisted` |
| `list` | Lists a pool with its terms | `PoolListed` |
| `updateTerms` | Rewrites a pool's terms, effective immediately | `PoolTermsUpdated` |
| `setFrozen` | Freezes or unfreezes a pool | `PoolFrozen` |
| `scheduleLtRamp` | Schedules a gradual fall of LT | `LtRampScheduled` |

All of them can only be called by the owner. Disabling a token does not unlist the pools that contain it. It stops new deposits and liquidity additions for those pools, because both tokens are checked again each time.

## Related pages

- [Collateral: Uniswap v4 positions](./collateral.md)
- [Health factor, LTV and liquidation threshold](./health-factor.md)
- [CollateralPolicy reference](../reference/collateral-policy.md)
- [Risk parameters](../reference/risk-parameters.md)
- [Admin powers](../risk/admin-powers.md)
- [Worked example: Meme market and frozen pools](../worked-example/meme-market-and-frozen-pools.md)
