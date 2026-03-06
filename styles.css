let volumeChart
let slaChart

document.getElementById("runBtn").addEventListener("click", run)
document.getElementById("optimizeBtn").addEventListener("click", optimizeStaffing)
document.getElementById("reforecastBtn").addEventListener("click", reforecast)
document.getElementById("monteBtn").addEventListener("click", runMonteCarlo)

function parseCSV(text){
return text.split(",").map(v=>parseFloat(v.trim())).filter(v=>!isNaN(v))
}

function run(){

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

for(let i=0;i<volume.length;i++){

const calls=volume[i]

const agents=Math.floor(staffing[i]*(1-shrink))

const serviceRate=agents*(900/aht)

const queue=Math.max(0,calls-serviceRate)

const answered=calls-queue

const abandon=Math.min(queue,queue*(1/(patience/30)))

const wait=queue>0?(queue/serviceRate)*60:0

const sla=wait<=slaThreshold?100:Math.max(0,100-(wait*2))

const occ=Math.min(100,(calls/serviceRate)*100)

results.push({calls,agents,queue,abandon,sla,occ})

totalCalls+=calls
totalAnswered+=answered
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
generateInsights(results)

}

function renderCharts(results,volume){

const slaData=results.map(r=>r.sla)

if(volumeChart) volumeChart.destroy()

volumeChart=new Chart(document.getElementById("volumeChart"),{
type:"line",
data:{
labels:volume.map((_,i)=>i+1),
datasets:[{label:"Volume",data:volume}]
}
})

if(slaChart) slaChart.destroy()

slaChart=new Chart(document.getElementById("slaChart"),{
type:"line",
data:{
labels:slaData.map((_,i)=>i+1),
datasets:[{label:"SLA",data:slaData}]
}
})

}

function renderTable(results){

const table=document.getElementById("intervalTable")

table.innerHTML=""

results.forEach((r,i)=>{

let status="good"
if(r.sla<80) status="medium"
if(r.sla<60) status="bad"

const abnPct=(r.abandon/r.calls)*100

const row=document.createElement("div")

row.className="interval "+status

row.innerHTML=`
<div>${i+1}</div>
<div>${r.calls}</div>
<div>${r.agents}</div>
<div>${r.queue}</div>
<div>${r.sla.toFixed(1)}%</div>
<div>${r.occ.toFixed(1)}%</div>
<div>${abnPct.toFixed(1)}%</div>
`

table.appendChild(row)

})

}

function generateInsights(results){

const box=document.getElementById("insightBox")

let insights=[]

results.forEach((r,i)=>{

if(r.sla<80){

insights.push("Interval "+(i+1)+" SLA risk ("+r.sla.toFixed(1)+"%).")

}

if(r.occ>95){

insights.push("Interval "+(i+1)+" occupancy extremely high.")

}

})

if(insights.length===0){

box.innerHTML="System operating within safe limits."

}else{

box.innerHTML=insights.join("<br><br>")

}

}

function optimizeStaffing(){

alert("Staffing optimizer placeholder — adjust agents in risk intervals.")

}

function reforecast(){

const volume=parseCSV(document.getElementById("volumeInput").value)

const progress=prompt("Day progress %")

if(!progress) return

const p=progress/100

const callsSoFar=Math.round(volume.reduce((a,b)=>a+b)*p)

const projected=Math.round(callsSoFar/p)

alert("Projected EOD volume: "+projected)

}

function runMonteCarlo(){

alert("Monte Carlo simulation placeholder.")

}
