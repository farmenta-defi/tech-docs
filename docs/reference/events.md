---
title: Events
description: Every event emitted by the Farmenta contracts, with exact signatures, indexed arguments and when each one is emitted.
sidebar_position: 10
---

## What this page is for

Events are the public record of what happened in the protocol. Indexers, dashboards and bots read them to follow deposits, loans, liquidations and listing changes without calling the contracts for every position.

Think of them as the receipts of the protocol: one line per action, printed at the moment it happens.

A small example: Budi borrows 1,500 USDG against position 1234. The market emits `Borrow(1234, poolId, 1500000000)`. A consumer that wants every loan of one pool filters `Borrow` by the `poolId` topic.

Signatures on this page are copied from the code. An argument marked `indexed` is a log topic and can be used as a filter. Contract addresses are on the [addresses page](./addresses.md).

## How to read market events

Four rules apply to every event of `FarmentaMarket`.

- **The emitter is the market proxy.** Part of the market's logic runs from linked libraries, but every log carries the address of the market that was called. The Blue-chip market and the Meme market emit the same events from different addresses.
- **Every event about a recorded position carries the pool id as an indexed topic. `UnaccountedTokenRescued` is the exception: the token was never recorded, so the market knows no pool for it.** You can group by pool with a topic filter and no extra contract call.
- **Amounts of debt and reserves are in USDG with 6 decimals.** Token amounts of a position are in the raw units of that token.
- **A transaction that reverts emits nothing**, including events that were emitted before the revert.

| Event group | Topic order |
|---|---|
| Collateral | `tokenId`, `owner`, `poolId` |
| Debt, fees, liquidity | `tokenId`, `poolId` |
| Liquidation | `tokenId`, `liquidator`, `poolId` |

## FarmentaMarket

### Collateral

```solidity
event CollateralDeposited(uint256 indexed tokenId, address indexed owner, PoolId indexed poolId);
```

Emitted when a position is taken into custody and recorded, by `depositCollateral`, `depositCollateralWithPermit`, `mintAndDeposit`, or a position pushed with `safeTransferFrom`. `owner` is the address the position is recorded to.

```solidity
event CollateralWithdrawn(uint256 indexed tokenId, address indexed owner, PoolId indexed poolId);
```

Emitted by `withdrawCollateral` when a position with no debt is returned. `owner` is the address that withdrew. The recipient of the NFT is not part of the event.

A position that leaves custody through a full seizure does not emit `CollateralWithdrawn`. It is reported by `Liquidate` with `fullSeizure` set to `true`.

### Debt

```solidity
event Borrow(uint256 indexed tokenId, PoolId indexed poolId, uint256 amount);
```

Emitted by `borrow`. `amount` is the USDG sent out.

```solidity
event Repay(uint256 indexed tokenId, PoolId indexed poolId, uint256 amount);
```

Emitted by `repay`. `amount` is the USDG actually taken, which can be lower than the amount requested. A call that repays nothing emits no event.

Debt repaid through a liquidation is not reported with `Repay`. Read it from `Liquidate.repaid`.

### Fees and liquidity

```solidity
event CollectFees(uint256 indexed tokenId, PoolId indexed poolId, uint256 amount0, uint256 amount1);
```

Emitted whenever a position's fees are paid out to its owner. Three paths do that:

| Path | Order of events |
|---|---|
| `collectFees` | `CollectFees` |
| `decreaseLiquidity` | `CollectFees`, then `LiquidityChanged` with a negative delta |
| `increaseLiquidity`, which claims the fees before it adds liquidity | `CollectFees`, then `LiquidityChanged` with a positive delta |

`amount0` and `amount1` are the fees the position realized, read from the pool's fee growth just before the payout. They are not a balance change of the recipient, so anything else that reaches the recipient in the same transaction is not counted.

The realized amounts can differ from the reported ones in two cases, both limited to pools whose hook was allowlisted by the owner: a hook that swaps or donates inside the same liquidity action, and a hook that takes a cut of what a removal pays out. In the second case the event shows the fees before the hook's cut.

Fees realized by a liquidation are not reported with `CollectFees`.

```solidity
event LiquidityChanged(uint256 indexed tokenId, PoolId indexed poolId, int256 liqDelta);
```

Emitted when a borrower changes the liquidity of a position in custody. `liqDelta` is positive for `increaseLiquidity` and negative for `decreaseLiquidity`.

Liquidity removed by a liquidation is not reported with `LiquidityChanged`.

### Liquidation

```solidity
event Liquidate(
    uint256 indexed tokenId,
    address indexed liquidator,
    PoolId indexed poolId,
    uint256 repaid,
    uint256 out0,
    uint256 out1,
    uint256 badDebt,
    bool fullSeizure
);
```

Emitted by `liquidate`, once per liquidation.

| Argument | Meaning |
|---|---|
| `tokenId` | The liquidated position. |
| `liquidator` | The caller of `liquidate`. With the helper contract this is the helper, not the account that called it. |
| `poolId` | The pool of the position. |
| `repaid` | USDG taken off the debt, including the borrower's own fees applied to it. An exact ledger figure. |
| `out0`, `out1` | What the recipient received in `currency0` and `currency1`, including any fee leg the liquidator bought. |
| `badDebt` | Debt the position could not cover, in USDG. The whole shortfall, whether reserves absorbed it or not. An exact ledger figure. |
| `fullSeizure` | `true` when the position was burned and its loan record deleted. `false` for a liquidity slice. |

Notes for consumers:

- **Read the outcome from `fullSeizure`.** Do not infer a full seizure from a burn of the NFT in the same transaction.
- **`badDebt` is always zero on a liquidity slice.** Only a full seizure can carry bad debt, and it usually does, because a full seizure means the position was worth less than the debt plus the bonus.
- **Do not treat `out0` and `out1` as the amount seized.** On a full seizure they are the recipient's balance change across the payout. A contract recipient that moves tokens while it is paid can distort them. On a liquidity slice they leave out the part of the fees that went back to the borrower.
- After a full seizure the position no longer exists. Its `tokenId` will not appear in later events.

```solidity
event BadDebtSocialized(uint256 amount);
```

Emitted by `liquidate` only when lenders absorb a loss. `amount` is the part of the bad debt that reserves could not cover, in USDG. It lowers `totalAssets` and with it the share price of this market.

```text
BadDebtSocialized.amount = Liquidate.badDebt − part covered by reserves
```

When reserves cover the whole shortfall, `Liquidate.badDebt` is above zero and `BadDebtSocialized` is not emitted. The event has no indexed arguments. Match it to its `Liquidate` event by transaction. See [bad debt](../concepts/bad-debt.md).

Order of events in a liquidation: `ReservesUpdated`, then `BadDebtSocialized` if any, then `Liquidate`.

### Reserves

```solidity
event ReservesUpdated(uint256 reserves);
```

Carries the reserve balance after a change, in USDG. It is emitted:

- when interest accrues, by any function that accrues, as the reserve share of the interest is added,
- by every `liquidate`, after the protocol liquidation fee was added and any bad debt was taken out,
- by `withdrawReserves`.

An accrual with no time elapsed or no debt emits nothing. A single transaction can emit `ReservesUpdated` more than once, for example a liquidation that also accrues interest. The last one in the transaction is the current balance.

```solidity
event ReservesWithdrawn(uint256 amount, address indexed to);
```

Emitted by `withdrawReserves`, after `ReservesUpdated`. `amount` is the USDG sent to `to`.

### Rescue

```solidity
event UnaccountedTokenRescued(uint256 indexed tokenId, address indexed to);
```

Emitted by `rescueUnaccountedToken` when the owner sends out a position NFT that reached the market without a record.

```solidity
event UnaccountedEthRescued(uint256 amount, address indexed to);
```

Emitted by `rescueUnaccountedEth` when the owner sends out native ETH that reached the market outside any payout.

### Lender side: standard ERC-4626 events

The lender side uses the events of the [ERC-4626 standard](https://eips.ethereum.org/EIPS/eip-4626) and of ERC-20, inherited from OpenZeppelin. The market adds no lender events of its own. The collateral functions have different names (`depositCollateral`, `withdrawCollateral`) so that their events cannot be confused with these.

```solidity
event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares);
```

Emitted by `deposit` and `mint`. `sender` paid the USDG, `owner` received the shares.

```solidity
event Withdraw(
    address indexed sender,
    address indexed receiver,
    address indexed owner,
    uint256 assets,
    uint256 shares
);
```

Emitted by `withdraw` and `redeem`. `owner` held the shares that were burned, `receiver` received the USDG.

```solidity
event Transfer(address indexed from, address indexed to, uint256 value);
event Approval(address indexed owner, address indexed spender, uint256 value);
```

The ERC-20 events of the share token. A deposit also emits `Transfer` from the zero address, and a withdrawal emits `Transfer` to the zero address.

`assets` is in USDG with 6 decimals. `shares` and `value` are in share units with 9 decimals.

### Upgrades

```solidity
event UpgradeScheduled(address indexed newImplementation, uint256 eta);
event UpgradeCodeBound(address indexed newImplementation, bytes32 codehash);
event UpgradeCancelled(address indexed newImplementation);
```

`scheduleUpgrade` emits `UpgradeScheduled`, then `UpgradeCodeBound`. `eta` is the timestamp from which the implementation can be installed, and it stays installable for 14 days after that. `codehash` is the hash of the code at the address when it was scheduled.

`cancelUpgrade` emits `UpgradeCancelled`. An upgrade that is installed emits `Upgraded`, listed under [administration](#administration). Every schedule ends in exactly one of the two.

A schedule that expires emits nothing. It stays pending until the owner cancels it. To know whether an upgrade waits now, read `pendingUpgrade()` on the market: a schedule made before you started listening is still pending.

### Guardian

```solidity
event GuardianUpdated(address indexed previousGuardian, address indexed newGuardian);
```

Emitted by `setGuardian`, and by `initialize` when a guardian is given. `newGuardian` is the zero address when the guardian is removed. `CollateralPolicy` declares the same event for its own guardian.

### Administration

These events are inherited from OpenZeppelin.

| Event | Emitted when |
|---|---|
| `Paused(address account)` | The owner or the guardian pauses the market. `account` is the caller. |
| `Unpaused(address account)` | The owner unpauses the market. |
| `Upgraded(address indexed implementation)` | The proxy is pointed at a new implementation, which was scheduled before. |
| `Initialized(uint64 version)` | The proxy is initialized. |
| `OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner)` | The owner nominates a new owner. |
| `OwnershipTransferred(address indexed previousOwner, address indexed newOwner)` | The nominated owner accepts, or ownership is set at initialization. |

`Paused`, `GuardianUpdated`, `UpgradeScheduled`, `Upgraded` and `OwnershipTransferred` are the events to watch if you monitor the owner's powers. See [admin powers](../risk/admin-powers.md).

## CollateralPolicy

```solidity
event TokenConfigured(Currency indexed currency, bool enabled, Tier tier, uint8 decimals, address priceFeed);
```

Emitted by `setTokenConfig`, and by `disableToken` with `enabled` false. Carries the whole configuration of the token.

```solidity
event HookAllowlisted(address indexed hooks, bool allowed);
```

Emitted by `setHookAllowlist`, and by `revokeHook` with `allowed` false.

```solidity
event PoolListed(PoolId indexed poolId, Tier tier, ListingParams params);
```

Emitted by `list`. `tier` is derived from the pool's tokens. `params` is the terms struct:

```solidity
struct ListingParams {
    uint16 maxLtvBps;
    uint16 ltBps;
    uint16 liquidatorBonusBps;
    uint16 removeHaircutBps;
    uint128 debtCapUsdg;
    uint128 minPositionUsd;
}
```

```solidity
event PoolTermsUpdated(PoolId indexed poolId, ListingParams params);
```

Emitted by `updateTerms`. The new terms apply from this event on, and any LT ramp scheduled before it is cleared.

```solidity
event PoolFrozen(PoolId indexed poolId, bool frozen);
```

Emitted by `setFrozen`, and by `freeze` with `frozen` true. `frozen` is the new state.

```solidity
event LtRampScheduled(PoolId indexed poolId, uint16 ltFromBps, uint16 ltTargetBps, uint40 start, uint40 duration);
```

Emitted by `scheduleLtRamp`. `ltFromBps` is the liquidation threshold in force at the moment of the call, which is where the ramp starts. `start` is a Unix timestamp and `duration` is in seconds.

The liquidation threshold during a ramp changes every second without any event. Compute it from the last `LtRampScheduled`, or call `effectiveLt`.

`CollateralPolicy` also emits `GuardianUpdated`, `OwnershipTransferStarted` and `OwnershipTransferred`, with the signatures shown above.

## TwapRecorder

```solidity
event Recorded(PoolId indexed poolId, uint16 index, uint64 timestamp, int56 tickCumulative);
```

Emitted when an observation is stored, by `record` or `recordBatch`.

| Argument | Meaning |
|---|---|
| `poolId` | The pool that was recorded. |
| `index` | The slot of the observation in the ring buffer, from 0 to 2,047. |
| `timestamp` | The block timestamp of the observation. |
| `tickCumulative` | The running sum of tick times seconds up to this observation. The first observation of a pool has zero. |

A call that is skipped because the pool already has an observation in the same second emits nothing.

The age of the newest `Recorded` event of a pool tells you how close the pool is to stale mode, which begins when the newest observation is more than 900 seconds old. A pool with less than 30 minutes of history is in stale mode regardless.

## Contracts that emit no events

`MarketLens`, `PriceOracle`, `PositionValuer` and `InterestRateModel` are read-only or stateless and emit nothing. `LiquidatorHelper` emits nothing of its own: a liquidation made through it is reported by the market's `Liquidate` event.

## Event index

| Event | Contract | Indexed arguments |
|---|---|---|
| `CollateralDeposited` | `FarmentaMarket` | `tokenId`, `owner`, `poolId` |
| `CollateralWithdrawn` | `FarmentaMarket` | `tokenId`, `owner`, `poolId` |
| `Borrow` | `FarmentaMarket` | `tokenId`, `poolId` |
| `Repay` | `FarmentaMarket` | `tokenId`, `poolId` |
| `CollectFees` | `FarmentaMarket` | `tokenId`, `poolId` |
| `LiquidityChanged` | `FarmentaMarket` | `tokenId`, `poolId` |
| `Liquidate` | `FarmentaMarket` | `tokenId`, `liquidator`, `poolId` |
| `BadDebtSocialized` | `FarmentaMarket` | none |
| `ReservesUpdated` | `FarmentaMarket` | none |
| `ReservesWithdrawn` | `FarmentaMarket` | `to` |
| `UnaccountedTokenRescued` | `FarmentaMarket` | `tokenId`, `to` |
| `UnaccountedEthRescued` | `FarmentaMarket` | `to` |
| `UpgradeScheduled` | `FarmentaMarket` | `newImplementation` |
| `UpgradeCodeBound` | `FarmentaMarket` | `newImplementation` |
| `UpgradeCancelled` | `FarmentaMarket` | `newImplementation` |
| `GuardianUpdated` | `FarmentaMarket` | `previousGuardian`, `newGuardian` |
| `Deposit` | `FarmentaMarket` (ERC-4626) | `sender`, `owner` |
| `Withdraw` | `FarmentaMarket` (ERC-4626) | `sender`, `receiver`, `owner` |
| `TokenConfigured` | `CollateralPolicy` | `currency` |
| `HookAllowlisted` | `CollateralPolicy` | `hooks` |
| `PoolListed` | `CollateralPolicy` | `poolId` |
| `PoolTermsUpdated` | `CollateralPolicy` | `poolId` |
| `PoolFrozen` | `CollateralPolicy` | `poolId` |
| `LtRampScheduled` | `CollateralPolicy` | `poolId` |
| `GuardianUpdated` | `CollateralPolicy` | `previousGuardian`, `newGuardian` |
| `Recorded` | `TwapRecorder` | `poolId` |

## Related pages

- [FarmentaMarket](./farmenta-market.md)
- [CollateralPolicy](./collateral-policy.md)
- [TwapRecorder](./twap-recorder.md)
- [Indexer](./indexer.md)
- [Errors](./errors.md)
