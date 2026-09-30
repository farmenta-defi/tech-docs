---
title: Glossary
description: Plain definitions of the terms used across the Farmenta documentation, with links to the pages that explain them.
sidebar_position: 1
---

Short definitions of the terms used in this documentation, in alphabetical order. Each entry links to the page that explains the term in depth.

## B

### Bad debt

Debt that remains after a position has been fully liquidated and its collateral was worth less than what was owed. The market's reserve absorbs it first, and the rest lowers the share price for lenders of that market. See [Bad debt](../concepts/bad-debt.md).

### Blue-chip market

The market that accepts positions in the ETH/USDG, META/USDG and NVDA/USDG pools as collateral. It has the looser parameters of the two markets (max LTV up to 65%, LT up to 75%) and prices its tokens with Chainlink. See [Markets](../overview/markets.md).

### Borrow index

A number that starts at 1 and grows every second with the borrow rate. A loan's debt is its debt shares times the borrow index, so interest is added to every loan by moving one number. See [Interest rates](../concepts/interest-rates.md).

## C

### Cash

The USDG that sits idle in a market, not lent out. Lender withdrawals and new loans are both paid from cash. See [Interest rates](../concepts/interest-rates.md).

### Close factor

The largest share of a debt that one liquidation may repay. It is 50% in the Blue-chip market, rising to 100% when `HF < 0.9` or the debt is under 100 USDG, and always 100% in the Meme market. See [Liquidation mechanics](../liquidations/mechanics.md).

### Collateral

The Uniswap v4 liquidity position that a borrower deposits to secure a loan. The market holds the position NFT until the debt is zero. See [Collateral](../concepts/collateral.md).

### Collateral value

The USD value the protocol recognises for a position when it checks borrowing limits and health: principal plus unclaimed fees (counted up to 10% of principal), reduced by the removal haircut. See [Position valuation](../concepts/position-valuation.md).

### Crash threshold

In the Meme market, the gap between spot price and TWAP beyond which liquidations use the spot price. It is 25%: when spot is more than 25% below the TWAP, the TWAP is treated as lagging behind a real crash. See [Price oracles](../concepts/price-oracles.md).

## D

### Debt cap

The maximum total debt allowed. There is one cap per pool, set by the owner within the tier limit (up to 500,000 USDG in Blue-chip, 20,000 USDG in Meme), and one cap per market (500,000 USDG and 50,000 USDG). See [Risk parameters](../reference/risk-parameters.md).

### Debt shares

The unit in which a loan is recorded. Your debt in USDG is your debt shares times the borrow index, so it grows as interest accrues while your shares stay the same. See [Interest rates](../concepts/interest-rates.md).

## E

### ERC-4626

The token standard for vaults that take deposits of one asset and issue shares. Each Farmenta market is an ERC-4626 vault for USDG, so lenders use the standard `deposit`, `mint`, `withdraw` and `redeem` functions. See [How it works](../overview/how-it-works.md) and the [standard](https://eips.ethereum.org/EIPS/eip-4626).

## F

### Frozen pool

A listed pool that no longer accepts new collateral, new borrowing or added liquidity. Existing loans continue: they accrue interest and can be repaid, reduced, withdrawn and liquidated. See [Pool listing](../concepts/pool-listing.md).

### Full seizure

The liquidation outcome in which the liquidator receives the entire position and the position NFT is burned. It happens when the amount to seize reaches everything the position holds. Any debt left over becomes bad debt. See [Liquidation mechanics](../liquidations/mechanics.md).

## G

### Guardian

The account the owner names to answer incidents. It can pause a market, freeze a pool, disable a token and revoke a hook, each at once. It cannot reverse any of them and holds no other power. See [Owner powers and upgradeability](../risk/admin-powers.md#the-guardian).

## H

### Health factor (HF)

The ratio that tells how safely a loan is covered: `collateralValue × LT / debtUsd`. Above 1 the loan is healthy. When `HF < 1` it can be liquidated. See [Health factor](../concepts/health-factor.md).

### Hook

A contract attached to a Uniswap v4 pool that runs at set points of a swap or a liquidity change. Hooks are written by third parties, and Farmenta reviews a pool's hook before listing the pool. See [Collateral](../concepts/collateral.md).

### Hook permission bits

The lowest 14 bits of a hook's address, which encode the callbacks the hook is allowed to run. Farmenta reads them to reject hooks that could interfere with removing liquidity, act before liquidity is added, or charge the caller when liquidity is added, unless the owner has allowlisted the hook after review. See [Pool listing](../concepts/pool-listing.md).

## K

### Kink

The utilization level at which the interest curve becomes much steeper: 80% in the Blue-chip market and 70% in the Meme market. Above the kink, borrowing gets expensive quickly, which pushes utilization back down. See [Interest rates](../concepts/interest-rates.md).

## L

### Lender funds (`totalAssets`)

Everything that belongs to the lenders of a market: `cash + totalBorrows − reserves`. The share price is lender funds divided by the number of shares. See [Protocol fees and reserves](../concepts/protocol-fees-and-reserves.md).

### Liquidation

The process in which anyone repays part or all of an unhealthy loan and receives collateral worth that amount plus a bonus. It is what keeps lenders whole when collateral loses value. See [Liquidations](../liquidations/overview.md).

### Liquidation threshold (LT)

The share of collateral value that may be covered by debt before a loan becomes liquidatable. The tier maximum is 75% in Blue-chip and 40% in Meme, and a pool's listing can set it lower. See [Health factor](../concepts/health-factor.md).

### Liquidator bonus

The extra collateral a liquidator receives on top of the amount repaid: at least 5% in Blue-chip and 10% in Meme. It is paid by the borrower, out of the position. See [Liquidation mechanics](../liquidations/mechanics.md).

### Liquidity slice

The part of a position's liquidity that is removed in a partial liquidation and paid to the liquidator as the pool's two tokens. A position NFT cannot be split, so the liquidator receives tokens, not an NFT. See [Liquidation mechanics](../liquidations/mechanics.md).

### Listing

The record the owner writes for each accepted pool. It holds the pool's own risk terms: max LTV, LT, liquidator bonus, removal haircut, debt cap and minimum position value. Positions from a pool without a listing are refused. See [Pool listing](../concepts/pool-listing.md).

### LT ramp

A scheduled, linear decrease of a pool's liquidation threshold from its current value to a lower target. The schedule is stored on-chain, so borrowers can see when their position would become liquidatable. See [Owner powers](../risk/admin-powers.md).

### LTV and max LTV

LTV (loan to value) is `debtUsd / collateralValue`. Max LTV is the highest LTV allowed when you borrow: up to 65% in Blue-chip and 30% in Meme. It is always below LT in a pool that accepts new positions, which leaves a buffer before liquidation. See [Health factor](../concepts/health-factor.md).

## M

### Meme market

The market that accepts meme token/USDG positions as collateral: the CASHCAT/USDG, PONS/USDG and AI/USDG pools are listed. It has much stricter parameters (max LTV 30%, LT 40%, small debt caps) and prices the meme token from the pool itself, using the 30 minute TWAP and the spot price. See [Markets](../overview/markets.md).

## O

### Out of range

The state of a position when the pool price is outside its price range. Below the range the position holds only the risk token, and above it only USDG. Being out of range does not trigger a liquidation by itself. See [Position valuation](../concepts/position-valuation.md).

## P

### Permit2

A shared approval contract that lets you authorise a token transfer with a signature. Farmenta uses it in `mintAndDeposit` and `increaseLiquidity`, so your tokens go straight to Uniswap without passing through the market. See [Managing collateral](../concepts/managing-collateral.md).

### PoolManager

The single Uniswap v4 contract that holds every pool and its liquidity. Farmenta reads pool prices and position data from it. See [Architecture](../reference/architecture.md).

### Position NFT

The ERC-721 token issued by Uniswap's PositionManager that represents one liquidity position. It is the collateral on Farmenta, which issues no NFT of its own. See [Collateral](../concepts/collateral.md).

### PositionManager

The Uniswap v4 contract that issues position NFTs and carries out liquidity changes for their owners. While a position is collateral, the market is the owner of the NFT. See [Architecture](../reference/architecture.md).

### Principal

The tokens that make up a position's liquidity itself, without its unclaimed fees. Principal is valued at oracle prices, not at the pool's spot price. See [Position valuation](../concepts/position-valuation.md).

### Protocol liquidation fee

A fee the liquidator pays in USDG on top of the amount repaid. It equals one tenth of the pool's liquidator bonus (0.5% of the repaid amount in Blue-chip, 1% in Meme) and goes to the reserve. See [Protocol fees and reserves](../concepts/protocol-fees-and-reserves.md).

## R

### Removal haircut

A reduction, in the pool's listing, for hooks that keep part of the tokens when liquidity is removed. It lowers the recognised value of every position in the pool and is capped at 2,000 bps (20%). See [Owner powers](../risk/admin-powers.md).

### Reserve

USDG the market sets aside from interest and from protocol liquidation fees. It is the first buffer against bad debt and is not part of lender funds. See [Protocol fees and reserves](../concepts/protocol-fees-and-reserves.md).

### Reserve factor

The share of borrower interest that goes to the reserve: 15% in Blue-chip and 25% in Meme. The rest goes to lenders. See [Protocol fees and reserves](../concepts/protocol-fees-and-reserves.md).

### Reserve floor

The part of the reserve the owner cannot withdraw: 1% of lender funds in Blue-chip and 2.5% in Meme. It limits withdrawals only. Bad debt can use the whole reserve, including the part below the floor. See [Protocol fees and reserves](../concepts/protocol-fees-and-reserves.md).

## S

### Share token

The ERC-20 token a lender receives for supplying USDG: `fUSDG-BC` in the Blue-chip market and `fUSDG-MEME` in the Meme market. Its value in USDG rises as interest is earned and falls if bad debt is socialized. See [How it works](../overview/how-it-works.md).

### Socialization

Spreading a loss over all lenders of a market. Bad debt that the reserve cannot cover is removed from lender funds, so every share of that market loses the same fraction of its value. See [Bad debt](../concepts/bad-debt.md).

### Spot price

The current price in a Uniswap pool. It can be moved by a single large trade, which is why Farmenta values positions at oracle prices and uses spot only as a check or a fallback. See [Price oracles](../concepts/price-oracles.md).

### Stale mode

The state of a Meme pool when no valid TWAP exists: its newest observation is more than 900 seconds old, or its history is shorter than 30 minutes. Liquidations value the meme token at spot price times 0.8. A borrow records a fresh observation itself, so it is refused only while the history is shorter than 30 minutes. See [Oracle, market and chain risks](../risk/oracle-and-market-risks.md).

## T

### Tier

The risk class of a pool: Blue-chip or Meme. A pool takes the riskier tier of its two tokens, and the tier decides which market accepts it, which presets bound its terms and which price source is used. See [Markets](../overview/markets.md).

### Timelock

A waiting period between the moment a call is scheduled on-chain and the moment it can run. Farmenta has two. The owner's queue: the owner is a `TimelockController`, and every owner call waits 2 days in it. The upgrade timelock: an upgrade scheduled in a market can be installed 2 days later, and expires if it is not installed within 14 days after that. An upgrade passes through both, about 4 days in total. See [Owner powers and upgradeability](../risk/admin-powers.md#the-upgrade-timelock).

### TWAP

Time-weighted average price. Farmenta's `TwapRecorder` stores observations of a Meme pool's price and returns the average over the last 30 minutes, which is harder to move than the spot price. See [TwapRecorder](../reference/twap-recorder.md).

## U

### Unclaimed fees

Uniswap trading fees a position has earned and not yet collected. They stay the borrower's, count toward collateral value up to 10% of principal, and can be collected while the loan stays healthy. See [Managing collateral](../concepts/managing-collateral.md).

### USDG

The US dollar stablecoin that lenders supply and borrowers borrow. Every accepted pool has USDG as one of its two tokens. See [Network](../reference/network.md).

### Utilization

The share of a market's funds that is lent out: `totalBorrows / (cash + totalBorrows)`. It drives the borrow rate and tells lenders how much can be withdrawn right away. See [Interest rates](../concepts/interest-rates.md).

## Related pages

- [Frequently asked questions](./faq.md)
- [Risk parameters](../reference/risk-parameters.md)
- [How it works](../overview/how-it-works.md)
