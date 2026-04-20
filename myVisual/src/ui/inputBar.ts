export class InputBar {
    private container: HTMLElement;
    private input: HTMLInputElement;
    private button: HTMLButtonElement;
    private datalist: HTMLDataListElement;
    private history: string[] = [];
    public onSubmit: (query: string) => void;

    constructor(parent: HTMLElement) {
        this.container = document.createElement("div");
        this.container.classList.add("nlviz-header");
        
        this.input = document.createElement("input");
        this.input.type = "text";
        this.input.placeholder = "Ask a question (e.g., 'distribution of GPA')...";
        this.input.classList.add("nlviz-input");
        this.input.setAttribute("list", "nlviz-history");
        
        this.datalist = document.createElement("datalist");
        this.datalist.id = "nlviz-history";
        
        this.button = document.createElement("button");
        this.button.innerText = "Ask";
        this.button.classList.add("nlviz-button");
        
        this.container.appendChild(this.input);
        this.container.appendChild(this.datalist);
        this.container.appendChild(this.button);
        parent.appendChild(this.container);

        this.button.addEventListener("click", () => {
            const val = this.input.value.trim();
            if (this.onSubmit && val) {
                this.addToHistory(val);
                this.onSubmit(val);
            }
        });

        this.input.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && this.onSubmit && this.input.value.trim()) {
                const val = this.input.value.trim();
                this.addToHistory(val);
                this.onSubmit(val);
            }
        });
    }

    private addToHistory(query: string) {
        if (!this.history.includes(query)) {
            this.history.unshift(query);
            if (this.history.length > 5) this.history.pop();
            
            this.datalist.textContent = "";
            this.history.forEach(q => {
                const opt = document.createElement("option");
                opt.value = q;
                this.datalist.appendChild(opt);
            });
        }
    }

    public getValue(): string {
        return this.input.value.trim();
    }
}
