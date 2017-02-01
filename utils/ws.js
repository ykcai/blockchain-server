var WebSocketServer = require('ws').Server
var CONFIG          = require('../package').config
var UsersManager    = require('../users-manager')

var server
var wss
var clients = {}

module.exports.setup = function(server){
  wss = new WebSocketServer({server: server})
  console.log("WEBSCOKET ON PORT: " + server.address().port)

  wss.on('connection', function connection(ws) {
    var reqUrl = ws.upgradeReq.url.substr(1) // remove /

    if(reqUrl.indexOf("?") != -1){
      reqUrl = reqUrl.substr(0, reqUrl.indexOf("?")) // remove url params
    }

    if(!(reqUrl in clients)){
      clients[reqUrl] = ws
      console.log("WEBSOCKET - client key added " + reqUrl)
    }

    ws.on("open", function open(){
      console.log("connected")
    })

    ws.on('error', function(e){
      console.log('ws error', e);
    });

    ws.on('close', function(){
      delete clients[reqUrl]
      console.log('WEBSOCKET - closed, deleted client key ' + reqUrl);
      setup();
    });
  });

  wss.broadcast = function broadcast(data) { //send to all connections
    wss.clients.forEach(function each(client) {
      try{
        client.send(JSON.stringify(data));
      }
      catch(e){
        console.log('error broadcast ws', e);
      }
    });
  };

  wss.broadcastSub = function broadcastSub(data, broadcastChannels) {	//send to subscribing connections
    if(CONFIG.DASHBOARD_WS_KEY){
      broadcastChannels.push(CONFIG.DASHBOARD_WS_KEY)
    }

    broadcastChannels.forEach(function(key){
      if(! (key in clients)){
        console.log(key + " web socket client key not found")
        return
      }
      console.log("WEBSOCKET - Broadcasting " + data)
      clients[key].send(data)
    })
  }
}

module.exports.broadcastTransaction = function(type, transaction, data){
  var broadcastChannels = []
  if(type === "set_user"){ // new block, is a trade
    var senderId = transaction[1]
    var receiverId = transaction[3]

    if(UsersManager.getToken(senderId)){
      broadcastChannels.push(UsersManager.getToken(senderId))
    }
    if(UsersManager.getToken(receiverId)){
      broadcastChannels.push(UsersManager.getToken(receiverId))
    }
    wss.broadcastSub(data, broadcastChannels)
  }
  else if(type === "exchange"){ // new block, is a trade
    var user = transaction[0]
    var amount = transaction[1]

    if(UsersManager.getToken(user)){
      broadcastChannels.push(UsersManager.getToken(user))
    }
    wss.broadcastSub(data, broadcastChannels)
  }
  else{ // new block, broadcast to admin dashboard
    wss.broadcastSub(data, broadcastChannels)
  }
}
