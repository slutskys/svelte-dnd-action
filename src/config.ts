import {Options} from "./types";
import {InternalConfig} from "./internalTypes";

const DEFAULT_DROP_ZONE_TYPE = "--any--";
const DEFAULT_DROP_TARGET_STYLE = {
    outline: "rgba(255, 255, 102, 0.7) solid 2px"
};

export function getInternalConfig(options: Options): InternalConfig {
    return {
        items: [...options.items],
        flipDurationMs: options.flipDurationMs ?? 0,
        dropAnimationDurationMs: options.flipDurationMs ?? 0,
        type: options.type ?? DEFAULT_DROP_ZONE_TYPE,
        dragDisabled: options.dragDisabled ?? false,
        morphDisabled: options.morphDisabled ?? false,
        dropFromOthersDisabled: options.dropFromOthersDisabled ?? false,
        dropTargetStyle: options.dropTargetStyle ?? DEFAULT_DROP_TARGET_STYLE,
        dropTargetClasses: options.dropTargetClasses ?? [],
        transformDraggedElement: options.transformDraggedElement ?? (() => {}),
        centreDraggedOnCursor: options.centreDraggedOnCursor ?? false
    };
}
