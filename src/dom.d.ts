import {DraggedEnteredEvent, DraggedLeftDocumentEvent, DraggedLeftEvent, DraggedOverIndexEvent} from "./internalTypes";

declare global {
    interface HTMLElementEventMap {
        draggedEntered: DraggedEnteredEvent;
        draggedLeft: DraggedLeftEvent;
        draggedOverIndex: DraggedOverIndexEvent;
    }

    interface WindowEventMap {
        draggedLeftDocument: DraggedLeftDocumentEvent;
    }
}
