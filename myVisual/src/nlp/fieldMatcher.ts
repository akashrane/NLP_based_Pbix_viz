import { FieldMeta } from "./types";

export function matchField(tokens: string[], availableFields: FieldMeta[]): FieldMeta | null {
    if (!tokens || !tokens.length) return null;
    
    // Clean tokens of stop words and plural 's' at the end for matching purposes
    const stopWords = ["show", "the", "a", "an", "plot", "drawing", "of", "by", "for", "distribution", "compare"];
    const meaningfulTokens = tokens
        .filter(t => !stopWords.includes(t.toLowerCase()))
        .map(t => t.toLowerCase());
        
    if (meaningfulTokens.length === 0) return null;
    
    const tokenStr = meaningfulTokens.join(" ");
    
    let bestMatch: FieldMeta | null = null;
    let highestScore = 0;

    for (const field of availableFields) {
        // Strip common PBI aggregation prefixes and replace underscores
        let fieldName = field.displayName.toLowerCase();
        fieldName = fieldName.replace(/^(count of|sum of|average of|min of|max of|mean of)\s+/, "");
        fieldName = fieldName.replace(/_/g, " ");
        
        let score = 0;
        if (tokenStr === fieldName) {
            score = 200;
        } else if (tokenStr.includes(fieldName)) {
            score = 100 + fieldName.length; 
        } else if (fieldName.includes(tokenStr)) {
            score = 50 + tokenStr.length; 
        } else {
            // Check overlapping word count with basic plural stemming
            const fieldWords = fieldName.split(/[\s]+/);
            let matchCount = 0;
            for (const fw of fieldWords) {
                if (fw.trim().length === 0) continue;
                if (meaningfulTokens.some(t => t === fw || t + 's' === fw || fw + 's' === t || t.replace(/es$/, '') === fw || fw.replace(/es$/, '') === t)) {
                    matchCount++;
                }
            }
            if (matchCount > 0) {
                score = (matchCount / fieldWords.length) * 40;
            }
        }
        
        if (score > highestScore && score > 10) { // lowered threshold to catch edge overlaps
            highestScore = score;
            bestMatch = field;
        }
    }
    
    return bestMatch;
}
