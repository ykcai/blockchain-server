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

module.exports.getTransactionHistoryStatistics = function() {
  var myMap = new Map();
  var jsonValue = {};
  //sets sender points
  transactionHistory.forEach(function(obj) {
      if(myMap.has(obj.transaction[1])){ //already exists, incriment values
          jsonValue = myMap.get(obj.transaction[1]);
          jsonValue.pointsSent += parseInt(obj.transaction[2])

      }else{ //create new key, add values
          jsonValue = {
              pointsSent: parseInt(obj.transaction[2]),
              pointsReceived: 0,
              user: null
          }
      }
      myMap.set(obj.transaction[1], jsonValue);
  });
  //sets reciever points
  transactionHistory.forEach(function(obj) {
      if(myMap.has(obj.transaction[3])){ //already exists, incriment values
          jsonValue = myMap.get(obj.transaction[3]);
          jsonValue.pointsReceived += parseInt(obj.transaction[2])

      }else{ //create new key, add values
          //if the above for loop is ran, it shouldn't get here at all
          console.log("oops shouldn't have gotten here !!!");
          jsonValue = {
              pointsSent: 0,
              pointsReceived: parseInt(obj.transaction[2]),
              user: null
          }
      }
      myMap.set(obj.transaction[3], jsonValue);
  });

  for (var {key, value} of myMap.entries()) {
    console.log(key + ' = ' + value);
  }
  return myMap;
}

module.exports.addTransaction = function(transaction, callback){
  var str = atob(transaction.payload)

  var blockObj = {
    chaincodeID: transaction.chaincodeID,
    timestamp: transaction.timestamp,
    detail: transaction.transaction
  }

  if(str.indexOf("set_user") > -1){
    blockObj.transaction = formatPayload(str.substr(str.indexOf("set_user")))
    blockObj.type = "set_user"
    transactionHistory.push(blockObj)
    console.log(blockObj)
    callback(blockObj)
  }
  else if(str.indexOf("addAllowance") > -1){
    blockObj.transaction = formatPayload(str.substr(str.indexOf("addAllowance")))
    blockObj.type = "addAllowance"
    allowanceHistory.push(blockObj)
    //console.log(blockObj)
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
