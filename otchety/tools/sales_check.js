// Сверка «Дашборда продаж» с контрольными цифрами.
// Запуск: node tools/sales_check.js путь/actual.xlsx [путь/plan.xlsx]
// Данные в репозиторий не кладутся: в выгрузках настоящие фамилии и получатели.
const fs=require('fs'),vm=require('vm'),path=require('path');
global.window=global;global.self=global;
const D=path.join(__dirname,'..');
for(const f of ['xlsx.full.min.js','jszip.min.js','pptxgen.min.js','sales-engine.js','sales-ppt.js'])vm.runInThisContext(fs.readFileSync(path.join(D,f),'utf8'),{filename:f});
global.JSZip=window.JSZip;
const E=window.SalesEngine;
const [,,fa,fp]=process.argv;
if(!fa){console.log('Укажите файл реализации');process.exit(2);}
(async()=>{
 const a=E.loadActual(fs.readFileSync(fa));const p=fp?E.loadPlan(fs.readFileSync(fp)):null;
 const d=E.aggregate(a.records,p,{});
 const ok=(name,got,want)=>{const pass=want===undefined||got===want;console.log((pass?'✓ ':'✗ ')+name+': '+got+(want!==undefined&&!pass?' (ожидалось '+want+')':''));if(!pass)process.exitCode=1;};
 const dirs=Object.fromEntries(d.directions);
 ok('строк реализации',a.records.length);ok('предупреждений',a.warnings.length);
 ok('факт',d.actual,892);if(p)ok('план',d.plan,1257);
 ok('ККК',dirs['ККК'],620);ok('ТП',dirs['ТП'],127);ok('ССС',dirs['ССС'],145);
 const kkk=Object.fromEntries(d.managers['ККК']);ok('Кабанов',kkk['Кабанов Антон Александрович'],301);ok('Прокофьев',kkk['Прокофьев Гавриил'],291);
 ok('дилеров',d.dealers.length,22);ok('авт. у дилеров',d.dealers.reduce((s,x)=>s+x[1],0),145);
 ok('связок менеджер–дилер, сумма',d.pairs.reduce((s,x)=>s+x.qty,0),145);
 if(p){const o=E.aggregate(a.records,p,{month_start:10,month_end:10});ok('октябрь факт',o.actual,141);ok('октябрь план',o.plan,273);
  ok('план менеджера не выдуман',E.aggregate(a.records,p,{manager:'Прокофьев Гавриил'}).plan,null);}
 ok('пустая выборка',E.aggregate(a.records,p,{dealer:'—нет—'}).actual,0);
 const ppt=await window.SalesPPT.build(d);ok('PowerPoint, байт',ppt.length);
})().catch(e=>{console.error('✗',e.message);process.exit(1);});
