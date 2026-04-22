"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import DataView = powerbi.DataView;

import { VisualFormattingSettingsModel } from "./settings";
import { InputBar } from "./ui/inputBar";
import { ErrorPanel } from "./ui/errorPanel";
import { FieldMeta, Intent } from "./nlp/types";
import { parseIntent } from "./nlp/intentParser";
import { parseWithGemini } from "./nlp/geminiClient";
import { renderHistogram } from "./charts/histogram";
import { renderBarChart } from "./charts/bar";
import { renderLineChart } from "./charts/line";
import { renderPieChart } from "./charts/pie";

export class Visual implements IVisual {
    private target: HTMLElement;
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService: FormattingSettingsService;
    private host: powerbi.extensibility.visual.IVisualHost;
    
    private inputBar: InputBar;
    private errorPanel: ErrorPanel;
    private chartContainer: HTMLElement;
    private explainChip: HTMLElement;
    private lastDataView: DataView;
    private themeColor: string = "#0078d4";

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.formattingSettingsService = new FormattingSettingsService();
        this.target = options.element;
        this.target.classList.add("nlviz");

        // Header
        this.inputBar = new InputBar(this.target);
        
        // Body (chart + errors)
        const body = document.createElement("div");
        body.classList.add("nlviz-canvas");
        this.target.appendChild(body);

        this.errorPanel = new ErrorPanel(body);
        
        this.chartContainer = document.createElement("div");
        this.chartContainer.classList.add("nlviz-chart-container");
        body.appendChild(this.chartContainer);

        this.explainChip = document.createElement("div");
        this.explainChip.classList.add("nlviz-explain-chip");
        this.explainChip.style.display = "none";
        this.explainChip.style.fontSize = "12px";
        this.explainChip.style.color = "#666";
        this.explainChip.style.marginTop = "8px";
        body.appendChild(this.explainChip);

        // Bind events
        this.inputBar.onSubmit = (query: string) => {
            this.handleQuery(query);
        };
    }

    public update(options: VisualUpdateOptions) {
        this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, options.dataViews[0]);
        this.lastDataView = options.dataViews[0] || null;
        if (this.host.colorPalette) {
            this.themeColor = this.host.colorPalette.getColor("0").value || "#0078d4";
        }
    }

    private async handleQuery(query: string) {
        if (!this.lastDataView || !this.lastDataView.metadata || !this.lastDataView.metadata.columns.length) {
            this.errorPanel.show("No data bound to the visual yet. Please drag fields into the Category and Measure wells.");
            this.chartContainer.style.display = "none";
            this.explainChip.style.display = "none";
            return;
        }

        // Build available fields array.
        // Use c.isMeasure (authoritative Power BI API flag) rather than inspecting
        // c.roles.category, which only checks one side of the coin and can mis-classify
        // fields that have neither role (or both roles) as 'measure' by default.
        const availableFields: FieldMeta[] = this.lastDataView.metadata.columns.map(c => ({
            queryName: c.queryName,
            displayName: c.displayName,
            category: c.isMeasure ? 'measure' : 'category',
            type: c.type ? Object.keys(c.type)[0] : 'unknown'
        }));

        let intent = parseIntent(query, availableFields);
        
        // Gemini Fallback if enabled and intent is ambiguous/unknown/missing important fields
        const parserSettings = this.formattingSettings.parserCard;
        if (parserSettings.useLLM.value && parserSettings.apiKey.value) {
            // Determine if the parsed intent is missing the specific fields it needs to render
            const isMissingFields = intent && intent.chartType !== 'unknown' 
                ? (intent.chartType === 'histogram' ? !intent.valueField : (!intent.xField || !intent.yField))
                : true;

            // Fallback if rule parser completely failed or is missing required fields
            if (!intent || intent.chartType === 'unknown' || isMissingFields) {
                this.chartContainer.textContent = 'Querying Gemini...';
                const geminiIntent = await parseWithGemini(query, availableFields, parserSettings.apiKey.value);
                if (geminiIntent && geminiIntent.chartType !== 'unknown') {
                    intent = geminiIntent;
                }
            }
        }

        // --- AUTO-SWAPPER ---
        // If Gemini or the local parser accidentally reversed the fields (put a Measure in X and Category in Y), swap them.
        // Also handle cases where they only specified one field but put it in the wrong slot.
        if (intent && intent.chartType !== 'histogram') {
            if (intent.xField?.category === 'measure' && intent.yField?.category === 'category') {
                const temp = intent.xField;
                intent.xField = intent.yField;
                intent.yField = temp;
            } else if (intent.xField?.category === 'measure' && !intent.yField) {
                intent.yField = intent.xField;
                intent.xField = undefined; // Let the forgiving fallback fill it
            } else if (intent.yField?.category === 'category' && !intent.xField) {
                intent.xField = intent.yField;
                intent.yField = undefined; // Let the forgiving fallback fill it
            }
        }

        if (!intent || intent.chartType === 'unknown') {
            this.errorPanel.show(`I couldn't tell what kind of chart you want for "${query}". Try words like distribution, trend, or compare.`);
            this.chartContainer.style.display = "none";
            this.explainChip.style.display = "none";
            return;
        }

        // Validate that required fields are present - NO auto-filling from available candidates.
        // If a field is missing, show a specific, actionable error message.
        if (intent.chartType === 'histogram') {
            if (!intent.valueField) {
                this.errorPanel.show(`I understood you want a histogram, but I couldn't figure out which field to plot. Try: "show distribution of [field name]" — e.g., "show distribution of GPA".`);
                this.chartContainer.style.display = "none";
                this.explainChip.style.display = "none";
                return;
            }
        } else {
            const missingX = !intent.xField;
            const missingY = !intent.yField;
            const chartName = intent.chartType.charAt(0).toUpperCase() + intent.chartType.slice(1);
            const exampleMap: Record<string, string> = {
                bar: '"compare student count by expected grade"',
                line: '"trend of student count by semester"',
                pie: '"composition of students by course type"',
            };
            const example = exampleMap[intent.chartType] || `"show a ${intent.chartType} of [measure] by [category]"`;

            if (missingX && missingY) {
                this.errorPanel.show(`I understood you want a ${chartName} chart, but I couldn't identify which fields to use for the X-axis (category) and Y-axis (measure). Try: ${example}`);
                this.chartContainer.style.display = "none";
                this.explainChip.style.display = "none";
                return;
            } else if (missingX) {
                this.errorPanel.show(`I understood you want a ${chartName} chart with "${intent.yField?.displayName}" on the Y-axis, but I couldn't find the category field for the X-axis. Try adding a category to your query — e.g., ${example}`);
                this.chartContainer.style.display = "none";
                this.explainChip.style.display = "none";
                return;
            } else if (missingY) {
                this.errorPanel.show(`I understood you want a ${chartName} chart with "${intent.xField?.displayName}" on the X-axis, but I couldn't find the measure field for the Y-axis. Try adding a measure to your query — e.g., ${example}`);
                this.chartContainer.style.display = "none";
                this.explainChip.style.display = "none";
                return;
            }
        }


        if (!intent.description) {
            if (intent.chartType === 'histogram') {
                intent.description = `Histogram of ${intent.valueField?.displayName}`;
            } else if (intent.chartType === 'pie' || intent.chartType === 'bar' || intent.chartType === 'line') {
                intent.description = `${intent.chartType.charAt(0).toUpperCase() + intent.chartType.slice(1)} chart showing ${intent.yField?.displayName} by ${intent.xField?.displayName}`;
            } else {
                intent.description = `Chart based on query`;
            }
        }
        
        if (intent.isLLM) {
            intent.description += " ✨ (Generated by AI)";
        }

        // Phase 5: Render Chart
        this.errorPanel.hide();
        this.chartContainer.style.display = "block";
        this.explainChip.style.display = "block";
        
        let explainText = `ℹ️ intent: ${intent.chartType}`;
        if (intent.xField) explainText += ` • x: ${intent.xField.displayName}`;
        if (intent.yField) explainText += ` • y: ${intent.yField.displayName}`;
        if (intent.valueField) explainText += ` • value: ${intent.valueField.displayName}`;
        if (intent.aggHints) explainText += ` • agg: ${intent.aggHints}`;
        this.explainChip.textContent = explainText;
        
        try {
            this.chartContainer.textContent = "";
            if (intent.chartType === 'histogram') {
                renderHistogram(this.chartContainer, this.lastDataView, intent.valueField as FieldMeta, intent);
            } else if (intent.chartType === 'line') {
                renderLineChart(this.chartContainer, this.lastDataView, intent.xField as FieldMeta, intent.yField as FieldMeta, intent);
            } else if (intent.chartType === 'pie') {
                renderPieChart(this.chartContainer, this.lastDataView, intent.xField as FieldMeta, intent.yField as FieldMeta, intent);
            } else {
                renderBarChart(this.chartContainer, this.lastDataView, intent.xField as FieldMeta, intent.yField as FieldMeta, intent, this.themeColor);
            }
        } catch (e) {
            console.error(e);
            this.chartContainer.style.display = "none";
            this.errorPanel.show("An error occurred while rendering the chart.");
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }
}