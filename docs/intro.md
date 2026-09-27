---
title: Introduction
description: Farmenta lets you borrow USDG against a Uniswap v4 liquidity position on Robinhood Chain, without closing the position.
sidebar_position: 1
slug: /intro
---

Farmenta is a lending protocol on Robinhood Chain. It accepts a **Uniswap v4 liquidity position** as collateral, so a liquidity provider can borrow USDG without first closing the position and selling what is inside it.

Think of a pawn shop that accepts a working vending machine. You hand over the machine, you receive cash, and the machine keeps selling drinks for you while it sits in the shop. When you repay, you get the machine back. In Farmenta the machine is your liquidity position, the cash is USDG, and the drinks money is the trading fees your position keeps earning.

## A small example

Budi provides liquidity to the ETH/USDG pool on Uniswap v4. His position is worth $20,300. He needs $12,000 for a few months, but he does not want to close the position and stop earning fees.

1. Budi deposits his position into Farmenta. The position is now held by the market contract as collateral.
2. He borrows 12,000 USDG. The Blue-chip market lets him borrow up to 65% of the position's value, which is $13,195.
3. While the loan is open, the position keeps earning Uniswap fees, and those fees still belong to Budi.
4. Budi repays the 12,000 USDG plus interest, and takes his position back.

The USDG that Budi borrowed came from lenders such as Lina, who supplied USDG to the market to earn interest.

## Who takes part

| Role | What they do | What they get |
|---|---|---|
| **Lender** | Supplies USDG to a market | Interest paid by borrowers |
| **Borrower** | Deposits a Uniswap v4 position and borrows USDG | Liquidity without closing the position |
| **Liquidator** | Repays part of an unhealthy loan | A slice of the collateral plus a bonus |
| **Owner** | Lists pools, sets risk parameters, can pause | Nothing from users directly. See [owner powers](./risk/admin-powers.md) |

## What makes Farmenta different

- **The collateral is the position itself.** Farmenta uses the position NFT issued by Uniswap's own PositionManager. There is no wrapper token and no Farmenta NFT.
- **Positions are valued at the oracle price.** Token amounts are computed at the oracle price, not at the pool's current price. In the Blue-chip market that price comes from Chainlink, so moving the pool price does not change what a position is worth. In the Meme market the price comes from the pool itself, as the lower of the current price and the 30 minute average. See [how positions are valued](./concepts/position-valuation.md).
- **Going out of range does not trigger liquidation.** Only the [health factor](./concepts/health-factor.md) does.
- **Two isolated markets.** A loss in the Meme market cannot reach lenders in the Blue-chip market. See [markets](./overview/markets.md).
- **Every pool is reviewed before it is accepted.** Nothing is listed automatically. See [pool listing](./concepts/pool-listing.md).
- **Two fees, and no others.** A share of borrower interest, and a small fee paid by liquidators. See [protocol fees and reserves](./concepts/protocol-fees-and-reserves.md).

## Current status

:::info[Contracts are not deployed yet]
Farmenta's own contracts have not been deployed. Their addresses will be published on the [contract addresses](./reference/addresses.md) page at deployment. Everything in these docs describes how the protocol is designed and implemented to behave.
:::

:::danger[Read this before you use the protocol]
The contracts are unaudited. The market contract is upgradeable by a single owner account with no delay, which means that one key can replace the protocol's logic. These and the other known risks are described plainly in [risk and security](./risk/overview.md). Read that section before you supply or borrow.
:::

## Where to start

| If you want to... | Read |
|---|---|
| Understand the whole flow in ten minutes | [How it works](./overview/how-it-works.md) |
| See every step with numbers | [Worked example](./worked-example/index.md) |
| Know when your loan can be liquidated | [Health factor, LTV and liquidation threshold](./concepts/health-factor.md) |
| Supply USDG and understand your risk | [Interest rates](./concepts/interest-rates.md) and [bad debt](./concepts/bad-debt.md) |
| Run a liquidation bot | [Guide for liquidators and keepers](./liquidations/liquidator-guide.md) |
| Integrate with the contracts | [Contract architecture](./reference/architecture.md) |
| Look up a term | [Glossary](./resources/glossary.md) |
