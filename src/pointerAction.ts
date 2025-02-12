import {getInternalConfig} from "./config";
import {
    decrementActiveDropZoneCount,
    incrementActiveDropZoneCount,
    ITEM_ID_KEY,
    printDebug,
    SHADOW_ITEM_MARKER_PROPERTY_NAME,
    SHADOW_PLACEHOLDER_ITEM_ID,
    SOURCES,
    TRIGGERS
} from "./constants";
import {observe, unobserve} from "./helpers/observer";
import {getPointFromEvent} from "./helpers/point";
import {armWindowScroller, disarmWindowScroller} from "./helpers/windowScroller";
import {
    createDraggedElementFrom,
    decorateShadowEl,
    hideElement,
    morphDraggedElementToBeLike,
    moveDraggedElementToWasDroppedState,
    preventShrinking,
    styleActiveDropZones,
    styleDraggable,
    styleInactiveDropZones,
    unDecorateShadowElement
} from "./helpers/styler";
import {
    dispatchConsiderEvent,
    dispatchFinalizeEvent,
    DRAGGED_ENTERED_EVENT_NAME,
    DRAGGED_LEFT_DOCUMENT_EVENT_NAME,
    DRAGGED_LEFT_EVENT_NAME,
    DRAGGED_LEFT_TYPES,
    DRAGGED_OVER_INDEX_EVENT_NAME
} from "./helpers/dispatcher";
import {areArraysShallowEqualSameOrder, areObjectsShallowEqual, toString} from "./helpers/util";
import {getBoundingRectNoTransforms} from "./helpers/intersection";
import {Item, Options} from "./types";
import {DraggedEnteredEvent, DraggedLeftEvent, DraggedOverIndexEvent, InternalConfig, Point} from "./internalTypes";

const MIN_OBSERVATION_INTERVAL_MS = 100;
const MIN_MOVEMENT_BEFORE_DRAG_START_PX = 3;

let originalDragTarget: HTMLElement | undefined;
let draggedEl: HTMLElement | undefined;
let draggedElData: Item | undefined;
let draggedElType: string | undefined;
let originDropZone: HTMLElement | undefined;
let originIndex: number | undefined;
let shadowElData: Item | undefined;
let shadowElDropZone: HTMLElement | undefined;
let dragStartMousePosition: Point | undefined;
let currentMousePosition: Point | undefined;
let isWorkingOnPreviousDrag = false;
let finalizingPreviousDrag = false;
let unlockOriginDzMinDimensions: (() => void) | undefined;
let isDraggedOutsideOfAnyDz = false;
let scheduledForRemovalAfterDrop: {dz: HTMLElement; destroy(): void}[] = [];

// a map from type to a set of drop-zones
const typeToDropZones = new Map<string, Set<HTMLElement>>();
// important - this is needed because otherwise the config that would be used for everyone is the config of the element that created the event listeners
const dzToConfig = new Map<HTMLElement, InternalConfig>();
// this is needed in order to be able to cleanup old listeners and avoid stale closures issues (as the listener is defined within each zone)
const elToMouseDownListener = new WeakMap<HTMLElement, (e: MouseEvent | TouchEvent) => void>();

/* drop-zones registration management */
function registerDropZone(dropZoneEl: HTMLElement, type: string) {
    printDebug(() => "registering drop-zone if absent");
    if (!typeToDropZones.has(type)) {
        typeToDropZones.set(type, new Set());
    }

    const dropZoneSet = typeToDropZones.get(type);

    if (dropZoneSet && !dropZoneSet.has(dropZoneEl)) {
        dropZoneSet.add(dropZoneEl); // dropZoneSet is reference, will add dropZoneEl to set in map
        incrementActiveDropZoneCount();
    }
}

function unregisterDropZone(dropZoneEl: HTMLElement, type: string) {
    const dropZoneSet = typeToDropZones.get(type);

    if (!dropZoneSet) {
        return;
    }

    dropZoneSet.delete(dropZoneEl);
    decrementActiveDropZoneCount();

    if (dropZoneSet.size === 0) {
        typeToDropZones.delete(type);
    }
}

/* functions to manage observing the dragged element and trigger custom drag-events */
function watchDraggedElement(containerEl: HTMLElement | undefined) {
    printDebug(() => "watching dragged element");
    armWindowScroller(containerEl);

    if (!draggedEl) {
        return;
    }

    if (typeof draggedElType !== "string") {
        return;
    }

    const dropZones = typeToDropZones.get(draggedElType);

    window.addEventListener(DRAGGED_LEFT_DOCUMENT_EVENT_NAME, handleDrop);
    if (dropZones) {
        for (const dz of dropZones) {
            dz.addEventListener(DRAGGED_ENTERED_EVENT_NAME, handleDraggedEntered);
            dz.addEventListener(DRAGGED_LEFT_EVENT_NAME, handleDraggedLeft);
            dz.addEventListener(DRAGGED_OVER_INDEX_EVENT_NAME, handleDraggedIsOverIndex);
        }

        // it is important that we don't have an interval that is faster than the flip duration because it can cause elements to jump bach and forth
        const observationIntervalMs = Math.max(
            MIN_OBSERVATION_INTERVAL_MS,
            ...Array.from(dropZones.keys()).map(dz => dzToConfig.get(dz)?.dropAnimationDurationMs ?? 0)
        );
        observe(draggedEl, dropZones, observationIntervalMs * 1.07);
    }
}
function unWatchDraggedElement() {
    printDebug(() => "unwatching dragged element");
    disarmWindowScroller();

    if (!draggedElType) {
        return;
    }

    const dropZones = typeToDropZones.get(draggedElType);

    if (!dropZones) {
        return;
    }

    window.removeEventListener(DRAGGED_LEFT_DOCUMENT_EVENT_NAME, handleDrop);

    if (dropZones) {
        for (const dz of dropZones) {
            dz.removeEventListener(DRAGGED_ENTERED_EVENT_NAME, handleDraggedEntered);
            dz.removeEventListener(DRAGGED_LEFT_EVENT_NAME, handleDraggedLeft);
            dz.removeEventListener(DRAGGED_OVER_INDEX_EVENT_NAME, handleDraggedIsOverIndex);
        }
    }
    unobserve();
}

// finds the initial placeholder that is placed there on drag start
function findShadowPlaceHolderIdx(items: Item[]): number {
    return items.findIndex(item => item[ITEM_ID_KEY] === SHADOW_PLACEHOLDER_ITEM_ID);
}
function findShadowElementIdx(items: Item[]): number {
    // checking that the id is not the placeholder's for Dragula like usecases
    return items.findIndex(item => !!item[SHADOW_ITEM_MARKER_PROPERTY_NAME] && item[ITEM_ID_KEY] !== SHADOW_PLACEHOLDER_ITEM_ID);
}

/* custom drag-events handlers */
function handleDraggedEntered(e: DraggedEnteredEvent) {
    printDebug(() => ["dragged entered", e.currentTarget, e.detail]);

    const currentTarget = e.currentTarget;

    if (!(currentTarget instanceof HTMLElement)) {
        return;
    }

    const config = dzToConfig.get(currentTarget);

    if (!config) {
        return;
    }

    let {items} = config;
    const {dropFromOthersDisabled} = config;

    if (dropFromOthersDisabled && e.currentTarget !== originDropZone) {
        printDebug(() => "ignoring dragged entered because drop is currently disabled");
        return;
    }
    isDraggedOutsideOfAnyDz = false;
    // this deals with another race condition. in rare occasions (super rapid operations) the list hasn't updated yet
    items = items.filter(item => item[ITEM_ID_KEY] !== shadowElData?.[ITEM_ID_KEY]);
    printDebug(() => `dragged entered items ${toString(items)}`);

    if (draggedElData && originDropZone && originDropZone !== currentTarget) {
        const originZoneItems = dzToConfig.get(originDropZone)?.items ?? [];
        const newOriginZoneItems = originZoneItems.filter(item => !item[SHADOW_ITEM_MARKER_PROPERTY_NAME]);
        dispatchConsiderEvent(originDropZone, newOriginZoneItems, {
            trigger: TRIGGERS.DRAGGED_ENTERED_ANOTHER,
            id: draggedElData[ITEM_ID_KEY],
            source: SOURCES.POINTER
        });
    } else {
        const shadowPlaceHolderIdx = findShadowPlaceHolderIdx(items);
        if (shadowPlaceHolderIdx !== -1) {
            // only happens right after drag start, on the first drag entered event
            printDebug(() => "removing placeholder item from origin dz");
            items.splice(shadowPlaceHolderIdx, 1);
        }
    }

    const {index, isProximityBased} = e.detail.indexObj;
    const shadowElIdx = isProximityBased && index === currentTarget.children.length - 1 ? index + 1 : index;
    shadowElDropZone = currentTarget;

    if (typeof shadowElIdx === "number" && shadowElIdx !== -1 && shadowElData) {
        items.splice(shadowElIdx, 0, shadowElData);
    }

    if (draggedElData) {
        dispatchConsiderEvent(currentTarget, items, {trigger: TRIGGERS.DRAGGED_ENTERED, id: draggedElData[ITEM_ID_KEY], source: SOURCES.POINTER});
    }
}

function handleDraggedLeft(e: DraggedLeftEvent) {
    // dealing with a rare race condition on extremely rapid clicking and dropping
    if (!isWorkingOnPreviousDrag) {
        return;
    }

    printDebug(() => ["dragged left", e.currentTarget, e.detail]);

    const currentTarget = e.currentTarget;

    if (!(currentTarget instanceof HTMLElement)) {
        return;
    }

    const config = dzToConfig.get(currentTarget);

    if (!config) {
        return;
    }

    const {items, dropFromOthersDisabled} = config;

    if (dropFromOthersDisabled && currentTarget !== originDropZone && currentTarget !== shadowElDropZone) {
        printDebug(() => "drop is currently disabled");
        return;
    }

    const shadowElIdx = findShadowElementIdx(items);

    // sometimes on fast updates, the zone that we're leaving hasn't had the chance to have its config updated before the drag zone is left
    // which causes buggy behaviour, as try to splice `undefined` at the start of the originZoneItems
    // we don't want to do any of the behaviour after this behaviour, as if there's no shadowElIdx, then we can't splice it out of the items array
    // when dispatching the consider event
    if (shadowElIdx === -1) {
        return;
    }

    shadowElDropZone = undefined;

    let isOutsideAnyDz = false;

    if (e.detail.type === DRAGGED_LEFT_TYPES.OUTSIDE_OF_ANY) {
        isOutsideAnyDz = true;
    } else if (
        e.detail.type === DRAGGED_LEFT_TYPES.LEFT_FOR_ANOTHER &&
        e.detail.theOtherDz !== originDropZone &&
        e.detail.theOtherDz instanceof HTMLElement
    ) {
        const otherDzConig = dzToConfig.get(e.detail.theOtherDz);

        if (otherDzConig) {
            // default value is false, so cast boolean | undefined to boolean
            isOutsideAnyDz = !!otherDzConig.dropFromOthersDisabled;
        }
    }

    const shadowItem = items.splice(shadowElIdx, 1)[0];

    if (isOutsideAnyDz && originDropZone) {
        printDebug(() => "dragged left all, putting shadow element back in the origin dz");
        isDraggedOutsideOfAnyDz = true;
        shadowElDropZone = originDropZone;

        const originDzConfig = dzToConfig.get(originDropZone);

        if (draggedElData && originDzConfig && typeof originIndex === "number") {
            const originZoneItems = originDzConfig.items;
            originZoneItems.splice(originIndex, 0, shadowItem);

            dispatchConsiderEvent(originDropZone, originZoneItems, {
                trigger: TRIGGERS.DRAGGED_LEFT_ALL,
                id: draggedElData[ITEM_ID_KEY],
                source: SOURCES.POINTER
            });
        }
    }

    if (draggedElData) {
        // for the origin dz, when the dragged is outside of any, this will be fired in addition to the previous. this is for simplicity
        dispatchConsiderEvent(currentTarget, items, {
            trigger: TRIGGERS.DRAGGED_LEFT,
            id: draggedElData[ITEM_ID_KEY],
            source: SOURCES.POINTER
        });
    }
}

function handleDraggedIsOverIndex(e: DraggedOverIndexEvent) {
    printDebug(() => ["dragged is over index", e.currentTarget, e.detail]);

    const currentTarget = e.currentTarget;

    if (!(currentTarget instanceof HTMLElement)) {
        return;
    }

    const config = dzToConfig.get(currentTarget);

    if (!config) {
        return;
    }

    const {items, dropFromOthersDisabled} = config;
    if (dropFromOthersDisabled && e.currentTarget !== originDropZone) {
        printDebug(() => "drop is currently disabled");
        return;
    }
    isDraggedOutsideOfAnyDz = false;
    const {index} = e.detail.indexObj;
    const shadowElIdx = findShadowElementIdx(items);

    if (shadowElData && draggedElData && typeof index === "number" && shadowElIdx !== -1) {
        items.splice(shadowElIdx, 1);
        items.splice(index, 0, shadowElData);
        dispatchConsiderEvent(currentTarget, items, {trigger: TRIGGERS.DRAGGED_OVER_INDEX, id: draggedElData[ITEM_ID_KEY], source: SOURCES.POINTER});
    }
}

// Global mouse/touch-events handlers
function handleMouseMove(e: MouseEvent | TouchEvent) {
    e.preventDefault();

    if (!draggedEl || !dragStartMousePosition) {
        return;
    }

    currentMousePosition = getPointFromEvent(e);

    draggedEl.style.transform = `translate3d(${currentMousePosition.x - dragStartMousePosition.x}px, ${
        currentMousePosition.y - dragStartMousePosition.y
    }px, 0)`;
}

function handleDrop() {
    printDebug(() => "dropped");
    finalizingPreviousDrag = true;
    // cleanup
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("touchmove", handleMouseMove);
    window.removeEventListener("mouseup", handleDrop);
    window.removeEventListener("touchend", handleDrop);
    unWatchDraggedElement();

    if (draggedEl) {
        moveDraggedElementToWasDroppedState(draggedEl);
    }

    if (!shadowElDropZone) {
        printDebug(() => "element was dropped right after it left origin but before entering somewhere else");
        shadowElDropZone = originDropZone;
    }
    printDebug(() => ["dropped in dz", shadowElDropZone]);

    if (!shadowElDropZone) {
        return;
    }

    const shadowElConfig = dzToConfig.get(shadowElDropZone);

    if (!shadowElConfig) {
        return;
    }

    let {items} = shadowElConfig;
    const {type} = shadowElConfig;

    if (type) {
        const dropZones = typeToDropZones.get(type);

        if (dropZones) {
            styleInactiveDropZones(
                dropZones,
                dz => dzToConfig.get(dz)?.dropTargetStyle ?? {},
                dz => dzToConfig.get(dz)?.dropTargetClasses ?? []
            );
        }
    }

    let shadowElIdx = findShadowElementIdx(items);
    // the handler might remove the shadow element, ex: dragula like copy on drag
    if (shadowElIdx === -1 && typeof originIndex === "number") {
        shadowElIdx = originIndex;
    }

    items = items.map(item => (item[SHADOW_ITEM_MARKER_PROPERTY_NAME] && draggedElData ? draggedElData : item));

    function finalizeWithinZone() {
        unlockOriginDzMinDimensions?.();

        if (shadowElDropZone && draggedElData) {
            dispatchFinalizeEvent(shadowElDropZone, items, {
                trigger: isDraggedOutsideOfAnyDz ? TRIGGERS.DROPPED_OUTSIDE_OF_ANY : TRIGGERS.DROPPED_INTO_ZONE,
                id: draggedElData[ITEM_ID_KEY],
                source: SOURCES.POINTER
            });
        }

        if (draggedElData && originDropZone && shadowElDropZone !== originDropZone) {
            // letting the origin drop zone know the element was permanently taken away
            dispatchFinalizeEvent(originDropZone, dzToConfig.get(originDropZone)?.items ?? [], {
                trigger: TRIGGERS.DROPPED_INTO_ANOTHER,
                id: draggedElData[ITEM_ID_KEY],
                source: SOURCES.POINTER
            });
        }
        const child = shadowElDropZone?.children[shadowElIdx];

        if (child && child instanceof HTMLElement) {
            unDecorateShadowElement(child);
        }
        cleanupPostDrop();
    }

    animateDraggedToFinalPosition(shadowElIdx, finalizeWithinZone);
}

// helper function for handleDrop
function animateDraggedToFinalPosition(shadowElIdx: number, callback: () => void) {
    if (!shadowElDropZone) {
        return;
    }

    const child = shadowElDropZone.children[shadowElIdx];

    if (child && child instanceof HTMLElement && draggedEl) {
        const shadowElRect = getBoundingRectNoTransforms(child);
        const newTransform = {
            x: shadowElRect.left - parseFloat(draggedEl.style.left),
            y: shadowElRect.top - parseFloat(draggedEl.style.top)
        };

        const config = dzToConfig.get(shadowElDropZone);

        const dropAnimationDurationMs = config?.dropAnimationDurationMs ?? 0;
        const transition = `transform ${dropAnimationDurationMs}ms ease`;
        draggedEl.style.transition = draggedEl.style.transition ? draggedEl.style.transition + "," + transition : transition;
        draggedEl.style.transform = `translate3d(${newTransform.x}px, ${newTransform.y}px, 0)`;
        window.setTimeout(callback, dropAnimationDurationMs);
    }
}

function scheduleDZForRemovalAfterDrop(dz: HTMLElement, destroy: () => void) {
    scheduledForRemovalAfterDrop.push({dz, destroy});
    window.requestAnimationFrame(() => {
        hideElement(dz);
        document.body.appendChild(dz);
    });
}

/* cleanup */
function cleanupPostDrop() {
    draggedEl?.remove();
    originalDragTarget?.remove();

    if (scheduledForRemovalAfterDrop.length) {
        printDebug(() => ["will destroy zones that were removed during drag", scheduledForRemovalAfterDrop]);
        scheduledForRemovalAfterDrop.forEach(({dz, destroy}) => {
            destroy();
            dz.remove();
        });
        scheduledForRemovalAfterDrop = [];
    }
    draggedEl = undefined;
    originalDragTarget = undefined;
    draggedElData = undefined;
    draggedElType = undefined;
    originDropZone = undefined;
    originIndex = undefined;
    shadowElData = undefined;
    shadowElDropZone = undefined;
    dragStartMousePosition = undefined;
    currentMousePosition = undefined;
    isWorkingOnPreviousDrag = false;
    finalizingPreviousDrag = false;
    unlockOriginDzMinDimensions = undefined;
    isDraggedOutsideOfAnyDz = false;
}

export function dndzone(node: HTMLElement, options: Options) {
    let initialized = false;
    let config = getInternalConfig(options);

    printDebug(() => [`dndzone good to go options: ${toString(options)}, config: ${toString(config)}`, {node}]);
    const elToIdx = new Map<HTMLElement, number>();

    function addMaybeListeners() {
        window.addEventListener("mousemove", handleMouseMoveMaybeDragStart, {passive: false});
        window.addEventListener("touchmove", handleMouseMoveMaybeDragStart, {passive: false, capture: false});
        window.addEventListener("mouseup", handleFalseAlarm, {passive: false});
        window.addEventListener("touchend", handleFalseAlarm, {passive: false});
    }
    function removeMaybeListeners() {
        window.removeEventListener("mousemove", handleMouseMoveMaybeDragStart);
        window.removeEventListener("touchmove", handleMouseMoveMaybeDragStart);
        window.removeEventListener("mouseup", handleFalseAlarm);
        window.removeEventListener("touchend", handleFalseAlarm);
    }
    function handleFalseAlarm() {
        removeMaybeListeners();
        originalDragTarget = undefined;
        dragStartMousePosition = undefined;
        currentMousePosition = undefined;
    }

    function handleMouseMoveMaybeDragStart(e: MouseEvent | TouchEvent) {
        e.preventDefault();
        currentMousePosition = getPointFromEvent(e);

        if (!dragStartMousePosition) {
            return;
        }

        if (
            Math.abs(currentMousePosition.x - dragStartMousePosition.x) >= MIN_MOVEMENT_BEFORE_DRAG_START_PX ||
            Math.abs(currentMousePosition.y - dragStartMousePosition.y) >= MIN_MOVEMENT_BEFORE_DRAG_START_PX
        ) {
            removeMaybeListeners();
            handleDragStart();
        }
    }

    function handleMouseDown(e: MouseEvent | TouchEvent) {
        // on safari clicking on a select element doesn't fire mouseup at the end of the click and in general this makes more sense
        const currentTarget = e.currentTarget;
        const target = e.currentTarget;

        if (!(currentTarget instanceof HTMLElement) || !(target instanceof HTMLElement)) {
            return;
        }

        if (target !== currentTarget && target instanceof HTMLInputElement && target.isContentEditable) {
            printDebug(() => "won't initiate drag on a nested input element");
            return;
        }
        // prevents responding to any button but left click which equals 0 (which is falsy)
        if ("button" in e && e.button) {
            printDebug(() => `ignoring none left click button: ${e.button}`);
            return;
        }
        if (isWorkingOnPreviousDrag) {
            printDebug(() => "cannot start a new drag before finalizing previous one");
            return;
        }
        e.stopPropagation();
        dragStartMousePosition = getPointFromEvent(e);
        currentMousePosition = {...dragStartMousePosition};
        originalDragTarget = currentTarget;
        addMaybeListeners();
    }

    function handleDragStart() {
        printDebug(() => [`drag start config: ${toString(config)}`, originalDragTarget]);
        isWorkingOnPreviousDrag = true;

        if (!originalDragTarget) {
            return;
        }

        // initialising globals
        const currentIdx = elToIdx.get(originalDragTarget);

        if (typeof currentIdx !== "number") {
            return;
        }
        originIndex = currentIdx;

        originDropZone = originalDragTarget.parentElement ?? undefined;

        if (!originDropZone) {
            return;
        }

        const rootNode = originDropZone.getRootNode();

        let originDropZoneRoot: Node;

        if (rootNode instanceof Document) {
            originDropZoneRoot = rootNode.body;
        } else {
            originDropZoneRoot = rootNode;
        }

        const {items, type, centreDraggedOnCursor} = config;

        if (!items) {
            return;
        }

        draggedElData = {...items[currentIdx]};
        draggedElType = type;
        shadowElData = {...draggedElData, [SHADOW_ITEM_MARKER_PROPERTY_NAME]: true};
        // The initial shadow element. We need a different id at first in order to avoid conflicts and timing issues
        const placeHolderElData = {...shadowElData, [ITEM_ID_KEY]: SHADOW_PLACEHOLDER_ITEM_ID};

        // creating the draggable element
        draggedEl = createDraggedElementFrom(originalDragTarget, centreDraggedOnCursor ? currentMousePosition : undefined);

        // We will keep the original dom node in the dom because touch events keep firing on it, we want to re-add it after the framework removes it
        function keepOriginalElementInDom() {
            if (draggedEl) {
                if (!draggedEl.parentElement) {
                    originDropZoneRoot.appendChild(draggedEl);
                    // to prevent the outline from disappearing
                    draggedEl.focus();
                    watchDraggedElement(config.scrollableContainerElement);

                    if (originalDragTarget) {
                        hideElement(originalDragTarget);
                        originDropZoneRoot.appendChild(originalDragTarget);
                    }
                } else {
                    window.requestAnimationFrame(keepOriginalElementInDom);
                }
            }
        }
        window.requestAnimationFrame(keepOriginalElementInDom);

        if (type) {
            const dropZones = typeToDropZones.get(type);

            if (dropZones) {
                const activeDropZones = Array.from(dropZones).filter(dz => {
                    if (dz === originDropZone) {
                        return true;
                    }

                    const dropDisabled = dzToConfig.get(dz)?.dropFromOthersDisabled;

                    return !dropDisabled;
                });

                styleActiveDropZones(
                    activeDropZones,
                    dz => dzToConfig.get(dz)?.dropTargetStyle ?? {},
                    dz => dzToConfig.get(dz)?.dropTargetClasses ?? []
                );
            }
        }

        // removing the original element by removing its data entry
        items.splice(currentIdx, 1, placeHolderElData);
        unlockOriginDzMinDimensions = preventShrinking(originDropZone);

        dispatchConsiderEvent(originDropZone, items, {trigger: TRIGGERS.DRAG_STARTED, id: draggedElData[ITEM_ID_KEY], source: SOURCES.POINTER});

        // handing over to global handlers - starting to watch the element
        window.addEventListener("mousemove", handleMouseMove, {passive: false});
        window.addEventListener("touchmove", handleMouseMove, {passive: false, capture: false});
        window.addEventListener("mouseup", handleDrop, {passive: false});
        window.addEventListener("touchend", handleDrop, {passive: false});
    }

    function configure(newConfig: InternalConfig, oldConfig?: InternalConfig) {
        if (oldConfig && oldConfig.type !== newConfig.type) {
            unregisterDropZone(node, oldConfig.type);
        }

        registerDropZone(node, newConfig.type);

        if (initialized && isWorkingOnPreviousDrag && !finalizingPreviousDrag) {
            const stylesChanged = !oldConfig || areObjectsShallowEqual(oldConfig.dropTargetStyle, newConfig.dropTargetStyle);
            const classesChanged = !oldConfig || areArraysShallowEqualSameOrder(oldConfig.dropTargetClasses, newConfig.dropTargetClasses);

            if (stylesChanged || classesChanged) {
                styleInactiveDropZones(
                    [node],
                    () => newConfig.dropTargetStyle,
                    () => newConfig.dropTargetClasses
                );
                styleActiveDropZones(
                    [node],
                    () => newConfig.dropTargetStyle,
                    () => newConfig.dropTargetClasses
                );
            }
        }

        // realtime update for dropFromOthersDisabled
        // won't have a drag active on first run of this function, so can skip if oldConfig is not defined
        if (initialized && isWorkingOnPreviousDrag && oldConfig && oldConfig.dropFromOthersDisabled !== newConfig.dropFromOthersDisabled) {
            if (newConfig.dropFromOthersDisabled) {
                styleInactiveDropZones(
                    [node],
                    dz => dzToConfig.get(dz)?.dropTargetStyle ?? newConfig.dropTargetStyle,
                    dz => dzToConfig.get(dz)?.dropTargetClasses ?? newConfig.dropTargetClasses
                );
            } else {
                styleActiveDropZones(
                    [node],
                    dz => dzToConfig.get(dz)?.dropTargetStyle ?? newConfig.dropTargetStyle,
                    dz => dzToConfig.get(dz)?.dropTargetClasses ?? newConfig.dropTargetClasses
                );
            }
        }

        dzToConfig.set(node, newConfig);
        const shadowElIdx = findShadowElementIdx(newConfig.items);
        for (let idx = 0; idx < node.children.length; idx++) {
            const draggableEl = node.children[idx];

            if (!(draggableEl instanceof HTMLElement)) {
                continue;
            }

            styleDraggable(draggableEl, newConfig.dragDisabled);
            if (idx === shadowElIdx) {
                if (draggedEl && !newConfig.morphDisabled && currentMousePosition) {
                    morphDraggedElementToBeLike(draggedEl, draggableEl, currentMousePosition.x, currentMousePosition.y);
                }
                decorateShadowEl(draggableEl);
                continue;
            }

            const draggableElMouseDownListener = elToMouseDownListener.get(draggableEl);

            if (draggableElMouseDownListener) {
                draggableEl.removeEventListener("mousedown", draggableElMouseDownListener);
                draggableEl.removeEventListener("touchstart", draggableElMouseDownListener);
            }

            if (!newConfig.dragDisabled) {
                draggableEl.addEventListener("mousedown", handleMouseDown);
                draggableEl.addEventListener("touchstart", handleMouseDown);
                elToMouseDownListener.set(draggableEl, handleMouseDown);
            }
            // updating the idx
            elToIdx.set(draggableEl, idx);

            if (!initialized) {
                initialized = true;
            }
        }
    }
    configure(config);

    return {
        update: (newOptions: Options) => {
            printDebug(() => `pointer dndzone will update newOptions: ${toString(newOptions)}`);
            const newConfig = getInternalConfig(newOptions);

            configure(newConfig, config);
            config = newConfig;
        },
        destroy: () => {
            function destroyDz() {
                printDebug(() => "pointer dndzone will destroy");
                const type = dzToConfig.get(node)?.type;

                if (type) {
                    unregisterDropZone(node, type);
                }

                dzToConfig.delete(node);
            }

            if (isWorkingOnPreviousDrag) {
                printDebug(() => "pointer dndzone will be scheduled for destruction");
                scheduleDZForRemovalAfterDrop(node, destroyDz);
            } else {
                destroyDz();
            }
        }
    };
}
