export class InputBar {
    private container: HTMLElement;
    private input: HTMLInputElement;
    private button: HTMLButtonElement;
    public onSubmit: (query: string) => void;

    constructor(parent: HTMLElement) {
        this.container = document.createElement("div");
        this.container.classList.add("nlviz-header");
        
        this.input = document.createElement("input");
        this.input.type = "text";
        this.input.placeholder = "Ask a question (e.g., 'distribution of GPA')...";
        this.input.classList.add("nlviz-input");
        
        this.button = document.createElement("button");
        this.button.innerText = "Ask";
        this.button.classList.add("nlviz-button");
        
        this.container.appendChild(this.input);
        this.container.appendChild(this.button);
        parent.appendChild(this.container);

        this.button.addEventListener("click", () => {
            if (this.onSubmit && this.input.value.trim()) {
                this.onSubmit(this.input.value.trim());
            }
        });

        this.input.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && this.onSubmit && this.input.value.trim()) {
                this.onSubmit(this.input.value.trim());
            }
        });
    }

    public getValue(): string {
        return this.input.value.trim();
    }
}
