export default () => ({
  env: process.env.NODE_ENV,
  log: {
    levels: process.env.LOG_LEVELS
      ? (JSON.parse(process.env.LOG_LEVELS) as LogLevel[])
      : ['log', 'error', 'warn'],
  },
  port: parseInt(process.env.PORT || String(24 * 60 * 60), 10),
  database: {
    url: process.env.DATABASE_URL,
  },
});
type LogLevel = 'log' | 'error' | 'warn' | 'debug' | 'verbose' | 'fatal';
export interface LogConfig {
  levels: LogLevel[];
}
export interface DatabaseConfig {
  url: string;
}
export interface ServerConfig {
  env: string;
  port: number;
  database: DatabaseConfig;
  log: LogConfig;
}