export interface FieldMeta {
    queryName: string;
    displayName: string;
    category: 'category' | 'measure';
    type?: string; 
}

export interface Intent {
    chartType: 'histogram' | 'bar' | 'line' | 'pie' | 'unknown';
    xField?: FieldMeta;
    yField?: FieldMeta;
    valueField?: FieldMeta;
    aggHints?: string;
    description?: string;
    isLLM?: boolean;
}
