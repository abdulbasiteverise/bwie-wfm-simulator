// ============================================================================
// WORKFORCE MODELS & SIMULATION ENGINE
// ============================================================================

class WorkforceModels {
    // Erlang C - Baseline
    static erlangC(calls, aht, agents, interval = 30) {
        const lambda = calls / (interval * 60);
        const mu = 1 / aht;
        const rho = lambda / mu;
        const erlangB = this.erlangB(rho, agents);
        const pw = (agents * erlangB) / (agents - rho * (1 - erlangB));
        const asa = pw / (agents * mu - lambda);
        const occupancy = rho / agents;
        
        return {
            sla: this.calculateSLA(pw, lambda, agents, mu, 20),
            asa: Math.max(0, asa),
            occupancy: Math.min(1, occupancy),
            probabilityOfWait: pw,
            utilization: rho / agents
        };
    }

    // Erlang A - With abandonment
    static erlangA(calls, aht, agents, avgPatience, interval = 30) {
        const lambda = calls / (interval * 60);
        const mu = 1 / aht;
        const theta = 1 / avgPatience;
        const rho = lambda / mu;
        
        const erlangC = this.erlangC(calls, aht, agents, interval);
        const abandonRate = erlangC.probabilityOfWait * (theta / (mu + theta));
        const effectiveSLA = erlangC.sla * (1 - abandonRate);
        
        return {
            sla: effectiveSLA,
            asa: erlangC.asa * (1 - abandonRate * 0.5),
            abandonPercent: abandonRate * 100,
            occupancy: erlangC.occupancy,
            requiredAgents: agents
        };
    }

    static erlangB(traffic, servers) {
        let invB = 1.0;
        for (let i = 1; i <= servers; i++) {
            invB = 1.0 + invB * i / traffic;
        }
        return 1.0 / invB;
    }

    static calculateSLA(pw, lambda, agents, mu, threshold) {
        const asa = pw / (agents * mu - lambda);
        return Math.max(0, Math.min(1, 1 - pw * Math.exp(-(agents * mu - lambda) * threshold)));
    }

    // Square-Root Staffing
    static squareRootStaffing(calls, aht, targetSLA = 0.8, interval = 30) {
        const lambda = calls / (interval * 60);
        const mu = 1 / aht;
        const load = lambda / mu;
        const beta = targetSLA >= 0.9 ? 3 : targetSLA >= 0.8 ? 2 : 1.5;
        const staff = Math.ceil(load + beta * Math.sqrt(load));
        
        return {
            recommendedStaff: staff,
            load: load,
            safetyBuffer: staff - load
        };
    }
}

// ============================================================================
// DISCRETE EVENT SIMULATION ENGINE
// ============================================================================

class CallCenterSimulation {
    constructor(config) {
        this.config = config;
        this.events = [];
        this.queue = [];
        this.agents = [];
        this.metrics = {
            totalCalls: 0,
            answered: 0,
            abandoned: 0,
            totalWaitTime: 0,
            totalHandleTime: 0,
            maxQueueLength: 0,
            intervalMetrics: []
        };
        this.skillMetrics = {};
    }

    initializeAgents(intervals) {
        const { skillConfig, shrinkage } = this.config;
        this.agents = [];
        let agentId = 0;
        
        const maxAgentsNeeded = Math.max(...intervals.map(i => i.agents || 0));
        const totalSkillAgents = skillConfig.reduce((sum, s) => sum + s.agents, 0);
        
        skillConfig.forEach(skillGroup => {
            const skillProportion = skillGroup.agents / totalSkillAgents;
            const agentsForSkill = Math.ceil(maxAgentsNeeded * skillProportion);
            
            for (let i = 0; i < agentsForSkill; i++) {
                this.agents.push({
                    id: agentId++,
                    available: true,
                    onShift: true,
                    currentCall: null,
                    skills: [skillGroup.name],
                    totalHandledCalls: 0,
                    totalTalkTime: 0,
                    availabilitySchedule: this.generateAgentSchedule(shrinkage)
                });
            }
        });
        
        skillConfig.forEach(skill => {
            this.skillMetrics[skill.name] = {
                totalCalls: 0,
                answered: 0,
                abandoned: 0,
                totalWaitTime: 0,
                totalHandleTime: 0,
                maxQueueLength: 0
            };
        });
    }

    generateAgentSchedule(shrinkagePercent) {
        const schedule = [];
        const minutesInDay = 480;
        const shrinkageMinutes = Math.floor(minutesInDay * shrinkagePercent / 100);
        
        const shrinkageBlocks = [];
        let remainingShrinkage = shrinkageMinutes;
        
        while (remainingShrinkage > 0) {
            const blockSize = Math.min(15, remainingShrinkage);
            const startTime = Math.floor(Math.random() * (minutesInDay - blockSize));
            shrinkageBlocks.push({ start: startTime, end: startTime + blockSize });
            remainingShrinkage -= blockSize;
        }
        
        return shrinkageBlocks;
    }

    generateCallArrivals(intervals) {
        const events = [];
        let callId = 0;
        const { skillDistribution } = this.config;
        
        intervals.forEach((interval, idx) => {
            const intervalStart = idx * 15 * 60;
            const callsInInterval = interval.calls;
            
            for (let i = 0; i < callsInInterval; i++) {
                const arrivalTime = intervalStart + Math.random() * 15 * 60;
                const aht = this.randomNormal(interval.aht, interval.aht * 0.2);
                const patience = this.randomExponential(interval.patience || 120);
                
                const skillRand = Math.random() * 100;
                let cumulativePercent = 0;
                let assignedSkill = skillDistribution[0]?.name || 'General';
                
                for (const skill of skillDistribution) {
                    cumulativePercent += skill.percentage;
                    if (skillRand <= cumulativePercent) {
                        assignedSkill = skill.name;
                        break;
                    }
                }
                
                events.push({
                    type: 'CALL_ARRIVAL',
                    time: arrivalTime,
                    callId: callId++,
                    aht: Math.max(30, aht),
                    patience: Math.max(10, patience),
                    skill: assignedSkill,
                    retry: false
                });
            }
        });
        
        return events.sort((a, b) => a.time - b.time);
    }

    randomNormal(mean, stdDev) {
        const u1 = Math.random();
        const u2 = Math.random();
        const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return mean + z0 * stdDev;
    }

    randomExponential(mean) {
        return -Math.log(1 - Math.random()) * mean;
    }

    simulate(intervals) {
        this.initializeAgents(intervals);
        this.events = this.generateCallArrivals(intervals);
        
        let currentTime = 0;
        const endTime = intervals.length * 15 * 60;
        
        while (currentTime < endTime || this.events.length > 0 || this.queue.length > 0) {
            if (this.events.length > 0 && this.events[0].time <= currentTime) {
                const event = this.events.shift();
                this.processEvent(event, currentTime);
            }
            
            this.updateAgentStaffing(currentTime, intervals);
            this.updateQueueAndAgents(currentTime);
            
            currentTime += 1;
            
            if (currentTime % (15 * 60) === 0) {
                this.captureIntervalMetrics(currentTime, intervals);
            }
        }
        
        return {
            global: this.metrics,
            bySkill: this.skillMetrics
        };
    }

    updateAgentStaffing(currentTime, intervals) {
        const currentInterval = Math.floor(currentTime / (15 * 60));
        const intervalData = intervals[currentInterval];
        
        if (!intervalData) return;
        
        const targetAgents = intervalData.agents;
        
        this.agents.forEach((agent, idx) => {
            if (idx >= targetAgents) {
                if (!agent.currentCall) {
                    agent.available = false;
                    agent.onShift = false;
                }
            } else {
                agent.onShift = true;
            }
        });
    }

    processEvent(event, currentTime) {
        if (event.type === 'CALL_ARRIVAL') {
            this.metrics.totalCalls++;
            
            if (!this.skillMetrics[event.skill]) {
                this.skillMetrics[event.skill] = {
                    totalCalls: 0,
                    answered: 0,
                    abandoned: 0,
                    totalWaitTime: 0,
                    totalHandleTime: 0,
                    maxQueueLength: 0
                };
            }
            this.skillMetrics[event.skill].totalCalls++;
            
            this.queue.push({
                ...event,
                queueEntryTime: currentTime,
                abandonTime: currentTime + event.patience
            });
            
            this.metrics.maxQueueLength = Math.max(this.metrics.maxQueueLength, this.queue.length);
        }
    }

    updateQueueAndAgents(currentTime) {
        this.queue = this.queue.filter(call => {
            if (currentTime >= call.abandonTime) {
                this.metrics.abandoned++;
                if (this.skillMetrics[call.skill]) {
                    this.skillMetrics[call.skill].abandoned++;
                }
                
                if (Math.random() < 0.3 && !call.retry) {
                    const retryDelay = 300 + Math.random() * 300;
                    this.events.push({
                        ...call,
                        type: 'CALL_ARRIVAL',
                        time: currentTime + retryDelay,
                        retry: true
                    });
                }
                return false;
            }
            return true;
        });

        this.agents.forEach(agent => {
            const minuteOfDay = Math.floor(currentTime / 60);
            const onBreak = agent.availabilitySchedule.some(
                block => minuteOfDay >= block.start && minuteOfDay < block.end
            );
            
            if (!agent.onShift || onBreak) {
                if (agent.currentCall === null) {
                    agent.available = false;
                }
            } else if (agent.currentCall === null) {
                agent.available = true;
            }
            
            if (agent.currentCall && currentTime >= agent.currentCall.endTime) {
                this.metrics.answered++;
                this.metrics.totalHandleTime += agent.currentCall.aht;
                
                const skill = agent.currentCall.skill;
                if (this.skillMetrics[skill]) {
                    this.skillMetrics[skill].answered++;
                    this.skillMetrics[skill].totalHandleTime += agent.currentCall.aht;
                }
                
                agent.currentCall = null;
                agent.available = agent.onShift && !onBreak;
            }
        });

        while (this.queue.length > 0) {
            const call = this.queue[0];
            const availableAgent = this.agents.find(
                a => a.available && a.onShift && a.skills.includes(call.skill)
            );
            
            if (!availableAgent) break;
            
            const assignedCall = this.queue.shift();
            const waitTime = currentTime - assignedCall.queueEntryTime;
            this.metrics.totalWaitTime += waitTime;
            
            if (this.skillMetrics[assignedCall.skill]) {
                this.skillMetrics[assignedCall.skill].totalWaitTime += waitTime;
            }
            
            availableAgent.available = false;
            availableAgent.currentCall = {
                ...assignedCall,
                endTime: currentTime + assignedCall.aht
            };
            availableAgent.totalHandledCalls++;
            availableAgent.totalTalkTime += assignedCall.aht;
        }
    }

    captureIntervalMetrics(currentTime, intervals) {
        const intervalIndex = Math.floor(currentTime / (15 * 60));
        const interval = intervals[intervalIndex] || {};
        
        const onShiftAgents = this.agents.filter(a => a.onShift);
        const busyAgents = onShiftAgents.filter(a => a.currentCall !== null).length;
        const availableAgents = onShiftAgents.filter(a => a.available).length;
        const totalAgents = onShiftAgents.length;
        
        this.metrics.intervalMetrics.push({
            interval: intervalIndex,
            time: `${Math.floor(intervalIndex / 4) + 8}:${((intervalIndex % 4) * 15).toString().padStart(2, '0')}`,
            queueLength: this.queue.length,
            busyAgents,
            availableAgents,
            totalAgents,
            occupancy: totalAgents > 0 ? busyAgents / totalAgents : 0,
            calls: interval.calls || 0
        });
    }
}

// ============================================================================
// APPLICATION STATE & UI
// ============================================================================

const AppState = {
    activeModel: 'simulation',
    forecastData: { intervals: [], shrinkage: 15, targetSLA: 80, slaThreshold: 20 },
    skills: [
        { id: 1, name: 'General', agents: 15, callPercentage: 60 },
        { id: 2, name: 'Technical', agents: 7, callPercentage: 25 },
        { id: 3, name: 'Billing', agents: 3, callPercentage: 15 }
    ],
    nextSkillId: 4,
    results: null,
    simulationMetrics: null,
    skillMetrics: null,
    charts: {}
};

// Parse inputs
function parseInputs() {
    const volumeInput = document.getElementById('volumeInput').value;
    const ahtInput = document.getElementById('ahtInput').value;
    const patienceInput = document.getElementById('patienceInput').value;
    const staffingInput = document.getElementById('staffingInput').value;
    const shrinkage = document.getElementById('shrinkageInput').value;
    const targetSLA = document.getElementById('targetSLAInput').value;
    const slaThreshold = document.getElementById('slaThresholdInput').value;
    
    const volumeArray = volumeInput.split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v) && v >= 0);
    const staffingArray = staffingInput.split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v) && v >= 0);
    
    if (volumeArray.length === 0 || staffingArray.length === 0) return;
    
    const aht = parseFloat(ahtInput) || 240;
    const patience = parseFloat(patienceInput) || 120;
    const maxLength = Math.max(volumeArray.length, staffingArray.length);
    
    const intervals = Array.from({ length: maxLength }, (_, i) => ({
        time: `${Math.floor(i / 4) + 8}:${((i % 4) * 15).toString().padStart(2, '0')}`,
        calls: volumeArray[i] || volumeArray[volumeArray.length - 1] || 0,
        agents: staffingArray[i] || staffingArray[staffingArray.length - 1] || 0,
        aht: aht,
        patience: patience,
        skill: 'general'
    }));
    
    AppState.forecastData = {
        intervals,
        shrinkage: parseFloat(shrinkage) || 15,
        targetSLA: parseFloat(targetSLA) || 80,
        slaThreshold: parseFloat(slaThreshold) || 20
    };
    
    updateInputDisplays();
}

function updateInputDisplays() {
    const volumeInput = document.getElementById('volumeInput').value;
    const staffingInput = document.getElementById('staffingInput').value;
    const ahtInput = parseFloat(document.getElementById('ahtInput').value) || 240;
    const patienceInput = parseFloat(document.getElementById('patienceInput').value) || 120;
    
    const volumeIntervals = volumeInput.split(',').filter(v => v.trim()).length;
    const totalCalls = volumeInput.split(',').reduce((sum, v) => sum + (parseInt(v.trim()) || 0), 0);
    
    document.getElementById('volumeIntervals').textContent = `${volumeIntervals} intervals`;
    document.getElementById('totalCalls').textContent = `${totalCalls.toLocaleString()} total calls`;
    
    const staffingIntervals = staffingInput.split(',').filter(v => v.trim()).length;
    const avgStaffing = staffingInput.split(',').reduce((sum, v) => sum + (parseInt(v.trim()) || 0), 0) / Math.max(1, staffingIntervals);
    
    document.getElementById('staffingIntervals').textContent = `${staffingIntervals} intervals`;
    document.getElementById('avgStaffing').textContent = `Avg: ${avgStaffing.toFixed(1)} agents`;
    
    document.getElementById('ahtDisplay').textContent = `${Math.floor(ahtInput / 60)}min ${ahtInput % 60}sec`;
    document.getElementById('patienceDisplay').textContent = `${Math.floor(patienceInput / 60)}min ${patienceInput % 60}sec`;
}

// Calculate results
function calculateResults() {
    if (AppState.forecastData.intervals.length === 0) return;
    
    const intervals = AppState.forecastData.intervals;
    let intervalResults = [];
    
    if (AppState.activeModel === 'simulation') {
        const sim = new CallCenterSimulation({
            skillConfig: AppState.skills.map(s => ({
                name: s.name,
                agents: parseInt(s.agents) || 0
            })),
            skillDistribution: AppState.skills.map(s => ({
                name: s.name,
                percentage: parseFloat(s.callPercentage) || 0
            })),
            shrinkage: AppState.forecastData.shrinkage
        });
        
        const simResults = sim.simulate(intervals);
        AppState.simulationMetrics = simResults.global;
        AppState.skillMetrics = simResults.bySkill;
        
        intervalResults = simResults.global.intervalMetrics.map(metric => {
            const answered = simResults.global.answered / intervals.length;
            const avgWait = simResults.global.totalWaitTime / Math.max(1, simResults.global.answered);
            const sla = answered > 0 ? ((answered - (avgWait > AppState.forecastData.slaThreshold ? answered * 0.2 : 0)) / answered) * 100 : 0;
            
            return {
                interval: metric.interval,
                time: metric.time,
                calls: metric.calls,
                requiredAgents: Math.ceil(metric.occupancy * metric.totalAgents / 0.85),
                scheduledAgents: metric.totalAgents,
                gap: metric.totalAgents - Math.ceil(metric.occupancy * metric.totalAgents / 0.85),
                sla: Math.max(0, Math.min(100, sla)),
                asa: avgWait,
                occupancy: metric.occupancy * 100,
                abandon: (simResults.global.abandoned / simResults.global.totalCalls) * 100,
                queueLength: metric.queueLength
            };
        });
    } else if (AppState.activeModel === 'erlang-c') {
        intervalResults = intervals.map((interval, idx) => {
            const result = WorkforceModels.erlangC(interval.calls, interval.aht, interval.agents, 15);
            return {
                interval: idx,
                time: interval.time,
                calls: interval.calls,
                requiredAgents: interval.agents,
                scheduledAgents: interval.agents,
                gap: 0,
                sla: result.sla * 100,
                asa: result.asa,
                occupancy: result.occupancy * 100,
                abandon: 0
            };
        });
    } else if (AppState.activeModel === 'erlang-a') {
        intervalResults = intervals.map((interval, idx) => {
            const result = WorkforceModels.erlangA(interval.calls, interval.aht, interval.agents, interval.patience, 15);
            return {
                interval: idx,
                time: interval.time,
                calls: interval.calls,
                requiredAgents: interval.agents,
                scheduledAgents: interval.agents,
                gap: 0,
                sla: result.sla * 100,
                asa: result.asa,
                occupancy: result.occupancy * 100,
                abandon: result.abandonPercent
            };
        });
    } else if (AppState.activeModel === 'square-root') {
        intervalResults = intervals.map((interval, idx) => {
            const result = WorkforceModels.squareRootStaffing(interval.calls, interval.aht, AppState.forecastData.targetSLA / 100, 15);
            const erlangCheck = WorkforceModels.erlangA(interval.calls, interval.aht, result.recommendedStaff, interval.patience, 15);
            return {
                interval: idx,
                time: interval.time,
                calls: interval.calls,
                requiredAgents: result.recommendedStaff,
                scheduledAgents: interval.agents,
                gap: interval.agents - result.recommendedStaff,
                sla: erlangCheck.sla * 100,
                asa: erlangCheck.asa,
                occupancy: erlangCheck.occupancy * 100,
                abandon: erlangCheck.abandonPercent
            };
        });
    }
    
    const totalCalls = intervals.reduce((sum, i) => sum + i.calls, 0);
    const avgSLA = intervalResults.reduce((sum, i) => sum + i.sla, 0) / intervalResults.length;
    const avgASA = intervalResults.reduce((sum, i) => sum + i.asa, 0) / intervalResults.length;
    const avgOccupancy = intervalResults.reduce((sum, i) => sum + i.occupancy, 0) / intervalResults.length;
    
    AppState.results = {
        intervalResults,
        summary: {
            totalCalls,
            avgSLA,
            avgASA,
            avgOccupancy,
            totalAbandons: AppState.simulationMetrics ? AppState.simulationMetrics.abandoned : 0
        }
    };
    
    updateUI();
}

// Update UI
function updateUI() {
    updateMetricsOverview();
    updateCharts();
    updateIntervalResults();
    updateSimulationStats();
    updateSkillMetrics();
}

function updateMetricsOverview() {
    if (!AppState.results) return;
    
    const metrics = [
        { label: 'Total Calls', value: AppState.forecastData.intervals.reduce((sum, i) => sum + i.calls, 0), color: 'sky' },
        { label: 'Avg SLA', value: `${AppState.results.summary.avgSLA.toFixed(1)}%`, color: AppState.results.summary.avgSLA >= 80 ? 'emerald' : 'red' },
        { label: 'Avg ASA', value: `${AppState.results.summary.avgASA.toFixed(0)}s`, color: 'amber' },
        { label: 'Occupancy', value: `${AppState.results.summary.avgOccupancy.toFixed(1)}%`, color: 'purple' },
        { label: 'Abandons', value: AppState.simulationMetrics?.abandoned || Math.floor(AppState.results.summary.totalAbandons), color: 'red' },
        { label: 'Intervals', value: AppState.forecastData.intervals.length, color: 'cyan' }
    ];
    
    const html = metrics.map(m => `
        <div class="metric-card">
            <div class="metric-header">
                <div class="metric-value text-${m.color}">${m.value}</div>
            </div>
            <div class="metric-label">${m.label}</div>
        </div>
    `).join('');
    
    document.getElementById('metricsOverview').innerHTML = html;
}

function updateCharts() {
    if (!AppState.results) return;
    
    // Volume & Staffing Chart
    updateVolumeChart();
    updateSLAChart();
    
    if (AppState.activeModel === 'simulation') {
        document.getElementById('queueChartCard').style.display = 'block';
        document.getElementById('skillChartCard').style.display = 'block';
        updateQueueChart();
        updateSkillChart();
    } else {
        document.getElementById('queueChartCard').style.display = 'none';
        document.getElementById('skillChartCard').style.display = 'none';
    }
}

function updateVolumeChart() {
    const ctx = document.getElementById('volumeChart').getContext('2d');
    
    if (AppState.charts.volume) {
        AppState.charts.volume.destroy();
    }
    
    AppState.charts.volume = new Chart(ctx, {
        type: 'line',
        data: {
            labels: AppState.results.intervalResults.map(r => r.time),
            datasets: [
                {
                    label: 'Call Volume',
                    data: AppState.results.intervalResults.map(r => r.calls),
                    borderColor: '#0ea5e9',
                    backgroundColor: 'rgba(14, 165, 233, 0.1)',
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Scheduled Agents',
                    data: AppState.results.intervalResults.map(r => r.scheduledAgents),
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: true,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#cbd5e1', font: { size: 11 } } }
            },
            scales: {
                x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(51, 65, 85, 0.3)' } },
                y: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(51, 65, 85, 0.3)' } }
            }
        }
    });
}

function updateSLAChart() {
    const ctx = document.getElementById('slaChart').getContext('2d');
    
    if (AppState.charts.sla) {
        AppState.charts.sla.destroy();
    }
    
    AppState.charts.sla = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: AppState.results.intervalResults.map(r => r.time),
            datasets: [{
                label: 'SLA %',
                data: AppState.results.intervalResults.map(r => r.sla),
                backgroundColor: AppState.results.intervalResults.map(r => 
                    r.sla >= 80 ? '#10b981' : r.sla >= 60 ? '#f59e0b' : '#ef4444'
                )
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#cbd5e1', font: { size: 11 } } }
            },
            scales: {
                x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(51, 65, 85, 0.3)' } },
                y: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(51, 65, 85, 0.3)' } }
            }
        }
    });
}

function updateQueueChart() {
    const ctx = document.getElementById('queueChart').getContext('2d');
    
    if (AppState.charts.queue) {
        AppState.charts.queue.destroy();
    }
    
    AppState.charts.queue = new Chart(ctx, {
        type: 'line',
        data: {
            labels: AppState.results.intervalResults.map(r => r.time),
            datasets: [
                {
                    label: 'Queue Length',
                    data: AppState.results.intervalResults.map(r => r.queueLength || 0),
                    borderColor: '#a855f7',
                    yAxisID: 'y'
                },
                {
                    label: 'Occupancy %',
                    data: AppState.results.intervalResults.map(r => r.occupancy),
                    borderColor: '#f59e0b',
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#cbd5e1', font: { size: 11 } } }
            },
            scales: {
                x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(51, 65, 85, 0.3)' } },
                y: { position: 'left', ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(51, 65, 85, 0.3)' } },
                y1: { position: 'right', ticks: { color: '#64748b', font: { size: 10 } }, grid: { display: false } }
            }
        }
    });
}

function updateSkillChart() {
    if (!AppState.skillMetrics) return;
    
    const ctx = document.getElementById('skillChart').getContext('2d');
    
    if (AppState.charts.skill) {
        AppState.charts.skill.destroy();
    }
    
    const skillData = Object.entries(AppState.skillMetrics).map(([name, m]) => ({
        name,
        calls: m.totalCalls,
        answered: m.answered,
        abandoned: m.abandoned
    }));
    
    AppState.charts.skill = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: skillData.map(d => d.name),
            datasets: [
                { label: 'Total Calls', data: skillData.map(d => d.calls), backgroundColor: '#0ea5e9' },
                { label: 'Answered', data: skillData.map(d => d.answered), backgroundColor: '#10b981' },
                { label: 'Abandoned', data: skillData.map(d => d.abandoned), backgroundColor: '#ef4444' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#cbd5e1', font: { size: 11 } } }
            },
            scales: {
                x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(51, 65, 85, 0.3)' } },
                y: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(51, 65, 85, 0.3)' } }
            }
        }
    });
}

function updateIntervalResults() {
    if (!AppState.results) return;
    
    const html = AppState.results.intervalResults.map(interval => {
        const slaClass = interval.sla >= 80 ? 'good' : interval.sla >= 60 ? 'medium' : 'bad';
        const gapColor = interval.gap > 0 ? 'text-emerald' : 'text-red';
        
        return `
            <div class="interval-item">
                <div class="interval-header">
                    <span class="interval-time">${interval.time}</span>
                    <span class="interval-sla ${slaClass}">${interval.sla.toFixed(0)}% SLA</span>
                </div>
                <div class="interval-metrics">
                    <div>
                        <span class="interval-metric-label">Calls:</span>
                        <span class="interval-metric-value">${interval.calls}</span>
                    </div>
                    <div>
                        <span class="interval-metric-label">ASA:</span>
                        <span class="interval-metric-value">${interval.asa.toFixed(0)}s</span>
                    </div>
                    <div>
                        <span class="interval-metric-label">Req:</span>
                        <span class="interval-metric-value text-sky">${interval.requiredAgents}</span>
                    </div>
                    <div>
                        <span class="interval-metric-label">Gap:</span>
                        <span class="interval-metric-value ${gapColor}">${interval.gap > 0 ? '+' : ''}${interval.gap}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    document.getElementById('intervalResults').innerHTML = html;
}

function updateSimulationStats() {
    if (!AppState.simulationMetrics || AppState.activeModel !== 'simulation') {
        document.getElementById('simStatsCard').style.display = 'none';
        return;
    }
    
    document.getElementById('simStatsCard').style.display = 'block';
    
    const html = `
        <div class="stat-row">
            <span class="stat-label">Total Calls</span>
            <span class="stat-value">${AppState.simulationMetrics.totalCalls}</span>
        </div>
        <div class="stat-row">
            <span class="stat-label">Answered</span>
            <span class="stat-value text-emerald">${AppState.simulationMetrics.answered}</span>
        </div>
        <div class="stat-row">
            <span class="stat-label">Abandoned</span>
            <span class="stat-value text-red">${AppState.simulationMetrics.abandoned}</span>
        </div>
        <div class="stat-row">
            <span class="stat-label">Max Queue</span>
            <span class="stat-value text-purple">${AppState.simulationMetrics.maxQueueLength}</span>
        </div>
    `;
    
    document.getElementById('simStats').innerHTML = html;
}

function updateSkillMetrics() {
    if (!AppState.skillMetrics || AppState.activeModel !== 'simulation') {
        document.getElementById('skillMetricsCard').style.display = 'none';
        return;
    }
    
    document.getElementById('skillMetricsCard').style.display = 'block';
    
    const html = Object.entries(AppState.skillMetrics).map(([skillName, metrics]) => {
        const asa = metrics.answered > 0 ? (metrics.totalWaitTime / metrics.answered).toFixed(0) : 0;
        const abandonRate = metrics.totalCalls > 0 ? ((metrics.abandoned / metrics.totalCalls) * 100).toFixed(1) : 0;
        
        return `
            <div class="skill-metric-item">
                <div class="skill-metric-name">${skillName}</div>
                <div class="skill-metric-grid">
                    <div>
                        <span class="interval-metric-label">Calls:</span>
                        <span class="interval-metric-value">${metrics.totalCalls}</span>
                    </div>
                    <div>
                        <span class="interval-metric-label">Answered:</span>
                        <span class="interval-metric-value text-emerald">${metrics.answered}</span>
                    </div>
                    <div>
                        <span class="interval-metric-label">ASA:</span>
                        <span class="interval-metric-value text-amber">${asa}s</span>
                    </div>
                    <div>
                        <span class="interval-metric-label">Abandon:</span>
                        <span class="interval-metric-value text-red">${abandonRate}%</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    document.getElementById('skillMetrics').innerHTML = html;
}

// Skills management
function renderSkills() {
    const html = AppState.skills.map(skill => `
        <div class="skill-item">
            <div class="skill-header">
                <input 
                    type="text" 
                    class="skill-name-input" 
                    value="${skill.name}"
                    data-skill-id="${skill.id}"
                    data-field="name"
                />
                ${AppState.skills.length > 1 ? `
                    <button class="btn-remove-skill" data-skill-id="${skill.id}">✕</button>
                ` : ''}
            </div>
            <div class="skill-inputs">
                <div class="skill-input-group">
                    <label class="skill-input-label">Agents</label>
                    <input 
                        type="number" 
                        class="skill-input" 
                        value="${skill.agents}"
                        data-skill-id="${skill.id}"
                        data-field="agents"
                        min="0"
                    />
                </div>
                <div class="skill-input-group">
                    <label class="skill-input-label">Call %</label>
                    <input 
                        type="number" 
                        class="skill-input" 
                        value="${skill.callPercentage}"
                        data-skill-id="${skill.id}"
                        data-field="callPercentage"
                        min="0"
                        max="100"
                        step="0.1"
                    />
                </div>
            </div>
        </div>
    `).join('');
    
    document.getElementById('skillsList').innerHTML = html;
    
    // Update validation
    const totalPercentage = AppState.skills.reduce((sum, s) => sum + parseFloat(s.callPercentage || 0), 0);
    const isValid = Math.abs(totalPercentage - 100) < 0.01;
    
    const validationHtml = `
        <div class="skill-validation-row">
            <span>Total Call %:</span>
            <span class="font-mono font-semibold">${totalPercentage.toFixed(1)}%</span>
        </div>
        ${!isValid ? '<div class="skill-validation-msg">Must equal 100%</div>' : ''}
    `;
    
    const validationEl = document.getElementById('skillValidation');
    validationEl.innerHTML = validationHtml;
    validationEl.className = `skill-validation ${isValid ? 'valid' : 'invalid'}`;
    
    // Update warning
    const warningEl = document.getElementById('skillWarning');
    if (!isValid) {
        warningEl.style.display = 'flex';
        document.getElementById('skillWarningText').textContent = `Total call percentage must equal 100%. Currently at ${totalPercentage.toFixed(1)}%`;
    } else {
        warningEl.style.display = 'none';
    }
    
    // Update total agents
    const totalAgents = AppState.skills.reduce((sum, s) => sum + (parseInt(s.agents) || 0), 0);
    document.getElementById('totalAgentsDisplay').textContent = `Total Agents: ${totalAgents}`;
    
    // Attach event listeners
    document.querySelectorAll('.skill-name-input, .skill-input').forEach(input => {
        input.addEventListener('input', handleSkillUpdate);
    });
    
    document.querySelectorAll('.btn-remove-skill').forEach(btn => {
        btn.addEventListener('click', handleRemoveSkill);
    });
}

function handleSkillUpdate(e) {
    const skillId = parseInt(e.target.dataset.skillId);
    const field = e.target.dataset.field;
    const value = field === 'name' ? e.target.value : (field === 'agents' ? parseInt(e.target.value) : parseFloat(e.target.value));
    
    const skill = AppState.skills.find(s => s.id === skillId);
    if (skill) {
        skill[field] = value;
        renderSkills();
        parseInputs();
        calculateResults();
    }
}

function handleRemoveSkill(e) {
    const skillId = parseInt(e.target.dataset.skillId);
    if (AppState.skills.length > 1) {
        AppState.skills = AppState.skills.filter(s => s.id !== skillId);
        renderSkills();
        parseInputs();
        calculateResults();
    }
}

function addSkill() {
    AppState.skills.push({
        id: AppState.nextSkillId++,
        name: `Skill ${AppState.nextSkillId}`,
        agents: 5,
        callPercentage: 0
    });
    renderSkills();
}

// Model selection
function selectModel(modelId) {
    AppState.activeModel = modelId;
    
    const modelNames = {
        'erlang-c': 'Erlang C',
        'erlang-a': 'Erlang A',
        'square-root': 'Square Root',
        'simulation': 'DES Engine'
    };
    
    document.getElementById('activeModelName').textContent = modelNames[modelId];
    
    document.querySelectorAll('.model-btn').forEach(btn => {
        btn.classList.remove('active', 'highlight');
        if (btn.dataset.model === modelId) {
            btn.classList.add('active');
            if (modelId === 'simulation') {
                btn.classList.add('highlight');
            }
        }
    });
    
    calculateResults();
}

// Intraday reforecast
function runIntradayReforecast() {
    const btn = document.getElementById('reforecastBtn');
    btn.classList.add('active');
    
    const volumeInput = document.getElementById('volumeInput');
    const volumes = volumeInput.value.split(',').map(v => parseInt(v.trim()));
    const adjustedVolumes = volumes.map(v => Math.max(0, Math.floor(v * (0.9 + Math.random() * 0.2))));
    volumeInput.value = adjustedVolumes.join(',');
    
    parseInputs();
    calculateResults();
    
    setTimeout(() => {
        btn.classList.remove('active');
    }, 2000);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Attach event listeners
    document.getElementById('volumeInput').addEventListener('input', () => { parseInputs(); calculateResults(); });
    document.getElementById('ahtInput').addEventListener('input', () => { parseInputs(); calculateResults(); });
    document.getElementById('patienceInput').addEventListener('input', () => { parseInputs(); calculateResults(); });
    document.getElementById('staffingInput').addEventListener('input', () => { parseInputs(); calculateResults(); });
    document.getElementById('shrinkageInput').addEventListener('input', () => { parseInputs(); calculateResults(); });
    document.getElementById('targetSLAInput').addEventListener('input', () => { parseInputs(); calculateResults(); });
    document.getElementById('slaThresholdInput').addEventListener('input', () => { parseInputs(); calculateResults(); });
    
    document.getElementById('addSkillBtn').addEventListener('click', addSkill);
    document.getElementById('reforecastBtn').addEventListener('click', runIntradayReforecast);
    
    document.querySelectorAll('.model-btn').forEach(btn => {
        btn.addEventListener('click', () => selectModel(btn.dataset.model));
    });
    
    // Initial render
    renderSkills();
    parseInputs();
    calculateResults();
});
