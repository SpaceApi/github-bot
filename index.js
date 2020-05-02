const SpaceApiValidator = require('@spaceapi/validator-client')
const uuid = require('uuid')
const mongoose = require('mongoose')
const PullRequest = require('./schema')

const mongoUri = `mongodb://${process.env.DB_HOST}/spaceapi`
mongoose.connect(mongoUri, {
  user: process.env.DB_USER,
  pass: process.env.DB_PASS,
  useUnifiedTopology: true,
  useNewUrlParser: true
})

const validateSpaceUrl = url => {
  const apiInstance = new SpaceApiValidator.V2Api()
  const validateUrlV2 = new SpaceApiValidator.ValidateUrlV2(url)
  return apiInstance.v2ValidateURLPost(validateUrlV2).then(res => {
    return {
      url,
      result: res
    }
  })
}

async function createPullRequestStatus (pullRequest, context) {
  const status = {
    sha: pullRequest.sha,
    state: 'pending',
    target_url: `https://githubbot.spaceapi.io/pullrequest/${pullRequest.pullRequestNumber}`,
    description: 'Checking for added url(s)',
    context: 'Url check'
  }

  await context.github.repos.createStatus(context.repo(status))
    .then(() => {
      context.github.repos.createStatus(context.repo({
        ...status,
        state: pullRequest.url.reduce((pre, cur) => pre && cur.result.valid, true) ? 'success'
          : 'failure'
      }))
      pullRequest.save()
    })
}

function validatePullRequest (pullRequest) {
  return Promise.all(pullRequest.url.map(val => validateSpaceUrl(val.url)))
    .then(res => {
      pullRequest.url = res
      pullRequest.save()
      return pullRequest
    })
}

module.exports = app => {
  app.log('app started')
  const router = app.route('/spaceapi')

  router.get('/pullrequest/:number(\\d+)', (req, res) => {
    PullRequest.find({ pullRequestNumber: req.params.number },
      { _id: 0, __v: 0, 'url._id': 0 }).exec().then(result => {
      res.send(result)
    })
  })

  app.on('pull_request', async context => {
    const { sha } = context.payload.pull_request.head
    const pullRequest = new PullRequest({ runId: uuid.v4(), sha })
    const pull = context.issue()
    app.log(`start checking pull request ${pull.number}`)
    pullRequest.pullRequestNumber = pull.number
    await pullRequest.save()

    await context.github.pulls.listFiles(pull)
      .then(changedFiles => {
        return Promise.all(changedFiles.data.map(data => {
          if (data.filename === 'directory.json') {
            return data.patch.match(/^\+.*/gm).map((match) => {
              return match.match(/https?[^"]*/gi).map(url => url)
            })
              .flat()
          }
          return null
        })
          .filter(res => res)
          .flat())
      })
      .then(res => {
        res.forEach(url => {
          pullRequest.url.push({
            url
          })
        })
      })

    await validatePullRequest(pullRequest).then(res => {
      createPullRequestStatus(res, context)
      app.log(`done checking pull request ${pull.number}`)
    })
    // await console.log(pullRequest)
    // await createPullRequestStatus(pullRequest, context)
  })
}
