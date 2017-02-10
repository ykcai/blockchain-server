var express         = require('express')
var router          = express.Router()
var dbUtil          = require('./utils/db-util')
var UUID            = require('./utils/UUID-util')
var CONFIG          = require('./package').config
var UsersManager    = require('./users-manager')
var transactionUtil = require('./utils/transaction-util')

var ibc
var chaincode

dbUtil.getAllUsers(null, null, function(rows){
  UsersManager.setup(rows)
})

// Script to allocate allowance to users based on db every X seconds
setInterval(function(){
  console.log("Calling allowance")

  dbUtil.getAllUsers(null, null, function(data){
    var promises = data.map(function(o){
      return new Promise(function(resolve, reject){
        console.log(o)
        chaincode.invoke.addAllowance([o.id, o.allowance.toString()], function(e, data){
          if(e){
            console.log("Blockchain error, on allowance")
            reject()
          }
          else if(!data){
            console.log("Data error, on allowance")
            reject()
          }
          else{
            resolve()
          }
        })
      })
    })

    Promise.all(promises).then(function(){
      console.log("Allowances completed")
    })
  })
}, CONFIG.ALLOWANCE_SCHED)

var sendErrorMsg = function(str, res){
  console.log(str)
  res.status(400)
  res.send({msg: str, status: 400})
}

var filterByDates = function(data, start, end){
  if(start){
    var date = new Date(start)
    data = data.filter(function(o){
      var d = new Date(o.timestamp.seconds*1000)
      return d >= date
    })
  }

  // filter for end date
  if(end){
    var date = new Date(end)
    data = data.filter(function(o){
      var d = new Date(o.timestamp.seconds*1000)
      return d <= date
    })
  }

  return data
}

module.exports.setup = function(sdk, cc){
  ibc = sdk
  chaincode = cc
}

module.exports.isSetup = function(){
  return ibc && chaincode
}

// response: JSON
router.get('/ui/tip-reasons', function(req, res){
  dbUtil.getTipReasons(res)
})

// headers: username, token
// response: JSON
router.get('/user', function(req, res){
  UsersManager.checkUserTokenPair(req.get("username"), req.get("token"), res, sendErrorMsg, function(){
    chaincode.query.read([req.get("username")], function(e, data){
      if(e){
        sendErrorMsg("Blockchain Error " + e, res)
      }
      else if(!data){
        sendErrorMsg("Error - Data not found for some reason?", res)
      }
      else{
        res.status(200)
        res.send(data)
      }
    })
  })
})

// Trade history - gets the trades the user did & allowances
// headers: username, token, startDateTime (optional), endDateTime (optional), query (optional)
// DateTime format is YYYY-MM-DDThh:mm:ss.000Z format ie. 2016-11-28T15:53:52.000Z
// response: JSON
router.get('/trade-history', function(req, res){
  UsersManager.checkUserTokenPair(req.get("username"), req.get("token"), res, sendErrorMsg,function(){

    // filter by user
    var data = transactionUtil.getTransactionHistory(req.get("username"))
    var data2 = transactionUtil.getAllowanceHistory(req.get("username"))

    var query = req.get("query")
    if(query){
      query = query.toLowerCase()
      var arrContains = function(arr, str){
        var sendName = UsersManager.getFullname(arr[1]).fullname.toLowerCase()
        var recName = UsersManager.getFullname(arr[3]).fullname.toLowerCase()

        if(sendName.substr(0, str.length) === str || recName.substr(0, str.length) === str ||
        arr[1].substr(0, str.length) === str || arr[3].substr(0, str.length) === str){
          return true
        }
        return false
      }
    }

    data = filterByDates(data.concat(data2), req.get("startDateTime"), req.get("endDateTime"))

    data.forEach(function(o){
      if(o.type === "set_user"){
        o.sender = UsersManager.getFullname(o.transaction[1])
        o.receiver = UsersManager.getFullname(o.transaction[3])
      }
    })

    res.status(200)
    res.send({data: data})
  })
})

// Trade history - gets the trades the user did & allowances
// headers: username, token, startDateTime (optional), endDateTime (optional), query (optional)
// DateTime format is YYYY-MM-DDThh:mm:ss.000Z format ie. 2016-11-28T15:53:52.000Z
// response: JSON
router.get('/trade-statistics', function(req, res){
  UsersManager.checkUserTokenPair(req.get("username"), req.get("token"), res, sendErrorMsg,function(){

    // filter by user
    var data = transactionUtil.getTransactionHistoryStatistics();
    // var data2 = transactionUtil.getAllTransactionHistory();

    // data = filterByDates(data2, req.get("startDateTime"), req.get("endDateTime"))

    data.forEach(function(key, value){
      value.user = UsersManager.getFullname(key)
      if (value.user != null)
      console.log('user found')
    })

    res.status(200)
    res.send({data: data})
  })
})


// Product history - gets the products the user purchased
// headers: username, token, startDateTime (optional), endDateTime (optional)
// DateTime format is YYYY-MM-DDThh:mm:ss.000Z format ie. 2016-11-28T15:53:52.000Z
// response: JSON
router.get('/product-history', function(req, res){
  UsersManager.checkUserTokenPair(req.get("username"), req.get("token"), res, sendErrorMsg, function(){

    var data = transactionUtil.getProductHistory(req.get("username"))
    data = filterByDates(data, req.get("startDateTime"), req.get("endDateTime"))

    res.status(200)
    res.send({data: data})
  })
})

// headers: token
// body: senderId, receiverId, amount, reason
// response: JSON
router.post('/trade', function(req, res){
  var senderId = req.body.senderId
  var receiverId = req.body.receiverId
  var amount = req.body.amount
  var reason = req.body.reason

  if(!senderId || !receiverId || !amount || !reason){
    sendErrorMsg("Missing data", res)
    return
  }

  UsersManager.checkUserTokenPair(senderId, req.get("token"), res, sendErrorMsg, function(){
    chaincode.query.read([senderId], function(e, data){
      if(e){
        sendErrorMsg("Blockchain Error " + e, res)
        return
      }
      if(!data){
        sendErrorMsg("Error - Sender user doesnt exist", res)
        return
      }

      if(data.giveBalance < amount){
        sendErrorMsg("Error - not enough cash", res)
        //chain code doesnt throw errors to shitty ibm blockchain js bullshit
        //so manually check and throw one ourselves
        return
      }

      if(senderId == receiverId) {
        sendErrorMsg("Error - invalid receiverId", res)
        return
      }

      chaincode.query.read([receiverId], function(e, data){
        if(e){
          sendErrorMsg("Blockchain Error " + e, res)
          return
        }
        if(!data){
          sendErrorMsg("Error - Receiver user doesnt exist", res)
          return
        }

        chaincode.invoke.set_user([senderId, amount, receiverId, reason], function(e, data){
          if(e){
            sendErrorMsg("Blockchain Error " + e, res)
            return
          }
          else if(!data){
            sendErrorMsg("Error - Data not found for some reason?", res)
          }
          else{
            res.status(200)
            res.send(data)
          }
        })

      })

    })
  })
})

// body: username, password, fullname, image_64 (optional)
// response: JSON
router.post('/createAccount', function(req, res){
  var username = req.body.username
  var password = req.body.password
  var fullname = req.body.fullname
  var image_64 = req.body.image_64

  if(!username || !password || !fullname){
    sendErrorMsg("Missing data", res)
    return
  }

  if(!UsersManager.isIBM(username)){
    sendErrorMsg("Not an IBM email", res)
    return
  }

  chaincode.query.read([username], function(e, data){
    if(e){
      sendErrorMsg("Blockchain error, check logs", res)
      return
    }
    if(data){
      sendErrorMsg("User already exists", res)
      return
    }

    chaincode.invoke.createAccount([username, UsersManager.hashPassword(password)], function(e, data){
      if(e){
        sendErrorMsg("Error " + e, res)
      }
      // else if(!data){
      //   sendErrorMsg("Error - Data not found for some reason?", res)
      // }
      else{
        var token = UsersManager.createToken(username)
        data.token = token
        dbUtil.addUser(username, fullname, image_64, res)
        UsersManager.addFullname(username, fullname, image_64)

        res.status(200)
        res.send(data)
      }
    })

  })
})

// body: username, password
// response: JSON
router.post('/login', function(req, res){
  var username = req.body.username
  var password = req.body.password

  if(!username || !password){
    sendErrorMsg("Missing data", res)
    return
  }

  chaincode.query.read([username], function(e, data){
    if(e){
      console.log(e)
      sendErrorMsg("Blockchain error", res)
      return
    }
    if(!data){
      sendErrorMsg("Error - Data not found for some reason?", res)
      return
    }

    var hash = JSON.parse(data).password

    if(UsersManager.comparePasswords(password, hash)){
      var token = UsersManager.createToken(username)

      dbUtil.getUser(username, res, function(rows){
        res.status(200)
        res.send({token: token, fullname: rows[0].fullname, image_64: rows[0].image_64})
      })
    }
    else{
      sendErrorMsg("Wrong password", res)
    }
  })
})

// headers: token
// body: username
// response: JSON
router.post('/logout', function(req, res){
  var username = req.body.username
  var token = req.get("token")

  if(!username || !token){
    sendErrorMsg("Missing data", res)
    return
  }

  UsersManager.logout(username, token, res, sendErrorMsg, function(){
    res.status(200)
    res.send({msg: "Logged out"})
  })
})

// headers: token, username
// response: JSON
router.get('/product/:prodID', function(req, res){
  UsersManager.checkUserTokenPair(req.get("username"), req.get("token"), res, sendErrorMsg, function(){
    chaincode.query.read([req.params.prodID], function(e, data){
      if(e){
        sendErrorMsg("Blockchain Error " + e, res)
      }
      else if(!data){
        sendErrorMsg("Error - Data not found for some reason?", res)
      }
      else{
        res.status(200)
        res.send(data)
      }
    })
  })
})

// response: JSON
router.get('/all-products', function(req, res){
  var products = []
  var prodIDs = []

  dbUtil.getAllProducts(res, function(rows){

    var promises = rows.map(function(o){
      return new Promise(function(resolve, reject){
        chaincode.query.read([o.id], function(e, data){
          if(e){
            sendErrorMsg("Blockchain Error " + e, res)
            reject()
          }
          else if(!data){
            sendErrorMsg("Error - Data not found for some reason? " + o.id, res)
            reject()
          }
          else{
            data = JSON.parse(data)
            data.image_64 = o.image_64 ? o.image_64 : ""
            console.log(data)
            products.push(data)
            resolve()
          }
        })
      })
    })

    Promise.all(promises).then(function(){
      res.status(200)
      res.send(products)
    })
  })
})

// headers: token, username, fullname (optional)
// response: JSON
router.get('/all-users', function(req, res){
  UsersManager.checkUserTokenPair(req.get("username"), req.get("token"), res, sendErrorMsg, function(){
    dbUtil.getAllUsers(req.get("fullname"), res, function(data){
      data.forEach(function(o){
        delete o.allowance
      })

      res.status(200)
      res.send(data)
    })
  })
})

// make this secure somehow fam LOL
router.post('/add-product/:name/:cost', function(req, res){
  var uuid = UUID.randomUUID()
  chaincode.invoke.createProduct([uuid, req.params.name, req.params.cost], function(e, data){
    if(e){
      sendErrorMsg("Blockchain Error " + e, res)
    }
    else if(!data){
      sendErrorMsg("Error - Data not found for some reason?", res)
    }
    else{
      dbUtil.addProduct(uuid, res)

      data.prodID = uuid
      res.status(200)
      res.send(data)
    }
  })
})

// headers: token
// body: username
// response: JSON
router.post('/exchange', function(req, res){
  var username = req.body.username
  if(!username){
    sendErrorMsg("Missing data", res)
    return
  }

  UsersManager.checkUserTokenPair(username, req.get("token"), res, sendErrorMsg, function(){
    chaincode.invoke.exchange([username, "100"], function(e, data){
      if(e){
        sendErrorMsg("Blockchain Error " + e, res)
      }
      else if(!data){
        sendErrorMsg("Error - Data not found for some reason?", res)
      }
      else{
        res.status(200)
        res.send(data)
      }
    })
  })
})

// headers: token
// body: prodID, username
// response: JSON
router.post('/purchase-product', function(req, res){
  // all this shit, just to check if the user has enough balance to buy
  // thx ibm block chain js /s
  var cost
  var prodID = req.body.prodID
  var username = req.body.username

  if(!prodID || !username){
    sendErrorMsg("Missing data", res)
    return
  }

  UsersManager.checkUserTokenPair(username, req.get("token"), res, sendErrorMsg, function(){
    chaincode.query.read([prodID], function(e, data){
      if(e){
        sendErrorMsg("Blockchain Error " + e, res)
      }
      else if(!data){
        sendErrorMsg("Error - Data not found for some reason?", res)
      }
      else{
        data = JSON.parse(data)
        cost = data.cost
        chaincode.query.read([username], function(e, data){
          if(e){
            sendErrorMsg("Blockchain Error " + e, res)
          }
          else if(!data){
            sendErrorMsg("Error - Data not found for some reason?", res)
          }
          else{
            data = JSON.parse(data)
            if(data.pointsBalance < cost){
              sendErrorMsg("Error - not enough points to buy", res)
            }
            else{
              chaincode.invoke.purchaseProduct([prodID, username], function(e, data){
                if(e){
                  sendErrorMsg("Blockchain Error " + e, res)
                }
                else if(!data){
                  sendErrorMsg("Error - Data not found for some reason?", res)
                }
                else{
                  res.status(200)
                  res.send(data)
                }
              })
            }
          }
        })
      }
    })
  })
})

module.exports.router = router
