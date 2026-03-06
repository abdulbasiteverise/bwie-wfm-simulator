document.getElementById("runBtn").addEventListener("click", runSimulation)

let volumeChart
let slaChart

function parseCSV(text){
return text.split(",").map(v=>Number(v.trim()))
}

function runSimulation(){

const volume=parseCSV(document.getElementById("volumeInput").value)
const staff=parseCSV(document.getElementById("staffInput").value)

const aht=Number(document.getElementById("ahtInput").value)
const patience=Number(document.getElementById("patienceInput").value)
const shrink=Number(document.getElementById("shrinkInput").value)/100
const slaTarget=Number(document.getElementById("slaInput").value)

let results=[]
let carryQueue=0

let totalCalls=0
let totalAnswered=0
let totalQueue=0
let totalAbandon=0
let occSum=0

let attentionIntervals=[]

for(let i=0;i<volume.length;i++){

let calls=volume[i]

let agents=staff[i]*(1-shrink)

let demand=calls+carryQueue

let capacity=agents*(900/aht)

let answered=Math.min(demand,capacity)

let queue=Math.max(0,demand-capacity)

let wait=(queue/(agents+1))*aht

let sla=wait<slaTarget ? 100*(1-wait/slaTarget) : 0

let occupancy=Math.min(100,(answered/capacity)*100)

let abandon=queue*(aht/patience)/10

// Detect operational risk

if(queue>20 || occupancy>95){
attentionIntervals.push(i+1)
}

results.push({
interval:i+1,
calls,
agents:agents.toFixed(1),
queue:queue.toFixed(1),
sla:sla.toFixed(1),
occ:occupancy.toFixed(1)
})

carryQueue=queue

totalCalls+=calls
totalAnswered+=answered
totalQueue+=queue
totalAbandon+=abandon
occSum+=occupancy

}

const avgQueue=(totalQueue/volume.length).toFixed(1)
const occ=(occSum/volume.length).toFixed(1)
const sla=((totalAnswered/totalCalls)*100).toFixed(1)
const abn=((totalAbandon/totalCalls)*100).toFixed(1)

document.getElementById("slaMetric").innerText=sla+"%"
document.getElementById("occMetric").innerText=occ+"%"
document.getElementById("queueMetric").innerText=avgQueue
document.getElementById("abnMetric").innerText=abn+"%"

renderTable(results)

renderCharts(volume,results)

generateSummary(results,sla,occ,avgQueue,abn,attentionIntervals)

}

function renderTable(results){

let html=`
<table>
<tr>
<th>Interval</th>
<th>Calls</th>
<th>Agents</th>
<th>Queue</th>
<th>SLA %</th>
<th>Occupancy %</th>
</tr>
`

results.forEach(r=>{
html+=`
<tr>
<td>${r.interval}</td>
<td>${r.calls}</td>
<td>${r.agents}</td>
<td>${r.queue}</td>
<td>${r.sla}</td>
<td>${r.occ}</td>
</tr>
`
})

html+="</table>"

document.getElementById("intervalTable").innerHTML=html

}

function renderCharts(volume,results){

const slaData=results.map(r=>Number(r.sla))

if(volumeChart) volumeChart.destroy()

volumeChart=new Chart(document.getElementById("volumeChart"),{
type:"line",
data:{
labels:volume.map((_,i)=>i+1),
datasets:[{
label:"Call Volume",
data:volume,
borderColor:"#38bdf8",
tension:0.3
}]
}
})

if(slaChart) slaChart.destroy()

slaChart=new Chart(document.getElementById("slaChart"),{
type:"line",
data:{
labels:volume.map((_,i)=>i+1),
datasets:[{
label:"SLA %",
data:slaData,
borderColor:"#34d399",
tension:0.3
}]
}
})

}

function generateSummary(results,sla,occ,avgQueue,abn,attentionIntervals){

let worstText="None"

if(attentionIntervals.length>0){
worstText=attentionIntervals.join(", ")
}

let peakQueue=Math.max(...results.map(r=>Number(r.queue)))

let peakInterval=results.find(r=>Number(r.queue)===peakQueue).interval

let summary=`

<p><b>Overall Performance</b></p>

<ul>
<li>SLA achieved: ${sla}%</li>
<li>Average occupancy: ${occ}%</li>
<li>Average queue length: ${avgQueue}</li>
<li>Estimated abandonment: ${abn}%</li>
</ul>

<p>
The simulation indicates that demand begins exceeding available agent capacity
during mid-day intervals, causing queues to propagate across later periods.
</p>

<p>
Peak queue occurred at <b>interval ${peakInterval}</b> with approximately
<b>${peakQueue}</b> calls waiting.
</p>

<p>
<b>Intervals requiring operational attention:</b> ${worstText}
</p>

<p>
These intervals show elevated queue pressure or extremely high occupancy levels.
Increasing staffing during these periods would significantly reduce queue buildup
and stabilize service level performance.
</p>

`

document.getElementById("summaryText").innerHTML=summary

}
