import { exec } from 'node:child_process';
import { promisify } from 'node:util';

import { env } from '../config/env';

const execAsync = promisify(exec);

type BotControlState = 'running' | 'stopped' | 'unavailable' | 'error';
type BotControlAction = 'start' | 'stop' | 'restart' | 'update';

type CommandSet = {
  status: string;
  start: string;
  stop: string;
  restart: string;
  update: string;
};

function quoteArg(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export class BotControlService {
  private readonly commands: CommandSet;

  constructor() {
    const serviceName = (env.BOT_CONTROL_SERVICE_NAME || '').trim() || 'telegram-bot';
    const custom = {
      status: (env.BOT_CONTROL_CMD_STATUS || '').trim(),
      start: (env.BOT_CONTROL_CMD_START || '').trim(),
      stop: (env.BOT_CONTROL_CMD_STOP || '').trim(),
      restart: (env.BOT_CONTROL_CMD_RESTART || '').trim(),
      update: (env.BOT_CONTROL_CMD_UPDATE || '').trim(),
    };

    const useSystemd = env.BOT_CONTROL_MODE === 'systemd' || (!env.BOT_CONTROL_MODE && process.platform === 'linux');
    const defaultSystemd: CommandSet = {
      status: `systemctl is-active ${quoteArg(serviceName)}`,
      start: `systemctl start ${quoteArg(serviceName)}`,
      stop: `systemctl stop ${quoteArg(serviceName)}`,
      restart: `systemctl restart ${quoteArg(serviceName)}`,
      update: '',
    };

    const fallbackEmpty: CommandSet = {
      status: '',
      start: '',
      stop: '',
      restart: '',
      update: '',
    };

    const base = useSystemd ? defaultSystemd : fallbackEmpty;
    this.commands = {
      status: custom.status || base.status,
      start: custom.start || base.start,
      stop: custom.stop || base.stop,
      restart: custom.restart || base.restart,
      update: custom.update || base.update,
    };
  }

  private async run(command: string) {
    if (!command) {
      return { ok: false as const, output: 'command_not_configured' };
    }

    try {
      const { stdout, stderr } = await execAsync(command, { timeout: 60_000, windowsHide: true });
      return { ok: true as const, output: `${stdout ?? ''}${stderr ?? ''}`.trim() };
    } catch (error) {
      const out = error instanceof Error ? error.message : String(error);
      return { ok: false as const, output: out.trim() };
    }
  }

  async getStatus() {
    if (!this.commands.status) {
      return {
        state: 'unavailable' as BotControlState,
        label: 'Недоступен',
        details: 'Команда статуса не настроена',
      };
    }

    const result = await this.run(this.commands.status);
    if (result.ok) {
      const lowered = result.output.toLowerCase();
      if (lowered.includes('active') || lowered.includes('running')) {
        return { state: 'running' as BotControlState, label: 'Запущен', details: result.output || 'active' };
      }
      if (lowered.includes('inactive') || lowered.includes('stopped') || lowered.includes('failed')) {
        return { state: 'stopped' as BotControlState, label: 'Выключен', details: result.output || 'inactive' };
      }
      return { state: 'running' as BotControlState, label: 'Запущен', details: result.output };
    }

    const lowered = result.output.toLowerCase();
    if (lowered.includes('not found') || lowered.includes('не является внутренней') || lowered.includes('not recognized')) {
      return {
        state: 'unavailable' as BotControlState,
        label: 'Недоступен',
        details: result.output,
      };
    }
    return { state: 'error' as BotControlState, label: 'Ошибка', details: result.output };
  }

  async runAction(action: BotControlAction) {
    const command = this.commands[action];
    if (!command) {
      return {
        ok: false,
        message: 'Команда не настроена',
      };
    }

    // For restart/update we must return HTTP response before service restarts itself.
    if (action === 'restart') {
      const delayed = this.runDetachedAfterDelay(command, 1200);
      return {
        ok: delayed,
        message: delayed ? 'Запущено в фоне' : 'Не удалось запустить фоновую команду',
      };
    }
    if (action === 'update') {
      const check = await this.checkUpdatesAvailable();
      if (check === 'up-to-date') {
        return {
          ok: true,
          message: 'NO_UPDATES',
        };
      }
      const delayed = this.runDetachedAfterDelay(command, 1200);
      return {
        ok: delayed,
        message: delayed ? 'Запущено в фоне' : 'Не удалось запустить фоновую команду',
      };
    }

    const result = await this.run(command);
    return {
      ok: result.ok,
      message: result.ok ? 'OK' : result.output || 'Ошибка выполнения команды',
    };
  }

  private runDetachedAfterDelay(command: string, delayMs: number) {
    try {
      if (process.platform === 'win32') {
        const escaped = command.replace(/"/g, '\\"');
        const ps = `Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile','-Command','Start-Sleep -Milliseconds ${Math.max(0, delayMs)}; ${escaped}'`;
        exec(ps, { windowsHide: true });
        return true;
      }

      const delaySeconds = Math.max(0.5, delayMs / 1000);
      const shCommand = `nohup sh -c "sleep ${delaySeconds}; ${command}" >/dev/null 2>&1 &`;
      exec(shCommand);
      return true;
    } catch (_error) {
      return false;
    }
  }

  private async checkUpdatesAvailable(): Promise<'updates-available' | 'up-to-date' | 'unknown'> {
    if (process.platform === 'win32') {
      return 'unknown';
    }

    const probe = await this.run(
      `sh -lc "git fetch origin main >/dev/null 2>&1; ` +
      `LOCAL=\\$(git rev-parse HEAD 2>/dev/null); ` +
      `REMOTE=\\$(git rev-parse origin/main 2>/dev/null); ` +
      `if [ -n \\"\\$LOCAL\\" ] && [ -n \\"\\$REMOTE\\" ] && [ \\"\\$LOCAL\\" = \\"\\$REMOTE\\" ]; then echo up-to-date; else echo updates-available; fi"`,
    );
    if (!probe.ok) {
      return 'unknown';
    }
    const out = (probe.output || '').toLowerCase();
    if (out.includes('up-to-date')) {
      return 'up-to-date';
    }
    if (out.includes('updates-available')) {
      return 'updates-available';
    }
    return 'unknown';
  }
}
