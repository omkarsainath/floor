// Account namespaces prevent accidental sharing of plans on a shared browser.
// Authentication and admin authorization are independently checked by the server.
const LEGACY_KEYS = ['preciseFloorplan', 'floorplanTimestamp', 'easy2DPlanDraft', 'easy2DSavedPlans', 'easy2DPreviousProject', 'previous3DProjectBackup', 'viewerWalkPreferences'];
let userId = null;

export function activateUserStorage(user, storage = globalThis.localStorage) {
    userId = user.id;
    // Preserve pre-login work for the first administrator on this device.
    // Keep original keys as a recovery copy; regular accounts never read them.
    if (user.role === 'admin' && !storage.getItem('ai3d:legacy-owner')) {
        for (const key of LEGACY_KEYS) {
            const value = storage.getItem(key), target = `ai3d:user:${user.id}:${key}`;
            if (value !== null && storage.getItem(target) === null) storage.setItem(target, value);
        }
        storage.setItem('ai3d:legacy-owner', user.id);
    }
}

export function createUserStorage(id, storage) {
    if (!id) throw Error('Sign in before opening your saved plans.');
    const prefix = `ai3d:user:${id}:`;
    return {
        getItem: key => storage.getItem(prefix + key),
        setItem: (key, value) => storage.setItem(prefix + key, value),
        removeItem: key => storage.removeItem(prefix + key),
    };
}

export const projectStorage = {
    getItem: key => createUserStorage(userId, globalThis.localStorage).getItem(key),
    setItem: (key, value) => createUserStorage(userId, globalThis.localStorage).setItem(key, value),
    removeItem: key => createUserStorage(userId, globalThis.localStorage).removeItem(key),
};
