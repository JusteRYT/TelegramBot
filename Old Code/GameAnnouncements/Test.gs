/**
 * Checks file availability using DriveApp to bypass SpreadsheetApp initialization overhead.
 */
function debugDriveAccess() {
    const targetId = "193RrXvbBzIecQ_XHXZLx0h99hlVwLwm1JKPEyNsV_Pc";
    Logger.log("Checking via DriveApp...");
    
    try {
        const file = DriveApp.getFileById(targetId);
        Logger.log("✅ File found on Drive!");
        Logger.log("Name: " + file.getName());
        Logger.log("MIME Type: " + file.getMimeType());
        Logger.log("Can Edit: " + file.getAccess(Session.getEffectiveUser()));
    } catch (e) {
        Logger.log("❌ DriveApp Error: " + e.message);
    }
}