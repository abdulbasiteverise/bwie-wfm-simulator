document.getElementById("runBtn").addEventListener("click", runSimulation)

let volumeChart
let slaChart

function parseCSV(text) {
return text.split(",").map(v => Number(v.trim()))
}

function runSimulation(){

const volume = parseCSV(document.getElementById("volumeInput").value)
const staff = parseCSV(document.getElementById("staffInput").value)

const aht = Number(document.getElementById("ahtInput").value)
const patience = Number(document.getElementById("patienceInput").value)
const shrink = Number(document.getElementById("shrinkInput").value)/100
const slaTarget = Number(document.getElementById("slaInput").value)

let results = []

let totalQueue = 0
let totalAnswered = 0
let totalCalls = 0
let totalAbandon = 0
let occSum = 0

for(let i=0;i<volume.length;i++){

let calls = volume[i]
let agents = staff[i]*(1-shrink)

let capacity = agents*(900/aht)

let queue = Math.max(0,calls-capacity)

let wait = queue/(agents+1)

let sla = wait<slaTarget ? 100*(1-wait/slaTarget) : 0

let occupancy = Math.min(100,(calls/capacity)*100)

let abandon = queue*(aht/patience)/10

results.push({
interval:i+1,
calls,
agents:agents.toFixed(1),
queue:queue.toFixed(1),
sla:sla.toFixed(1),
occ:occupancy.toFixed(1)
})

totalQueue+=queue
totalAnswered+=Math.min(calls,capacity)
totalCalls+=calls
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

generateSummary(results,sla,occ,avgQueue,abn)

}


function renderTable(results){

let html="<table><tr><th>Interval</th><th>Call Volume</th><th>Active Agents</th><th>Queue</th><th>SLA %</th><th>Occupancy %</th></tr>"

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
data:volume
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
data:slaData
}]
}
})

}


function generateSummary(results,sla,occ,avgQueue,abn){

let worst = results
.filter(r=>Number(r.sla)<50)
.map(r=>r.interval)

let worstText = worst.length ? worst.join(", ") : "None"

let summary = `

<p><b>Overall Performance</b></p>

<ul>
<li>SLA achieved: ${sla}%</li>
<li>Average occupancy: ${occ}%</li>
<li>Average queue length: ${avgQueue}</li>
<li>Estimated abandonment: ${abn}%</li>
</ul>

<p>
The simulation suggests that demand begins exceeding staffing capacity during
the mid-day intervals, leading to sustained queue buildup and declining SLA.
Agent occupancy reaches extremely high levels which indicates the operation
is running near saturation.
</p>

<p>
Intervals requiring operational attention: <b>${worstText}</b>.
These periods experience the highest queues and the lowest service levels.
</p>

<p>
Increasing staffing during these peak intervals would likely reduce queue buildup,
improve service level performance and stabilize occupancy within recommended ranges.
</p>

`

document.getElementById("summaryText").innerHTML=summary

}
