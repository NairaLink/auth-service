/* eslint-disable func-names */
const mongoose = require('mongoose');
const validator = require('validator');
const sha1 = require('sha1');

const customerSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, 'Pls, provide your firstname'],
  },
  lastName: {
    type: String,
    required: [true, 'Pls, provide your lastname'],
  },
  userName: {
    type: String,
    required: [true, 'Pls, provide a username'],
  },
  image: String,
  email: {
    type: String,
    lowercase: true,
    trim: true,
    unique: true,
    required: [true, 'Kindly provide your email'],
    validate: [validator.isEmail, 'Pls, provide a valid email'],
  },
  phoneNumber: {
    type: String,
    unique: true,
    parse: true,
  },
  password: {
    type: String,
    required: [true, 'Kindly provide a password'],
    min: [8, 'Minimum length should be 8'],
    select: false,
  },
  passwordConfirmation: {
    type: String,
    required: [true, 'Kindly re-enter your password'],
    validate: {
      validator(el) {
        return this.password === el;
      },
      message: 'Password are not the same!',
    },
  },
  active: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now(),
  },
  updatedAt: {
    type: Date,
    default: Date.now(),
  },
  isVerified: Boolean,
});

// eslint-disable-next-line func-names, consistent-return
customerSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  this.password = sha1(this.password);

  this.passwordConfirmation = undefined;
  next();
});

// index
customerSchema.index({ email: 1 }, { unique: true });

const Customer = mongoose.model('Customer', customerSchema);
module.exports = Customer;