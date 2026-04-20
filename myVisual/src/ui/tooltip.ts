export interface TooltipRow {
    label: string;
    value?: string;
}

export interface Tooltip {
    show(event: MouseEvent, rows: TooltipRow[]): void;
    move(event: MouseEvent): void;
    hide(): void;
    remove(): void;
}

export function createTooltip(container: HTMLElement): Tooltip {
    const tip = document.createElement("div");
    tip.style.position = "absolute";
    tip.style.pointerEvents = "none";
    tip.style.background = "rgba(30,30,30,0.88)";
    tip.style.color = "#fff";
    tip.style.padding = "7px 11px";
    tip.style.borderRadius = "6px";
    tip.style.fontSize = "12px";
    tip.style.lineHeight = "1.6";
    tip.style.whiteSpace = "nowrap";
    tip.style.boxShadow = "0 2px 8px rgba(0,0,0,0.35)";
    tip.style.display = "none";
    tip.style.zIndex = "9999";
    container.style.position = "relative";
    container.appendChild(tip);

    function show(event: MouseEvent, rows: TooltipRow[]): void {
        while (tip.firstChild) { tip.removeChild(tip.firstChild); }
        rows.forEach(function(row, i) {
            const line = document.createElement("div");
            if (i === 0) {
                const b = document.createElement("strong");
                b.textContent = row.label;
                line.appendChild(b);
                if (row.value !== undefined) {
                    line.appendChild(document.createTextNode(" " + row.value));
                }
            } else {
                const lbl = document.createElement("span");
                lbl.style.opacity = "0.8";
                lbl.textContent = row.label + " ";
                line.appendChild(lbl);
                if (row.value !== undefined) {
                    const val = document.createElement("strong");
                    val.textContent = row.value;
                    line.appendChild(val);
                }
            }
            tip.appendChild(line);
        });
        tip.style.display = "block";
        move(event);
    }

    function move(event: MouseEvent): void {
        const rect = container.getBoundingClientRect();
        let x = event.clientX - rect.left + 12;
        let y = event.clientY - rect.top - 10;
        if (x + tip.offsetWidth + 16 > container.clientWidth) {
            x = event.clientX - rect.left - tip.offsetWidth - 12;
        }
        if (y + tip.offsetHeight + 10 > container.clientHeight) {
            y = event.clientY - rect.top - tip.offsetHeight - 10;
        }
        tip.style.left = String(Math.max(0, x)) + "px";
        tip.style.top = String(Math.max(0, y)) + "px";
    }

    function hide(): void { tip.style.display = "none"; }

    function remove(): void {
        if (tip.parentNode) { tip.parentNode.removeChild(tip); }
    }

    return { show, move, hide, remove };
}
