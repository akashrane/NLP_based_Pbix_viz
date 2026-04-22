import * as d3 from "d3";
import { FieldMeta, Intent } from "../nlp/types";
import powerbi from "powerbi-visuals-api";
import { createTooltip, TooltipRow } from "../ui/tooltip";

export function renderLineChart(
    container: HTMLElement, 
    dataView: powerbi.DataView, 
    xField: FieldMeta, 
    yField: FieldMeta,
    intent?: Intent
) {
    while (container.firstChild) { container.removeChild(container.firstChild); }

    const cat = dataView.categorical.categories?.find(c => c.source.displayName === xField?.displayName);
    const msr = dataView.categorical.values?.find(v => v.source.displayName === yField?.displayName);

    if (!cat?.values || !msr?.values) {
        const err = document.createElement("p");
        err.style.color = "red";
        err.style.padding = "10px";
        const missing: string[] = [];
        if (!cat?.values) { missing.push("x-axis field \"" + (xField ? xField.displayName : "unknown") + "\""); }
        if (!msr?.values) { missing.push("y-axis field \"" + (yField ? yField.displayName : "unknown") + "\""); }
        err.textContent = "Line chart could not be drawn - " + missing.join(" and ") + " not found in the visual's data wells.";
        container.appendChild(err);
        return;
    }

    const map = new Map<string, number[]>();
    for (let i = 0; i < cat.values.length; i++) {
        const xVal = String(cat.values[i] || "");
        const yVal = Number(msr.values[i]);
        if (!isNaN(yVal)) {
            if (!map.has(xVal)) { map.set(xVal, []); }
            map.get(xVal).push(yVal);
        }
    }

    const data: { key: string; value: number }[] = [];
    map.forEach((yVals, key) => {
        const avg = yVals.reduce((a, b) => a + b, 0) / yVals.length;
        data.push({ key: key, value: avg });
    });
    data.sort((a, b) => a.key.localeCompare(b.key));

    const tt = createTooltip(container);
    const margin = { top: 50, right: 20, bottom: 80, left: 80 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = container.clientHeight - margin.top - margin.bottom;

    const svg = d3.select(container)
        .append("svg")
        .attr("width", container.clientWidth)
        .attr("height", container.clientHeight)
        .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    const x = d3.scalePoint()
        .domain(data.map(d => d.key))
        .range([0, width])
        .padding(0.5);

    let minY = d3.min(data, d => d.value) || 0;
    let maxY = d3.max(data, d => d.value) || 0;
    const padding = (maxY - minY) * 0.1;
    if (padding === 0) { minY = 0; } else { minY = Math.max(0, minY - padding); maxY += padding; }

    const y = d3.scaleLinear()
        .domain([minY, maxY])
        .nice()
        .range([height, 0]);

    svg.append("g")
        .attr("transform", "translate(0," + height + ")")
        .call(d3.axisBottom(x))
        .selectAll("text")
        .attr("transform", "translate(-10,0)rotate(-45)")
        .style("text-anchor", "end");

    // X-axis label
    svg.append("text")
        .attr("x", width / 2)
        .attr("y", height + margin.bottom - 10)
        .attr("text-anchor", "middle")
        .style("font-size", "12px")
        .text(xField.displayName);

    svg.append("g").call(d3.axisLeft(y));

    // Y-axis label
    const aggLabel = (intent && intent.aggHints === "mean") ? "Mean" : "Average";
    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", -margin.left + 20)
        .attr("text-anchor", "middle")
        .style("font-size", "12px")
        .text(aggLabel + " " + yField.displayName);

    // Title / Description
    if (intent && intent.description) {
        svg.append("text")
            .attr("x", width / 2)
            .attr("y", -margin.top / 2)
            .attr("text-anchor", "middle")
            .style("font-size", "14px")
            .style("font-weight", "bold")
            .text(intent.description);
    }

    const line = d3.line<{ key: string; value: number }>()
        .x(d => x(d.key) || 0)
        .y(d => y(d.value));

    svg.append("path")
        .datum(data)
        .attr("fill", "none")
        .attr("stroke", "#0078d4")
        .attr("stroke-width", 2)
        .attr("d", line);

    svg.append("path")
        .datum(data)
        .attr("fill", "none")
        .attr("stroke", "transparent")
        .attr("stroke-width", 12)
        .attr("d", line)
        .style("cursor", "crosshair")
        .on("mousemove", (event) => {
            const [mx] = d3.pointer(event);
            const domain = data.map(pt => x(pt.key) || 0);
            const idx = d3.minIndex(domain, px => Math.abs(px - mx));
            const pt = data[idx];
            if (pt) {
                const rows: TooltipRow[] = [
                    { label: xField.displayName + ":", value: pt.key },
                    { label: yField.displayName + ":", value: pt.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) },
                ];
                tt.show(event as MouseEvent, rows);
            }
        })
        .on("mouseleave", () => { tt.hide(); });

    svg.selectAll("circle")
        .data(data)
        .enter()
        .append("circle")
        .attr("cx", d => x(d.key) || 0)
        .attr("cy", d => y(d.value))
        .attr("r", 4)
        .attr("fill", "#0078d4")
        .attr("stroke", "#fff")
        .attr("stroke-width", 1.5)
        .style("cursor", "pointer")
        .on("mouseover", (event, d) => {
            d3.select(event.currentTarget as SVGCircleElement).attr("r", 6).attr("fill", "#005a9e");
            const rows: TooltipRow[] = [
                { label: xField.displayName + ":", value: d.key },
                { label: yField.displayName + ":", value: d.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) },
            ];
            tt.show(event as MouseEvent, rows);
        })
        .on("mousemove", (event) => { tt.move(event as MouseEvent); })
        .on("mouseleave", (event) => {
            d3.select(event.currentTarget as SVGCircleElement).attr("r", 4).attr("fill", "#0078d4");
            tt.hide();
        });
}
