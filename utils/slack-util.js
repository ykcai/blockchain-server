var request = require('request');
var querystring = require('querystring');

// const SERVER_URL = "http://blockchain-zunair-server-dev-2.mybluemix.net/slack";
const SERVER_URL = "https://bf18dd8d.ngrok.io/api";

var executePostAPIcall = function(URL, params, headersParams, cb){
        if(!params){
            params = {};
        }

        var formData = querystring.stringify(params);
        var contentLength = formData.length;

        var headers = {
            'Content-Length': contentLength,
            'Content-Type': 'application/x-www-form-urlencoded',
        };

        for (var key in headersParams) {
          if (headersParams.hasOwnProperty(key)) {
            console.log(key + " -> " + headersParams[key]);
            headers[key] = headersParams[key];
          }
        }

        console.log("headers: " + JSON.stringify(headers));

        request({
            headers: headers,
            uri: URL,
            body: formData,
            method: 'POST'
        }, (err, res, body) => {
            cb(err, res, body);
        });
}


module.exports.sendTradeNotificationToSlack = function(res, sender, reciever, amount, reason, client, cb){
    const URL = SERVER_URL + "/trade_notification?sender=" + sender + "&reciever=" + reciever + "&amount="
                        + amount + "&reason=" + reason + "&client=" + client;
    request({
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        uri: URL,
        body: null,
        method: 'POST'
    }, (err, result, body) => {
        cb(res, err, result, body);
    });
}
