---
title: "Step 4: Repaying and withdrawing"
description: Budi repays and takes his NFT back, Lina withdraws her USDG with interest, and a summary table lists every point where a fee could apply.
sidebar_position: 5
---

## What happens

Budi pays off what is left of his debt and gets his NFT back. Lina withdraws her USDG, now worth more than she put in. Neither of them pays a protocol fee.

Lina cannot take everything out at once, because part of her money is still on loan to other borrowers. That is a limit on available cash, not a charge.

## T6: Budi repays and takes his NFT back

After the liquidation at T5, Budi owes $6,150.00.

```solidity
// repay(uint256 tokenId, uint256 amount)
market.repay(tokenId, type(uint256).max);   // pays 6,150 USDG, debt becomes zero

// withdrawCollateral(uint256 tokenId, address to)
market.withdrawCollateral(tokenId, budi);   // the NFT returns to Budi
```

Passing `type(uint256).max` repays the complete outstanding debt, whatever it is at that second. This avoids leaving a tiny remainder behind as interest keeps accruing. Budi must have approved the market to pull USDG from him.

`withdrawCollateral` reverts with `OutstandingDebt` while any debt is recorded against the position. Once the debt is zero, the NFT is returned with nothing deducted. Budi can also name a different recipient address.

```text
Budi pays                                 $6,150.00
Budi's debt after                             $0.00
Budi receives                             his position NFT, worth $9,542.50
```

```text
Market state after T6

cash                  $62,330.75   ($56,180.75 + $6,150.00 from Budi)
total debt            $38,950.00   (the other borrowers)
reserve                  $218.25
lender funds         $101,062.50
```

### Both calls work while the market is paused

The owner can pause the market. Pausing stops the actions that take on new risk, such as supplying, depositing collateral and borrowing. It does **not** stop `repay` or `withdrawCollateral`.

This is deliberate. A position with no debt belongs entirely to its depositor, and holding it back would protect nobody. See [pause and emergency](../risk/pause-and-emergency.md) for what a pause does and does not stop.

**The protocol charges nothing here.** Over the whole loan, Budi paid $300.00 of interest and lost $307.50 to the liquidator's bonus. He never paid a fee to the protocol directly.

## T7: Lina withdraws

Lina's share tokens are worth **$101,062.50**: her original $100,000.00 plus her $1,062.50 share of the interest. There is no withdrawal fee.

She cannot withdraw all of it at once, because part of the money is still on loan:

```text
cash after T5 and T6
    = $50,000.00 + $6,180.75 (from Rina) + $6,150.00 (from Budi)   = $62,330.75

still on loan to other borrowers                                   = $38,950.00

Lina's shares are worth                                            = $101,062.50
she can withdraw now (limited by cash)                             =  $62,330.75
the rest waits for other borrowers to repay                        =  $38,731.75
```

The vault reports the available amount through `maxWithdraw` and `maxRedeem`, both capped by cash. A request above that cap reverts, so Lina withdraws what is available and keeps the remaining shares.

```solidity
uint256 available = market.maxWithdraw(lina);   // 62,330.75 USDG

// withdraw(uint256 assets, address receiver, address owner)
market.withdraw(available, lina, lina);
```

```text
Market state after T7

cash                       $0.00
total debt            $38,950.00
reserve                  $218.25
lender funds          $38,731.75   (Lina's remaining shares)
```

### A cash limit, not a fee

Not one cent moves to the protocol. The remaining $38,731.75 becomes available on its own as the other borrowers repay, and it keeps earning interest for Lina in the meantime.

With cash at zero, utilization is 100% and the borrow rate sits at the top of the curve (64% a year in the Blue-chip market). That steep rate is what pushes borrowers to repay and draws new lenders in, which brings cash back.

Every lending market built on a shared pool of funds works this way. Withdrawals stay open while the market is paused.

**The protocol charges nothing here.**

## How everyone ended up

| Person | Result |
|---|---|
| **Lina** | Supplied $100,000.00. Her shares are worth $101,062.50, a gain of $1,062.50. |
| **Budi** | Borrowed $12,000.00 and repaid $6,150.00 himself. The other $6,150.00 was repaid by Rina in exchange for $6,457.50 of his collateral. His cost: $300.00 of interest plus $307.50 of liquidation bonus. |
| **Rina** | Paid $6,180.75 and received $6,457.50, a profit of $276.75 before swap costs and gas. |
| **Protocol reserve** | $187.50 from interest plus $30.75 from the liquidation, $218.25 in total. None of it can be withdrawn, because it is under the floor. |

## Every touchpoint

This table lists every action in the protocol and whether it carries a protocol fee.

| Action | Who pays | Protocol fee | Where it goes |
|---|---|---|---|
| `deposit` / `mint` (supply USDG) | Lina | None | Not applicable |
| `depositCollateral` (hand over the NFT) | Budi | None | Not applicable |
| `borrow` | Budi | None | Not applicable |
| **Interest accruing** | Budi and other borrowers | **15% of interest** | Reserve |
| `collectFees` (claim Uniswap fees) | Budi | None | Not applicable |
| `increaseLiquidity` / `decreaseLiquidity` | Budi | None | Not applicable |
| `repay` | Budi | None | Not applicable |
| **`liquidate`** | Rina | **10% of the bonus**, which is 0.5% of the amount repaid | Reserve |
| `withdrawCollateral` (take the NFT back) | Budi | None | Not applicable |
| `withdraw` / `redeem` (take USDG out) | Lina | None | Not applicable |
| `withdrawReserves` | Owner | None | Out of the market, and only the part above the floor |

The two bold rows are the **whole** of Farmenta's economics. Everything else is zero. There is no deposit fee, no withdrawal fee, no origination fee and no flash loan fee.

This list is fixed in the current code.

:::info
The liquidator bonus is not a protocol fee. It is paid out of the borrower's collateral to the liquidator. The protocol's part is the extra 0.5% that the liquidator pays on top of the repayment.
:::

## Related pages

- [Protocol fees and reserves](../concepts/protocol-fees-and-reserves.md)
- [Managing collateral](../concepts/managing-collateral.md)
- [Pause and emergency](../risk/pause-and-emergency.md)
- [FarmentaMarket reference](../reference/farmenta-market.md)

Next: [Alternative ending: bad debt](./bad-debt-scenario.md) shows what happens when the price falls too far for a liquidation to cover the debt.
