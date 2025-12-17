export default () => ({
  env: process.env.NODE_ENV,
  log: {
    levels: process.env.LOG_LEVELS
      ? (JSON.parse(process.env.LOG_LEVELS) as LogLevel[])
      : ['log', 'error', 'warn'],
    disabled: process.env.LOG_DISABLED === 'true',
  },
  port: parseInt(process.env.PORT || '9000', 10),
  database: {
    url: process.env.DATABASE_URL,
  },
  auth: {
    hashLength: parseInt(process.env.AUTH_HASH_LENGTH || '32'),
    timeCost: parseInt(process.env.AUTH_HASH_TIME_COST || '6'),
    memoryCost: parseInt(process.env.AUTH_HASH_MEMORY_COST || '65536'),
    maxDelay: parseInt(process.env.AUTH_MAX_DELAY || '1000'),
    jwt: {
      expirationInterval:
        Number(process.env.AUTH_JWT_EXPIRATION_INTERVAL) || 3600,
      secret: process.env.AUTH_JWT_SECRET || '',
      audience: process.env.AUTH_JWT_AUDIENCE || 'eSIM.Platform',
      issuer: process.env.AUTH_JWT_ISSUER || 'eSIM.Platform',
    },
  },
  email: {
    enabled: process.env.EMAIL_ENABLED === 'true',
    host: process.env.EMAIL_HOST || '',
    port: parseInt(process.env.EMAIL_PORT || '587', 10),
    user: process.env.EMAIL_USER || '',
    pass: process.env.EMAIL_PASS || '',
    from: process.env.EMAIL_FROM || '',
    fromName: process.env.EMAIL_FROM_NAME || 'eSIM Platform',
  },
});
type LogLevel = 'log' | 'error' | 'warn' | 'debug' | 'verbose' | 'fatal';
export interface LogConfig {
  levels: LogLevel[];
  disabled: boolean;
}
export interface DatabaseConfig {
  url: string;
}
export interface JwtConfig {
  expirationInterval: number;
  secret: string;
  audience: string;
  issuer: string;
}
export interface AuthConfig {
  hashLength: number;
  timeCost: number;
  memoryCost: number;
  jwt: JwtConfig;
  maxDelay: number;
}
export interface ServerConfig {
  env: string;
  port: number;
  database: DatabaseConfig;
  log: LogConfig;
  auth: AuthConfig;
}
