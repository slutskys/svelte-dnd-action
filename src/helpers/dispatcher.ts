import {
    ConsiderEvent,
    DraggedEnteredEvent,
    DraggedLeftDocumentEvent,
    DraggedLeftEvent,
    DraggedOverIndexEvent,
    FinalizeEvent,
    IndexObj
} from "../internalTypes";
import {DndEventInfo, Item} from "../types";

// external events
const FINALIZE_EVENT_NAME = "finalize";
const CONSIDER_EVENT_NAME = "consider";

/**
 * @typedef {Object} Info
 * @property {string} trigger
 * @property {string} id
 * @property {string} source
 * @param {Node} el
 * @param {Array} items
 * @param {Info} info
 */
export function dispatchFinalizeEvent(el: Node, items: Item[], info: DndEventInfo) {
    const event: FinalizeEvent = new CustomEvent(FINALIZE_EVENT_NAME, {
        detail: {items, info}
    });
    el.dispatchEvent(event);
}

/**
 * Dispatches a consider event
 * @param {Node} el
 * @param {Array} items
 * @param {Info} info
 */
export function dispatchConsiderEvent(el: Node, items: Item[], info: DndEventInfo) {
    const event: ConsiderEvent = new CustomEvent(CONSIDER_EVENT_NAME, {
        detail: {items, info}
    });
    el.dispatchEvent(event);
}

// internal events
export const DRAGGED_ENTERED_EVENT_NAME = "draggedEntered";
export const DRAGGED_LEFT_EVENT_NAME = "draggedLeft";
export const DRAGGED_OVER_INDEX_EVENT_NAME = "draggedOverIndex";
export const DRAGGED_LEFT_DOCUMENT_EVENT_NAME = "draggedLeftDocument";

export const DRAGGED_LEFT_TYPES = {
    LEFT_FOR_ANOTHER: "leftForAnother",
    OUTSIDE_OF_ANY: "outsideOfAny"
} as const;

export function dispatchDraggedElementEnteredContainer(containerEl: Node, indexObj: IndexObj, draggedEl: Node) {
    const event: DraggedEnteredEvent = new CustomEvent(DRAGGED_ENTERED_EVENT_NAME, {
        detail: {indexObj, draggedEl}
    });

    containerEl.dispatchEvent(event);
}

/**
 * @param containerEl - the dropzone the element left
 * @param draggedEl - the dragged element
 * @param theOtherDz - the new dropzone the element entered
 */
export function dispatchDraggedElementLeftContainerForAnother(containerEl: Node, draggedEl: Node, theOtherDz: Node) {
    const event: DraggedLeftEvent = new CustomEvent(DRAGGED_LEFT_EVENT_NAME, {
        detail: {draggedEl, type: DRAGGED_LEFT_TYPES.LEFT_FOR_ANOTHER, theOtherDz}
    });

    containerEl.dispatchEvent(event);
}

export function dispatchDraggedElementLeftContainerForNone(containerEl: Node, draggedEl: Node) {
    const event: DraggedLeftEvent = new CustomEvent(DRAGGED_LEFT_EVENT_NAME, {
        detail: {draggedEl, type: DRAGGED_LEFT_TYPES.OUTSIDE_OF_ANY}
    });

    containerEl.dispatchEvent(event);
}

export function dispatchDraggedElementIsOverIndex(containerEl: Node, indexObj: IndexObj, draggedEl: Node) {
    const event: DraggedOverIndexEvent = new CustomEvent(DRAGGED_OVER_INDEX_EVENT_NAME, {
        detail: {indexObj, draggedEl}
    });

    containerEl.dispatchEvent(event);
}
export function dispatchDraggedLeftDocument(draggedEl: Node) {
    const event: DraggedLeftDocumentEvent = new CustomEvent(DRAGGED_LEFT_DOCUMENT_EVENT_NAME, {
        detail: {draggedEl}
    });

    window.dispatchEvent(event);
}
