/**
 * @param {Object} object
 * @return {string}
 */
export function toString(object: unknown): string {
    return JSON.stringify(object, null, 2);
}

/**
 * A simple util to shallow compare objects quickly, it doesn't validate the arguments so pass objects in
 * @param {Object} objA
 * @param {Object} objB
 * @return {boolean} - true if objA and objB are shallow equal
 */
export function areObjectsShallowEqual<T>(objA: T, objB: T): boolean {
    if (Object.keys(objA).length !== Object.keys(objB).length) {
        return false;
    }

    for (const keyA in objA) {
        if (!{}.hasOwnProperty.call(objB, keyA) || objB[keyA] !== objA[keyA]) {
            return false;
        }
    }

    return true;
}

/**
 * Shallow compares two arrays
 * @param arrA
 * @param arrB
 * @return {boolean} - whether the arrays are shallow equal
 */
export function areArraysShallowEqualSameOrder<T>(arrA: T[], arrB: T[]): boolean {
    if (arrA.length !== arrB.length) {
        return false;
    }

    for (let i = 0; i < arrA.length; i++) {
        if (arrA[i] !== arrB[i]) {
            return false;
        }
    }

    return true;
}
