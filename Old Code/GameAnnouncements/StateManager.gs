/**
 * Manages user session state using Google Apps Script's CacheService.
 * Necessary for multi-step wizards in a stateless webhook environment.
 */
class StateManager {
    /**
     * Retrieves and deserializes the state for a specific user.
     * * @param {number|string} userId The unique Telegram user ID.
     * @return {Object|null} The parsed state object, or null if expired/not found.
     */
    static getState(userId) {
        const cache = CacheService.getScriptCache();
        const data = cache.get(`state_${userId}`);
        return data ? JSON.parse(data) : null;
    }

    /**
     * Serializes and persists the user's state to the cache.
     * The state is stored with a TTL (Time To Live) of 3600 seconds (1 hour).
     * * @param {number|string} userId The unique Telegram user ID.
     * @param {Object} state The state object containing current step and temporary data.
     */
    static setState(userId, state) {
        const cache = CacheService.getScriptCache();
        cache.put(`state_${userId}`, JSON.stringify(state), 3600); 
    }

    /**
     * Clears the user's state from the cache.
     * Called when a wizard completes successfully or is aborted.
     * * @param {number|string} userId The unique Telegram user ID.
     */
    static clearState(userId) {
        CacheService.getScriptCache().remove(`state_${userId}`);
    }
}