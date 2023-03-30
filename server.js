const dotenv = require('dotenv');
dotenv.config({ path: './.config.env' });

const Logger = require('./helpers/logger');
const db = require('./db/db');
const redis = require('./db/redis');
const app = require('./app');

const logger = new Logger('server');

// Function to handle graceful server shutdown
async function shutdown(exitCode) {
  try {
    await db.close();
  } catch (err) {
    logger.error(`Error during MongoDB shutdown: ${err}`);
  }

  try {
    await redis.close();
  } catch (err) {
    logger.error(`Error during Redis shutdown: ${err}`);
  }

  process.exit(exitCode);
}

(async () => {
  try {
    // Connect databases before app loads
    await db.connect();
    await redis.connect();

    const port = process.env.PORT || 3000;

    app.listen(port, () => {
      logger.info(`Server listening on port ${port}`);
    });
  } catch (err) {
    logger.error(`Error during server startup: ${err}`);
    await shutdown(1);
  }
})();

process.on('uncaughtException', async (err) => {
  logger.error(`${err.name}: ${err.message}`);
  logger.error('UNCAUGHT EXCEPTION SHUTTING DOWN...');
  await shutdown(1);
});

process.on('unhandledRejection', async (err) => {
  logger.error(`${err.name}: ${err.message}`);
  logger.error('UNHANDLED REJECTION SHUTTING DOWN..');
  await shutdown(1);
});
