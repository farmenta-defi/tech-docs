---
title: InterestRateModel
description: Reference for the contract that turns market utilization into a borrow rate per second, with the curves of both tiers.
sidebar_position: 8
---

## What this contract is for

`InterestRateModel` tells a market what borrowers pay. It takes one input, the utilization of the market, and returns the borrow rate per second.

The curve works like surge pricing. While plenty of USDG is idle, borrowing is cheap. Once most of the market's USDG is lent out, the rate climbs steeply, which pushes borrowers to repay and attracts new lenders, so that lenders can still withdraw.

A small example: the Blue-chip market holds 20,000 USDG of cash and borrowers owe 80,000 USDG. Utilization is `80,000 / (20,000 + 80,000)`, or 80%, which is the kink of the Blue-chip curve, and the borrow rate is 4% per year. At 90% utilization the rate is 34% per year.

The model is one contract that carries the curves of both tiers. It has no state, no owner and no settings. Its address is published on the [addresses page](./addresses.md) after deployment.

## Contract summary

```solidity
contract InterestRateModel is IInterestRateModel
```

```solidity
uint256 public constant WAD = 1e18;
uint256 public constant SECONDS_PER_YEAR = 365 days;
```

| Constant | Value |
|---|---|
| `WAD` | `1e18`, the scale of utilization and of the returned rate |
| `SECONDS_PER_YEAR` | 31,536,000 |

The curves are constants in the code. Changing a curve means deploying a new model and upgrading the market to point at it.

## `ratePerSecond`

```solidity
function ratePerSecond(ICollateralPolicy.Tier tier, uint256 utilization) external pure returns (uint256)
```

| Argument | Meaning |
|---|---|
| `tier` | `BLUE_CHIP` (1) or `MEME` (2). Each market passes its own tier. |
| `utilization` | The share of the market's USDG (cash plus outstanding debt) that is lent out, scaled by 1e18. `0.8e18` is 80%. |

Returns the borrow rate per second, scaled by 1e18.

The function is `pure`. It reads nothing, so the same inputs always return the same rate.

| Check | Error |
|---|---|
| `utilization` is at most `1e18` | `UtilizationTooHigh(utilization)` |
| `tier` is `BLUE_CHIP` or `MEME` | `TierNotSet()` |

## The two curves

| Parameter | Blue-chip | Meme | In code |
|---|---|---|---|
| Kink | 80% | 70% | `80e16`, `70e16` |
| Slope 1 (rate per year at the kink) | 4% | 8% | `4e16`, `8e16` |
| Slope 2 (added per year between the kink and 100%) | 60% | 100% | `60e16`, `100e16` |
| Rate at 100% utilization | 64% | 108% | slope 1 plus slope 2 |

```solidity
if (tier == ICollateralPolicy.Tier.BLUE_CHIP) return (80e16, 4e16, 60e16);
if (tier == ICollateralPolicy.Tier.MEME) return (70e16, 8e16, 100e16);
revert TierNotSet();
```

## Formula

```text
if utilization <= kink:
    ratePerYear = slope1 × utilization / kink
else:
    ratePerYear = slope1 + slope2 × (utilization − kink) / (1 − kink)

ratePerSecond = ratePerYear / 31,536,000
```

The market computes utilization from its own ledger before it calls the model:

```text
utilization = totalBorrows / (cash + totalBorrows)
```

`cash` is the USDG balance of the market.

### Rates at a glance

| Utilization | Blue-chip, per year | Meme, per year |
|---|---|---|
| 0% | 0% | 0% |
| 40% | 2% | 4.57% |
| 70% | 3.5% | 8% |
| 80% | 4% | 41.33% |
| 90% | 34% | 74.67% |
| 100% | 64% | 108% |

## From a yearly rate to a rate per second

The model divides the yearly rate by the number of seconds in a year and rounds down.

Take the Blue-chip market at 90% utilization.

```text
ratePerYear   = 4% + 60% × (90% − 80%) / (100% − 80%)
              = 4% + 30%
              = 34%                      in code: 340000000000000000

ratePerSecond = 340000000000000000 / 31,536,000
              = 10781329274              about 0.0000010781% per second
```

To go back from the returned value to a yearly figure, multiply by 31,536,000 and divide by 1e18:

```text
10781329274 × 31,536,000 / 1e18 = 0.3399999999...     which is 34% per year
```

The reference values for the two kinks:

| Market | Utilization | Rate per year | `ratePerSecond` returns |
|---|---|---|---|
| Blue-chip | 80% | 4% | `1268391679` |
| Blue-chip | 90% | 34% | `10781329274` |
| Meme | 70% | 8% | `2536783358` |
| Meme | 100% | 108% | `34246575342` |

## How the market uses the rate

The market applies the rate to its interest index each time it accrues.

```text
borrowIndex = borrowIndex + borrowIndex × ratePerSecond × elapsed / 1e18
debt        = debtShares × borrowIndex / 1e18
```

Example: Budi owes 1,000 USDG on the Blue-chip market, utilization stays at 90%, and one day (86,400 seconds) passes before the next accrual.

```text
growth      = 10781329274 × 86,400 / 1e18 = 0.000931506849...
borrowIndex = 1.000000 × (1 + 0.000931506849) = 1.000931506849
debt        = 1,000 × 1.000931506849 = 1,000.931506 USDG
```

Within one accrual the interest is linear in time. Interest compounds from one accrual to the next, because each accrual starts from the index the previous one left. Any transaction that changes debt or cash triggers an accrual, and anyone can call `accrue` on the market.

The rate a borrower pays is not the rate a lender earns. Lenders receive the interest minus the reserve factor (15% on the Blue-chip market, 25% on the Meme market), spread over all lender funds, lent out or not. See [interest rates](../concepts/interest-rates.md) and [protocol fees and reserves](../concepts/protocol-fees-and-reserves.md).

## Reading the current rate

[MarketLens](./market-lens.md) does not expose the rate. Compute it from the market and the model:

```ts
import { createPublicClient, erc20Abi, http, parseAbi } from 'viem'

// Placeholders. Farmenta addresses are published on the addresses page after deployment.
const MARKET_ADDRESS = '0x0000000000000000000000000000000000000000'

const marketAbi = parseAbi([
  'function asset() view returns (address)',
  'function tier() view returns (uint8)',
  'function totalBorrows() view returns (uint256)',
  'function interestRateModel() view returns (address)',
])
const modelAbi = parseAbi([
  'function ratePerSecond(uint8 tier, uint256 utilization) pure returns (uint256)',
])

const client = createPublicClient({ transport: http(process.env.RPC_URL) })
const market = { address: MARKET_ADDRESS, abi: marketAbi } as const

const [asset, tier, totalBorrows, model] = await Promise.all([
  client.readContract({ ...market, functionName: 'asset' }),
  client.readContract({ ...market, functionName: 'tier' }),
  client.readContract({ ...market, functionName: 'totalBorrows' }),
  client.readContract({ ...market, functionName: 'interestRateModel' }),
])
const cash = await client.readContract({
  address: asset,
  abi: erc20Abi,
  functionName: 'balanceOf',
  args: [MARKET_ADDRESS],
})

const WAD = 10n ** 18n
const total = cash + totalBorrows
const utilization = total === 0n ? 0n : (totalBorrows * WAD) / total

const ratePerSecond = await client.readContract({
  address: model,
  abi: modelAbi,
  functionName: 'ratePerSecond',
  args: [tier, utilization],
})

const ratePerYear = Number(ratePerSecond * 31_536_000n) / 1e18
console.log(`borrow rate: ${(ratePerYear * 100).toFixed(2)}% per year`)
```

`totalBorrows` is the figure stored at the last accrual, so the result is the rate the next accrual will apply, to within the interest that has built up since.

## Errors

| Error | Meaning |
|---|---|
| `UtilizationTooHigh(uint256 utilization)` | `utilization` is above `1e18` (100%). |
| `TierNotSet()` | `tier` is `NONE`. |

The model emits no events.

## Related pages

- [Interest rates](../concepts/interest-rates.md)
- [Interest and reserves, worked example](../worked-example/interest-and-reserves.md)
- [Risk parameters](./risk-parameters.md)
- [FarmentaMarket](./farmenta-market.md)
