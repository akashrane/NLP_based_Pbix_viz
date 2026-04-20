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
    
    private inputBar: InputBar;
    private errorPanel: ErrorPanel;
    private chartContainer: HTMLElement;
    private lastDataView: DataView;

    constructor(options: VisualConstructorOptions) {
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

        // Bind events
        this.inputBar.onSubmit = (query: string) => {
            this.handleQuery(query);
        };
    }

    public update(options: VisualUpdateOptions) {
        this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, options.dataViews[0]);
        this.lastDataView = options.dataViews[0] || null;
    }

    private async handleQuery(query: string) {
        if (!this.lastDataView || !this.lastDataView.metadata || !this.lastDataView.metadata.columns.length) {
            this.errorPanel.show("No data bound to the visual yet. Please drag fields into the Category and Measure wells.");
            this.chartContainer.style.display = "none";
            return;
        }

        // Build available fields array
        const availableFields: FieldMeta[] = this.lastDataView.metadata.columns.map(c => ({
            queryName: c.queryName,
            displayName: c.displayName,
            category: c.roles && c.roles.category ? 'category' : 'measure',
            type: c.type ? Object.keys(c.type)[0] : 'unknown'
        }));

        let intent = parseIntent(query, availableFields);
        
        // Gemini Fallback if enabled and intent is ambiguous/unknown/missing important fields
        const parserSettings = this.formattingSettings.parserCard;
        if (parserSettings.useLLM.value && parserSettings.apiKey.value) {
            // Only fallback if rule parser completely failed or is missing fields
            if (!intent || intent.chartType === 'unknown' || (!intent.xField && !intent.yField && !intent.valueField)) {
                this.chartContainer.textContent = 'Querying Gemini...';
                const geminiIntent = await parseWithGemini(query, availableFields, parserSettings.apiKey.value);
                if (geminiIntent && geminiIntent.chartType !== 'unknown') {
                    intent = geminiIntent;
                }
            }
        }

        if (!intent || intent.chartType === 'unknown') {
            this.errorPanel.show(`I couldn't tell what kind of chart you want for "${query}". Try words like distribution, trend, or compare.`);
            this.chartContainer.style.display = "none";
            return;
        }

        const requiredFieldMissing = intent.chartType === 'histogram' ? !intent.valueField : (!intent.xField || !intent.yField);
        if (requiredFieldMissing) {
            this.errorPanel.show(`I don't see matching fields to draw a ${intent.chartType}. Fields in this visual right now: ${availableFields.map(f=>f.displayName).join(", ")}`);
            this.chartContainer.style.display = "none";
            return;
        }

        // Phase 5: Render Chart
        this.errorPanel.hide();
        this.chartContainer.style.display = "block";
        
        try {
            this.chartContainer.textContent = "";
            if (intent.chartType === 'histogram') {
                renderHistogram(this.chartContainer, this.lastDataView, intent.valueField as FieldMeta);
            } else if (intent.chartType === 'line') {
                renderLineChart(this.chartContainer, this.lastDataView, intent.xField as FieldMeta, intent.yField as FieldMeta);
            } else if (intent.chartType === 'pie') {
                renderPieChart(this.chartContainer, this.lastDataView, intent.xField as FieldMeta, intent.yField as FieldMeta);
            } else {
                renderBarChart(this.chartContainer, this.lastDataView, intent.xField as FieldMeta, intent.yField as FieldMeta);
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