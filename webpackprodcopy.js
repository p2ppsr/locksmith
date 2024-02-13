const { merge } = require('webpack-merge')
const common = require('./webpack.common.js')

module.exports = merge(common, {
  alias: {
    'babbage-scrypt-p2pkh': path.resolve(__dirname, '../babbage-scrypt-p2pkh'),
  },
  mode: 'production'
})
