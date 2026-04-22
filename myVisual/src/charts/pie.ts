import * as d3 from "d3";
import { FieldMeta, Intent } from "../nlp/types";
import powerbi from "powerbi-visuals-api";
import { createTooltip, TooltipRow } from "../ui/tooltip";

export function renderPieChart(container: HTMLElement, dataView: powerbi.DataView, xField: FieldMeta, yField: FieldMeta, intent?: Intent) {
    while (container.firstChild) { container.removeChild(container.firstChild); }

    let cat = dataView.categorical.categories?.find(c => c.source.displayName === xField?.displayName);
    let msr = dataView.categorical.values?.find(v => v.source.displayName === yField?.displayName);

    if (!cat?.values || !msr?.values) {
        const err = document.createElement("p");
        err.style.color = "red";
        err.style.padding = "10px";
        const missing: string[] = [];
        if (!cat?.values) { missing.push("x-axis field \"" + (xField ? xField.displayName : "unknown") + "\""); }
        if (!msr?.values) { missing.push("y-axis field \"" + (yField ? yField.displayName : "unknown") + "\""); }
        err.textContent = "Data missing for pie chart - " + missing.join(" and ") + " not found in the visual's data wells.";
        container.appendChild(err);
        return;
    }

    const dataMap: Record<string, number> = {};
    for (let i = 0; i < cat.values.length; i++) {
        const xVal = String(cat.values[i]);
        const yVal = Number(msr.values[i]);
        if (!isNaN(yVal)) {
            dataMap[xVal] = (dataMap[xVal] || 0) + yVal;
        }
    }

    const total = Object.values(dataMap).reduce((a, b) => a + b, 0);
    const tt = createTooltip(container);

    const margin = 20;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const radius = Math.min(width, height - 40) / 2 - margin;

    const mainSvg = d3.select(container)
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    // Title / Description
    if (intent && intent.description) {
        mainSvg.append("text")
            .attr("x", width / 2)
            .attr("y", 20)
            .attr("text-anchor", "middle")
            .style("font-size", "14px")
            .style("font-weight", "bold")
            .text(intent.description);
    }

    const svg = mainSvg.append("g")
        .attr("transform", "translate(" + (width / 2) + "," + (height / 2 + 10) + ")");

    const color = d3.scaleOrdinal<string>()
        .domain(Object.keys(dataMap))
        .range(d3.schemeTableau10);

    const pie = d3.pie<[string, number]>().value(d => d[1]);
    const dataReady = pie(Object.entries(dataMap) as [string, number][]);

    const arc = d3.arc<d3.PieArcDatum<[string, number]>>()
        .innerRadius(0)
        .outerRadius(radius);

    const arcHover = d3.arc<d3.PieArcDatum<[string, number]>>()
        .innerRadius(0)
        .outerRadius(radius + 8);

    svg.selectAll("path")
        .data(dataReady)
        .enter()
        .append("path")
        .attr("d", d => arc(d))
        .attr("fill", d => color(d.data[0]))
        .attr("stroke", "white")
        .style("stroke-width", "2px")
        .style("cursor", "pointer")
        .on("mouseover", (event, d) => {
            d3.select(event.currentTarget as SVGPathElement).attr("d", arcHover(d));
            const pct = total > 0 ? ((d.data[1] / total) * 100).toFixed(1) : "0.0";
            const rows: TooltipRow[] = [
                { label: xField.displayName + ":", value: String(d.data[0]) },
                { label: yField.displayName + ":", value: Number(d.data[1]).toLocaleString(undefined, { maximumFractionDigits: 2 }) },
                { label: "Share:", value: pct + "%" },
            ];
            tt.show(event as MouseEvent, rows);
        })
        .on("mousemove", (event) => { tt.move(event as MouseEvent); })
        .on("mouseleave", (event, d) => {
            d3.select(event.currentTarget as SVGPathElement).attr("d", arc(d));
            tt.hide();
        });

    svg.selectAll("text")
        .data(dataReady)
        .enter()
        .append("text")
        .text(d => d.data[0] + ": " + d.data[1])
        .attr("transform", d => "translate(" + arc.centroid(d) + ")")
        .style("text-anchor", "middle")
        .style("font-size", "12px")
        .style("fill", "#fff")
        .style("pointer-events", "none");
}
