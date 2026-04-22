/**
 * Handles user metadata and ID mapping.
 * Bypasses the need for modifying the main Game sheet.
 */
class UserService {
    /**
     * Saves user relation. Should be called on every interaction.
     * @param {string} username 
     * @param {number} userId 
     */
    static saveRelation(username, userId) {
        if (!username) return;
        const cleanName = username.replace('@', '').toLowerCase();
        const props = PropertiesService.getScriptProperties();
        props.setProperty(`u_${cleanName}`, String(userId));
    }

    /**
     * Tries to find userId by username.
     * @param {string} username 
     * @returns {number|null}
     */
    static getIdByUsername(username) {
        if (!username) return null;
        const cleanName = username.replace('@', '').toLowerCase();
        const id = PropertiesService.getScriptProperties().getProperty(`u_${cleanName}`);
        return id ? Number(id) : null;
    }
}