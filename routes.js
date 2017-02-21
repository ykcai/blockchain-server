var express         = require('express')
var router          = express.Router()
var dbUtil          = require('./utils/db-util')
var UUID            = require('./utils/UUID-util')
var CONFIG          = require('./package').config
var UsersManager    = require('./users-manager')
var transactionUtil = require('./utils/transaction-util')
var passport        = require('passport')
var cookieParser    = require('cookie-parser');
var session         = require('express-session');
var http            = require('http');
var slackUtil = require('./utils/slack-util')
var ibc
var chaincode

const THIS_SERVER = "http://michcai-blockedchain.mybluemix.net";
const SLACK_SERVER = "http://slackbot-test-server.mybluemix.net";

dbUtil.getAllUsers(null, null, function(rows){
  UsersManager.setup(rows)
})

// ---- AUTHENTICATION ----- //

router.use(cookieParser());
router.use(session({ secret: 'keyboard cat', resave: false, saveUninitialized: true }));
router.use(passport.initialize());
router.use(passport.session());

passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
});

var ssoConfig = CONFIG.SSO;
var client_id = ssoConfig.clientID;
var client_secret = ssoConfig.secret;
var authorization_url = ssoConfig.authURL;
var token_url = ssoConfig.tokenURL;
var issuer_id = ssoConfig.issuerID;
var callback_url = ssoConfig.callbackURL;

var OpenIDConnectStrategy = require('passport-idaas-openidconnect').IDaaSOIDCStrategy;
var Strategy = new OpenIDConnectStrategy({
  authorizationURL : authorization_url,
  tokenURL : token_url,
  clientID : client_id,
  scope : 'email',
  response_type : 'code',
  clientSecret : client_secret,
  callbackURL : callback_url,
  skipUserProfile : true,
  issuer : issuer_id
},
function(iss, sub, profile, accessToken, refreshToken, params, done) {
  process.nextTick(function() {
    profile.accessToken = accessToken;
    profile.refreshToken = refreshToken;
    done(null, profile);
  })
}
)

passport.use(Strategy);
var redirect_url
router.get('/auth/sso/callback',function(req,res,next) {
  redirect_url=req.session.originalUrl
  passport.authenticate('openidconnect', {
    successRedirect: '/auth/success',
    failureRedirect: '/auth/failure',
  })(req,res,next);
});

router.get('/auth/failure', function(req, res) {
  //res.send({check:"This doesn't work"})
  sendErrorMsg('W3id login failed',res);
});
//webview closes at this api URL
router.get('/auth/success',function(req,res){
  console.log('login success'+redirect_url)
  res.redirect(redirect_url)
})
router.get('/auth/checkAuth',function(req,res){
  //console.log(req)
  if (req.isAuthenticated()){
    res.send({status:true})
  }else{
    res.send({status:false})
  }
})

router.get('/slack/signup', ensureAuthenticated, function(req,res){
    console.log("start of /slack/signup route");
    console.log("req.user.emailaddress: " + req.user.emailaddress);
    console.log("req.user.cn: " + req.user.cn);

    var URL = "http://michcai-blockedchain.mybluemix.net/slack/createAccount"
    slackUtil.executePostAPIcall(URL, {'emailaddress': req.user.emailaddress, 'cn':req.user.cn}, null, (error, res3, body) => {
        console.log("err: " + JSON.stringify(error));
        console.log("res: " + res);
        console.log("body: " + JSON.stringify(body));

        var msg = null;
        body = (body) ? JSON.parse(body) : null;

        if(body && body.token && body.fullname){
            console.log("successfully created a new account");
            msg = "SUCCESSFULLY_AUTHENTICATED"
            res.redirect('http://slackbot-test-server.mybluemix.net/');
        }else if(body && body.msg == "User already exists"){
            msg = "ALREADY_EXIST"
            res.redirect('http://slackbot-test-server.mybluemix.net/');
        }else if(body && body.msg){
            msg = body.msg;
            res.redirect('http://slackbot-test-server.mybluemix.net/');
        }else{
            console.log("COULD NOT found email and username  and stuff after response 1");
            msg = 'SOMETHING_WENT_WRONG' ;
            res.send({message:'Something Went Wrong With The Slack Registration', error:'EMAIL_NOT_FOUND'})
        }

        slackUtil.sendSignUpNotificationToSlack(res, req.user.emailaddress, msg, function(res1, err1, result, body){
            console.log("Slack Sign Up err1: " +  JSON.stringify(err1));
            console.log("Slack Sign Up result: " + result);
            console.log("Slack Sign Up body: " + JSON.stringify(body));
        });

        console.log("End of reponse callback");
    })
  console.log("end of /slack/signup route");
})

router.get('/auth/user',function(req,res){
  var username = req.user.emailaddress
  chaincode.query.read([username], function(e, data){
    if(e){
      console.log(e)
      sendErrorMsg("Blockchain error", res)
      return
    }
    if(!data){
      console.log("Error - Data not found for some reason?")
      res.redirect('/createAccount')
      return
    }

    var token = UsersManager.createToken(username)

    dbUtil.getUser(username, res, function(rows){
      res.status(200)
      res.send({token: token, fullname: rows[0].fullname, image_64: rows[0].image_64,username:username})
    })
  })
})

//end testing
router.get('/auth/authenticate', passport.authenticate('openidconnect', {}));

function ensureAuthenticated(req, res, next) {
  if(!req.isAuthenticated()) {
    req.session.originalUrl = req.originalUrl;
    res.redirect('/auth/authenticate');
  } else {
    return next();
  }
}

// --- END AUTHENTICATION ---- //

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

var makeMap = function(map) {
  const out = Object.create(null)
  map.forEach((value, key) => {
    if (value instanceof Map) {
      out[key] = map_to_object(value)
    }
    else {
      out[key] = value
    }
  })
  return out
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

// headers: username, token
// response: JSON
router.get('/slack/user', function(req, res){
  console.log("req.get('username'): " + req.get("username"));
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

// headers: token
// body: username
// response: JSON
router.post('/slack/exchange', function(req, res){
  var username = req.body.username
  var pointsToExchange = req.body.points

  if(!username){sendErrorMsg("Missing username", res)}
  if(!pointsToExchange){sendErrorMsg("Missing pointsToExchange", res)}
  if(!username || !pointsToExchange){return}

  chaincode.invoke.exchange([username, pointsToExchange], function(e, data){
    console.log("e : " + e);
    console.log("JSON.stringify(e) : " + JSON.stringify(e));
    console.log("JSON.stringify(data) : " + JSON.stringify(data));
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

// headers: token
// body: senderId, receiverId, amount, reason
// response: JSON
router.post('/slack/trade', function(req, res){
  var senderId = req.body.senderId
  var receiverId = req.body.receiverId
  var amount = req.body.amount
  var reason = req.body.reason

  var client = null;
  if(req.body.client) {client = req.body.client}

  if(!senderId){sendErrorMsg("Missing senderId", res)}
  if(!receiverId){sendErrorMsg("Missing receiverId", res)}
  if(!amount){sendErrorMsg("Missing amount", res)}
  if(!reason){sendErrorMsg("Missing reason", res)}
  if(!senderId || !receiverId || !amount || !reason){return}

  trade(senderId, amount, receiverId, reason, 'SLACK', res);
})



/*
Also sorted by timestamp.
Last one in the array is the latest transaction
*/
router.get('/slack/trade-history', function(req, res){

    // filter by user
    var data = transactionUtil.getTransactionHistory(req.get("username"))

    data.forEach(function(o){
      if(o.type === "set_user"){
        o.sender = UsersManager.getFullname(o.transaction[1])
        o.receiver = UsersManager.getFullname(o.transaction[3])
      }
    })

    res.status(200)
    res.json(data)
})






// body: username, password, fullname, image_64 (optional)
// response: JSON
router.post('/slack/createAccount', function(req, res){
    console.log("create account A01");

  //TODO: pull username, and fullname (fname and lname seperate?) from 'req.user'
  var username = req.body.emailaddress
  var fullname = req.body.cn
  var image_64 = ''
  console.log("create account A02");

  if(!username){sendErrorMsg("Missing username", res)}
  if(!fullname){sendErrorMsg("Missing fullname", res)}
  if(!username || !fullname){
    return
  }

  console.log("create account A03");


  chaincode.query.read([username], function(e, data){
      console.log("create account B01");

    if(e){
      sendErrorMsg("Blockchain error, check logs", res)
      return
    }
    if(data){
      sendErrorMsg("User already exists", res)
      return
    }
    console.log("create account B02");


    chaincode.invoke.createAccount([username], function(e, data){
        console.log("create account C01");

      if(e){
        sendErrorMsg("Error " + e, res)
      }
      else if(!data){
        sendErrorMsg("Error - Data not found for some reason?", res)
      }
      else{
          console.log("create account C02");

        var token = UsersManager.createToken(username)
        data.token = token
        console.log("create account C03");

        dbUtil.addUser(username, fullname, image_64, res)
        UsersManager.addFullname(username, fullname, image_64)
        console.log("create account C04");
        console.log("create account C05 {token:token,fullname:fullname,image_64:image_64,username:username}: " + {token:token,fullname:fullname,image_64:image_64,username:username});

        res.status(200)
        res.send({token:token,fullname:fullname,image_64:image_64,username:username})
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
    console.log("got to 101");

    var query = req.get("query")

    console.log("got to 1001");

    if(query){
        console.log("got to 102");

      query = query.toLowerCase()
      var arrContains = function(arr, str){
          console.log("got to 103");

        var sendName = UsersManager.getFullname(arr[1]).fullname.toLowerCase()
        var recName = UsersManager.getFullname(arr[3]).fullname.toLowerCase()
        console.log("got to 104");

        if(sendName.substr(0, str.length) === str || recName.substr(0, str.length) === str ||
        arr[1].substr(0, str.length) === str || arr[3].substr(0, str.length) === str){
            console.log("got to 105");

          return true
        }
        console.log("got to 106");

        return false

      }
    }

    console.log("got to 201");

    data = filterByDates(data.concat(data2), req.get("startDateTime"), req.get("endDateTime"))

    console.log("got to 301");

    data.forEach(function(o){
      if(o.type === "set_user"){
        //   console.log("the UsersManager.getFullname(o.transaction[1]): " + UsersManager.getFullname(o.transaction[1]));
        //   console.log("the UsersManager.getFullname(o.transaction[3]): " + UsersManager.getFullname(o.transaction[3]));

        o.sender = UsersManager.getFullname(o.transaction[1])
        o.receiver = UsersManager.getFullname(o.transaction[3])
      }
    })

    console.log("got to 401 data :" + data);


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

    var data = transactionUtil.getTransactionHistoryStatistics();

    data.forEach(function(key, value){
      value.user = UsersManager.getFullname(key)
      data.set(key, value);
    })

    res.status(200)
    res.json({data: makeMap(data)})
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

var trade = function(senderId, amount, receiverId, reason, client, res){
  chaincode.query.read([senderId], function(e, data){
    if(e){
      sendErrorMsg("Blockchain Error " + e, res)
      return
    }
    if(!data){
      sendErrorMsg("Error - Sender user doesnt exist", res)
      return
    }

    data = JSON.parse(data);

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
          slackUtil.sendTradeNotificationToSlack(res, senderId, receiverId, amount, reason, client, function(res, err, result, body){
            res.status(200)
            res.send(data)
          });
        }
      })

    })

  })
}

// headers: token
// body: senderId, receiverId, amount, reason
// response: JSON
router.post('/trade', function(req, res){
  var senderId = req.body.senderId
  var receiverId = req.body.receiverId
  var amount = req.body.amount
  var reason = req.body.reason

  var client = null;
  if(req.body.client) {client = req.body.client}

  if(!senderId){sendErrorMsg("Missing senderId", res)}
  if(!receiverId){sendErrorMsg("Missing receiverId", res)}
  if(!amount){sendErrorMsg("Missing amount", res)}
  if(!reason){sendErrorMsg("Missing reason", res)}
  if(!senderId || !receiverId || !amount || !reason){return}

  UsersManager.checkUserTokenPair(senderId, req.get("token"), res, sendErrorMsg, function(){
    trade(senderId, amount, receiverId, reason, 'APP', res);
  })

})

// body: username, password, fullname, image_64 (optional)
// response: JSON
router.get('/createAccount', function(req, res){
    console.log("create account A01");

  //TODO: pull username, and fullname (fname and lname seperate?) from 'req.user'
  var username = req.user.emailaddress
  var fullname = req.user.cn
  var image_64 = ''
  console.log("create account A02");

  if(!username || !fullname){
    sendErrorMsg("Missing data", res)
    return
  }
  console.log("create account A03");


  chaincode.query.read([username], function(e, data){
      console.log("create account B01");

    if(e){
      sendErrorMsg("Blockchain error, check logs", res)
      return
    }
    if(data){
      sendErrorMsg("User already exists", res)
      return
    }
    console.log("create account B02");


    chaincode.invoke.createAccount([username], function(e, data){
        console.log("create account C01");

      if(e){
        sendErrorMsg("Error " + e, res)
      }
      else if(!data){
        sendErrorMsg("Error - Data not found for some reason?", res)
      }
      else{
          console.log("create account C02");

        var token = UsersManager.createToken(username)
        data.token = token
        console.log("create account C03");

        dbUtil.addUser(username, fullname, image_64, res)
        UsersManager.addFullname(username, fullname, image_64)
        console.log("create account C04");
        console.log("create account C05 {token:token,fullname:fullname,image_64:image_64,username:username}: " + {token:token,fullname:fullname,image_64:image_64,username:username});

        res.status(200)
        res.send({token:token,fullname:fullname,image_64:image_64,username:username})
      }
    })

  })
})

// body: username, image_64
// response: JSON
router.post('/update_image', function(req, res){

  var username = req.body.username
  var image_64 = req.body.image_64

  if(!username){sendErrorMsg("Missing username", res)}
  if(!image_64){sendErrorMsg("Missing image_64", res)}
  if(!username || !image_64){return}

  chaincode.query.read([username], function(e, data){
    if(e){
      sendErrorMsg("Blockchain error, check logs", res)
      return
    }
    if(!data){
      sendErrorMsg("User does not exists", res)
      return
    }


    dbUtil.update_image(username, image_64, res, function(rows){
        console.log("comming back here");
        // UsersManager.updateImageInMap(username, image_64);
        res.status(200)
        res.send({success: 'TRUE', image_64:image_64, username:username})
    })
  })
})

// headers: token
// body: username
// response: JSON
router.get('/logout', function(req, res){
  var username = req.get.username
  var token = req.get("token")

  if(!username || !token){
    sendErrorMsg("Missing data", res)
    return
  }

  UsersManager.logout(username, token, res, sendErrorMsg, function(){
    req.logout()
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
router.get('/all-products',ensureAuthenticated, function(req, res){
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
// body: username
// response: JSON
router.post('/deposit', function(req, res){
  var username = req.body.username
  var coins = req.body.coins

  if(!username){
    sendErrorMsg("Missing username", res)
    return
  }

  if(!coins){
    sendErrorMsg("Missing coins", res)
    return
  }

  chaincode.invoke.deposit([username, coins], function(e, data){
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


//headers: token
//body: username, feedback, starCount
router.post('/submitFeedback',function(req,res){
  var username = req.body.username
  var feedback = req.body.feedback
  var starCount = req.body.starCount

  if (!username){
    sendErrorMsg("Missing Username",res)
  }
  if (!feedback){
    sendErrorMsg("Missing Feedback",res)
  }
  if (!starCount){
    sendErrorMsg("Missing Rating", ews)
  }

  UsersManager.checkUserTokenPair(username, req.get("token"), res, sendErrorMsg, function(){
    dbUtil.submitFeedback(username,feedback,starCount)
    res.send(200)
  })

})

module.exports.router = router
