import { replayDatasets } from '../server.mjs';

const p={key:"sku",requiredColumns:["name"],requiredValues:["price"],numericRules:[{column:"price",min:.01,max:1000,maxChange:10}]};
const a="sku,name,price\nA,Socks,8\nB,Boots,50\nC,Hat,20";
const good="price,name,sku\n20,Hat,C\n50,Boots,B\n8,Socks,A";
const bad="sku,name,price\nA,Socks,0\nB,Boots,\nB,Boots,51\nC,Hat,35";
const r=replayDatasets(a,bad,p),eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const throws=(f,s)=>{try{f()}catch(e){return e.message.includes(s)}return false};
const tests=[
 ["reordered clean",replayDatasets(a,good,p).status==="pass"&&replayDatasets(a,good,p).counts.changed===0],
 ["planted finding codes",eq(r.findings.map(x=>x.code),["number_out_of_range","missing_required_value","duplicate_key","numeric_change_exceeds_limit"])],
 ["row evidence",eq(r.findings.map(x=>x.line),[2,3,4,5])],
 ["literal zero versus blank",eq(r.findings.slice(0,2).map(x=>x.value),["0",""])],
 ["ambiguous matches skipped",!r.changes.some(x=>x.key==="B")],
 ["stable report",eq(r,replayDatasets(a,bad,p))],
 ["schema added/removed",eq(replayDatasets(a,"sku,status,price\nA,in,8",p).schema,{added:["status"],removed:["name"]})],
 ["missing value or column",replayDatasets(a,"sku,name,price\n ,A,8",p).findings[0].code==="missing_key"&&replayDatasets(a,"name,price\nA,8",p).findings[0].code==="missing_column"],
 ["no positional fallback",replayDatasets(a,"name,price\nA,8",p).changes.length===0],
 ["quoted multiline evidence",replayDatasets(a,'\uFEFFsku,name,price\r\nA,"A, ""woven""\r\nsock",8\r\nB,Boots,',p).findings[0].line===4],
 ["multiline physical line vs data-record ordinal",(()=>{const q=replayDatasets(a,'sku,name,price\r\nA,"multi\r\nline",8\r\nB,Boots,',p);return q.findings[0].line===4&&q.findings[0].record===2&&q.changes.find(x=>x.key==="B").candidateRecord===2&&q.changes.find(x=>x.key==="B").baselineRecord===2&&q.changes.find(x=>x.key==="B").candidateLine===4})()],
 ["missing header evidence has no record ordinal",replayDatasets(a,"sku,price\nA,8",p).findings[0].record===null],
 ["mismatched width",throws(()=>replayDatasets(a,"sku,name,price\nA,Socks",p),"expected 3")],
 ["malformed bare quote",throws(()=>replayDatasets(a,'sku,name,price\nA,So"cks,9',p),"quote")],
 ["duplicate header",throws(()=>replayDatasets(a,"sku,sku,price",p),"duplicate")],
 ["accept explicit zero",replayDatasets("id,n\nA,0","id,n\nA,0",{key:"id",requiredValues:["n"],numericRules:[{column:"n",min:0}]}).status==="pass"],
 ["unsupported policy",throws(()=>replayDatasets(a,bad,{key:"sku",comment:"x"}),"Invalid policy")],
 ["finding cap",replayDatasets(a,"sku,name,price\n"+Array.from({length:205},(_,i)=>i+",A,").join("\n"),p).truncated.findings===5],
 ["field cap",throws(()=>replayDatasets(a,"sku,name,price\nA,"+"a".repeat(8200)+",8",p),"field too long")],
 ["add/remove counts",replayDatasets(a,"sku,name,price\nD,Tee,5",p).counts.removed===3],
 ["literal special key name",replayDatasets("__proto__,val\nA,1","__proto__,val\nA,2",{key:"__proto__"}).counts.changed===1],
];

console.log(tests); if(tests.some(([,ok])=>!ok)) process.exitCode=1;
