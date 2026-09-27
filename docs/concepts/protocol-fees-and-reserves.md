---
title: Protocol fees and reserves
description: The two fees Farmenta charges, where they go, and the reserve floor that limits what the owner can withdraw.
sidebar_position: 6
---

## Exactly two fees

Farmenta charges two fees and nothing else:

1. **The reserve factor**: a share of the interest that borrowers pay. 15% on the Blue-chip market, 25% on the Meme market.
2. **The protocol liquidation fee**: one tenth of the liquidator bonus, paid by the liquidator in USDG. 0.5% of the repaid amount on Blue-chip, 1% on Meme.

Both go into the market's **reserve**. There is no deposit fee, no withdrawal fee, no origination fee and no flash loan fee. This list is fixed in the current code, so a new fee could only arrive through a contract upgrade by the owner. See [admin powers](../risk/admin-powers.md).

## One drawer with a minimum

It is easy to picture the 15% being split: some for profit, some for a rainy day. That is not how it works.

Think of the till drawer in a shop. All the money goes into the same drawer. The drawer must always keep a minimum amount of change. Only what is above that minimum can be taken home.

The reserve is that drawer. Everything the protocol earns goes in. The minimum is the **reserve floor**. The owner can withdraw only the part above the floor. So the split is not a percentage, it is an order: fill the drawer to the floor first, and only the excess is revenue.

## A small example

Lina supplies $100,000 to the Blue-chip market. Budi borrows $10,000. Nobody else uses the market.

```text
utilization = 10,000 / (90,000 + 10,000)    = 10%
borrow rate = 4% × 10 / 80                  = 0.5% per year
```

After one year:

```text
interest added to Budi's debt                   $50.00
   85% to lenders (Lina)                        $42.50
   15% to the reserve                            $7.50

lender funds = cash + totalBorrows − reserves
             = $90,000.00 + $10,050.00 − $7.50   = $100,042.50

reserve floor = lender funds × 1%                =   $1,000.42
reserve                                          =       $7.50
withdrawable by the owner                        =       $0.00
```

The reserve holds $7.50 and the floor is $1,000.42. Nothing can be withdrawn. All of the $7.50 acts as a loss buffer for lenders.

## Every action and its fee

| Action | Who acts | Protocol fee | Goes to |
|---|---|---|---|
| `deposit` / `mint` (supply USDG) | Lender | None | |
| `depositCollateral`, `depositCollateralWithPermit`, `mintAndDeposit` | Borrower | None | |
| `borrow` | Borrower | None | |
| **Interest accrual** | Borrowers | **Reserve factor: 15% of interest (Blue-chip), 25% (Meme)** | Reserve |
| `collectFees` | Borrower | None | |
| `increaseLiquidity` / `decreaseLiquidity` | Borrower | None | |
| `repay` | Borrower | None | |
| **`liquidate`** | Liquidator | **One tenth of the bonus: 0.5% of the repaid amount (Blue-chip), 1% (Meme)** | Reserve |
| `withdrawCollateral` | Borrower | None | |
| `withdraw` / `redeem` (take USDG out) | Lender | None | |
| `withdrawReserves` | Owner | None | Pays out only the part above the floor |

Swap fees that your position earns on Uniswap are yours. Farmenta takes no share of them.

## The reserve factor

Interest is not billed separately. It is a spread. On the Blue-chip market at 50% utilization, borrowers pay 2.5% per year and lenders earn 1.0625% per year on all supplied funds. The difference that does not reach lenders is the 15% that goes to the reserve.

```text
reserves = reserves + interest × reserveFactor
```

This happens automatically on every accrual. See [interest rates](./interest-rates.md).

## The protocol liquidation fee

The fee is derived from the pool's liquidator bonus, not stored separately:

```text
protocolLiquidationFee = liquidatorBonus / 10
```

The liquidator pays it on top of the amount repaid. Example on Blue-chip, where Rina repays $6,150 of Budi's debt:

```text
repaid                     $6,150.00
seized for Rina (+5%)      $6,457.50
protocol fee (0.5%)           $30.75    to the reserve
Rina pays in total         $6,180.75
Rina's net margin            $276.75    (4.5% of the repaid amount)
```

A liquidator always keeps nine tenths of the bonus. If a pool is listed with a higher bonus, for example 7%, the protocol fee becomes 0.7% automatically. See [liquidation mechanics](../liquidations/mechanics.md).

## The reserve floor

```text
floor        = totalAssets × reserveFloorBps / 10000
withdrawable = min(reserves − floor, cash)          (zero if reserves <= floor)
```

| | Blue-chip | Meme |
|---|---|---|
| Reserve floor (`reserveFloorBps`) | 1% of `totalAssets` | 2.5% of `totalAssets` |

`withdrawReserves(amount, to)` reverts with `ReserveWithdrawalExceedsAvailable` if `amount` is larger than `withdrawable`. There is no switch that opens or closes withdrawals. If the reserve drops below the floor, because of bad debt or because new deposits raised `totalAssets`, withdrawals close by themselves until the reserve has grown back.

The lens contract shows the current numbers: `reserveFloor()` and `withdrawableReserves()`. The market exposes `reserves()`, `reserveFloorBps()` and `totalReservesWithdrawn()`, the running total the owner has taken out.

### Why the floor follows lender funds, not debt

The floor is a promise to lenders, so it follows what lenders have at stake: `totalAssets`.

Compare it with a floor based on outstanding debt, for instance 2% of debt. Repaying a loan does not reduce what lenders have at stake. It only moves money from "lent out" to "idle cash". A floor based on debt would shrink with every repayment and vanish once all loans are repaid, which would make the whole buffer withdrawable while lenders are still in the market.

| State | Lent out | Lender funds | Floor at 2% of debt | Floor at 1% of lender funds |
|---|---|---|---|---|
| Busy | $51,250 | $101,062.50 | $1,025.00 | $1,010.62 |
| Quiet | $10,000 | $101,062.50 | $200.00 | $1,010.62 |
| All repaid | $0 | $101,062.50 | $0.00 | $1,010.62 |

The floor does shrink when lenders withdraw their funds. At that point there is less left to protect.

### How long until anything is withdrawable

From interest alone, the time until the reserve passes the floor is roughly:

```text
years = reserveFloorRate / (utilization × borrowRate × reserveFactor)
```

Here `reserveFloorRate` is `reserveFloorBps / 10000`, which is 1% in the Blue-chip market.

For the Blue-chip market with $100,000 supplied:

| Borrowed | Utilization | Borrow rate | To lenders per year | To the reserve per year | Years until the floor is passed |
|---|---|---|---|---|---|
| $10,000 | 10% | 0.5% | $42.50 | $7.50 | about 133 |
| $30,000 | 30% | 1.5% | $382.50 | $67.50 | about 14.8 |
| $50,000 | 50% | 2.5% | $1,062.50 | $187.50 | about 5.3 |
| $80,000 | 80% | 4% | $2,720.00 | $480.00 | about 2.1 |

The figures are approximate because the floor itself rises slowly as lender funds grow. In every row, the amount withdrawable in the first year is $0.

Liquidations bring the reserve closer to the floor from one side only. The liquidation fee raises the reserve, but a liquidation without bad debt does not change `totalAssets` (cash goes up, debt goes down by the same amount), so the floor stays where it is.

## The floor limits the owner, not loss absorption

:::warning[The floor does not protect the reserve from bad debt]
When a loan ends as bad debt, the loss is taken from the **whole** reserve, including the part below the floor. The floor only limits what the owner can withdraw through `withdrawReserves`.
:::

This is deliberate. If the floor also shielded the reserve from bad debt, losses would land on lenders while reserve money sat idle. See [bad debt and loss absorption](./bad-debt.md).

Two more limits are worth knowing:

- **The reserve is small compared with a real loss.** It grows only from interest and liquidation fees. In the [bad debt example](./bad-debt.md), the whole reserve (a full year of interest income plus the liquidation fee of the event itself) covers about 13% of the loss.
- **The floor is a rule in the current code.** The market is upgradeable by the owner with no timelock, so the floor does not bind whoever holds the upgrade key. See [admin powers](../risk/admin-powers.md).

## Cash is a shared physical limit

The reserve is not a separate wallet. Its USDG sits in the same contract balance as the lenders' idle cash. That is why `withdrawable` is also capped by `cash`: nobody can take out USDG that is currently lent to borrowers.

When utilization is high, lenders and the owner draw on the same cash, and whoever withdraws first is served first. The cash limit gives lenders no priority. It does not lower the value of lender shares either, because `totalAssets` already excludes the reserve. It can only affect how soon a lender can withdraw.

## Related pages

- [Interest rates](./interest-rates.md)
- [Bad debt and loss absorption](./bad-debt.md)
- [Liquidation mechanics](../liquidations/mechanics.md)
- [Worked example: interest and reserves](../worked-example/interest-and-reserves.md)
- [Admin powers](../risk/admin-powers.md)
- [Risk parameters](../reference/risk-parameters.md)
