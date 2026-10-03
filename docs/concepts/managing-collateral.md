---
title: Managing a position while it is collateral
description: Claim fees, add liquidity and remove liquidity on a position in Farmenta custody, and the checks each action must pass.
sidebar_position: 7
---

## Your position keeps working

Depositing a position as collateral does not freeze it. While the market holds the NFT, you can still do the three things a liquidity provider normally does:

- claim the swap fees it has earned (`collectFees`),
- add liquidity to it (`increaseLiquidity`),
- remove part of its liquidity (`decreaseLiquidity`).

It is like a rental flat that you have mortgaged. You still collect the rent and you can still renovate. What you cannot do is strip the flat until it is worth less than the bank is comfortable with.

## A small example

Budi's position has $20,000 of principal and $300 of unclaimed fees. He owes 12,000 USDG on the Blue-chip market (max LTV 65%, LT 75%).

**Claiming fees.** He calls `collectFees`. The $300 leaves the position.

```text
HF before = $20,300 × 75% / $12,000 = 1.269
HF after  = $20,000 × 75% / $12,000 = 1.250    (at least 1, so the claim goes through)
```

**Removing liquidity.** He then tries to remove 10% of the liquidity.

```text
principal left = $18,000
borrow limit   = $18,000 × 65% = $11,700
debt           = $12,000        (above the limit, so the removal is refused)
```

Removing 5% would work: $19,000 × 65% = $12,350, which covers the $12,000 debt.

## The three functions at a glance

| | `collectFees` | `increaseLiquidity` | `decreaseLiquidity` |
|---|---|---|---|
| What it does | Pays out all unclaimed fees | Adds liquidity. Claims all unclaimed fees first. | Removes part of the liquidity. Pays out the principal of that slice and all unclaimed fees. |
| Who may call | The depositor | The depositor | The depositor |
| Tokens go to | `to` | Fees and change go to the caller | `to` |
| Check after the action, with debt | `HF >= 1` | `HF >= 1` | `debtUsd <= collateralUsd × min(maxLTV, LT)` |
| Price gate, with debt | Yes | Yes | Yes |
| Minimum value floor on what remains | Not checked | Not checked | Always checked, with or without debt |
| Pool frozen | Works | Refused | Works |
| Market paused | Stops | Stops | Stops |
| Events | `CollectFees` | `CollectFees`, then `LiquidityChanged` (positive) | `CollectFees`, then `LiquidityChanged` (negative) |

Only the recorded depositor of a position can call these functions. Anyone else gets `NotTheDepositor`. None of them charges a protocol fee.

"With debt" matters: a position that owes nothing skips the health check and the price gate, because there is no loan to protect.

## Claiming fees

```solidity
function collectFees(uint256 tokenId, address to) external;
```

Uniswap v4 has no separate collect action. The market removes zero liquidity from the position, which pays out the entire fee balance and no principal.

- Both fee tokens go to `to`, native ETH included.
- With debt, the claim passes the [price gate](./price-oracles.md) and must leave `HF >= 1`. Otherwise it reverts with `PositionWouldBeUnhealthy`.
- Fees count as collateral only up to 10% of principal, so claiming them can lower your health factor by a limited amount.
- The `CollectFees` event reports the fees the position had earned, read just before the claim.

## Adding liquidity

```solidity
function increaseLiquidity(
    uint256 tokenId,
    uint128 liquidity,
    uint128 amount0Max,
    uint128 amount1Max,
    ISignatureTransfer.PermitBatchTransferFrom calldata permit,
    bytes calldata signature
) external payable;
```

You choose how much liquidity to add and the most you are willing to pay in each token. You sign a Permit2 batch transfer for the ERC-20 tokens.

- **The pool must still be acceptable.** Before any token moves, the pool passes the same pool checks as a new deposit: listed, not frozen, right tier, both tokens enabled, quoted in USDG, hook permitted. New capital does not go where the policy refuses new positions.
- **Fees are claimed first and sent to you.** The function claims the position's unclaimed fees to the caller, then adds the liquidity. There is no `to` argument.
- **Tokens go through Permit2 directly to `PositionManager`.** They never pass through the market. `PositionManager` pays for the addition from what it received and sends the change back to you in the same transaction.
- **Native ETH.** For a pool that uses native ETH, `msg.value` must equal `amount0Max` exactly. For a pair of two ERC-20 tokens it must be zero. Otherwise the call reverts with `NativeValueMismatch`.
- **Permit contents.** The permit must list exactly the pool's ERC-20 currencies, in pool order (`PermitDoesNotMatchPool` otherwise). The caller must be the signer. The permit's deadline is also the deadline of the liquidity action.
- **`liquidity = 0` is rejected** with `ZeroLiquidity`. To claim fees only, use `collectFees`.
- **With debt**, the position passes the price gate and must have `HF >= 1` after the whole action.

### Sizing the maximums

`amount0Max` and `amount1Max` are the only upper bound the contract holds an addition to. Compute what the addition takes of each token at the pool's current price, and add your slippage tolerance:

```text
amount0Max = need of currency0 at the pool's price × (1 + tolerance), rounded up
amount1Max = need of currency1 at the pool's price × (1 + tolerance), rounded up
```

The need follows from the pool's price and tick, the position's range and the liquidity you add, with the same arithmetic the pool uses. Below the range an addition takes only `currency0`, above it only `currency1`, and inside it both.

Sign the permit for exactly these maximums, and approve Permit2 for no more than them. A loose maximum, such as your whole balance, removes the protection: if the pool's price is pushed before your transaction is mined, the same liquidity can cost far more of one token, and the maximum is what makes that addition revert with `MaximumAmountExceeded` instead of paying it.

If the price moves past your maximums, take a new quote instead of widening the tolerance.

One detail surprises people. The fee claim takes counted fees out of the collateral value. If your position is close to `HF = 1` and the addition is too small to replace the fees that left, the call reverts with `PositionWouldBeUnhealthy`. The fix is to add more, not less.

## Removing liquidity

```solidity
function decreaseLiquidity(
    uint256 tokenId,
    uint128 liq,
    uint128 min0,
    uint128 min1,
    address to
) external;
```

- **`to` receives the principal of the slice and every unclaimed fee.** Removing liquidity always pays out the whole fee balance, however small the slice.
- **`min0` and `min1` bound principal only.** They are your slippage protection: the least amount of each token the removal must return. Fees are paid out as well but never count toward the minimums, so size them from the principal of the slice.
- **`liq = 0` is rejected** with `ZeroLiquidity`. Use `collectFees`.
- **More than the position holds is rejected** with `LiquidityExceedsPosition`.

### Sizing the minimums

Take the principal of the slice from the pool, at the pool's own price, and subtract your slippage tolerance:

```text
min0 = quoted principal of currency0 × (1 − tolerance), rounded down
min1 = quoted principal of currency1 × (1 − tolerance), rounded down
```

Do not size them from `PositionValuer.value`. The valuer splits a position at the price derived from the oracle, and the pool pays at its spot price. On the Blue-chip market a position with a loan may remove liquidity while the two are up to 2% apart, and a small difference in price is a larger difference in how much of each token a position holds. A minimum taken from the valuer can be above what the pool pays, and the removal then reverts with `MinimumAmountInsufficient` although no price has moved.

One way to read the exact figure is to simulate the call with a minimum that cannot be met. `PositionManager` reverts with `MinimumAmountInsufficient(minimumAmount, amountReceived)`, and `amountReceived` is the principal the pool would pay for that token, fees apart. Simulate once with `min0` at the maximum and `min1` at zero, and once the other way round.

If the price moves past your minimums before the transaction is mined, the removal reverts and nothing leaves the position. Take a new quote instead of widening the tolerance.

### The minimum value floor

What stays in custody must still clear the pool's minimum position value ($5 or more), measured exactly as at deposit: principal after the removal haircut, fees excluded.

```text
principalUsd × (1 − removalHaircut) >= minPositionUsd
```

This applies whether or not the position has debt. Otherwise a position could be emptied to dust while it owes nothing and be borrowed against a moment later.

The consequence: **the whole position never leaves through `decreaseLiquidity`**. To take everything out, repay the debt and call `withdrawCollateral`, which returns the NFT itself.

Because the floor is measured in USD, `decreaseLiquidity` needs a working price even when the position has no debt. `withdrawCollateral` reads no price.

### The borrow limit check

With debt, what you owe must still fit the borrowing limit of what is left:

```text
debtUsd <= collateralUsd × min(maxLTV, LT)
```

This is stricter than `HF >= 1`. Removing principal lowers the health factor exactly like borrowing, so it is held to the same limit as a borrow. With only `HF >= 1`, you could borrow at max LTV, then remove liquidity until the loan sat at the liquidation threshold, and the safety margin between the two would be gone.

The lower of max LTV and LT is used because a frozen pool can have an LT at or below its max LTV. In that case LT is the binding limit, so a removal never leaves a position that could be liquidated at once.

If the check fails, the call reverts with `RemovalExceedsBorrowLimit`.

:::warning[A position above max LTV cannot remove liquidity]
If price moves or interest have already pushed your LTV above the pool's max LTV, every removal is refused until you repay part of the debt.
:::

## In the Farmenta app

The app sends all three for you, from the row of a deposited position on the Portfolio page. The recipient is always the connected wallet.

- **Collect fees** opens a panel that shows what you receive in each token, for example "0.0005 ETH and 1.13 USDG", with the button that collects it. A position with a loan also shows a note that the fees count as collateral. On the pool's page the same amounts and a "Collect" button are in the card of the selected position. Both are hidden while the position has no fees.
- **Add liquidity** opens a panel where you choose to add 25%, 50% or 100% of the liquidity the position already holds. For each token it shows what the addition takes at the pool's price now, the most you agree to pay, and what your wallet holds. Your wallet is asked three things in turn: to approve each ERC-20 token for exactly its maximum, to sign a Permit2 permit for the same amounts, and to confirm the transaction. In the ETH pool the ETH is sent with the transaction and needs no approval. What the addition does not take comes back in the same transaction, together with the position's fees.
- **Remove liquidity** opens a panel where you choose 25%, 50% or 75% of the position's liquidity. For each token it shows the principal the pool pays now, the fees that leave with it, and the minimum the transaction accepts.

Both liquidity panels read their quote from the pool and refresh it every 15 seconds. The slippage tolerance is 0.5% of each token unless you change it. Above 1% the panel shows a warning, and above 5% it refuses. If the price moves past the maximums of an addition or the minimums of a removal, nothing is sent and the panel offers a new quote at the same tolerance. For an addition that check runs before anything is approved or signed.

A refusal is shown as a sentence, with what to do about it: remove less, add more, or repay part of the loan.

## Rules shared by all three

### The price gate

While the position has debt, each action passes the same price gate as `borrow`. Value must not leave a position at a price the market would refuse to lend against.

| Market | Gate |
|---|---|
| Blue-chip | USDG inside 0.97 to 1.03, and pool spot within 2% of the Chainlink derived price |
| Meme | USDG inside 0.97 to 1.03, a 30 minute TWAP available, meme token valued at `min(spot, TWAP)` |

On the Meme market each of these actions also records a TWAP observation for the pool before it prices the position. See [price oracles](./price-oracles.md).

### Recipients that are rejected

`collectFees` and `decreaseLiquidity` revert with `InvalidRecipient` if `to` is one of:

| Rejected `to` | Reason |
|---|---|
| The zero address | The tokens would go nowhere |
| The market itself | The tokens would be stranded in the market |
| `address(1)` | `PositionManager` reads it as "my caller", which is the market |
| `address(2)` | `PositionManager` reads it as "myself" |
| The `PositionManager` address | Tokens left there can be swept by anyone |

The same rule applies to the recipient of a liquidation.

### USDG is always paid out first

Every payout is made one token at a time, and the USDG leg always goes first. In a native ETH pool, sending ETH runs the recipient's code. The same order applies to the change returned by `mintAndDeposit` and `increaseLiquidity`, and to the payout of a partial liquidation. A full seizure is the exception: the position is burned and both tokens go to the liquidator in pool order, after the ledger has been written.

### Frozen pools and paused markets

| State | `collectFees` | `increaseLiquidity` | `decreaseLiquidity` |
|---|---|---|---|
| Pool frozen | Works | Refused | Works |
| Market paused | Stops | Stops | Stops |

A frozen pool takes no new capital, but it never traps what is already there. A pause stops all three, because each of them can rely on an oracle price. While paused you can still repay, and you can still withdraw a position that has no debt. See [pool listing](./pool-listing.md) and [pause and emergency](../risk/pause-and-emergency.md).

## Related pages

- [Collateral: Uniswap v4 positions](./collateral.md)
- [Health factor, LTV and liquidation threshold](./health-factor.md)
- [How positions are valued](./position-valuation.md)
- [FarmentaMarket reference](../reference/farmenta-market.md)
- [Errors reference](../reference/errors.md)
