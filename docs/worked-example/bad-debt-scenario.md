---
title: "Alternative ending: bad debt"
description: A deeper price fall leaves Budi's position worth less than his debt. The reserve absorbs the first part of the loss and lenders take the rest.
sidebar_position: 6
---

## What happens

In this version of the story, the price of ETH falls so far and so fast that Budi's collateral is worth less than his debt. Even after the whole position is seized, part of the debt can never be repaid. That unpaid part is **bad debt**.

The reserve pays for as much of it as it can. Lenders carry the rest.

:::note
This branch **replaces** the liquidation at T5. It does not follow it. Everything up to T4 is the same: Budi owes $12,300.00 and the reserve holds $187.50.
:::

## The starting point

Suppose ETH loses more than half its value overnight and no liquidator gets in earlier. The fall has to be that deep. A liquidity position loses value more slowly than ETH itself, so a 40% fall in ETH would still leave the position worth at least 60% of $20,300.

```text
Budi's position value      $11,000.00
Budi's debt                $12,300.00   the debt is now larger than the collateral
reserve                       $187.50   from T3, because T5 never happened
```

```text
HF = $11,000 × 75% / $12,300            = 0.671
```

The health factor is below 0.9, so the close factor rises to 100%. A liquidator may repay the entire debt in one call.

## Why the whole position is taken

Repaying the full debt would entitle the liquidator to more than the position holds:

```text
value to seize for a full repay = $12,300 × 1.05    = $12,915.00
what the position holds                             = $11,000.00
```

When the seizure would reach past everything in the position, the contract switches to **full seizure**: the liquidator receives the entire position, and the contract cuts the repayment down to what that position can pay for.

```text
repay after the cut = position value / (1 + bonus)
                    = $11,000 / 1.05                = $10,476.19
```

Rina may enter any amount from 10,476.19 USDG upward, the point where `repay × 1.05` reaches the $11,000 the position holds. The contract cuts it down to 10,476.19, so she never pays for more than she receives, and the size of the bad debt does not depend on the number she typed. A smaller amount would run as an ordinary partial liquidation and record no bad debt in that call.

## The call and the money that moves

```solidity
market.liquidate(tokenId, 12_300e6, minOut0, minOut1, rina);
```

```text
repay after the cut       = $11,000 / 1.05              = $10,476.19
protocol fee              = $10,476.19 × 0.5%           =     $52.38   goes to the reserve
Rina pays                 = $10,476.19 × 1.005          = $10,528.57
Rina receives the whole position                        = $11,000.00
Rina's profit             = $11,000.00 - $10,528.57     =    $471.43

bad debt                  = $12,300.00 - $10,476.19     =  $1,823.81
```

Rina's profit is still 4.5% of what she repaid. The position is closed and paid out to her as ETH and USDG, fees included.

Budi loses his entire position. He does not owe the remaining $1,823.81: his loan record is deleted. That remainder is the protocol's loss.

## Who absorbs the loss

The loss is handled in layers. Prevention comes first (conservative LTV and LT, debt caps, curated pools). When prevention was not enough, two layers pay.

### The reserve pays first

```text
reserve        = $187.50 + $52.38                   = $239.88
bad debt                                            = $1,823.81

covered by the reserve                              = $239.88
reserve after                                       =   $0.00
```

The reserve is used **in full, including the part under the $1,010.62 floor**.

### Lenders take the rest

```text
socialized to lenders = $1,823.81 - $239.88         = $1,583.93
```

The unpaid debt is removed from the market's total debt. The part the reserve covered has no effect on lenders, because debt and reserve fall by the same amount. The remaining $1,583.93 has nothing to fall against, so it lowers lender funds and with it the value of every share token in this market. The contract reports that amount in the `BadDebtSocialized` event.

```text
lender funds before     $101,062.50
lender funds after       $99,478.57
difference               -$1,583.93   exactly the amount socialized to lenders
```

```text
Market state                 before           after

cash                     $50,000.00      $60,528.57   (+ $10,528.57 from Rina)
total debt               $51,250.00      $38,950.00   (Budi's $12,300.00 removed)
reserve                     $187.50           $0.00
lender funds            $101,062.50      $99,478.57
```

:::warning[Lenders can lose part of their deposit]
Lina ends with $99,478.57, which is **$521.43 below the $100,000.00 she supplied**, even though she had earned $1,062.50 of interest before the event. Bad debt that the reserve cannot cover is taken from lenders of that market, in proportion to their shares. Nothing in the protocol guarantees your deposit.
:::

## The floor limits the owner, not loss absorption

This is the point that is easiest to get backwards. The reserve floor restricts what the **owner** can withdraw. It does not restrict what the reserve can be used for.

If the floor also shielded the reserve from bad debt, it would weaken the very protection it exists to strengthen. Losses would fall straight on Lina while a buffer sat unused next to them.

After the event the reserve is at zero, far under the floor. Owner withdrawals stay closed on their own until interest and liquidation fees have refilled the reserve past the floor. No governance action opens or closes them.

## Be honest about scale

```text
reserve available   $239.88
bad debt          $1,823.81
covered             $239.88 / $1,823.81             = about 13%
```

The entire reserve, a full year of interest income plus the fee from this very liquidation, covered about 13% of this one event. At this size the reserve floor is a discipline, not sufficient protection.

:::warning[The floor does not bind the upgrade key]
The floor is enforced by `withdrawReserves` in the current code. The market contract is upgradeable by a single owner account with no timelock, and an upgrade could rewrite that rule. Treat the floor as protection against routine operations and accidents, not against the key holder. See [admin powers](../risk/admin-powers.md).
:::

## The other market is not affected

Each market keeps its own cash, debt and reserve. This loss lands only on lenders of the Blue-chip market. Lenders in the Meme market are untouched, and the reverse is also true.

## Summary

| Item | Amount |
|---|---|
| Position value | $11,000.00 |
| Debt | $12,300.00 |
| Health factor | 0.671 |
| Close factor | 100% |
| Repay after the cut | $10,476.19 |
| **Protocol fee** | **$52.38**, to the reserve |
| Rina pays / receives | $10,528.57 / $11,000.00 |
| Rina's profit | $471.43 |
| Bad debt | $1,823.81 |
| Absorbed by the reserve | $239.88 |
| Socialized to lenders | $1,583.93 |
| Lender funds | $101,062.50 to $99,478.57 |

## Related pages

- [Bad debt](../concepts/bad-debt.md)
- [Liquidation mechanics](../liquidations/mechanics.md)
- [Protocol fees and reserves](../concepts/protocol-fees-and-reserves.md)
- [Risk overview](../risk/overview.md)

Next: [Variations: the Meme market and frozen pools](./meme-market-and-frozen-pools.md).
