const express = require('express')
const mysql = require('mysql2')
const app = express()
const port = 4000

const https = require('https');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const SECRET_KEY = 'UX23Y24%@&2aMb';

// Load SSL certificates
const privateKey = fs.readFileSync('privatekey.pem', 'utf8');
const certificate = fs.readFileSync('certificate.pem', 'utf8');
const credentials = { key: privateKey, cert: certificate };

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

//Hello World API
app.get('/', function(req, res){
    res.send('Hello World!')
});



// Register
app.post('/api/register', 
    function(req, res) {  
        const { username, password, firstName, lastName } = req.body;
        
        //check existing username
        let sql="SELECT * FROM customer WHERE username=?";
        db.query(sql, [username], async function(err, results) {
            if (err) throw err;
            
            if(results.length == 0) {
                //password and salt are encrypted by hash function (bcrypt)
                const salt = await bcrypt.genSalt(10); //generate salte
                const password_hash = await bcrypt.hash(password, salt);        
                                
                //insert customer data into the database
                sql = 'INSERT INTO customer (username, password, firstName, lastName) VALUES (?, ?, ?, ?)';
                db.query(sql, [username, password_hash, firstName, lastName], (err, result) => {
                    if (err) throw err;
                
                    res.send({'message':'ลงทะเบียนสำเร็จแล้ว','status':true});
                });      
            }else{
                res.send({'message':'ชื่อผู้ใช้ซ้ำ','status':false});
            }

        });      
    }
);


//Login
app.post('/api/login',
    async function(req, res){
        //Validate username
        const {username, password} = req.body;                
        let sql = "SELECT * FROM customer WHERE username=? AND isActive = 1";        
        let customer = await query(sql, [username, username]);        
        
        if(customer.length <= 0){            
            return res.send( {'message':'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง','status':false} );
        }else{            
            customer = customer[0];
            custID = customer['custID'];               
            password_hash = customer['password'];       
        }

        //validate a number of attempts 
        let loginAttempt = 0;
        sql = "SELECT loginAttempt FROM customer WHERE username=? AND isActive = 1 ";        
        sql += "AND lastAttemptTime >= CURRENT_TIMESTAMP - INTERVAL 24 HOUR ";        
        
        row = await query(sql, [username, username]);    
        if(row.length > 0){
            loginAttempt = row[0]['loginAttempt'];

            if(loginAttempt>= 3) {
                return res.send( {'message':'บัญชีคุณถูกล๊อก เนื่องจากมีการพยายามเข้าสู่ระบบเกินกำหนด','status':false} );    
            }    
        }else{
            //reset login attempt                
            sql = "UPDATE customer SET loginAttempt = 0, lastAttemptTime=NULL WHERE username=? AND isActive = 1";                    
            await query(sql, [username, username]);               
        }              
        

        //validate password       
        if(bcrypt.compareSync(password, password_hash)){
            //reset login attempt                
            sql = "UPDATE customer SET loginAttempt = 0, lastAttemptTime=NULL WHERE username=? AND isActive = 1";        
            await query(sql, [username, username]);   

            //get token
            const token = jwt.sign({ custID: custID, username: username }, SECRET_KEY, { expiresIn: '1h' });                

            customer['token'] = token;
            customer['message'] = 'เข้าสู่ระบบสำเร็จ';
            customer['status'] = true;

            res.send(customer);            
        }else{
            //update login attempt
            const lastAttemptTime = new Date();
            sql = "UPDATE customer SET loginAttempt = loginAttempt + 1, lastAttemptTime=? ";
            sql += "WHERE username=? AND isActive = 1";                   
            await query(sql, [lastAttemptTime, username, username]);           
            
            if(loginAttempt >=2){
                res.send( {'message':'บัญชีคุณถูกล๊อก เนื่องจากมีการพยายามเข้าสู่ระบบเกินกำหนด','status':false} );    
            }else{
                res.send( {'message':'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง','status':false} );    
            }            
        }

    }
);


// Function to execute a query with a promise-based approach
function query(sql, params) {
    return new Promise((resolve, reject) => {
      db.query(sql, params, (err, results) => {
        if (err) {
          reject(err);
        } else {
          resolve(results);
        }
      });
    });
}


// Profile
app.get('/api/profile/:id',
    async function(req, res){
        const custID = req.params.id;        
        const token = req.headers["authorization"].replace("Bearer ", "");
            
        try{
            let decode = jwt.verify(token, SECRET_KEY);               
            if(custID != decode.custID) {
              return res.send( {'message':'Id is not matched','status':false} );
            }
            
            let sql = "SELECT * FROM customer WHERE custID = ? AND isActive = 1";        
            let customer = await query(sql, [custID]);        
            
            customer = customer[0];
            customer['message'] = 'success';
            customer['status'] = true;
            res.send(customer); 

        }catch(error){
            res.send( {'message':'Token is invalid','status':false} );
        }
        
    }
);


// Create an HTTPS server
const httpsServer = https.createServer(credentials, app);
httpsServer.listen(port, () => {
    console.log(`HTTPS Server running on port ${port}`);
});