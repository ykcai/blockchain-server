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






var addHoursFromExistingFields = function(jsonValue, transaction){
    if(!jsonValue.hours){
        jsonValue.hours = 0;
    }
    if((transaction[5] && !isNaN(transaction[5]))){
        jsonValue.hours +=  parseFloat(transaction[5]);
    }else if(transaction[6] & !isNaN(transaction[6])){
        jsonValue.hours += parseFloat(transaction[6]);
    }
    return jsonValue;
}


module.exports.getTransactionHistoryStatistics2 = function(transHistory) {
    //2D Arr
    // [ email | email1 | email2 ]
    // [ {pointsReceived:p, pointsSent:p} |  etc | etc]
    var arr = [];

    transHistory.forEach(function(obj) {
        var jsonValue = {};
        if(getIfEmailExists(arr, obj.transaction[1]) && getIfEmailExists(arr, obj.transaction[3])){
            jsonValue = arr[getIndexOfEmail(arr, obj.transaction[1])][1]
            jsonValue.pointsSent += parseInt(obj.transaction[2])
            arr[getIndexOfEmail(arr, obj.transaction[1])][1] = jsonValue;

            jsonValue = arr[getIndexOfEmail(arr, obj.transaction[3])][1]
            jsonValue.pointsReceived += parseInt(obj.transaction[2])
            jsonValue = addHoursFromExistingFields(jsonValue, obj.transaction)
            arr[getIndexOfEmail(arr, obj.transaction[3])][1] = jsonValue;

        }else if(getIfEmailExists(arr, obj.transaction[1]) &&  !getIfEmailExists(arr, obj.transaction[3])){
            jsonValue = arr[getIndexOfEmail(arr, obj.transaction[1])][1]
            jsonValue.pointsSent += parseInt(obj.transaction[2])
            arr[getIndexOfEmail(arr, obj.transaction[1])][1] = jsonValue;

            jsonValue = {
                pointsSent: 0,
                pointsReceived: parseInt(obj.transaction[2]),
                user: null
            }
            arr.push(
                [obj.transaction[3], jsonValue]
            );

        }else if(!getIfEmailExists(arr, obj.transaction[1]) &&  getIfEmailExists(arr, obj.transaction[3])){
            jsonValue = arr[getIndexOfEmail(arr, obj.transaction[3])][1]
            jsonValue.pointsReceived += parseInt(obj.transaction[2])
            jsonValue = addHoursFromExistingFields(jsonValue, obj.transaction)
            arr[getIndexOfEmail(arr, obj.transaction[3])][1] = jsonValue;

            jsonValue = {
                pointsSent: parseInt(obj.transaction[2]),
                pointsReceived: 0,
                user: null
            }

            arr.push(
                [obj.transaction[1], jsonValue]
            );
        }else{
            jsonValue = {
                pointsSent: parseInt(obj.transaction[2]),
                pointsReceived: 0,
                user: null
            }
            arr.push(
                [obj.transaction[1], jsonValue]
            );

            jsonValue = {
                pointsSent: 0,
                pointsReceived: parseInt(obj.transaction[2]),
                user: null
            }

            jsonValue = addHoursFromExistingFields(jsonValue, obj.transaction)

            arr.push(
                [obj.transaction[3], jsonValue]
            );
        }
    })
    return arr;
}




module.exports.getTransactionHistoryStatistics = function() {
  let myMap = new Map();
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
      }
      myMap.set(obj.transaction[3], jsonValue);
  });

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
    console.log("blockObj.transaction: " + JSON.stringify(blockObj.transaction, null, 4));

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


var getIndexOfEmail = function(arr, email){
    var index = false;
    arr.forEach(function(ObjArr, i) {
        if(ObjArr[0] == email){index = i;}
    })
    return index;
}

var getIfEmailExists = function(arr, email){
    var returnValue = false;

    arr.forEach(function(ObjArr, i) {
        // console.log("ObjArr: " + JSON.stringify(ObjArr));

        // console.log("does " + ObjArr[0] + " == " + email  + "  ==> " + ((ObjArr[0] == email)) );
        if(ObjArr[0] == email){
            // console.log("returning true now");
            returnValue = true;
        }
    })

    // console.log("returning false now");
    return returnValue;
}

var changeEmailObjValue = function(arr, email, obj){
    arr.forEach(function(ObjArr, i) {
        if(ObjArr[0] == email){return true;}
    })
    return false;
}
