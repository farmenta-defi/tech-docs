---
title: "Collateral: Uniswap v4 positions"
description: How Farmenta takes custody of a Uniswap v4 position NFT, which positions it accepts, and how you get your position back.
sidebar_position: 1
---

## What you deposit

On Farmenta you do not deposit a token as collateral. You deposit a whole Uniswap v4 liquidity position.

Think of a pawn shop that accepts a working vending machine instead of a watch. The machine stays plugged in and keeps selling while it sits in the shop. Your position keeps providing liquidity and keeps earning swap fees while it backs your loan.

A small example: Budi holds an ETH/USDG position worth $20,300. He deposits it into the Blue-chip market and can then borrow up to 13,195 USDG (65% of its value). The position stays in its pool, in the same price range, earning fees the whole time.

## What a Uniswap v4 position is

When you provide liquidity on Uniswap v4, the Uniswap `PositionManager` contract mints an NFT (an ERC-721 token) to you. That NFT represents:

- a pool (two currencies, a fee setting, a tick spacing and an optional hook),
- a price range, stored as a lower and an upper tick,
- an amount of liquidity inside that range,
- the swap fees the position has earned and not yet claimed.

Whoever owns the NFT controls the liquidity. See the [Uniswap v4 documentation](https://docs.uniswap.org/contracts/v4/overview) for the details of positions and ticks.

## Real custody, not a lock

While a position is collateral, the market contract is the owner of the NFT. This is a real transfer of ownership, not a flag or a lien.

The reason is practical. `PositionManager` only lets the NFT owner (or an address the owner approved) remove liquidity or burn a position. A liquidation has to remove liquidity, so the market must own the NFT for liquidations to be possible.

You remain the recorded depositor. The market stores one loan record per position:

| Field | Meaning |
|---|---|
| `owner` | The address that deposited the position. Only this address can borrow against it, manage it and withdraw it. |
| `debtShares` | What is owed against this position (see [interest rates](./interest-rates.md)). |
| `poolKeyId` | The pool the position sits in, used for the per pool debt cap. |
| `tier` | The tier the position was accepted under. |

Debt is tracked per position. Two positions from the same wallet are two separate loans with two separate health factors.

How the market contract is administered is described in [owner powers](../risk/admin-powers.md).

## Three ways to deposit

```solidity
function depositCollateral(uint256 tokenId) external;

function depositCollateralWithPermit(
    uint256 tokenId,
    uint256 deadline,
    uint256 nonce,
    bytes calldata signature
) external;

function mintAndDeposit(
    MintParams calldata p,
    ISignatureTransfer.PermitBatchTransferFrom calldata permit,
    bytes calldata signature
) external payable returns (uint256 tokenId);
```

### Approve, then deposit

Approve the market for your position on `PositionManager`, then call `depositCollateral(tokenId)`. Two transactions. The position is recorded to the caller.

### One signature with a permit

`depositCollateralWithPermit` uses the permit built into the Uniswap position NFT. You sign a message off-chain, and one transaction approves and deposits.

The position is recorded to the NFT owner (the signer), not to whoever submits the transaction. A relayer can pay the gas for you without gaining any rights over the position.

:::info[For integrators]
The signature is Uniswap's own `ERC721Permit_v4` permit, not a generic standard. Its EIP-712 domain contains `name`, `chainId` and `verifyingContract`, and no `version` field. A signature built over a four field domain is always rejected. The function arguments are ordered deadline then nonce, while the signed struct hashes nonce then deadline. Nonces are unordered: any unused nonce works.
:::

### Mint straight into custody

If you hold tokens and not a position yet, `mintAndDeposit` creates a new position and records it as your collateral in one transaction. You choose the pool, the tick range and the liquidity, and you sign a Permit2 batch transfer for the ERC-20 tokens.

- Your tokens go from Permit2 directly to `PositionManager`. They never pass through the market.
- Each token is pulled at the maximum you signed (`amount0Max`, `amount1Max`). Whatever the mint does not use is sent back to you in the same transaction.
- For a pool that uses native ETH, `msg.value` must equal `amount0Max` exactly. For a pair of two ERC-20 tokens, `msg.value` must be zero.
- The permit must list exactly the pool's ERC-20 currencies, in pool order.
- The caller must be the signer of the Permit2 message.

A position minted this way gets no leniency. It passes the same acceptance checks as any deposit, and if it fails, the whole transaction reverts and you keep your tokens.

All deposit paths stop while the market is paused. No fee is charged for depositing.

## Acceptance checks

Every deposit path runs the same checks. If one fails, the transaction reverts with an error that names the rule.

| Check | Rule | Error |
|---|---|---|
| Pool is listed | The owner has listed this exact pool | `PoolNotListed` |
| Pool is not frozen | Frozen pools take no new collateral | `PoolFrozenForNewPositions` |
| Tier matches the market | Blue-chip market takes Blue-chip pools, Meme market takes Meme pools | `WrongTier` |
| Both tokens enabled | Each currency of the pool is enabled in the token configuration | `TokenNotEnabled` |
| Quoted in USDG | One of the two currencies is USDG | `PairMustQuoteInUsdg` |
| Hook permission bits | The hook passes the bit check, or is individually allowlisted | `HookNotPermitted` |
| Liquidity is not empty | The position holds liquidity greater than zero | `PositionIsEmpty` |
| Minimum value | Principal after the removal haircut is at least the pool minimum ($50 or more) | `PositionBelowMinimum` |

The minimum value is measured on principal only. Unclaimed fees do not count toward it, because fees can be claimed one transaction later. See [how positions are valued](./position-valuation.md) and [pool listing](./pool-listing.md).

### Hook permission bits in plain words

A Uniswap v4 pool can have a hook: a contract that runs extra code at certain moments, for example before a swap or after liquidity is removed. Uniswap encodes which callbacks a hook can run in the lowest 14 bits of the hook's own address. The permissions can therefore be read from the address alone, without calling the hook and without trusting it.

Farmenta rejects a hook whose address carries any of these five flags:

| Flag | Why it is refused |
|---|---|
| `beforeRemoveLiquidity` | The hook could block a liquidity removal, which is what liquidation and withdrawal depend on. |
| `afterRemoveLiquidity` | Same: it runs on every removal and could make it fail. |
| `afterRemoveLiquidityReturnsDelta` | The hook could take a cut of the tokens that leave the position. |
| `afterAddLiquidityReturnsDelta` | The hook could charge whoever adds liquidity, which would bill you during `mintAndDeposit` or `increaseLiquidity` without adding to your collateral. |
| `beforeAddLiquidity` | The hook runs before liquidity is added and could move the pool price first, so you would add at a price the hook chose during `mintAndDeposit` or `increaseLiquidity`. |

A pool with no hook passes. A hook that carries one of these flags is accepted only if the owner has put that exact hook address on the allowlist after reviewing its source code.

Passing the bit check is never enough on its own. The pool still has to be listed.

## Positions sent directly to the market

If you send a position to the market with `safeTransferFrom`, the market runs exactly the same acceptance checks and records the position to the address the NFT came from (the `from` argument of the transfer, which is the previous owner even when an approved operator sends it). If a check fails, the transfer reverts and the NFT never leaves your wallet.

:::warning[Do not use a plain transfer]
A plain `transferFrom`, or minting a position with the market as its owner, does not notify the market. The NFT arrives but no loan record is created, so you cannot withdraw it yourself. Only the owner account can return such a position, with `rescueUnaccountedToken`. That function refuses any position that has a loan record, so it cannot be used on collateral that somebody deposited.
:::

## When the price leaves your range

A position is never liquidated merely for being out of range. Only the [health factor](./health-factor.md) matters.

| Situation | What the position holds | Effect on your loan |
|---|---|---|
| Price of the risk token falls below the range | 100% risk token (ETH or the meme token), no USDG | The value now follows the risk token one to one. If the price keeps falling, the health factor falls and liquidation becomes possible once `HF < 1`. |
| Price inside the range | A mix of both tokens | The value moves with the price, more slowly than the risk token alone. |
| Price of the risk token rises above the range | 100% USDG | The value stops moving with the risk token. This is the safer side for a loan. |

Out of range positions earn no swap fees, in Farmenta custody or outside it.

## Getting your position back

```solidity
function withdrawCollateral(uint256 tokenId, address to) external;
```

Once the debt against a position is zero, the depositor calls `withdrawCollateral` and the NFT is sent to the address they choose.

- Only the recorded depositor can call it.
- It reverts with `OutstandingDebt` while any debt remains. Repay in full first (`repay` with the maximum `uint256` value clears the whole debt).
- It works while the market is paused and while the pool is frozen. A position with no debt belongs entirely to its depositor.
- `to` cannot be the zero address or the market itself. The NFT is sent with a safe transfer, so a contract recipient must be able to receive ERC-721 tokens.
- No fee is charged.

## Related pages

- [How positions are valued](./position-valuation.md)
- [Health factor, LTV and liquidation threshold](./health-factor.md)
- [Managing a position while it is collateral](./managing-collateral.md)
- [Pool listing, freezing and LT ramps](./pool-listing.md)
- [FarmentaMarket reference](../reference/farmenta-market.md)
