const mongoose = require('mongoose');
const Logger = require('../helpers/logger');

const logger = new Logger('db');
const DB = process.env.URL.replace('<PASSWORD>', process.env.PASSWORD);

class DbClient {
  constructor() {
    this.db = null;
  }

  async connect() {
    try {
      await mongoose.connect(DB, {
        useNewUrlParser: true,
        family: 4,
        connectTimeoutMS: 1000,
      });

      this.db = mongoose.connection;

      this.db.on('error', (err) => {
        logger.error(`Failed to connect to the database: ${err}`);
        process.exit(1);
      });

      this.db.once('open', () => {
        console.log('DB connection succssfully!');
        logger.info('DB connection succssfully!');
      });
    } catch (err) {
      logger.error(`Failed to connect to the database: ${err}`);
      throw err;
    }
  }

  async close() {
    try {
      await mongoose.connection.close();
      this.db = null;
      logger.info('MongoDB connection closed.');
    } catch (err) {
      logger.error(`Error closing MongoDB connection: ${err}`);
      throw err;
    }
  }

  isAlive() {
    if (this.db) {
      return true;
    }
    return false;
  }
}

const dbClient = new DbClient();
module.exports = dbClient;
