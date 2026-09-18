import { keccak256, toHex } from 'viem';
const RPC='https://forno.celo.org';
const call=async(method,params)=>fetch(RPC,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}).then(r=>r.json());
const t2=keccak256(toHex('Swap(address,uint256,uint256,uint256,uint256,address)'));
const t3=keccak256(toHex('Swap(address,address,int256,int256,uint160,uint128,int24)'));
const latest=BigInt((await call('eth_blockNumber',[])).result);
const from=latest-3000n;
console.log('latest',latest.toString(),'topic2',t2.slice(0,10),'scanning from',from.toString());
for(let i=0;i<15;i++){
  const lo=from+BigInt(i)*200n, hi=lo+199n;
  const r=await call('eth_getLogs',[{fromBlock:'0x'+lo.toString(16),toBlock:'0x'+hi.toString(16),topics:[t2]}]);
  if(r.result&&r.result.length){
    for(const l of r.result.slice(-10)) console.log('S2',l.transactionHash.slice(0,12),'blk',BigInt(l.blockNumber).toString(),'pair',l.address,'amt',parseInt(l.data.slice(66,130),16),'amt2',parseInt(l.data.slice(130,194),16));
  }
}
