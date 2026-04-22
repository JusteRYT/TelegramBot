export type BotContextLike = {
  chat: {
    id: number;
    type: string;
  };
  from?: {
    id: number;
    username?: string;
    first_name: string;
    last_name?: string;
  };
  message?: {
    text?: string;
    photo?: Array<{ file_id: string }>;
    message_thread_id?: number;
  };
  match?: string;
  reply: (text: string, other?: object) => Promise<unknown>;
};

export type CreateWizardState = {
  flow: 'CREATE';
  threadId: number | null;
  gameType?: 'DND' | 'MAFIA';
  step:
    | 'CHOOSE_GAME_TYPE'
    | 'TITLE'
    | 'GM_CHOICE'
    | 'TYPE'
    | 'PARTICIPANTS'
    | 'DATE'
    | 'TIME'
    | 'IMAGE'
    | 'DESC';
  gameData: {
    type?: 'DND' | 'MAFIA';
    title?: string;
    gmName?: string;
    openRegistration?: boolean;
    registrationLimit?: number;
    prefilledPlayers?: string[];
    date?: string;
    time?: string;
    imageFileId?: string;
    description?: string;
  };
};

export type ApprovePlayersState = {
  flow: 'APPROVE_PLAYERS';
  gameId: number;
  players: string[];
};

export type SheetsPendingSelectionState = {
  flow: 'SHEETS_PENDING_SELECTION';
  gameId: number;
  pendingPlayers: string[];
};

export type EditChooseFieldState = {
  flow: 'EDIT_CHOOSE_FIELD';
  gameId: number;
  threadId: number | null;
};

export type EditInputValueState = {
  flow: 'EDIT_INPUT_VALUE';
  gameId: number;
  threadId: number | null;
  targetField: 'title' | 'gm_name' | 'datetime' | 'description' | 'image_file_id' | 'registration_limit' | 'registered_players_text';
};

export type WizardState =
  | CreateWizardState
  | ApprovePlayersState
  | SheetsPendingSelectionState
  | EditChooseFieldState
  | EditInputValueState;
