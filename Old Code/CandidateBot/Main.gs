/**
 * Webhook entry point for Telegram API.
 * @param {Object} e - Event payload.
 */
function doPost(e) {
    const update = JSON.parse(e.postData.contents);
    if (!update.message || !update.message.text) return;

    const messageText = update.message.text;
    const chatId = update.message.chat.id;
    const threadId = update.message.message_thread_id || null;
    
    const rawParts = messageText.split(/\s+/);
    const command = rawParts[0].split('@')[0].toLowerCase();

    const userService = new UserService(threadId);

    const isPublicCommand = (command === '/id' || command === '/start');

    if (!isPublicCommand) {
        const isCorrectChat = (chatId === Number(CONFIG.ALLOWED_CHAT_ID));
        const isCorrectTopic = (threadId === Number(CONFIG.ALLOWED_TOPIC_ID));

        if (!isCorrectChat || !isCorrectTopic) {
            return;
        }
    }

    const usernames = rawParts.filter(p => p.startsWith('@'));
    const textArg = rawParts.slice(1).filter(p => !p.startsWith('@')).join(' ');

    try {
        switch (command) {
            case '/id':
                userService.sendDebugInfo(chatId);
                break;
            case '/start':
                const from = update.message.from;
                userService.handleStart(chatId, from.username, from.id, from.first_name, from.last_name);
                break;
            case '/help':
                userService.sendHelp(chatId);
                break;
            case '/add':
                userService.addCandidates(chatId, usernames);
                break;
            case '/info':
                userService.getUserInfo(chatId, usernames[0]);
                break;
            case '/list':
                const statusArg = rawParts.slice(1).join(' ');
                userService.listByStatus(chatId, statusArg);
                break;
            case '/warn':
                userService.warnUser(chatId, usernames[0], textArg);
                break;
            case '/game':
                userService.updateGames(chatId, usernames);
                break;
            case '/review':
                userService.changeUsersStatus(chatId, usernames, CONFIG.STATUSES.ON_REVIEW);
                break;
            case '/approve':
                userService.changeUsersStatus(chatId, usernames, CONFIG.STATUSES.APPROVED);
                break;
            case '/ban':
                userService.banUser(chatId, usernames[0], textArg);
                break;
            case '/unban':
                userService.changeUsersStatus(chatId, usernames, CONFIG.STATUSES.CANDIDATE);
                break;
            case '/all':
                userService.listAllByGroups(chatId);
                break;
            case '/remove':
                userService.removeUser(chatId, usernames[0], textArg);
                break;
        }
    } catch (error) {
        userService.tgClient.sendMessage(chatId, "⚠️ Системная ошибка: " + error.toString(), threadId);
    }
}

/**
 * Registers the Webhook with Telegram. Run manually once.
 */
function setWebhook() {
    const url = `https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/setWebhook?url=${CONFIG.WEBHOOK_URL}`;
    const response = UrlFetchApp.fetch(url);
    Logger.log(response.getContentText());
}