---
title: Frequently asked questions
description: Short answers to common questions about lending, borrowing, liquidations and safety on Farmenta.
sidebar_position: 2
---

Short answers, with links to the pages that go deeper. If a term is new to you, look it up in the [glossary](./glossary.md).

## General

### What is Farmenta?

Farmenta is a lending protocol on Robinhood Chain. Lenders supply USDG and earn interest. Borrowers deposit a Uniswap v4 liquidity position NFT as collateral and borrow USDG against it, without closing the position. See [How it works](../overview/how-it-works.md).

### Which network does it use?

Robinhood Chain, chain id 4663, an Arbitrum Orbit rollup that settles to Ethereum. Gas is paid in ETH. See [Network](../reference/network.md).

### What is the difference between the two markets?

The Blue-chip market accepts ETH/USDG and WETH/USDG positions, with a max LTV of 65% and a liquidation threshold of 75%. The Meme market accepts meme token/USDG positions, with a max LTV of 30%, a liquidation threshold of 40% and much smaller debt caps. Each market has its own USDG vault, its own share token and its own interest curve. See [Markets](../overview/markets.md).

### What fees does Farmenta charge?

Exactly two. The reserve factor takes a share of the interest borrowers pay (15% in Blue-chip, 25% in Meme), and the protocol liquidation fee is paid by liquidators. It is one tenth of the pool's liquidator bonus: 0.5% of the repaid amount in Blue-chip and 1% in Meme at the preset bonus, more if the pool is listed with a higher bonus. There is no deposit, withdrawal, origination or flash loan fee. See [Protocol fees and reserves](../concepts/protocol-fees-and-reserves.md).

### Where are the contract addresses?

Farmenta's own contracts are not deployed yet. When they are, their addresses will be published on the [Addresses](../reference/addresses.md) page. Do not trust an address from any other source.

### Does Farmenta have its own pools or its own NFT?

No. Farmenta runs no exchange, no pool and no hook. The collateral is the position NFT issued by Uniswap's PositionManager, used as it is. The only tokens Farmenta issues are the vault share tokens, `fUSDG-BC` and `fUSDG-MEME`.

## Lending

### How do I earn as a lender?

You deposit USDG into a market and receive its share token. Borrowers pay interest every second, and the part that does not go to the reserve raises the value of each share. When you redeem your shares, you receive your USDG plus the interest earned. See [Interest rates](../concepts/interest-rates.md).

### What decides the interest rate?

Utilization, the share of the market's funds that is lent out. The rate rises gently up to the kink (80% utilization in Blue-chip, 70% in Meme) and steeply above it. The curve is fixed in the contract for each market. See [Interest rates](../concepts/interest-rates.md).

### Why can't I withdraw all my USDG right now?

Withdrawals are paid from cash, the USDG that is idle in the market. The rest is lent to borrowers. When utilization is high you can withdraw up to the available cash, and the remainder as borrowers repay or new lenders deposit. See [Oracle, market and chain risks](../risk/oracle-and-market-risks.md#liquidity-risk-for-lenders).

### Can I lose money as a lender?

Yes. If a position is liquidated for less than its debt, the shortfall is bad debt. The reserve absorbs it first, and whatever is left lowers the share price for every lender in that market. You are also exposed to the risks of unaudited code and of the owner key. See [Bad debt](../concepts/bad-debt.md) and the [Risk overview](../risk/overview.md).

### Can a loss in the Meme market affect Blue-chip lenders?

No. The two markets are fully isolated. Each has its own vault, its own debt ledger and its own reserve, and bad debt in one market never touches lenders of the other. See [Markets](../overview/markets.md).

### Does the reserve protect me?

Partly. The whole reserve is used to absorb bad debt before lenders are touched. It grows only from interest and liquidation fees, so it can be small compared with a single large loss. The reserve floor stops the owner from withdrawing the last part of it, but it adds no funds. See [Protocol fees and reserves](../concepts/protocol-fees-and-reserves.md).

## Borrowing

### Which positions can I use as collateral?

Uniswap v4 positions from pools that the owner has listed one by one. Every accepted pool has USDG as one of its tokens: ETH/USDG and WETH/USDG in the Blue-chip market, meme token/USDG in the Meme market. The position must hold liquidity and be worth at least the pool's minimum, $50 or more. See [Collateral](../concepts/collateral.md) and [Pool listing](../concepts/pool-listing.md).

### Do I keep earning Uniswap fees while my position is collateral?

Yes. The position stays in its pool and keeps earning trading fees, and those fees remain yours. Unclaimed fees also count toward your collateral value, up to 10% of the principal. See [Managing collateral](../concepts/managing-collateral.md).

### Can I claim those fees?

Yes, with `collectFees`. If you have debt, the claim passes the same price checks as a borrow, and your health factor must be at least 1 after the fees have left. With no debt there is no such check. Claims are stopped while the market is paused. See [Managing collateral](../concepts/managing-collateral.md).

### How is my position valued?

The contract reads your position's liquidity and computes the token amounts at the oracle price, not at the pool's current price. It adds unclaimed fees up to 10% of principal and applies the pool's removal haircut if there is one. In the Blue-chip market the oracle price comes from Chainlink, so pushing the pool's price does not change your position's value. In the Meme market it comes from the pool itself: the lower of the current pool price and the 30 minute average when you borrow, and the 30 minute average (or the current price in a crash or in stale mode) at liquidation. See [Position valuation](../concepts/position-valuation.md).

### How much can I borrow?

Up to the collateral value times the pool's max LTV: at most 65% in Blue-chip and 30% in Meme. Your total debt must be at least 10 USDG, and the pool's and the market's debt caps must have room. See [Health factor](../concepts/health-factor.md).

### Why was my borrow rejected?

A borrow must pass every one of these gates:

- The market is not paused, and you are the depositor of the position.
- The pool is listed and not frozen.
- The USDG price is between 0.97 and 1.03, and no Chainlink price is older than 25 hours.
- Blue-chip: the pool's spot price is within 2% of the oracle price. Meme: a valid TWAP exists.
- Your debt after the borrow is within max LTV and at least 10 USDG.
- The pool's debt cap and the market's debt cap are not exceeded.
- The market has enough cash to pay you.

The revert reason names the gate that refused. See [Errors](../reference/errors.md).

### Can I add or remove liquidity while borrowing?

Yes. `increaseLiquidity` adds to your position, as long as the pool is not frozen and your health factor is at least 1 afterwards. `decreaseLiquidity` removes part of it: what remains must stay above the pool's minimum position value, and your debt must still fit the borrowing limit of what remains, not only the liquidation threshold. See [Managing collateral](../concepts/managing-collateral.md).

### Will I be liquidated if my position goes out of range?

Not for that reason alone. Liquidation depends only on the health factor. Below its range, a position holds only the risk token, so its value falls with that token and your health factor falls faster. Above its range, it holds only USDG and your health factor rises. See [Health factor](../concepts/health-factor.md).

### Is there a due date on my loan?

No. Loans are open-ended. Interest is added to your debt every second, so a loan left alone will sooner or later reach `HF < 1` even if prices do not move. See [Interest rates](../concepts/interest-rates.md).

### How do I get my NFT back?

Repay the full debt, then call `withdrawCollateral` and choose the address that receives the NFT. Pass the maximum value as the repay amount to clear the debt exactly. Both calls work even when the market is paused or your pool is frozen. See [Repay and withdraw](../worked-example/repay-and-withdraw.md).

## Liquidations

### When can my position be liquidated?

When your health factor is below 1, which means your debt is larger than your collateral value times the liquidation threshold. That can happen because prices fall, because interest accrues, or because the owner lowers the pool's liquidation threshold. See [Liquidations](../liquidations/overview.md).

### How much of my position can a liquidator take?

Collateral worth the repaid amount plus the liquidator bonus (5% in Blue-chip and 10% in Meme, unless the pool's listing sets a higher bonus). In the Blue-chip market one liquidation can repay up to 50% of your debt, or 100% when `HF < 0.9` or the debt is under 100 USDG. In the Meme market it is always up to 100%. See [Liquidation mechanics](../liquidations/mechanics.md).

### What happens to my NFT after a full liquidation?

In a full seizure the liquidator receives everything the position holds, the NFT is burned, and your loan record is deleted. Any debt the position could not cover becomes bad debt for the market. You do not owe it, and you receive nothing back. After a partial liquidation the NFT stays in custody with less liquidity and less debt. See [Liquidation mechanics](../liquidations/mechanics.md).

### Who can liquidate?

Anyone. `liquidate` is open to every address. The team also plans to run its own keeper, which will compete with public liquidators and send its profit to the team treasury. See [Liquidator guide](../liquidations/liquidator-guide.md) and the [keeper disclosure](../risk/admin-powers.md#the-teams-liquidation-keeper).

### Do I need capital to liquidate?

Not necessarily. The `LiquidatorHelper` contract borrows the USDG with a flash loan from Morpho, liquidates, swaps the seized tokens to USDG through Uniswap, repays the flash loan and sends the profit to you, all in one transaction. You need ETH for gas and a swap route prepared off-chain. See [LiquidatorHelper](../reference/liquidator-helper.md).

### What does a liquidator receive?

The two tokens of the pool, taken from a slice of the position's liquidity, not an NFT and not only USDG. In an ETH pool the ETH side is paid as native ETH. The liquidator pays the repaid amount plus the protocol liquidation fee in USDG. In some cases the liquidator also buys leftover fee tokens at the oracle price, with no bonus. See [Liquidation mechanics](../liquidations/mechanics.md).

## Safety

### Is the code audited?

No. The contracts have not been audited. The source code is public in the [smart contract repository](https://github.com/farmenta-defi/smart-contract). See the [Risk overview](../risk/overview.md).

### Who controls the contracts?

A single owner account. It can upgrade the market contract with no timelock, pause markets, list and freeze pools, change pool terms and withdraw reserves above the floor. An upgrade can replace all logic, including the rules that limit the owner. See [Owner powers and upgradeability](../risk/admin-powers.md).

### Can the owner take my collateral or my USDG?

Not through normal operations: no owner function moves a recorded collateral NFT or lender funds. Through an upgrade, yes: the owner key can replace the market's logic in one transaction and take both. The limits in the contract protect against accidents, not against the key holder. See [Owner powers and upgradeability](../risk/admin-powers.md).

### Can the owner change the terms of my loan?

Yes. The owner can lower your pool's liquidation threshold, raise its liquidator bonus, or raise the removal haircut of a frozen pool, and the change applies to existing loans at once. Terms can never be looser than the tier presets, and there is no limit on how fast they are tightened. See [Owner powers and upgradeability](../risk/admin-powers.md).

### What happens if the market is paused?

Deposits, borrowing, adding and removing liquidity, fee claims and liquidations stop. You can still repay, withdraw collateral that has no debt, and withdraw supplied USDG up to the available cash. Interest keeps accruing, and positions that became unhealthy during the pause can be liquidated as soon as it ends. See [Pause and emergency behaviour](../risk/pause-and-emergency.md).

### What happens if my pool is frozen?

The pool takes no new collateral, no new borrowing and no added liquidity. Your existing loan continues: you can repay, collect fees, remove liquidity and withdraw the NFT once the debt is zero, and you can still be liquidated. See [Pause and emergency behaviour](../risk/pause-and-emergency.md).

### What happens if a price feed stops updating?

The oracle rejects a Chainlink price older than 25 hours. Every action that needs that price then reverts, including liquidations. Repaying, withdrawing collateral with no debt and withdrawing supplied USDG do not read a price and keep working. See [Oracle, market and chain risks](../risk/oracle-and-market-risks.md).

## Related pages

- [Glossary](./glossary.md)
- [Risk overview](../risk/overview.md)
- [Worked example](../worked-example/index.md)
