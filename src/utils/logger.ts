
import * as fs from 'fs';
import * as path from 'path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  message: string;
  data?: unknown;
}

type LogListener = (logs: LogEntry[]) => void;

class Logger {
  private logs: LogEntry[] = [];
  private listeners: Set<LogListener> = new Set();
  private maxLogs = 1000;
  private logFile = path.resolve(process.cwd(), 'debug.log');

  constructor() {
    // Ensure log file exists or is accessible
    try {
      fs.appendFileSync(this.logFile, `[${new Date().toISOString()}] Logger initialized\n`);
    } catch (e) {
      // ignore
    }
  }

  private emit() {
    this.listeners.forEach(listener => listener([...this.logs]));
  }

  private addLog(level: LogLevel, message: string, data?: unknown) {
    const entry: LogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date(),
      level,
      message,
      data,
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Write to file
    try {
      const fileMsg = `[${entry.timestamp.toISOString()}] [${level.toUpperCase()}] ${message} ${data ? JSON.stringify(data) : ''}\n`;
      fs.appendFileSync(this.logFile, fileMsg);
    } catch (e) {
      // ignore file error
    }

    this.emit();
  }

  debug(message: string, data?: unknown) {
    this.addLog('debug', message, data);
  }

  info(message: string, data?: unknown) {
    this.addLog('info', message, data);
  }

  warn(message: string, data?: unknown) {
    this.addLog('warn', message, data);
  }

  error(message: string, data?: unknown) {
    this.addLog('error', message, data);
  }

  subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    listener([...this.logs]); // Initial emit

    return () => {
      this.listeners.delete(listener);
    };
  }

  getHistory(): LogEntry[] {
    return [...this.logs];
  }
}

export const logger = new Logger();

// For backward compatibility with my recent changes
export function logDebug(msg: string, ...args: any[]) {
  // Combine method style args into data if needed, or just stringify
  if (args.length > 0) {
    logger.debug(msg, args);
  } else {
    logger.debug(msg);
  }
}
