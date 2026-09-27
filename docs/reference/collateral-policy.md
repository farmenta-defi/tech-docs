---
title: CollateralPolicy
description: Reference for the contract that lists pools, stores their lending terms, and enforces the tier presets, freezes and LT ramps.
sidebar_position: 4
---

## What this contract is for

`CollateralPolicy` is the rule book of Farmenta. It decides which Uniswap v4 pools can back a loan and on what terms: max LTV, liquidation threshold, liquidator bonus, debt cap and minimum position value.

Nothing is accepted automatically. The owner lists each pool one by one, and the contract only accepts terms that are as strict as the tier preset or stricter. Think of a club with a guest list and a house rule that the bouncer cannot loosen.

A small example: the Blue-chip preset allows a max LTV of 65% and a liquidation threshold of 75%. The owner can list an ETH/USDG pool at 60% and 70%. A listing at 65% and 80% reverts with `LooserThanPreset("lt")`.

The policy has no external dependency. It reads no position, calls no oracle and holds no funds. Its address is published on the [addresses page](./addresses.md) after deployment.

## Contract summary

```solidity
contract CollateralPolicy is ICollateralPolicy, Ownable2Step
```

```solidity
constructor(Currency quote_, address owner_)
```

| Item | Value |
|---|---|
| Upgradeable | No. A market is pointed at a new policy only through a market upgrade. |
| Owner | One account, two step ownership transfer. Every function that changes state is owner only. |
| `quote()` | The quote currency every accepted pool must contain. It is USDG, and it is also the borrow asset. |

## Tiers

```solidity
enum Tier {
    NONE,
    BLUE_CHIP,
    MEME
}
```

`NONE` is zero on purpose. A token that was never configured must not read as Blue-chip.

A tier is set per token. A pool takes the riskier tier of its two tokens: a pool of a Meme token and USDG is a Meme pool. Each market accepts pools of its own tier only.

## Data structures

### `TokenConfig`

```solidity
struct TokenConfig {
    bool enabled;
    Tier tier;
    uint8 decimals;
    address priceFeed;
}
```

| Field | Meaning |
|---|---|
| `enabled` | Whether the token can appear in newly accepted collateral. |
| `tier` | The risk class of the token. |
| `decimals` | The token's decimals, recorded by the owner. They are never read live from the token, because a token that could change its reported decimals could change the value of every position. Native ETH is recorded as 18. |
| `priceFeed` | The Chainlink feed for the token's USD price. Required for an enabled Blue-chip token. Meme tokens are priced through the TWAP recorder and have no feed. |

`PriceOracle` reads this configuration on every price request. There is no second token registry.

### `ListingParams`

The terms the owner writes when listing a pool or updating it.

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

### `Listing`

The stored record of a pool, returned by `listingOf`.

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

| Field | Unit | Meaning |
|---|---|---|
| `listed` | | The pool has been listed. There is no function that removes a listing. |
| `frozen` | | No new collateral, no new borrowing and no added liquidity for this pool. |
| `tier` | | Derived from the pool's tokens at listing. It decides which market accepts the pool. |
| `maxLtvBps` | basis points | The highest LTV a borrow can reach. |
| `ltStartBps` | basis points | The liquidation threshold at the start of the ramp. With no ramp it is the threshold in force. |
| `ltTargetBps` | basis points | The liquidation threshold at the end of the ramp. With no ramp it equals `ltStartBps`. |
| `rampStart` | Unix seconds | When the ramp begins. Zero with no ramp. |
| `rampDuration` | seconds | How long the ramp takes. Zero with no ramp. |
| `liquidatorBonusBps` | basis points | The bonus a liquidator receives on top of the debt it repays. The protocol liquidation fee is one tenth of it. |
| `removeHaircutBps` | basis points | The share of value the pool's hook takes when liquidity is removed. Zero for pools whose hook takes nothing. |
| `debtCapUsdg` | USDG, 6 decimals | The most debt all positions of this pool can carry together. |
| `minPositionUsd` | USD, scaled by 1e18 | The smallest position accepted as collateral. |

The two amounts use different units on purpose. The debt cap is compared with debt, which is in USDG, so enforcing it never needs a price. The minimum position value is compared with a valuation, which is in USD.

### `Terms`

What the market reads, returned by `termsOf` and `checkPool`.

```solidity
struct Terms {
    uint16 maxLtvBps;
    uint16 ltBps;
    uint16 liquidatorBonusBps;
    uint16 removeHaircutBps;
    uint128 debtCapUsdg;
    uint128 minPositionUsd;
    Tier tier;
}
```

`ltBps` is the liquidation threshold in force now, already resolved through any ramp. The other fields are copied from the listing.

## Tier presets

The presets live in the `TierPresets` library. They are defaults and also the loosest values a listing can have.

| Preset field | Blue-chip | Meme | A listing may only be |
|---|---|---|---|
| `maxLtvBps` | `6500` (65%) | `3000` (30%) | lower or equal |
| `ltBps` | `7500` (75%) | `4000` (40%) | lower or equal |
| `minLiquidatorBonusBps` | `500` (5%) | `1000` (10%) | higher or equal |
| `maxDebtCapUsdg` | `500_000e6` (500,000 USDG) | `20_000e6` (20,000 USDG) | lower or equal |
| `marketDebtCapUsdg` | `500_000e6` (500,000 USDG) | `50_000e6` (50,000 USDG) | fixed per tier, not part of a listing |
| `minPositionUsd` | `50e18` ($50) | `50e18` ($50) | higher or equal |
| `maxRemoveHaircutBps` | `2000` (20%) | `2000` (20%) | lower or equal |

Two more constants in the same library are used by the price oracle for meme tokens:

| Constant | Value | Meaning |
|---|---|---|
| `MEME_CRASH_THRESHOLD_BPS` | `2500` | Liquidation uses the spot price when it is more than 25% below the TWAP. |
| `MEME_STALE_HAIRCUT_BPS` | `2000` | Liquidation uses the spot price minus 20% when the TWAP is unavailable. |

The market debt cap is enforced by the market in `borrow`. It is a constant of the tier and changes only through an upgrade.

## Owner functions

Every function in this section reverts with `OwnableUnauthorizedAccount(account)` when the caller is not the owner.

:::warning[Changes apply to existing loans at once]
New terms, a freeze, or an LT ramp take effect for loans that already exist. Lowering the liquidation threshold or raising the removal haircut can make a healthy loan liquidatable, and the borrower then pays the liquidator bonus without having done anything. There is no rate limit and no delay on tightening. See [admin powers](../risk/admin-powers.md).
:::

### `setTokenConfig`

```solidity
function setTokenConfig(
    Currency currency,
    bool enabled,
    Tier tier,
    uint8 decimals,
    address priceFeed
) external onlyOwner
```

Writes the whole configuration of a token, replacing what was there.

| Check | Error |
|---|---|
| An enabled Blue-chip token has a price feed | `PriceFeedRequiredForBlueChip(currency)` |

Emits `TokenConfigured(currency, enabled, tier, decimals, priceFeed)`.

Disabling a token does not unlist or freeze the pools that contain it. It stops new deposits and liquidity additions for those pools, because the token is checked again at deposit time. Existing positions keep using the recorded decimals and price source. Winding a pool down is a per pool decision: freeze it, and ramp its threshold if needed.

### `setHookAllowlist`

```solidity
function setHookAllowlist(address hooks, bool allowed) external onlyOwner
```

Allows or disallows a hook that does not pass the permission check. Emits `HookAllowlisted(hooks, allowed)`.

Removing a hook from the allowlist stops new deposits and liquidity additions for its pools. It does not touch existing positions.

### `list`

```solidity
function list(PoolKey calldata key, ListingParams calldata params) external onlyOwner
```

Lists a pool on the given terms. The tier is derived from the pool's tokens, so a Meme pair cannot be listed on Blue-chip terms by mistake. A pool is never listed frozen, and it starts with no ramp.

| Check | Error |
|---|---|
| The pool is not listed yet | `PoolAlreadyListed(poolId)` |
| Both tokens are enabled | `TokenNotEnabled(currency)` |
| One of the tokens is the quote currency | `PairMustQuoteInUsdg()` |
| The hook passes the permission check or is allowlisted | `HookNotPermitted(hooks)` |
| The tier has a preset | `NoPresetForTier()` |
| Every term is as strict as the preset or stricter | `LooserThanPreset(parameter)` |
| `maxLtvBps` is above zero and below `ltBps` | `NoBorrowingRoom(maxLtvBps, ltBps)` |
| `removeHaircutBps` is at most 2,000 | `HaircutTooLarge(removeHaircutBps)` |
| A removal haircut above zero is used only with a hook that can take a cut on removal | `HaircutRequiresRemoveDeltaHook()` |

Emits `PoolListed(poolId, tier, params)`.

`LooserThanPreset` names the term that failed: `"maxLtv"`, `"lt"`, `"liquidatorBonus"`, `"debtCap"` or `"minPosition"`.

### `updateTerms`

```solidity
function updateTerms(PoolId poolId, ListingParams calldata params) external onlyOwner
```

Rewrites the terms of a listed pool. The new terms apply at once, and any active ramp is cleared.

| Check | Error |
|---|---|
| The pool is listed | `PoolNotListed(poolId)` |
| Every term is as strict as the preset or stricter | `LooserThanPreset(parameter)` |
| Pool not frozen: `maxLtvBps` is above zero and below `ltBps` | `NoBorrowingRoom(maxLtvBps, ltBps)` |
| `removeHaircutBps` is at most 2,000 | `HaircutTooLarge(removeHaircutBps)` |
| A removal haircut above zero is used only with a hook that can take a cut on removal | `HaircutRequiresRemoveDeltaHook()` |
| The removal haircut is raised only while the pool is frozen | `HaircutIncreaseRequiresFreeze()` |

Emits `PoolTermsUpdated(poolId, params)`.

While a pool is frozen the threshold can be written at or below max LTV. No new loans can be taken from a frozen pool, so nobody is handed a loan that is already under water.

### `setFrozen`

```solidity
function setFrozen(PoolId poolId, bool frozen) external onlyOwner
```

Freezes or unfreezes a pool.

| Check | Error |
|---|---|
| The pool is listed | `PoolNotListed(poolId)` |
| Unfreezing: `maxLtvBps` is below `ltTargetBps` | `UnfreezeWouldLeaveNoBorrowingRoom(maxLtvBps, ltBps)` |

Emits `PoolFrozen(poolId, frozen)`.

What a freeze stops and what it leaves alone:

| Stops | Keeps working |
|---|---|
| `depositCollateral`, `depositCollateralWithPermit`, `mintAndDeposit`, NFT pushed with `safeTransferFrom` | Interest accrual |
| `increaseLiquidity` | `repay` |
| `borrow` | `collectFees`, `decreaseLiquidity` |
| | `withdrawCollateral` once the debt is repaid |
| | `liquidate` |

Collateral is never trapped by a freeze, and liquidation is never switched off by one.

### `scheduleLtRamp`

```solidity
function scheduleLtRamp(
    PoolId poolId,
    uint16 ltTargetBps,
    uint40 rampStart,
    uint40 rampDuration
) external onlyOwner
```

Schedules a gradual fall of the liquidation threshold. This is how a pool is wound down: positions are pushed toward liquidation over a published window instead of all at once. The schedule is on-chain, so a borrower can read when a position is due to become liquidatable.

| Check | Error |
|---|---|
| The pool is listed | `PoolNotListed(poolId)` |
| `rampStart` is not before the current block timestamp | `RampStartInThePast()` |
| `rampDuration` is above zero | `RampDurationIsZero()` |
| The target is not above the threshold in force now | `LooserThanPreset("ltTarget")` |
| A target at or below `maxLtvBps` is set only while the pool is frozen | `RampBelowMaxLtvRequiresFreeze(maxLtvBps, ltTargetBps)` |

Emits `LtRampScheduled(poolId, ltFromBps, ltTargetBps, start, duration)`.

The ramp starts from the threshold in force at the moment of the call. Scheduling a second ramp can therefore never move the threshold back up.

## Views

### `termsOf`

```solidity
function termsOf(PoolId poolId) public view returns (Terms memory)
```

The terms of a listed pool, with the threshold resolved through any ramp. Reverts with `PoolNotListed(poolId)` for an unlisted pool. There is no path that returns zeroed terms.

It works for frozen pools. The market reads terms this way for `borrow`, `collectFees`, `decreaseLiquidity` and `liquidate`. `repay` and `withdrawCollateral` read no terms.

### `checkPool`

```solidity
function checkPool(PoolKey calldata key, Tier marketTier) external view returns (Terms memory)
```

The gate a market calls when a position comes in or liquidity is added. It checks everything that can be decided from the pool alone and reverts with the reason.

| Check | Error |
|---|---|
| The pool is listed | `PoolNotListed(poolId)` |
| The pool is not frozen | `PoolFrozenForNewPositions(poolId)` |
| The pool's tier is the market's tier | `WrongTier(poolTier, marketTier)` |
| Both tokens are enabled | `TokenNotEnabled(currency)` |
| One of the tokens is the quote currency | `PairMustQuoteInUsdg()` |
| The hook passes the permission check or is allowlisted | `HookNotPermitted(hooks)` |

Tokens and hook are checked again here, not only at listing, because a token can be disabled and an allowlist entry can be removed after a pool was listed.

The two rules that need the position itself, liquidity above zero and the minimum position value, are enforced by the market, which has already valued the position.

### `acceptsNewPositions`

```solidity
function acceptsNewPositions(PoolId poolId) external view returns (bool)
```

`true` when the pool is listed and not frozen. `borrow` uses this check.

### `listingOf`

```solidity
function listingOf(PoolId poolId) external view returns (Listing memory)
```

The raw listing record, including the ramp schedule. Returns a zeroed record for an unlisted pool.

### `effectiveLt`

```solidity
function effectiveLt(PoolId poolId) external view returns (uint16)
```

The liquidation threshold in force now, in basis points. Reverts with `PoolNotListed(poolId)` for an unlisted pool.

```text
before rampStart                     ltStartBps
during the ramp                      ltStartBps − (ltStartBps − ltTargetBps) × elapsed / rampDuration
after rampStart + rampDuration       ltTargetBps
```

Example: a pool with a threshold of 75% is ramped to 65% over 10 days. Four days into the ramp the threshold in force is `7500 − 1000 × 4 / 10 = 7100`, which is 71%.

### Public getters

```solidity
Currency public immutable quote;
mapping(Currency currency => TokenConfig) public tokenConfig;
mapping(address hooks => bool) public hookAllowlist;
```

`tokenConfig(currency)` returns `(enabled, tier, decimals, priceFeed)`.

## Rules the contract enforces

### Stricter than the preset only

A listing can differ from the preset in one direction per term: max LTV and LT down, liquidator bonus up, debt cap down, minimum position value up. Anything looser reverts. The loosest terms Farmenta can ever offer are therefore readable from the presets.

### Borrowing room

While a pool accepts new positions, max LTV is below the liquidation threshold. Three rules follow.

- Setting the threshold at or below max LTV, through `updateTerms` or through a ramp target, is allowed only while the pool is frozen.
- Tightening can still be instant: freeze, then write the new threshold.
- Unfreezing is refused when the ramp target is at or below max LTV. The check uses the target, not the threshold in force, so a pool cannot be reopened just before a scheduled ramp takes the threshold below max LTV.

### Ramp rules

- The start is now or in the future, and the duration is above zero.
- The target is not above the threshold in force.
- The ramp starts from the threshold in force, and the fall is linear in time.
- `updateTerms` clears a ramp.

### Removal haircut

Some hooks take a cut when liquidity is removed. The removal haircut records that cut so positions are valued at what can really be taken out.

- The cap is 2,000 basis points (20%) on both tiers. A hook that takes more is not suitable collateral.
- A haircut above zero is accepted only when the hook address carries both `AFTER_REMOVE_LIQUIDITY_FLAG` and `AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA_FLAG`. Without both, the hook cannot reduce what a removal pays out, so the haircut must be zero. A pool id cannot be turned back into a hook address, so this fact is stored at listing and checked again by `updateTerms`.
- Raising the haircut is allowed only while the pool is frozen. Lowering it takes effect at once on an open pool.

The freeze requirement makes raising a haircut a deliberate two step action with no new loans in between. It is not a waiting period for borrowers: freeze, update and unfreeze can happen in one block.

## Hook permission check

Uniswap v4 encodes what a hook is allowed to do in the low bits of the hook's address. The policy reads those bits directly. It never calls the hook, so it does not have to trust the hook to answer honestly.

The `HookPermissions` library builds the mask from the flags of Uniswap's `Hooks` library:

```solidity
uint160 internal constant BIT_CHECK_MASK = Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG | Hooks.AFTER_REMOVE_LIQUIDITY_FLAG
    | Hooks.AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA_FLAG | Hooks.AFTER_ADD_LIQUIDITY_RETURNS_DELTA_FLAG;
```

| Flag in the mask | Bit | Why it fails the check |
|---|---|---|
| `BEFORE_REMOVE_LIQUIDITY_FLAG` | 9 | The hook can block a removal. Liquidation and withdrawal both depend on removing liquidity. |
| `AFTER_REMOVE_LIQUIDITY_FLAG` | 8 | The hook runs after a removal and can make it revert. |
| `AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA_FLAG` | 0 | The hook can take a cut of what a removal pays out. |
| `AFTER_ADD_LIQUIDITY_RETURNS_DELTA_FLAG` | 1 | The hook can bill whoever adds liquidity, which would take a borrower's tokens in `mintAndDeposit` and `increaseLiquidity` without adding to the collateral. |

```solidity
function passesBitCheck(IHooks hooks) internal pure returns (bool)
function returnsRemoveLiquidityDelta(IHooks hooks) internal pure returns (bool)
```

- `passesBitCheck` is true when the hook address has none of the four flags. A pool with no hook (`address(0)`) passes.
- `returnsRemoveLiquidityDelta` is true when the address has both `AFTER_REMOVE_LIQUIDITY_FLAG` and `AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA_FLAG`. It decides whether a removal haircut above zero is allowed.

A hook that fails the check can still be accepted if the owner adds it to `hookAllowlist` after reviewing its code.

Passing the check is not acceptance. The mask covers four permissions and not every way a hook can affect a position. Callbacks that run when liquidity is added, for example, pass the check as long as they return no delta. Every pool is reviewed and listed one by one for that reason. See [pool listing](../concepts/pool-listing.md).

## Events

| Event | Emitted when |
|---|---|
| `TokenConfigured(Currency indexed currency, bool enabled, Tier tier, uint8 decimals, address priceFeed)` | `setTokenConfig` writes a token configuration. |
| `HookAllowlisted(address indexed hooks, bool allowed)` | `setHookAllowlist` changes an entry. |
| `PoolListed(PoolId indexed poolId, Tier tier, ListingParams params)` | `list` lists a pool. |
| `PoolTermsUpdated(PoolId indexed poolId, ListingParams params)` | `updateTerms` rewrites the terms. |
| `PoolFrozen(PoolId indexed poolId, bool frozen)` | `setFrozen` freezes or unfreezes a pool. |
| `LtRampScheduled(PoolId indexed poolId, uint16 ltFromBps, uint16 ltTargetBps, uint40 start, uint40 duration)` | `scheduleLtRamp` schedules a ramp. |

`PoolListed` and `PoolTermsUpdated` carry the pool id and the terms as written by the owner. They do not carry the full pool key.

## Errors

| Error | Meaning |
|---|---|
| `TokenNotEnabled(Currency currency)` | A token of the pool is not enabled. |
| `PriceFeedRequiredForBlueChip(Currency currency)` | An enabled Blue-chip token was configured without a price feed. |
| `PairMustQuoteInUsdg()` | Neither token of the pool is USDG. |
| `HookNotPermitted(address hooks)` | The hook fails the permission check and is not allowlisted. |
| `PoolAlreadyListed(PoolId poolId)` | `list` was called for a pool that is already listed. |
| `PoolNotListed(PoolId poolId)` | The pool has never been listed. |
| `PoolFrozenForNewPositions(PoolId poolId)` | The pool is frozen and takes no new collateral or liquidity. |
| `WrongTier(Tier poolTier, Tier marketTier)` | The pool belongs to the other market. |
| `LooserThanPreset(string parameter)` | A term is looser than the tier preset, or a ramp target is above the threshold in force. |
| `NoBorrowingRoom(uint16 maxLtvBps, uint16 ltBps)` | Max LTV is zero, or not below the liquidation threshold, on a pool that is not frozen. |
| `HaircutTooLarge(uint16 removeHaircutBps)` | The removal haircut is above 2,000 basis points. |
| `HaircutRequiresRemoveDeltaHook()` | A removal haircut above zero was set for a hook that cannot take a cut on removal. |
| `HaircutIncreaseRequiresFreeze()` | The removal haircut was raised on a pool that is not frozen. |
| `RampStartInThePast()` | The ramp start is before the current block timestamp. |
| `RampDurationIsZero()` | The ramp duration is zero. |
| `RampBelowMaxLtvRequiresFreeze(uint16 maxLtvBps, uint16 ltTargetBps)` | The ramp target is at or below max LTV and the pool is not frozen. |
| `UnfreezeWouldLeaveNoBorrowingRoom(uint16 maxLtvBps, uint16 ltBps)` | The pool cannot be unfrozen because its threshold target is at or below max LTV. |
| `NoPresetForTier()` | Declared in `TierPresets`. The tier is `NONE`, which has no preset. |

What a caller can do about each error is on the [errors page](./errors.md).

## Related pages

- [Pool listing](../concepts/pool-listing.md)
- [Risk parameters](./risk-parameters.md)
- [Collateral](../concepts/collateral.md)
- [FarmentaMarket](./farmenta-market.md)
- [PriceOracle](./price-oracle.md)
- [Admin powers](../risk/admin-powers.md)
