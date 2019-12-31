const SpaceApiValidator = require('space_api_validator')
const fetch = require('node-fetch')
const uuidv4 = require('uuid/v4')
const mongoose = require('mongoose')
const PullRequest = require('./schema')

const mongoUri = `mongodb://${process.env.DB_HOST}/spaceapi`
mongoose.connect(mongoUri, {
  user: process.env.DB_USER,
  pass: process.env.DB_PASS,
  useUnifiedTopology: true,
  useNewUrlParser: true
})

const validateSpace = space => {
  return fetch('https://validator.spaceapi.io/v1/validate/', {
    method: 'post',
    body: JSON.stringify({ data: JSON.stringify(space) }),
    headers: { 'Content-Type': 'application/json' }
  })
    .then(res => res.json())
}
const fetchAndValidateSpace = urlResult => {
  let apiInstance = new SpaceApiValidator.V2Api()
  let validateUrlV2 = new SpaceApiValidator.ValidateUrlV2(urlResult.url)
  apiInstance.v2ValidateURLPost(validateUrlV2, (error, data, response) => {
    if (error) {
      console.error(error)
      throw new Error('validator error')
    }

    urlResult.result = data
    return new Promise(data.valid)
  })

/* const origin = 'https://githubbot.spaceapi.io'
  const options = {
    redirect: 'manual',
    headers: new Headers({
      origin
    })
  }

  const spaceResult = {
    cors: false,
    reachable: true,
    https: {
      isHttps: false
    }
  }
  if (url.startsWith('https')) {
    spaceResult.https = {
      isHttps: url.startsWith('https'),
      certValid: true
    }
  }

  return fetch(url, options)
    .catch(err => {
      if (err.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
        spaceResult.https.certValid = false
        const agent = new https.Agent({
          rejectUnauthorized: false
        })
        return fetch(url, { agent, ...options })
      }
    })
    .then(res => {
      const newLocation = res.headers.get('location')
      if (!spaceResult.https.isHttps) {
        spaceResult.https.httpsForward = newLocation !== null &&
          newLocation.startsWith('https')
      }

      return newLocation
        ? fetch(newLocation, options)
        : res
    })
    .then(res => {
      const allowOrigin = res.headers.get('access-control-allow-origin')
      spaceResult.cors = allowOrigin === '*' || allowOrigin === origin
      return res
    })
    .then(res => {
      if (!res.ok) {
        throw new Error('not reachable')
      }

      return res
    })
    .then(res => res.json())
    .then(validateSpace)
    .catch(() => {
      spaceResult.reachable = false
    })
    .then(result => {
      return {
        url,
        ...result,
        ...spaceResult
      }
    }) */
}

async function createPullRequestStatus (pullRequest, context) {
  const status = {
    sha: pullRequest.sha,
    state: 'pending',
    target_url: `https://githubbot.spaceapi.io/pullrequest/${pullRequest.number}`,
    description: 'Checking for added url(s)',
    context: 'Url check'
  }
  await context.github.repos.createStatus(context.repo(status))
    .then(res => {
      return Promise.all(pullRequest.url.map(val => {
        return fetchAndValidateSpace(val)
      }))
    })
    .then(res => {
      context.github.repos.createStatus(context.repo({
        ...status,
        state: res.reduce((pre, cur) => pre && cur, true) ? 'success'
          : 'failure'
      }))

      // pullRequest.url = res
      pullRequest.save()
    })
}

module.exports = app => {
  app.log('app started')
  const router = app.route('/spaceapi')

  router.get('/pullrequest/:number(\\d+)', (req, res) => {
    PullRequest.find({ pullRequestNumber: req.params.number },
      { '_id': 0, '__v': 0, 'url._id': 0 }).exec().then(result => {
      res.send(result)
    })
  })

  app.on('pull_request', async context => {
    const { sha } = context.payload.pull_request.head
    const pullRequest = new PullRequest({ runId: uuidv4(), sha })
    const pull = context.issue()
    app.log(`start checking pull request ${pull.number}`)
    pullRequest.pullRequestNumber = pull.number
    await pullRequest.save()

    await context.github.pullRequests.listFiles(pull)
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

    // await console.log(pullRequest)
    await createPullRequestStatus(pullRequest, context)
    app.log(`done checking pull request ${pull.number}`)
  })
}
