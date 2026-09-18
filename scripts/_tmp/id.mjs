import { createPublicClient, http } from 'viem';
import { celo } from 'viem/chains';
const pc=createPublicClient({chain:celo,transport:http('https://forno.celo.org')});
const erc=[{name:'name',type:'function',stateMutability:'view',inputs:[],outputs:[{type:'string'}]},{name:'symbol',type:'function',stateMutability:'view',inputs:[],outputs:[{type:'string'}]},{name:'decimals',type:'function',stateMutability:'view',inputs:[],outputs:[{type:'uint8'}]},{name:'token0',type:'function',stateMutability:'view',inputs:[],outputs:[{type:'address'}]},{name:'token1',type:'function',stateMutability:'view',inputs:[],outputs:[{type:'address'}]}];
for(const pair of ['0x0feba760d93423d127de1b6abecdb60e5253228d','0x9f437509e61896738ea8cdb6cded618c0e509032','0x462fe04b4fd719cbd04c0310365d421d02aaa19e']){
  const t0=await pc.readContract({address:pair,abi:erc,functionName:'token0'});
  const t1=await pc.readContract({address:pair,abi:erc,functionName:'token1'});
  const n=async(t)=>(await pc.readContract({address:t,abi:erc,functionName:'symbol'}));
  const d=async(t)=>(await pc.readContract({address:t,abi:erc,functionName:'decimals'}));
  console.log(pair,'token0',t0,'('+await n(t0),String(await d(t0))+')','token1',t1,'('+await n(t1),String(await d(t1))+')');
}
