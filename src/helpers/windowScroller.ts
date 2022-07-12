import {makeScroller} from "./scroller";
import {printDebug} from "../constants";
import {resetIndexesCache} from "./listUtil";
import {getPointFromEvent} from "./point";

const INTERVAL_MS = 300;

type MousePosition = {
    x: number;
    y: number;
};

let mousePosition: MousePosition | undefined;

/**
 * Do not use this! it is visible for testing only until we get over the issue Cypress not triggering the mousemove listeners
 * // TODO - make private (remove export)
 * @param {{clientX: number, clientY: number}} e
 */
function updateMousePosition(e: MouseEvent | TouchEvent) {
    mousePosition = getPointFromEvent(e);
}

const {scrollIfNeeded, resetScrolling} = makeScroller();

let next: number | undefined;

function loop(): void {
    if (mousePosition) {
        const scrolled = scrollIfNeeded(mousePosition, document.documentElement);
        if (scrolled) resetIndexesCache();
    }
    next = window.setTimeout(loop, INTERVAL_MS);
}

/**
 * will start watching the mouse pointer and scroll the window if it goes next to the edges
 */
export function armWindowScroller(): void {
    printDebug(() => "arming window scroller");
    window.addEventListener("mousemove", updateMousePosition);
    window.addEventListener("touchmove", updateMousePosition);
    loop();
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
