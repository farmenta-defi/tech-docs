---
title: PriceOracle
description: Reference for the Farmenta price oracle, covering Chainlink prices for ETH and USDG and TWAP based prices for meme tokens.
sidebar_position: 5
---

## What this contract is for

`PriceOracle` gives the USD price of every token Farmenta accepts. ETH and USDG come from Chainlink feeds. Meme tokens have no Chainlink feed, so their price comes from the pool itself, through the [TwapRecorder](./twap-recorder.md).

The oracle has two price surfaces: one for borrowing and one for liquidation. Think of a shop with a cautious buying price and a separate price for settling accounts. The borrowing price is the careful one. The liquidation price is built to keep working in the conditions where the borrowing price refuses to answer.

A small example: a meme token trades at $0.0010 in its pool and its 30 minute TWAP is $0.0012. For borrowing the oracle returns the lower of the two, $0.0010. For liquidation it returns the TWAP, $0.0012, because the spot price is not more than 25% below it.

The oracle has no owner and cannot be changed. Its address is published on the [addresses page](./addresses.md) after deployment.

## Contract summary

```solidity
contract PriceOracle is IPriceOracle
```

```solidity
constructor(ICollateralPolicy policy_, TwapRecorder recorder_)
```

The constructor reverts with `TwapRecorderNotConfigured()` when the recorder is the zero address.

| Item | Declaration | Value |
|---|---|---|
| Staleness limit | `uint256 public constant MAX_PRICE_AGE = 25 hours` | 90,000 seconds |
| Price scale | `uint8 internal constant USD_DECIMALS = 18` | USD for one whole token, scaled by 1e18 |
| Policy | `ICollateralPolicy public immutable policy` | Source of each token's tier, decimals and feed |
| Recorder | `TwapRecorder public immutable recorder` | Source of the meme TWAP |
| TWAP window | `recorder.consult(poolId, 1800)` | 1,800 seconds (30 minutes) |
| Crash threshold | `TierPresets.MEME_CRASH_THRESHOLD_BPS` | `2500` (25%) |
| Stale haircut | `TierPresets.MEME_STALE_HAIRCUT_BPS` | `2000` (20%) |

The oracle keeps no token list of its own. The feed address, tier and decimals of each token are read from `CollateralPolicy.tokenConfig` on every call.

## Functions

### `price`

```solidity
function price(Currency currency) public view returns (uint256 usd1e18)
function price(Currency currency, PoolKey calldata key) external view returns (uint256 usd1e18)
```

The borrowing price of one whole token in USD, scaled by 1e18.

- The one argument form always reads the token's Chainlink feed. It reverts with `PriceFeedNotConfigured(currency)` for a token without a feed, which includes every meme token.
- The two argument form is the one used for valuing positions. For a token that is not in the Meme tier it ignores `key` and returns the Chainlink price. For a Meme tier token it returns `min(spot, TWAP)` of that pool.

On the Chainlink path the oracle never returns zero or a stale value. It reverts instead. A meme price is rounded down to whole USDG units (0.000001 USDG) per token, so a token priced below that returns zero and the valuation reverts with `ZeroPrice()`.

### `priceForLiquidation`

```solidity
function priceForLiquidation(Currency currency) external view returns (uint256 usd1e18)
function priceForLiquidation(Currency currency, PoolKey calldata key) external view returns (uint256 usd1e18)
```

The price used to decide whether a position can be liquidated and how much is seized.

- For a token that is not in the Meme tier it is the same Chainlink price as `price`.
- For a Meme tier token it is the TWAP, the spot price in a crash, or the spot price with a haircut when the TWAP is unavailable. See [the meme path](#the-meme-path).

### `decimals`

```solidity
function decimals(Currency currency) external view returns (uint8)
```

The decimals of a token as recorded in the policy. They are not read from the token contract. Native ETH is recorded as 18, USDG as 6.

### `record`

```solidity
function record(PoolKey calldata key) external
```

Records a TWAP observation when one of the pool's tokens is in the Meme tier. For any other pool it does nothing. Anyone can call it.

The Meme market calls it whenever collateral comes in, on `borrow`, `collectFees`, `increaseLiquidity` and `decreaseLiquidity`, and at the end of `liquidate`. The Blue-chip market never calls it.

## The Chainlink path

Used for ETH, WETH and USDG. The oracle calls `latestRoundData()` on the feed and applies three checks.

| Check | Error |
|---|---|
| A feed is configured for the token | `PriceFeedNotConfigured(currency)` |
| The answer is above zero | `InvalidPrice(currency, answer)` |
| `updatedAt` is not zero, not in the future, and not older than 25 hours | `StalePrice(currency, updatedAt)` |

The answer is then scaled from the feed's decimals to 18 decimals. A Chainlink USD feed with 8 decimals that answers `250000000000` becomes `2500000000000000000000`, which is $2,500.

The staleness limit of 25 hours leaves one hour of slack over a feed that updates at least once every 24 hours.

### USDG bounds

The oracle returns the USDG price as the feed reports it. It does not clamp the price to $1.00 and it does not reject a price that has moved away from $1.00.

The bounds are enforced by the market, on the borrowing side only:

```solidity
uint256 private constant USDG_MIN_PRICE = 0.97e18;
uint256 private constant USDG_MAX_PRICE = 1.03e18;
```

| Action | USDG price outside 0.97 to 1.03 |
|---|---|
| `borrow` | Reverts with `UsdgPriceOutOfBounds(price)`. |
| `collectFees`, `increaseLiquidity`, `decreaseLiquidity` on a position with debt | Reverts with `UsdgPriceOutOfBounds(price)`. |
| The same three functions on a position without debt | Not checked. |
| `liquidate` | Not checked. Liquidation uses the price as reported. |
| `repay`, `withdrawCollateral`, vault functions | No price is read. |

Debt is converted to USD at the same USDG price that values the USDG side of the collateral, so both sides of the health factor use one price.

### Spot deviation on the Blue-chip market

The market applies one more gate on the borrowing side of the Blue-chip market: the pool's spot price must be within 200 basis points (2%) of the price derived from the oracle. The deviation is measured by [PositionValuer](./position-valuer.md) and enforced by the market with `SpotPriceDeviation(deviationBps, maximumDeviationBps)`. Liquidation does not apply it.

## The meme path

Used for a token whose tier is Meme, and only through the two argument functions.

### Building the price

```text
quoteRaw  = USDG received for one whole meme token at the given tick
priceUsd  = quoteRaw × price(USDG) / 10^decimals(USDG)
```

The oracle computes this twice: once at the pool's current tick (the spot price) and once at the TWAP tick from `recorder.consult(poolId, 1800)`. The USDG price is the Chainlink price, with the checks above.

### Choosing the price

| Situation | Borrowing price | Liquidation price |
|---|---|---|
| TWAP available, spot not more than 25% below TWAP | `min(spot, TWAP)` | TWAP |
| TWAP available, `spot < TWAP × 0.75` (a crash) | spot | spot |
| TWAP unavailable (stale mode) | Reverts with `MemeTwapUnavailable(poolId)` | `spot × 0.80` |

In code:

```solidity
try recorder.consult(poolId, 1800) returns (int24 twapTick) {
    uint256 twap = _memePrice(currency, currency0, twapTick);
    if (!forLiquidation) return spot < twap ? spot : twap;
    if (spot < FullMath.mulDiv(twap, 10_000 - TierPresets.MEME_CRASH_THRESHOLD_BPS, 10_000)) {
        return spot;
    }
    return twap;
} catch {
    if (!forLiquidation) revert MemeTwapUnavailable(poolId);
    return FullMath.mulDiv(spot, 10_000 - TierPresets.MEME_STALE_HAIRCUT_BPS, 10_000);
}
```

Why each rule exists:

- **`min(spot, TWAP)` for borrowing.** Pushing the pool price up for a moment does not raise the borrowing price, because the TWAP lags. A price that has just fallen is used at once.
- **TWAP for liquidation.** A short dip in the pool does not make positions liquidatable.
- **Spot in a crash.** When the price has really fallen by more than 25%, the TWAP is too slow, and waiting for it would let losses grow.
- **Stale mode.** When nobody has recorded the pool for more than 900 seconds, or the recorder has less than 30 minutes of history, the TWAP is unavailable. The borrowing price then reverts with `MemeTwapUnavailable`, so the lens views `healthFactor`, `maxBorrow` and `positionValue` revert. `borrow`, `collectFees`, `increaseLiquidity` and `decreaseLiquidity` record a fresh observation first, so they are refused only while the pool has less than 30 minutes of recorded history. Liquidation continues on the spot price with a 20% haircut, so an unavailable TWAP never makes a position impossible to liquidate.

### Worked numbers

TWAP $0.0012, USDG at $1.00.

| Spot | Borrowing price | Liquidation price | Reason |
|---|---|---|---|
| $0.0013 | $0.0012 | $0.0012 | Spot above TWAP. |
| $0.0010 | $0.0010 | $0.0012 | Spot below TWAP, but not below $0.0009. |
| $0.0008 | $0.0008 | $0.0008 | Spot below `0.0012 × 0.75 = 0.0009`. |
| $0.0010, TWAP unavailable | Reverts | $0.0008 | `0.0010 × 0.80`. |

### Meme path errors

| Check | Error |
|---|---|
| The token is one of the two currencies of the pool | `MemeCurrencyNotInPool(currency, poolId)` |
| The pool is initialized (its price is not zero) | `MemeSpotUnavailable(poolId)` |
| Borrowing price: the TWAP is available | `MemeTwapUnavailable(poolId)` |

:::warning[Meme prices come from the pool]
The meme path has no source outside the pool. The spot price is whatever the pool shows at the moment of the call, and the liquidation price follows it in a crash and in stale mode. A large trade can move it. Read [oracle and market risks](../risk/oracle-and-market-risks.md) before you lend to or borrow from the Meme market.
:::

## What the oracle does not do

- It does not check whether the sequencer is up. Robinhood Chain has no sequencer uptime feed. The mitigation is the owner pausing the market, see [pause and emergency](../risk/pause-and-emergency.md).
- It does not compare Chainlink with a second price provider. The second check on the Blue-chip side is the pool's own spot price, through the 2% gate.
- It does not store prices. Every call reads the feed or the pool again.

## Errors

| Error | Meaning |
|---|---|
| `PriceFeedNotConfigured(Currency currency)` | The token has no Chainlink feed in the policy. |
| `InvalidPrice(Currency currency, int256 answer)` | The feed answered zero or a negative number. |
| `StalePrice(Currency currency, uint256 updatedAt)` | The last update of the feed is missing, in the future, or older than 25 hours. |
| `TwapRecorderNotConfigured()` | The oracle was deployed without a recorder. |
| `MemeTwapUnavailable(PoolId poolId)` | The TWAP of the pool is unavailable and a borrowing price was requested. |
| `MemeCurrencyNotInPool(Currency currency, PoolId poolId)` | A meme price was requested for a token that is not in the given pool. |
| `MemeSpotUnavailable(PoolId poolId)` | The pool is not initialized. |

What a caller can do about each error is on the [errors page](./errors.md).

The oracle emits no events.

## Related pages

- [Price oracles](../concepts/price-oracles.md)
- [TwapRecorder](./twap-recorder.md)
- [PositionValuer](./position-valuer.md)
- [CollateralPolicy](./collateral-policy.md)
- [Oracle and market risks](../risk/oracle-and-market-risks.md)
- [Chainlink data feeds documentation](https://docs.chain.link/data-feeds)
