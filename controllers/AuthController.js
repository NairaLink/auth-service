/* eslint-disable func-names */
/* eslint-disable prefer-destructuring */
/* eslint-disable comma-dangle */
/* eslint-disable consistent-return */
/* eslint-disable no-param-reassign */
/* eslint-disable no-unused-vars */
const sha1 = require('sha1');
const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const AppError = require('../helpers/AppError');
const Customer = require('../models/customerModel');
const formatResponse = require('../helpers/formatResponse');
const handleValidationError = require('../helpers/handleValidationError');
const sendEmailRegistrationPin = require('../helpers/sendEmailRegistrationPin');
const sendPhoneRegistrationPin = require('../helpers/sendPhoneRegistrationPin');
const redisClient = require('../db/redis');
const generateJWToken = require('../helpers/generateJWToken');
const verificationPin = require('../helpers/verificationPin');
const verificationToken = require('../helpers/verificationToken');
const setAuthCookie = require('../helpers/setAuthCookie');
const clearAuthCookie = require('../helpers/clearAuthCookie');
const Logger = require('../helpers/logger');

const logger = new Logger('info-auth');
const HttpStatus = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  SERVER_ERROR: 500,
};
const cacheDuration = {
  FIVE_MINUTES: 5 * 60,
  ONE_HOUR: 60 * 60,
};

class AuthController {
  static async signup(req, res, next) {
    try {
      const newCustomer = await Customer.create({
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        email: req.body.email,
        phoneNumber: req.body.phoneNumber,
        password: req.body.password,
        passwordConfirmation: req.body.passwordConfirmation,
      });

      const phonePin = verificationPin();
      await redisClient.set(
        `phoneNumber_${phonePin}`,
        newCustomer.phoneNumber.toString(),
        cacheDuration.FIVE_MINUTES
      );
      sendPhoneRegistrationPin(newCustomer.phoneNumber, phonePin);

      const emailPin = verificationPin();
      await redisClient.set(
        `Email_${emailPin}`,
        newCustomer._id.toString(),
        cacheDuration.FIVE_MINUTES
      );
      await sendEmailRegistrationPin(
        newCustomer.email,
        'Email Verification',
        {
          name: newCustomer.firstName,
          token: emailPin,
        },
        './template/pinVerification.handlebars'
      );

      logger.setLogData(req.body);
      logger.info(`User created with email: ${newCustomer.email}`);
      return res.status(HttpStatus.CREATED).json({
        status: 'success',
        data: formatResponse(newCustomer),
      });
    } catch (error) {
      if (error.name === 'ValidationError') {
        logger.warn(`Validation error: ${error.message}`);
        let errors = handleValidationError(error, req);
        return res.status(HttpStatus.BAD_REQUEST).json({
          error: { ...errors },
        });
      }
      return next(error);
    }
  }

  static async login(req, res, next) {
    const { email, password } = req.body;
    try {
      if (!email || !password) {
        return next(new AppError('Invalid login credentials', HttpStatus.BAD_REQUEST));
      }
      let customer = await Customer.findOne({ email });
      if (!customer) {
        return next(new AppError('Customer not found', HttpStatus.NOT_FOUND));
      }
      if (customer.isVerified === false) {
        return next(
          new AppError(
            'Kindly verify your email, using /verify/token route',
            HttpStatus.NOT_FOUND
          )
        );
      }
      customer = await Customer.findOne({ email, password: sha1(password) });
      if (!customer) {
        return next(new AppError('Invalid login credentials', HttpStatus.BAD_REQUEST));
      }
      const token = generateJWToken(customer._id.toString());
      await redisClient.set(`auth_${token}`, customer._id.toString(), cacheDuration.ONE_HOUR);
      setAuthCookie(res, token);
      logger.info(`User logged in with email: ${email}`);
      return res
        .status(HttpStatus.OK)
        .send({ token, customer: formatResponse(customer) });
    } catch (error) {
      return next(error);
    }
  }

  static async logout(req, res, next) {
    try {
      const { authorization } = req.headers;
      if (!authorization || !authorization.startsWith('Bearer ')) {
        return next(new AppError(
            'Unauthorized: Missing or invalid token format',
            HttpStatus.UNAUTHORIZED
            )
        );
      }
      const token = authorization.split(' ')[1];
      if (token === undefined) {
        return next(new AppError('Unauthorized: Token not found', HttpStatus.UNAUTHORIZED));
      }
      const valid = await redisClient.get(`auth_${token}`);
      if (valid === null) {
        return next(new AppError('Forbidden: Token not active or expired', HttpStatus.FORBIDDEN));
      }
      const user = jwt.verify(token, process.env.JWT_SECRET);
      if (valid !== user.customerId) {
        return next(new AppError('Forbidden: Token does not match the user', HttpStatus.FORBIDDEN));
      }
      await redisClient.del(`auth_${token}`);
      clearAuthCookie(res);
      logger.info(`User logged out with token: ${token}`);
      res.status(HttpStatus.OK).end();
    } catch (error) {
      if (error.message === 'invalid signature') {
        return next(new AppError('Unauthorised: Invalid token signature', HttpStatus.UNAUTHORIZED));
      }
      if (error.message === 'jwt malformed') {
        return next(new AppError(`Server error: ${error.message}`, HttpStatus.SERVER_ERROR));
      }
      return next(error);
    }
  }

  static async protect(req, res, next) {
    let token;
    const { authorization } = req.headers;
    if (authorization && authorization.startsWith('Bearer ')) {
      token = authorization.split(' ')[1];
    } else if (req.cookies.jwt) {
      token = req.cookies.jwt;
    }
    if (!token) {
      return next(new AppError('Unauthorised: Missing token', HttpStatus.UNAUTHORIZED));
    }
    try {
      const valid = await redisClient.get(`auth_${token}`);
      if (valid === null) {
        return next(new AppError('Forbidden: Invalid or expired token', HttpStatus.FORBIDDEN));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const CurrentCustomer = await Customer.findOne({
        _id: decoded.customerId,
      });
      if (!CurrentCustomer) {
        return next(new AppError('Unauthorised: User not found', HttpStatus.UNAUTHORIZED));
      }
      if (CurrentCustomer.passwordChangeAfter(decoded.iat)) {
        return next(
          new AppError('Password recently changed. Kindly login again!', HttpStatus.UNAUTHORIZED)
        );
      }
      req.user = formatResponse(CurrentCustomer);
      req.headers.user = formatResponse(CurrentCustomer);
      logger.info(`Access granted for user: ${CurrentCustomer._id}`);
      next();
    } catch (error) {
      if (error.message === 'invalid signature') {
        return next(new AppError('Unauthorised: Invalid token signature', HttpStatus.UNAUTHORIZED));
      }
      if (error.message === 'jwt malformed') {
        return next(new AppError(`Server error: ${error.message}`, HttpStatus.SERVER_ERROR));
      }
      return next(error);
    }
  }

  static async forgetPassword(req, res, next) {
    const { email } = req.body;
    try {
      const customer = await Customer.findOne({ email });
      if (!customer) {
        return next(
          new AppError('Customer with that email does not exist', HttpStatus.NOT_FOUND)
        );
      }
      const token = redisClient.get(`Reset_${customer._id.toString()}`);
      if (token) await redisClient.del(`Reset_${customer._id.toString()}`);
      const resetToken = verificationToken();
      await redisClient.set(
        `Reset_${customer._id.toString()}`,
        resetToken,
        cacheDuration.ONE_HOUR
      );

      const link = `${process.env.BASE_URL}/confirmResetPassword?token=${resetToken}&id=${customer._id}`;
      await sendEmailRegistrationPin(
        customer.email,
        'Password Reset Request',
        {
          name: customer.firstName,
          link,
        },
        './template/requestResetPassword.handlebars'
      );
      logger.info(`Password reset link sent to ${customer.email}`);
      return res.status(HttpStatus.OK).json({
        status: 'success',
        message: `password reset link sent to ${customer.email}`,
      });
    } catch (err) {
      return next(err);
    }
  }

  static async ConfirmResetPasswordUrl(req, res, next) {
    try {
      const { token, id } = req.query;
      if (!id) {
        return next(new AppError('Something went wrong. Missing customer ID', HttpStatus.BAD_REQUEST));
      }
      if (!token) {
        return next(new AppError('Invalid request. Please provide token', HttpStatus.BAD_REQUEST));
      }
      const storedToken = redisClient.get(`Reset_${id.toString()}`);
      if (!storedToken || token.toString() !== storedToken) return next(new AppError('Invalid or expired token', HttpStatus.BAD_REQUEST));

      logger.info(`Confirm reset password request for <${id}>, Redirecting to reset password`);
      return res.status(HttpStatus.OK).json({
        status: 'success',
        id,
        token,
        message: `Redirect to <a href="${process.env.BASE_URL}/resetpassword/:token?id=${id}">reset password</a>, then provide new password`,
      });
    } catch (err) {
      return next(err);
    }
  }

  static async resetPassword(req, res, next) {
    try {
      const { newPassword, passwordConfirmation } = req.body;

      if (!newPassword || newPassword.length < 8) {
        return next(new AppError('Invalid new password', HttpStatus.BAD_REQUEST));
      }
      if (!passwordConfirmation) {
        return next(
          new AppError('Missing password confirmation', HttpStatus.BAD_REQUEST)
        );
      }
      const storedToken = await redisClient.get(
        `Reset_${req.query.id.toString()}`
      );
      if (!storedToken) {

      }
      if (newPassword !== passwordConfirmation) {
        return next(new AppError('Passwords do not match', HttpStatus.BAD_REQUEST));
      }
      await Customer.updateOne(
        { _id: req.query.id },
        { $set: { password: sha1(newPassword) } },
        { new: true }
      );
      const customer = await Customer.findOne({
        _id: new ObjectId(req.query.id),
      });
      await sendEmailRegistrationPin(
        customer.email,
        'Password Reset Successfully',
        { name: customer.firstName },
        '../helpers/template/resetPassword.handlebars'
      );
      await redisClient.del(`Reset_${req.query.id.toString()}`);

      logger.info('Reset password request: Password reset successfully');
      return res.status(HttpStatus.OK).json({
        status: 'success',
        message: 'Password reset successfully.',
      });
    } catch (err) {
      return next(err);
    }
  }

  static async updatePassword(req, res, next) {
    const { currentPassword, newPassword, newPasswordConfirmation } = req.body;
    try {
      const customer = await Customer.findById(
        new ObjectId(req.user.id)
      ).select('+password');

      if (!customer) return next(new AppError('Forbidden', HttpStatus.FORBIDDEN));
      if (!currentPassword || !newPassword) {
        return next(new AppError('current and/or new password missing', HttpStatus.BAD_REQUEST));
      }
      if (newPassword.length < 8) {
        return next(new AppError('Kindly, provide a valid password', HttpStatus.BAD_REQUEST));
      }
      if (customer.password !== sha1(currentPassword)) {
        return next(new AppError('Incorrect current password', HttpStatus.BAD_REQUEST));
      }

      customer.password = newPassword;
      customer.passwordConfirmation = newPasswordConfirmation;
      await customer.save();
      logger.info('Update password request: Password update successful');
      return res.status(HttpStatus.OK).json({
        status: 'success',
        message: 'password update successful',
      });
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = AuthController;
