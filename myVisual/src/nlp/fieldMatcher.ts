import { FieldMeta } from "./types";

export function matchField(tokens: string[], availableFields: FieldMeta[]): FieldMeta | null {
    if (!tokens || !tokens.length) return null;
    
    // Clean tokens
    const meaningfulTokens = tokens.filter(t => !["show", "the", "a", "an", "plot", "drawing"].includes(t));
    if (meaningfulTokens.length === 0) return null;
    
    const tokenStr = meaningfulTokens.join(" ").toLowerCase();
    
    let bestMatch: FieldMeta | null = null;
    let highestScore = 0;

    for (const field of availableFields) {
        const fieldName = field.displayName.toLowerCase();
        
        let score = 0;
        if (tokenStr.includes(fieldName)) {
            score = 100 + fieldName.length; // Exact subset match heavily favored
        } else if (fieldName.includes(tokenStr)) {
            score = 50 + tokenStr.length; // Partial match
        } else {
            // Check overlapping word count
            const fieldWords = fieldName.split(/[\s_]+/);
            let matchCount = 0;
            for (const fw of fieldWords) {
                if (meaningfulTokens.includes(fw)) {
                    matchCount++;
                }
            }
            if (matchCount > 0) {
                score = (matchCount / fieldWords.length) * 40;
            }
        }
        
        if (score > highestScore && score > 20) {
            highestScore = score;
            bestMatch = field;
        }
    }
    
    return bestMatch;
}
