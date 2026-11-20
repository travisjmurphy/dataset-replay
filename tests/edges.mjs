import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { replayDatasets as compare } from '../server.mjs';
const entry=fileURLToPath(new URL('../server.mjs',import.meta.url));
const run=(csv,other,policy={key:'id'})=>compare(csv,other,policy);
const test=(name,f)=>{f();console.log('PASS '+name)};
const pair=(a,b,rule)=>run('id,n\nA,'+a,'id,n\nA,'+b,{key:'id',numericRules:[{column:'n',...rule}]});
test('inclusive decimal change is exact in both directions',()=>{
 for(const [a,b] of [['1.00','1.10'],['1.10','1.00'],['-0.02','0.08'],['0.30','0.20']])assert.equal(pair(a,b,{maxChange:0.1}).status,'pass');
 assert.equal(pair('1.00','1.10000000001',{maxChange:0.1}).findings[0].code,'numeric_change_exceeds_limit');
});
test('inclusive decimal bounds and larger-than-safe-integer CSV values',()=>{
 assert.equal(pair('0.1','.1000e0',{min:0.1,max:0.1}).status,'pass');
 assert.equal(pair('9007199254740992','9007199254740993',{maxChange:0}).findings[0].code,'numeric_change_exceeds_limit');
 assert.equal(pair('0','-1e-325',{min:0}).findings[0].code,'invalid_number');
 assert.equal(pair('0','-1e-324',{min:0}).findings[0].code,'number_out_of_range');
 assert.equal(pair('0','1'.repeat(129),{}).findings[0].code,'invalid_number');
});
test('decimal formatting changes can be informational even when numeric values agree',()=>{
 const r=pair('10.00','1E+1',{maxChange:0});assert.equal(r.status,'pass');assert.equal(r.counts.changed,1);
});
test('independent seeded permutations preserve keyed verdict and one planted fault',()=>{
 let seed=1759;const rand=()=>((seed=seed*48271%2147483647)/2147483647);
 const shuffle=a=>{for(let i=a.length-1;i;i--){const j=Math.floor(rand()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
 for(let k=0;k<20;k++){
  const keys=Array.from({length:12},(_,i)=>'s'+i),base=shuffle([...keys]),cand=shuffle([...keys]),where=k%keys.length,want=keys[where];
  const a=['id,qty',...base.map(key=>key+',2')].join('\n'), compose=f=>['qty,id',...cand.map(key=>f(key)+','+key)].join('\n'),p={key:'id',numericRules:[{column:'qty',min:1}]};
  assert.equal(run(a,compose(()=>2),p).counts.changed,0);const r=run(a,compose(key=>key===want?0:2),p);
  assert.deepEqual(r.findings.map(f=>[f.key,f.side,f.line]),[[want,'candidate',cand.indexOf(want)+2]]);
  assert.equal(r.counts.changed,1);
 }
});
test('UTF-8 BOM, quoted commas, doubled quotes and all three physical newline forms',()=>{
 for(const nl of ['\r','\n','\r\n']){
  const a='\uFEFFid,n,memo'+nl+'a,2,"a,b""c'+nl+'d"'+nl+'b,4,last'+nl, b=a.replace('b,4,last','b,,last');
  const r=run(a,b,{key:'id',requiredValues:['n']});assert.deepEqual(r.findings.map(f=>[f.line,f.record]),[[4,2]]);
 }
});
test('header-only exports: removal is visible, never a fabricated policy failure',()=>{
 const r=run('id,n\nA,1','id,n');assert.equal(r.status,'pass');assert.equal(r.counts.removed,1);assert.equal(r.counts.candidate,0);
});
test('a duplicated baseline key cannot become a candidate update or remove',()=>{
 const r=run('id,n\nA,1\nA,2','id,n\nA,3');assert.equal(r.changes.length,0);
 assert.deepEqual(r.findings.map(f=>[f.side,f.line,f.code]),[['baseline',3,'duplicate_key']]);
});
test('bounds count all omitted field evidence, including wholly omitted rows',()=>{
 const cols=Array.from({length:26},(_,i)=>'f'+i),csv=v=>['id,'+cols.join(','),...Array.from({length:201},(_,i)=>i+','+cols.map(()=>v).join(','))].join('\n');
 const r=run(csv('a'),csv('b'));assert.equal(r.counts.changed,201);
 assert.deepEqual(r.truncated,{findings:0,changes:1,fields:200*2+26});
 assert.equal(r.changes.length,200);assert.ok(r.changes.every(c=>c.fields.length===24));
});
test('long Unicode keys retain well-formed, visibly clipped evidence',()=>{
 const key='a'.repeat(156)+'😀'+'b'.repeat(10);const r=run('id,n\n'+key+',1','id,n\n'+key+',2');
 assert.ok(r.changes[0].key.isWellFormed());assert.match(r.changes[0].key,/…$/);
});
test('same schema guarantees at engine and adapter boundary',()=>{
 for(const p of [{key:'id',requiredValues:null},{key:'\ud800'},{key:'id',numericRules:[{column:'n',min:2,max:1}]}])assert.throws(()=>run('id','id',p));
 assert.throws(()=>run('id','id\n\ud800'));assert.throws(()=>run('id','x'.repeat(250001)));
});
test('key comparison is exact, case-sensitive and whitespace-preserving',()=>{
 const r=run('id,n\nA,1','id,n\na,1\n A,1');assert.deepEqual([r.counts.added,r.counts.removed,r.counts.changed],[2,1,0]);
});
test('all four receipt digests independently recomputed from an actual CLI run',()=>{
 const args={baselineCsv:'id,n\r\nA,1.00',candidateCsv:'id,n\nA,1.10',policy:{numericRules:[{maxChange:0.1,column:'n'}],key:'id'}};
 const cli=input=>spawnSync(process.execPath,[entry,'--receipt'],{input:JSON.stringify(input),encoding:'utf8',timeout:10000});
 const p=cli(args);assert.equal(p.status,0,p.stderr);const {receipt,report}=JSON.parse(p.stdout);
 const sort=v=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;
 const hash=v=>createHash('sha256').update(v).digest('hex');
 for(const [key,data] of Object.entries({baseline:args.baselineCsv,candidate:args.candidateCsv,policy:JSON.stringify(sort(args.policy)),report:JSON.stringify(sort(report))}))assert.equal(receipt[key+'Sha256'],hash(data));
 assert.equal(report.status,'pass');const alt=cli({...args,candidateCsv:args.candidateCsv.replaceAll('\n','\r\n')});assert.notEqual(JSON.parse(alt.stdout).receipt.candidateSha256,receipt.candidateSha256);
});
test('legacy handshake cannot enable structured UI by advertising modern metadata',()=>{
 const req=[{id:1,method:'initialize',params:{protocolVersion:'2024-11-05',capabilities:{extensions:{'io.modelcontextprotocol/ui':{mimeTypes:['text/html;profile=mcp-app']}}},clientInfo:{name:'fixture',version:'1'}}},{method:'notifications/initialized'},{id:2,method:'tools/list'},{id:3,method:'tools/call',params:{name:'dataset_replay_demo',arguments:{scenario:'clean'}}}].map(r=>JSON.stringify({jsonrpc:'2.0',...r})).join('\n')+'\n';
 const p=spawnSync(process.execPath,[entry,'--stdio'],{input:req,encoding:'utf8',timeout:10000});assert.equal(p.status,0,p.stderr);const res=p.stdout.trim().split('\n').map(s=>JSON.parse(s));
 assert.equal(res[0].result.capabilities.resources,undefined);assert.ok(res[1].result.tools.every(t=>!t._meta));assert.equal(res[2].result.structuredContent,undefined);
});

test('an empty or gutted export fails strict row floor and coverage even when all present cells are valid',()=>{
 const policy={key:'id',minCandidateRows:2,minKeyRetention:1};
 for(const [csv,seen] of [['id,n',0],['id,n\nA,1',1],['id,n\nA,1\nC,3',1]]){
  const r=run('id,n\nA,1\nB,2',csv,policy);assert.equal(r.verdict,'candidate-failed');
  assert.equal(r.retention.retained,seen);assert.equal(r.retention.baselineEligible,2);assert.equal(r.findings.at(-1).code,'key_retention_below_minimum');
  assert.equal(r.findings.at(-1).line,null);assert.equal(r.findings.at(-1).record,null);
  assert.equal(r.findings.some(f=>f.code==='too_few_candidate_rows'),csv.indexOf('C,3')===-1);
 }
});
test('key retention denominator uses unique baseline keys and cannot pass without a reference',()=>{
 const policy={key:'id',minKeyRetention:0.5};const a='id\nA\nB\nB\nC';
 const r=run(a,'id\nA\nA',policy);assert.deepEqual(r.retention,{baselineEligible:2,retained:1,minimum:0.5});assert.equal(r.verdict,'both-failed');assert.equal(r.findings[0].firstLine,3);assert.equal(r.findings[1].firstLine,2);
 const noRef=run('id','id\nA',policy);assert.equal(noRef.verdict,'reference-failed');assert.equal(noRef.findings[0].code,'key_retention_no_reference');
});
test('only a bad baseline is labelled reference-failed; a malformed baseline is not a comparison',()=>{
 const r=run('id,n\nA,','id,n\nA,1',{key:'id',requiredValues:['n']});
 assert.equal(r.verdict,'reference-failed');assert.deepEqual(r.sideFindings,{baseline:1,candidate:0});assert.throws(()=>run('id,n\nA','id,n\nA,1'));
});
test('percent limit is inclusive and symmetric in sign, relative to absolute baseline magnitude',()=>{
 for(const [a,b] of [['-100','-110'],['-100','-90'],['0.10','0.11'],['100','90']])assert.equal(pair(a,b,{maxPercentChange:10}).status,'pass');
 assert.equal(pair('1.00','1.101',{maxPercentChange:10}).findings[0].code,'percent_change_exceeds_limit');
 assert.equal(pair('100','-100',{maxPercentChange:199.99}).status,'fail');assert.equal(pair('100','-100',{maxPercentChange:200}).status,'pass');
});
test('percent policy never treats an undefined reference as a clean pass',()=>{
 assert.equal(pair('0','0',{maxPercentChange:0}).status,'pass');
 assert.equal(pair('0','1',{maxPercentChange:100}).findings[0].code,'percent_change_from_zero');
 assert.equal(pair('','1',{maxPercentChange:100}).verdict,'reference-failed');
 assert.equal(pair('1','',{maxPercentChange:100}).verdict,'candidate-failed');
 assert.equal(pair('not numeric','5',{maxPercentChange:100}).verdict,'reference-failed');
});
test('reject invalid counts, fractions and negative percent limits',()=>{
 for(const rule of [{minCandidateRows:-1},{minCandidateRows:1.5},{minKeyRetention:1.01},{minKeyRetention:null},{numericRules:[{column:'n',maxPercentChange:-1}]}])assert.throws(()=>run('id,n','id,n',{key:'id',...rule}));
});
