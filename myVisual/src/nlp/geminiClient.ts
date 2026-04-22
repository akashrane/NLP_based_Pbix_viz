import { FieldMeta, Intent } from "./types";

export async function parseWithGemini(query: string, availableFields: FieldMeta[], apiKey: string): Promise<Intent | null> {
    if (!apiKey) return null;
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    const fieldList = availableFields.map(f => `${f.displayName} (${f.category})`).join(", ");
    
    const prompt = `Classify the user query into JSON: { "chartType": "histogram"|"bar"|"line"|"pie"|"unknown", "xField": string, "yField": string, "valueField": string, "description": string }. 
Query: "${query}"
Available fields: [${fieldList}]. 
For xField/yField/valueField specify the exact matching field name from the Available fields list, or leave empty if null.
For "description", write a short, concise description of the plot (e.g., "Bar chart showing Total Sales by Region").
Respond with JSON only, no markdown.`;

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });
        
        if (!response.ok) {
            console.error("Gemini API error:", await response.text());
            return null;
        }
        
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        
        const cleanJson = text.replace(/```json/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(cleanJson);
        
        const intent: Intent = { chartType: parsed.chartType || 'unknown', isLLM: true };
        
        if (parsed.xField) intent.xField = availableFields.find(f => f.displayName === parsed.xField);
        if (parsed.yField) intent.yField = availableFields.find(f => f.displayName === parsed.yField);
        if (parsed.valueField) intent.valueField = availableFields.find(f => f.displayName === parsed.valueField);
        if (parsed.description) intent.description = parsed.description;
        
        return intent;
    } catch (e) {
        console.error("Failed to parse from Gemini:", e);
        return null;
    }
}
