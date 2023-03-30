/* eslint-disable import/no-extraneous-dependencies */
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const hpp = require('hpp');
const morgan = require('morgan');
const mongoSanitizer = require('express-mongo-sanitize');
const xss = require('xss-clean');
const rateLimit = require('express-rate-limit');
const path = require('path');
const GlobalErrorHandler = require('./helpers/errorHandler');
const AppError = require('./helpers/AppError');

const AuthController = require('./controllers/AuthController');

const CustomerRouter = require('./routes/customerRouter');
const AuthRouter = require('./routes/authRouter');
const verificationRouter = require('./routes/verificationRouter');

const app = express();
app.use(express.static(path.join(__dirname, './public')));

app.use(express.json());
app.use(cookieParser());
app.use(helmet({ contentSecuritPolicy: false }));
app.use(morgan('dev'));
app.use(mongoSanitizer());
app.use(xss());
app.use(hpp());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  message: 'Too many request from this IP, Please try again in 15 mins.',
});
app.use('/api', limiter);

app.post('/oauth/token', AuthController.authenticate);

app.get('/api/auth-docs', (req, res) => {
  res.sendFile(path.join(__dirname, './public/index.html'));
});

// ROUTER MIDDLEWARE
app.use('/api/v1/auth', AuthRouter);
app.use('/api/v1/verify', verificationRouter);
app.use('/api/v1/customers', CustomerRouter);

// GLOBAL ERROR HANDLER
app.all('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});
app.use(GlobalErrorHandler);

module.exports = app;
