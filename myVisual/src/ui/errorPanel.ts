export class ErrorPanel {
    private container: HTMLElement;

    constructor(parent: HTMLElement) {
        this.container = document.createElement("div");
        this.container.classList.add("nlviz-error");
        this.container.style.display = "none";
        parent.appendChild(this.container);
    }

    public show(message: string) {
        this.container.innerText = message;
        this.container.style.display = "flex";
        this.container.style.alignItems = "center";
        this.container.style.justifyContent = "center";
    }

    public hide() {
        this.container.style.display = "none";
        this.container.innerText = "";
    }
}
