const express = require('express')
const mysql = require('mysql2')
const app = express()
const port = 4000

const https = require('https');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const SECRET_KEY = 'UX23Y24%@&2aMb';


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


//Hello World API
app.get('/', function(req, res){
    res.send('Hello World!')
});


/*####### RECOMMENDATION SYSTEM #######*/
app.get('/api/recommend/:id', async (req, res) => {    

    //รับรหัสลูกค้าจาก client
    const custID = req.params.id;
  
    //ส่งรหัสลูกค้าไปยัง model เพื่อค้นหารหัสสินค้าที่จะใช้แนะนำ
    const command = `python recommend.py ${custID}`;  
  
    //model ส่งรหัสสินค้าที่จะใช้แนะนำกลับมา
    let productIDs = execSync(command).toString().replace(/[\r\n]+/g, '').split(',');
    
    //เปลี่ยนรหัสสินค้าให้อยู่ในรูปแบบที่สามารถนำไปใช้งานได้
    productIDs = productIDs.map((str) => str.replace(/[\[\]\s]/g, ''));//Remove square brackets and spaces
    productIDs = productIDs.map((str) => parseInt(str, 10));//Convert the cleaned strings to numbers
  
    //ดึงรายการสินค้าที่ต้องการแนะนำ
    const placeholder = productIDs.map(() => '?').join(', ');
    const sql = `SELECT  *
                FROM product              
                WHERE productID IN (${placeholder})`;               
    
    db.query(sql, productIDs, function(err, result) {
          if (err) throw err;
          
          //ส่งผลลัพธ์กลับไปยัง clients
          res.send(result);        
      }                       
  );
  
  
  });

/*############## WEB SERVER ##############*/  
// Create an HTTPS server
app.listen(port, () => {
    console.log(`HTTPS Server running on port ${port}`);
});