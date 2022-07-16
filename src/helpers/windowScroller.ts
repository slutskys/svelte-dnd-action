import {makeScroller} from "./scroller";
import {printDebug} from "../constants";
import {resetIndexesCache} from "./listUtil";
import {getPointFromEvent} from "./point";
import {Point} from "../internalTypes";

const INTERVAL_MS = 300;

let lastMousePosition: Point | undefined;
let mousePosition: Point | undefined;

/**
 * Do not use this! it is visible for testing only until we get over the issue Cypress not triggering the mousemove listeners
 * // TODO - make private (remove export)
 * @param {{clientX: number, clientY: number}} e
 */
function updateMousePosition(e: MouseEvent | TouchEvent) {
    lastMousePosition = mousePosition;
    mousePosition = getPointFromEvent(e);
}

function mousePositionStatic(prev: Point, curr: Point): boolean {
    const xDiff = Math.abs(prev.x - curr.x);
    const yDiff = Math.abs(prev.y - curr.y);

    return xDiff < 10 && yDiff < 10;
}

const {scrollIfNeeded, resetScrolling} = makeScroller();

let next: number | undefined;

function loop(containerEl: HTMLElement | undefined): void {
    if (mousePosition && lastMousePosition && mousePositionStatic(lastMousePosition, mousePosition)) {
        const scrolled = scrollIfNeeded(mousePosition, containerEl ?? document.documentElement);
        if (scrolled) resetIndexesCache();
    }
    next = window.setTimeout(() => loop(containerEl), INTERVAL_MS);
}

/**
 * will start watching the mouse pointer and scroll the window if it goes next to the edges
 */
export function armWindowScroller(containerEl: HTMLElement | undefined): void {
    printDebug(() => "arming window scroller");
    window.addEventListener("mousemove", updateMousePosition);
    window.addEventListener("touchmove", updateMousePosition);
    loop(containerEl);
}

/**
 * will stop watching the mouse pointer and won't scroll the window anymore
 */
export function disarmWindowScroller(): void {
    printDebug(() => "disarming window scroller");
    window.removeEventListener("mousemove", updateMousePosition);
    window.removeEventListener("touchmove", updateMousePosition);
    mousePosition = undefined;
    window.clearTimeout(next);
    resetScrolling();
}
