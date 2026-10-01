---
title: FarmentaMarket
description: Function reference for the Farmenta market, covering lenders, borrowers, liquidators, the owner, and the pause and freeze rules.
sidebar_position: 2
---

## What this contract is for

`FarmentaMarket` is the contract users talk to. It is a USDG vault for lenders, a safe for the Uniswap v4 position NFTs that borrowers deposit, and the ledger that tracks who owes what.

There are two markets, Blue-chip and Meme. Both are proxies of the same implementation, so every function on this page exists on both. They share no funds and no debt.

A small example: Lina deposits 1,000 USDG with `deposit` and receives `fUSDG-BC` shares. Budi deposits a position worth $10,000 with `depositCollateral`. With a max LTV of 65% he can call `borrow` for up to $6,500 worth of USDG, and he gets his NFT back with `withdrawCollateral` once he has repaid everything.

Market addresses are on the [addresses page](./addresses.md).

## Contract summary

```solidity
contract FarmentaMarket is
    ERC4626Upgradeable,
    ERC721Holder,
    ReentrancyGuardTransient,
    PausableUpgradeable,
    Ownable2StepUpgradeable,
    UUPSUpgradeable
```

| Item | Value |
|---|---|
| Solidity version | `0.8.26` |
| Licence | MIT |
| Vault asset and borrow asset | USDG, 6 decimals |
| Share token | `fUSDG-BC` (Blue-chip), `fUSDG-MEME` (Meme), 9 decimals |
| Debt, caps, reserves | USDG, 6 decimals |
| Values and prices | USD, scaled by 1e18 |

The market reads its dependencies from immutables that change only through an upgrade. See [contract architecture](./architecture.md).

```solidity
IPositionManager public immutable positionManager;
ICollateralPolicy public immutable policy;
IPositionValuer public immutable valuer;
IPriceOracle public immutable oracle;
IInterestRateModel public immutable interestRateModel;
```

## Paused vs frozen

Two switches can stop part of a market, and they are different things.

- **Paused** is a switch on the whole market, set by the market owner with `pause`. It stops everything that adds risk or depends on an oracle price.
- **Frozen** is a switch on one pool, set in `CollateralPolicy` with `setFrozen`. It stops new collateral, new borrowing and added liquidity for that pool only. A pool is closed in the same way while one of its tokens is disabled or its hook is off the allowlist.

In both states interest keeps accruing, and borrowers can always repay and take back collateral that has no debt.

| Function | Market paused | Pool frozen |
|---|---|---|
| `deposit`, `mint` | Reverts | Works (not tied to a pool) |
| `withdraw`, `redeem` | Works | Works (not tied to a pool) |
| `depositCollateral`, `depositCollateralWithPermit`, `mintAndDeposit`, NFT pushed with `safeTransferFrom` | Reverts | Reverts |
| `increaseLiquidity` | Reverts | Reverts |
| `borrow` | Reverts | Reverts |
| `repay` | Works | Works |
| `collectFees` | Reverts | Works |
| `decreaseLiquidity` | Reverts | Works |
| `withdrawCollateral` | Works | Works |
| `liquidate` | Reverts | Works |
| `accrue` | Works | Works |
| `withdrawReserves`, `rescueUnaccountedToken`, `rescueUnaccountedEth` | Works | Works |
| `scheduleUpgrade`, `cancelUpgrade`, `upgradeToAndCall` | Works | Works (not tied to a pool) |

A call that is stopped by the pause reverts with `EnforcedPause()`. A call that is stopped by a freeze reverts with `PoolFrozenForNewPositions(poolId)` on the collateral side and `PoolNotOpenForBorrowing(poolId)` on `borrow`. In a pool closed by a token or by its hook, the collateral side reverts with `TokenNotEnabled(currency)` or `HookNotPermitted(hooks)`, and `borrow` with the same `PoolNotOpenForBorrowing(poolId)`.

:::warning[Liquidation stops while the market is paused]
`liquidate` is paused together with borrowing. If prices keep falling during a pause, positions can go deeper under water and end as bad debt. See [pause and emergency](../risk/pause-and-emergency.md).
:::

## Structs used as arguments

### `MintParams`

Defined in `FarmentaMarket`. It describes the position `mintAndDeposit` creates.

```solidity
struct MintParams {
    PoolKey poolKey;
    int24 tickLower;
    int24 tickUpper;
    uint256 liquidity;
    uint128 amount0Max;
    uint128 amount1Max;
    bytes hookData;
}
```

| Field | Meaning |
|---|---|
| `poolKey` | The pool to mint into. It must pass the same admission checks as any deposit. |
| `tickLower`, `tickUpper` | The price range, on the pool's tick spacing. |
| `liquidity` | Liquidity to mint. |
| `amount0Max` | The most `currency0` the mint may cost. For a native ETH pool this is also exactly the `msg.value` to send. |
| `amount1Max` | The most `currency1` the mint may cost. |
| `hookData` | Passed through to the pool's hook. |

### `PoolKey`

The Uniswap v4 pool identifier.

```solidity
struct PoolKey {
    Currency currency0;
    Currency currency1;
    uint24 fee;
    int24 tickSpacing;
    IHooks hooks;
}
```

Native ETH is `address(0)` and is always `currency0`, because currencies are sorted by address.

### Permit2 batch

`mintAndDeposit` and `increaseLiquidity` pull the caller's tokens with a Permit2 signature transfer. The struct is Permit2's own, `ISignatureTransfer.PermitBatchTransferFrom`.

```solidity
struct TokenPermissions {
    address token;
    uint256 amount;
}

struct PermitBatchTransferFrom {
    TokenPermissions[] permitted;
    uint256 nonce;
    uint256 deadline;
}
```

Rules the market enforces on the permit:

- `permitted` lists the pool's ERC-20 currencies in pool order and nothing else. An ERC-20 pair has two entries. A native ETH pool has one entry, `currency1`, because the ETH arrives as `msg.value`.
- Each `amount` must be at least the matching maximum (`amount0Max`, `amount1Max`). The market requests exactly the maximum.
- The spender in the signed message is the market.
- The signer must be the caller. The permit is spent with `owner = msg.sender`.
- `deadline` is also handed to PositionManager as the deadline of the liquidity action.

### `Loan`

Returned by `loanOf`. Defined in the `MarketLedger` library.

```solidity
struct Loan {
    address owner;
    ICollateralPolicy.Tier tier;
    uint256 debtShares;
    PoolId poolKeyId;
}
```

| Field | Meaning |
|---|---|
| `owner` | The address the position is recorded to. Only this address can borrow against it, manage it, or take it back. |
| `tier` | The tier the position was accepted under. |
| `debtShares` | The position's share of the market's debt. Multiply by `borrowIndex` and divide by 1e18 to get USDG. |
| `poolKeyId` | The pool the position sits in. |

## Deployment functions

### `constructor`

```solidity
constructor(
    IPositionManager positionManager_,
    ICollateralPolicy policy_,
    IPositionValuer valuer_,
    IPriceOracle oracle_,
    IInterestRateModel interestRateModel_
)
```

Sets the immutables of the implementation and disables initializers on it. Reverts with `ZeroAddress()` if any argument is the zero address.

### `initialize`

```solidity
function initialize(
    IERC20 asset_,
    string calldata name_,
    string calldata symbol_,
    ICollateralPolicy.Tier tier_,
    address owner_,
    address guardian_
) external initializer
```

Initializes one proxy. It can run once.

- Sets the vault asset, the share token name and symbol, the tier and the owner.
- Stores `guardian_` as the guardian and emits `GuardianUpdated(address(0), guardian_)`. With the zero address the market starts without a guardian and emits nothing for it.
- Sets `borrowIndex` to `1e18` and `lastAccrual` to the current timestamp.
- Sets the reserve factor and reserve floor from the tier: 1,500 and 100 basis points for Blue-chip, 2,500 and 250 basis points for Meme.

Reverts with `TierNotSet()` if `tier_` is `Tier.NONE`, and with `InvalidInitialization()` if the proxy is already initialized.

## Lender functions

The lender side is a standard [ERC-4626](https://eips.ethereum.org/EIPS/eip-4626) vault. Every one of the four entry points accrues interest first, so shares are always priced on an up to date ledger.

```text
totalAssets = cash + totalBorrows − reserves
```

`cash` is the USDG balance of the market.

### `deposit`

```solidity
function deposit(uint256 assets, address receiver) public override returns (uint256)
```

| Property | Value |
|---|---|
| Caller | Anyone. The caller must have approved USDG to the market. |
| Market paused | Reverts with `EnforcedPause()`. |
| Emits | `Deposit(sender, owner, assets, shares)`, the ERC-20 `Transfer` of the minted shares, and `ReservesUpdated` when interest accrued. |

Pulls `assets` USDG from the caller and mints shares to `receiver`. Returns the shares minted.

Reverts with `ReentrancyGuardReentrantCall()` when called from inside another market call, for example from a pool hook.

### `mint`

```solidity
function mint(uint256 shares, address receiver) public override returns (uint256)
```

Same as `deposit`, but you name the shares you want and the vault works out the USDG to pull. Returns the assets paid. Same pause rule, errors and events as `deposit`.

### `withdraw`

```solidity
function withdraw(uint256 assets, address receiver, address owner) public override returns (uint256)
```

| Property | Value |
|---|---|
| Caller | The share owner, or an address with a share allowance from the owner. |
| Market paused | Works. |
| Emits | `Withdraw(sender, receiver, owner, assets, shares)`, the ERC-20 `Transfer` of the burned shares, and `ReservesUpdated` when interest accrued. |

Burns shares from `owner` and sends `assets` USDG to `receiver`. Returns the shares burned.

Reverts with `ERC4626ExceededMaxWithdraw(owner, assets, max)` when `assets` is more than `maxWithdraw(owner)`.

### `redeem`

```solidity
function redeem(uint256 shares, address receiver, address owner) public override returns (uint256)
```

Same as `withdraw`, but you name the shares to burn. Returns the assets paid. Reverts with `ERC4626ExceededMaxRedeem(owner, shares, max)` when `shares` is more than `maxRedeem(owner)`.

### The cash limit: `maxWithdraw` and `maxRedeem`

```solidity
function maxWithdraw(address owner) public view override returns (uint256)
function maxRedeem(address owner) public view override returns (uint256)
```

USDG that is lent out is not in the market. A lender can only take out what is there.

```text
maxWithdraw(owner) = min(value of the owner's shares, cash)
maxRedeem(owner)   = min(owner's shares, convertToShares(cash))
```

Example: Lina's shares are worth 1,000 USDG, but borrowers hold most of the market's USDG and only 400 USDG of cash is left. `maxWithdraw` returns 400 USDG. She can withdraw the rest as borrowers repay or new lenders deposit.

The cash limit is a physical limit, not a queue. Reserves are not a separate wallet, so the owner's reserve withdrawals and lender withdrawals draw on the same cash. The share price is not affected, because `totalAssets` already excludes reserves.

### `totalAssets`

```solidity
function totalAssets() public view override returns (uint256)
```

Returns lender funds: cash plus `totalBorrows` minus `reserves`. It uses the ledger as of the last accrual.

### Other vault views

`convertToShares`, `convertToAssets`, `previewDeposit`, `previewMint`, `previewWithdraw`, `previewRedeem`, `asset`, `decimals` and the ERC-20 functions are inherited from OpenZeppelin unchanged.

`maxDeposit` and `maxMint` are also unchanged and return the maximum `uint256` value. They do not reflect the pause, so check `paused()` before you offer a deposit.

## Borrower collateral functions

### Admission checks

Every way of bringing a position in runs the same checks, in this order.

| Check | Error |
|---|---|
| The position is not already recorded | `PositionAlreadyHeld(tokenId)` |
| The pool is listed | `PoolNotListed(poolId)` |
| The pool is not frozen | `PoolFrozenForNewPositions(poolId)` |
| The pool's tier matches the market's tier | `WrongTier(poolTier, marketTier)` |
| Both tokens are enabled | `TokenNotEnabled(currency)` |
| One of the tokens is USDG | `PairMustQuoteInUsdg()` |
| The hook passes the permission check or is allowlisted | `HookNotPermitted(hooks)` |
| The position exists and can be priced | `PositionNotFound(tokenId)`, or an oracle error |
| The position has liquidity | `PositionIsEmpty(tokenId)` |
| Principal after the removal haircut is at least the pool's minimum position value | `PositionBelowMinimum(principalUsd, minimumUsd)` |

The minimum is measured on principal only. Uncollected fees do not count, because they can be claimed a moment after the deposit.

On the Meme market each of these functions first records a TWAP observation for the pool.

A position that fails a check makes the whole call revert, so the NFT never leaves its owner.

### `depositCollateral`

```solidity
function depositCollateral(uint256 tokenId) external whenNotPaused nonReentrant
```

| Property | Value |
|---|---|
| Caller | The owner of the position NFT. The market must be approved for the NFT first. |
| Market paused | Reverts. |
| Pool frozen | Reverts. |
| Emits | `CollateralDeposited(tokenId, owner, poolId)` |

Moves the NFT from the caller into the market and records it to the caller. The market becomes the owner of the NFT. That is what lets it remove liquidity during a liquidation.

### `depositCollateralWithPermit`

```solidity
function depositCollateralWithPermit(
    uint256 tokenId,
    uint256 deadline,
    uint256 nonce,
    bytes calldata signature
) external whenNotPaused nonReentrant
```

| Property | Value |
|---|---|
| Caller | Anyone holding a valid signature from the NFT owner. |
| Market paused | Reverts. |
| Pool frozen | Reverts. |
| Emits | `CollateralDeposited(tokenId, owner, poolId)` |

Approves and deposits in one transaction. The position is recorded to the NFT owner, not to `msg.sender`, so a relayer can pay the gas without gaining anything.

Notes for integrators:

- The signature is Uniswap's own position permit, not a generic ERC-721 one. Its EIP-712 domain has `name`, `chainId` and `verifyingContract`, and no `version` field. A signer that builds the usual four field domain produces a signature that always fails.
- The function arguments are `deadline` then `nonce`. The signed struct hashes them in the opposite order.
- Nonces are unordered. Any nonce the owner has not used is valid.
- The signature is 65 bytes, or the compact 64 byte form.
- If the permit call fails, the deposit still goes ahead when the market is already approved for that token. This covers the case where someone else submitted the same signature first. Otherwise the call reverts with `PermitRejected(tokenId)`.

### `mintAndDeposit`

```solidity
function mintAndDeposit(
    MintParams calldata p,
    ISignatureTransfer.PermitBatchTransferFrom calldata permit,
    bytes calldata signature
) external payable whenNotPaused nonReentrant returns (uint256 tokenId)
```

| Property | Value |
|---|---|
| Caller | Anyone. The caller must be the signer of the permit. |
| Market paused | Reverts. |
| Pool frozen | Reverts. |
| Emits | `CollateralDeposited(tokenId, owner, poolId)`, and `ReservesUpdated` when interest accrued. |
| Returns | The id of the minted position. |

Mints a new position straight into custody and records it to the caller. The end state is the same as minting on Uniswap and then calling `depositCollateral`.

How the tokens move:

1. Permit2 sends each ERC-20 leg, at its maximum, from the caller directly to PositionManager. ETH arrives as `msg.value`.
2. PositionManager mints the position to the market and pays each leg from what it just received.
3. PositionManager sweeps the change back to the caller, USDG first.

The caller's tokens never sit in the market, so they never count as lender cash.

| Check | Error |
|---|---|
| `msg.value` equals `amount0Max` for a native ETH pool, and zero otherwise | `NativeValueMismatch(expected, sent)` |
| The permit lists exactly the pool's ERC-20 currencies, in pool order | `PermitDoesNotMatchPool()` |
| The permit signature, nonce and deadline are valid | Reverts inside Permit2 |
| The mint costs no more than `amount0Max` and `amount1Max` | Reverts inside PositionManager |
| All admission checks | See the table above |

### Pushing the NFT with `safeTransferFrom`

```solidity
function onERC721Received(
    address,
    address from,
    uint256 tokenId,
    bytes memory
) public override whenNotPaused nonReentrant returns (bytes4)
```

You can also deposit by calling `safeTransferFrom(from, market, tokenId)` on PositionManager. The market runs the same admission checks and records the position to `from`. If a check fails the transfer reverts.

The callback accepts calls from PositionManager only and reverts with `NotThePositionManager(caller)` for any other NFT contract.

:::warning[Do not send a position with a plain transfer]
A plain `transferFrom` to the market, or minting a position with the market as owner, does not trigger any callback. The position arrives without a record and you cannot withdraw it. Only the market owner can return it, with `rescueUnaccountedToken`.
:::

### `withdrawCollateral`

```solidity
function withdrawCollateral(uint256 tokenId, address to) external nonReentrant
```

| Property | Value |
|---|---|
| Caller | The address the position is recorded to. |
| Market paused | Works. |
| Pool frozen | Works. |
| Emits | `CollateralWithdrawn(tokenId, owner, poolId)`, and `ReservesUpdated` when interest accrued. |

Returns the position NFT to `to` once nothing is owed against it. It reads no price, so it works even when an oracle is down.

| Check | Error |
|---|---|
| `to` is not the zero address and not the market | `InvalidRecipient(to)` |
| The caller is the recorded owner | `NotTheDepositor(tokenId, depositor)` |
| The position has no debt | `OutstandingDebt(tokenId, debtShares)` |

The NFT is sent with `safeTransferFrom`. A contract recipient that cannot receive ERC-721 tokens makes the call revert.

## Debt functions

### `accrue`

```solidity
function accrue() public
```

| Property | Value |
|---|---|
| Caller | Anyone. |
| Market paused | Works. |
| Emits | `ReservesUpdated(reserves)` when interest accrued. |

Brings the ledger up to the current timestamp. Every function that changes debt or cash calls it first, so you rarely need to call it yourself.

```text
utilization  = totalBorrows / (cash + totalBorrows)
rate         = interestRateModel.ratePerSecond(tier, utilization)
borrowIndex  = borrowIndex + borrowIndex × rate × elapsed / 1e18
totalBorrows = totalBorrowShares × borrowIndex / 1e18
reserves     = reserves + interest × reserveFactorBps / 10,000
```

It does nothing when no time has passed since the last accrual. When there is no debt it only moves `lastAccrual`.

### `borrow`

```solidity
function borrow(uint256 tokenId, uint256 amount, address to) external whenNotPaused nonReentrant
```

| Property | Value |
|---|---|
| Caller | The address the position is recorded to. |
| Market paused | Reverts. |
| Pool frozen | Reverts. |
| Emits | `Borrow(tokenId, poolId, amount)`, and `ReservesUpdated` when interest accrued. |

Sends `amount` USDG to `to` and adds it to the debt of the position. On the Meme market it records a TWAP observation first.

Checks, in order:

| Check | Error |
|---|---|
| `to` is not the zero address and not the market | `InvalidBorrowRecipient(to)` |
| `amount` is not zero | `ZeroBorrowAmount()` |
| The caller is the recorded owner | `BorrowerNotAuthorized(tokenId, borrower)` |
| The pool is listed and not frozen, both of its tokens are enabled, and its hook is permitted | `PoolNotOpenForBorrowing(poolId)` |
| The USDG price is within 0.97 to 1.03 | `UsdgPriceOutOfBounds(price)` |
| Blue-chip only: the pool's spot price is within 200 basis points of the oracle price | `SpotPriceDeviation(deviationBps, maximumDeviationBps)` |
| Debt after the borrow, in USD, is at most collateral value times max LTV | `BorrowExceedsMaxLtv(requestedDebt, maximumDebt)` |
| Pool debt after the borrow is at most the pool's debt cap | `PoolDebtCapExceeded(poolId, requestedDebt, debtCap)` |
| Market debt after the borrow is at most the tier's market debt cap | `MarketDebtCapExceeded(requestedDebt, debtCap)` |

The collateral value used here is:

```text
collateralValue = (principalUsd + min(feesUsd, principalUsd / 10)) × (1 − removalHaircut)
```

On the Meme market the meme token is priced at `min(spot, TWAP)`. If the TWAP is not available the call reverts with `MemeTwapUnavailable(poolId)`.

The market does not check cash ahead of the transfer. If it holds less USDG than `amount`, the USDG transfer itself reverts.

Debt shares are rounded up on a borrow, so rounding never favours the borrower.

### `repay`

```solidity
function repay(uint256 tokenId, uint256 amount) external nonReentrant returns (uint256 repaid)
```

| Property | Value |
|---|---|
| Caller | Anyone. You can repay a position you do not own. The caller must have approved USDG to the market. |
| Market paused | Works. |
| Pool frozen | Works. |
| Emits | `Repay(tokenId, poolId, amount)` with the amount actually taken, and `ReservesUpdated` when interest accrued. |
| Returns | The USDG actually taken from the caller. |

Pulls USDG from the caller and reduces the debt of the position.

- Pass `type(uint256).max` to repay everything. Any amount above the debt is cut down to the debt.
- A full repayment retires the exact recorded shares, so no dust is left behind.
- A partial repayment rounds the retired shares down, so `repaid` can be a fraction of a cent lower than `amount`.
- If the position has no debt, or `amount` is zero, the call returns 0 and emits no `Repay`. It still accrues interest, so `ReservesUpdated` can be emitted.

Debt grows every second. To close a loan, use `type(uint256).max` and approve a little more than the debt you read.

## Liquidity management functions

These functions let a borrower manage a position while it stays in custody. See [managing collateral](../concepts/managing-collateral.md) for the concepts.

### The recipient rule

`collectFees`, `decreaseLiquidity` and `liquidate` pay out through PositionManager to an address the caller picks. The same addresses are refused by all three, with `InvalidRecipient(to)`:

| Refused recipient | Why |
|---|---|
| `address(0)` | The payout would go nowhere. |
| The market | The payout would sit in the market with no owner. |
| `address(1)` | PositionManager reads it as its caller, which is the market. |
| `address(2)` and PositionManager | The payout would stay in PositionManager, where anyone can sweep it. |

### `collectFees`

```solidity
function collectFees(uint256 tokenId, address to) external whenNotPaused nonReentrant
```

| Property | Value |
|---|---|
| Caller | The address the position is recorded to. |
| Market paused | Reverts. |
| Pool frozen | Works. |
| Emits | `CollectFees(tokenId, poolId, amount0, amount1)`, and `ReservesUpdated` when interest accrued. |

Claims every fee the position has earned and sends both legs to `to`, USDG first. No principal leaves.

| Check | Error |
|---|---|
| `to` passes the recipient rule | `InvalidRecipient(to)` |
| The caller is the recorded owner | `NotTheDepositor(tokenId, depositor)` |
| With debt: USDG price within 0.97 to 1.03 | `UsdgPriceOutOfBounds(price)` |
| With debt, Blue-chip: spot within 200 basis points of the oracle | `SpotPriceDeviation(deviationBps, maximumDeviationBps)` |
| With debt: health factor after the claim is at least 1 | `PositionWouldBeUnhealthy(tokenId, healthFactor)` |

The health check runs after the claim, because the claim is what lowers the health factor. A position with no debt skips the price gates and the health check.

### `decreaseLiquidity`

```solidity
function decreaseLiquidity(
    uint256 tokenId,
    uint128 liq,
    uint128 min0,
    uint128 min1,
    address to
) external whenNotPaused nonReentrant
```

| Property | Value |
|---|---|
| Caller | The address the position is recorded to. |
| Market paused | Reverts. |
| Pool frozen | Works. |
| Emits | `CollectFees(tokenId, poolId, amount0, amount1)`, then `LiquidityChanged(tokenId, poolId, liqDelta)` with a negative delta, and `ReservesUpdated` when interest accrued. |

Removes `liq` liquidity and sends the tokens to `to`, USDG first. A removal always realizes all of the position's fees as well, so `to` receives the principal of the slice plus every fee.

`min0` and `min1` are the least principal you accept for each currency. They are checked against principal only. Fees never help a removal reach its minimum.

| Check | Error |
|---|---|
| `liq` is not zero | `ZeroLiquidity()` |
| `to` passes the recipient rule | `InvalidRecipient(to)` |
| The caller is the recorded owner | `NotTheDepositor(tokenId, depositor)` |
| `liq` is not more than the position holds | `LiquidityExceedsPosition(tokenId, requested, available)` |
| Principal returned is at least `min0` and `min1` | Reverts inside PositionManager |
| What stays is still above the pool's minimum position value | `PositionBelowMinimum(principalUsd, minimumUsd)` |
| With debt: the borrow price gates pass | `UsdgPriceOutOfBounds(price)`, `SpotPriceDeviation(deviationBps, maximumDeviationBps)` |
| With debt: debt fits the borrow limit of what stays | `RemovalExceedsBorrowLimit(tokenId, debtUsd, limitUsd)` |

The borrow limit after a removal is stricter than a health factor of 1:

```text
debtUsd <= collateralValue × min(maxLtvBps, ltBps) / 10,000
```

Removing principal lowers the health factor exactly as borrowing does, so it is held to the same limit as a borrow. A position that is already above its max LTV, through price or interest, cannot remove liquidity until part of the debt is repaid.

Two consequences:

- You cannot remove all the liquidity with this function, because what stays must clear the minimum. With no debt, take the whole NFT back with `withdrawCollateral`.
- The minimum check reads oracle prices even when the position has no debt. If the oracle is unavailable the removal reverts. `withdrawCollateral` reads no price and keeps working.

### `increaseLiquidity`

```solidity
function increaseLiquidity(
    uint256 tokenId,
    uint128 liquidity,
    uint128 amount0Max,
    uint128 amount1Max,
    ISignatureTransfer.PermitBatchTransferFrom calldata permit,
    bytes calldata signature
) external payable whenNotPaused nonReentrant
```

| Property | Value |
|---|---|
| Caller | The address the position is recorded to. The caller must be the signer of the permit. |
| Market paused | Reverts. |
| Pool frozen | Reverts. |
| Emits | `CollectFees(tokenId, poolId, amount0, amount1)`, then `LiquidityChanged(tokenId, poolId, liqDelta)` with a positive delta, and `ReservesUpdated` when interest accrued. |

Adds liquidity to a position in custody. The function first claims the position's fees to the caller, then adds the liquidity. Tokens move as in `mintAndDeposit`: from Permit2 straight to PositionManager, with the change swept back to the caller, USDG first.

| Check | Error |
|---|---|
| `liquidity` is not zero | `ZeroLiquidity()` |
| The caller is the recorded owner | `NotTheDepositor(tokenId, depositor)` |
| The pool still passes the pool level admission checks | `PoolNotListed`, `PoolFrozenForNewPositions`, `WrongTier`, `TokenNotEnabled`, `PairMustQuoteInUsdg`, `HookNotPermitted` |
| `msg.value` equals `amount0Max` for a native ETH pool, and zero otherwise | `NativeValueMismatch(expected, sent)` |
| The permit lists exactly the pool's ERC-20 currencies, in pool order | `PermitDoesNotMatchPool()` |
| The addition costs no more than `amount0Max` and `amount1Max` | Reverts inside PositionManager |
| With debt: the borrow price gates pass | `UsdgPriceOutOfBounds(price)`, `SpotPriceDeviation(deviationBps, maximumDeviationBps)` |
| With debt: health factor after the whole action is at least 1 | `PositionWouldBeUnhealthy(tokenId, healthFactor)` |

The fee claim takes counted fees out of the collateral value. For a position with debt and a thin health factor, a very small addition may not replace the fees that left, and the call reverts. Add more, not less.

## Liquidator function

### `liquidate`

```solidity
function liquidate(
    uint256 tokenId,
    uint256 repayAmount,
    uint128 minOut0,
    uint128 minOut1,
    address to
) external whenNotPaused nonReentrant returns (uint256 repaid, uint256 out0, uint256 out1, uint256 badDebt)
```

| Property | Value |
|---|---|
| Caller | Anyone. The caller must have approved USDG to the market. |
| Market paused | Reverts. |
| Pool frozen | Works. |
| Emits | `ReservesUpdated(reserves)`, `BadDebtSocialized(amount)` when lenders absorb a loss, and `Liquidate(...)`. |

Repays part or all of the debt of an unhealthy position and hands collateral to the liquidator. The function has two outcomes, and the caller does not pick between them: a seizure that would reach past everything the position holds takes the whole position (full seizure), anything smaller takes a liquidity slice.

| Argument | Meaning |
|---|---|
| `tokenId` | The position to liquidate. |
| `repayAmount` | The USDG budget. It is cut down by the close factor, and again by what the position can pay for. |
| `minOut0`, `minOut1` | The least `currency0` and `currency1` you accept, measured on what you receive. |
| `to` | Where the seized tokens go. It must pass the recipient rule. |

| Return value | Meaning |
|---|---|
| `repaid` | USDG taken off the debt, including any of the borrower's own fees applied to it. |
| `out0`, `out1` | What the liquidator received in each currency, including any fee leg it bought. |
| `badDebt` | Debt the position could not cover. Non-zero only on a full seizure. |

What happens, in execution order:

1. Interest accrues.
2. The position is valued at liquidation prices. The health factor must be below 1.
3. The repay amount is capped: `repay = min(repayAmount, debt × closeFactor)`. If `repay × (1 + bonus)` reaches the realizable value of the position, `repay` is cut to `value / (1 + bonus)` and the seizure is full.
4. Liquidity slice only: the slice is removed into the market and the fees are split between liquidator and borrower.
5. USDG is pulled from the liquidator: `repay`, plus the protocol liquidation fee, plus the cost of any fee leg the liquidator has to buy.
6. The ledger is written: debt shares retired, the protocol fee added to reserves, bad debt taken from reserves first and the rest from lender funds.
7. Payout. On a full seizure the position is burned and both legs go to `to`. On a slice the market pays the liquidator and returns the borrower's part, USDG first.
8. `minOut0` and `minOut1` are checked.
9. On the Meme market a TWAP observation is recorded, last.

The protocol liquidation fee is `repay × (bonusBps / 10) / 10,000`, with `bonusBps / 10` rounded down.

| Check | Error |
|---|---|
| `to` passes the recipient rule | `InvalidRecipient(to)` |
| The market holds this position as collateral | `PositionNotCollateral(tokenId)` |
| Health factor is below 1 | `PositionIsHealthy(tokenId, healthFactor)` |
| A slice repays more than zero | `NothingToRepay(tokenId)` |
| `repayAmount` left after `repay` covers the fee leg that must be bought | `FeePurchaseUnderfunded(required, available)` |
| The liquidator received at least `minOut0` and `minOut1` | `SeizureBelowMinimum(out0, out1)` |

Liquidation does not run the borrow price gates. A USDG price outside 0.97 to 1.03, or a pool more than 2% away from the oracle, stops borrowing and leaves liquidation running.

Use `liquidationHealthFactor` and `liquidationCloseFactorBps` on [MarketLens](./market-lens.md) to decide whether and how much to liquidate. The full rules, with numbers, are on the [liquidation mechanics](../liquidations/mechanics.md) page, and a step by step guide is in the [liquidator guide](../liquidations/liquidator-guide.md).

:::info[Reported amounts on a full seizure]
On a full seizure `out0` and `out1` are the balance change of `to` across the payout. A contract recipient that moves tokens while it is being paid can distort its own figures. The ledger never reads them.
:::

## Owner functions

Every function in this section is restricted to the market owner and reverts with `OwnableUnauthorizedAccount(account)` for anyone else. The exception is `pause`, which is open to the guardian as well.

:::info[Owner powers]
The owner is a `TimelockController`, so every call in this section is scheduled on-chain and runs 2 days later at the earliest. An upgrade also waits in the market's own upgrade timelock. A `pause` from the guardian does not wait. What each power means for users is described in [owner powers](../risk/admin-powers.md).
:::

### `pause` and `unpause`

```solidity
function pause() external
function unpause() external onlyOwner
```

`pause` stops the functions marked "Reverts" in the [paused vs frozen](#paused-vs-frozen) table. `unpause` resumes them. They emit `Paused(account)` and `Unpaused(account)`, where `account` is the caller.

`pause` is open to the owner and to the guardian. Anyone else, the zero address included, gets `NotOwnerOrGuardian(caller)`. `unpause` is the owner's alone: a pause also stops liquidation, so the account that can start one is not the one that decides when it ends.

Robinhood Chain has no sequencer uptime feed, so pausing is the lever the guardian and the owner have when the sequencer or an oracle cannot be trusted.

### `setGuardian`

```solidity
function setGuardian(address newGuardian) external onlyOwner
```

Names the guardian, or removes it with the zero address. Emits `GuardianUpdated(previousGuardian, newGuardian)`. What the guardian can and cannot do is described in [owner powers](../risk/admin-powers.md#the-guardian).

### `withdrawReserves`

```solidity
function withdrawReserves(uint256 amount, address to) external onlyOwner nonReentrant
```

Sends protocol revenue to `to`, but only the part above the reserve floor and only up to the cash in the market.

```text
floor        = totalAssets × reserveFloorBps / 10,000
withdrawable = min(reserves − floor, cash)        (zero when reserves <= floor)
```

| Check | Error |
|---|---|
| `to` is not the zero address and not the market | `InvalidRecipient(to)` |
| `amount` is at most the withdrawable amount | `ReserveWithdrawalExceedsAvailable(amount, available)` |

Emits `ReservesUpdated(reserves)` and `ReservesWithdrawn(amount, to)`. The withdrawal does not change `totalAssets`, so the share price does not move.

The floor limits what the owner can take. It does not limit what reserves are for: bad debt can use all of the reserves, including the part below the floor. See [protocol fees and reserves](../concepts/protocol-fees-and-reserves.md).

### `rescueUnaccountedToken`

```solidity
function rescueUnaccountedToken(uint256 tokenId, address to) external onlyOwner nonReentrant
```

Sends out a position NFT that reached the market without being recorded, for example through a plain transfer. It refuses any position that has a loan record, so it cannot be used on deposited collateral.

| Check | Error |
|---|---|
| `to` is not the zero address and not the market | `InvalidRecipient(to)` |
| The position has no loan record | `PositionIsCollateral(tokenId)` |

Emits `UnaccountedTokenRescued(tokenId, to)`.

### `rescueUnaccountedEth`

```solidity
function rescueUnaccountedEth(address to) external onlyOwner nonReentrant
```

Sends the whole native ETH balance of the market to `to`. The market never holds ETH between transactions: every path that receives ETH pays all of it out in the same call. ETH found in the market was sent by mistake.

Reverts with `InvalidRecipient(to)` for the zero address and the market. Emits `UnaccountedEthRescued(amount, to)`.

There is no rescue function for ERC-20 tokens.

### `scheduleUpgrade`

```solidity
uint256 public constant TIMELOCK_DELAY = 2 days;
uint256 public constant TIMELOCK_GRACE = 14 days;

function scheduleUpgrade(address newImplementation) external onlyOwner
```

Schedules `newImplementation` to replace the current implementation. It can be installed from `eta = block.timestamp + TIMELOCK_DELAY`. The schedule records the hash of the code at the address, and an upgrade is held to that hash.

| Check | Error |
|---|---|
| `newImplementation` is not the zero address | `ZeroAddress()` |
| The address holds code | `ImplementationHasNoCode(implementation)` |
| The code does not start with `0xEF`, which marks an account that only points to other code | `ImplementationIsAPointer(implementation)` |
| No other upgrade is scheduled | `UpgradeAlreadyScheduled(implementation)` |

Emits `UpgradeScheduled(newImplementation, eta)` and `UpgradeCodeBound(newImplementation, codehash)`.

One upgrade waits at a time. No sequence of calls brings an `eta` forward: cancelling and scheduling again starts a full delay.

### `cancelUpgrade`

```solidity
function cancelUpgrade() external onlyOwner
```

Withdraws the scheduled upgrade when it runs. Reverts with `NoUpgradeScheduled()` when nothing is scheduled. Emits `UpgradeCancelled(newImplementation)`.

### `upgradeToAndCall`

Inherited from OpenZeppelin.

```solidity
function upgradeToAndCall(address newImplementation, bytes memory data) public payable virtual onlyProxy
```

Replaces the implementation of the proxy. Only the owner can call it, and only for the implementation that was scheduled.

| Check | Error |
|---|---|
| `newImplementation` is the scheduled implementation | `UpgradeNotScheduled(implementation)` |
| `block.timestamp` is at or after the `eta` | `UpgradeNotReady(implementation, eta)` |
| `block.timestamp` is at most `eta + TIMELOCK_GRACE` | `UpgradeExpired(implementation, expiredAt)` |
| The code at the address has the hash that was scheduled | `ImplementationCodeChanged(implementation, scheduled, found)` |

Emits `Upgraded(implementation)`. The upgrade uses up its schedule, so installing the same implementation a second time takes a new schedule and a new delay. A call that reverts leaves the schedule as it was.

`data` is not part of the schedule. It is run by the scheduled implementation.

What the timelock means for users is described in [owner powers](../risk/admin-powers.md#the-upgrade-timelock).

### Ownership

These functions are inherited from OpenZeppelin.

```solidity
function transferOwnership(address newOwner) public virtual override onlyOwner
function acceptOwnership() public virtual
function renounceOwnership() public virtual onlyOwner
```

- `transferOwnership` nominates a new owner and emits `OwnershipTransferStarted`. The transfer completes when the nominee calls `acceptOwnership`, which emits `OwnershipTransferred`.

## Views on the market

All views use the ledger as of the last accrual. They do not add the interest that has built up since. For values that include it, call `accrue` first or use the projected views on [MarketLens](./market-lens.md).

| Function | Returns |
|---|---|
| `tier() returns (ICollateralPolicy.Tier)` | The tier of this market: `1` for Blue-chip, `2` for Meme. |
| `loanOf(uint256 tokenId) returns (MarketLedger.Loan memory)` | The record of a position, or a zeroed record if there is none. |
| `debtOf(uint256 tokenId) returns (uint256)` | The debt of a position, in USDG. |
| `poolDebt(PoolId poolId) returns (uint256)` | The total debt against one pool, in USDG. Compared with the pool's debt cap. |
| `totalBorrows() returns (uint256)` | The total debt of the market, in USDG. |
| `totalBorrowShares() returns (uint256)` | The total of all debt shares. |
| `borrowIndex() returns (uint256)` | The interest index, scaled by 1e18. |
| `lastAccrual() returns (uint256)` | The timestamp of the last accrual. |
| `reserves() returns (uint256)` | Protocol reserves, in USDG. |
| `totalReservesWithdrawn() returns (uint256)` | The running total of reserves the owner has withdrawn. |
| `reserveFloorBps() returns (uint16)` | The reserve floor rate, in basis points. |
| `paused() returns (bool)` | Whether the market is paused. |
| `guardian() returns (address)` | The account that may pause besides the owner, or zero when there is none. |
| `pendingUpgrade() returns (address implementation, uint256 eta)` | The scheduled implementation and the earliest time it can be installed. Both are zero when nothing is scheduled. |
| `pendingUpgradeCodehash() returns (bytes32)` | The hash of the code the scheduled implementation held when it was scheduled, or zero when nothing is scheduled. |
| `TIMELOCK_DELAY() returns (uint256)`, `TIMELOCK_GRACE() returns (uint256)` | The upgrade delay (2 days) and the installation window after it (14 days), in seconds. |
| `owner() returns (address)`, `pendingOwner() returns (address)` | The owner and the nominated owner. |
| `positionManager()`, `policy()`, `valuer()`, `oracle()`, `interestRateModel()` | The addresses of the dependencies. |

Health factor, borrowing capacity and reserve availability are on [MarketLens](./market-lens.md).

## Native ETH

```solidity
receive() external payable
```

The market accepts native ETH because pools with ETH as `currency0` pay out in ETH. During a liquidation slice the ETH passes through the market and leaves in the same call.

If a borrower's contract refuses ETH during a liquidation payout, the market wraps that amount and sends it as WETH. A borrower cannot block its own liquidation by refusing a payment.

## Related pages

- [Contract architecture](./architecture.md)
- [MarketLens](./market-lens.md)
- [Events](./events.md)
- [Errors](./errors.md)
- [Risk parameters](./risk-parameters.md)
- [Health factor](../concepts/health-factor.md)
- [Liquidation mechanics](../liquidations/mechanics.md)
