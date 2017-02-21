var mysql     = require('mysql')
var CONFIG    = require('../package').config
var connection = mysql.createConnection(CONFIG.DATABASE);

setInterval(function () {
    connection.query('SELECT 1')
}, 5000)

module.exports.getTipReasons = function(res){
  var query = "SELECT * FROM tip_options"

  connection.query(query, function(err, rows){
    if (err){
      console.log('DB Error getting tip reasons', err)
      res.status(400)
      res.send({msg: "DB error"})
      return
    }
    if(rows.length === 0){
      res.status(400)
      res.send({msg: "DB error, rows = 0"})
      return
    }

    res.status(200);
    res.send(rows);
  })
}

module.exports.getAllProducts = function(res, onSuccess){
  var query = 'SELECT * FROM products WHERE status = "AVAILABLE"'
  connection.query(query, function(err, rows){
    if (err){
      console.log('DB Error getting tip reasons', err)
      res.status(400)
      res.send({msg: "DB error"})
      return
    }

    onSuccess(rows)
  })
}

module.exports.addProduct = function(UUID, res){
  var query = 'INSERT INTO products (id) VALUES ("' +
              UUID + '")'

  connection.query(query, function(err, insertTempRows){
    if (err){
      console.log('DB Error inserting product ', err)
      res.status(400)
      res.send({msg: "DB error, inserting"})
      return
    }
  })
}

module.exports.buyProduct = function(UUID, res){
  query = 'UPDATE products SET status="SOLD" WHERE id = "' +UUID+ '"'

  connection.query(query, function(err, updatedRows){
    if(err){
      console.log('DB Error updating product status', err)
      res.status(400)
      res.send({msg: "DB error, updating product"})
      return
    }
  })
}

module.exports.addUser = function(username, fullname, image_64, res){
  var query
  if(image_64){
    query = 'INSERT INTO users (id, fullname, image_64) VALUES ("' +
            username + '" , "' + fullname + '" , "' + image_64 + '")'
  }
  else{
    query = 'INSERT INTO users (id, fullname) VALUES ("' +
            username + '" , "' + fullname + '")'
  }

  connection.query(query, function(err, insertTempRows){
    if (err){
      console.log('DB Error inserting user ', err)
      res.status(400)
      res.send({msg: "DB error, inserting"})
      return
    }
  })
}

module.exports.getUser = function(username, res, onSuccess){
  var query = 'SELECT * FROM users WHERE id = "' + username + '"'

  connection.query(query, function(err, rows){
    if (err){
      console.log('DB Error getting user', err)
      if(res){
        res.status(400)
        res.send({msg: "DB error"})
      }
      return
    }

    onSuccess(rows)
  })
}

module.exports.getAllUsers = function(fullname, res, onSuccess){
  var query
  if(fullname){
    query = 'SELECT * FROM users WHERE fullname LIKE "' + fullname + '%"'
  }
  else{
    query = 'SELECT * FROM users'
  }

  connection.query(query, function(err, rows){
    if (err){
      console.log('DB Error getting tip reasons', err)
      if(res){
        res.status(400)
        res.send({msg: "DB error"})
      }
      return
    }

    onSuccess(rows)
  })
}


module.exports.update_image = function(username, image_64, res, onSuccess){

  var query = "UPDATE users SET image_64 ='" + image_64 + "' WHERE id = '" + username + "'"

  connection.query(query, function(err, rows){
    if (err){
      console.log('DB Error updating image', err)
      if(res){
        res.status(400)
        res.send({msg: "DB error"})
      }
      return
    }

    onSuccess(rows)
  })
}

module.exports.submitFeedback = function (username,feedback,starCount) {
  var query = 'INSERT INTO feedback (user_id,feedback,rating) values ("'+username+'", "'+feedback+'", "'+starCount+'")'

  connection.query(query,function(err, addFeedback){
    if (err){
      console.log('DB Error inserting feedback ',err)
      res.status(400)
      res.send({msg: "DB error, inserting"})
      return
    }
  })
};

module.exports.checkManager = function (username, onSuccess) {
  var query = 'SELECT manager FROM users WHERE id = "'+username+'"'
  connection.query(query,function(err,rows){
    if (err){
      console.log('DB Error checking manager ',err)
      res.status(400)
      res.send({msg: "DB error, checking manager"})
      return
    }
    onSuccess(rows)
  })
};
