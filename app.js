'use strict'

var express           = require('express')
var http              = require('http')
var app               = express()
var bodyParser        = require('body-parser')
var fs                = require('fs')
var cors              = require('cors')
var cfenv             = require('cfenv')
var appEnv            = cfenv.getAppEnv()

var transactionUtil   = require('./utils/transaction-util')
var ws                = require('./utils/ws')
var routes            = require('./routes')

// ---- APP SETUP ----- //
app.use(bodyParser.json({limit: '50mb'}))
app.use(bodyParser.urlencoded())

app.options('*', cors())
app.use(cors())

var server = http.createServer(app).listen(appEnv.port, function() {});

// ---- BLOCKCHAIN STUFF ----- //
var Ibc1 = require('ibm-blockchain-js')
var ibc = new Ibc1()

var manual = JSON.parse(fs.readFileSync('mycreds.json', 'utf8'))
var peers = manual.credentials.peers
var users = manual.credentials.users
var deployed = false

// I hate this function too, bluemix doesnt support es6 yet...
function prefer_type1_users(user_array){
	var ret = []
	for(var i in users){
		if(users[i].enrollId.indexOf('type1') >= 0) {	//gather the type1 users
			ret.push(users[i])
		}
	}

	if(ret.length === 0) ret = user_array				//if no users found, just use what we have
	return ret
}

var options = 	{
	network:{
		peers: peers,																	//lets only use the first peer! since we really don't need any more than 1
		users: prefer_type1_users(users),											//dump the whole thing, sdk will parse for a good one
		options: {
			quiet: true 															//detailed debug messages on/off true/false
		}
	},
	chaincode:{
		zip_url: 'https://github.com/ykcai/blockchain-code/archive/v2.zip',
		unzip_dir: 'blockchain-code-2/chaincode',													//subdirectroy name of chaincode after unzipped
		git_url: 'http://gopkg.in/ykcai/blockchain-code.v2/chaincode',		//GO get http url
		//hashed cc name from prev deployment, comment me out to always deploy, uncomment me when its already deployed to skip deploying again
		deployed_name: '47eb79c33d12d28730bb2ef67578169ef3391072119b64e18e6f61407242c429ea7071ddaedddff0a58f8b36e32a29db0660e15d4dfb66108c07401d4cc4162e'
	}
}

if(process.env.VCAP_SERVICES){
	console.log('\n[!] looks like you are in bluemix, I am going to clear out the deploy_name so that it deploys new cc.\n[!] hope that is ok budddy\n');
	options.chaincode.deployed_name = '';
} //Taken from sample marble app from Bluemix

var chaincode = null

ibc.load(options, function (err, cc){														//parse/load chaincode, response has chaincode functions!
	if(err != null){
		console.log('! looks like an error loading the chaincode or network, app will fail\n', err)
    throw(err)
	}

	chaincode = cc

  // SETUP WEBSOCKET
  ws.setup(server)
  routes.setup(ibc, cc)

	// ---- To Deploy or Not to Deploy ---- //
	if(!cc.details.deployed_name || cc.details.deployed_name === ''){					//yes, go deploy
		cc.deploy('init', ['99'], {delay_ms: 30000}, function(e){ 						//delay_ms is milliseconds to wait after deploy for conatiner to start, 50sec recommended
			check_if_deployed(e, 1)
		})
	}
	else{																				//no, already deployed
		console.log('chaincode summary file indicates chaincode has been previously deployed')
		check_if_deployed(null, 1)
	}
});

//loop here, check if chaincode is up and running or not
function check_if_deployed(e, attempt){
	if(e){
		console.log('! looks like a deploy error, holding off on the starting the socket\n', e)
	}
	else if(attempt >= 15){																	//tried many times, lets give up and pass an err msg
		console.log('[preflight check]', attempt, ': failed too many times, giving up')
		var msg = 'chaincode is taking an unusually long time to start. this sounds like a network error, check peer logs'
		//cb_deployed(msg)
	}
	else{
		console.log('[preflight check]', attempt, ': testing if chaincode is ready')
		chaincode.query.read(['test'], function(err, resp){
			var cc_deployed = false

			try{
				if(err == null){															//no errors is good, but can't trust that alone
					if(!resp || resp === 'null') cc_deployed = true									//looks alright, brand new
					else{
            console.log(resp)
						var json = JSON.parse(resp)
						if(json.constructor === Array) cc_deployed = true
					}
				}
			}
			catch(e){console.log(e)}																		//anything nasty goes here

			// ---- Are We Ready? ---- //
			if(!cc_deployed){
				console.log('[preflight check]', attempt, ': failed, trying again')
				setTimeout(function(){
					check_if_deployed(null, ++attempt)										//no, try again later
				}, 10000)
			}
			else{
				console.log('[preflight check]', attempt, ': success')
        deployed = true
			}
		})
	}
}

// ---- BLOCKCHAIN TRANSACTION MANAGEMENT ----- //

// get chain height, process all blocks
ibc.chain_stats(function(e, stats){
  if(e){
    console.log("Couldnt get stats")
  }
  else{
    for(var i = 0;i<stats.height;i++){
      ibc.block_stats(i, cb_blockstats)
    }
  }
})

// new block
ibc.monitor_blockheight(function(chain_stats){
	if(chain_stats && chain_stats.height){
		console.log('hey new block', chain_stats.height-1)
		ibc.block_stats(chain_stats.height - 1, cb_blockstats)
	}
})

//got the block's stats, add to transactionHistroy if its a transaction
function cb_blockstats(e, stats){
  if(e != null) console.log('blockstats error:', e)
  else {
    if(stats.transactions){
      transactionUtil.addTransaction(stats.transactions[0], function(blockObj){
        if(deployed){
          ws.broadcastTransaction(blockObj.type, blockObj.transaction, JSON.stringify(blockObj))
				}
      })
    }
  }
}

// ---- SETUP ROUTES ----- //
app.use(function(req, res, next) {
  if(routes.isSetup()){
    next()
  }
  else{
    console.log("Blockchain not set up in router, cant route")
  }
})

app.use('/', routes.router)

module.exports = app
