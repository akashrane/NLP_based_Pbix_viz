import { FieldMeta, Intent } from "./types";
import { matchField } from "./fieldMatcher";

export function parseIntent(query: string, availableFields: FieldMeta[]): Intent | null {
    if (!query) return null;
    
    const lowerQuery = query.toLowerCase().replace(/[?.,!]/g, "");
    const tokens = lowerQuery.split(/\s+/);
    
    const intent: Intent = { chartType: 'unknown' };
    
    // 1. Find chart type
    if (lowerQuery.match(/\b(trend|trends|over time|line|lines|by year|by month|by semester|progress|progression|growth|timeline|history|evolution|timeseries)\b/)) {
        intent.chartType = 'line';
    } else if (lowerQuery.match(/\b(distribution|distributions|spread|histogram|histograms|frequency|frequencies|curve|bucket|buckets|density)\b/)) {
        intent.chartType = 'histogram';
    } else if (lowerQuery.match(/\b(compare|comparison|bar|bars|column|columns|across|highest|lowest|top|bottom|rank|ranking|most|least|breakdown)\b/)) {
        intent.chartType = 'bar';
    } else if (lowerQuery.match(/\b(pie|pies|composition|share|shares|percentage|percentages|proportion|proportions|ratio|fraction)\b/)) {
        intent.chartType = 'pie';
    } else {
        // Fallback to bar if ambiguous but fields suggest something
        intent.chartType = 'bar';
    }
    
    // 2. Extract context for fields
    const byIndex = tokens.indexOf("by");
    const ofIndex = tokens.indexOf("of");
    
    if (intent.chartType === 'histogram') {
        if (ofIndex !== -1 && ofIndex < tokens.length - 1) {
            const fieldTokens = tokens.slice(ofIndex + 1);
            intent.valueField = matchField(fieldTokens, availableFields) || undefined;
        } else {
            intent.valueField = matchField(tokens, availableFields) || undefined;
        }
    } else {
        if (byIndex !== -1 && byIndex < tokens.length - 1) {
            const yTokens = tokens.slice(0, byIndex);
            const xTokens = tokens.slice(byIndex + 1);
            
            const yClean = yTokens.filter(t => t !== 'of');
            intent.yField = matchField(yClean, availableFields) || undefined;
            intent.xField = matchField(xTokens, availableFields) || undefined;
        } else {
            intent.xField = matchField(tokens, availableFields.filter(f => f.category === 'category')) || undefined;
            intent.yField = matchField(tokens, availableFields.filter(f => f.category === 'measure')) || undefined;
        }
    }
    
    // Sensible fallbacks: if user didn't specify exactly, bind the first available matching types
    if (!intent.xField) {
        intent.xField = availableFields.find(f => f.category === 'category');
    }
    if (!intent.yField) {
        intent.yField = availableFields.find(f => f.category === 'measure');
    }
    if (!intent.valueField) {
        // For histogram, maybe valueField could be a grouping or measure
        intent.valueField = availableFields.find(f => f.category === 'measure' || f.category === 'category');
    }
    
    return intent;
}
