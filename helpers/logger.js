const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const DatadogWinston = require('datadog-winston');

const dateFormat = () => new Date(Date.now()).toUTCString();

class Logger {
  constructor(route) {
    this.logData = null;
    this.route = route;
    const logger = winston.createLogger({
      transports: [
        new winston.transports.Console(),
        new DailyRotateFile({
          auditFile: './logs/audit/.audit.json',
          filename: `./logs/${route}-%DATE%.log`,
          datePattern: 'DD-MM-YYYY',
          zippedArchive: true,
          maxSize: '20m',
          maxFiles: '14d',
        }),
        new DatadogWinston({
          apiKey: process.env.DATADOG_API_KEY,
          service: 'auth-service',
          ddsource: 'nodejs',
          ddtags: `route:${route}`,
          hostname: process.env.HOST,
          intakeRegion: 'us',
        }),
      ],
      format: winston.format.printf((info) => {
        let message = `${dateFormat()} | ${info.level.toUpperCase()} | ${route}.log | ${
          info.message
        } | `;
        message = info.obj
          ? `${message} data:${JSON.stringify(info.obj)} | `
          : message;
        message = this.logData
          ? `${message} logData:${JSON.stringify(this.logData)} | `
          : message;
        return message;
      }),
    });
    this.logger = logger;
  }

  setLogData(logData) {
    this.logData = logData;
  }

  async warn(message, obj = null) {
    if (obj) {
      this.logger.log('warn', message, { obj });
    } else this.logger.log('warn', message);
  }

  async info(message, obj = null) {
    if (obj) {
      this.logger.log('info', message, { obj });
    } else this.logger.log('info', message);
  }

  async debug(message, obj = null) {
    if (obj) {
      this.logger.log('debug', message, { obj });
    } else this.logger.log('debug', message);
  }

  async error(message, obj = null) {
    if (obj) {
      this.logger.log('error', message, { obj });
    } else this.logger.log('error', message);
  }
}
module.exports = Logger;
