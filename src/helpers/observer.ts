import {findWouldBeIndex, resetIndexesCache, resetIndexesCacheForDz} from "./listUtil";
import {findCenterOfElement, isElementOffDocument} from "./intersection";
import {
    dispatchDraggedElementEnteredContainer,
    dispatchDraggedElementLeftContainerForAnother,
    dispatchDraggedElementLeftContainerForNone,
    dispatchDraggedLeftDocument,
    dispatchDraggedElementIsOverIndex
} from "./dispatcher";
import {makeScroller} from "./scroller";
import {printDebug} from "../constants";
import {Point} from "../internalTypes";

const INTERVAL_MS = 200;
const TOLERANCE_PX = 10;
const {scrollIfNeeded, resetScrolling} = makeScroller();
let next: number | undefined;

/**
 * Tracks the dragged elements and performs the side effects when it is dragged over a drop zone (basically dispatching custom-events scrolling)
 * @param {Set<HTMLElement>} dropZones
 * @param {HTMLElement} draggedEl
 * @param {number} [intervalMs = INTERVAL_MS]
 */
export function observe(draggedEl: HTMLElement, dropZones: Set<HTMLElement>, intervalMs: number = INTERVAL_MS) {
    // initialization
    let lastDropZoneFound: HTMLElement | undefined;
    let lastIndexFound: number | undefined;
    let lastIsDraggedInADropZone = false;
    let lastCentrePositionOfDragged: Point | undefined;

    // We are sorting to make sure that in case of nested zones of the same type the one "on top" is considered first
    const sortedDropZones = Array.from(dropZones).sort((a, b) => {
        const relativePos = a.compareDocumentPosition(b);

        const aContainsB = relativePos & Node.DOCUMENT_POSITION_CONTAINED_BY;
        const bContainsA = relativePos & Node.DOCUMENT_POSITION_CONTAINS;

        if (aContainsB) {
            // since b is "on top", sort it first by returning positive number
            return 1;
        } else if (bContainsA) {
            // since a is "on top", sort it first by returning negative number
            return -1;
        }

        // otherwise fall back to z-index
        const aZIndex = parseFloat(a.style.zIndex || "0");
        const bZIndex = parseFloat(b.style.zIndex || "0");

        return bZIndex - aZIndex;
    });

    /**
     * The main function in this module. Tracks where everything is/ should be a take the actions
     */
    function andNow() {
        const currentCenterOfDragged = findCenterOfElement(draggedEl);

        const scrolled = scrollIfNeeded(currentCenterOfDragged, lastDropZoneFound);

        // we only want to make a new decision after the element was moved a bit to prevent flickering
        if (
            !scrolled &&
            lastCentrePositionOfDragged &&
            Math.abs(lastCentrePositionOfDragged.x - currentCenterOfDragged.x) < TOLERANCE_PX &&
            Math.abs(lastCentrePositionOfDragged.y - currentCenterOfDragged.y) < TOLERANCE_PX
        ) {
            next = window.setTimeout(andNow, intervalMs);
            return;
        }

        if (isElementOffDocument(draggedEl)) {
            printDebug(() => "off document");
            dispatchDraggedLeftDocument(draggedEl);
            return;
        }

        lastCentrePositionOfDragged = currentCenterOfDragged;

        // this is a simple algorithm, potential improvement: first look at lastDropZoneFound
        let isDraggedInADropZone = false;

        for (const dz of sortedDropZones) {
            if (scrolled && lastDropZoneFound) {
                resetIndexesCacheForDz(lastDropZoneFound);
            }

            const indexObj = findWouldBeIndex(draggedEl, dz);

            if (indexObj === null) {
                // it is not inside
                continue;
            }

            const {index} = indexObj;
            isDraggedInADropZone = true;
            // the element is over a container
            if (dz !== lastDropZoneFound) {
                lastDropZoneFound && dispatchDraggedElementLeftContainerForAnother(lastDropZoneFound, draggedEl, dz);
                dispatchDraggedElementEnteredContainer(dz, indexObj, draggedEl);
                lastDropZoneFound = dz;
            } else if (index !== lastIndexFound) {
                dispatchDraggedElementIsOverIndex(dz, indexObj, draggedEl);
                lastIndexFound = index;
            }
            // we handle looping with the 'continue' statement above
            break;
        }
        // the first time the dragged element is not in any dropzone we need to notify the last dropzone it was in
        if (!isDraggedInADropZone && lastIsDraggedInADropZone && lastDropZoneFound) {
            dispatchDraggedElementLeftContainerForNone(lastDropZoneFound, draggedEl);
            lastDropZoneFound = undefined;
            lastIndexFound = undefined;
            lastIsDraggedInADropZone = false;
        } else {
            lastIsDraggedInADropZone = true;
        }

        next = window.setTimeout(andNow, intervalMs);
    }

    andNow();
}

// assumption - we can only observe one dragged element at a time, this could be changed in the future
export function unobserve(): void {
    printDebug(() => "unobserving");
    clearTimeout(next);
    resetScrolling();
    resetIndexesCache();
}
