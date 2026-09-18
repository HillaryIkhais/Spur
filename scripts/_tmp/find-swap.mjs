import { createPublicClient, http } from 'viem';
import { celo } from 'viem/chains';

const client = createPublicClient({ chain: celo, transport: http('https://forno.celo.org') });

// Ubeswap V2 / UniV2 Swap + UniV3 Swap event topics
const sigs = {
  v2: 'Swap(address,uint256,uint256,uint256,uint256,address)',
  v3: 'Swap(address,address,int256,int256,uint160,uint128,int24)',
};
import { keccak256, toHex } from 'viem';
const t2 = keccak256(toHex(sigs.v2));
const t3 = keccak256(toHex(sigs.v3));

const latest = await client.getBlockNumber();
console.log('latest block', latest.toString());
// scan back ~2400 blocks (~3h) for V2 swaps touching our known stablecoins
const addrs = ['0x3517b5B8fD1290027E29b61208B237Bd2B36bB45','0x2393FE07eac2F4cE85d18337A1202386dE4E5b70','0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3','0x9832b6B388B8b8C88A0aF532c6a0dFCC11F48C82','0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e','0x765DE81681583a650904d40316C1fa9810A02191'];
const from = latest - 2400n;
console.log('scanning from', from.toString());
const logs = await client.getLogs({ event: null, fromBlock: from, toBlock: 'latest', topics: [t2] });
console.log('v2 swap logs found:', logs.length);
let shown = 0;
for (const l of logs.slice(-30)) {
  // decode
  const rec = client.decodeEventLog({ abi: [{ type:'event', name:'Swap', inputs:[{type:'address',name:'sender',indexed:true},{type:'uint256',name:'amount0In',indexed:false},{type:'uint256',name:'amount1In',indexed:false},{type:'uint256',name:'amount0Out',indexed:false},{type:'uint256',name:'amount1Out',indexed:false},{type:'address',name:'to',indexed:true}]}], data: l.data, topics: l.topics });
  console.log(`tx=${l.transactionHash} blk=${l.blockNumber} pair=${l.address}`, JSON.stringify(rec.args).slice(0,140));
  if (++shown >= 6) break;
}
