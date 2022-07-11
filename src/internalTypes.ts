import {DndEventInfo, Item, TransformDraggedElementFunction} from "./types";

export type Point = {
    x: number;
    y: number;
};

export type AbsoluteRect = {
    top: number;
    bottom: number;
    left: number;
    right: number;
};

export type Rect = Point &
    AbsoluteRect & {
        width: number;
        height: number;
    };

export type IndexObj = {
    index: number | undefined;
    isProximityBased: boolean;
};

export type GetStyles = (dz: HTMLElement) => Record<string, string>;
export type GetClasses = (dz: HTMLElement) => string[];

export type FinalizeEvent = CustomEvent<{
    items: Item[];
    info: DndEventInfo;
}>;

export type ConsiderEvent = CustomEvent<{
    items: Item[];
    info: DndEventInfo;
}>;

export type DraggedEnteredEvent = CustomEvent<{
    indexObj: IndexObj;
    draggedEl: Node;
}>;

export type DraggedLeftEvent = CustomEvent<
    {
        draggedEl: Node;
    } & ({type: "outsideOfAny"} | {type: "leftForAnother"; theOtherDz: Node})
>;

export type DraggedOverIndexEvent = CustomEvent<{
    indexObj: IndexObj;
    draggedEl: Node;
}>;

export type DraggedLeftDocumentEvent = CustomEvent<{
    draggedEl: Node;
}>;

// the internal representation of the dnd config after default values have been applied
export type InternalConfig = {
    items: Item[];
    type: string;
    flipDurationMs: number;
    dropAnimationDurationMs: number;
    dragDisabled: boolean;
    morphDisabled: boolean;
    dropFromOthersDisabled: boolean;
    dropTargetStyle: Record<string, string>;
    dropTargetClasses: string[];
    transformDraggedElement: TransformDraggedElementFunction;
    autoAriaDisabled?: boolean;
    centreDraggedOnCursor: boolean;
};
