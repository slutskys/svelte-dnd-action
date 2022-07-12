import {Point} from "../internalTypes";

export function getPointFromEvent(e: MouseEvent | TouchEvent): Point {
    if ("touches" in e) {
        return {x: e.touches[0].clientX, y: e.touches[0].clientY};
    } else {
        return {x: e.clientX, y: e.clientY};
    }
}
