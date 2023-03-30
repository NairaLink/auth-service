/* eslint-disable no-unused-vars */
/* eslint-disable object-curly-newline */
/* eslint-disable comma-dangle */
const Customer = require('../models/customerModel');
const AppError = require('../helpers/AppError');
const formatResponse = require('../helpers/formatResponse');
const filterFields = require('../helpers/filterFields');
const Logger = require('../helpers/logger');

const logger = new Logger('info-customer');

const HttpStatus = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  NOT_ALLOWED: 405,
  SERVER_ERROR: 500,
};

class CustomerController {
  static async createCustomer(req, res, next) {
    logger.info('createCustomer() is deprecated. Use /signup instead')
    return res.status(HttpStatus.NOT_ALLOWED).json({
      status: 'fail',
      message:
        'This route is  not defined. Kindly, use /signup to create account',
    });
  }

  static async getAllCustomers(req, res, next) {
    try {
      const customers = await Customer.find();
      const data = customers.map((customer) => formatResponse(customer));
      logger.info(`Get all customer request: Number of customers retrieved: ${data.length}`);
      return res.status(HttpStatus.OK).json({
        results: customers.length,
        customers: data,
      });
    } catch (err) {
      return next(err);
    }
  }

  static async getCustomer(req, res, next) {
    try {
      const customer = await Customer.findById(req.params.id);
      if (!customer) {
        return next(new AppError(`Get customer request: Customer with ID ${req.params.id} not found`, HttpStatus.NOT_FOUND));
      }
      logger.info(`Get customer request: Customer with ID ${req.params.id} retrieved`);
      return res.status(HttpStatus.OK).json({ customer: formatResponse(customer) });
    } catch (err) {
      return next(err);
    }
  }

  static async updateCustomer(req, res, next) {
    try {
      const updatedCustomer = await Customer.findByIdAndUpdate(
        { _id: req.params.id },
        req.body,
        { new: true, runValidators: true }
      );
      if (!updatedCustomer) {
        return next(new AppError('Update customer request: Customer with this ID does not exist', HttpStatus.NOT_FOUND));
      }
      logger.info(`Update customer request: Customer with ID ${req.params.id} updated`);
      return res
        .status(HttpStatus.OK)
        .json({ customer: formatResponse(updatedCustomer) });
    } catch (err) {
      return next(err);
    }
  }

  static async deleteCustomer(req, res, next) {
    try {
      const customer = await Customer.findByIdAndDelete(req.params.id);

      if (!customer) {
        return next(
          new AppError(
            `Delete customer request: Customer with ID ${req.params.id} not found`,
             HttpStatus.NOT_FOUND
          )
        );
      }
      logger.info(`Delete customer request: Customer with ID ${req.params.id} deleted`);
      return res.status(HttpStatus.NO_CONTENT).json({ status: 'success' });
    } catch (err) {
      return next(err);
    }
  }

  static async getMe(req, res, next) {
    req.params.id = req.user.id;
    next();
  }

  static async updateMe(req, res, next) {
    if (req.body.password || req.body.passwordConfirmation) {
      return next(
        new AppError(
          'Want to update your password? Kindly, use update password route',
          HttpStatus.BAD_REQUEST
        )
      );
    }

    if (req.body.email) {
      return next(
        new AppError(
          'Want to update your email? Contact our support center',
          HttpStatus.BAD_REQUEST
        )
      );
    }

    try {
      const filterredFields = filterFields(req.body, [
        'firstName',
        'lastName',
        'userName',
      ]);
      const updatedCustomer = await Customer.findByIdAndUpdate(
        req.headers.user.id || req.user.id,
        filterredFields,
        { new: true, runValidators: true }
      );

      logger.info(`Update me request: Customer with ID ${req.user.id} updated`);
      return res
        .status(HttpStatus.OK)
        .json({ customer: formatResponse(updatedCustomer) });
    } catch (err) {
      return next(err);
    }
  }

  static async deleteMe(req, res, next) {
    try {
      const customer = await Customer.findByIdAndUpdate(req.user.id, {
        active: false,
      });

      if (!customer) {
        return next(new AppError(`Forbidden: Customer with ID ${req.user.id} not found`, HttpStatus.FORBIDDEN));
      }

      logger.info(`Delete me request: Customer with ID ${req.user.id} deactivated`);
      return res.status(HttpStatus.NO_CONTENT).end({ status: 'success' });
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = CustomerController;
