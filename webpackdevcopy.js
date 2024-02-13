const { merge } = require('webpack-merge')
const common = require('./webpack.common.js')

module.exports = merge(common, {
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    alias: {
      'babbage-scrypt-p2pkh': path.resolve(__dirname, '../babbage-scrypt-p2pkh'),
    },
  },
  mode: 'development',
  devServer: {
    open: true,
    port: 8088, // you can change the port
    client: {
      overlay: true // Show application errors
    },
    historyApiFallback: {
      index: 'index.html'
    },
    static: './public'
  },
  devtool: 'inline-source-map'
})
