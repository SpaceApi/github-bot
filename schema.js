const mongoose = require('mongoose')

const Schema = mongoose.Schema

const PullRequestSchema = new Schema({
  runId: {
    type: String,
    required: true
  },
  pullRequestNumber: Number,
  timestamp: {
    type: Date,
    default: Date.now
  },
  url: [
    {
      url: String,
      valid: Boolean,
      reachable: Boolean,
      cors: Boolean,
      https: {
        certValid: Boolean,
        isHttps: Boolean,
        httpsForward: Boolean
      },
      message: String
    }
  ]
})

module.exports = mongoose.model('PullRequest', PullRequestSchema)
