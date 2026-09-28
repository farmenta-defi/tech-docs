---
title: MarketLens
description: Read-only views for one Farmenta market, including health factor, borrowing capacity, liquidation checks and reserve availability.
sidebar_position: 3
---

## What this contract is for

`MarketLens` is the read side of a market. It answers the questions a wallet, a dashboard or a liquidation bot asks: how healthy is this position, how much more can it borrow, can it be liquidated right now, and how much of the reserves can the owner withdraw.

It holds no funds and changes no state. Think of it as the display window of the market: you can look through it, and you cannot reach through it.

A small example: Budi's position is worth $10,000 and he owes 5,000 USDG. With a liquidation threshold of 75% and USDG at $1.00, `healthFactor` returns `1500000000000000000`, which is 1.5.

```text
HF = collateralValue × LT / debtUsd = 10,000 × 0.75 / 5,000 = 1.5
```

## One lens per market

A lens is bound to one market at deployment. The Blue-chip market and the Meme market each have their own lens.

```solidity
constructor(FarmentaMarket market_)
```

The constructor reads the market's asset, policy, valuer and oracle once and keeps them as immutables. It reverts with `MarketNotInitialized()` if the market proxy has not been initialized yet.

The lens is not upgradeable. When a market upgrade changes the policy, valuer or oracle, the old lens would keep reading the old contracts, so a new lens is deployed for that market. Always take the lens address from the [addresses page](./addresses.md), where Farmenta addresses are published after deployment.

```solidity
FarmentaMarket public immutable market;
```

`market()` returns the market this lens reads.

## Two health factors

The lens has two health factor views. They answer different questions and can return different numbers.

| | `healthFactor` | `liquidationHealthFactor` |
|---|---|---|
| Use it for | Display, and judging how much room a borrower has | Deciding whether `liquidate` will succeed right now |
| Price source | `price`, the borrowing price | `priceForLiquidation`, the liquidation price |
| Meme token price | `min(spot, TWAP)` | TWAP, or spot in a crash, or spot with a 20% haircut in stale mode |
| Debt | As stored at the last accrual | Projected with interest up to the current block timestamp |
| When the meme TWAP is unavailable | Reverts | Still returns a value |

On the Blue-chip market both use the same Chainlink prices, so the only difference is the interest projection. On the Meme market the prices themselves can differ. See [price oracles](../concepts/price-oracles.md).

`liquidate` enforces the second one, so the two can disagree near 1:

- On the Meme market a position can show a `healthFactor` below 1 and still not be liquidatable, because the liquidation price of the meme token (the TWAP) can be higher than its borrowing price (`min(spot, TWAP)`).
- On either market a position that shows a `healthFactor` just above 1 can already be liquidatable, because interest that has not been accrued yet is part of the liquidation check.

## Position views

### `positionValue`

```solidity
function positionValue(uint256 tokenId) public view returns (uint256)
```

The collateral value of a position in USD, scaled by 1e18. This is the value borrowing and the health factor are measured against.

```text
collateralValue = (principalUsd + min(feesUsd, principalUsd / 10)) × (1 − removalHaircut)
```

Uncollected fees count only up to 10% of principal. Returns 0 when the market does not hold the position.

This is not the value a liquidation seizes against. A liquidation uses the realizable value: principal plus all fees, after the removal haircut.

### `maxBorrow`

```solidity
function maxBorrow(uint256 tokenId) external view returns (uint256)
```

The additional USDG (6 decimals) the position can borrow before it reaches max LTV.

```text
maximumDebtUsd = positionValue × maxLtvBps / 10,000
maxBorrow      = (maximumDebtUsd − debtUsd) converted to USDG at the oracle price
```

Returns 0 when the market does not hold the position, or when the debt is already at or above the limit.

Example: a position worth $10,000 in a pool with a max LTV of 65%, with 2,000 USDG of debt and USDG at $1.00, returns 4,500 USDG.

:::info[maxBorrow covers the LTV limit only]
`maxBorrow` does not check anything else `borrow` checks. A borrow of that size can still revert because the market is paused, the pool is closed to new borrowing (frozen, a token disabled, or its hook no longer permitted), the USDG price is outside 0.97 to 1.03, the pool's spot price is more than 2% away from the oracle, a debt cap is reached, the resulting debt is under 10 USDG, or the market does not hold enough cash.
:::

### `healthFactor`

```solidity
function healthFactor(uint256 tokenId) external view returns (uint256)
```

The health factor at borrowing prices, scaled by 1e18.

```text
HF = positionValue × ltBps / 10,000 / debtUsd
```

- Returns the maximum `uint256` value when the position has no debt.
- Uses the liquidation threshold in force now, already resolved through any LT ramp.
- Uses the debt as of the last accrual. Interest that has built up since is not included.
- The market uses the same formula and the same prices for the check that follows `collectFees` and `increaseLiquidity`.

### `liquidationHealthFactor`

```solidity
function liquidationHealthFactor(uint256 tokenId) external view returns (uint256)
```

The health factor on the exact price path `liquidate` uses, scaled by 1e18. The position can be liquidated when the result is below `1e18`.

- Collateral is valued with `PositionValuer.valueForLiquidation`.
- Debt is priced with `priceForLiquidation` of USDG.
- Debt is projected: the lens works out the interest that `accrue` would add at the current block timestamp, using the current utilization and borrow rate.
- Returns the maximum `uint256` value when the projected debt is zero.

`liquidate` accrues interest before it checks the health factor, and it prices the position on the recorder state it finds. This view therefore matches the check inside `liquidate` as long as nothing changes the market or the pool in between.

### `liquidationCloseFactorBps`

```solidity
function liquidationCloseFactorBps(uint256 tokenId) external view returns (uint16)
```

The close factor `liquidate` applies at the current timestamp, in basis points. It is computed from the same liquidation health factor and the same projected debt.

| Market | Condition | Result |
|---|---|---|
| Meme | Always | `10000` (100%) |
| Blue-chip | `HF < 0.9` or debt `< 100 USDG` | `10000` (100%) |
| Blue-chip | Otherwise | `5000` (50%) |

The 100 USDG limit is a USDG amount (`100000000` with 6 decimals), not a USD value.

The close factor caps the seizure: `repay = min(repayAmount, debt × closeFactor)`. On a liquidity slice the debt can fall by more than that, because the borrower's retained USDG fees and the fee leg the liquidator buys are also applied to the debt and do not count toward the close factor. See [liquidation mechanics](../liquidations/mechanics.md).

## Reserve views

### `reserveFloor`

```solidity
function reserveFloor() public view returns (uint256)
```

The part of the reserves the owner cannot withdraw, in USDG.

```text
reserveFloor = totalAssets × reserveFloorBps / 10,000
```

`reserveFloorBps` is 100 on the Blue-chip market (1%) and 250 on the Meme market (2.5%). With lender funds of 100,000 USDG on the Blue-chip market the floor is 1,000 USDG.

### `withdrawableReserves`

```solidity
function withdrawableReserves() external view returns (uint256)
```

The reserves the owner can withdraw right now, in USDG.

```text
withdrawableReserves = min(reserves − reserveFloor, cash)     (zero when reserves <= reserveFloor)
```

Both reserve views use the ledger as of the last accrual. `withdrawReserves` on the market accrues interest first, so its own figure can be slightly different.

## When a view reverts

The lens calls the policy, the valuer and the oracle. When one of them reverts, the view reverts with the same error.

| Situation | Views affected | Error |
|---|---|---|
| A Chainlink price is older than 25 hours | All position views | `StalePrice(currency, updatedAt)` |
| A Chainlink answer is zero or negative | All position views | `InvalidPrice(currency, answer)` |
| The meme TWAP is unavailable | `positionValue`, `maxBorrow`, `healthFactor` | `MemeTwapUnavailable(poolId)` |

Views return early, without reading any price, when there is nothing to price: `positionValue` and `maxBorrow` return 0 for a position the market does not hold, and the health factor views return the maximum `uint256` value for a position with no debt.

`liquidationHealthFactor` and `liquidationCloseFactorBps` keep working when the meme TWAP is unavailable, because the liquidation price falls back to the spot price with a 20% haircut.

## Reading the lens with viem

```ts
import { createPublicClient, http, parseAbi, formatUnits } from 'viem'

// Placeholder. Farmenta addresses are published on the addresses page after deployment.
const MARKET_LENS_ADDRESS = '0x0000000000000000000000000000000000000000'

const lensAbi = parseAbi([
  'function positionValue(uint256 tokenId) view returns (uint256)',
  'function maxBorrow(uint256 tokenId) view returns (uint256)',
  'function healthFactor(uint256 tokenId) view returns (uint256)',
  'function liquidationHealthFactor(uint256 tokenId) view returns (uint256)',
  'function liquidationCloseFactorBps(uint256 tokenId) view returns (uint16)',
])

const client = createPublicClient({
  transport: http(process.env.RPC_URL), // a Robinhood Chain RPC endpoint, chain id 4663
})

const tokenId = 1234n
const lens = { address: MARKET_LENS_ADDRESS, abi: lensAbi } as const

const [value, maxBorrow, hf, liquidationHf] = await Promise.all([
  client.readContract({ ...lens, functionName: 'positionValue', args: [tokenId] }),
  client.readContract({ ...lens, functionName: 'maxBorrow', args: [tokenId] }),
  client.readContract({ ...lens, functionName: 'healthFactor', args: [tokenId] }),
  client.readContract({ ...lens, functionName: 'liquidationHealthFactor', args: [tokenId] }),
])

console.log('collateral value (USD):', formatUnits(value, 18))
console.log('can still borrow (USDG):', formatUnits(maxBorrow, 6))

// A position with no debt returns the maximum uint256 value.
const NO_DEBT = 2n ** 256n - 1n
console.log('health factor:', hf === NO_DEBT ? 'no debt' : formatUnits(hf, 18))

const liquidatable = liquidationHf < 10n ** 18n
console.log('liquidatable now:', liquidatable)
```

To read many positions at once, batch the calls with a multicall.

## Errors

| Error | Meaning |
|---|---|
| `MarketNotInitialized()` | The lens was deployed against a market proxy that has not been initialized. |

All other reverts come from the contracts the lens reads. See the [errors page](./errors.md).

## Related pages

- [FarmentaMarket](./farmenta-market.md)
- [Health factor](../concepts/health-factor.md)
- [Position valuation](../concepts/position-valuation.md)
- [Liquidator guide](../liquidations/liquidator-guide.md)
- [Protocol fees and reserves](../concepts/protocol-fees-and-reserves.md)
