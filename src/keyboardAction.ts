import {decrementActiveDropZoneCount, incrementActiveDropZoneCount, ITEM_ID_KEY, SOURCES, TRIGGERS} from "./constants";
import {styleActiveDropZones, styleInactiveDropZones} from "./helpers/styler";
import {dispatchConsiderEvent, dispatchFinalizeEvent} from "./helpers/dispatcher";
import {initAria, alertToScreenReader, destroyAria} from "./helpers/aria";
import {toString} from "./helpers/util";
import {printDebug} from "./constants";
import {Item, Options} from ".";
import {InstructionIDs, InternalConfig} from "./internalTypes";
import {getInternalConfig} from "./config";

let isDragging = false;
let draggedItemType: string | undefined;
let focusedDz: HTMLElement | undefined;
let focusedDzLabel = "";
let focusedItem: Item | undefined;
let focusedItemId: string | undefined;
let focusedItemLabel = "";
const allDragTargets = new WeakSet<Element>();
const elToKeyDownListeners = new WeakMap<HTMLElement, (e: KeyboardEvent) => void>();
const elToFocusListeners = new WeakMap<HTMLElement, (e: MouseEvent) => void>();
const dzToHandles = new Map<HTMLElement, {update: (options: Options) => void; destroy: () => void}>();
const dzToConfig = new Map<HTMLElement, InternalConfig>();
const typeToDropZones = new Map<string, Set<HTMLElement>>();

/* TODO (potentially)
 * what's the deal with the black border of voice-reader not following focus?
 * maybe keep focus on the last dragged item upon drop?
 */

let INSTRUCTION_IDs: InstructionIDs | undefined;

/* drop-zones registration management */
function registerDropZone(dropZoneEl: HTMLElement, type: string) {
    printDebug(() => "registering drop-zone if absent");
    if (typeToDropZones.size === 0) {
        printDebug(() => "adding global keydown and click handlers");
        INSTRUCTION_IDs = initAria();
        window.addEventListener("keydown", globalKeyDownHandler);
        window.addEventListener("click", globalClickHandler);
    }

    if (!typeToDropZones.has(type)) {
        typeToDropZones.set(type, new Set());
    }

    const dropZoneSet = typeToDropZones.get(type);

    if (dropZoneSet && !dropZoneSet.has(dropZoneEl)) {
        dropZoneSet.add(dropZoneEl);
        incrementActiveDropZoneCount();
    }
}
function unregisterDropZone(dropZoneEl: HTMLElement, type: string) {
    printDebug(() => "unregistering drop-zone");
    if (focusedDz === dropZoneEl) {
        handleDrop();
    }

    const dropZoneSet = typeToDropZones.get(type);

    if (!dropZoneSet) {
        return;
    }

    dropZoneSet.delete(dropZoneEl);
    decrementActiveDropZoneCount();

    if (dropZoneSet.size === 0) {
        typeToDropZones.delete(type);
    }

    if (typeToDropZones.size === 0) {
        printDebug(() => "removing global keydown and click handlers");
        window.removeEventListener("keydown", globalKeyDownHandler);
        window.removeEventListener("click", globalClickHandler);
        INSTRUCTION_IDs = undefined;
        destroyAria();
    }
}

function globalKeyDownHandler(e: KeyboardEvent) {
    if (!isDragging) {
        return;
    }

    switch (e.key) {
        case "Escape": {
            handleDrop();
            break;
        }
    }
}

function globalClickHandler() {
    if (!isDragging || !document.activeElement) {
        return;
    }

    if (!allDragTargets.has(document.activeElement)) {
        printDebug(() => "clicked outside of any draggable");
        handleDrop();
    }
}

function handleZoneFocus(e: FocusEvent) {
    printDebug(() => "zone focus");
    if (!isDragging) {
        return;
    }

    const newlyFocusedDz = e.currentTarget;
    if (!focusedDz || newlyFocusedDz === focusedDz || !(newlyFocusedDz instanceof HTMLElement)) {
        return;
    }

    focusedDzLabel = newlyFocusedDz.getAttribute("aria-label") || "";

    const focusedConfig = dzToConfig.get(focusedDz);
    const newlyFocusedConfig = dzToConfig.get(newlyFocusedDz);

    if (!focusedConfig || !newlyFocusedConfig) {
        return;
    }

    const {items: originItems} = focusedConfig;

    const originItem = originItems.find(item => item[ITEM_ID_KEY] === focusedItemId);

    if (!originItem) {
        return;
    }

    if (typeof focusedItemId !== "string") {
        return;
    }

    const originIdx = originItems.indexOf(originItem);
    const itemToMove = originItems.splice(originIdx, 1)[0];
    const {items: targetItems, autoAriaDisabled} = newlyFocusedConfig;
    if (
        newlyFocusedDz.getBoundingClientRect().top < focusedDz.getBoundingClientRect().top ||
        newlyFocusedDz.getBoundingClientRect().left < focusedDz.getBoundingClientRect().left
    ) {
        targetItems.push(itemToMove);
        if (!autoAriaDisabled) {
            alertToScreenReader(`Moved item ${focusedItemLabel} to the end of the list ${focusedDzLabel}`);
        }
    } else {
        targetItems.unshift(itemToMove);
        if (!autoAriaDisabled) {
            alertToScreenReader(`Moved item ${focusedItemLabel} to the beginning of the list ${focusedDzLabel}`);
        }
    }
    const dzFrom = focusedDz;
    dispatchFinalizeEvent(dzFrom, originItems, {trigger: TRIGGERS.DROPPED_INTO_ANOTHER, id: focusedItemId, source: SOURCES.KEYBOARD});
    dispatchFinalizeEvent(newlyFocusedDz, targetItems, {trigger: TRIGGERS.DROPPED_INTO_ZONE, id: focusedItemId, source: SOURCES.KEYBOARD});
    focusedDz = newlyFocusedDz;
}

function triggerAllDzsUpdate() {
    dzToHandles.forEach(({update}, dz) => {
        const config = dzToConfig.get(dz);

        if (config) {
            update(config);
        }
    });
}

function handleDrop(dispatchConsider = true) {
    printDebug(() => "drop");

    if (!focusedDz || typeof focusedItemId !== "string") {
        return;
    }
    const focusedConfig = dzToConfig.get(focusedDz);

    if (!focusedConfig) {
        return;
    }

    if (!focusedConfig.autoAriaDisabled) {
        alertToScreenReader(`Stopped dragging item ${focusedItemLabel}`);
    }

    if (!document.activeElement || !(document.activeElement instanceof HTMLElement)) {
        return;
    }

    if (allDragTargets.has(document.activeElement)) {
        document.activeElement.blur();
    }

    if (dispatchConsider) {
        dispatchConsiderEvent(focusedDz, focusedConfig.items, {
            trigger: TRIGGERS.DRAG_STOPPED,
            id: focusedItemId,
            source: SOURCES.KEYBOARD
        });
    }

    if (draggedItemType) {
        const dropZones = typeToDropZones.get(draggedItemType);

        if (dropZones) {
            styleInactiveDropZones(
                dropZones,
                dz => dzToConfig.get(dz)?.dropTargetStyle ?? {},
                dz => dzToConfig.get(dz)?.dropTargetClasses ?? []
            );
        }
    }
    focusedItem = undefined;
    focusedItemId = undefined;
    focusedItemLabel = "";
    draggedItemType = undefined;
    focusedDz = undefined;
    focusedDzLabel = "";
    isDragging = false;
    triggerAllDzsUpdate();
}

function swap(arr: unknown[], i: number, j: number): void {
    [arr[i], arr[j]] = [arr[j], arr[i]];
}

export function dndzone(node: HTMLElement, options: Options) {
    let config = getInternalConfig(options);

    function handleKeyDown(e: KeyboardEvent) {
        printDebug(() => ["handling key down", e.key]);
        const target = e.target;
        const currentTarget = e.currentTarget;

        if (!(target instanceof HTMLElement) || !(currentTarget instanceof HTMLElement)) {
            return;
        }

        switch (e.key) {
            case "Enter":
            case " ": {
                if (!allDragTargets.has(target)) {
                    if (target.isContentEditable || target instanceof HTMLButtonElement || target instanceof HTMLInputElement) {
                        return;
                    }
                }

                e.preventDefault(); // preventing scrolling on spacebar
                e.stopPropagation();
                if (isDragging) {
                    // TODO - should this trigger a drop? only here or in general (as in when hitting space or enter outside of any zone)?
                    handleDrop();
                } else {
                    // drag start
                    handleDragStart(e);
                }
                break;
            }
            case "ArrowDown":
            case "ArrowRight": {
                if (!isDragging) {
                    return;
                }
                e.preventDefault(); // prevent scrolling
                e.stopPropagation();
                const {items} = config;
                const children = Array.from(node.children);
                const idx = children.indexOf(currentTarget);
                printDebug(() => ["arrow down", idx]);
                if (typeof focusedItemId === "string" && idx < children.length - 1) {
                    if (!config.autoAriaDisabled) {
                        alertToScreenReader(`Moved item ${focusedItemLabel} to position ${idx + 2} in the list ${focusedDzLabel}`);
                    }
                    swap(items, idx, idx + 1);
                    dispatchFinalizeEvent(node, items, {trigger: TRIGGERS.DROPPED_INTO_ZONE, id: focusedItemId, source: SOURCES.KEYBOARD});
                }
                break;
            }
            case "ArrowUp":
            case "ArrowLeft": {
                if (!isDragging) {
                    return;
                }
                e.preventDefault(); // prevent scrolling
                e.stopPropagation();
                const {items} = config;
                const children = Array.from(node.children);
                const idx = children.indexOf(currentTarget);
                printDebug(() => ["arrow up", idx]);
                if (typeof focusedItemId === "string" && idx > 0) {
                    if (!config.autoAriaDisabled) {
                        alertToScreenReader(`Moved item ${focusedItemLabel} to position ${idx} in the list ${focusedDzLabel}`);
                    }
                    swap(items, idx, idx - 1);
                    dispatchFinalizeEvent(node, items, {trigger: TRIGGERS.DROPPED_INTO_ZONE, id: focusedItemId, source: SOURCES.KEYBOARD});
                }
                break;
            }
        }
    }
    function handleDragStart(e: Event) {
        printDebug(() => "drag start");

        const currentTarget = e.currentTarget;

        if (!(currentTarget instanceof HTMLElement)) {
            return;
        }

        setCurrentFocusedItem(currentTarget);
        focusedDz = node;
        draggedItemType = config.type;
        isDragging = true;
        const dropZones = typeToDropZones.get(config.type);

        if (dropZones) {
            const activeDropZones = Array.from(dropZones).filter(dz => {
                if (dz === focusedDz) {
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
        if (!config.autoAriaDisabled) {
            let msg = `Started dragging item ${focusedItemLabel}. Use the arrow keys to move it within its list ${focusedDzLabel}`;
            if (styleActiveDropZones.length > 1) {
                msg += `, or tab to another list in order to move the item into it`;
            }
            alertToScreenReader(msg);
        }
        if (typeof focusedItemId === "string") {
            dispatchConsiderEvent(node, config.items, {trigger: TRIGGERS.DRAG_STARTED, id: focusedItemId, source: SOURCES.KEYBOARD});
        }
        triggerAllDzsUpdate();
    }

    function handleClick(e: MouseEvent) {
        if (!isDragging) {
            return;
        }
        if (e.currentTarget === focusedItem) {
            return;
        }

        e.stopPropagation();
        handleDrop(false);
        handleDragStart(e);
    }
    function setCurrentFocusedItem(draggableEl: HTMLElement) {
        const {items} = config;
        const children = Array.from(node.children);
        const focusedItemIdx = children.indexOf(draggableEl);
        focusedItem = draggableEl;
        focusedItem.tabIndex = 0;
        focusedItemId = items[focusedItemIdx][ITEM_ID_KEY];
        focusedItemLabel = children[focusedItemIdx].getAttribute("aria-label") || "";
    }

    function configure(newConfig: InternalConfig, oldConfig?: InternalConfig) {
        if (oldConfig && oldConfig.type !== newConfig.type) {
            unregisterDropZone(node, oldConfig.type);
        }

        registerDropZone(node, newConfig.type);

        // on browser, is set in the registerDropZone function
        // will only be falsey on the server
        if (!INSTRUCTION_IDs) {
            return;
        }

        if (!newConfig.autoAriaDisabled) {
            node.setAttribute("aria-disabled", newConfig.dragDisabled.toString());
            node.setAttribute("role", "list");
            node.setAttribute("aria-describedby", newConfig.dragDisabled ? INSTRUCTION_IDs.DND_ZONE_DRAG_DISABLED : INSTRUCTION_IDs.DND_ZONE_ACTIVE);
        }

        dzToConfig.set(node, newConfig);

        if (isDragging && focusedItem) {
            node.tabIndex =
                node === focusedDz ||
                focusedItem.contains(node) ||
                newConfig.dropFromOthersDisabled ||
                (focusedDz && newConfig.type !== dzToConfig.get(focusedDz)?.type)
                    ? -1
                    : 0;
        } else {
            node.tabIndex = newConfig.zoneTabIndex;
        }

        node.addEventListener("focus", handleZoneFocus);

        for (let i = 0; i < node.children.length; i++) {
            const draggableEl = node.children[i];

            if (!(draggableEl instanceof HTMLElement)) {
                continue;
            }
            allDragTargets.add(draggableEl);
            draggableEl.tabIndex = isDragging ? -1 : 0;
            if (!newConfig.autoAriaDisabled) {
                draggableEl.setAttribute("role", "listitem");
            }

            const draggableElKeyDownListener = elToKeyDownListeners.get(draggableEl);
            const draggableElFocusListener = elToFocusListeners.get(draggableEl);

            if (draggableElKeyDownListener) {
                draggableEl.removeEventListener("keydown", draggableElKeyDownListener);
            }

            if (draggableElFocusListener) {
                draggableEl.removeEventListener("click", draggableElFocusListener);
            }
            if (!newConfig.dragDisabled) {
                draggableEl.addEventListener("keydown", handleKeyDown);
                elToKeyDownListeners.set(draggableEl, handleKeyDown);
                draggableEl.addEventListener("click", handleClick);
                elToFocusListeners.set(draggableEl, handleClick);
            }
            if (isDragging && config.items[i][ITEM_ID_KEY] === focusedItemId) {
                printDebug(() => ["focusing on", {i, focusedItemId}]);
                // if it is a nested dropzone, it was re-rendered and we need to refresh our pointer
                focusedItem = draggableEl;
                focusedItem.tabIndex = 0;
                // without this the element loses focus if it moves backwards in the list
                draggableEl.focus();
            }
        }
    }

    configure(config);

    const handles = {
        update: (newOptions: Options) => {
            printDebug(() => `keyboard dndzone will update newOptions: ${toString(newOptions)}`);
            const newConfig = getInternalConfig(newOptions);
            configure(newConfig, config);
            config = newConfig;
        },
        destroy: () => {
            printDebug(() => "keyboard dndzone will destroy");
            unregisterDropZone(node, config.type);
            dzToConfig.delete(node);
            dzToHandles.delete(node);
        }
    };
    dzToHandles.set(node, handles);
    return handles;
}
