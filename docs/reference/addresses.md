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

The Farmenta contracts are deployed on Robinhood Chain (chain id 4663). The source code of every contract in this table is verified on Sourcify for that chain and on the block explorer.

These are the contracts of the deployment of 1 October 2026. They replaced a first deployment of 28 September 2026, whose contracts remain on the chain: its two markets, `0x1f69d27F1ac7415A4252957951900130CB885484` (Blue-chip) and `0x992c879573eeF8bc948fc3f49d5e5C968204E751` (Meme), still let a lender withdraw, and the app no longer uses them.

| Contract | Role | Address | Explorer |
|---|---|---|---|
| FarmentaMarket (Blue-chip proxy) | The Blue-chip market: lender vault, NFT custody and debt ledger. Share token `fUSDG-BC` | `0x89e20D2bBBbF52Bf8036bF8efd94C81C8386116B` | [View](https://robinhoodchain.blockscout.com/address/0x89e20D2bBBbF52Bf8036bF8efd94C81C8386116B) |
| FarmentaMarket (Meme proxy) | The Meme market: lender vault, NFT custody and debt ledger. Share token `fUSDG-MEME` | `0x01540c8aA1c13d50dA85406dCa012F9f41169927` | [View](https://robinhoodchain.blockscout.com/address/0x01540c8aA1c13d50dA85406dCa012F9f41169927) |
| FarmentaMarket (implementation) | The code both market proxies run | `0xc3C3b9f22a1cFA2e6A1b546b8507a04497fBA995` | [View](https://robinhoodchain.blockscout.com/address/0xc3C3b9f22a1cFA2e6A1b546b8507a04497fBA995) |
| MarketLens (Blue-chip) | Read-only views of the Blue-chip market, such as health factor and maximum borrow | `0x2Bc059954B712DE2c99A7DDc01c8Ed884bF70621` | [View](https://robinhoodchain.blockscout.com/address/0x2Bc059954B712DE2c99A7DDc01c8Ed884bF70621) |
| MarketLens (Meme) | Read-only views of the Meme market | `0xA8fF2adC5cdaE8e940E5e680CAd2625c7cfaD909` | [View](https://robinhoodchain.blockscout.com/address/0xA8fF2adC5cdaE8e940E5e680CAd2625c7cfaD909) |
| CollateralPolicy | Pool listings and the terms of each pool | `0x032f7c4744B6f043F92a94C8e257c5A843D544e0` | [View](https://robinhoodchain.blockscout.com/address/0x032f7c4744B6f043F92a94C8e257c5A843D544e0) |
| PriceOracle | USD prices from Chainlink and from the TWAP recorder | `0x0Bb6FEAceb66640C2AC4fB0E8562C7ea5dfe5fb5` | [View](https://robinhoodchain.blockscout.com/address/0x0Bb6FEAceb66640C2AC4fB0E8562C7ea5dfe5fb5) |
| TwapRecorder | Price observations for meme pools | `0xEFC4B1A2BbF9B2D61d58e1E8543D9706f0f42484` | [View](https://robinhoodchain.blockscout.com/address/0xEFC4B1A2BbF9B2D61d58e1E8543D9706f0f42484) |
| PositionValuer | Turns a position into token amounts and a USD value | `0x59D3543BBF93AC2806fB5f81387858e501d90ada` | [View](https://robinhoodchain.blockscout.com/address/0x59D3543BBF93AC2806fB5f81387858e501d90ada) |
| InterestRateModel | The borrow rate curve of each tier | `0x18b94D05731F99643c4f3b24F311e753d8bEd19c` | [View](https://robinhoodchain.blockscout.com/address/0x18b94D05731F99643c4f3b24F311e753d8bEd19c) |
| LiquidatorHelper (Blue-chip) | Optional helper that liquidates Blue-chip loans with a flash loan in one transaction | `0x152117B7cE6361494921fc966B7Cd3A09eF85980` | [View](https://robinhoodchain.blockscout.com/address/0x152117B7cE6361494921fc966B7Cd3A09eF85980) |
| LiquidatorHelper (Meme) | Optional helper that liquidates Meme loans with a flash loan in one transaction | `0x5ab210578cB41ef2972d0117B645c1796d738Fab` | [View](https://robinhoodchain.blockscout.com/address/0x5ab210578cB41ef2972d0117B645c1796d738Fab) |
| TimelockController | The owner of both markets, and of the policy once it has accepted it. Every owner call waits in its queue | `0xa4fD84DFdd87e4e9f3B49a8323193fde604c21Ff` | [View](https://robinhoodchain.blockscout.com/address/0xa4fD84DFdd87e4e9f3B49a8323193fde604c21Ff) |
| Guardian | The account that can pause a market and close a pool, a token or a hook to new positions, at once | `0xa6A36ae078a4f1f6A2659951Ea082cB88f16F9F2` | [View](https://robinhoodchain.blockscout.com/address/0xa6A36ae078a4f1f6A2659951Ea082cB88f16F9F2) |

You always interact with the two market proxies, never with the implementation. Each contract is described in the [architecture overview](./architecture.md).

The policy changes owner in two steps, and the timelock accepts it through its own queue. Until that call has run, `owner()` on the policy returns the account that deployed the contracts, `0xD669FB6521Fa7f3aD90a8d49A4837973803758A3` ([View](https://robinhoodchain.blockscout.com/address/0xD669FB6521Fa7f3aD90a8d49A4837973803758A3)). See [Owner powers and upgradeability](../risk/admin-powers.md#the-owner-is-a-timelock-contract).

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
| WETH | 18 | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` | [View](https://robinhoodchain.blockscout.com/address/0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73) | Accepted as a Blue-chip token and priced by the ETH/USD feed. No pool with WETH is listed. |
| Native ETH | 18 | The zero address in a pool key | Not applicable | One side of the ETH/USDG pool in the Blue-chip market. |
| META | 18 | `0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35` | [View](https://robinhoodchain.blockscout.com/address/0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35) | One side of the META/USDG pool in the Blue-chip market. A tokenized stock; its name on chain is "Meta Platforms • Robinhood Token". |
| NVDA | 18 | `0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC` | [View](https://robinhoodchain.blockscout.com/address/0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC) | One side of the NVDA/USDG pool in the Blue-chip market. A tokenized stock; its name on chain is "NVIDIA • Robinhood Token". |
| CASHCAT | 18 | `0x020bfC650A365f8BB26819deAAbF3E21291018b4` | [View](https://robinhoodchain.blockscout.com/address/0x020bfC650A365f8BB26819deAAbF3E21291018b4) | One side of the CASHCAT/USDG pool in the Meme market. |
| PONS | 18 | `0x39dBED3a2bd333467115dE45665cC57F813C4571` | [View](https://robinhoodchain.blockscout.com/address/0x39dBED3a2bd333467115dE45665cC57F813C4571) | One side of the PONS/USDG pool in the Meme market. |
| AI | 18 | `0x2E8c31162b855A2ffa90F6F8634643Ad6F111e18` | [View](https://robinhoodchain.blockscout.com/address/0x2E8c31162b855A2ffa90F6F8634643Ad6F111e18) | One side of the AI/USDG pool in the Meme market. |

Several tokens can share a ticker, so identify a token by its address, not by its symbol.

Native ETH has no token contract. In a Uniswap v4 pool key, native ETH is written as the zero address (`address(0)`), not as the WETH address. An ETH/USDG pool and a WETH/USDG pool are different pools with different pool ids.

### Chainlink price feeds

| Feed | Address | Explorer | What Farmenta uses it for |
|---|---|---|---|
| ETH/USD | `0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9` | [View](https://robinhoodchain.blockscout.com/address/0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9) | The USD price of native ETH and WETH. |
| USDG/USD | `0x61B7e5650328764B076A108EFF5fa7282a1B9aD2` | [View](https://robinhoodchain.blockscout.com/address/0x61B7e5650328764B076A108EFF5fa7282a1B9aD2) | The USD price of USDG, used to value debt and the USDG side of every position. |
| META/USD | `0x7C38C00C30BEe9378381E7B6135d7283356D71b1` | [View](https://robinhoodchain.blockscout.com/address/0x7C38C00C30BEe9378381E7B6135d7283356D71b1) | The USD price of META. The feed names itself "Robinhood META / USD". |
| NVDA/USD | `0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15` | [View](https://robinhoodchain.blockscout.com/address/0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15) | The USD price of NVDA. The feed names itself "RHNVDA / USD". |

The meme tokens CASHCAT, PONS and AI have no Chainlink feed. Their price comes from the on-chain `TwapRecorder`. There is also no Chainlink sequencer uptime feed on Robinhood Chain. See [network](./network.md) and [price oracles](../concepts/price-oracles.md).

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
