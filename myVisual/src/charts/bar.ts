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

    const cat = dataView.categorical.categories?.find(c => c.source.queryName === xField?.queryName);
    const msr = dataView.categorical.values?.find(v => v.source.queryName === yField?.queryName);

    if (!cat?.values || !msr?.values) {
        const err = document.createElement("p");
        const missing: string[] = [];
        if (!cat?.values) { missing.push("x-axis field \"" + (xField ? xField.displayName : "unknown") + "\" (expected a Category column)"); }
        if (!msr?.values) { missing.push("y-axis field \"" + (yField ? yField.displayName : "unknown") + "\" (expected a Measure column)"); }
        err.textContent = "Bar chart could not be drawn - " + missing.join("; ") + ". Make sure the right fields are dragged into the Category and Measure wells.";
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

    const margin = { top: 20, right: 20, bottom: 80, left: 60 };
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

    const y = d3.scaleLinear()
        .domain([0, d3.max(topData, d => d.value) || 0])
        .nice()
        .range([height, 0]);

    svg.append("g")
        .attr("transform", "translate(0," + height + ")")
        .call(d3.axisBottom(x))
        .selectAll("text")
        .attr("transform", "translate(-10,0)rotate(-45)")
        .style("text-anchor", "end");

    svg.append("g").call(d3.axisLeft(y));

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
