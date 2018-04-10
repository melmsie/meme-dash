const cluster = require('cluster')
const express = require('express')
const bodyParser = require('body-parser')
const app = express()
const fs = require('fs')
const r = require('rethinkdbdash')()
const config = require('./config.json')

const cpusLength = require('os').cpus().length
app.use('/', express.static('./static'))
app.use(bodyParser.json())

// DBL webhooks
app.post('/dblwebhook', async (req, res) => {
  if (req.headers.authorization) {
    if (req.headers.authorization === config.webhook_secret) {
      req.body.type === 'upvote' ? await addCoins(req.body.user, 750)
        : await removeCoins(req.body.user, 750)
      res.send({status: 200})
    } else {
      res.send({status: 401, error: 'You done gone goofed up auth.'})
    }
  } else {
    res.send({status: 403, error: 'Pls stop.'})
  }
})

app.use(function (req, res, next) {
  res.status(404).send({error: "404: You in the wrong part of town, boi."});
});

function launchServer () {
  const http = require('http')
  http.createServer(app).listen(80)
  console.log(`Server started on port 80 pid: ${process.pid}`)
}

if (cluster.isMaster) {
  const workerNumber = cpusLength - 1
  console.log(`Starting ${workerNumber} workers`)
  for (let i = 0; i < workerNumber; i++) {
    cluster.fork()
  }
  for (const id in cluster.workers) {
    cluster.workers[id].on('message', masterHandleMessage)
  }
} else {
  // worker
  launchServer()
}

cluster.on('online', (worker) => {
  console.log(`Worker ${worker.id} started`)
})

async function masterHandleMessage (message) {
  //processes events from the workers, in master process
  if(message === 'stuff') {
    console.log(message);
  }
}

function formatTime (time) {
  let days = Math.floor(time % 31536000 / 86400)
  let hours = Math.floor(time % 31536000 % 86400 / 3600)
  let minutes = Math.floor(time % 31536000 % 86400 % 3600 / 60)
  let seconds = Math.round(time % 31536000 % 86400 % 3600 % 60)
  days = days > 9 ? days : '0' + days
  hours = hours > 9 ? hours : '0' + hours
  minutes = minutes > 9 ? minutes : '0' + minutes
  seconds = seconds > 9 ? seconds : '0' + seconds
  return `${days > 0 ? `${days}:` : ``}${(hours || days) > 0 ? `${hours}:` : ``}${minutes}:${seconds}`
}

async function addCoins (id, amount) {
  let coins = await getCoins(id)
  coins.coin += amount
  coins.upvoted = true

  return r.table('users')
    .insert(coins, { conflict: 'update' })
}

async function grabCoin (id) {
  let coins = await r.table('users')
    .get(id)
    .run()
  if (!coins) {
    return r.table('users')
      .insert({ id, coin: 0, upvoted: false }, { returnChanges: true })
      .run()
  }
  return coins
}

async function getCoins (id) {
  let coins = await grabCoin(id)
  if (coins.changes) (coins = coins.changes[0].new_val)
  return coins
}

async function removeCoins (id, amount) {
  let coins = await getCoins(id)
  if (coins.coin - amount <= 0) {
    coins.coin = 0
  } else {
    coins.coin -= amount
  }
  coins.upvoted = false

  return r.table('users')
    .insert(coins, { conflict: 'update' })
}
