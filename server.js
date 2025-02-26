const express = require('express')
const mysql = require('mysql2')
const app = express()
const port = 4000
const swaggerUi = require("swagger-ui-express");
const swaggerFile = require("./swagger-output.json"); // Load generated docs

const https = require('https');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const SECRET_KEY = 'UX23Y24%@&2aMb';

const fileupload = require('express-fileupload');
const path = require('path');
const crypto = require('crypto');

// Load SSL certificates
const privateKey = fs.readFileSync('privatekey.pem', 'utf8');
const certificate = fs.readFileSync('certificate.pem', 'utf8');
const credentials = { key: privateKey, cert: certificate };

// Import CORS library
const cors = require('cors');

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
app.use(cors());
app.use(fileupload());

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerFile));



//Hello World API
app.get('/', function(req, res){
    res.send('Hello World!')
});


//Function to execute a query with a promise-based approach
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


/*############## CUSTOMER ##############*/
//Register
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
        //validate username
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


//Show a customer Profile
app.get('/api/profile/:id',
    async function(req, res){
        const custID = req.params.id;        
        const token = req.headers["authorization"].replace("Bearer ", "");
            
        try{
            let decode = jwt.verify(token, SECRET_KEY);               
            if(custID != decode.custID) {
              return res.send( {'message':'คุณไม่ได้รับสิทธิ์ในการเข้าใช้งาน','status':false} );
            }
                        
            let sql = "SELECT * FROM customer WHERE custID = ? AND isActive = 1";        
            let customer = await query(sql, [custID]);        
            
            customer = customer[0];
            customer['message'] = 'success';
            customer['status'] = true;
            res.send(customer); 

        }catch(error){
            res.send( {'message':'โทเคนไม่ถูกต้อง','status':false} );
        }
        
    }
);


//Show a customer image
app.get('/api/customer/image/:filename', 
    function(req, res) {        
        const filepath = path.join(__dirname, 'assets/customer', req.params.filename);        
        res.sendFile(filepath);
    }
);


//List customers
app.get('/api/customer',
    function(req, res){             
        const token = req.headers["authorization"].replace("Bearer ", "");
            
        try{
            let decode = jwt.verify(token, SECRET_KEY);               
            if(decode.positionID != 1 && decode.positionID != 2) {
              return res.send( {'message':'คุณไม่ได้รับสิทธิ์ในการเข้าใช้งาน','status':false} );
            }
            
            let sql = "SELECT * FROM customer";            
            db.query(sql, function (err, result){
                if (err) throw err;            
                res.send(result);
            });      

        }catch(error){
            res.send( {'message':'โทเคนไม่ถูกต้อง','status':false} );
        }
        
    }
);


//Show a customer detail
app.get('/api/customer/:id',
    async function(req, res){
        const custID = req.params.id;                    
        try{
            const token = req.headers["authorization"].replace("Bearer ", "");
            let decode = jwt.verify(token, SECRET_KEY);               
            if(decode.positionID != 1 && decode.positionID != 2) {
              return res.send( {'message':'คุณไม่ได้รับสิทธิ์ในการเข้าใช้งาน','status':false} );
            }
            
            const sql = `
            SELECT 
                customer.*, DATE_FORMAT(birthdate, '%Y-%m-%d') AS birthdate 
            FROM customer             
            WHERE custID = ? AND isActive = 1`;        

            let customer = await query(sql, [custID]);                    
            customer = customer[0];
            customer['message'] = 'success';
            customer['status'] = true;
            res.send(customer); 

        }catch(error){
            res.send( {'message':'โทเคนไม่ถูกต้อง','status':false} );
        }
        
    }
);


//Add a customer
app.post('/api/customer', 
    async function(req, res){
      
        try{
            //receive a token
            const token = req.headers["authorization"].replace("Bearer ", "");    
            const { username, password, firstName, lastName, email, gender, birthdate, address, homePhone, mobilePhone } = req.body;
            
            //validate the token    
            let decode = jwt.verify(token, SECRET_KEY);               
            if(decode.positionID != 1 && decode.positionID != 2) {
                return res.send( {'message':'คุณไม่ได้รับสิทธิ์ในการเข้าใช้งาน','status':false} );
            }

            //check existing username
            let sql="SELECT * FROM customer WHERE username=?";
            db.query(sql, [username], async function(err, results) {
                if (err) throw err;
                
                if(results.length == 0) {
                    //password and salt are encrypted by hash function (bcrypt)
                    const salt = await bcrypt.genSalt(10); //generate salte
                    const password_hash = await bcrypt.hash(password, salt); 
                    
                    //save file into folder  
                    let fileName = "";
                    if (req?.files?.imageFile){        
                        const imageFile = req.files.imageFile; // image file    
                        
                        fileName = imageFile.name.split(".");// file name
                        fileName = fileName[0] + Date.now() + '.' + fileName[1]; 
                
                        const imagePath = path.join(__dirname, 'assets/customer', fileName); //image path
                
                        fs.writeFile(imagePath, imageFile.data, (err) => {
                        if(err) throw err;
                        });
                        
                    }                
                                    
                    //insert customer data into the database
                    sql = `
                    INSERT INTO customer(
                        username, password, firstName, lastName, email, gender, birthdate, address, homePhone, mobilePhone, imageFile
                    ) 
                    VALUES(
                        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                    )`;
                    db.query(sql, [username, password_hash, firstName, lastName, email, gender, birthdate, address, homePhone, mobilePhone, fileName], (err, result) => {
                        if (err) throw err;
                    
                        res.send({'message':'บันทึกข้อมูลลูกค้าสำเร็จแล้ว','status':true});
                    });      
            }else{
                res.send({'message':'ชื่อผู้ใช้ซ้ำ','status':false});
            }

        });      
        }catch(error){
            res.send( {'message':'โทเคนไม่ถูกต้อง','status':false} );
        }    
    }
);

//Update a customer
app.put('/api/customer/:id', 
    async function(req, res){
  
        //receive a token
        const token = req.headers["authorization"].replace("Bearer ", "");
        const custID = req.params.id;
    
        try{
            //validate the token    
            let decode = jwt.verify(token, SECRET_KEY);               
            if(custID != decode.custID && decode.positionID != 1 && decode.positionID != 2) {
                return res.send( {'message':'คุณไม่ได้รับสิทธิ์ในการเข้าใช้งาน','status':false} );
            }
        
            //save file into folder  
            let fileName = "";
            if (req?.files?.imageFile){        
                const imageFile = req.files.imageFile; // image file    
                
                fileName = imageFile.name.split(".");// file name
                fileName = fileName[0] + Date.now() + '.' + fileName[1]; 
        
                const imagePath = path.join(__dirname, 'assets/customer', fileName); //image path
        
                fs.writeFile(imagePath, imageFile.data, (err) => {
                if(err) throw err;
                });
                
            }
    
        
            //save data into database
            const {username, password, firstName, lastName, email, gender, birthdate, address, homePhone, mobilePhone} = req.body;
        
            let sql = `
                UPDATE 
                    customer 
                SET username = ?,firstName = ?, lastName = ?, email = ?, gender = ?, 
                    birthdate = ?, address = ?, homePhone = ?, mobilePhone = ?`;
            let params = [username, firstName, lastName, email, gender, birthdate, address, homePhone, mobilePhone];
        
            if (password) {
                const salt = await bcrypt.genSalt(10);
                const password_hash = await bcrypt.hash(password, salt);   
                sql += ', password = ?';
                params.push(password_hash);
            }
        
            if (fileName != "") {    
                sql += ', imageFile = ?';
                params.push(fileName);
            }
        
            sql += ' WHERE custID = ?';
            params.push(custID);
        
            db.query(sql, params, (err, result) => {
                if (err) throw err;
                res.send({ 'message': 'แก้ไขข้อมูลลูกค้าเรียบร้อยแล้ว', 'status': true });
            });
            
        }catch(error){
            res.send( {'message':'โทเคนไม่ถูกต้อง','status':false} );
        }    
    }
);
    
//Delete a customer
app.delete('/api/customer/:id',
    async function(req, res){
        const custID = req.params.id;        
        const token = req.headers["authorization"].replace("Bearer ", "");
            
        try{
            let decode = jwt.verify(token, SECRET_KEY);               
            if(custID != decode.custID && decode.positionID != 1 && decode.positionID != 2) {
                return res.send( {'message':'คุณไม่ได้รับสิทธิ์ในการเข้าใช้งาน','status':false} );
            }
            
            const sql = `DELETE FROM customer WHERE custID = ?`;
            db.query(sql, [custID], (err, result) => {
                if (err) throw err;
                res.send({'message':'ลบข้อมูลลูกค้าเรียบร้อยแล้ว','status':true});
            });

        }catch(error){
            res.send( {'message':'โทเคนไม่ถูกต้อง','status':false} );
        }
        
    }
);


/*############## EMPLOYEE ##############*/
//Login (employee/admin)
app.post('/api/admin/login',
    async function(req, res){
        //Validate username
        const {username, password} = req.body;                
        let sql = "SELECT * FROM employee WHERE username=? AND isActive = 1";        
        let employee = await query(sql, [username, username]);        
        
        if(employee.length <= 0){            
            return res.send( {'message':'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง','status':false} );
        }else{            
            employee = employee[0];
            empID = employee['empID'];               
            password_hash = employee['password'];       
            positionID = employee['positionID']; 
        }

        //validate a number of attempts 
        let loginAttempt = 0;
        sql = "SELECT loginAttempt FROM employee WHERE username=? AND isActive = 1 ";        
        sql += "AND lastAttemptTime >= CURRENT_TIMESTAMP - INTERVAL 24 HOUR ";        
        
        row = await query(sql, [username, username]);    
        if(row.length > 0){
            loginAttempt = row[0]['loginAttempt'];

            if(loginAttempt>= 3) {
                return res.send( {'message':'บัญชีคุณถูกล๊อก เนื่องจากมีการพยายามเข้าสู่ระบบเกินกำหนด','status':false} );    
            }    
        }else{
            //reset login attempt                
            sql = "UPDATE employee SET loginAttempt = 0, lastAttemptTime=NULL WHERE username=? AND isActive = 1";                    
            await query(sql, [username, username]);               
        }              
        

        //validate password       
        if(bcrypt.compareSync(password, password_hash)){
            //reset login attempt                
            sql = "UPDATE employee SET loginAttempt = 0, lastAttemptTime=NULL WHERE username=? AND isActive = 1";        
            await query(sql, [username, username]);   

            //get token
            const token = jwt.sign({ empID: empID, username: username, positionID: positionID }, 
                                    SECRET_KEY, { expiresIn: '1h' });                

            employee['token'] = token;
            employee['message'] = 'เข้าสู่ระบบสำเร็จ';
            employee['status'] = true;

            res.send(employee);            
        }else{
            //update login attempt
            const lastAttemptTime = new Date();
            sql = "UPDATE employee SET loginAttempt = loginAttempt + 1, lastAttemptTime=? ";
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

//List employees
app.get('/api/employee',
    function(req, res){             
        const token = req.headers["authorization"].replace("Bearer ", "");
            
        try{
            let decode = jwt.verify(token, SECRET_KEY);               
            if(decode.positionID != 1) {
              return res.send( {'message':'คุณไม่ได้รับสิทธิ์ในการเข้าใช้งาน','status':false} );
            }
            
            const sql = `
            SELECT employee.*, position.positionName 
            FROM employee 
            INNER JOIN position 
                ON employee.positionID = position.positionID 
            ORDER BY employee.empID ASC`;          
            db.query(sql, function (err, result){
                if (err) throw err;            
                res.send(result);
            });      

        }catch(error){
            res.send( {'message':'โทเคนไม่ถูกต้อง','status':false} );
        }
        
    }
);

//Show an employee detail
app.get('/api/employee/:id',
    async function(req, res){
        const empID = req.params.id;                    
        try{
            const token = req.headers["authorization"].replace("Bearer ", "");
            let decode = jwt.verify(token, SECRET_KEY);               
            if(empID != decode.empID && decode.positionID != 1) {
              return res.send( {'message':'คุณไม่ได้รับสิทธิ์ในการเข้าใช้งาน','status':false} );
            }
            
            const sql = `
            SELECT employee.*, position.positionName 
            FROM employee 
            INNER JOIN position 
                ON employee.positionID = position.positionID 
            WHERE employee.empID = ? AND employee.isActive = 1`;        

            let employee = await query(sql, [empID]);                    
            employee = employee[0];
            employee['message'] = 'success';
            employee['status'] = true;
            res.send(employee); 

        }catch(error){
            res.send( {'message':'โทเคนไม่ถูกต้อง','status':false} );
        }
        
    }
);

//Show an employee image
app.get('/api/employee/image/:filename', 
    function(req, res) {
        const filepath = path.join(__dirname, 'assets/employee', req.params.filename);  
        res.sendFile(filepath);
    }
);

//Generate a password
function generateRandomPassword(length) {
    return crypto
        .randomBytes(length)
        .toString('base64')
        .slice(0, length)
        .replace(/\+/g, 'A')  // Replace '+' to avoid special chars if needed
        .replace(/\//g, 'B'); // Replace '/' to avoid special chars if needed
}


//Add an employee
app.post('/api/employee', 
    async function(req, res){
  
        //receive a token
        const token = req.headers["authorization"].replace("Bearer ", "");        
    
        try{
            //validate the token    
            let decode = jwt.verify(token, SECRET_KEY);               
            if(decode.positionID != 1) {
                return res.send( {'message':'คุณไม่ได้รับสิทธิ์ในการเข้าใช้งาน','status':false} );
            }            

            //save file into folder  
            let fileName = "";
            if (req?.files?.imageFile){        
                const imageFile = req.files.imageFile; // image file    
                
                fileName = imageFile.name.split(".");// file name
                fileName = fileName[0] + Date.now() + '.' + fileName[1]; 
        
                const imagePath = path.join(__dirname, 'assets/employee', fileName); //image path
        
                fs.writeFile(imagePath, imageFile.data, (err) => {
                if(err) throw err;
                });
                
            }

            //receive data from users
            const {username, firstName, lastName, email, gender } = req.body;

            //check existing username
            let sql="SELECT * FROM employee WHERE username=?";
            db.query(sql, [username], async function(err, results) {
                if (err) throw err;
                
                if(results.length == 0) {
                    //password and salt are encrypted by hash function (bcrypt)
                    const password = generateRandomPassword(8);
                    const salt = await bcrypt.genSalt(10); //generate salte
                    const password_hash = await bcrypt.hash(password, salt);    
                    
                    //save data into database                
                    let sql = `INSERT INTO employee(
                            username, password, firstName, lastName, email, gender,imageFile
                            )VALUES(?, ?, ?, ?, ?, ?, ?)`;       
                    let params = [username, password_hash, firstName, lastName, email, gender, fileName];
                    db.query(sql, params, (err, result) => {
                        if (err) throw err;
                        res.send({ 'message': 'เพิ่มข้อมูลพนักงานเรียบร้อยแล้ว', 'status': true });
                    });                    

                }else{
                    res.send({'message':'ชื่อผู้ใช้ซ้ำ','status':false});
                }
            });                        
            
        }catch(error){
            res.send( {'message':'โทเคนไม่ถูกต้อง','status':false} );
        }    
    }
);
    
//Update an employee
app.put('/api/employee/:id', 
    async function(req, res){
  
        //receive a token
        const token = req.headers["authorization"].replace("Bearer ", "");
        const empID = req.params.id;
    
        try{
            //validate the token    
            let decode = jwt.verify(token, SECRET_KEY);               
            if(empID != decode.empID && decode.positionID != 1) {
                return res.send( {'message':'คุณไม่ได้รับสิทธิ์ในการเข้าใช้งาน','status':false} );
            }
        
            //save file into folder  
            let fileName = "";
            if (req?.files?.imageFile){        
                const imageFile = req.files.imageFile; // image file    
                
                fileName = imageFile.name.split(".");// file name
                fileName = fileName[0] + Date.now() + '.' + fileName[1]; 
        
                const imagePath = path.join(__dirname, 'assets/employee', fileName); //image path
        
                fs.writeFile(imagePath, imageFile.data, (err) => {
                if(err) throw err;
                });
                
            }
            
            //save data into database
            const {password, username, firstName, lastName, email, gender } = req.body;
        
            let sql = 'UPDATE employee SET username = ?,firstName = ?, lastName = ?, email = ?, gender = ?';
            let params = [username, firstName, lastName, email, gender];
        
            if (password) {
                const salt = await bcrypt.genSalt(10);
                const password_hash = await bcrypt.hash(password, salt);   
                sql += ', password = ?';
                params.push(password_hash);
            }
        
            if (fileName != "") {    
                sql += ', imageFile = ?';
                params.push(fileName);
            }
        
            sql += ' WHERE empID = ?';
            params.push(empID);
        
            db.query(sql, params, (err, result) => {
                if (err) throw err;
                res.send({ 'message': 'แก้ไขข้อมูลพนักงานเรียบร้อยแล้ว', 'status': true });
            });
            
        }catch(error){
            res.send( {'message':'โทเคนไม่ถูกต้อง','status':false} );
        }    
    }
);
    
//Delete an employee
app.delete('/api/employee/:id',
    async function(req, res){
        const empID = req.params.id;        
        const token = req.headers["authorization"].replace("Bearer ", "");
            
        try{
            let decode = jwt.verify(token, SECRET_KEY);               
            if(decode.positionID != 1) {
                return res.send( {'message':'คุณไม่ได้รับสิทธิ์ในการเข้าใช้งาน','status':false} );
            }
            
            const sql = `DELETE FROM employee WHERE empID = ?`;
            db.query(sql, [empID], (err, result) => {
                if (err) throw err;
                res.send({'message':'ลบข้อมูลพนักงานเรียบร้อยแล้ว','status':true});
            });

        }catch(error){
            res.send( {'message':'โทเคนไม่ถูกต้อง','status':false} );
        }
        
    }
);



/*############## PRODUCT ##############*/
//List products
app.get('/api/product',
    function(req, res){        
        const sql = `
        SELECT product.*, producttype.typeName 
        FROM product 
        INNER JOIN producttype 
            ON product.typeID = producttype.typeID
        ORDER BY product.productID ASC`;

        db.query(sql, 
            function(err, result) {
                if (err) throw err;
                
                if(result.length > 0){
                    res.send(result);
                }else{
                    res.send( {'message':'fail','status':false} );
                }
                
            }                       
        );
    }
);

//Show a product detail
app.get('/api/product/:id', 
    function (req, res){
        const sql = `
        SELECT product.*, producttype.typeName 
        FROM product 
        INNER JOIN producttype 
            ON product.typeID = producttype.typeID
        WHERE product.productID = ?`;                
        db.query(sql, [req.params.id], (err, result) => {
            if (err) throw err;

            if(result.length > 0) {
                product = result[0];
                product['message'] = 'success';
                product['status'] = true;
                res.json(product);
            }else{
                res.send({'message':'ไม่พบข้อมูลสินค้า','status':false});
            }
        });
    }
);

//Show a product image
app.get('/api/product/image/:filename', 
    function(req, res){
      const filepath = path.join(__dirname, 'assets/product', req.params.filename);  
      res.sendFile(filepath);
    }
);


//Add a product
app.post('/api/product', 
    async function(req, res){      
    
        try{
            //receive a token
            const token = req.headers["authorization"].replace("Bearer ", "");  

            //validate the token    
            let decode = jwt.verify(token, SECRET_KEY);               
            if(decode.positionID != 1 && decode.positionID != 2) {
                return res.send( {'message':'คุณไม่ได้รับสิทธิ์ในการเข้าใช้งาน','status':false} );
            }
        
            //save file into folder  
            let fileName = "";
            const imageFile = req.files.imageFile; // image file    
            
            fileName = imageFile.name.split(".");// file name
            fileName = fileName[0] + Date.now() + '.' + fileName[1]; 
    
            const imagePath = path.join(__dirname, 'assets/product', fileName); //image path
    
            fs.writeFile(imagePath, imageFile.data, (err) => {
            if(err) throw err;
            });
            
            //save data into database
            const {productName, productDetail, price, cost, quantity, typeID} = req.body;
        
            let sql = `INSERT INTO product(
                       productName, productDetail, price, cost, quantity, imageFile, typeID
                       )VALUES(?, ?, ?, ?, ?, ?, ?)`;                
            let params = [productName, productDetail, price, cost, quantity, fileName, typeID];            
        
            db.query(sql, params, (err, result) => {
                if (err) throw err;
                res.send({ 'message': 'เพิ่มข้อมูลสินค้าเรียบร้อยแล้ว', 'status': true });
            });
            
        }catch(error){
            res.send( {'message':'โทเคนไม่ถูกต้อง','status':false} );
        }    
    }
);
    
//Update a product
app.put('/api/product/:id', 
    async function(req, res){
  
        //Receive a product id        
        const productID = req.params.id;
    
        try{
            //Receive a token
            const token = req.headers["authorization"].replace("Bearer ", "");

            //validate the token    
            let decode = jwt.verify(token, SECRET_KEY);               
            if(decode.positionID != 1 && decode.positionID != 2) {
                return res.send( {'message':'คุณไม่ได้รับสิทธิ์ในการเข้าใช้งาน','status':false} );
            }
        
            //save file into folder  
            let fileName = "";
            if (req?.files?.imageFile){        
                const imageFile = req.files.imageFile; // image file    
                
                fileName = imageFile.name.split(".");// file name
                fileName = fileName[0] + Date.now() + '.' + fileName[1]; 
        
                const imagePath = path.join(__dirname, 'assets/product', fileName); //image path
        
                fs.writeFile(imagePath, imageFile.data, (err) => {
                if(err) throw err;
                });
                
            }
            
            //save data into database
            const {productName, productDetail, price, cost, quantity, typeID} = req.body;
        
            let sql = `UPDATE product SET 
                       productName = ?, productDetail = ?, price = ?, cost = ?, quantity = ?, typeID = ?`;
            let params = [productName, productDetail, price, cost, quantity, typeID];
        
            if (fileName != "") {    
                sql += ', imageFile = ?';
                params.push(fileName);
            }
        
            sql += ' WHERE productID = ?';
            params.push(productID);
        
            db.query(sql, params, (err, result) => {
                if (err) throw err;
                res.send({ 'message': 'แก้ไขข้อมูลสินค้าเรียบร้อยแล้ว', 'status': true });
            });
            
        }catch(error){
            res.send( {'message':'โทเคนไม่ถูกต้อง','status':false} );
        }    
    }
);
    
//Delete a product
app.delete('/api/product/:id',
    async function(req, res){
        const productID = req.params.id;        
        const token = req.headers["authorization"].replace("Bearer ", "");
            
        try{
            let decode = jwt.verify(token, SECRET_KEY);               
            if(decode.positionID != 1 && decode.positionID != 2) {
                return res.send( {'message':'คุณไม่ได้รับสิทธิ์ในการเข้าใช้งาน','status':false} );
            }
            
            const sql = 'DELETE FROM product WHERE productID = ?';
            db.query(sql, [productID], (err, result) => {
                if (err) throw err;
                res.send({'message':'ลบข้อมูลสินค้าเรียบร้อยแล้ว','status':true});
            });

        }catch(error){
            res.send( {'message':'โทเคนไม่ถูกต้อง','status':false} );
        }
        
    }
);


/*############ PRODUCT TYPE ############*/
//List product types
app.get('/api/producttype',
    function(req, res){        
        const sql = "SELECT * FROM producttype";
        db.query(sql, 
            function(err, result) {
                if (err) throw err;
                
                if(result.length > 0){
                    res.send(result);
                }else{
                    res.send( {'message':'fail','status':false} );
                }
                
            }                       
        );
    }
);

//Show a product type detail
app.get('/api/producttype/:id', 
    function (req, res){
        const sql = 'SELECT * FROM producttype WHERE typeID = ?';
        db.query(sql, [req.params.id], (err, result) => {
            if (err) throw err;

            if(result.length > 0) {
                product = result[0];
                product['message'] = 'success';
                product['status'] = true;
                res.json(product);
            }else{
                res.send({'message':'ไม่พบข้อมูลประเภทสินค้า','status':false});
            }
        });
    }
);

//Add a product type
app.post('/api/producttype', 
    async function(req, res){          
        try{
            //receive a token
            const token = req.headers["authorization"].replace("Bearer ", "");   

            //validate the token    
            let decode = jwt.verify(token, SECRET_KEY);               
            if(decode.positionID != 1 && decode.positionID != 2) {
                return res.send( {'message':'คุณไม่ได้รับสิทธิ์ในการเข้าใช้งาน','status':false} );
            }        
            
            //save data into database
            const {typeName} = req.body;
        
            let sql = `INSERT INTO producttype(
                       typeName
                       )VALUES(?)`;                
            let params = [typeName];            
        
            db.query(sql, params, (err, result) => {
                if (err) throw err;
                res.send({ 'message': 'เพิ่มข้อมูลประเภทสินค้าเรียบร้อยแล้ว', 'status': true });
            });
            
        }catch(error){
            res.send( {'message':'โทเคนไม่ถูกต้อง','status':false} );
        }    
    }
);
    
//Update a product type
app.put('/api/producttype/:id', 
    async function(req, res){
        //Receive a product type
        const typeID = req.params.id;
    
        try{
            //Receive a token
            const token = req.headers["authorization"].replace("Bearer ", "");

            //validate the token    
            let decode = jwt.verify(token, SECRET_KEY);               
            if(decode.positionID != 1 && decode.positionID != 2) {
                return res.send( {'message':'คุณไม่ได้รับสิทธิ์ในการเข้าใช้งาน','status':false} );
            }    
            
            //save data into database
            const {typeName} = req.body;
        
            let sql = `UPDATE producttype SET 
                       typeName = ?
                       WHERE typeID = ?`;
            let params = [typeName, typeID];
        
            db.query(sql, params, (err, result) => {
                if (err) throw err;
                res.send({ 'message': 'แก้ไขข้อมูลประเภทสินค้าเรียบร้อยแล้ว', 'status': true });
            });
            
        }catch(error){
            res.send( {'message':'โทเคนไม่ถูกต้อง','status':false} );
        }    
    }
);
    
//Delete a product
app.delete('/api/producttype/:id',
    async function(req, res){
        const typeID = req.params.id;                    
        try{
            const token = req.headers["authorization"].replace("Bearer ", "");
            let decode = jwt.verify(token, SECRET_KEY);               
            if(decode.positionID != 1 && decode.positionID != 2) {
                return res.send( {'message':'คุณไม่ได้รับสิทธิ์ในการเข้าใช้งาน','status':false} );
            }
            
            const sql = 'DELETE FROM producttype WHERE typeID = ?';
            db.query(sql, [typeID], (err, result) => {
                if (err) throw err;
                res.send({'message':'ลบข้อมูลประเภทสินค้าเรียบร้อยแล้ว','status':true});
            });

        }catch(error){
            res.send( {'message':'โทเคนไม่ถูกต้อง','status':false} );
        }
        
    }
);


/*############## ORDER ##############*/
//เพิ่มสินค้าเข้าตะกร้า
app.post('/api/makeorder', (req, res) => {  
    const { custID, productID, quantity, price } = req.body;    
    const token = req.headers["authorization"].replace("Bearer ", "");
    try{
        let decode = jwt.verify(token, SECRET_KEY);               
        if(custID != decode.custID) {
          return res.send( {'message':'คุณไม่ได้รับสิทธิ์ในการเข้าใช้งาน','status':false} );
        }

    
        //Select last order having status id as 0
        let sql = 'SELECT orderID FROM orders WHERE custID = ? AND statusID = 0';
        db.query(sql, [custID], (err, results) => {
            if (err) throw err;
            let orderID = '';
            
            if(results.length == 0) {
                //Insert an order      
                sql = 'INSERT INTO orders (custID,statusID)VALUES(?, 0)';
                db.query(sql, [custID], (err, result) => {
                if (err) throw err;    
                orderID = result.insertId;
        
                //Insert an order detail
                sql = 'INSERT INTO orderdetail VALUES(?, ?, ?, ?)';
                db.query(sql, [orderID, productID, quantity, price ], (err, result) => {
                    if (err) throw err;
                });
        
                });
                
        
            }else{
                orderID = results[0]['orderID'];
                sql = 'SELECT COUNT(*) AS orderdetailcount ';
                sql += 'FROM orderdetail ';
                sql += 'WHERE orderID = ? AND productID = ?';
                db.query(sql, [orderID, productID], (err, result) => {
                if (err) throw err;
        
                if(result[0]['orderdetailcount'] == 0)//no-existing order detail
                {
                    //Insert an order detail
                    sql = 'INSERT INTO orderdetail VALUES(?, ?, ?, ?)';
                    db.query(sql, [orderID, productID, quantity, price ], (err, result) => {
                        if (err) throw err;
                    });
        
                }else{
                    //Update an order detail
                    sql = 'UPDATE orderdetail ';
                    sql += 'SET quantity = quantity + ? ';
                    sql += 'WHERE orderID = ? AND productID = ?';            
                    db.query(sql, [quantity, orderID, productID], (err, result) => {
                        if (err) throw err;
                    });
                }
                
                });
            }
    
            res.send({'message':'success','status':true});
        });

    }catch(error){
        res.send( {'message':'โทเคนไม่ถูกต้อง','status':false} );
    }    
});

function getCurrentTime(){
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const hours = String(currentDate.getHours()).padStart(2, '0');
    const minutes = String(currentDate.getMinutes()).padStart(2, '0');
    const seconds = String(currentDate.getSeconds()).padStart(2, '0');

    const formattedDateTime = year+'-'+month+'-'+day+' '+hours+':'+minutes+':'+seconds;;
    return formattedDateTime;
}

//ยืนยันการสั่งซื้อ
app.post('/api/confirmorder',
    async function(req, res){
        const { custID, orderID} = req.body; 
        const orderDate = getCurrentTime();
        const token = req.headers["authorization"].replace("Bearer ", "");
            
        try{
            let decode = jwt.verify(token, SECRET_KEY);               
            if(custID != decode.custID) {
              return res.send( {'message':'คุณไม่ได้รับสิทธิ์ในการเข้าใช้งาน','status':false} );
            }

            let sql = `
            UPDATE orders
            SET orderDate = ?, statusID = 1
            WHERE orderID = ?`
            db.query(sql, [orderDate, orderID], (err, result) => {
                if (err) throw err;
                res.send({'message':'ยืนยันการสั่งซื้อเรียบร้อย','status':true});
            });

        }catch(error){
            res.send( {'message':'โทเคนไม่ถูกต้อง','status':false} );
        }
        
    }
);


//ยืนยันการชำระเงิน
app.post('/api/confirmpayment',
    async function(req, res){
        const {orderID, statusID} = req.body;
        const token = req.headers["authorization"].replace("Bearer ", "");
            
        try{
            let decode = jwt.verify(token, SECRET_KEY);               
            if(decode.positionID != 1 && decode.positionID != 2) {
              return res.send( {'message':'คุณไม่ได้รับสิทธิ์ในการเข้าใช้งาน','status':false} );
            }
            
            //statusID=3 is confirming order
            let sql = `
            UPDATE orders
            SET statusID = ?
            WHERE orderID = ?`
            db.query(sql, [statusID, orderID], (err, result) => {
                if (err) throw err;
                res.send({'message':'ยืนยันการชำระเงินเรียบร้อย','status':true});
            });

        }catch(error){
            res.send( {'message':'โทเคนไม่ถูกต้อง','status':false} );
        }
        
    }
);
  
  
//แสดงข้อมูลการสั่งซื้อที่อยู่ในตะกร้า
app.get('/api/cart/:id', (req, res) => {
    const custID = req.params.id;
    const token = req.headers["authorization"].replace("Bearer ", "");
    try{
        let decode = jwt.verify(token, SECRET_KEY);               
        if(custID != decode.custID) {
          return res.send( {'message':'คุณไม่ได้รับสิทธิ์ในการเข้าใช้งาน','status':false} );
        }

        let sql = `
        SELECT orders.orderID, orderDate, shipDate, receiveDate, orders.custID, statusID,
            customer.firstName,customer.lastName,customer.address,customer.mobilePhone,
            SUM(orderdetail.quantity) AS totalQuantity,
            SUM(orderdetail.quantity*orderdetail.price) AS totalPrice,
            COUNT(orderdetail.orderID) AS itemCount
        FROM orders
            INNER JOIN customer ON customer.custID=orders.custID
            INNER JOIN orderdetail ON orders.orderID=orderdetail.orderID
        WHERE orders.custID=?  AND orders.statusID=0
        GROUP BY orders.orderID, orderDate, shipDate,
            receiveDate, orders.custID, statusID,
            customer.firstName,customer.lastName,customer.address,customer.mobilePhone`;
    
        db.query(sql, [custID], (err, results) => {
            if (err) throw err;
            res.json(results);
        });

    }catch(error){
        res.send( {'message':'โทเคนไม่ถูกต้อง','status':false} );
    }

}); 
  
//แสดงรายการประวัติการสั่งซื้อ
app.get('/api/history/:id', (req, res) => {

    const custID = req.params.id;
    const token = req.headers["authorization"].replace("Bearer ", "");
    try{
        let decode = jwt.verify(token, SECRET_KEY);               
        if(custID != decode.custID) {
          return res.send( {'message':'คุณไม่ได้รับสิทธิ์ในการเข้าใช้งาน','status':false} );
        }

        let sql = 'SELECT orders.orderID, orderDate, shipDate, receiveDate, orders.custID, statusID,';
        sql += 'customer.firstName,customer.lastName,';
        sql += 'SUM(orderdetail.quantity) AS totalQuantity,';
        sql += 'SUM(orderdetail.quantity*orderdetail.price) AS totalPrice ';
        sql += 'FROM orders ';
        sql += '    INNER JOIN customer ON customer.custID=orders.custID ';         
        sql += '    INNER JOIN orderdetail ON orders.orderID=orderdetail.orderID ';
        sql += 'WHERE orders.custID=?  AND orders.statusID<>0 ';
        sql += 'GROUP BY orders.orderID, orderDate, shipDate,';
        sql += '    receiveDate, orders.custID, statusID,';
        sql += '    customer.firstName,customer.lastName ';
        sql += 'ORDER BY orders.orderID DESC';

        db.query(sql, [custID], (err, results) => {
            if (err) throw err;
            res.json(results);
        });

    }catch(error){
        res.send( {'message':'โทเคนไม่ถูกต้อง','status':false} );
    }    

}); 
  
//แสดงข้อมูลการสั่งซื้อ ของรายการที่เลือก
app.get('/api/orderinfo/:custID/:orderID', (req, res) => {
    const custID = req.params.custID;
    const orderID = req.params.orderID;

    const token = req.headers["authorization"].replace("Bearer ", "");
    try{
        let decode = jwt.verify(token, SECRET_KEY);               
        if(custID != decode.custID) {
          return res.send( {'message':'คุณไม่ได้รับสิทธิ์ในการเข้าใช้งาน','status':false} );
        }

        let sql = 'SELECT orders.orderID, orderDate, shipDate, receiveDate, orders.custID, statusID,';
        sql += 'customer.firstName,customer.lastName,customer.address,customer.mobilePhone,';
        sql += 'SUM(orderdetail.quantity) AS totalQuantity,';
        sql += 'SUM(orderdetail.quantity*orderdetail.price) AS totalPrice ';
        sql += 'FROM orders ';
        sql += '    INNER JOIN customer ON customer.custID=orders.custID ';         
        sql += '    INNER JOIN orderdetail ON orders.orderID=orderdetail.orderID ';
        sql += 'WHERE orders.orderID=? ';
        sql += 'GROUP BY orders.orderID, orderDate, shipDate,';
        sql += '    receiveDate, orders.custID, statusID,';
        sql += '    customer.firstName,customer.lastName,customer.address,customer.mobilePhone ';
    
        db.query(sql, [orderID], (err, results) => {
            if (err) throw err;
            res.json(results);
        });
    }catch(error){
        res.send( {'message':'โทเคนไม่ถูกต้อง','status':false} );
    }        

}); 
  
//แสดงรายละเอียดการสั่งซื้อ
app.get('/api/orderdetail/:custID/:orderID', (req, res) => {
    const custID = req.params.custID;
    const orderID = req.params.orderID;

    const token = req.headers["authorization"].replace("Bearer ", "");
    try{
        let decode = jwt.verify(token, SECRET_KEY);               
        if(custID != decode.custID) {
          return res.send( {'message':'คุณไม่ได้รับสิทธิ์ในการเข้าใช้งาน','status':false} );
        }

        let sql = 'SELECT orderdetail.*,product.productName ';
        sql += 'FROM orderdetail ';
        sql += '    INNER JOIN product ON orderdetail.productID = product.productID ';         
        sql += 'WHERE orderID=? ';

        db.query(sql, [orderID], (err, results) => {
            if (err) throw err;
            res.json(results);
        });
    }catch(error){
        res.send( {'message':'โทเคนไม่ถูกต้อง','status':false} );
    }      
}); 
  

//แสดงข้อมูลการสั่งซื้อ ของรายการที่เลือก (admin)
app.get('/api/orderinfo/:orderID', async (req, res) => {    
    const orderID = req.params.orderID;

    const token = req.headers["authorization"].replace("Bearer ", "");
    try{
        let decode = jwt.verify(token, SECRET_KEY);               
        if(decode.positionID != 1 && decode.positionID != 2) {
          return res.send( {'message':'คุณไม่ได้รับสิทธิ์ในการเข้าใช้งาน','status':false} );
        }

        //order info
        let sql = `
        SELECT 
            orders.orderID, 
            DATE_FORMAT(orderDate, '%Y-%m-%d %H:%i:%s') AS orderDate,
            DATE_FORMAT(shipDate, '%Y-%m-%d %H:%i:%s') AS shipDate,
            DATE_FORMAT(receiveDate, '%Y-%m-%d %H:%i:%s') AS receiveDate, 
            orders.custID, statusID,
            customer.firstName,customer.lastName,customer.address,customer.mobilePhone,
            SUM(orderdetail.quantity) AS totalQuantity,
            SUM(orderdetail.quantity*orderdetail.price) AS totalPrice
        FROM orders
            INNER JOIN customer ON customer.custID=orders.custID
            INNER JOIN orderdetail ON orders.orderID=orderdetail.orderID
        WHERE orders.orderID=?
        GROUP BY orders.orderID, orderDate, shipDate,
            receiveDate, orders.custID, statusID,
        customer.firstName,customer.lastName,customer.address,customer.mobilePhone`;
    
        let orderInfo = await query(sql, [orderID]);

        //order details
        sql = 'SELECT orderdetail.*,product.productName ';
        sql += 'FROM orderdetail ';
        sql += '    INNER JOIN product ON orderdetail.productID = product.productID ';         
        sql += 'WHERE orderID=? ';

        let orderDetails = await query(sql, [orderID]);
        orderInfo[0]['orderDetails'] = orderDetails;
        res.json(orderInfo);

    }catch(error){
        res.send( {'message':'โทเคนไม่ถูกต้อง','status':false} );
    }        

}); 

//แสดงรายการประวัติการสั่งซื้อ (admin)
app.get('/api/admin/history', (req, res) => {

    const token = req.headers["authorization"].replace("Bearer ", "");
    try{
        let decode = jwt.verify(token, SECRET_KEY);  
        if(decode.positionID != 1 && decode.positionID != 2) {
          return res.send( {'message':'คุณไม่ได้รับสิทธิ์ในการเข้าใช้งาน','status':false} );
        }

        let sql = `
        SELECT orders.orderID, orders.custID, 
            DATE_FORMAT(orderDate, '%Y-%m-%d %H:%i:%s') AS orderDate,
            DATE_FORMAT(shipDate, '%Y-%m-%d %H:%i:%s') AS shipDate,
            DATE_FORMAT(receiveDate, '%Y-%m-%d %H:%i:%s') AS receiveDate,        
            CASE 
                WHEN orders.statusID = 1 THEN 'รอการชำระเงิน'
                WHEN orders.statusID = 2 THEN 'กำลังตรวจสอบการชำระ'
                WHEN orders.statusID = 3 THEN 'ชำระแล้ว'
                WHEN orders.statusID = 4 THEN 'กำลังส่งสินค้า'
                WHEN orders.statusID = 5 THEN 'ส่งสินค้าแล้ว'
                ELSE 'ไม่ทราบสถานะ'
            END AS status,
            customer.firstName,customer.lastName,
            SUM(orderdetail.quantity) AS totalQuantity,
            SUM(orderdetail.quantity*orderdetail.price) AS totalPrice
        FROM orders
            INNER JOIN customer ON customer.custID=orders.custID
            INNER JOIN orderdetail ON orders.orderID=orderdetail.orderID
        WHERE orders.statusID<>0
        GROUP BY orders.orderID, orderDate, shipDate,
            receiveDate, orders.custID, status,
            customer.firstName,customer.lastName
        ORDER BY orders.orderID DESC`;

        db.query(sql, (err, results) => {
            if (err) throw err;
            res.json(results);
        });

    }catch(error){
        res.send( {'message':'โทเคนไม่ถูกต้อง','status':false} );
    }    

}); 


/*############## PAYMENT ##############*/
//Add a payment
app.post('/api/payment', (req, res) => {  
    const { custID, orderID, price} = req.body;  
    const token = req.headers["authorization"].replace("Bearer ", "");

    try{
        let decode = jwt.verify(token, SECRET_KEY);               
        if(custID != decode.custID) {
          return res.send( {'message':'คุณไม่ได้รับสิทธิ์ในการเข้าใช้งาน','status':false} );
        }

        //save slip file
        let fileName = "";
        if (req?.files?.slipFile){
            const imageFile = req.files.slipFile; // image file    

            fileName = imageFile.name.split(".");// file name
            fileName = fileName[0] + Date.now() + '.' + fileName[1]; 

            const imagePath = path.join(__dirname, 'assets/payment', fileName); //image path

            fs.writeFile(imagePath, imageFile.data, (err) => {
                if(err) throw err;
            });
        
        }

        //insert payment data    
        const sql = 'INSERT INTO payment(orderID, price, slipFile) VALUES (?, ?, ?)';
        db.query(sql, [orderID, price, fileName], (err, result) => {
            if (err) throw err;
        });

        //update customer status
        const sql_customer = 'UPDATE orders SET statusID = 2 WHERE orderID = ?';
        db.query(sql_customer, [orderID], (err, result) => {
            if (err) throw err;
            res.send({ 'message': 'success', 'status': true });
        });  
    }catch(error){
        res.send( {'message':'โทเคนไม่ถูกต้อง','status':false} );
    } 

});

//Show a slip image
app.get('/api/payment/image/:filename', (req, res) => {
    const filepath = path.join(__dirname, 'assets/payment', req.params.filename);  
    res.sendFile(filepath);
});


//Show a payment (admin)
app.get('/api/payment/:id', async (req, res) => {    
    const orderID = req.params.id;

    const token = req.headers["authorization"].replace("Bearer ", "");
    try{
        let decode = jwt.verify(token, SECRET_KEY);               
        if(decode.custID > 0 && decode.positionID != 1 && decode.positionID != 2) {
          return res.send( {'message':'คุณไม่ได้รับสิทธิ์ในการเข้าใช้งาน','status':false} );
        }
        
        //order info
        let sql = `
        SELECT 
            orders.orderID, 
            DATE_FORMAT(orderDate, '%Y-%m-%d %H:%i:%s') AS orderDate,
            DATE_FORMAT(shipDate, '%Y-%m-%d %H:%i:%s') AS shipDate,
            DATE_FORMAT(receiveDate, '%Y-%m-%d %H:%i:%s') AS receiveDate, 
            orders.custID, statusID,
            customer.firstName,customer.lastName,customer.address,customer.mobilePhone,
            SUM(orderdetail.quantity) AS totalQuantity,
            SUM(orderdetail.quantity*orderdetail.price) AS totalPrice
        FROM orders
            INNER JOIN customer ON customer.custID=orders.custID
            INNER JOIN orderdetail ON orders.orderID=orderdetail.orderID
        WHERE orders.orderID=?
        GROUP BY orders.orderID, orderDate, shipDate,
            receiveDate, orders.custID, statusID,
        customer.firstName,customer.lastName,customer.address,customer.mobilePhone`;
    
        let orderInfo = await query(sql, [orderID]);

        //payment details
        sql = `
        SELECT 
            paymentID, orderID,
            DATE_FORMAT(paymentDate, '%Y-%m-%d %H:%i:%s') AS paymentDate,
            price, comment, slipFile, channelID 
        FROM payment 
        WHERE orderID=?`

        let paymentDetails = await query(sql, [orderID]);
        orderInfo[0]['paymentDetails'] = paymentDetails;
        res.json(orderInfo);

    }catch(error){
        res.send( {'message':'โทเคนไม่ถูกต้อง','status':false} );
    }        

}); 

/*############## CHAT ##############*/
//List of employees with the last message
app.get('/api/chat/list/:id', (req, res) => {
    const custID = req.params.id;
    const token = req.headers["authorization"].replace("Bearer ", "");
    try{
        const decode = jwt.verify(token, SECRET_KEY);               
        if(custID != decode.custID) {
          return res.send( {'message':'คุณไม่ได้รับสิทธิ์ในการเข้าใช้งาน','status':false} );
        }

        const sql = `
        SELECT chat.empID, message, orderID,
            CASE
            WHEN CAST(CURRENT_TIMESTAMP AS DATE) = SUBSTRING(chatTime,1,10) THEN 
                 CONCAT(DATE_FORMAT(chatTime,"%H.%i")," น.")
            ELSE DATE_FORMAT(chatTime,"%d/%m")
            END AS chatTime,
            imageFile, CONCAT(firstName," ", lastName) AS employee
        FROM chat
            INNER JOIN employee ON chat.empID = employee.empID
        WHERE msgID IN
            (SELECT max(msgID) FROM chat WHERE custID = ? GROUP BY empID)
        ORDER BY chatTime DESC`;
      
        db.query(sql, [custID], (err, results) => {
          if (err) throw err;
          res.json(results);
        });

    }catch(error){
        res.send( {'message':'โทเคนไม่ถูกต้อง','status':false} );
    }
});  

    
//ค้นหารหัสพนักงานที่มีการแชตกับลุกค้าน้อยที่สุด
async function getEmpID() {
    let empID = -1;

    let sql = `
    SELECT employee.empID, COUNT(orderID) AS orderCount 
    FROM employee 
        LEFT JOIN chat ON employee.empID = chat.empID         
    GROUP BY employee.empID 
    ORDER BY orderCount ASC 
    LIMIT 1`;

    const results = await query(sql, []);

    if (results.length > 0) {
        empID = results[0].empID;
    } else {
        sql = `
        SELECT empID
        FROM employee
        ORDER BY RAND()
        LIMIT 1`;

        const randomResults = await query(sql);
        empID = randomResults[0].empID;
    }

    return empID;
}

//Send a message
app.post('/api/chat/post', async (req, res) => {  
    let { message, custID, empID, orderID} = req.body;    
    const sender = 'c';
    const token = req.headers["authorization"].replace("Bearer ", "");

    try{
        const decode = jwt.verify(token, SECRET_KEY);               
        if(custID != decode.custID) {            
            return res.send( {'message':'คุณไม่ได้รับสิทธิ์ในการเข้าใช้งาน','status':false} );
        }

        let sql = `
        SELECT  chat.empID
        FROM chat
            INNER JOIN employee ON chat.empID = employee.empID
        WHERE chat.custID = ? AND chat.orderID = ?
        LIMIT 1`;  
        
        const result = await query(sql, [custID, orderID]);
    
        if(result.length>0){            
            empID = result[0].empID;
        }else{            
            empID = await getEmpID();                        
        }            
    
        sql = 'INSERT INTO chat(message, custID, empID, orderID, sender) VALUES (?, ?, ?, ?, ?)';        
        try {
            await query(sql, [message, custID, empID, orderID, sender]);
            res.send({'message':'success','status':true});
        } catch (err) {        
            res.status(500).send('Internal Server Error');
        }  

    }catch(error){
        res.send( {'message':'โทเคนไม่ถูกต้อง','status':false} );
    }

});
  
//Show messages
app.post('/api/chat/show', async (req, res) => {
    let { custID, empID, orderID } = req.body;
    const token = req.headers["authorization"].replace("Bearer ", "");

    try{
        const decode = jwt.verify(token, SECRET_KEY);               
        if(custID != decode.custID) {
          return res.send( {'message':'คุณไม่ได้รับสิทธิ์ในการเข้าใช้งาน','status':false} );
        }
        
        //console.log('show:'+empID);
        let sql = `
        SELECT  chat.empID
        FROM chat
            INNER JOIN employee ON chat.empID = employee.empID
        WHERE chat.custID = ? AND chat.orderID = ?
        LIMIT 1`;  
        const result = await query(sql, [custID, orderID]);

        if(result.length>0){
            empID = result[0].empID;
        }else{
            empID = await getEmpID();
        }

        sql = `
        SELECT  message,
        CASE
            WHEN CAST(CURRENT_TIMESTAMP AS DATE) = SUBSTRING(chatTime,1,10) THEN CONCAT(DATE_FORMAT(chatTime, "%H.%i")," น.")
            ELSE DATE_FORMAT(chatTime,"%d/%m")
        END AS chatTime, sender, orderID, imageFile
        FROM chat
            INNER JOIN employee ON chat.empID = employee.empID
        WHERE chat.custID = ? AND chat.empID = ? AND chat.orderID = ?
        ORDER BY msgID ASC`;
        
        const results = await query(sql, [custID, empID, orderID]);
        res.json(results);

    }catch(error){
        res.send( {'message':'โทเคนไม่ถูกต้อง','status':false} );
    }        
});

//Send a message (employee)
app.post('/api/employee/chat/post', async (req, res) => {  
    let { message, custID, empID, orderID} = req.body;    
    const sender = 'e';
    const token = req.headers["authorization"].replace("Bearer ", "");

    try{
        const decode = jwt.verify(token, SECRET_KEY);               
        if(empID != decode.empID) {            
            return res.send( {'message':'คุณไม่ได้รับสิทธิ์ในการเข้าใช้งาน','status':false} );
        }      
    
        sql = 'INSERT INTO chat(message, custID, empID, orderID, sender) VALUES (?, ?, ?, ?, ?)';        
        try {
            await query(sql, [message, custID, empID, orderID, sender]);
            res.send({'message':'success','status':true});
        } catch (err) {        
            res.status(500).send('Internal Server Error');
        }  

    }catch(error){
        res.send( {'message':'โทเคนไม่ถูกต้อง','status':false} );
    }

});
  
  
/*############## DASHBOARD ##############*/
//ยอดการสั่งซื้อรายปี (บาท) -- สำหรับ admin    
app.get('/api/yearlySale', (req, res) => {
    const custID = req.params.id;
    const token = req.headers["authorization"].replace("Bearer ", "");
    try{
        const decode = jwt.verify(token, SECRET_KEY);               
        if(decode.positionID != 1) {            
            return res.send( {'message':'คุณไม่ได้รับสิทธิ์ในการเข้าใช้งาน','status':false} );
        }  

        const sql = `
        SELECT SUBSTRING(orders.orderDate,1,4) AS year,
            SUM(orderdetail.quantity*orderdetail.price) AS totalAmount
        FROM product
            INNER JOIN orderdetail ON product.productID=orderdetail.productID
            INNER JOIN orders ON orderdetail.orderID=orders.orderID
        WHERE orders.statusID>=3
        GROUP BY SUBSTRING(orders.orderDate,1,4)
        ORDER BY SUBSTRING(orders.orderDate,1,4) ASC
        LIMIT 5`;
      
        db.query(sql, [custID], (err, results) => {
          if (err) throw err;
          res.json(results);
        });

    }catch(error){
        res.send( {'message':'โทเคนไม่ถูกต้อง','status':false} );
    }

});  

//ยอดการสั่งซื้อรายปี (บาท)    
app.get('/api/yearlySale/:id', (req, res) => {
    const custID = req.params.id;
    const token = req.headers["authorization"].replace("Bearer ", "");
    try{
        const decode = jwt.verify(token, SECRET_KEY);               
        if(custID != decode.custID) {
          return res.send( {'message':'คุณไม่ได้รับสิทธิ์ในการเข้าใช้งาน','status':false} );
        }

        const sql = `
        SELECT SUBSTRING(orders.orderDate,1,4) AS year,
            SUM(orderdetail.quantity*orderdetail.price) AS totalAmount
        FROM product
            INNER JOIN orderdetail ON product.productID=orderdetail.productID
            INNER JOIN orders ON orderdetail.orderID=orders.orderID
        WHERE orders.custID=? AND orders.statusID>=3
        GROUP BY SUBSTRING(orders.orderDate,1,4)
        ORDER BY SUBSTRING(orders.orderDate,1,4) ASC
        LIMIT 5`;
      
        db.query(sql, [custID], (err, results) => {
          if (err) throw err;
          res.json(results);
        });

    }catch(error){
        res.send( {'message':'โทเคนไม่ถูกต้อง','status':false} );
    }

});  

//ยอดการสั่งซื้อรายเดือน (บาท)    
app.get('/api/monthlySale/:id', (req, res) => {
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const custID = req.params.id;
    const token = req.headers["authorization"].replace("Bearer ", "");

    try{
        const decode = jwt.verify(token, SECRET_KEY);               
        if(custID != decode.custID) {
          return res.send( {'message':'คุณไม่ได้รับสิทธิ์ในการเข้าใช้งาน','status':false} );
        }    
    
        const sql = `
        SELECT SUBSTRING(orders.orderDate,6,2) AS month,
            SUM(orderdetail.quantity*orderdetail.price) AS totalAmount
        FROM product
            INNER JOIN orderdetail ON product.productID=orderdetail.productID
            INNER JOIN orders ON orderdetail.orderID=orders.orderID
        WHERE orders.custID=? AND SUBSTRING(orderDate,1,4)=? AND orders.statusID>=3
        GROUP BY SUBSTRING(orders.orderDate,6,2)
        ORDER BY SUBSTRING(orders.orderDate,6,2) ASC`;
    
        db.query(sql, [custID, year], (err, results) => {
            if (err) throw err;
            res.json(results);
        });
    }catch(error){
        res.send( {'message':'โทเคนไม่ถูกต้อง','status':false} );
    }

});  
  
//สินค้าที่มียอดการสั่งซื้อ 5 อันดับแรก (บาท)
app.get('/api/topFiveProduct/:id', (req, res) => {

    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const custID = req.params.id;
    const token = req.headers["authorization"].replace("Bearer ", "");

    try{
        const decode = jwt.verify(token, SECRET_KEY);               
        if(custID != decode.custID) {
          return res.send( {'message':'คุณไม่ได้รับสิทธิ์ในการเข้าใช้งาน','status':false} );
        }   

        const sql = `
        SELECT product.productID, productName,
            SUM(orderdetail.quantity*orderdetail.price) AS totalAmount 
        FROM product
            INNER JOIN orderdetail ON product.productID=orderdetail.productID 
            INNER JOIN orders ON orderdetail.orderID=orders.orderID 
        WHERE orders.custID=? AND SUBSTRING(orderDate,1,4)=? AND orders.statusID>=3 
        GROUP BY product.productID, productName
        ORDER BY SUM(orderdetail.quantity*orderdetail.price) DESC 
        LIMIT 5`;
    
        db.query(sql, [custID, year], (err, results) => {
            if (err) throw err;
            res.json(results);
        });
    }catch(error){
        res.send( {'message':'โทเคนไม่ถูกต้อง','status':false} );
    }

}); 


/*############## WEB SERVER ##############*/  
// Create an HTTPS server
const httpsServer = https.createServer(credentials, app);
app.listen(port, () => {
    console.log(`HTTPS Server running on port ${port}`);
});