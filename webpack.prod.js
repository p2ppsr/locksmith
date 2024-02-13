const { merge } = require('webpack-merge');
const path = require('path');  // Add this line
const common = require('./webpack.common.js');

module.exports = merge(common, {
  mode: 'production'
})