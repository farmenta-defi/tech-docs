---
title: "Step 2: A year of interest and the reserve"
description: A year of interest produces the first protocol fee, $187.50, and shows why the owner cannot withdraw the reserve yet.
sidebar_position: 3
---

## What happens

A year passes. Borrowers owe interest, most of it goes to Lina, and a slice goes to the protocol's reserve. Then the owner tries to take that slice out, and the contract refuses.

**This is the first protocol fee.** It is the only fee that ordinary lending and borrowing ever produces.

## T3: a year of interest

Budi is not the only borrower. Shortly after T2, other borrowers take $38,000, so the market's total debt is **$50,000** for the whole year. Of that, $12,000 is Budi's. Lina is still the only lender.

```text
cash         = $100,000 - $50,000               = $50,000.00
utilization  = $50,000 / ($50,000 + $50,000)    = 50%
borrow rate  = 4% × 50 / 80                     = 2.50% a year
```

One year later:

```text
interest accrued   = $50,000 × 2.50%            = $1,250.00   added to the borrowers' debt
protocol share     = $1,250.00 × 15%            =   $187.50   goes to the reserve
left for Lina      = $1,250.00 - $187.50        = $1,062.50
```

Interest is not paid in cash as it accrues. It is added to what borrowers owe, so cash stays at $50,000 and total debt grows to $51,250.

No transaction is needed to make this happen. The calculation runs on its own at the start of every function that touches debt or cash.

```solidity
// Runs at the start of every call that touches debt or cash. Anyone may also call it directly.
market.accrue();
```

### The fee is a spread, not a separate charge

This is the part worth understanding. Nobody receives a bill from the protocol.

```text
Budi pays          2.50% a year on his debt
Lina earns         1.0625% a year on her deposit   (= 50% × 2.50% × 85%)
```

Borrowers pay 2.50%. Lenders receive 85% of that interest, spread over all their funds, including the half that sits idle. The missing 15% of the interest is the protocol's share. No extra transaction, no extra signature.

### What Lina's shares are worth

```text
lender funds = cash + total debt - reserve
             = $50,000.00 + $51,250.00 - $187.50
             = $101,062.50
```

Lina holds the same number of share tokens as before. Their value went from $100,000.00 to $101,062.50.

### What Budi owes

```text
Budi's debt  = $12,000 × 1.025                  = $12,300.00
```

```text
Market state after T3

cash                  $50,000.00
total debt            $51,250.00
reserve                  $187.50
lender funds         $101,062.50
```

## T4: the owner tries to withdraw reserves

```solidity
// withdrawReserves(uint256 amount, address to), owner only
market.withdrawReserves(amount, treasury);
// reverts: ReserveWithdrawalExceedsAvailable(amount, 0)
```

The contract only lets the owner take what sits above the **reserve floor**:

```text
floor         = lender funds × 1%
              = $101,062.50 × 1%                = $1,010.62
reserve                                         =   $187.50
withdrawable  = min(reserve - floor, cash)      =     $0.00   (zero while the reserve is under the floor)
```

The reserve holds $187.50. The floor is $1,010.62. There is nothing above the floor, so any amount above zero reverts.

### How long until the floor is passed

```text
reserve after t years = debt × rate × reserve factor × t
floor                 = lender funds × 1%

t = 1% / (utilization × rate × reserve factor)
```

| Utilization | Borrow rate | Reserve growth (% of debt per year) | Time until the floor is passed |
|---|---|---|---|
| 30% | 1.50% | 0.225% | 14.8 years |
| 50% | 2.50% | 0.375% | **5.3 years** |
| 80% | 4.00% | 0.600% | 2.1 years |

At normal utilization, withdrawal is closed for years. That is the intended result for a protocol whose code is unaudited.

### Why the floor follows lender funds, not debt

The floor is a promise to lenders, and what lenders have at stake is their funds. A floor based on debt would vanish as borrowers repay. The table compares a floor of 2% of debt with the actual floor of 1% of lender funds. The two are the same size at 50% utilization.

| State | On loan | Lender funds | Floor if based on debt | Floor based on lender funds |
|---|---|---|---|---|
| Busy | $51,250 | $101,062.50 | $1,025.00 | $1,010.62 |
| Quiet | $10,000 | $101,062.50 | $200.00 | $1,010.62 |
| **Everything repaid** | **$0** | **$101,062.50** | **$0.00, gone** | **$1,010.62** |

Lina's money does not disappear when Budi repays. It only moves from "on loan" to "idle cash", so the protection has to stay. The floor does shrink when lenders withdraw, and at that point there is less left to protect.

### Liquidations approach the floor from one side only

A liquidation fee raises the reserve. It does not lower the floor, because a liquidation without bad debt leaves lender funds unchanged: cash goes up, debt goes down, the sum stays the same.

Even if the entire $51,250 book were liquidated, the fees would add $256.25 and the reserve would reach only $443.75, still under the $1,010.62 floor.

### Two limits apply together

- **The floor** keeps the loss buffer in place.
- **The cash limit** makes sure the owner cannot withdraw more USDG than the contract holds.

The cash limit is not a priority rule in Lina's favor. Reserve USDG is not kept in a separate wallet. It sits in the same cash as everything else, so when cash is thin, whoever withdraws first gets it. Lina's share value does not fall because of this, since lender funds already exclude the reserve. Only the timing of her withdrawal is affected.

**The protocol charges nothing at T4.** No money moves at all.

## A smaller example: where does the 15% go?

People often ask how much of the 15% is profit and how much is set aside for safety.

:::note
This short example uses different numbers from the main timeline. It has one lender and one borrower, nothing else.
:::

### It is not split in two

It is tempting to picture the 15% being divided, part for profit and part for the buffer. That is not how it works. **All of it goes into one place, the reserve.** The reserve has a floor, and only what sits above the floor can be taken out.

It is like the till drawer in a shop. All the money goes into the same drawer, but the drawer must always keep a minimum float for change. The shopkeeper can take home only the excess.

So the division is not a percentage. It is an order: fill the drawer up to the floor first, and only what comes after that belongs to the protocol.

### The numbers

Lina supplies $100,000. Budi borrows $10,000. There are no other borrowers.

```text
utilization  = $10,000 / ($90,000 + $10,000)    = 10%
borrow rate  = 4% × 10 / 80                     = 0.50% a year
```

After one year:

```text
interest added to Budi's debt                     $50.00
    85% to Lina                                   $42.50
    15% to the protocol                            $7.50   all of it goes to the reserve
```

```text
lender funds = $90,000.00 + $10,050.00 - $7.50  = $100,042.50
floor        = $100,042.50 × 1%                 =   $1,000.42
reserve                                         =       $7.50

withdrawable by the owner                       =       $0.00
kept as a buffer against bad debt               =       $7.50
```

The rule is not holding back the protocol's share. There is simply no excess yet. At $7.50 a year against a floor of about $1,000:

```text
$1,000 / $7.50 per year = about 133 years
```

That is not a miscalculation. A $10,000 loan out of $100,000 is too quiet: the rate is only 0.5%, so only $7.50 a year flows to the protocol, with or without the floor.

### With more borrowing

Lina still supplies $100,000. Only the borrowed amount changes.

| Borrowed | Utilization | Borrow rate | To Lina | To the reserve | Withdrawable in year 1 | Floor is passed after about |
|---|---|---|---|---|---|---|
| $10,000 | 10% | 0.50% | $42.50 | $7.50 | $0 | **133 years** |
| $30,000 | 30% | 1.50% | $382.50 | $67.50 | $0 | 14.8 years |
| $50,000 | 50% | 2.50% | $1,062.50 | $187.50 | $0 | 5.3 years |
| $80,000 | 80% | 4.00% | $2,720.00 | $480.00 | $0 | 2.1 years |

The last column uses the same formula as T4. It treats the floor as fixed, although the floor rises slightly as Lina's interest adds up, so the figures are approximate.

In the first year every row gives $0 to withdraw. Even in the busiest case, $480.00 has been collected against a floor of $1,027.20.

Until the reserve passes the floor, 100% of the protocol's share acts as a buffer. Once it has passed the floor, every additional dollar can be withdrawn.

## Summary of step 2

| Step | Action | Protocol fee |
|---|---|---|
| T3 | $1,250.00 of interest accrues | **$187.50**, 15% of interest, to the reserve |
| T4 | Owner attempts to withdraw reserves | None. The call reverts |

## Related pages

- [Interest rates](../concepts/interest-rates.md)
- [Protocol fees and reserves](../concepts/protocol-fees-and-reserves.md)
- [Interest rate model reference](../reference/interest-rate-model.md)
- [Admin powers](../risk/admin-powers.md)

Next: [Step 3: The price falls and the loan is liquidated](./liquidation.md).
