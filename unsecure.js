const express = require('express')
const mysql = require('mysql2')
const app = express()
const port = 3000

//Database(MySql) configulation
const db = mysql.createConnection(
    {
        host: "localhost",
        user: "root",
        password: "1234",
        database: "shopdee"
    }
)
db.connect()

//Middleware (Body parser)
app.use(express.json())
app.use(express.urlencoded ({extended: true}))

app.get('/', function(req, res){
    res.send('Hello World!')
});


// Register
app.post('/api/register', function(req, res){  
    const { username, password, firstName, lastName } = req.body;
    const sql = `INSERT INTO customer (username, password, 
                firstName, lastName) VALUES (?, ?, ?, ?)`;
    
    db.query(sql, [username, password, firstName, lastName], 
        function(err, result){
            if (err) throw err;  
            res.send({'message':'ลงทะเบียนสำเร็จแล้ว','status':true});
        }
    )
})

//Login
app.post('/api/login', function(req, res){
    const {username, password} = req.body
    let sql = "SELECT * FROM customer WHERE "
    sql += "username='" + username + "'";
    sql += " AND password = '" + password + "'";  
    console.log(sql);
    //' OR '1=1
    db.query(sql, [username, password], function(err, result){
        if(err) throw err
        
        if(result.length > 0){
            let customer = result[0]
            customer['message'] = "เข้าสู่ระบบสำเร็จ"
            customer['status'] = true

            res.send(customer)
        }else{
            res.send({"message":"กรุณาระบุรหัสผ่านใหม่อีกครั้ง", 
                      "status":false} )
        }        
    })    
} )



// Profile
app.get('/api/profile/:id',
    function(req, res){
        const custID = req.params.id;
        let sql = "SELECT * FROM customer WHERE "
            sql += "custID=" + custID;
            sql += " AND isActive = 1";  
        //1--                
        db.query(sql, 
            function(err, result) {
                if (err) throw err;
                res.send(result);
            }                       
        );
    }
);


//Web server
app.listen(port, function() {
    console.log(`Example app listening on port ${port}`)
})
