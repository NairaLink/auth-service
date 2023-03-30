import { createClient } from 'redis';
import { promisify } from 'util';

const Logger = require('../helpers/logger');

const logger = new Logger('server');

class RedisClient {
  constructor() {
    this.client = null;
    this.clientGet = null;
  }

  async connect() {
    try {
      this.client = createClient();

      this.client.on('error', (err) => {
        logger.error(`ERROR: ${err}`);
      });

      this.clientGet = promisify(this.client.get).bind(this.client);
    } catch (err) {
      logger.error(`Error connecting to Redis: ${err}`);
      throw err;
    }
  }

  async close() {
    return new Promise((resolve, reject) => {
      this.client.quit((err) => {
        if (err) {
          logger.error(`Error closing Redis connection: ${err}`);
          reject(err);
        } else {
          logger.info('Redis connection closed.');
          resolve();
        }
      });
    });
  }

  isAlive() {
    if (this.client.connected) {
      return true;
    }
    return false;
  }

  async get(key) {
    const value = await this.clientGet(key);
    return value;
  }

  async set(key, value, duration) {
    this.client.set(key, value);
    this.client.expire(key, duration);
  }

  async del(key) {
    this.client.del(key);
  }
}

const redisClient = new RedisClient();
module.exports = redisClient;
