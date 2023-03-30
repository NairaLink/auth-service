/* eslint-disable implicit-arrow-linebreak */
/* eslint-disable function-paren-newline */
/* eslint-disable comma-dangle */
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '/../.env' )});

const worker = require('./worker');

worker.on('completed', (job) =>
  console.info(
    `Completed job ${job.id} successfully, sent message to ${job.data.firstName}`
  )
);
worker.on('failed', (job, err) =>
  console.info(`Failed job ${job.id} with ${err}`)
);
