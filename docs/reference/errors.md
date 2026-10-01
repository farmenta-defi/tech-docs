---
title: Errors
description: Every custom error of the Farmenta contracts, what it means in plain words, and what the caller can do about it.
sidebar_position: 11
---

## What this page is for

When a Farmenta contract refuses a call, it reverts with a named error that says which rule stopped it. This page lists every one of them.

An error works like the note a bank teller hands back with a rejected form: it names the box that was filled in wrong, and often the value that was expected.

A small example: Budi tries to borrow 7,000 USDG against a position worth $10,000 in a pool with a max LTV of 65%. The call reverts with `BorrowExceedsMaxLtv(7000000000000000000000, 6500000000000000000000)`. The two numbers are the debt he asked for and the most he can have, both in USD scaled by 1e18: $7,000 against a limit of $6,500.

## How to read an error

- **Simulate before you send.** A simulated call (`eth_call`, or `simulateContract` in viem) returns the error without costing gas.
- **Use a complete ABI.** Market logic runs from linked libraries, and the market calls other contracts. To decode every revert of a market call, combine the ABIs of `FarmentaMarket`, `MarketDebt`, `MarketMint`, `MarketLiquidity`, `MarketLiquidation`, `MarketUpgrade`, `CollateralPolicy`, `PriceOracle`, `TwapRecorder` and `PositionValuer`. The liquidation errors, for example, are declared only in `MarketLiquidation`.
- **Mind the units.** Arguments named `...Usd` are USD scaled by 1e18. Debt, caps and reserves are USDG with 6 decimals. Health factors are scaled by 1e18. Arguments ending in `Bps` are basis points.
- **An error can come from several functions.** The tables name the functions that throw it.

Some errors are declared in more than one place with the same signature, for example `InvalidRecipient`. They decode the same way wherever they come from.

## FarmentaMarket

Errors thrown by the market contract itself.

| Error | Meaning | What you can do |
|---|---|---|
| `ZeroAddress()` | The implementation was deployed with a zero address for one of its dependencies. | Deployment only. Pass the real addresses. |
| `TierNotSet()` | `initialize` was called with the tier `NONE`. | Deployment only. Initialize with `BLUE_CHIP` or `MEME`. |
| `NotOwnerOrGuardian(address caller)` | `pause` was called by an account that is neither the owner nor the guardian. | Owner or guardian only. |
| `NotThePositionManager(address caller)` | An NFT that is not a Uniswap v4 position was pushed to the market. | Send only Uniswap v4 position NFTs. |
| `PermitRejected(uint256 tokenId)` | `depositCollateralWithPermit`: the signature was not accepted and the market is not approved for the token. | Check the signer, the deadline and the nonce, and build the EIP-712 domain without a `version` field. Or approve the market and call `depositCollateral`. |
| `NotTheDepositor(uint256 tokenId, address depositor)` | `withdrawCollateral`: the caller is not the address the position is recorded to. `depositor` is that address, or zero if the market does not hold the position. | Call from the recorded address. |
| `OutstandingDebt(uint256 tokenId, uint256 debtShares)` | `withdrawCollateral`: the position still has debt. | Repay everything first, with `repay(tokenId, type(uint256).max)`. |
| `InvalidRecipient(address to)` | `withdrawCollateral`, `withdrawReserves`, `rescueUnaccountedToken`, `rescueUnaccountedEth`: `to` is the zero address or the market. | Pass an address that can receive the asset. |
| `PositionIsCollateral(uint256 tokenId)` | `rescueUnaccountedToken`: the position has a loan record, so it is somebody's collateral. | Owner only. The depositor of the position withdraws it with `withdrawCollateral`. |
| `ReserveWithdrawalExceedsAvailable(uint256 amount, uint256 available)` | `withdrawReserves`: the amount is above what can be withdrawn. `available` is the most that can leave now. | Owner only. Withdraw at most `available`. It is zero while reserves are at or below the floor. |

## MarketMint

Collateral admission, `mintAndDeposit` and `increaseLiquidity`.

| Error | Meaning | What you can do |
|---|---|---|
| `PositionAlreadyHeld(uint256 tokenId)` | The market already has a record for this position. | Nothing to do. The position is already collateral. |
| `PositionIsEmpty(uint256 tokenId)` | The position has no liquidity. | Add liquidity on Uniswap before you deposit, or use `mintAndDeposit`. |
| `PositionBelowMinimum(uint256 principalUsd, uint256 minimumUsd)` | The principal of the position, after the removal haircut and without fees, is below the pool's minimum position value. | Deposit a larger position. The preset minimum is $5. |
| `NativeValueMismatch(uint256 expected, uint256 sent)` | `mintAndDeposit`, `increaseLiquidity`: `msg.value` is wrong. | Send exactly `amount0Max` as value for a native ETH pool, and no value for an ERC-20 pair. |
| `PermitDoesNotMatchPool()` | `mintAndDeposit`, `increaseLiquidity`: the Permit2 batch does not list exactly the pool's ERC-20 currencies in pool order. | List `currency0` then `currency1` for an ERC-20 pair, and only `currency1` for a native ETH pool. |
| `ZeroLiquidity()` | `increaseLiquidity` was called with zero liquidity. | To claim fees, call `collectFees`. |
| `NotTheDepositor(uint256 tokenId, address depositor)` | `increaseLiquidity`: the caller is not the address the position is recorded to. | Call from the recorded address. |

## MarketDebt

`borrow`, and the checks that run after `collectFees`, `increaseLiquidity` and `decreaseLiquidity`.

| Error | Meaning | What you can do |
|---|---|---|
| `InvalidBorrowRecipient(address to)` | `borrow`: `to` is the zero address or the market. | Pass the address that should receive the USDG. |
| `ZeroBorrowAmount()` | `borrow` was called with an amount of zero. | Pass an amount above zero. |
| `BorrowerNotAuthorized(uint256 tokenId, address borrower)` | `borrow`: the caller is not the address the position is recorded to. | Call from the recorded address. |
| `PoolNotOpenForBorrowing(PoolId poolId)` | `borrow`: the pool is frozen, one of its tokens is disabled, or its hook is no longer permitted. | You cannot borrow more against this pool. Repaying, collecting fees, removing liquidity and withdrawing still work. |
| `UsdgPriceOutOfBounds(uint256 price)` | The USDG price is below 0.97 or above 1.03. Actions that take value out of a position with debt are stopped. | Wait until USDG is back inside the range. Repaying is not affected. |
| `SpotPriceDeviation(uint256 deviationBps, uint256 maximumDeviationBps)` | Blue-chip market: the pool's spot price is more than 200 basis points away from the oracle price. | Wait until the pool and the oracle agree again. This gate protects against a manipulated pool. |
| `BorrowExceedsMaxLtv(uint256 requestedDebt, uint256 maximumDebt)` | `borrow`: the debt after the borrow would be above collateral value times max LTV. Both arguments are in USD scaled by 1e18. | Borrow less. Read `maxBorrow` on the lens first. |
| `PoolDebtCapExceeded(PoolId poolId, uint256 requestedDebt, uint256 debtCap)` | `borrow`: the total debt against this pool would be above the pool's debt cap. | Borrow less, or wait for other borrowers to repay. Room left is `debtCap` minus `poolDebt(poolId)`. |
| `MarketDebtCapExceeded(uint256 requestedDebt, uint256 debtCap)` | `borrow`: the total debt of the market would be above the market debt cap. | Borrow less, or wait for other borrowers to repay. |
| `PositionWouldBeUnhealthy(uint256 tokenId, uint256 healthFactor)` | `collectFees`, `increaseLiquidity`: the health factor after the action would be below 1. `healthFactor` is the value it would have. | Repay part of the debt first. For `increaseLiquidity`, add more liquidity, because the fees are claimed out of the collateral first. |
| `RemovalExceedsBorrowLimit(uint256 tokenId, uint256 debtUsd, uint256 limitUsd)` | `decreaseLiquidity`: the debt would be above the borrow limit of what stays in the position. | Remove less liquidity, or repay until `debtUsd` is at most `limitUsd`. |

## MarketLiquidity

`collectFees` and `decreaseLiquidity`.

| Error | Meaning | What you can do |
|---|---|---|
| `InvalidRecipient(address to)` | `to` is the zero address, the market, `address(1)`, `address(2)` or PositionManager. | Pass a normal account or contract that can receive the tokens. |
| `NotTheDepositor(uint256 tokenId, address depositor)` | The caller is not the address the position is recorded to. | Call from the recorded address. |
| `ZeroLiquidity()` | `decreaseLiquidity` was called with zero liquidity. | To claim fees, call `collectFees`. |
| `LiquidityExceedsPosition(uint256 tokenId, uint128 requested, uint128 available)` | `decreaseLiquidity`: more liquidity was requested than the position holds. | Request at most `available`. |
| `PositionBelowMinimum(uint256 principalUsd, uint256 minimumUsd)` | `decreaseLiquidity`: what would stay in the position is below the pool's minimum position value. | Remove less. To take everything out, repay the debt and call `withdrawCollateral`. |

## MarketLiquidation

`liquidate`.

| Error | Meaning | What you can do |
|---|---|---|
| `InvalidRecipient(address to)` | `to` is the zero address, the market, `address(1)`, `address(2)` or PositionManager. | Pass the address that should receive the seized tokens. |
| `PositionNotCollateral(uint256 tokenId)` | The market does not hold this position. It may have been withdrawn or fully seized already. | Drop it from your list. Check `loanOf` first. |
| `PositionIsHealthy(uint256 tokenId, uint256 healthFactor)` | The health factor at liquidation prices is 1 or higher. | Nothing to liquidate. Use `liquidationHealthFactor` on the lens, not `healthFactor`, to pick targets. |
| `NothingToRepay(uint256 tokenId)` | The repay amount came out as zero. | Pass a `repayAmount` above zero. |
| `FeePurchaseUnderfunded(uint256 required, uint256 available)` | The position's fees are worth more than the seizure allows, and the budget left after `repay` does not cover the fee leg the liquidator has to buy. | Pass a `repayAmount` of `debt × closeFactor` plus at least `required`. When the close factor is 100%, a `repayAmount` of at least the full debt leaves no debt to buy fees for. |
| `SeizureBelowMinimum(uint256 out0, uint256 out1)` | The liquidator would receive less than `minOut0` or `minOut1`. The arguments are what it would have received. | Quote again and lower the minimums, or skip the liquidation. |

## MarketUpgrade

`scheduleUpgrade`, `cancelUpgrade` and `upgradeToAndCall`. All three are owner functions.

| Error | Meaning | What you can do |
|---|---|---|
| `ZeroAddress()` | `scheduleUpgrade`: the implementation is the zero address. | Owner only. Pass the address of the new implementation. |
| `ImplementationHasNoCode(address implementation)` | `scheduleUpgrade`: the address holds no code. | Owner only. Deploy the implementation first, then schedule it. |
| `ImplementationIsAPointer(address implementation)` | `scheduleUpgrade`: the code at the address starts with `0xEF`, so the account only points to other code. | Owner only. Schedule the address of the implementation contract. |
| `UpgradeAlreadyScheduled(address implementation)` | `scheduleUpgrade`: another upgrade is scheduled. `implementation` is the one that waits. | Owner only. Install it, or withdraw it with `cancelUpgrade`. |
| `NoUpgradeScheduled()` | `cancelUpgrade`: nothing is scheduled. | Nothing to cancel. |
| `UpgradeNotScheduled(address implementation)` | `upgradeToAndCall`: this implementation is not the scheduled one, or nothing is scheduled. | Owner only. Schedule it with `scheduleUpgrade` and wait for the `eta`. |
| `UpgradeNotReady(address implementation, uint256 eta)` | `upgradeToAndCall`: the delay has not passed. `eta` is the earliest timestamp. | Owner only. Wait until `eta`. |
| `UpgradeExpired(address implementation, uint256 expiredAt)` | `upgradeToAndCall`: the installation window closed at `expiredAt`. | Owner only. Cancel the schedule and schedule again, which starts a new delay. |
| `ImplementationCodeChanged(address implementation, bytes32 scheduled, bytes32 found)` | `upgradeToAndCall`: the code at the address no longer has the hash that was scheduled. | Owner only. Cancel the schedule. |

## MarketLens

| Error | Meaning | What you can do |
|---|---|---|
| `MarketNotInitialized()` | A lens was deployed for a market proxy that is not initialized. | Deployment only. Initialize the market first. |

## CollateralPolicy

Errors a user can meet through the market:

| Error | Meaning | What you can do |
|---|---|---|
| `PoolNotListed(PoolId poolId)` | The pool has never been listed. | Positions of this pool are not accepted. See [pool listing](../concepts/pool-listing.md). |
| `PoolFrozenForNewPositions(PoolId poolId)` | The pool is frozen. It takes no new collateral and no added liquidity. | Existing positions can still repay, collect fees, remove liquidity and withdraw. |
| `WrongTier(Tier poolTier, Tier marketTier)` | The pool belongs to the other market. | Use the market of the pool's tier: `1` is Blue-chip, `2` is Meme. |
| `TokenNotEnabled(Currency currency)` | One of the pool's tokens is disabled. | New deposits and added liquidity for pools with this token are closed. Borrowing against them is closed too, with `PoolNotOpenForBorrowing`. |
| `PairMustQuoteInUsdg()` | Neither token of the pool is USDG. | Only pools quoted in USDG are accepted. |
| `HookNotPermitted(address hooks)` | The pool's hook fails the permission check and is not allowlisted. | Pools with this hook are not accepted. Borrowing against positions already held in them is closed too, with `PoolNotOpenForBorrowing`. |

Errors only the owner can meet:

| Error | Meaning | What the owner can do |
|---|---|---|
| `PriceFeedRequiredForBlueChip(Currency currency)` | `setTokenConfig`: an enabled Blue-chip token has no price feed. | Pass the Chainlink feed address. |
| `PoolAlreadyListed(PoolId poolId)` | `list`: the pool is listed already. | Use `updateTerms`. |
| `LooserThanPreset(string parameter)` | `list`, `updateTerms`: a term is looser than the tier preset. `scheduleLtRamp`: the target is above the threshold in force. `parameter` is `"maxLtv"`, `"lt"`, `"liquidatorBonus"`, `"debtCap"`, `"minPosition"` or `"ltTarget"`. | Set the named term to the preset value or stricter. |
| `NoBorrowingRoom(uint16 maxLtvBps, uint16 ltBps)` | `list`, `updateTerms`: max LTV is zero, or not below the liquidation threshold, on a pool that is not frozen. | Keep max LTV above zero and below the threshold, or freeze the pool first. |
| `HaircutTooLarge(uint16 removeHaircutBps)` | The removal haircut is above 2,000 basis points. | A hook that takes more than 20% is not suitable collateral. |
| `HaircutRequiresRemoveDeltaHook()` | A removal haircut above zero was set for a pool whose hook cannot take a cut on removal. | Set the haircut to zero. |
| `HaircutIncreaseRequiresFreeze()` | `updateTerms`: the removal haircut was raised on a pool that is not frozen. | Freeze the pool, update, then unfreeze. |
| `RampStartInThePast()` | `scheduleLtRamp`: the start is before the current block timestamp. | Pass a start at or after the current time. |
| `RampDurationIsZero()` | `scheduleLtRamp`: the duration is zero. | Pass a duration above zero. For a change in one step use `updateTerms`. |
| `RampBelowMaxLtvRequiresFreeze(uint16 maxLtvBps, uint16 ltTargetBps)` | `scheduleLtRamp`: the target is at or below max LTV and the pool is not frozen. | Freeze the pool first. |
| `UnfreezeWouldLeaveNoBorrowingRoom(uint16 maxLtvBps, uint16 ltBps)` | `setFrozen`: the pool cannot be unfrozen because its threshold target is at or below max LTV. | Write terms with max LTV below the threshold first. |
| `NoPresetForTier()` | Declared in `TierPresets`. The tier is `NONE`, which has no preset. | Configure the tier of the pool's tokens before listing. |
| `NotOwnerOrGuardian(address caller)` | `freeze`, `disableToken`, `revokeHook`: the caller is neither the owner nor the guardian. | Owner or guardian only. |

## PriceOracle

| Error | Meaning | What you can do |
|---|---|---|
| `PriceFeedNotConfigured(Currency currency)` | The token has no Chainlink feed in the policy. | For a meme token, use the functions that take a pool key. Otherwise the token is not set up. |
| `InvalidPrice(Currency currency, int256 answer)` | The Chainlink feed answered zero or a negative number. | Wait for the feed to recover. Repaying and withdrawing collateral without debt do not need a price. |
| `StalePrice(Currency currency, uint256 updatedAt)` | The feed's last update is missing, in the future, or older than 25 hours. | Wait for the next feed update. |
| `MemeTwapUnavailable(PoolId poolId)` | The TWAP of a meme pool is unavailable and a borrowing price was needed. | From a lens view: call `record` on the recorder. From a market call: the pool has less than 30 minutes of history, wait until it has. |
| `MemeSpotUnavailable(PoolId poolId)` | The pool is not initialized. | Check the pool key. |
| `MemeCurrencyNotInPool(Currency currency, PoolId poolId)` | A meme price was requested for a token that is not in the given pool. | Pass the key of a pool that contains the token. |
| `TwapRecorderNotConfigured()` | The oracle was deployed without a recorder. | Deployment only. |

## PriceMath

Thrown while a position is valued.

| Error | Meaning | What you can do |
|---|---|---|
| `ZeroPrice()` | A price used to derive the pool price is zero. | Can occur for a meme token worth less than 0.000001 USDG per whole token. Chainlink prices never return zero: that path reverts earlier. |
| `PriceOutOfRange()` | The price derived from the oracle is outside the range Uniswap can represent. | The pair cannot be valued at these prices. |

## TwapRecorder

| Error | Meaning | What you can do |
|---|---|---|
| `TwapUnavailable()` | `record`, `recordBatch`: the pool is not initialized. `consult`: the window is zero, the pool has no history, the history is shorter than the window, or the latest observation is older than 900 seconds. | Check the pool key. For a stale history, call `record`. For a short history, wait until it covers the window. |

## PositionValuer

| Error | Meaning | What you can do |
|---|---|---|
| `PositionNotFound(uint256 tokenId)` | The position does not exist or was burned. | Check the token id. |

## InterestRateModel

| Error | Meaning | What you can do |
|---|---|---|
| `UtilizationTooHigh(uint256 utilization)` | `utilization` is above `1e18`. | Pass a value from 0 to `1e18`. |
| `TierNotSet()` | `tier` is `NONE`. | Pass `1` for Blue-chip or `2` for Meme. |

## LiquidatorHelper

| Error | Meaning | What you can do |
|---|---|---|
| `ZeroRepayAmount()` | `execute` was called with a budget of zero. | Pass a budget above zero. |
| `UnauthorizedMorpho(address caller)` | The flash loan callback was called by an address that is not Morpho. | Call `execute`. |
| `SwapFailed(bytes reason)` | The call to UniversalRouter reverted. `reason` is the router's revert data. | Decode `reason`. Quote again, check the minimum output and the route. |
| `ResidualBalance(address token, uint256 balance)` | After the swap the helper still holds a collateral token or ETH. `token` is `address(0)` for ETH. | Make the route sell its whole input and return only USDG to the helper. |

## Inherited and third party errors

These errors are not declared by Farmenta, but you will meet them through the market.

| Error | From | Meaning | What you can do |
|---|---|---|---|
| `EnforcedPause()` | OpenZeppelin | The market is paused. | Wait for the owner to unpause. `repay`, `withdrawCollateral`, `withdraw` and `redeem` still work. |
| `ReentrancyGuardReentrantCall()` | OpenZeppelin | A guarded market function was called from inside another market call. | Do not call the market from a callback of a market call. |
| `OwnableUnauthorizedAccount(address account)` | OpenZeppelin | An owner function was called by someone else. | Owner only. |
| `ERC4626ExceededMaxWithdraw(address owner, uint256 assets, uint256 max)` | OpenZeppelin | `withdraw`: more than `maxWithdraw(owner)` was requested. The limit includes the cash in the market. | Withdraw at most `max`, and the rest when cash returns. |
| `ERC4626ExceededMaxRedeem(address owner, uint256 shares, uint256 max)` | OpenZeppelin | `redeem`: more than `maxRedeem(owner)` was requested. | Redeem at most `max`. |
| `InvalidInitialization()` | OpenZeppelin | `initialize` was called on a proxy that is already initialized, or on the implementation. | Deployment only. |
| `MaximumAmountExceeded(uint128 maximumAmount, uint128 amountRequested)` | Uniswap v4 PositionManager | `mintAndDeposit`, `increaseLiquidity`: the liquidity costs more than `amount0Max` or `amount1Max`. | Raise the maximum, or add less liquidity. |
| `MinimumAmountInsufficient(uint128 minimumAmount, uint128 amountReceived)` | Uniswap v4 PositionManager | `decreaseLiquidity`: the principal returned is below `min0` or `min1`. Fees do not count toward the minimum. | Take a new quote from the pool and size the minimum from the principal of the slice only. |

Permit2 reverts with its own errors for an invalid signature, a used nonce or an expired deadline. A USDG transfer that fails, for example for lack of balance or allowance, reverts inside the token.

## Related pages

- [FarmentaMarket](./farmenta-market.md)
- [CollateralPolicy](./collateral-policy.md)
- [PriceOracle](./price-oracle.md)
- [LiquidatorHelper](./liquidator-helper.md)
- [Events](./events.md)
- [FAQ](../resources/faq.md)
