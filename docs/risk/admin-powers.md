---
title: Owner powers and upgradeability
description: Everything the owner account can do on Farmenta, what the contracts enforce, and what an upgrade can override.
sidebar_position: 2
---

## One account administers the protocol

Think of a building manager. House rules say what the manager may do in daily work: open the lobby, close a floor for repairs, change the visiting hours. Farmenta's owner account is that manager, and the contracts are the house rules. This page lists what the owner can do, what the contracts refuse, and how upgrades fit in.

The owner is one account. It administers both markets and the [`CollateralPolicy`](../reference/collateral-policy.md) contract that holds every pool listing. Ownership moves in two steps: the new owner must accept.

:::warning[Upgrades are not delayed today]
`FarmentaMarket` is a UUPS upgradeable contract, and only the owner can authorize an upgrade. An upgrade replaces the market's logic, so it can change any rule on this page, including how collateral and funds are held. Upgrades take effect without a delay today. A timelock on upgrades is planned before the protocol holds real funds, with `pause` kept instant.
:::

## What the contracts refuse

No owner function can do any of the following:

- **Taking recorded collateral.** No owner function transfers an NFT that has a loan record. `rescueUnaccountedToken` reverts for it.
- **Withdrawing reserves below the floor.** `withdrawReserves` reverts for any amount above `min(reserves − floor, cash)`.
- **Loosening terms beyond the tier presets.** No pool can have a max LTV or LT above the preset, a bonus below it, a debt cap above it, or a minimum position value below it.
- **Opening a pool with no borrowing room.** A pool that accepts new positions always has `maxLTV < LT`.
- **Blocking exits.** No owner function stops `repay`, stops `withdrawCollateral` for a position with no debt, or stops vault withdrawals. Neither pause nor freeze reaches them.
- **Changing the interest curve, reserve factor, reserve floor or close factor** with a setter. None exists.

These limits are rules of the current implementation. An upgrade can change them, which is why upgrades are the main trust assumption of the protocol and why a timelock is planned. Every upgrade also has to keep the storage layout intact, so new implementations are tested against the existing layout before release.

Bad debt is a separate matter: it draws on the whole reserve, including the part below the floor. The floor restricts what the owner may withdraw. It does not restrict what the reserve is used for.

## A worked example: lowering LT

Budi has a loan in a Blue-chip pool. His position is worth $13,733, his debt is 10,000 USDG, USDG is worth $1.00, and the pool's liquidation threshold (LT) is 75%.

```text
HF before = 13,733 × 0.75 / 10,000 = 1.03
```

The owner lowers the pool's LT from 75% to 70%. Nothing else changes.

```text
HF after  = 13,733 × 0.70 / 10,000 = 0.96
```

Budi's loan is now liquidatable. The close factor is 50% (his HF is between 0.9 and 1, and the debt is above 100 USDG), so Rina, a liquidator, can repay up to 5,000 USDG and receive liquidity worth $5,250. The 5% bonus, $250, comes out of Budi's position.

The contract allows this on purpose. It lets the owner react quickly to a broken oracle, a hook that changed behaviour, or a token that collapsed, which protects lenders. Borrowers can protect themselves by borrowing below the maximum and by watching the LT schedule of their pool.

## What the owner can do

### On each market (`FarmentaMarket`)

| Power | Effect on users | Limits enforced by the contract |
|---|---|---|
| **Upgrade the implementation** | Replaces all market logic. Can change any rule on this page, move collateral NFTs, move USDG, or rewrite the debt ledger. Also the only way to change the oracle, valuer, policy and interest rate model addresses, the reserve factor, the reserve floor, the close factor and the debt cap per market. | Owner only. Not delayed today. A timelock is planned before the protocol holds real funds. |
| **`pause` and `unpause`** | Stops every action that adds risk or reads a price, including liquidations. Repay and withdrawals stay open. See [Pause and emergency behaviour](./pause-and-emergency.md). | Instant. No maximum duration. Each market is paused separately. |
| **`withdrawReserves(amount, to)`** | Moves reserve USDG to any address. Does not change the share price, because lender funds already exclude the reserve. It does use the same cash lenders withdraw from. | Only the part above the reserve floor (1% of `totalAssets` in Blue-chip, 2.5% in Meme), and never more than the cash in the market. |
| **`rescueUnaccountedToken(tokenId, to)`** | Sends out a position NFT that reached the market without being recorded, for example one minted directly to the market's address. | Reverts for any NFT that has a loan record, so it cannot be used on deposited collateral. |
| **`transferOwnership`, `acceptOwnership`, `renounceOwnership`** | Hands every power on this page to another account, or gives them up for good. After a renounce nobody can pause, unpause, upgrade or withdraw reserves. A market that is paused at that moment stays paused: liquidations, borrowing and deposits never resume, while repay and withdrawals stay open. | A transfer needs acceptance by the new owner. A renounce is one transaction with no delay. |
| **`rescueUnaccountedEth(to)`** | Sends out the market's whole native ETH balance. | No legitimate flow leaves ETH in the market between transactions, so this balance belongs to no user. Cannot run inside another market call. |

### On pool listings (`CollateralPolicy`)

| Power | Effect on users | Limits enforced by the contract |
|---|---|---|
| **`transferOwnership`, `acceptOwnership`, `renounceOwnership`** | The same ownership functions exist on the policy contract. After a renounce nobody can list, freeze, unfreeze or change terms. | A transfer needs acceptance by the new owner. A renounce is one transaction with no delay. |
| **`setTokenConfig`** | Enables or disables a token, sets its tier, its recorded decimals and its Chainlink price feed. Changing the feed, the decimals or the tier changes how every position that holds the token is priced, at once. The contract does not check the feed address, so this power can make healthy loans liquidatable or overvalue collateral. Disabling a token stops new deposits and additions in its pools. | A Blue-chip token that is enabled must have a price feed. No other check. |
| **`setHookAllowlist`** | Admits a hook that fails the automatic permission check, after manual review. Removing a hook from the list stops new deposits and added liquidity in its pools. | None. Existing loans are not affected by removal. |
| **`list`** | Lists a pool with its own terms: max LTV, LT, liquidator bonus, removal haircut, debt cap, minimum position value. | Terms can never be looser than the tier preset. `maxLTV` must be below LT. The hook must pass the permission check or be allowlisted. Both tokens must be enabled and one must be USDG. |
| **`updateTerms`** | Rewrites a listed pool's terms. The new terms apply to existing loans immediately and cancel any running LT ramp. Lowering LT can make healthy loans liquidatable. Raising the bonus makes every liquidation more expensive for the borrower. | Same preset bounds as `list`. Within those bounds terms can move in either direction. The contract sets a minimum bonus per tier and no maximum. While the pool is open, `maxLTV` must stay below LT. |
| **`setFrozen`** | A frozen pool accepts no new collateral, no new borrowing and no added liquidity. Existing loans keep accruing interest and can be repaid, reduced, withdrawn and liquidated. | Unfreezing is refused if the pool's LT target is at or below its max LTV. |
| **`scheduleLtRamp`** | Lowers LT linearly from its current value to a target over a chosen period. Positions are pushed toward liquidation as the ramp runs. | The ramp cannot start in the past, must have a duration above zero, and can only go down. A target at or below max LTV requires a frozen pool. There is no minimum duration and no floor. |
| **Raise the removal haircut** (through `updateTerms`) | Cuts the recognised value of every position in the pool. A healthy loan can become liquidatable in the same block. | Only while the pool is frozen. Capped at 2,000 bps (20%). Only for pools whose hook is able to take a cut on removal. Lowering the haircut is allowed at any time. |

The tier presets are listed in [Risk parameters](../reference/risk-parameters.md), and the listing lifecycle is explained in [Pool listing](../concepts/pool-listing.md).

## How terms are tightened

:::warning[Lowering LT affects existing loans]
A lower LT applies to loans that are already open, so a loan close to its limit can become liquidatable. The owner can lower LT at once with `updateTerms`, or gradually with a ramp. In a frozen pool LT can be set at or below max LTV.
:::

A ramp makes the change visible in advance. The schedule (start value, target, start time, duration) is stored on-chain, so you can compute the exact moment your position crosses `HF = 1`:

```text
effective LT = ltStart − (ltStart − ltTarget) × elapsed / duration
```

Read it with `effectiveLt(poolId)` or `listingOf(poolId)` on the policy contract. A `LtRampScheduled` event is emitted when a ramp is set, and `PoolTermsUpdated` when terms are rewritten directly.

Freezing a pool does not add a grace period. Liquidations keep running in a frozen pool, and so do `repay`, `collectFees`, `decreaseLiquidity` and `withdrawCollateral`.

## The removal haircut

Some hooks keep part of the tokens when liquidity is removed. The removal haircut is the listing's estimate of that cut. It lowers the collateral value used for borrowing and for the health factor, and it sizes what a liquidator may take.

The contract cannot measure what a hook really keeps. It trusts the number in the listing.

:::warning[A haircut above the hook's real cut overpays liquidators]
If the listed haircut is higher than what the hook keeps, the liquidator receives more than `repay × (1 + bonus)`. In the worst case, a hook that keeps nothing in a pool listed at the 2,000 bps cap with a 5% bonus, the liquidator receives `1.05 / (1 − 0.2)`, about 131% of what they repay. The difference is taken from the borrower, or from lenders if the position ends in bad debt.
:::

Raising the haircut from 0 to 2,000 bps multiplies the recognised collateral value by 0.8, so a loan with HF 1.15 drops to 0.92.

The opposite error hurts lenders: a haircut below the hook's real cut means liquidators receive less than they pay for, liquidations stop being profitable, and bad debt builds up.

## The team's liquidation keeper

The team plans to operate its own liquidation keeper and a recording service for Meme pools. Neither is running yet. The rules below are the rules they are committed to follow once they run. You should know three things about the liquidation keeper:

- **It will compete with public liquidators.** Outside the case below, it executes as soon as a position reads `HF < 1`.
- **Its profit will go to the team treasury.**
- **It follows a waiting rule during LT ramps.** Lowering LT can make loans liquidatable, and the team's keeper could then earn the bonus. The rule below is there to let public liquidators go first.

The rule: while an LT ramp is running on a pool, it waits 60 seconds after it first reads `HF < 1` before it executes a position in that pool, so that public liquidators can go first.

:::warning[The 60 second wait is a keeper rule, not a contract rule]
Nothing on-chain enforces the wait. It applies only while the ramp is running. Once the ramp has finished, LT stays at its target and the keeper competes directly again. An instant change through `updateTerms` has no ramp and therefore no wait.
:::

The same team will also run the service that records price observations for Meme pools. Until that service runs, a Meme pool gets observations only from market transactions and from anyone who calls `record`, so a quiet pool enters stale mode after 900 seconds. When no observation arrives for more than 900 seconds, Meme positions are valued in [stale mode](./oracle-and-market-risks.md#stale-mode), which makes them easier to liquidate. Recording is permissionless: anyone, including a borrower, can call `record` on the [`TwapRecorder`](../reference/twap-recorder.md) to end stale mode.

## Related pages

- [Risk overview](./overview.md)
- [Pause and emergency behaviour](./pause-and-emergency.md)
- [Pool listing](../concepts/pool-listing.md)
- [Protocol fees and reserves](../concepts/protocol-fees-and-reserves.md)
- [CollateralPolicy reference](../reference/collateral-policy.md)
- [FarmentaMarket reference](../reference/farmenta-market.md)
