import type {Properties as CSSProperties} from "csstype";

export type TransformDraggedElementFunction = (
    element?: HTMLElement, // the dragged element.
    draggedElementData?: Item, // the data of the item from the items array
    index?: number // the index the dragged element would get if dropped into the new dnd-zone
) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export declare type Item = Record<string, any>;

export interface Options {
    items: Item[]; // the list of items that was used to generate the children of the given node
    type?: string; // the type of the dnd zone. children dragged from here can only be dropped in other zones of the same type, defaults to a base type
    flipDurationMs?: number; // if the list animated using flip (recommended), specifies the flip duration such that everything syncs with it without conflict
    dragDisabled?: boolean;
    morphDisabled?: boolean;
    dropFromOthersDisabled?: boolean;
    zoneTabIndex?: number; // set the tabindex of the list container when not dragging
    dropTargetClasses?: string[];
    dropTargetStyle?: CSSProperties<string | number>;
    transformDraggedElement?: TransformDraggedElementFunction;
    autoAriaDisabled?: boolean;
    centreDraggedOnCursor?: boolean;
    dropAnimationDurationMs?: number;
}

export interface DndEventInfo {
    trigger: string; // the type of dnd event that took place
    id: string;
    source: string; // the type of interaction that the user used to perform the dnd operation
}

export type DndEvent = {
    items: Item[];
    info: DndEventInfo;
};
