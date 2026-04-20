import * as d3 from "d3";
import { FieldMeta } from "../nlp/types";
import powerbi from "powerbi-visuals-api";
import { createTooltip, TooltipRow } from "../ui/tooltip";

export function renderLineChart(container: HTMLElement, dataView: powerbi.DataView, xField: FieldMeta, yField: FieldMeta) {
    while (container.firstChild) { container.removeChild(container.firstChild); }

    const cat = dataView.categorical.categories?.find(c => c.source.queryName === xField?.queryName);
    const msr = dataView.categorical.values?.find(v => v.source.queryName === yField?.queryName);

    if (!cat?.values || !msr?.values) {
        const err = document.createElement("p");
        const missing: string[] = [];
        if (!cat?.values) { missing.push("x-axis field \"" + (xField ? xField.displayName : "unknown") + "\" (expected a Category column)"); }
        if (!msr?.values) { missing.push("y-axis field \"" + (yField ? yField.displayName : "unknown") + "\" (expected a Measure column)"); }
        err.textContent = "Line chart could not be drawn - " + missing.join("; ") + ". Make sure the right fields are dragged into the Category and Measure wells.";
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
    const margin = { top: 20, right: 20, bottom: 80, left: 60 };
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

    const y = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.value) || 0])
        .nice()
        .range([height, 0]);

    svg.append("g")
        .attr("transform", "translate(0," + height + ")")
        .call(d3.axisBottom(x))
        .selectAll("text")
        .attr("transform", "translate(-10,0)rotate(-45)")
        .style("text-anchor", "end");

    svg.append("g").call(d3.axisLeft(y));

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
