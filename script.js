document.getElementById("runBtn").addEventListener("click", runSimulation)

let volumeChart
let slaChart

function parseCSV(text){
return text.split(",").map(v => Number(v.trim()))
}

function runSimulation(){

const volume = parseCSV(document.getElementById("volumeInput").value)
const staff = parseCSV(document.getElementById("staffInput").value)

const aht = Number(document.getElementById("ahtInput").value)
const patience = Number(document.getElementById("patienceInput").value)
const shrink = Number(document.getElementById("shrinkInput").value) / 100
const slaThreshold = Number(document.getElementById("slaInput").value)

let carryQueue = 0
let results = []

let totalCalls = 0
let totalAnswered = 0
let totalAbandon = 0
let totalQueue = 0
let occSum = 0

let attention = []

for(let i=0;i<volume.length;i++){

let calls = volume[i]

let agents = staff[i] * (1 - shrink)

let capacity = agents * (900 / aht)

let arrivals = calls + carryQueue

let served = Math.min(arrivals, capacity)

let remainingQueue = arrivals - served

/* abandonment model */

let abandonRate = 900 / patience

let abandons = remainingQueue * (abandonRate / (abandonRate + capacity))

remainingQueue = Math.max(0, remainingQueue - abandons)

let avgWait = remainingQueue > 0 ? (remainingQueue / capacity) * aht : 0

let sla = Math.max(0, Math.min(100, 100 * Math.exp(-avgWait / slaThreshold)))

let occupancy = Math.min(100, (served / capacity) * 100)

if(remainingQueue > 25 || occupancy > 95){
attention.push(i+1)
}

results.push({
interval: i+1,
calls: calls,
agents: agents.toFixed(1),
queue: remainingQueue.toFixed(1),
sla: sla.toFixed(1),
occ: occupancy.toFixed(1),
risk: remainingQueue > 25 || occupancy > 95
})

carryQueue = remainingQueue

totalCalls += calls
totalAnswered += served
totalAbandon += abandons
totalQueue += remainingQueue
occSum += occupancy

}

let slaOverall = ((totalAnswered/totalCalls)*100).toFixed(1)
let occ = (occSum/volume.length).toFixed(1)
let avgQueue = (totalQueue/volume.length).toFixed(1)
let abn = ((totalAbandon/totalCalls)*100).toFixed(1)

document.getElementById("slaMetric").innerText = slaOverall+"%"
document.getElementById("occMetric").innerText = occ+"%"
document.getElementById("queueMetric").innerText = avgQueue
document.getElementById("abnMetric").innerText = abn+"%"

renderTable(results)
renderCharts(volume,results)
generateSummary(results,slaOverall,occ,avgQueue,abn,attention)

}

function renderTable(results){

let html=`
<table class="results-table">
<thead>
<tr>
<th>Interval</th>
<th>Calls</th>
<th>Active Agents</th>
<th>Queue</th>
<th>SLA %</th>
<th>Occupancy %</th>
</tr>
</thead>
<tbody>
`

results.forEach(r=>{

let cls = r.risk ? "risk-row" : ""

html+=`
<tr class="${cls}">
<td>${r.interval}</td>
<td>${r.calls}</td>
<td>${r.agents}</td>
<td>${r.queue}</td>
<td>${r.sla}</td>
<td>${r.occ}</td>
</tr>
`

})

html+=`</tbody></table>`

document.getElementById("intervalTable").innerHTML=html

}

function renderCharts(volume,results){

const slaData = results.map(r=>Number(r.sla))

if(volumeChart) volumeChart.destroy()

volumeChart = new Chart(
document.getElementById("volumeChart"),
{
type:"line",
data:{
labels:volume.map((_,i)=>i+1),
datasets:[
{
label:"Call Volume",
data:volume,
borderColor:"#38bdf8",
tension:0.3
}
]
}
}
)

if(slaChart) slaChart.destroy()

slaChart = new Chart(
document.getElementById("slaChart"),
{
type:"line",
data:{
labels:volume.map((_,i)=>i+1),
datasets:[
{
label:"SLA %",
data:slaData,
borderColor:"#22c55e",
tension:0.3
}
]
}
}
)

}

function generateSummary(results,sla,occ,avgQueue,abn,attention){

let peakQueue=Math.max(...results.map(r=>Number(r.queue)))

let peakInterval=results.find(r=>Number(r.queue)===peakQueue).interval

let attentionText = attention.length ? attention.join(", ") : "None"

let html=`

<p><b>Overall Performance</b></p>

<ul>
<li>SLA achieved: ${sla}%</li>
<li>Average occupancy: ${occ}%</li>
<li>Average queue length: ${avgQueue}</li>
<li>Estimated abandonment: ${abn}%</li>
</ul>

<p>
The simulation models queue formation when demand exceeds agent capacity.
As call volume rises during peak intervals, queue pressure increases and service levels decline.
</p>

<p>
Peak queue occurred at <b>interval ${peakInterval}</b>
with approximately <b>${peakQueue}</b> calls waiting.
</p>

<p>
<b>Intervals requiring operational attention:</b> ${attentionText}
</p>

<p>
Increasing staffing or redistributing capacity during these intervals
would significantly reduce queue buildup and improve SLA stability.
</p>

`

document.getElementById("summaryText").innerHTML = html

}
