var atob = require('atob')

var transactionHistory = [] // TRADE history
var allowanceHistory = []
var productHistory = []

module.exports.getTransactionHistory = function(username){
  return transactionHistory.filter(function(o){
    return o.transaction.indexOf(username) != -1
  })
}

module.exports.getAllTransactionHistory = function(){
  return transactionHistory;
}

module.exports.getAllowanceHistory = function(username){
  return allowanceHistory.filter(function(o){
    return o.transaction[1] == username // received allowance
  })
}

module.exports.getAllAllowanceHistory = function(){
  return allowanceHistory;
}


module.exports.getProductHistory = function(username){
  return productHistory.filter(function(o){
    return o.transaction.indexOf(username) != -1 // SPENT points
  })
}

module.exports.addTransaction = function(transaction, callback){
  var str = atob(transaction.payload)

  var blockObj = {
    chaincodeID: transaction.chaincodeID,
    timestamp: transaction.timestamp
  }

  if(str.indexOf("set_user") > -1){
    blockObj.transaction = formatPayload(str.substr(str.indexOf("set_user")))
    blockObj.type = "set_user"
    transactionHistory.push(blockObj)
    callback(blockObj)
  }
  else if(str.indexOf("addAllowance") > -1){
    blockObj.transaction = formatPayload(str.substr(str.indexOf("addAllowance")))
    blockObj.type = "addAllowance"
    allowanceHistory.push(blockObj)
    callback(blockObj)
  }
  else if(str.indexOf("purchaseProduct") > -1){
    blockObj.transaction = formatPayload(str.substr(str.indexOf("purchaseProduct")))
    blockObj.type = "purchaseProduct"
    productHistory.push(blockObj)
    callback(blockObj)
  }
  else if(str.indexOf("exchange") > -1){
    blockObj.transaction = formatPayload(str.substr(str.indexOf("exchange")))
    blockObj.type = "exchange"
    productHistory.push(blockObj)
    callback(blockObj)
  }
  else{
    blockObj.type = "other"
    callback(blockObj)
  }
}

var formatPayload = function(str){
  return str.replace(/[^\x0A|\x20|\x2D-\x7F]/g, "").split("\n")
}
