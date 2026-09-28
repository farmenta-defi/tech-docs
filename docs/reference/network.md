---
title: "Network: Robinhood Chain"
description: Chain id, RPC endpoints, block explorers and the rollup properties of Robinhood Chain that matter when you use or integrate Farmenta.
sidebar_position: 14
---

Farmenta runs on Robinhood Chain, a layer 2 network that settles to Ethereum. A network is identified by its chain id, in the same way a country is identified by its dialing code: your wallet uses it to make sure a transaction is sent to the right chain and nowhere else.

A small example of what the network costs. A transaction that uses 200,000 gas at a gas price of 0.08 gwei costs 0.000016 ETH. With ETH at $2,400, that is about $0.04.

## Network parameters

| Parameter | Value |
|---|---|
| Network name | Robinhood Chain |
| Chain id | 4663 (hex `0x1237`) |
| Testnet chain id | 46630 |
| Native currency | ETH (18 decimals), bridged from Ethereum |
| Network type | Arbitrum Orbit rollup (layer 2) that settles to Ethereum |
| Public RPC endpoint | `https://rpc.mainnet.chain.robinhood.com` (rate limited) |
| Testnet public RPC endpoint | `https://rpc.testnet.chain.robinhood.com` (rate limited) |
| Block explorer | `https://robinhoodchain.blockscout.com` |
| Alternative block explorer | `https://hoodscan.ai` |
| Testnet block explorer | `https://explorer.testnet.chain.robinhood.com` |
| Block time | About 100 ms |
| Gas price | About 0.02 gwei at the minimum, about 0.08 gwei on average |

Block time and gas price are approximate and change with network load.

## Add the network to your wallet

Many wallets offer to add the network when you connect to an app on Robinhood Chain. To add it by hand, use these values:

| Field | Value |
|---|---|
| Network name | Robinhood Chain |
| RPC URL | `https://rpc.mainnet.chain.robinhood.com` |
| Chain ID | `4663` |
| Currency symbol | `ETH` |
| Block explorer URL | `https://robinhoodchain.blockscout.com` |

You need a small amount of ETH on Robinhood Chain to pay for gas. ETH reaches the chain through the canonical bridge from Ethereum. A deposit takes about 10 minutes. A withdrawal back to Ethereum takes 7 days, because it waits for the rollup's challenge period.

## RPC endpoints

An RPC endpoint is the server your wallet or program talks to in order to read the chain and send transactions.

The public endpoint is rate limited. It is fine for a wallet and for occasional reads. When you send too many requests it answers with HTTP status 429, so it is not suitable for a liquidation bot, an indexer, or any program that polls the chain.

For those uses, get an endpoint from an RPC provider:

| Provider | Endpoint format |
|---|---|
| Alchemy | `https://robinhood-mainnet.g.alchemy.com/v2/{KEY}` |
| QuickNode | `https://{ENDPOINT}.robinhood-mainnet.quiknode.pro/{TOKEN}` |

Blockdaemon, dRPC, Validation Cloud, Chainstack and GlobalStake also serve Robinhood Chain.

:::tip[Check the log range of your plan]
With 100 ms blocks, one minute of history is about 600 blocks. Some free provider plans limit `eth_getLogs` to a range of 10 blocks, which is about one second of this chain. If you read events over long ranges, choose a plan that allows it, or read them from the [indexer](./indexer.md).
:::

## Connect with viem

Recent versions of viem export the chain definition as `robinhood`, and the testnet as `robinhoodTestnet`.

```ts
import { createPublicClient, http } from 'viem'
import { robinhood } from 'viem/chains'

const client = createPublicClient({
  chain: robinhood,
  // Use your provider endpoint. Without an argument, http() uses the public endpoint.
  transport: http(process.env.RPC_URL),
})

const chainId = await client.getChainId() // 4663
```

## What developers should know

- **`block.number` is not the layer 2 block.** Inside a contract on this chain, `block.number` returns an estimate of the Ethereum block number. Farmenta measures time with `block.timestamp` everywhere: interest accrual, the TWAP window and the LT ramp all use seconds, never block counts.
- **Native ETH and WETH are different assets in Uniswap v4.** A pool key writes native ETH as the zero address. ETH/USDG and WETH/USDG are separate pools. See [contract addresses](./addresses.md).
- **Transactions are ordered first come, first served.** The sequencer does not run a priority auction, so a higher gas price does not move a transaction ahead of one that arrived earlier. For a liquidator, speed of submission matters more than the gas price.
- **The chain runs the Arbitrum Nitro EVM.** Standard Solidity tooling works without changes.

## Rollup stage and sequencer dependence

Robinhood Chain is an early stage rollup. You should understand these properties before you put funds into any protocol on it:

- **One sequencer.** A single sequencer, operated by the chain's operators, orders all transactions. If it stops or slows down, no transaction is processed promptly. The sequencer can also filter transactions. This filter also applies to transactions forced in through Ethereum, so forced inclusion is not a dependable way around the sequencer.
- **A small validator set.** The validator set is permissioned and has two validators.
- **Upgradeable by a council.** A security council of 8 signers can upgrade the chain's contracts: 6 of 8 with a 7 day delay for routine upgrades, 7 of 8 without delay in an emergency. L2BEAT rates the chain as Stage 0 with no exit window.

:::warning[Liquidations depend on the sequencer]
A liquidation is a transaction like any other. While the sequencer is down, nobody can liquidate, repay or add collateral in time, but prices in the outside world keep moving. When the chain resumes, loans can be deeper under water than the liquidator bonus covers, which leads to bad debt that lenders carry.

On many layer 2 networks, protocols read a Chainlink sequencer uptime feed to detect this situation on-chain. **No Chainlink sequencer uptime feed exists on Robinhood Chain**, so the Farmenta contracts cannot detect sequencer downtime by themselves. The only mitigation is manual: the guardian can pause the market at once, and a pause also stops liquidations.

See [oracle and market risks](../risk/oracle-and-market-risks.md) and [pause and emergency](../risk/pause-and-emergency.md).
:::

## Related pages

- [Contract addresses](./addresses.md)
- [Indexer data](./indexer.md)
- [Oracle and market risks](../risk/oracle-and-market-risks.md)
- [Pause and emergency](../risk/pause-and-emergency.md)
- [Robinhood Chain documentation](https://docs.robinhood.com/chain)
