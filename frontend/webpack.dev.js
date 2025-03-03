const { merge } = require('webpack-merge')
const common = require('./webpack.common.js')

module.exports = merge(common, {
  mode: 'development',
  devServer: {
    open: true,
    port: 8090, // you can change the port
    client: {
      overlay: true // Show application errors
    },
    historyApiFallback: {
      index: 'index.html'
    },
    static: './public'
  },
  resolve: {
    alias: {
      express: false, // Ignore express in frontend
      net: false, // Prevent import errors
      async_hooks: false // Prevent import errors
    },
    fallback: {
      buffer: require.resolve('buffer/'),
      crypto: require.resolve('crypto-browserify'),
      stream: require.resolve('stream-browserify'),
      http: require.resolve('stream-http'),
      https: require.resolve('https-browserify')
    }
  },
  devtool: 'inline-source-map'
})
