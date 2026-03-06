let volumeChart
let slaChart

document.getElementById("runBtn").addEventListener("click", run)

function parseCSV(text){
return text.split(",").map(v=>parseFloat(v.trim())).filter(v=>!isNaN(v))
}

function factorial(n){
if(n<=1) return 1
let f=1
for(let i=2;i<=n;i++) f*=i
return f
}

function erlangC(traffic, agents){

if(traffic >= agents) return 1

let sum=0

for(let k=0;k<agents;k++){
sum+=Math.pow(traffic,k)/factorial(k)
}

const top=(Math.pow(traffic,agents)/factorial(agents))*(agents/(agents-traffic))

const pw=top/(sum+top)

return pw
}

function run(){

const model=document.getElementById("modelSelect").value

const volume=parseCSV(document.getElementById("volumeInput").value)

const staffing=parseCSV(document.getElementById("staffInput").value)

const aht=parseFloat(document.getElementById("ahtInput").value)

const patience=parseFloat(document.getElementById("patienceInput").value)

const shrink=parseFloat(document.getElementById("shrinkInput").value)/100

const slaThreshold=parseFloat(document.getElementById("slaInput").value)

let results=[]

let totalCalls=0
let totalAnswered=0
let totalAbn=0
let totalQueue=0
let occSum=0

const intervals=Math.min(volume.length, staffing.length)

for(let i=0;i<intervals;i++){

const calls=volume[i]

const agents=staffing[i]*(1-shrink)

const traffic=(calls*aht)/900

let queue=0
let abandon=0
let sla=0
let occ=0

if(model==="erlang"){

const pw=erlangC(traffic,Math.floor(agents))

queue=pw*calls*0.5

abandon=queue*(1/(patience/30))

sla=100-(pw*50)

occ=Math.min(100,(traffic/agents)*100)

}else{

const serviceRate=agents*(900/aht)

queue=Math.max(0,calls-serviceRate)

abandon=Math.min(queue,queue*(1/(patience/30)))

const wait=queue>0?(queue/serviceRate)*60:0

sla=wait<=slaThreshold?100:Math.max(0,100-(wait*2))

occ=Math.min(100,(calls/serviceRate)*100)

}

results.push({
calls,
agents,
queue,
abandon,
sla,
occ
})

totalCalls+=calls
totalAnswered+=calls-queue
totalAbn+=abandon
totalQueue+=queue
occSum+=occ

}

const slaMetric=(totalAnswered/totalCalls)*100
const occMetric=occSum/results.length
const queueMetric=totalQueue/results.length
const abnMetric=(totalAbn/totalCalls)*100

document.getElementById("slaMetric").innerText=slaMetric.toFixed(1)+"%"
document.getElementById("occMetric").innerText=occMetric.toFixed(1)+"%"
document.getElementById("queueMetric").innerText=queueMetric.toFixed(1)
document.getElementById("abnMetric").innerText=abnMetric.toFixed(1)+"%"

renderCharts(results,volume)

renderTable(results)

}

function renderCharts(results,volume){

const slaData=results.map(r=>r.sla)

if(volumeChart) volumeChart.destroy()

volumeChart=new Chart(document.getElementById("volumeChart"),{
type:"line",
data:{
labels:volume.map((_,i)=>"Interval "+(i+1)),
datasets:[
{
label:"Call Volume",
data:volume,
borderWidth:2
}
]
},
options:{
responsive:true
}
})

if(slaChart) slaChart.destroy()

slaChart=new Chart(document.getElementById("slaChart"),{
type:"line",
data:{
labels:slaData.map((_,i)=>"Interval "+(i+1)),
datasets:[
{
label:"SLA %",
data:slaData,
borderWidth:2
}
]
},
options:{
responsive:true
}
})

}

function renderTable(results){

const table=document.getElementById("intervalTable")

table.innerHTML=""

const header=document.createElement("div")

header.className="interval"
header.style.fontWeight="bold"

header.innerHTML=`
<div>Interval</div>
<div>Call Volume</div>
<div>Active Agents</div>
<div>Queue Length</div>
<div>SLA %</div>
<div>Occupancy %</div>
`

table.appendChild(header)

results.forEach((r,i)=>{

const row=document.createElement("div")

row.className="interval"

row.innerHTML=`
<div>${i+1}</div>
<div>${r.calls}</div>
<div>${r.agents.toFixed(1)}</div>
<div>${r.queue.toFixed(1)}</div>
<div>${r.sla.toFixed(1)}%</div>
<div>${r.occ.toFixed(1)}%</div>
`

table.appendChild(row)

})

}
