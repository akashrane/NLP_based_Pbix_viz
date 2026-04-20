import * as d3 from "d3";
import { FieldMeta } from "../nlp/types";
import powerbi from "powerbi-visuals-api";

export function renderLineChart(container: HTMLElement, dataView: powerbi.DataView, xField: FieldMeta, yField: FieldMeta) {
    while (container.firstChild) container.removeChild(container.firstChild);

    const data: { key: string, value: number }[] = [];
    
    let cat = dataView.categorical.categories?.find(c => c.source.queryName === xField?.queryName);
    let msr = dataView.categorical.values?.find(v => v.source.queryName === yField?.queryName);
    
    if (!cat && dataView.categorical.categories) cat = dataView.categorical.categories[0];
    if (!msr && dataView.categorical.values) msr = dataView.categorical.values[0];

    if (!cat?.values || !msr?.values) {
        const err = document.createElement("p");
        err.textContent = "Data missing for line chart.";
        container.appendChild(err);
        return;
    }
    
    const map = new Map<string, number[]>();
    for (let i = 0; i < cat.values.length; i++) {
        const xVal = String(cat.values[i] || "");
        const yVal = Number(msr.values[i]);
        if (!isNaN(yVal)) {
            if (!map.has(xVal)) map.set(xVal, []);
            map.get(xVal)?.push(yVal);
        }
    }
    
    for (const [key, yVals] of map.entries()) {
        const avg = yVals.reduce((a, b) => a + b, 0) / yVals.length;
        data.push({ key, value: avg });
    }
    
    data.sort((a,b) => a.key.localeCompare(b.key));

    const margin = { top: 20, right: 20, bottom: 80, left: 60 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = container.clientHeight - margin.top - margin.bottom;

    const svg = d3.select(container)
        .append("svg")
        .attr("width", container.clientWidth)
        .attr("height", container.clientHeight)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scalePoint()
        .domain(data.map(d => d.key))
        .range([0, width])
        .padding(0.5);

    const y = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.value) || 0]).nice()
        .range([height, 0]);

    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x))
        .selectAll("text")
        .attr("transform", "translate(-10,0)rotate(-45)")
        .style("text-anchor", "end");

    svg.append("g").call(d3.axisLeft(y));

    const line = d3.line<{key:string, value:number}>()
        .x(d => x(d.key) || 0)
        .y(d => y(d.value));

    svg.append("path")
        .datum(data)
        .attr("fill", "none")
        .attr("stroke", "#0078d4")
        .attr("stroke-width", 2)
        .attr("d", line);
}
