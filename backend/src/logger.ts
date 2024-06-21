import { utilities, WinstonModule } from 'nest-winston';
import * as path from 'path';
import * as winston from 'winston';
import 'winston-daily-rotate-file';

const logDir = '/var/log/ultra';

export const logger = WinstonModule.createLogger({
  transports: [
    new winston.transports.DailyRotateFile({
      filename: path.join(logDir, 'application-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '60d',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD, HH:mm:ss.SSS' }),
        winston.format.ms(),
        utilities.format.nestLike('Ultra', {
          colors: true,
          prettyPrint: true,
          processId: true,
        }),
      ),
    }),
    new winston.transports.DailyRotateFile({
      filename: path.join(logDir, 'error-%DATE%.log'),
      level: 'error',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '60d',
      format: winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DD, HH:mm:ss.SSS' }),
          winston.format.ms(),
          utilities.format.nestLike('Ultra', {
            colors: true,
            prettyPrint: true,
            processId: true,
          }),
      ),
    }),
  ],
});
