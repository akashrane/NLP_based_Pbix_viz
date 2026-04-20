import * as d3 from "d3";
import { FieldMeta } from "../nlp/types";
import powerbi from "powerbi-visuals-api";

export function renderPieChart(container: HTMLElement, dataView: powerbi.DataView, xField: FieldMeta, yField: FieldMeta) {
    while (container.firstChild) container.removeChild(container.firstChild);

    let cat = dataView.categorical.categories?.find(c => c.source.queryName === xField?.queryName);
    let msr = dataView.categorical.values?.find(v => v.source.queryName === yField?.queryName);
    if (!cat && dataView.categorical.categories) cat = dataView.categorical.categories[0];
    if (!msr && dataView.categorical.values) msr = dataView.categorical.values[0];

    if (!cat?.values || !msr?.values) {
        const err = document.createElement("p");
        err.textContent = "Data missing for pie chart.";
        container.appendChild(err);
        return;
    }

    const data: Record<string, number> = {};
    for (let i = 0; i < cat.values.length; i++) {
        const xVal = String(cat.values[i]);
        const yVal = Number(msr.values[i]);
        if (!isNaN(yVal)) {
            data[xVal] = (data[xVal] || 0) + yVal;
        }
    }

    const margin = 20;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const radius = Math.min(width, height) / 2 - margin;

    const svg = d3.select(container)
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .append("g")
        .attr("transform", `translate(${width / 2},${height / 2})`);

    const color = d3.scaleOrdinal()
        .domain(Object.keys(data))
        .range(d3.schemeTableau10);

    const pie = d3.pie<any>().value(d => d[1]);
    const dataReady = pie(Object.entries(data));

    const arc = d3.arc<d3.PieArcDatum<any>>()
        .innerRadius(0)
        .outerRadius(radius);

    svg.selectAll('path')
        .data(dataReady)
        .enter()
        .append('path')
        .attr('d', arc)
        .attr('fill', d => color(d.data[0]) as string)
        .attr("stroke", "white")
        .style("stroke-width", "2px");

    // Add labels with the name and number
    svg.selectAll('text')
        .data(dataReady)
        .enter()
        .append('text')
        .text(d => `${d.data[0]}: ${d.data[1]}`)
        .attr('transform', d => `translate(${arc.centroid(d)})`)
        .style('text-anchor', 'middle')
        .style('font-size', '12px')
        .style('fill', '#fff')
        .style('pointer-events', 'none'); // Prevents text from interfering with any hover events later
}
