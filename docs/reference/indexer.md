---
title: Indexer data
description: Tables, HTTP routes and reading rules of the Farmenta indexer, which records on-chain events and serves the list of pools, positions and loans.
sidebar_position: 15
---

The Farmenta indexer is a logbook. It writes down every relevant event as it happens on-chain, and it lets you ask questions such as "which loans exist?" or "what happened to this position?". Like a ship's logbook, it records what happened. It does not tell you what things are worth right now.

A small example. Budi deposits position `11` into the Meme market and borrows 500 USDG. The indexer writes a `loan` row with `status = "in_custody"`, `everBorrowed = true` and `borrowedUsdg = "500000000"`. A week later Budi owes a little more than 500 USDG because of interest. That number is not in the indexer, because interest accrues without emitting an event. You read it on-chain with `debtOf(11)`.

The indexer is built with Ponder, an open source indexing framework, and its own source is public in the [indexer repository](https://github.com/farmenta-defi/indexer). Farmenta does not announce a public indexer endpoint. To query this data, run your own indexer (see the last section of this page). This page shows every route as a path.

## What the indexer does and does not do

| The indexer does | The indexer does not |
|---|---|
| Record events from Uniswap v4 and the Farmenta contracts | Compute health factors |
| Keep the list of pools, positions, loans and liquidations | Read or store prices, or any USD value |
| Serve the data over HTTP, as JSON routes and as GraphQL | Call contracts |
| Rebuild identical rows when it is re-run from the first block | Store the exact debt of a loan or the USDG value of lender shares |

**It is the only source for the list of active loans.** The market keeps no list of loans on-chain, and the Uniswap PositionManager cannot list the positions an address holds. Both lists exist only in the indexer, rebuilt from events.

Everything that moves without an event is read on-chain:

| You need | Read it from |
|---|---|
| The list of loans in custody | Indexer, `/loans?status=in_custody` |
| The exact debt of a loan | `FarmentaMarket.debtOf(tokenId)` |
| The health factor of a loan | `MarketLens.healthFactor(tokenId)`, or `MarketLens.liquidationHealthFactor(tokenId)` before you liquidate |
| The USDG value of lender shares | `FarmentaMarket.convertToAssets(shares)` |
| The reserves of a market | `FarmentaMarket.reserves()` |
| The terms of a pool right now | Indexer `/pools`, or `CollateralPolicy.termsOf(poolId)` |

## Event sources

| Contract | Events indexed |
|---|---|
| Uniswap PoolManager | `Initialize`, and `ModifyLiquidity` when the sender is the PositionManager |
| Uniswap PositionManager | `Transfer` |
| CollateralPolicy | `PoolListed`, `PoolTermsUpdated`, `PoolFrozen`, `LtRampScheduled`, `TokenConfigured`, `HookAllowlisted` |
| TwapRecorder | `Recorded` |
| FarmentaMarket, both markets | `CollateralDeposited`, `CollateralWithdrawn`, `Borrow`, `Repay`, `LiquidityChanged`, `CollectFees`, `Liquidate`, `BadDebtSocialized`, and the vault events `Deposit`, `Withdraw` and share `Transfer` |

Not indexed: `ReservesUpdated`, `ReservesWithdrawn`, `UnaccountedTokenRescued`, `UnaccountedEthRescued`, and the PoolManager `Swap` event.

Both markets emit the same events, so they share every table. The `market` column holds the address of the market proxy that emitted the event. Event definitions are in the [events reference](./events.md).

## Data conventions

- **Large numbers are strings.** Columns of type `bigint` are returned as decimal strings, in the JSON routes and in GraphQL. Columns of type `integer` are JSON numbers.
- **Addresses are lowercase.** Addresses and pool ids are stored as lowercase hex. Routes accept addresses in any case.
- **Time is `block.timestamp`.** Every `timestamp` and every column that ends in `At` is unix seconds taken from the block. Nothing is derived from block numbers.
- **Units.** Columns that end in `Usdg` are USDG with 6 decimals. `minPositionUsd` is USD scaled by 1e18. Columns that end in `Bps` are basis points. `tier` is `1` for Blue-chip and `2` for Meme.
- **Event rows share a key.** A table with one row per event is keyed by block number and log index, together with the market, the pool or, for `position_transfer`, the `tokenId`. Those rows also carry `timestamp` and `transactionHash`. The exception is `twap_observation`, which is keyed by pool and timestamp and has no `logIndex` or `transactionHash`.

## Tables

Types below are the stored types. "Nullable" means the column can be `null`.

### Pools and listings

**`uniswap_pool`**: every pool ever initialized on the PoolManager, listed by Farmenta or not. It exists because `PoolListed` does not carry the pool key.

| Column | Type | Meaning |
|---|---|---|
| `id` | hex | Pool id. Primary key |
| `currency0`, `currency1` | hex | The two currencies of the pool key. Native ETH is the zero address |
| `fee` | integer | Fee field of the pool key |
| `tickSpacing` | integer | Tick spacing of the pool key |
| `hooks` | hex | Hook address, or the zero address |
| `initializedBlock`, `initializedAt` | bigint | Block and time of `Initialize` |

**`pool`**: pools listed in `CollateralPolicy`, with the terms in force.

| Column | Type | Meaning |
|---|---|---|
| `id` | hex | Pool id. Primary key |
| `currency0`, `currency1`, `fee`, `tickSpacing`, `hooks` | hex or integer, nullable | The pool key, copied from `uniswap_pool`. `null` means the pool is not active yet, see [below](#pools-that-are-not-active-yet) |
| `tier` | integer | `1` Blue-chip, `2` Meme |
| `maxLtvBps` | integer | Max LTV of the listing |
| `ltBps` | integer | LT from the listing or from the last terms update. Not the LT in force during or after a ramp, see [effective LT](#effective-lt-during-a-ramp) |
| `liquidatorBonusBps` | integer | Liquidator bonus |
| `removeHaircutBps` | integer | Removal haircut |
| `debtCapUsdg` | bigint | Pool debt cap, USDG with 6 decimals |
| `minPositionUsd` | bigint | Minimum position value, USD scaled by 1e18 |
| `frozen` | boolean | True when the pool accepts no new positions, no new borrows and no added liquidity |
| `rampLtFromBps`, `rampLtTargetBps` | integer, nullable | Start and target LT of the current ramp. `null` when no ramp is set |
| `rampStart`, `rampDuration` | bigint, nullable | Start time and length of the current ramp, in seconds |
| `listedBlock`, `listedAt` | bigint | Block and time of `PoolListed` |
| `updatedAt` | bigint | Time of the last change to the row |

**`pool_terms_change`**: one row per `PoolListed` and per `PoolTermsUpdated`, so earlier terms stay readable.

| Column | Type | Meaning |
|---|---|---|
| `poolId`, `blockNumber`, `logIndex` | hex, bigint, integer | Primary key |
| `timestamp`, `transactionHash` | bigint, hex | When and where the change happened |
| `source` | text | `"listed"` for the terms a pool was listed with, `"updated"` for every later update |
| `maxLtvBps`, `ltBps`, `liquidatorBonusBps`, `removeHaircutBps` | integer | The terms written by this event |
| `debtCapUsdg`, `minPositionUsd` | bigint | The cap and the minimum written by this event |

**`lt_ramp`**: one row per `LtRampScheduled`. A terms update clears the ramp on `pool`. The cleared schedule stays here.

| Column | Type | Meaning |
|---|---|---|
| `poolId`, `blockNumber`, `logIndex` | hex, bigint, integer | Primary key |
| `timestamp`, `transactionHash` | bigint, hex | When and where the ramp was scheduled |
| `ltFromBps` | integer | LT in force when the ramp was scheduled |
| `ltTargetBps` | integer | LT at the end of the ramp |
| `start`, `duration` | bigint | Start time and length, in seconds |

**`token`**: the latest `TokenConfigured` per currency.

| Column | Type | Meaning |
|---|---|---|
| `currency` | hex | Token address, or the zero address for native ETH. Primary key |
| `enabled` | boolean | Whether the token may appear in new listings and in newly deposited collateral |
| `tier` | integer | Tier of the token |
| `decimals` | integer | Decimals recorded at configuration |
| `priceFeed` | hex | Chainlink feed recorded for the token, or the zero address |
| `updatedAt` | bigint | Time of the last configuration |

**`hook`**: the latest `HookAllowlisted` per hook address.

| Column | Type | Meaning |
|---|---|---|
| `address` | hex | Hook address. Primary key |
| `allowed` | boolean | Whether the hook is on the allowlist |
| `updatedAt` | bigint | Time of the last change |

### TWAP observations

**`twap_observation`**: one row per `Recorded` event.

| Column | Type | Meaning |
|---|---|---|
| `poolId`, `timestamp` | hex, bigint | Primary key. The recorder writes at most one observation per pool per second |
| `index` | integer | Slot in the recorder's ring buffer. It wraps around at 2,048 |
| `tickCumulative` | bigint | Cumulative tick at this observation |
| `blockNumber` | bigint | Block of the event |

**`twap_pool`**: the newest observation per pool.

| Column | Type | Meaning |
|---|---|---|
| `poolId` | hex | Primary key |
| `lastObservationAt` | bigint | Time of the newest observation |
| `lastIndex`, `lastTickCumulative` | integer, bigint | Slot and cumulative tick of the newest observation |
| `recordedCount` | integer | Number of `Recorded` events seen for the pool |

A pool's first observation has `index` 0 and `tickCumulative` 0. That is the recorder starting the pool, not broken data. Recording is permissionless, so `twap_pool` can hold pools that are not listed. `recordedCount` is not the contract's `observationCount`, which stops at the buffer capacity: that one equals `min(recordedCount, 2048)`.

### Positions

**`position`**: every position NFT minted by the PositionManager, in a Farmenta pool or not. A position that becomes collateral was often minted long before it was deposited.

| Column | Type | Meaning |
|---|---|---|
| `tokenId` | bigint | Primary key |
| `owner` | hex | Holder of the NFT: the market while the position is collateral, the zero address once burned. The depositor is `loan.owner` |
| `poolId` | hex, nullable | Pool of the position |
| `tickLower`, `tickUpper` | integer, nullable | Price range of the position |
| `liquidity` | bigint | Current liquidity, the sum of every liquidity change |
| `burned` | boolean | True once the NFT is burned. The row stays, with `liquidity` 0 |
| `mintedBlock`, `mintedAt` | bigint | Block and time of the mint |
| `updatedAt` | bigint | Time of the last change |

`poolId`, `tickLower` and `tickUpper` are `null` only between the two events of a mint, which are a few logs apart in the same transaction.

**`position_transfer`**: one row per PositionManager `Transfer`, mints and burns included.

| Column | Type | Meaning |
|---|---|---|
| `tokenId`, `blockNumber`, `logIndex` | bigint, bigint, integer | Primary key |
| `timestamp`, `transactionHash` | bigint, hex | When and where the transfer happened |
| `from`, `to` | hex | Sender and receiver. The zero address marks a mint or a burn |

### Loans

**`loan`**: a position taken into custody by a market. One row per market and `tokenId`.

| Column | Type | Meaning |
|---|---|---|
| `market`, `tokenId` | hex, bigint | Primary key |
| `owner` | hex | The depositor, who alone may borrow against the position and withdraw it |
| `poolId` | hex | Pool of the loan, as named by the market's events. Never `null` |
| `status` | text | `"in_custody"`, `"withdrawn"` or `"liquidated"` |
| `everBorrowed` | boolean | True from the first `Borrow` of this custody. It stays true after the loan is repaid in full |
| `borrowedUsdg` | bigint | Running total of `Borrow` amounts for this custody |
| `repaidUsdg` | bigint | Running total of `Repay` amounts for this custody |
| `liquidatedUsdg` | bigint | Running total of what liquidators repaid for this custody |
| `depositedBlock`, `depositedAt` | bigint | Block and time of the deposit |
| `lastActivityAt` | bigint | Time of the last event of the loan |
| `closedAt` | bigint, nullable | When the position left custody. `null` while it is held |

How to read this table:

- **There is no debt column.** `Borrow` and `Repay` carry USDG amounts, and interest accrues without an event, so the exact debt cannot be rebuilt from events. `borrowedUsdg - repaidUsdg - liquidatedUsdg` is not the debt.
- **`everBorrowed` means "may have debt".** Confirm every candidate with `debtOf(tokenId)`.
- **A row holds the current or the last custody only.** A position leaves custody in two ways: the depositor withdraws it, or a full seizure burns it. When a withdrawn position is deposited again, the row starts over with all totals at zero, even if the new depositor is a different address. Earlier custodies stay in `loan_activity`, and `depositedBlock` tells you where the current one begins.

**`loan_activity`**: the borrower side of the transaction history. Liquidations are in `liquidation`.

| Column | Type | Meaning |
|---|---|---|
| `market`, `blockNumber`, `logIndex` | hex, bigint, integer | Primary key |
| `timestamp`, `transactionHash` | bigint, hex | When and where the event happened |
| `tokenId` | bigint | The position |
| `owner` | hex | The depositor of the loan at the time of the event |
| `kind` | text | `"deposit"`, `"withdraw"`, `"borrow"`, `"repay"`, `"increase_liquidity"`, `"decrease_liquidity"` or `"collect_fees"` |
| `amountUsdg` | bigint, nullable | USDG amount. Only for `"borrow"` and `"repay"` |
| `liquidityDelta` | bigint, nullable | Signed liquidity change. Only for the two liquidity kinds |
| `amount0`, `amount1` | bigint, nullable | Fees paid out, in raw token units. Only for `"collect_fees"` |

**`collect_fees` rows are realized fees.** `amount0` and `amount1` are the fees the position realized, in raw units of the pool's two currencies. The contract reads them from the position's fee growth just before the payout, so they are not a balance change of the recipient. A row is written by each of the three fee paying paths:

1. `collectFees`
2. `increaseLiquidity`, which claims the pending fees first
3. `decreaseLiquidity`, which pays fees out alongside the principal

Summing the rows of a position gives the fees it has paid out while in custody. Two things are not included: fees realized by a liquidation, and fees the position paid out before it was deposited. The indexer stores no USD value for fees.

`increase_liquidity` and `decrease_liquidity` rows are history only. The current liquidity of a position is `position.liquidity`, which also reflects liquidations.

### Liquidations and bad debt

**`liquidation`**: one row per `Liquidate` event, partial or full.

| Column | Type | Meaning |
|---|---|---|
| `market`, `blockNumber`, `logIndex` | hex, bigint, integer | Primary key |
| `timestamp`, `transactionHash` | bigint, hex | When and where the liquidation happened |
| `tokenId` | bigint | The liquidated position |
| `owner` | hex | The depositor of the liquidated loan |
| `poolId` | hex | Pool named by the event |
| `liquidator` | hex | The caller of `liquidate` |
| `full` | boolean | The event's `fullSeizure` flag |
| `repaidUsdg` | bigint | Debt the liquidator repaid. Exact ledger figure |
| `badDebtUsdg` | bigint | Debt left uncovered after a full seizure. Exact ledger figure |
| `socializedUsdg` | bigint | The part of `badDebtUsdg` the reserves could not cover, which was socialized to lenders. `0` when there was none |
| `out0`, `out1` | bigint | What the liquidator's recipient received, in raw token units |

- **`full` comes from the event, not from the burn.** `full` is the `fullSeizure` flag of `Liquidate`. It is true when the position was seized whole and burned, with or without bad debt. Only a row with `full = true` closes the loan. A liquidity slice (partial liquidation) leaves the loan in custody.
- **`out0` and `out1` are not the amount seized.** On a full seizure they are measured as the balance change of the recipient, and a recipient that is a contract can distort that figure. Do not build accounting on them.
- **`socializedUsdg` is matched by position in the log.** `BadDebtSocialized` names no position. The indexer ties it to the `Liquidate` event that follows it directly in the same transaction.

**`bad_debt_socialized`**: one row per `BadDebtSocialized`, a loss written off against lenders. See [bad debt](../concepts/bad-debt.md).

| Column | Type | Meaning |
|---|---|---|
| `market`, `blockNumber`, `logIndex` | hex, bigint, integer | Primary key |
| `timestamp`, `transactionHash` | bigint, hex | When and where the loss was written off |
| `amountUsdg` | bigint | The loss, USDG with 6 decimals |

**`pending_burn`**: working table. It holds a market's burn of a position for the short moment between the burn and the `Liquidate` event that confirms it in the same transaction. It is empty whenever you read it.

| Column | Type | Meaning |
|---|---|---|
| `market` | hex | Primary key |
| `tokenId` | bigint | The burned position |
| `blockNumber`, `logIndex`, `transactionHash` | bigint, integer, hex | Where the burn happened |

### Lender vault

**`vault_activity`**: the lender side of the transaction history.

| Column | Type | Meaning |
|---|---|---|
| `market`, `blockNumber`, `logIndex` | hex, bigint, integer | Primary key |
| `timestamp`, `transactionHash` | bigint, hex | When and where the event happened |
| `kind` | text | `"deposit"`, `"withdraw"` or `"transfer"` |
| `sender` | hex, nullable | Caller of the deposit or the withdrawal. `null` for `"transfer"` |
| `owner` | hex | Whose shares: minted to on a deposit, burned from on a withdrawal, sent by on a transfer |
| `receiver` | hex, nullable | Who received the USDG on a withdrawal, or the shares on a transfer. `null` for `"deposit"` |
| `assetsUsdg` | bigint, nullable | USDG amount. `null` for `"transfer"`, which moves shares only |
| `shares` | bigint | Share amount |

The share mint inside a deposit and the share burn inside a withdrawal are not repeated as `"transfer"` rows.

**`vault_balance`**: shares per market and holder. It equals what `balanceOf` returns.

| Column | Type | Meaning |
|---|---|---|
| `market`, `account` | hex | Primary key |
| `shares` | bigint | Share balance |
| `updatedAt` | bigint | Time of the last change |

## HTTP routes

| Route | Returns |
|---|---|
| `GET /pools` | Every listed pool, with the fields that depend on the time of reading |
| `GET /pools/:id` | One listed pool |
| `GET /loans` | Loans, with optional filters |
| `GET /loans/keeper-candidates` | Meme loans in custody that have borrowed at least once |
| `GET /portfolio/:address` | Positions, loans and lender shares of one address |
| `/graphql` | Every table, as stored |
| `GET /status` | Last indexed block and its timestamp |
| `GET /ready` | Status `200` once the indexer has caught up with the chain, `503` before |
| `GET /health` | Status `200` as soon as the process is running |
| `GET /metrics` | Prometheus metrics of the indexer process, served by Ponder |

An invalid parameter returns status `400` with a body of the form `{ "error": "..." }`. The list routes are not paginated: they always return the complete list.

### `GET /pools` and `GET /pools/:id`

| Parameter | In | Required | Meaning |
|---|---|---|---|
| `id` | path | yes, for `/pools/:id` | A 32 byte pool id, as `0x` followed by 64 hex characters |
| `t` | query | no | Time of reading, in unix seconds. Defaults to the server's clock |

`/pools/:id` returns status `404` when the pool is not listed.

Each pool is its `pool` row plus these fields:

| Field | Type | Meaning |
|---|---|---|
| `t` | string | The time the answer was computed for |
| `rampRunning` | boolean | `t < rampStart + rampDuration`. True from the moment a ramp is scheduled, even before it starts |
| `rampEndsAt` | string, nullable | `rampStart + rampDuration`. `null` when no ramp is set |
| `effectiveLtBps` | number | The LT in force at `t` |
| `lastObservationAt` | string, nullable | Time of the newest TWAP observation. `null` when the pool has none |
| `observationAgeSeconds` | string, nullable | Seconds between the newest observation and `t`. Never negative |

Sample response of `/pools/:id?t=1789657500` (values are illustrative). `/pools` returns an array of the same objects.

```json
{
  "id": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "currency0": "0x0000000000000000000000000000000000000000",
  "currency1": "0x5fc5360d0400a0fd4f2af552add042d716f1d168",
  "fee": 500,
  "tickSpacing": 10,
  "hooks": "0x0000000000000000000000000000000000000000",
  "tier": 1,
  "maxLtvBps": 6500,
  "ltBps": 7500,
  "liquidatorBonusBps": 500,
  "removeHaircutBps": 0,
  "debtCapUsdg": "500000000000",
  "minPositionUsd": "50000000000000000000",
  "frozen": true,
  "rampLtFromBps": 7500,
  "rampLtTargetBps": 6000,
  "rampStart": "1789600000",
  "rampDuration": "604800",
  "listedBlock": "65000000",
  "listedAt": "1789000000",
  "updatedAt": "1789590000",
  "t": "1789657500",
  "rampRunning": true,
  "rampEndsAt": "1790204800",
  "effectiveLtBps": 7358,
  "lastObservationAt": null,
  "observationAgeSeconds": null
}
```

### `GET /loans`

| Parameter | In | Required | Meaning |
|---|---|---|---|
| `owner` | query | no | Address of the depositor |
| `market` | query | no | Address of the market proxy |
| `status` | query | no | `in_custody`, `withdrawn` or `liquidated` |

Every loan is its `loan` row plus four joined fields, ordered by market and then by `tokenId`:

| Field | Type | Meaning |
|---|---|---|
| `tickLower`, `tickUpper` | number, nullable | Price range of the position |
| `liquidity` | string, nullable | Current liquidity of the position |
| `tier` | number, nullable | Tier of the loan's pool |

The three position fields are `null` only when the indexer was started from a block after the position was minted.

Sample response of `/loans?status=in_custody` (values are illustrative):

```json
[
  {
    "market": "0x1111111111111111111111111111111111111111",
    "tokenId": "11",
    "owner": "0x2222222222222222222222222222222222222222",
    "poolId": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "status": "in_custody",
    "everBorrowed": true,
    "borrowedUsdg": "500000000",
    "repaidUsdg": "0",
    "liquidatedUsdg": "0",
    "depositedBlock": "65400100",
    "depositedAt": "1789651000",
    "lastActivityAt": "1789651200",
    "closedAt": null,
    "tickLower": -120,
    "tickUpper": 120,
    "liquidity": "11000",
    "tier": 2
  }
]
```

`/loans?owner=` finds the current or the last depositor only. A past depositor of a position that was deposited again by someone else is found in `loan_activity`.

### `GET /loans/keeper-candidates`

No parameters. Returns the loans that are still in custody, on a Meme pool (`tier = 2`), and have borrowed at least once. The response has the same shape as `/loans`.

This is the watch list for anyone who records TWAP observations for meme pools or monitors meme loans for liquidation. The entries are candidates: a loan repaid in full stays on the list, so confirm each one with `debtOf(tokenId)`.

### `GET /portfolio/:address`

| Parameter | In | Required | Meaning |
|---|---|---|---|
| `address` | path | yes | Any address except the zero address |

| Field | Meaning |
|---|---|
| `address` | The address, in lowercase |
| `positions` | `position` rows of the NFTs in the address's wallet, ordered by `tokenId` |
| `loans` | The loans a market holds for the address (`status = "in_custody"`), in the shape of `/loans` |
| `vaultShares` | The address's `vault_balance` rows, one per market |

An address the indexer has never seen returns status `200` with three empty arrays. The route is meant for user addresses. Called with the address of a market, it returns every position in that market's custody.

Sample response (values are illustrative):

```json
{
  "address": "0x2222222222222222222222222222222222222222",
  "positions": [
    {
      "tokenId": "3",
      "owner": "0x2222222222222222222222222222222222222222",
      "poolId": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "tickLower": -120,
      "tickUpper": 120,
      "liquidity": "3000",
      "burned": false,
      "mintedBlock": "65300000",
      "mintedAt": "1789641000",
      "updatedAt": "1789641000"
    }
  ],
  "loans": [],
  "vaultShares": [
    {
      "market": "0x1111111111111111111111111111111111111111",
      "account": "0x2222222222222222222222222222222222222222",
      "shares": "990",
      "updatedAt": "1789645000"
    }
  ]
}
```

### `/graphql`

GraphQL serves every table as stored, with filtering, ordering and cursor pagination. Tables that have no JSON route, such as transfers, activity rows and liquidations, are read here.

Each table has a query for one row and a query for a list. The list query is the table's name in camel case with an `s` at the end, for example `loans`, `liquidations`, `loanActivitys` and `vaultBalances`. A list returns 50 rows by default and at most 1,000 per page.

```graphql
query {
  liquidations(orderBy: "timestamp", orderDirection: "desc", limit: 10) {
    items {
      market
      tokenId
      liquidator
      full
      repaidUsdg
      badDebtUsdg
      socializedUsdg
      timestamp
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

GraphQL returns raw columns. It does not add `effectiveLtBps`, `rampRunning` or `observationAgeSeconds`.

### `GET /status`, `/ready` and `/health`

`/status` returns the last indexed block and its timestamp:

```json
{
  "robinhood": {
    "id": 4663,
    "block": { "number": 65402474, "timestamp": 1789651692 }
  }
}
```

## Reading rules

### Check the indexer lag first

Every answer is as of the last indexed block, and no route except `/status` says which block that is. The indexer lag is the current time minus `block.timestamp` from `/status`.

Read `/status` before you trust a time-dependent field or a list, and distrust the answer when the lag is larger than your use allows. When the indexer lags:

- `observationAgeSeconds` grows although nothing on-chain is stale, because `t` defaults to the server's clock while the rows come from an older block.
- `rampRunning` is `false` and `effectiveLtBps` is too high for a ramp that was scheduled in a block not indexed yet.
- A loan that was deposited and borrowed against in a block not indexed yet is missing from `/loans` and `/loans/keeper-candidates`.

### Effective LT during a ramp

An LT ramp lowers a pool's liquidation threshold gradually, in a straight line, over a published window. The effective LT therefore depends on the time it is read at, so it is not a column. The `/pools` routes compute it at read time, with the same integer arithmetic as `CollateralPolicy.effectiveLt`:

```text
no ramp set                          effectiveLt = ltBps
t <= rampStart                       effectiveLt = rampLtFromBps
t >= rampStart + rampDuration        effectiveLt = rampLtTargetBps
otherwise                            effectiveLt = rampLtFromBps
                                       - floor((rampLtFromBps - rampLtTargetBps) × (t - rampStart) / rampDuration)
```

In the sample above, the ramp goes from 7,500 bps to 6,000 bps over 604,800 seconds (7 days). At `t = 1789657500`, 57,500 seconds have passed:

```text
1,500 × 57,500 / 604,800 = 142.6, rounded down to 142
effectiveLt = 7,500 - 142 = 7,358 bps
```

**Read the LT from `/pools`, never from the `ltBps` column.** `ltBps` is the LT from the listing or from the last terms update. Once a ramp is scheduled, the LT in force comes from the ramp. After the ramp ends, the LT stays at `rampLtTargetBps` until the next terms update, while `ltBps` still holds the value from before the ramp. If you use GraphQL, apply the formula yourself.

### Pools that are not active yet

The pool key columns of `pool` (`currency0`, `currency1`, `fee`, `tickSpacing`, `hooks`) are `null` when the pool is listed but has not been initialized on the PoolManager yet. A listing does not require the pool to exist. Nothing can be deposited or recorded for such a pool, so treat it as not active. The columns are filled in when the pool is initialized.

### The indexer stops instead of guessing

The indexer refuses to write a row that cannot be right. It stops when an event contradicts what it has recorded, for example:

- an event for a loan whose deposit it never saw,
- an event that names a different pool than the loan's pool,
- a full seizure without a burn of the position in the same transaction, or a burn by a market without a full seizure.

This matters most when you run your own indexer from a late start block.

## Run your own indexer

The source is at [github.com/farmenta-defi/indexer](https://github.com/farmenta-defi/indexer), under the MIT license. You need Node 22 or newer, pnpm 10 or newer, a Postgres database and an RPC endpoint from a provider, because the public endpoint is rate limited (see [network](./network.md)). You give the indexer the Farmenta contract addresses and their deployment blocks in a small JSON file. The README in the repository has the steps.

## Related pages

- [Events](./events.md)
- [FarmentaMarket reference](./farmenta-market.md)
- [MarketLens reference](./market-lens.md)
- [CollateralPolicy reference](./collateral-policy.md)
- [Pool listing](../concepts/pool-listing.md)
- [Liquidator guide](../liquidations/liquidator-guide.md)
- [Network: Robinhood Chain](./network.md)
