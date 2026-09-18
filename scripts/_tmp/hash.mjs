import { keccak256, toHex } from 'viem';
const RPC='https://forno.celo.org';
const call=async(method,params)=>fetch(RPC,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}).then(r=>r.json());
const t2=keccak256(toHex('Swap(address,uint256,uint256,uint256,uint256,address)'));
const pair='0x462fe04b4fd719cbd04c0310365d421d02aaa19e';
const latest=BigInt((await call('eth_blockNumber',[])).result);
const from=latest-2600n;
for(let i=0;i<14;i++){
  const lo=from+BigInt(i)*200n;
  const r=await call('eth_getLogs',[{fromBlock:'0x'+lo.toString(16),toBlock:'0x'+(lo+199n).toString(16),address:pair,topics:[t2]}]);
  if(r.result&&r.result.length){console.log(r.result.map(l=>l.transactionHash).join('\n'));break;}
}
