---
title: TwapRecorder
description: Reference for the permissionless tick recorder that produces the 30 minute TWAP used to price meme tokens.
sidebar_position: 6
---

## What this contract is for

`TwapRecorder` keeps a short price history for Uniswap v4 pools and turns it into a time weighted average price (TWAP). Farmenta uses it to price meme tokens, which have no Chainlink feed.

Uniswap v4 pools do not keep a price history of their own, so someone has to write it down. The recorder is a public logbook: anyone can add an entry with the pool's current tick, at most once per second, and anyone can ask for the average over the last 30 minutes.

A small example: a pool sat at tick 1,000 for the first 1,200 seconds of the window and at tick 1,300 for the last 600 seconds. The TWAP tick is:

```text
(1,000 × 1,200 + 1,300 × 600) / 1,800 = 1,100
```

The recorder has no owner, holds no funds and cannot be changed. Its address is on the [addresses page](./addresses.md).

## Contract summary

```solidity
constructor(IStateView stateView_)
```

```solidity
uint16 public constant OBSERVATION_CAPACITY = 2048;
uint32 public constant DEFAULT_WINDOW = 1800;
uint32 public constant STALE_THRESHOLD = 900;

IStateView public immutable stateView;
```

| Constant | Value | Meaning |
|---|---|---|
| `OBSERVATION_CAPACITY` | 2,048 | Observations kept per pool. The buffer is a ring: once full, a new observation replaces the oldest. |
| `DEFAULT_WINDOW` | 1,800 seconds | The TWAP window, 30 minutes. |
| `STALE_THRESHOLD` | 900 seconds | The oldest the latest observation may be for the TWAP to count as fresh. |

`stateView` is the Uniswap v4 StateView contract the recorder reads pool state from.

## Recording

### `record`

```solidity
function record(PoolKey calldata key) external
```

Records the current tick of one pool. Anyone can call it, for any initialized Uniswap v4 pool. It costs only gas.

What one call does:

1. If the pool already has an observation with the current block timestamp, the call does nothing. There is at most one observation per pool per second.
2. It reads the pool's current price and tick from StateView. If the pool is not initialized it reverts with `TwapUnavailable()`.
3. For the first observation of a pool it stores the timestamp with a cumulative value of zero.
4. For every later observation it adds `lastTick × secondsSinceLastObservation` to the running total, stores the timestamp and the total, and remembers the new tick.

```text
tickCumulative = tickCumulative + lastTick × (now − lastTimestamp)
```

The tick that is multiplied by the elapsed time is the previous tick, the one that was in force during the interval. The tick read now starts counting from now. This is the same convention as the Uniswap v3 oracle.

Emits `Recorded(poolId, index, timestamp, tickCumulative)`.

### `recordBatch`

```solidity
function recordBatch(PoolKey[] calldata keys) external
```

Records several pools in one transaction. Each pool is handled on its own. A pool that appears twice, or that already has an observation in this second, is skipped without an error. An uninitialized pool in the list reverts the whole call.

### Who records

- The Meme market records the pool on its own transactions: when collateral comes in, on `borrow`, `collectFees`, `increaseLiquidity` and `decreaseLiquidity`, and at the end of `liquidate`.
- The team plans to run a keeper that records meme pools with active debt every 5 minutes. It is not running yet. A pool with no debt can go stale.
- Anyone else can record at any time, for example a borrower who wants to end stale mode before a liquidator acts.

### Example: calling `record`

```ts
import { createWalletClient, defineChain, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

// Placeholder. Copy the recorder's address from the addresses page.
const TWAP_RECORDER_ADDRESS = '0x0000000000000000000000000000000000000000'

const recorderAbi = parseAbi([
  'struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }',
  'function record(PoolKey key)',
  'function recordBatch(PoolKey[] keys)',
])

const robinhoodChain = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [process.env.RPC_URL as string] } },
})

const wallet = createWalletClient({
  account: privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`),
  chain: robinhoodChain,
  transport: http(),
})

// The key of the pool to record. Use the exact key the pool was created with.
const poolKey = {
  currency0: process.env.CURRENCY_0 as `0x${string}`, // the lower of the two token addresses
  currency1: process.env.CURRENCY_1 as `0x${string}`,
  fee: 3000,
  tickSpacing: 60,
  hooks: '0x0000000000000000000000000000000000000000',
} as const

const hash = await wallet.writeContract({
  address: TWAP_RECORDER_ADDRESS,
  abi: recorderAbi,
  functionName: 'record',
  args: [poolKey],
})
console.log('recorded in', hash)
```

The fee, tick spacing and hook in this example are illustrative. A pool id is the hash of the whole key, so a key with one wrong field points at a different pool.

## Reading the TWAP

### `consult`

```solidity
function consult(PoolId poolId) external view returns (int24)
function consult(PoolId poolId, uint32 window) external view returns (int24)
```

Returns the TWAP tick of a pool over the last `window` seconds. The one argument form uses `DEFAULT_WINDOW`, 1,800 seconds. `PriceOracle` asks for 1,800 seconds as well.

```text
target        = now − window
twapTick      = (cumulativeNow − cumulativeAt(target)) / window
```

- `cumulativeNow` extends the running total from the latest observation to the current timestamp at the last recorded tick.
- `cumulativeAt(target)` is the running total at the start of the window. If no observation has exactly that timestamp, it is interpolated linearly between the two observations around it. The recorder finds them with a binary search.
- The division rounds toward negative infinity, as in Uniswap v3.

The result is a tick, not a price. `PriceOracle` converts it to a USD price.

### When the TWAP is unavailable

`consult` reverts with `TwapUnavailable()` in any of these cases.

| Case | Meaning |
|---|---|
| `window` is zero | Not a valid request. |
| The pool has no observation | Nobody has recorded this pool yet. |
| The oldest observation is newer than `now − window` | The history is shorter than the window. A new pool needs 30 minutes of history first. |
| The latest observation is older than `now − 900` seconds | The history is stale. |

Example: the latest observation of a pool is 901 seconds old. `consult` reverts. Anyone calls `record`, and the next `consult` succeeds, provided the pool's history still reaches back 30 minutes.

`PriceOracle` treats an unavailable TWAP as stale mode: the borrowing price reverts, and liquidation uses the spot price with a 20% haircut. Market actions record a fresh observation before they read the price, so they are refused only while the pool has less than 30 minutes of recorded history. See [PriceOracle](./price-oracle.md).

:::info[A single record call restores the TWAP]
The freshness check looks only at the age of the latest observation. After a gap, one `record` makes the TWAP available again at once, and the unobserved gap is filled with the tick that was recorded before it. The average can therefore lag a price move that happened during the gap until newer observations take over.
:::

### `observationCount`

```solidity
function observationCount(PoolId poolId) external view returns (uint16)
```

The number of observations stored for a pool, from 0 to 2,048.

Single observations have no public getter. Read them from the `Recorded` events.

## Why the TWAP is geometric

The recorder averages ticks, not prices. A tick is the logarithm of a price, so the average of ticks is the geometric mean of prices.

```text
price(tick) = 1.0001 ^ tick
```

A geometric mean is harder to move with one extreme sample than an ordinary average. If a pool's price is pushed to 10 times its level for 5 minutes out of 30, the ordinary average would rise to 2.5 times. The geometric TWAP rises to about 1.47 times:

```text
10 ^ (5 / 30) ≈ 1.47
```

Borrowing uses `min(spot, TWAP)`, so a push upward does not raise the borrowing price at all.

## Why the capacity must exceed the window

The rule is: the capacity, counted in seconds, must be at least as long as the longest window `consult` is asked for.

The buffer holds 2,048 observations, and there is at most one observation per second. However often `record` is called, 2,048 observations cover at least 2,048 seconds. That is more than the 1,800 second window, so an observation at least 30 minutes old is always still in the buffer.

If the capacity were smaller than the window, anyone could call `record` every second until the whole 30 minute history had been pushed out. The TWAP would then be unavailable, borrowing would be refused until 30 minutes of history had built up again, and liquidations would run in stale mode. With 2,048 slots this cannot be done.

## Events

| Event | Emitted when |
|---|---|
| `Recorded(PoolId indexed poolId, uint16 index, uint64 timestamp, int56 tickCumulative)` | An observation is stored. `index` is its slot in the ring buffer. |

A call that is skipped because the pool already has an observation in this second emits nothing.

## Errors

| Error | Meaning |
|---|---|
| `TwapUnavailable()` | `record`: the pool is not initialized. `consult`: the window is zero, or the history is missing, too short or stale. |

## Related pages

- [PriceOracle](./price-oracle.md)
- [Price oracles](../concepts/price-oracles.md)
- [Meme market and frozen pools](../worked-example/meme-market-and-frozen-pools.md)
- [Oracle and market risks](../risk/oracle-and-market-risks.md)
- [Uniswap v4 documentation](https://docs.uniswap.org/contracts/v4/overview)
