/* eslint-disable no-param-reassign */
const AppError = require('./AppError');
const Logger = require('./logger');
const logger = new Logger('GlobalErrorHandler');

const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map((el) => el.message);
  const msg = `Invalid input data: ${errors.join('. ')}`;
  return new AppError(msg, 400);
};

const handleDuplicateFieldsDB = (err) => {
  const value = Object.keys(err.keyValue)[0];
  const message = `Customer with this ${value} already exist. Kindly login!`;
  return new AppError(message, 400);
};

const handleCastError = (err) => {
  const message = `Cast to ${err.kind} failed for value >>> ${err.value._id}`;
  return new AppError(message, 500);
};

const sendProError = (err, req, res) => {
  if (req.originalUrl.startsWith('/api')) {
    const endPoint = req.originalUrl.split('/').pop().split('?')[0];
    const logger = new Logger(endPoint);

    logger.setLogData(req.body);
    if (err.isOperational) {
      logger.warn(err.message);
      return res.status(err.statusCode).json({
        status: 'fail',
        message: err.message,
      });
    }

    logger.error(`ERROR 🔥: ${err} from request ->`, req.body);
    return res.status(500).json({
      status: 'error',
      message: 'Something went very wrong!',
    });
  }

  //   Render website
  if (err.isOperational) {
    logger.error(`Operational error: ${err.message}`);
    return res.status(err.statusCode).render('error', {
      title: 'Something went wrong!',
      msg: err.message,
    });
  }

  logger.error(`ERROR 🔥: ${err}`);
  return res.status(err.statusCode).render('error', {
    title: 'Something went wrong!',
    msg: 'Please try again later.',
  });
};

// eslint-disable-next-line no-unused-vars
module.exports = (err, req, res, next) => {
  if (err.name === 'ValidationError') {
    err = handleValidationErrorDB(err);
  }
  if (err.code === 11000) {
    err = handleDuplicateFieldsDB(err);
  }
  if (err.name === 'CastError') {
    err = handleCastError(err);
  }

  sendProError(err, req, res);
};
