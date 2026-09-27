---
title: Contract addresses
description: Addresses of the Farmenta contracts and of the Uniswap v4, Chainlink, Morpho and token contracts Farmenta uses on Robinhood Chain.
sidebar_position: 13
---

An address is how you tell a contract apart from its imitations, in the same way a bank account number tells you who receives a transfer. This page is the place to copy addresses from. It has two parts: Farmenta's own contracts, and the third party contracts on Robinhood Chain (chain id 4663) that Farmenta works with.

For example, before you approve USDG for a deposit, compare the token address your wallet shows with the USDG address in the tokens table below. If a single character differs, it is a different token.

:::warning[Always copy the full address]
Copy addresses from this page or from the block explorer. Never rebuild an address from a shortened form such as `0x1234...abcd`. Two different addresses can share the same first and last characters, and funds sent to the wrong address cannot be recovered.
:::

## Farmenta contracts

:::info[Not deployed yet]
The Farmenta contracts are not deployed yet. Their addresses will be published in this table at deployment.
:::

| Contract | Role | Address |
|---|---|---|
| FarmentaMarket (Blue-chip proxy) | The Blue-chip market: lender vault, NFT custody and debt ledger. Share token `fUSDG-BC` | To be published |
| FarmentaMarket (Meme proxy) | The Meme market: lender vault, NFT custody and debt ledger. Share token `fUSDG-MEME` | To be published |
| FarmentaMarket (implementation) | The code both market proxies run | To be published |
| MarketLens (Blue-chip) | Read-only views of the Blue-chip market, such as health factor and maximum borrow | To be published |
| MarketLens (Meme) | Read-only views of the Meme market | To be published |
| CollateralPolicy | Pool listings and the terms of each pool | To be published |
| PriceOracle | USD prices from Chainlink and from the TWAP recorder | To be published |
| TwapRecorder | Price observations for meme pools | To be published |
| PositionValuer | Turns a position into token amounts and a USD value | To be published |
| InterestRateModel | The borrow rate curve of each tier | To be published |
| LiquidatorHelper (Blue-chip) | Optional helper that liquidates Blue-chip loans with a flash loan in one transaction | To be published |
| LiquidatorHelper (Meme) | Optional helper that liquidates Meme loans with a flash loan in one transaction | To be published |

You always interact with the two market proxies, never with the implementation. Each contract is described in the [architecture overview](./architecture.md).

## External contracts on Robinhood Chain

These contracts are deployed and operated by third parties. Farmenta calls them or reads from them, but does not control them.

Addresses are not case sensitive. Some are printed here in lowercase and some with checksum capitalization. Solidity requires the checksummed form of an address literal, which your compiler or the block explorer shows. Both forms point to the same contract.

### Uniswap v4

| Contract | Address | Explorer | What Farmenta uses it for |
|---|---|---|---|
| PoolManager | `0x8366a39cc670b4001a1121b8f6a443a643e40951` | [View](https://robinhoodchain.blockscout.com/address/0x8366a39cc670b4001a1121b8f6a443a643e40951) | Holds every Uniswap v4 pool. It is the source of pool prices and liquidity, and its events tell the indexer which pools and positions exist. |
| PositionManager | `0x58daec3116aae6d93017baaea7749052e8a04fa7` | [View](https://robinhoodchain.blockscout.com/address/0x58daec3116aae6d93017baaea7749052e8a04fa7) | The NFT contract for liquidity positions. The market takes these NFTs into custody and calls this contract to mint, add liquidity, remove liquidity, collect fees and burn. |
| StateView | `0xf3334192d15450cdd385c8b70e03f9a6bd9e673b` | [View](https://robinhoodchain.blockscout.com/address/0xf3334192d15450cdd385c8b70e03f9a6bd9e673b) | Read-only access to pool state. `PositionValuer` reads the spot price and fee growth from it, and `TwapRecorder` reads the current tick. |
| V4Quoter | `0x8dc178efb8111bb0973dd9d722ebeff267c98f94` | [View](https://robinhoodchain.blockscout.com/address/0x8dc178efb8111bb0973dd9d722ebeff267c98f94) | Quotes swaps off-chain when a liquidator builds the route that sells seized tokens. |
| UniversalRouter (primary) | `0x8876789976decbfcbbbe364623c63652db8c0904` | [View](https://robinhoodchain.blockscout.com/address/0x8876789976decbfcbbbe364623c63652db8c0904) | Executes the swap of seized tokens into USDG inside `LiquidatorHelper`. This is the router the Uniswap app uses. |
| UniversalRouter (alternative) | `0x06AfBA43Fd06227fA663b0DAecF536f6EaA6bf99` | [View](https://robinhoodchain.blockscout.com/address/0x06AfBA43Fd06227fA663b0DAecF536f6EaA6bf99) | A second, newer router deployment. Listed for reference. Farmenta uses the primary router by default. |

### Permit2

| Contract | Address | Explorer | What Farmenta uses it for |
|---|---|---|---|
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | [View](https://robinhoodchain.blockscout.com/address/0x000000000022D473030F116dDEE9F6B43aC78BA3) | Signature based token transfers. When you mint a position or add liquidity through the market, your tokens move from your wallet to PositionManager through Permit2. |

### Morpho Blue

| Contract | Address | Explorer | What Farmenta uses it for |
|---|---|---|---|
| Morpho Blue | `0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010` | [View](https://robinhoodchain.blockscout.com/address/0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010) | The source of USDG flash loans for `LiquidatorHelper`, so a liquidator does not need USDG of their own. |

### Tokens

| Token | Decimals | Address | Explorer | What Farmenta uses it for |
|---|---|---|---|---|
| USDG | 6 | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | [View](https://robinhoodchain.blockscout.com/address/0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168) | The asset lenders supply and borrowers borrow. Every accepted pool is quoted in USDG. |
| WETH | 18 | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` | [View](https://robinhoodchain.blockscout.com/address/0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73) | One side of WETH/USDG pools in the Blue-chip market. |
| Native ETH | 18 | The zero address in a pool key | Not applicable | One side of ETH/USDG pools in the Blue-chip market. |

Native ETH has no token contract. In a Uniswap v4 pool key, native ETH is written as the zero address (`address(0)`), not as the WETH address. An ETH/USDG pool and a WETH/USDG pool are different pools with different pool ids.

### Chainlink price feeds

| Feed | Address | Explorer | What Farmenta uses it for |
|---|---|---|---|
| ETH/USD | `0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9` | [View](https://robinhoodchain.blockscout.com/address/0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9) | The USD price of native ETH and WETH. |
| USDG/USD | `0x61B7e5650328764B076A108EFF5fa7282a1B9aD2` | [View](https://robinhoodchain.blockscout.com/address/0x61B7e5650328764B076A108EFF5fa7282a1B9aD2) | The USD price of USDG, used to value debt and the USDG side of every position. |

Meme tokens have no Chainlink feed. Their price comes from the on-chain `TwapRecorder`. There is also no Chainlink sequencer uptime feed on Robinhood Chain. See [network](./network.md) and [price oracles](../concepts/price-oracles.md).

## How to verify an address

1. Open the explorer link in the table and check that the contract name and its activity match what you expect.
2. Compare the full address in your wallet or your code with the address on this page, character by character or with a text comparison tool.
3. In code, keep addresses in one constants file and copy them from here in full.

## Related pages

- [Network: Robinhood Chain](./network.md)
- [Architecture overview](./architecture.md)
- [Price oracles](../concepts/price-oracles.md)
- [LiquidatorHelper reference](./liquidator-helper.md)
- [Risk overview](../risk/overview.md)
