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
        // Leave as unknown so LLM fallback can trigger if enabled
        intent.chartType = 'unknown';
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

            // FIX 1: enforce type constraints when splitting on "by" so that the grouping
            // axis (xField) always resolves to a category column and the numeric axis
            // (yField) always resolves to a measure column.  Try the typed pool first,
            // then fall back to the full pool so a near-match is never missed entirely.
            // Previously both calls searched ALL availableFields, making it possible for
            // a measure to land in xField or a category to land in yField.
            intent.xField = matchField(xTokens, availableFields.filter(f => f.category === 'category'))
                         || matchField(xTokens, availableFields) || undefined;
            intent.yField = matchField(yClean, availableFields.filter(f => f.category === 'measure'))
                         || matchField(yClean, availableFields) || undefined;
        } else {
            intent.xField = matchField(tokens, availableFields.filter(f => f.category === 'category')) || undefined;
            intent.yField = matchField(tokens, availableFields.filter(f => f.category === 'measure')) || undefined;
        }
    }

    // FIX 2: only apply xField / yField fallbacks when the user did NOT make an explicit
    // "X by Y" request.  If they said "plot moon phase by instructor" and "moon phase"
    // found no match, that is a missing-field error — not a signal to silently substitute
    // the first available measure.  Leaving yField as undefined lets visual.ts surface the
    // friendly "I don't see a field matching…" error panel message.
    // Also skip for histogram, which uses valueField only — injecting a random
    // category/measure into xField/yField would pollute the explain-chip.
    const usedByKeyword = byIndex !== -1 && byIndex < tokens.length - 1;
    // Removed aggressive xField/yField auto-filling here so that missing fields
    // properly trigger the LLM fallback or a helpful error message.
    if (!intent.valueField) {
        // BUG FIX: previously accepted any field type (measure OR category) as the
        // histogram value, so a text column like "Department" could be selected —
        // the histogram renderer would then find zero numeric values and show an error.
        // Restrict the fallback to measure columns only (numeric by definition).
        intent.valueField = availableFields.find(f => f.category === 'measure');
    }
    
    // Check for explicit aggregation
    if (lowerQuery.match(/\b(average|mean|avg)\b/)) {
        intent.aggHints = 'mean';
    }
    
    return intent;
}
