import {calcInnerDistancesBetweenPointAndSidesOfElement} from "./intersection";
import {Point} from "../internalTypes";
const SCROLL_ZONE_PX = 25;

type ScrollingInfo = {
    directionObj: Point | undefined;
    stepPx: number;
};

interface Scroller {
    scrollIfNeeded(pointer: Point, elementToScroll: HTMLElement | undefined): boolean;
    resetScrolling(): void;
}

export function makeScroller(): Scroller {
    let scrollingInfo: ScrollingInfo;

    function resetScrolling() {
        scrollingInfo = {directionObj: undefined, stepPx: 0};
    }

    resetScrolling();
    // directionObj {x: 0|1|-1, y:0|1|-1} - 1 means down in y and right in x
    function scrollContainer(containerEl: HTMLElement) {
        const {directionObj, stepPx} = scrollingInfo;

        if (directionObj) {
            containerEl.scrollBy(directionObj.x * stepPx, directionObj.y * stepPx);
            window.requestAnimationFrame(() => scrollContainer(containerEl));
        }
    }

    function calcScrollStepPx(distancePx: number): number {
        return SCROLL_ZONE_PX - distancePx;
    }

    /**
     * If the pointer is next to the sides of the element to scroll, will trigger scrolling
     * Can be called repeatedly with updated pointer and elementToScroll values without issues
     * @return {boolean} - true if scrolling was needed
     */
    function scrollIfNeeded(pointer: Point, elementToScroll: HTMLElement | undefined): boolean {
        if (!elementToScroll) {
            return false;
        }

        const distances = calcInnerDistancesBetweenPointAndSidesOfElement(pointer, elementToScroll);
        if (distances === null) {
            resetScrolling();
            return false;
        }

        const isAlreadyScrolling = !!scrollingInfo.directionObj;
        let [scrollingVertically, scrollingHorizontally] = [false, false];

        // vertical
        if (elementToScroll.scrollHeight > elementToScroll.clientHeight) {
            if (distances.bottom < SCROLL_ZONE_PX) {
                scrollingVertically = true;
                scrollingInfo.directionObj = {x: 0, y: 1};
                scrollingInfo.stepPx = calcScrollStepPx(distances.bottom);
            } else if (distances.top < SCROLL_ZONE_PX) {
                scrollingVertically = true;
                scrollingInfo.directionObj = {x: 0, y: -1};
                scrollingInfo.stepPx = calcScrollStepPx(distances.top);
            }
            if (!isAlreadyScrolling && scrollingVertically) {
                scrollContainer(elementToScroll);
                return true;
            }
        }

        // horizontal
        if (elementToScroll.scrollWidth > elementToScroll.clientWidth) {
            if (distances.right < SCROLL_ZONE_PX) {
                scrollingHorizontally = true;
                scrollingInfo.directionObj = {x: 1, y: 0};
                scrollingInfo.stepPx = calcScrollStepPx(distances.right);
            } else if (distances.left < SCROLL_ZONE_PX) {
                scrollingHorizontally = true;
                scrollingInfo.directionObj = {x: -1, y: 0};
                scrollingInfo.stepPx = calcScrollStepPx(distances.left);
            }
            if (!isAlreadyScrolling && scrollingHorizontally) {
                scrollContainer(elementToScroll);
                return true;
            }
        }

        resetScrolling();
        return false;
    }

    return {
        scrollIfNeeded,
        resetScrolling
    };
}
