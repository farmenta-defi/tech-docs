---
title: Risk overview
description: The main risks of lending, borrowing and liquidating on Farmenta, who bears each one, and what limits it.
sidebar_position: 1
---

## What you are trusting

Farmenta works like a pawnshop that accepts an item whose price moves every second. The item is a Uniswap v4 liquidity position, the loan is in USDG, and the shop sells part of the item when the loan is no longer safely covered. Every step of that depends on something that can fail: the code, the account that administers it, the price feeds, the pool the position sits in, the USDG token, and the chain itself.

This section lists those dependencies plainly. It does not try to reassure you. Read it before you supply USDG, deposit a position, or run a liquidation bot.

:::danger[Unaudited code and a single upgrade key]
Farmenta's smart contracts have not been audited and are not deployed yet. The market contract is upgradeable, the upgrade is controlled by one owner account, and there is no timelock. Whoever holds that key can replace the market's logic in a single transaction and take both the collateral NFTs and the supplied USDG. See [Owner powers and upgradeability](./admin-powers.md).
:::

## A small example

Budi deposits a position worth $10,000 in the Blue-chip market and borrows 6,000 USDG. The [liquidation threshold (LT)](../resources/glossary.md) of his pool is 75%, and USDG is worth $1.00.

```text
HF = collateralValue × LT / debtUsd
HF = 10,000 × 0.75 / 6,000 = 1.25
```

Three different things can push that number below 1 and make the loan liquidatable:

- **The market moves.** ETH falls, the position is now worth $7,900, and `HF = 7,900 × 0.75 / 6,000 = 0.9875`.
- **Time passes.** Interest is added to the debt every second. With no price change at all, the debt eventually grows until `HF < 1`.
- **The owner changes the terms.** If the owner lowers the pool's LT, the same position and the same debt give a lower HF. Budi did nothing, and he still pays the liquidator bonus.

The first two are the ordinary risks of any collateralized loan. The third is a consequence of how Farmenta is administered, and it is described in full on the [owner powers](./admin-powers.md) page.

## Summary of the main risks

| Risk | Who bears it | What limits it | Details |
|---|---|---|---|
| **Unaudited smart contracts.** A bug can lose or lock funds. | Everyone | Open source code, automated tests. No audit. | [Owner powers](./admin-powers.md) |
| **Upgrade key.** One owner account can upgrade the market (UUPS) with no timelock, and an upgrade can take the collateral NFTs and the supplied USDG in one transaction. | Everyone | Nothing on-chain. You trust the key holder. | [Owner powers](./admin-powers.md) |
| **The owner can lower a pool's LT** and make a healthy loan liquidatable. There is no rate limit and no floor on tightening. | Borrowers | A scheduled LT ramp is stored on-chain and readable. The owner is not required to use one. | [Owner powers](./admin-powers.md) |
| **Oracle risk.** Chainlink is the only price source for ETH and USDG. The ETH/USD feed has a 24 hour heartbeat. | Borrowers and lenders | Prices older than 25 hours are rejected. Inside that window a lagging price is held only by the 2% spot gate on borrowing. | [Oracle, market and chain risks](./oracle-and-market-risks.md) |
| **Meme token price manipulation and rug risk.** A thin pool can be pushed, and a token can lose nearly all its value. | Meme market borrowers and lenders | Low max LTV (30%) and LT (40%), small debt caps, `min(spot, TWAP)` at borrow, pool by pool listing. Meme pools are not listed with real funds until a guard against single-transaction price pushes is in place. | [Oracle, market and chain risks](./oracle-and-market-risks.md) |
| **Bad debt is socialized to lenders.** When collateral no longer covers a debt, the reserve absorbs the loss first and lenders of that market absorb the rest. | Lenders of the affected market | Conservative LTV and LT, debt caps, the reserve, and full isolation between the two markets. | [Bad debt](../concepts/bad-debt.md) |
| **Liquidity risk for lenders.** Withdrawals are limited by the cash in the market. At high utilization you may have to wait. | Lenders | An interest curve that rises steeply above the kink to attract deposits and repayments. | [Oracle, market and chain risks](./oracle-and-market-risks.md) |
| **USDG issuer powers.** The issuer can freeze addresses and pause the token. A pause halts repay, liquidate and withdrawals while it lasts. | Everyone | None in Farmenta's code. This is an external dependency. | [Oracle, market and chain risks](./oracle-and-market-risks.md) |
| **Chain risk.** Robinhood Chain is an early stage rollup with a single sequencer, and it has no sequencer uptime feed. | Everyone | The owner can pause the market by hand. Pausing also stops liquidations. | [Pause and emergency behaviour](./pause-and-emergency.md) |
| **Third party hooks.** A pool's hook that is upgradeable can change its behaviour after the pool was reviewed. | Borrowers and lenders in that pool | On-chain permission check of the hook address, manual review before listing, and the ability to freeze the pool. | [Oracle, market and chain risks](./oracle-and-market-risks.md) |
| **Liquidation risk.** When `HF < 1`, part or all of your position is sold to a liquidator at a discount. | Borrowers | A gap between max LTV and LT, partial liquidation in the Blue-chip market, and your own monitoring. | [Liquidations](../liquidations/overview.md) |

## If you lend

You supply USDG to one market and receive its share token. Your risks, in order of severity:

1. **The upgrade key and unaudited code.** Both can lose everything you supplied. No parameter protects against them.
2. **Bad debt.** If a position is liquidated for less than its debt, the shortfall is taken from the market's reserve, all of it if needed. What the reserve cannot cover lowers the value of every share in that market. The reserve grows only from interest and liquidation fees, so in a young market it is small compared with a single large loss.
3. **Liquidations that cannot run.** While the market is paused, while USDG is paused by its issuer, or while a Chainlink price is older than 25 hours, liquidations revert. Prices can keep falling in that time, and a loan that was merely unhealthy can turn into bad debt.
4. **Waiting for cash.** You can withdraw only up to the USDG that is idle in the market. The rest of your funds is lent out and returns as borrowers repay.

:::warning[Market isolation is the only diversification]
A loss in the Meme market never touches Blue-chip lenders, and the reverse. Inside one market, every lender shares every loss in proportion to their shares. Choose the market with that in mind: the Meme market pays a higher rate because its collateral is far more likely to fail.
:::

What you can do: read each pool's terms and debt cap before you supply, watch utilization, and treat the share price as a number that can go down.

## If you borrow

Your position stays in its Uniswap pool and keeps earning fees, but the market holds the NFT until your debt is zero. Your risks:

1. **Liquidation.** Below `HF = 1`, a liquidator repays part of your debt and receives a slice of your liquidity worth that amount plus a bonus (5% in Blue-chip, 10% in Meme, or more if the pool's listing says so). In the Meme market, and in the Blue-chip market when `HF < 0.9` or the debt is under 100 USDG, the whole debt can be closed at once.
2. **Terms that change under you.** The owner can lower LT, raise the liquidator bonus, or raise the removal haircut of a frozen pool. Each change applies to existing loans immediately.
3. **Meme pricing modes.** In the Meme market your position can be valued at the pool's current price with a 20% cut when price observations stop arriving. A position that looks healthy on the time-weighted price can become liquidatable.
4. **The upgrade key.** Your NFT is in the market's custody. An upgrade can move it.

:::warning[Out of range is not a trigger, a falling value is]
A position that goes out of range on the lower side holds only the risk token. It is not liquidated for being out of range, but its value now follows that token one for one, so HF falls faster.
:::

What you can do: borrow well below the maximum, watch your health factor and the LT schedule of your pool, and keep USDG available to repay. `repay` stays open during a pause and in a frozen pool.

## If you liquidate

Liquidators are paid a bonus, and they carry their own risks:

1. **Execution risk.** You receive two tokens from a liquidity slice, not USDG. The price you sell them at is your problem. Set `minOut0` and `minOut1`, and quote your swap route close to execution time.
2. **Halted liquidations.** `liquidate` reverts while the market is paused, while USDG transfers are paused, or while a required Chainlink price is stale.
3. **Competition.** The team plans to run its own liquidation keeper, which will compete with you and send its profit to the team treasury. See the [disclosure](./admin-powers.md#the-teams-liquidation-keeper).
4. **Sequencer dependence.** The chain has a single sequencer that can filter transactions. That a liquidation can always be submitted is an assumption, not a guarantee.
5. **Contract risk in helpers.** If you use the [`LiquidatorHelper`](../reference/liquidator-helper.md), any collateral your swap route does not consume stays in the router, where anyone can take it.

Bad debt is never charged to the liquidator. The contract caps what you repay at what the position can pay for.

## Not financial advice

This documentation describes how the protocol is designed to behave. It is not financial, legal or tax advice, and it is not a recommendation to lend, borrow or liquidate. Nothing here guarantees that the contracts behave as described. Use the protocol only with funds you can afford to lose.

## Related pages

- [Owner powers and upgradeability](./admin-powers.md)
- [Oracle, market and chain risks](./oracle-and-market-risks.md)
- [Pause and emergency behaviour](./pause-and-emergency.md)
- [Bad debt](../concepts/bad-debt.md)
- [Health factor](../concepts/health-factor.md)
- [Risk parameters](../reference/risk-parameters.md)
