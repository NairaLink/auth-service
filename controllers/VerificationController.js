/* eslint-disable import/order */
/* eslint-disable no-unused-vars */
/* eslint-disable comma-dangle */
const { ObjectId } = require('mongodb');
const redisClient = require('../db/redis');
const AppError = require('../helpers/AppError');
const Customer = require('../models/customerModel');
const sendEmailRegistrationPin = require('../helpers/sendEmailRegistrationPin');
const sendPhoneRegistrationPin = require('../helpers/sendPhoneRegistrationPin');
const verificationPin = require('../helpers/verificationPin');
const isValidPhoneNumber = require('../helpers/isvalidPhoneNumber');
const createAccount = require('../worker/accountJob');
const Logger = require('../helpers/logger');

const logger = new Logger('info-verification');

const HttpStatus = {
  OK: 200,
  BAD_REQUEST: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  SERVER_ERROR: 500,
};

const EMAIL_TOKEN_EXPIRATION = 300;
const PHONE_TOKEN_EXPIRATION = 600;
const TOKEN_LENGTH = 6;

class VerificationController {
  static async sendverificationToken(req, res, next) {
    try {
      const { phoneNumber, email } = req.body;

      if (!phoneNumber) {
        return next(new AppError('Provide a valid phone number', HttpStatus.BAD_REQUEST));
      }
      if (!email) {
        return next(new AppError('Provide a valid email', HttpStatus.BAD_REQUEST));
      }
      if (!isValidPhoneNumber(phoneNumber)) {
        return next(new AppError('Invalid phone number', HttpStatus.BAD_REQUEST));
      }
      const customer = await Customer.findOne({ email });
      if (!customer) {
        return next(new AppError('Invalid email', HttpStatus.BAD_REQUEST));
      }

      let token = verificationPin();
      sendPhoneRegistrationPin(phoneNumber, token);
      await redisClient.set(
        `phoneNumber_${token}`,
        phoneNumber.toString(),
        600
      );

      token = verificationPin();
      await redisClient.set(`Email_${token}`, customer._id.toString(), EMAIL_TOKEN_EXPIRATION);
      await sendEmailRegistrationPin(
        customer.email,
        'Email Verification',
        {
          name: customer.firstName,
          token,
        },
        './template/pinVerification.handlebars'
      );
      logger.info(`Verification token sent to ${customer.email}`);
      return res.status(HttpStatus.OK).json({ message: 'Verification token sent' });
    } catch (err) {
      return next(
        new AppError(
          `Error during sending verification token: ${err.message}`,
          HttpStatus.SERVER_ERROR
        )
      );
    }
  }

  static async verifyVerificationToken(req, res, next) {
    const { phoneToken, emailToken } = req.body;

    try {
      if (phoneToken.length !== TOKEN_LENGTH) {
        return next(
          new AppError('Invalid phone number verification Token.', HttpStatus.BAD_REQUEST)
        );
      }

      if (emailToken.length !== TOKEN_LENGTH) {
        return next(new AppError('Invalid email verification Token.', HttpStatus.BAD_REQUEST));
      }

      const customerNumber = await redisClient.get(`phoneNumber_${phoneToken}`);
      const customerId = await redisClient.get(`Email_${emailToken}`);
      if (!customerNumber || !customerId) {
        return next(
          new AppError('Verification token has expired or incorrect.', HttpStatus.BAD_REQUEST)
        );
      }

      const customer = await Customer.findOne({
        _id: new ObjectId(customerId),
      });
      if (!customer) {
        return next(
          new AppError('Customer with that email does not exist', HttpStatus.NOT_FOUND)
        );
      }
      const verifiedCustomer = await Customer.findOneAndUpdate(
        { phoneNumber: customerNumber },
        { phoneVerified: true, emailVerified: true, isVerified: true },
        { new: true, runValidators: true }
      );
      if (!verifiedCustomer) {
        return next(
          new AppError('Customer with that email does not exist', HttpStatus.NOT_FOUND)
        );
      }
      await verifiedCustomer.save({ validateBeforeSave: false });
      await redisClient.del(`phoneNumber_${phoneToken}`);
      await redisClient.del(`Email_${emailToken}`);

      const link = `${req.protocol}://${req.baseUrl}/login`;
      await sendEmailRegistrationPin(
        customer.email,
        'Verification successfully',
        {
          name: customer.firstName,
          link,
        },
        './template/verifiedEmail.handlebars'
      );

      await createAccount(verifiedCustomer);
      logger.info(`Customer ${verifiedCustomer.email} verified successfully`);
      return res.status(HttpStatus.OK).json({
        message: 'Verification successful',
      });
    } catch (err) {
      return next(
        new AppError(
          `Error during verification token verification: ${err.message}`,
          HttpStatus.SERVER_ERROR
        )
      );
    }
  }

  static async sendPhoneNumberVerificationToken(req, res, next) {
    try {
      const { phoneNumber } = req.body;

      if (!phoneNumber) {
        return next(new AppError('Provide a valid phone number', HttpStatus.BAD_REQUEST));
      }
      if (!isValidPhoneNumber(phoneNumber)) {
        return next(new AppError('Invalid phone number', HttpStatus.BAD_REQUEST));
      }

      const customer = await Customer.findOne({ phoneNumber });
      if (!customer) {
        return next(
          new AppError('Customer with that phone number does not exist', HttpStatus.NOT_FOUND)
        );
      }

      const pin = verificationPin();
      sendPhoneRegistrationPin(phoneNumber, pin);
      await redisClient.set(`phoneNumber_${pin}`, phoneNumber.toString(), PHONE_TOKEN_EXPIRATION);
      logger.info(`Verification token sent to ${customer.phoneNumber}`);
      return res.status(HttpStatus.OK).json({ message: 'Verification token sent' });
    } catch (err) {
      return next(
        new AppError(
          `Error during sending verification token to customer phone: ${err.message}`,
          HttpStatus.SERVER_ERROR
        )
      );
    }
  }

  static async verifyPhoneNumber(req, res, next) {
    const { phoneToken } = req.body;

    if (!phoneToken) {
      return next(
        new AppError('Provide verification token sent to your number', HttpStatus.BAD_REQUEST)
      );
    }

    if (phoneToken.length !== TOKEN_LENGTH) {
      return next(new AppError('Invalid PhoneNumber verification token.', HttpStatus.BAD_REQUEST));
    }

    const customerNumber = await redisClient.get(`phoneNumber_${phoneToken}`);
    if (!customerNumber) {
      return next(
        new AppError('PhoneNumber Verification token has expired.', HttpStatus.BAD_REQUEST)
      );
    }

    try {
      const customer = await Customer.findOneAndUpdate(
        { phoneNumber: customerNumber },
        { phoneVerified: true },
        { new: true }
      );

      if (customer.emailVerified === true) {
        await Customer.findOneAndUpdate(
          { phoneNumber: customerNumber },
          { isVerified: true },
          { new: true }
        );
      }
      await redisClient.del(`phoneNumber_${phoneToken}`);
      logger.info(`Customer ${customer.phoneNumber} verified successfully`);
      return res.status(HttpStatus.OK).json({
        message: 'Verification successful',
      });
    } catch (err) {
      return next(
        new AppError(
          `Error during phone number verification: ${err.message}`,
          HttpStatus.SERVER_ERROR
        )
      );
    }
  }

  static async sendEmailVerificationToken(req, res, next) {
    try {
      const { email } = req.body || req.customer;
      if (!email) {
        return next(new AppError('Provide a valid email', HttpStatus.BAD_REQUEST));
      }

      const customer = await Customer.findOne({ email });
      if (!customer) {
        return next(
          new AppError('Customer with that email does not exist', HttpStatus.NOT_FOUND)
        );
      }

      const token = verificationPin();
      await redisClient.set(`Email_${token}`, customer._id.toString(), EMAIL_TOKEN_EXPIRATION);
      await sendEmailRegistrationPin(
        customer.email,
        'Email Verification',
        {
          name: customer.firstName,
          token,
        },
        './template/pinVerification.handlebars'
      );
      logger.info(`Email verification token sent to ${customer.email}`);
      return res.status(HttpStatus.OK).json({ message: 'Email Verification token sent' });
    } catch (err) {
      return next(
        new AppError(
          `Error during send email verification: ${err.message}`,
          HttpStatus.SERVER_ERROR
        )
      );
    }
  }

  static async verifyEmailToken(req, res, next) {
    const { emailToken } = req.body;
    if (!emailToken) {
      return next(
        new AppError('Provide verification token sent to your email', HttpStatus.BAD_REQUEST)
      );
    }

    if (emailToken.length !== TOKEN_LENGTH) {
      return next(new AppError('Invalid email verification Token.', HttpStatus.BAD_REQUEST));
    }
    const customerId = await redisClient.get(`Email_${emailToken}`);
    if (!customerId) {
      return next(new AppError('Email verification Token has expired', HttpStatus.NOT_FOUND));
    }
    try {
      const customer = await Customer.findOne({
        _id: new ObjectId(customerId),
      });
      if (!customer) return next(new AppError('Forbidden', HttpStatus.FORBIDDEN));

      await Customer.findOneAndUpdate(
        { email: customer.email },
        { emailVerified: true }
      );

      if (customer.phoneVerified === true) {
        await Customer.findOneAndUpdate(
          { email: customer.email },
          { isVerified: true },
          { new: true }
        );
      }

      await customer.save({ validateBeforeSave: false });
      await redisClient.del(`Email_${emailToken}`);

      const link = `${process.env.BASE_URL}/login`;
      await sendEmailRegistrationPin(
        customer.email,
        'Email Verification successfully',
        {
          name: customer.firstName,
          link,
        },
        './template/verifiedEmail.handlebars'
      );
      logger.info(`Customer ${customer.email} email token verified successfully`);
      return res.status(HttpStatus.OK).json({
        message: 'Email Verification successful',
      });
    } catch (err) {
      return next(
        new AppError(
          `Error during send email verification: ${err.message}`,
          HttpStatus.SERVER_ERROR
        )
      );
    }
  }
}

module.exports = VerificationController;
