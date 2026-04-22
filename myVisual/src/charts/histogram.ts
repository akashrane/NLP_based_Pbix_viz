import * as d3 from "d3";
import { FieldMeta, Intent } from "../nlp/types";
import powerbi from "powerbi-visuals-api";
import { createTooltip, TooltipRow } from "../ui/tooltip";

export function renderHistogram(container: HTMLElement, dataView: powerbi.DataView, field: FieldMeta, intent?: Intent) {
    while (container.firstChild) { container.removeChild(container.firstChild); }

    const values: number[] = [];
    const cat = dataView.categorical.categories?.find(c => c.source.displayName === field.displayName);
    const msr = dataView.categorical.values?.find(v => v.source.displayName === field.displayName);

    if (!cat && !msr) {
        const err = document.createElement("p");
        err.style.color = "red";
        err.style.padding = "10px";
        err.textContent = `Histogram could not be drawn - field "${field ? field.displayName : "unknown"}" not found in the visual's data wells.`;
        container.appendChild(err);
        return;
    }

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
    const margin = { top: 50, right: 20, bottom: 80, left: 80 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = container.clientHeight - margin.top - margin.bottom;

    const svg = d3.select(container)
        .append("svg")
        .attr("width", container.clientWidth)
        .attr("height", container.clientHeight)
        .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    const uniqueValues = Array.from(new Set(values));
    // Determine if data is discrete: integers only and relatively few unique values
    const isDiscrete = uniqueValues.length <= 20 && uniqueValues.every(v => Number.isInteger(v));

    if (isDiscrete) {
        // --- DISCRETE MODE ---
        uniqueValues.sort((a, b) => a - b);
        const counts = new Map<number, number>();
        values.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
        const data = uniqueValues.map(v => ({ key: v, length: counts.get(v) || 0 }));

        const x = d3.scaleBand()
            .domain(data.map(d => String(d.key)))
            .range([0, width])
            .padding(0.2);

        const y = d3.scaleLinear()
            .domain([0, d3.max(data, d => d.length) || 0])
            .nice()
            .range([height, 0]);

        svg.append("g")
            .attr("transform", "translate(0," + height + ")")
            .call(d3.axisBottom(x));

        // X-axis label
        svg.append("text")
            .attr("x", width / 2)
            .attr("y", height + margin.bottom - 10)
            .attr("text-anchor", "middle")
            .style("font-size", "12px")
            .text(field.displayName);

        svg.append("g").call(d3.axisLeft(y));

        // Y-axis label
        svg.append("text")
            .attr("transform", "rotate(-90)")
            .attr("x", -height / 2)
            .attr("y", -margin.left + 20)
            .attr("text-anchor", "middle")
            .style("font-size", "12px")
            .text("Count");

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
            .data(data)
            .enter()
            .append("rect")
            .attr("x", d => x(String(d.key)) || 0)
            .attr("width", x.bandwidth())
            .attr("y", d => y(d.length))
            .attr("height", d => height - y(d.length))
            .style("fill", "#0078d4")
            .style("cursor", "pointer")
            .on("mouseover", (event, d) => {
                const rows: TooltipRow[] = [
                    { label: field.displayName + ":", value: String(d.key) },
                    { label: "Count:", value: String(d.length) },
                ];
                tt.show(event as MouseEvent, rows);
            })
            .on("mousemove", (event) => { tt.move(event as MouseEvent); })
            .on("mouseleave", () => { tt.hide(); });

    } else {
        // --- CONTINUOUS MODE ---
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

        // X-axis label
        svg.append("text")
            .attr("x", width / 2)
            .attr("y", height + margin.bottom - 10)
            .attr("text-anchor", "middle")
            .style("font-size", "12px")
            .text(field.displayName);

        svg.append("g").call(d3.axisLeft(y));

        // Y-axis label
        svg.append("text")
            .attr("transform", "rotate(-90)")
            .attr("x", -height / 2)
            .attr("y", -margin.left + 20)
            .attr("text-anchor", "middle")
            .style("font-size", "12px")
            .text("Count");

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
}
