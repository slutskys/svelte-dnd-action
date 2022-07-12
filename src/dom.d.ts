import {ConsiderEvent, DraggedEnteredEvent, DraggedLeftDocumentEvent, DraggedLeftEvent, DraggedOverIndexEvent, FinalizeEvent} from "./internalTypes";

declare global {
    interface HTMLElementEventMap {
        draggedEntered: DraggedEnteredEvent;
        draggedLeft: DraggedLeftEvent;
        draggedOverIndex: DraggedOverIndexEvent;
        finalize: FinalizeEvent;
        consider: ConsiderEvent;
    }

    interface WindowEventMap {
        draggedLeftDocument: DraggedLeftDocumentEvent;
    }
}
