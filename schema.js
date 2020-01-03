const mongoose = require('mongoose')

const Schema = mongoose.Schema

const PullRequestSchema = new Schema({
  runId: {
    type: String,
    required: true
  },
  pullRequestNumber: Number,
  sha: String,
  timestamp: {
    type: Date,
    default: Date.now
  },
  url: [
    {
      url: String,
      result: {
        valid: Boolean,
        isHttps: Boolean,
        httpsForward: Boolean,
        reachable: Boolean,
        cors: Boolean,
        contentType: Boolean,
        certValid: Boolean,
        message: String
      }
    }
  ]
})

module.exports = mongoose.model('PullRequest', PullRequestSchema)
