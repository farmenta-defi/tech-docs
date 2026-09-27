---
title: Pause and emergency behaviour
description: What stops and what stays open when a Farmenta market is paused or a pool is frozen, and what you should do.
sidebar_position: 4
---

## Two emergency switches

Picture a bank branch during a power cut. It stops handing out new loans, because it cannot check anything. It still lets you pay back what you owe and take your own belongings home.

Farmenta has two switches that work in that spirit, both controlled by the owner:

- **Pausing a market** stops every action in that market that adds risk or depends on a price. It is meant for moments when prices cannot be trusted, such as a sequencer outage or an oracle failure.
- **Freezing a pool** stops new exposure to one pool only. It is how a pool is delisted. Everything that concerns existing loans keeps running, including liquidations.

Neither switch can stop you from repaying, from withdrawing collateral that has no debt, or from withdrawing supplied USDG up to the available cash.

## A small example

Budi has a position worth $10,000 and a debt of 7,000 USDG in a pool with an LT of 75%. His health factor is `10,000 × 0.75 / 7,000 = 1.07`.

The sequencer has trouble and the owner pauses the Blue-chip market. While the market is paused, ETH falls and Budi's position is worth $9,000. His health factor is now `9,000 × 0.75 / 7,000 = 0.96`.

- Nobody can liquidate Budi while the pause lasts.
- Budi can still repay. If he repays 1,000 USDG, his health factor becomes `9,000 × 0.75 / 6,000 = 1.13`.
- If he does nothing, he can be liquidated in the first block after the market is unpaused.

## What a pause stops

| Stopped while paused | Why |
|---|---|
| `depositCollateral`, `depositCollateralWithPermit`, `mintAndDeposit`, and sending a position NFT to the market with `safeTransferFrom` | New collateral is new risk, accepted at a price that cannot be trusted |
| Vault `deposit` and `mint` | The market should not take new money during an emergency |
| `borrow` | New debt, sized by a price |
| `increaseLiquidity`, `collectFees`, `decreaseLiquidity` | Each one checks the position's health at oracle prices |
| `liquidate` | Seizes collateral at oracle prices |

## What always stays open

| Open while paused | Limit |
|---|---|
| `repay` | None. Reduces risk and reads no price. |
| `withdrawCollateral` | Only when the position's debt is zero. Reads no price. |
| Vault `withdraw` and `redeem` | Limited by the cash in the market, as always. |

Interest keeps accruing during a pause. Debt grows every second whether or not the market is paused.

## Why the line is drawn there

When the oracle or the sequencer cannot be trusted, the price used to value a position cannot be trusted either. So no action that depends on a price should run: not borrowing, not removing value from a position with debt, and not liquidating.

Actions that only reduce risk, or that return an asset nobody has a claim on, need no price. Blocking them would protect no one and would turn an emergency switch into a way to trap users' assets. That is why `repay`, `withdrawCollateral` and the vault exits have no pause check at all.

:::warning[Liquidations are halted during a pause]
This is an accepted risk. Prices can keep falling while the market is paused, and a loan that was only unhealthy when the pause began can be worth less than its debt when the market reopens. That shortfall is bad debt: it is taken from the reserve first and then from the lenders of that market.
:::

A pause has no maximum duration and no delay. The owner can pause and unpause at any time, and each market is paused on its own.

## Market paused compared with pool frozen

| Function | Market paused | Pool frozen |
|---|---|---|
| Vault `deposit`, `mint` | Stopped | Open |
| Vault `withdraw`, `redeem` | Open, limited by cash | Open, limited by cash |
| `depositCollateral` | Stopped | Stopped for that pool |
| `depositCollateralWithPermit` | Stopped | Stopped for that pool |
| `mintAndDeposit` | Stopped | Stopped for that pool |
| NFT pushed with `safeTransferFrom` | Stopped, the transfer reverts | Stopped for that pool, the transfer reverts |
| `borrow` | Stopped | Stopped for positions in that pool |
| `increaseLiquidity` | Stopped | Stopped for that pool |
| `collectFees` | Stopped | Open |
| `decreaseLiquidity` | Stopped | Open |
| `repay` | Open | Open |
| `withdrawCollateral` (debt is zero) | Open | Open |
| `liquidate` | Stopped | Open |
| Interest accrual | Continues | Continues |
| TWAP `record` on the `TwapRecorder` | Open, it is a separate contract | Open |

A pause covers a whole market. A freeze covers one pool and has no effect on the vault or on other pools. Both can be active at the same time, and then the stricter column applies.

A frozen pool is often combined with a falling liquidation threshold. The owner can schedule an [LT ramp](./admin-powers.md#how-terms-are-tightened) or lower LT directly, and liquidations run throughout. Freezing a pool is not a grace period for borrowers.

## How to tell which state you are in

| Check | Where |
|---|---|
| Is the market paused? | `paused()` on the market. The market emits `Paused` and `Unpaused`. |
| Is my pool frozen? | `acceptsNewPositions(poolId)` or `listingOf(poolId)` on the [`CollateralPolicy`](../reference/collateral-policy.md). The policy emits `PoolFrozen`. |
| Is an LT ramp running? | `listingOf(poolId)` shows the start value, target, start time and duration. `effectiveLt(poolId)` gives the LT in force now. |

A call that is stopped by a pause reverts with `EnforcedPause`. A deposit or an addition to a frozen pool reverts with `PoolFrozenForNewPositions`, and a borrow with `PoolNotOpenForBorrowing`. See [Errors](../reference/errors.md).

## What to do

### When the market is paused

**If you borrow:**
- Check your health factor with current market prices, not only the number the contract reports.
- Repay part of your debt if you are close to `HF = 1`. Liquidations resume at the moment of unpause, at the prices of that moment.
- If you planned to leave, repay in full and call `withdrawCollateral`. Both work during a pause.
- You cannot add liquidity, remove liquidity or collect fees until the market reopens.

**If you lend:**
- You can withdraw up to the available cash. New deposits are refused.
- Remember that unhealthy loans are not being liquidated. If prices are falling sharply, the risk of bad debt grows with the length of the pause.

**If you liquidate:**
- `liquidate` reverts. Watch for the `Unpaused` event and re-read each position's liquidation health factor from the [`MarketLens`](../reference/market-lens.md) before you act. Several positions may have become liquidatable, some of them deeply.

### When your pool is frozen

**If you borrow:**
- You cannot borrow more, add liquidity, or deposit new positions from that pool.
- You can still repay, collect fees, remove liquidity within the usual limits, and withdraw your NFT once the debt is zero.
- Read the pool's listing. If an LT ramp is scheduled, compute when your position crosses `HF = 1` and repay or exit before then.

**If you lend:** nothing changes for deposits and withdrawals. A freeze usually means the owner wants less exposure to that pool.

**If you liquidate:** liquidations in the pool run as usual. During a ramp, positions become liquidatable on a known schedule.

## Halts that are not a pause

Some outside events stop actions even when the market is not paused:

- **A Chainlink price older than 25 hours.** Every action that reads that price reverts, including `liquidate`. `repay`, `withdrawCollateral` and vault withdrawals keep working.
- **USDG paused by its issuer.** Every USDG transfer fails, so `repay`, `liquidate`, `borrow` and vault deposits and withdrawals revert until the token is unpaused.
- **A sequencer outage.** No transaction can be submitted at all.

These are described in [Oracle, market and chain risks](./oracle-and-market-risks.md).

## Related pages

- [Risk overview](./overview.md)
- [Owner powers and upgradeability](./admin-powers.md)
- [Oracle, market and chain risks](./oracle-and-market-risks.md)
- [Pool listing](../concepts/pool-listing.md)
- [Managing collateral](../concepts/managing-collateral.md)
- [Meme market and frozen pools example](../worked-example/meme-market-and-frozen-pools.md)
