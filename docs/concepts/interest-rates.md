---
title: Interest rates
description: How utilization sets the borrow rate, how interest accrues every second, and how lenders earn through a rising share price.
sidebar_position: 5
---

## The idea

Interest on Farmenta works like prices in a car park. While most spaces are free, parking is cheap. As the car park fills up, the price rises, slowly at first and then steeply once it is nearly full. The steep part makes sure a few spaces are always about to free up.

In a market, the "spaces" are the USDG that lenders supplied. The more of it is borrowed, the higher the borrow rate. A high rate pushes borrowers to repay and attracts new lenders, which keeps cash available for withdrawals.

## A small example

Lina supplies 100,000 USDG to the Blue-chip market. Borrowers have taken 50,000 USDG of it.

```text
utilization = 50,000 / (50,000 + 50,000)   = 50%
borrow rate = 4% × 50 / 80                 = 2.5% per year
supply rate = 2.5% × 50% × (1 − 15%)       = 1.0625% per year
```

Borrowers pay 2.5% on what they borrowed. Lina earns 1.0625% on everything she supplied, because only half of her money is lent out and 15% of the interest goes to the reserve.

## Utilization

Utilization is the share of the market's USDG that is currently borrowed.

```text
utilization = totalBorrows / (cash + totalBorrows)
```

- `cash` is the idle USDG sitting in the market contract.
- `totalBorrows` is everything borrowers owe, interest included.

## The kinked curve

The borrow rate is a function of utilization with a bend (the kink). Below the kink the rate rises gently. Above it the rate rises steeply.

```text
if utilization <= kink:
    borrowRate = slope1 × utilization / kink

if utilization > kink:
    borrowRate = slope1 + slope2 × (utilization − kink) / (1 − kink)
```

There is no base rate: at 0% utilization the borrow rate is 0%.

| Parameter | Blue-chip | Meme |
|---|---|---|
| Kink | 80% | 70% |
| Slope 1 (rate at the kink) | 4% | 8% |
| Slope 2 (added between the kink and 100%) | 60% | 100% |
| Rate at 100% utilization | 64% | 108% |
| Reserve factor | 15% | 25% |

One `InterestRateModel` contract carries both curves. Each market passes its own tier, so a market always uses the curve of its tier. The curve parameters (kink, slope 1, slope 2) are constants in the contract and cannot be set per pool. The reserve factor is not part of the rate model: each market stores it, fixed per tier when the market is initialized.

```solidity
function ratePerSecond(ICollateralPolicy.Tier tier, uint256 utilization)
    external
    pure
    returns (uint256);
```

### Rates at different utilization levels

Blue-chip market:

| Utilization | Borrow rate per year | Supply rate per year |
|---|---|---|
| 10% | 0.5% | 0.0425% |
| 50% | 2.5% | 1.0625% |
| 80% (kink) | 4% | 2.72% |
| 90% | 34% | 26.01% |
| 100% | 64% | 54.4% |

Meme market:

| Utilization | Borrow rate per year | Supply rate per year |
|---|---|---|
| 35% | 4% | 1.05% |
| 70% (kink) | 8% | 4.2% |
| 85% | 58% | 36.975% |
| 100% | 108% | 81% |

Rates are annual and change whenever utilization changes: every borrow, repayment, deposit and withdrawal moves them.

## Supply rate

Lenders receive the interest that borrowers pay, minus the reserve factor, spread over all supplied funds.

```text
supplyRate = borrowRate × utilization × (1 − reserveFactor)
```

The reserve factor is the share of interest that goes to the market's reserve: 15% on Blue-chip, 25% on Meme. It is one of the only two fees the protocol charges. See [protocol fees and reserves](./protocol-fees-and-reserves.md).

The formula is a close approximation. The exact lender return is the interest kept by lenders divided by lender funds (`totalAssets`), and lender funds exclude the reserve.

## How interest accrues

Interest accrues per second and is tracked with an index, so the market never has to update each loan one by one.

```text
ratePerSecond = borrowRate / 31,536,000            (seconds in 365 days)

borrowIndex   = borrowIndex × (1 + ratePerSecond × secondsElapsed)
totalBorrows  = totalBorrowShares × borrowIndex / 1e18
interest      = totalBorrows after − totalBorrows before
reserves      = reserves + interest × reserveFactor
```

- `borrowIndex` starts at `1e18` and only grows.
- Accrual runs at the start of every function that changes debt or cash (lender deposits and withdrawals, `borrow`, `repay`, `liquidate`, reserve withdrawals) and before the collateral actions that check a health factor. Anyone can also call `accrue()` directly.
- Within one interval the interest is linear in time. Each accrual builds on the index left by the previous one, so interest compounds from accrual to accrual.

### Debt shares

When you borrow, the market records **debt shares** instead of a USDG amount.

```text
shares minted at borrow = amount × 1e18 / borrowIndex     (rounded up)
debt                    = debtShares × borrowIndex / 1e18
```

Your share count stays the same while the index grows, so your debt grows with it.

Example: you borrow 12,000 USDG when `borrowIndex` is `1.000`. You receive 12,000 debt shares. A year later the index is `1.025`.

```text
debt = 12,000 × 1.025 = 12,300 USDG
```

You can repay any amount at any time. Passing the maximum `uint256` value to `repay` clears the whole debt, including interest accrued up to that block. There is no repayment fee and no early repayment penalty.

Shares are rounded up when you borrow, so a loan is never recorded as smaller than the amount paid out.

## How lenders earn

Each market is an [ERC-4626](https://eips.ethereum.org/EIPS/eip-4626) vault. When you supply USDG you receive share tokens:

| Market | Share token |
|---|---|
| Blue-chip | `fUSDG-BC` |
| Meme | `fUSDG-MEME` |

Your number of shares does not change. What rises is the amount of USDG each share can be redeemed for.

```text
totalAssets = cash + totalBorrows − reserves
share price = totalAssets / total share supply
```

`totalAssets` is the lender funds: everything that belongs to lenders. As borrowers accrue interest, `totalBorrows` grows. The reserve takes its cut, and the rest raises `totalAssets` and therefore the share price.

Continuing the example, with 50,000 USDG borrowed for one year at 2.5%:

```text
interest                 = 50,000 × 2.5%          =   1,250.00
to the reserve (15%)     = 1,250 × 15%            =     187.50
to lenders (85%)         = 1,250 − 187.50         =   1,062.50

totalAssets = 50,000 + 51,250 − 187.50            = 101,062.50
```

Lina's shares are now worth 101,062.50 USDG instead of 100,000.

The share tokens have 9 decimals: the 6 decimals of USDG plus an offset of 3. The offset protects the vault against share inflation attacks on a nearly empty market.

:::warning[Share price can also fall]
If a loan ends as bad debt and the reserve cannot cover it, the loss lowers `totalAssets` and the share price of that market. See [bad debt and loss absorption](./bad-debt.md).
:::

## Withdrawals are limited by cash

Lent out USDG is not in the contract. You can only withdraw what is there.

```text
maxWithdraw = min(value of your shares, cash)
```

`maxRedeem` is limited in the same way. If the market holds 62,000 USDG in cash and your shares are worth 101,000 USDG, you can withdraw 62,000 now. The rest becomes available as borrowers repay or new lenders deposit, and it keeps earning interest in the meantime.

This is a liquidity limit, not a fee. It is also why the curve turns steep above the kink: high utilization means little cash, and a high rate is the pressure that brings cash back.

Deposits stop while the market is paused. Withdrawals stay open, within available cash.

## Related pages

- [Protocol fees and reserves](./protocol-fees-and-reserves.md)
- [Health factor, LTV and liquidation threshold](./health-factor.md)
- [Bad debt and loss absorption](./bad-debt.md)
- [InterestRateModel reference](../reference/interest-rate-model.md)
- [Worked example: interest and reserves](../worked-example/interest-and-reserves.md)
