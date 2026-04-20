import * as d3 from "d3";
import { FieldMeta } from "../nlp/types";
import powerbi from "powerbi-visuals-api";
import { createTooltip, TooltipRow } from "../ui/tooltip";

export function renderHistogram(container: HTMLElement, dataView: powerbi.DataView, field: FieldMeta) {
    while (container.firstChild) { container.removeChild(container.firstChild); }

    const values: number[] = [];
    const cat = dataView.categorical.categories?.find(c => c.source.queryName === field.queryName);
    const msr = dataView.categorical.values?.find(v => v.source.queryName === field.queryName)
             || dataView.categorical.values?.[0];

    if (cat?.values) {
        cat.values.forEach(v => {
            if (typeof v === "number") { values.push(v); }
            else if (!isNaN(Number(v))) { values.push(Number(v)); }
        });
    } else if (msr?.values) {
        msr.values.forEach(v => {
            if (typeof v === "number") { values.push(v); }
            else if (!isNaN(Number(v))) { values.push(Number(v)); }
        });
    }

    if (values.length === 0) {
        const err = document.createElement("p");
        err.textContent = "No numeric data found for histogram of " + (field ? field.displayName : "the field");
        container.appendChild(err);
        return;
    }

    const tt = createTooltip(container);
    const margin = { top: 20, right: 20, bottom: 40, left: 40 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = container.clientHeight - margin.top - margin.bottom;

    const svg = d3.select(container)
        .append("svg")
        .attr("width", container.clientWidth)
        .attr("height", container.clientHeight)
        .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    const x = d3.scaleLinear()
        .domain([d3.min(values) || 0, d3.max(values) || 0])
        .nice()
        .range([0, width]);

    const histogram = d3.bin()
        .domain(x.domain() as [number, number])
        .thresholds(x.ticks(20));

    const bins = histogram(values);

    const y = d3.scaleLinear()
        .domain([0, d3.max(bins, d => d.length) || 0])
        .nice()
        .range([height, 0]);

    svg.append("g")
        .attr("transform", "translate(0," + height + ")")
        .call(d3.axisBottom(x));

    svg.append("g").call(d3.axisLeft(y));

    svg.selectAll("rect")
        .data(bins)
        .enter()
        .append("rect")
        .attr("x", d => x(d.x0 || 0) + 1)
        .attr("width", d => Math.max(0, x(d.x1 || 0) - x(d.x0 || 0) - 1))
        .attr("y", d => y(d.length))
        .attr("height", d => height - y(d.length))
        .style("fill", "#0078d4")
        .style("cursor", "pointer")
        .on("mouseover", (event, d) => {
            const lo = (d.x0 || 0).toFixed(2);
            const hi = (d.x1 || 0).toFixed(2);
            const rows: TooltipRow[] = [
                { label: field.displayName },
                { label: "Range:", value: lo + " - " + hi },
                { label: "Count:", value: String(d.length) },
            ];
            tt.show(event as MouseEvent, rows);
        })
        .on("mousemove", (event) => { tt.move(event as MouseEvent); })
        .on("mouseleave", () => { tt.hide(); });
}
