const { merge } = require('webpack-merge');
const path = require('path');  // Add this line
const common = require('./webpack.common.js');

module.exports = merge(common, {
  mode: 'development',
  devServer: {
    open: true,
    port: 8088,
    client: {
      overlay: true,
    },
    historyApiFallback: {
      index: 'index.html',
    },
    static: './public',
  },
  devtool: 'inline-source-map',
});
