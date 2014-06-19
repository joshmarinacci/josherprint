var express = require('express');
var bodyParser = require('body-parser');
var cors = require('cors');
var Printer = require('./printer').Printer;
var websocket = require('nodejs-websocket');

var app = express();
//middleware function to set mimetype and cross-domain access
app.use(cors());
//parse post bodies
app.use(bodyParser());

var MessageQueue = require('./MessageQueue.js').MessageQueue;
var printer = new Printer(MessageQueue);

var wslisteners = [];
// ==== set up websocket for realtime monitoring
var ws = websocket.createServer(function(conn) {
    conn.on("close",function(code,reason) {
        console.log("websocket client disconnected",code,reason);
    });
    conn.on("error",function(err) {
        console.log("websocket client error",err);
    });
    wslisteners.push(conn);
}).listen(4202);
console.log("started websocket client on port ",4202);



//home and jog
app.post("/api/printer/printhead",function(req,res) {
    if(req.body.command == 'jog') {
        if(req.body.x) {
            printer.move('x',parseFloat(req.body.x), function(val) {
                res.json({status:'ok', x:val});
            });
        }
        if(req.body.y) {
            printer.move('y',parseFloat(req.body.y), function(val) {
                res.json({status:'ok', y:val});
            });
        }
        if(req.body.z) {
            printer.move('z',parseFloat(req.body.z), function(val) {
                res.json({status:'ok', z:val});
            });
        }
    }

    if(req.body.command == 'home') {
        printer.goHome(req.body.axes,function() {
            res.json({status:'ok'});
        });
    }
});

// manual extrusion
// set target temp
app.post('/api/printer/tool',function(req,res) {
    if(req.body.command == 'extrude') {
        printer.extrude(req.body.amount, function(val) {
            res.json({status:'ok',extrude:val});
        });
    }
    if(req.body.command == 'target') {
        printer.setTemp(parseFloat(req.body.targets.tool0), function(val) {
            res.json({status:'ok',temp:val});
        });
    }
});

function sendUpdate(message) {
    var obj = {
        'current':message
    };
    console.log("sending message",message);
    wslisteners.forEach(function(conn) {
        if(!conn.readyState) return;
        conn.sendText(JSON.stringify(obj));
    });
}

//start, pause, resume, and cancel
app.post('/api/job', function(req,res) {
    console.log('job command is',req.body.command);
    if(req.body.command == 'start') {
        console.log('pretending to start a print');
        sendUpdate({
            state:{
                text:'printing',
                flags:{
                    printing:true,
                    error:false,
                }
            }});
        var per = 0.0;
        var ctime = 0;
        var ltime = 10;
        var id = setInterval(function() {
            sendUpdate({
                progress: {
                    completion: per,
                    printTime: ctime,
                    printTimeLeft: ltime,
                }
            });
            ctime += 1;
            ltime -= 1;
            per += 0.1;
            if(per >= 1.0) {
                clearInterval(id);
            }
        },1000);
        res.json({status:'ok'}).end();
        return;
    }
    res.json({status:'ok'}).end();

});

var server = app.listen(3589,function() {
    console.log('listening on port ', server.address().port);
});
