import { getTursoClient } from '../utils/turso';

export enum BotState {
  IDLE = 'IDLE',
  SELECTING_VISA_TYPE = 'SELECTING_VISA_TYPE',
  WAITING_PASSPORT = 'WAITING_PASSPORT',
  WAITING_FULLNAME = 'WAITING_FULLNAME',
  WAITING_BIRTHDAY = 'WAITING_BIRTHDAY',
  WAITING_APPLICATION_NO = 'WAITING_APPLICATION_NO',
  CHECKING_VISA = 'CHECKING_VISA',
  SHOWING_RESULT = 'SHOWING_RESULT',
  WAITING_CONSULTING_EMAIL = 'WAITING_CONSULTING_EMAIL',
  WAITING_CONSULTING_PASSWORD = 'WAITING_CONSULTING_PASSWORD',
  CONFIRM_DISCONNECT = 'CONFIRM_DISCONNECT',
  CONFIRM_PASSPORT_DETAILS = 'CONFIRM_PASSPORT_DETAILS'
}

export interface StateData {
  visaType?: string;
  passport?: string;
  fullName?: string;
  birthday?: string;
  applicationNo?: string;
  consultingEmail?: string;
  lastResultPassport?: string;
  lastResultData?: string;
  cabinetPage?: number;
  cabinetTab?: string;
}

/**
 * Gets the current state and data for a user.
 *
 * @param telegramId - The user's Telegram ID
 * @returns The user's state and data
 */
export async function getState(telegramId: number): Promise<{ state: BotState; data: StateData }> {
  try {
    const client = await getTursoClient();
    const result = await client.execute({
      sql: 'SELECT state, data FROM bot_sessions WHERE telegram_id = ?',
      args: [telegramId]
    });

    if (result.rows.length > 0) {
      const row = result.rows[0] as Record<string, unknown>;
      const state = (row.state as BotState) || BotState.IDLE;
      let data: StateData = {};
      try {
        if (row.data) {
          data = JSON.parse(row.data as string);
        }
      } catch (e) {
        console.error('[Bot] Failed to parse state data JSON', e);
      }
      return { state, data };
    }
  } catch (error) {
    console.error('[Bot] Error in getState:', error);
  }
  
  return { state: BotState.IDLE, data: {} };
}

/**
 * Sets the state and optional data for a user.
 *
 * @param telegramId - The user's Telegram ID
 * @param state - The new state
 * @param data - The data to set
 */
export async function setState(telegramId: number, state: BotState, data?: Partial<StateData>): Promise<void> {
  try {
    const client = await getTursoClient();
    const dataString = data ? JSON.stringify(data) : JSON.stringify({});
    
    await client.execute({
      sql: 'INSERT OR REPLACE INTO bot_sessions (telegram_id, state, data) VALUES (?, ?, ?)',
      args: [telegramId, state, dataString]
    });
  } catch (error) {
    console.error('[Bot] Error in setState:', error);
  }
}

/**
 * Clears the user's state, returning it to IDLE.
 *
 * @param telegramId - The user's Telegram ID
 */
export async function clearState(telegramId: number): Promise<void> {
  await setState(telegramId, BotState.IDLE, {});
}

/**
 * Updates a user's state data without changing their current state.
 *
 * @param telegramId - The user's Telegram ID
 * @param updates - The data updates to merge in
 */
export async function updateStateData(telegramId: number, updates: Partial<StateData>): Promise<void> {
  try {
    const currentState = await getState(telegramId);
    const mergedData = { ...currentState.data, ...updates };
    
    const client = await getTursoClient();
    await client.execute({
      sql: 'INSERT OR REPLACE INTO bot_sessions (telegram_id, state, data) VALUES (?, ?, ?)',
      args: [telegramId, currentState.state, JSON.stringify(mergedData)]
    });
  } catch (error) {
    console.error('[Bot] Error in updateStateData:', error);
  }
}
