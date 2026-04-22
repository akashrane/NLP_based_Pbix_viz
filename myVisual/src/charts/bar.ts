import * as d3 from "d3";
import { FieldMeta, Intent } from "../nlp/types";
import powerbi from "powerbi-visuals-api";
import { createTooltip, TooltipRow } from "../ui/tooltip";

export function renderBarChart(
    container: HTMLElement,
    dataView: powerbi.DataView,
    xField: FieldMeta,
    yField: FieldMeta,
    intent?: Intent,
    themeColor: string = "#0078d4"
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
        err.textContent = "Bar chart could not be drawn - " + missing.join(" and ") + " not found in the visual's data wells.";
        container.appendChild(err);
        return;
    }

    const map = new Map<string, number[]>();
    for (let i = 0; i < cat.values.length; i++) {
        const xVal = String(cat.values[i]);
        const yVal = Number(msr.values[i]);
        if (!isNaN(yVal)) {
            if (!map.has(xVal)) { map.set(xVal, []); }
            map.get(xVal).push(yVal);
        }
    }

    const aggLabel = (intent && intent.aggHints === "mean") ? "Mean" : "Total";
    const data: { key: string; value: number }[] = [];
    map.forEach((yVals, key) => {
        let val = 0;
        if (intent && intent.aggHints === "mean") {
            val = yVals.reduce((a, b) => a + b, 0) / yVals.length;
        } else {
            val = yVals.reduce((a, b) => a + b, 0);
        }
        data.push({ key: key, value: val });
    });
    data.sort((a, b) => b.value - a.value);

    const topData = data.slice(0, 20);
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

    const x = d3.scaleBand()
        .domain(topData.map(d => d.key))
        .range([0, width])
        .padding(0.2);

    let minY = Math.min(0, d3.min(topData, d => d.value) || 0); // Bar charts should always start at 0
    let maxY = d3.max(topData, d => d.value) || 0;
    const padding = (maxY - minY) * 0.1;
    if (padding === 0) { maxY = 1; } else { maxY += padding; }

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

    svg.selectAll("rect")
        .data(topData)
        .enter()
        .append("rect")
        .attr("x", d => x(d.key) || 0)
        .attr("width", x.bandwidth())
        .attr("y", d => y(d.value))
        .attr("height", d => height - y(d.value))
        .style("fill", themeColor)
        .style("cursor", "pointer")
        .on("mouseover", (event, d) => {
            const rows: TooltipRow[] = [
                { label: xField.displayName + ":", value: d.key },
                { label: aggLabel + " " + yField.displayName + ":", value: d.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) },
            ];
            tt.show(event as MouseEvent, rows);
        })
        .on("mousemove", (event) => { tt.move(event as MouseEvent); })
        .on("mouseleave", () => { tt.hide(); });
}
