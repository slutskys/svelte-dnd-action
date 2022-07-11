import { DndEventInfo, Item, TransformDraggedElementFunction } from "./types";

export type Point = {
  x: number;
  y: number;
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
}>

export type ConsiderEvent = CustomEvent<{
  items: Item[];
  info: DndEventInfo;
}>

export type DraggedEnteredEvent = CustomEvent<{
  indexObj: IndexObj;
  draggedEl: Node;
}>

export type DraggedLeftEvent = CustomEvent<{
  draggedEl: Node;
  } & (
  { type: 'outsideOfAny' } |
  { type: 'leftForAnother'; theOtherDz: Node; }
)>

export type DraggedOverIndexEvent = CustomEvent<{
  indexObj: IndexObj;
  draggedEl: Node;
}>

export type DraggedLeftDocumentEvent = CustomEvent<{
  draggedEl: Node;
}>
