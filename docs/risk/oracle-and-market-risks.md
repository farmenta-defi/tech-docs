---
title: Oracle, market and chain risks
description: How price feeds, thin pools, token failures, hooks, the USDG issuer and the chain itself can cause losses on Farmenta.
sidebar_position: 3
---

## Why prices matter

A lending market is only as good as the price it uses. If the price is too high, the market lends too much and liquidates too late, and lenders take the loss. If the price is too low, borrowers are liquidated when they should not be. Farmenta reads prices from outside sources, and each source can lag, be pushed, or stop.

A small example. Budi borrows 6,000 USDG against a position that the oracle values at $10,000. If the true market value is already $7,500 because the oracle has not updated yet, his real health factor at an LT of 75% is `7,500 × 0.75 / 6,000 = 0.94`, while the contract still computes 1.25 and refuses to liquidate. The gap between those two numbers is what this page is about.

## Price sources at a glance

| Asset | Source | Used for borrowing | Used for liquidation |
|---|---|---|---|
| ETH and WETH | Chainlink ETH/USD | Chainlink price, and the pool's spot price must be within 2% of it | Chainlink price, no spot check |
| USDG | Chainlink USDG/USD | Must be between 0.97 and 1.03 | Used as reported, no bounds |
| Meme tokens | 30 minute TWAP from the [`TwapRecorder`](../reference/twap-recorder.md), times the USDG price | `min(spot, TWAP)` | TWAP, with two exceptions described below |

The full rules are in [Price oracles](../concepts/price-oracles.md).

## Chainlink dependence and the heartbeat

Chainlink is the only price source for ETH and USDG. There is no second oracle to compare against.

The ETH/USD feed has a heartbeat of 24 hours. The oracle contract rejects any Chainlink price older than 25 hours, for ETH and for USDG, and it rejects a zero or negative answer. When a required price is rejected, every action that reads it reverts, including `liquidate`. `repay`, `withdrawCollateral` and vault withdrawals do not read a price and keep working.

:::warning[A price can lag inside the 25 hour window]
Between two updates the contract uses the last reported price. The only check against a lagging price is the spot gate on borrowing: in the Blue-chip market, borrowing is refused when the pool's spot price differs from the Chainlink price by more than 2%. Liquidations do not use that gate. They follow the Chainlink price, so a lagging feed can make liquidations late in a falling market, and lenders carry the resulting bad debt.
:::

The spot gate also applies, for positions with debt, to `collectFees`, `increaseLiquidity` and `decreaseLiquidity`. If your pool drifts more than 2% from the oracle, those actions revert until the prices converge or you repay.

## The USDG bounds

USDG is both the borrowed asset and one side of every accepted pool. The contract does not assume it is worth $1.00. It reads the Chainlink USDG/USD feed and values debt and the USDG side of collateral at that price.

When the reported price leaves the range 0.97 to 1.03:

- `borrow` is refused, and so are `collectFees`, `increaseLiquidity` and `decreaseLiquidity` for positions with debt.
- `liquidate` keeps running and uses the price as reported.
- `repay` and withdrawals are not affected.

Who bears it: a lasting depeg changes the real value of what lenders are owed, and no parameter in Farmenta can correct that.

## No sequencer uptime feed

On many rollups, lending protocols read a Chainlink feed that reports whether the sequencer is running, and they give borrowers a grace period after an outage. Robinhood Chain has no such feed.

The mitigation is manual: the owner can [pause](./pause-and-emergency.md) the market during an outage. A pause also stops liquidations, so prices can keep moving while the market is paused, and a loan that was unhealthy can become bad debt by the time the market reopens.

## Meme market

The Meme market has no Chainlink feed for the risk token. Its price comes from the pool itself, which makes it easier to influence. Blue-chip collateral is priced by Chainlink and is not exposed to the pool-spot manipulation described in this section.

### TWAP manipulation in thin pools

The TWAP is an average of the pool's price over the last 30 minutes. Pushing the price of a thin pool for a short time moves the average only partly, and at borrow time the contract takes the lower of spot and TWAP, so pumping the price does not let anyone borrow more. A pool-based price can still be influenced in a thin pool, within one transaction or by holding the price over time. `min(spot, TWAP)` limits this on the borrowing side. For the liquidation side, a guard that limits how far a single observation can move the price is decided and not in place yet, which is why Meme pools are not listed with real funds until it is.

### Stale mode

The TWAP is valid only if the pool has at least 30 minutes of recorded history and the newest observation is at most 900 seconds old. Observations are recorded by the Meme market when collateral comes in and on `borrow`, `collectFees`, `increaseLiquidity` and `decreaseLiquidity`, before the position is priced. `liquidate` records too, but only at the end, after it has priced the position. `repay`, `withdrawCollateral` and vault actions do not record. Anyone can also call `record`, and the team plans to run a service that does so on a schedule.

When no valid TWAP is available, the market is in stale mode:

- New borrowing is refused while the pool has less than 30 minutes of recorded history. When the recorder has only gone quiet, a `borrow` records a fresh observation itself and then prices at `min(spot, TWAP)`.
- Liquidations value the meme token at the pool's current spot price times 0.8.

:::warning[Stale mode values positions lower]
A loan opened at the 30% max LTV with an LT of 40% starts at HF 1.33. Valued at spot times 0.8 it reads 1.07, so it is much closer to liquidation while stale mode lasts. Keep the recorder fresh, or borrow below the maximum.
:::

What you can do as a borrower: call `record` for your pool. It is permissionless and a single call makes the TWAP valid again, provided the pool has at least 30 minutes of history.

After a gap in observations, the first `record` fills the 30 minute window with the price from before the gap, and the TWAP then converges to the current price over the next 30 minutes of observations. During that time the liquidation price can sit above or below the market price. The crash threshold limits how far.

### The crash branch

During a real crash the TWAP lags behind. To keep liquidations working, the contract switches to the current spot price when spot is more than 25% below the TWAP (the crash threshold).

:::warning[The crash branch reads the current pool price]
The crash branch uses the pool's price at that moment, and a pool's price can be moved within a single transaction. A price move of more than 25% can therefore make Meme loans liquidatable, including loans opened at max LTV, because the distance from max LTV to LT in the Meme market is also 25%. The debt cap per pool does not prevent this.
:::

**Current policy:** Meme pools are not listed with real funds until a price guard against single transaction price moves is in place. The same guard covers the spot price used in stale mode.

### Rug risk and how bad debt scales with the cap

A meme token can lose almost all of its value, through a developer exit or a collapse in demand. When that happens faster than liquidators act, the collateral is worth less than the debt.

The main defence is the debt cap per pool. The owner sets it for each pool, up to 20,000 USDG in the Meme market. Bad debt from a collapse grows in a straight line with that cap. A simple linear model, with the pool's debt at a 20,000 USDG cap, every position exactly at the 40% LT (collateral worth $50,000), and a 10% liquidator bonus:

```text
collateral after the fall = 50,000 × (1 − fall)
debt that can be repaid   = collateral after the fall / 1.10
bad debt                  = 20,000 − debt that can be repaid   (zero if negative)
```

| Price fall | Bad debt | Share price loss if lender funds are 50,000 USDG |
|---|---|---|
| up to about 56% | $0 | 0% |
| 75% | $8,636 | 17.3% |
| 90% | $15,455 | 30.9% |
| 99% | $19,545 | 39.1% |

The last column ignores the reserve, which absorbs losses first. A smaller cap shrinks these numbers, and a pool's cap can be set lower than the tier maximum at listing.

The risk parameters were simulated on historical ETH prices and on an ETH/USDG pool. No live meme/USDG pool has been used yet, and the market debt cap, reserve factor, interest curve, fee cap and spot gate were not part of the simulation.

Who bears it: lenders of the Meme market. Blue-chip lenders are not affected. See [Bad debt](../concepts/bad-debt.md).

## Third party hooks

Many Uniswap v4 pools have a hook, a contract that runs at certain points of a swap or a liquidity change. Farmenta did not write these hooks and does not control them.

Two protections apply before a pool is accepted:

- **Permission check.** A hook's address encodes which callbacks it can run. A hook passes automatically only if it cannot act when liquidity is removed and cannot charge the caller when liquidity is added. For such hooks, no later change of their code can block a liquidation or a withdrawal, because Uniswap never calls them at those points. Passing the check says nothing about swaps: such a hook can still set fees or act on every swap, and its source code may be unpublished. That affects the price at which liquidators sell seized tokens and the pool's spot price used by the 2% gate.
- **Manual review and allowlist.** A hook that fails the check can be admitted by the owner after review. If it keeps part of the tokens on removal, the pool is listed with a [removal haircut](./admin-powers.md#the-removal-haircut).

What remains:

- An upgradeable hook can change its behaviour after the review. For an allowlisted hook that could mean blocking removals, which would strand collateral and make loans impossible to liquidate, or taking a larger cut than the listed haircut.
- A hook that runs when liquidity is added can move the pool price around your addition in `mintAndDeposit` or `increaseLiquidity`. Your cost is bounded by the maximum amounts you sign. Lenders are not affected, because collateral is valued at oracle prices.
- The contract cannot measure a hook's real cut. It trusts the listed haircut.

Mitigation after listing is the owner's: freeze the pool, ramp its LT down, or adjust the haircut. Each of those has its own cost for borrowers, described in [Owner powers](./admin-powers.md).

## USDG issuer powers

USDG is issued by a third party that can freeze individual addresses and pause the whole token. This is an external dependency that Farmenta shares with every protocol that uses USDG.

- **If USDG is paused,** every USDG transfer fails. `repay`, `liquidate`, `borrow`, and vault deposits and withdrawals all revert while the pause lasts. Interest keeps accruing, and prices keep moving.
- **If your address is frozen,** USDG transfers to you fail. A liquidation of your position still goes through: any USDG surplus owed to you is sent with a transfer that is allowed to fail, and if it fails the amount stays in the market as cash for lenders. Your claim to it is not recorded.
- **The freeze power covers any address,** including a market's own address.

## Chain stage and sequencer

Robinhood Chain is an Arbitrum Orbit rollup that settles to Ethereum. It is at an early stage of decentralization:

- It is rated Stage 0 by L2BEAT.
- A single sequencer orders transactions, and it can filter them, including transactions forced in through Ethereum.
- Two permissioned validators secure the chain.
- The chain is governed by a security council of eight signers.

Every protocol on the chain depends on the sequencer to include transactions. If the sequencer is down or refuses a transaction, a liquidation, a repayment or a withdrawal has to wait, and a position can move from unhealthy to bad debt in that time. See [Network](../reference/network.md).

## Liquidity risk for lenders

Your USDG is lent out. Only the part that is idle in the market, the cash, can be withdrawn at any moment.

```text
utilization = totalBorrows / (cash + totalBorrows)
```

`maxWithdraw` and `maxRedeem` are capped by cash. If Lina holds shares worth 100,000 USDG and the market has 30,000 USDG of cash, she can withdraw 30,000 now and the rest as borrowers repay or new lenders deposit.

What limits the wait: above the kink (80% utilization in Blue-chip, 70% in Meme) the borrow rate rises steeply, which pushes borrowers to repay and attracts deposits. It is an incentive, not a guarantee. There is no queue and no priority: whoever withdraws first gets the cash. Reserve withdrawals by the owner draw on the same cash, without changing the share price.

## Related pages

- [Risk overview](./overview.md)
- [Owner powers and upgradeability](./admin-powers.md)
- [Pause and emergency behaviour](./pause-and-emergency.md)
- [Price oracles](../concepts/price-oracles.md)
- [Position valuation](../concepts/position-valuation.md)
- [Meme market and frozen pools example](../worked-example/meme-market-and-frozen-pools.md)
