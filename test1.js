
/*
this is a test of the mergency gcode system

we want to open a serial port
send the info command
with the proper generated checksum
get the response
print it to the console
try to parse it
then exit



test 2

send version request, wait for response and print it
send eeprom request, wait for response and print it
request temperature, wait for response and print it
send move to X=0
exit


test 3
simple express based webserver which will
get current status through a websocket every second {
    temp
    x/y/z
    print in progress?
    firmware info
    eeprom info
}

start print with foo.gcode file, already on disk



*/

var SP = require("serialport");
var express = require('express');
var bodyParser = require('body-parser');
var app = express();
app.use(bodyParser());

/*
SP.list(function(err,ports){
    console.log("ports",ports);
});
*/

var serialPort = new SP.SerialPort("/dev/cu.usbmodem12341", {
  baudrate: 57600
});

var cbqueue = [];
var mess = "";
function appendMessage(m) {
    mess += m;
    mess += '\n';
}
function endMessage(m) {
    console.log("finished the message",m);
    mess += m;
    console.log(mess);
    var cb = cbqueue.shift();
    cb(mess);
    mess = "";
}

function sendRequest(cmd,cb) {
    cbqueue.push(cb);
    serialPort.write(cmd+'\n',function(err,results) {
        console.log("wrote ",results,'bytes');
    })
}

serialPort.on('open',function() {
    console.log("opened");
    serialPort.on('data',function(data) {
        //console.log("got data",data.length);
        var str = data.toString();
        var lines = str.split("\n");
        lines.forEach(function(line) {
            //console.log("line = ",line);
            if(line[0] == 'o' && line[1] == 'k') {
                endMessage(line);
            } else {
                appendMessage(line);
            }
        });

    });
    /*
    serialPort.write('M501\n',function(err,results){
        console.log('wrote to the serial port');
        console.log("wrote",results,"bytes");
    });
    serialPort.write('M115\n',function(err,results){
        console.log('wrote to the serial port');
        console.log("wrote",results,"bytes");
    });
    */

    /*
    sendRequest('M501',function(message) {
        console.log("M501 got back",message);
        sendRequest('M115',function(message) {
            console.log("M115 got back",message);
            sendRequest('M105',function(message) {
                console.log("temp = ",message.trim());
            });
        });
    });
    */
    function sendCommands(arr) {
        arr.forEach(function(cmd) {
            console.log("sending",cmd);
            sendRequest(cmd,function(){console.log("done",cmd)});
        });
    }
    //sendCommands(['T0','G28','G0 X12','M114']);


    startServer();
});

//M115 get version number
//M501 get EEPROM stuff
//M105 get current temp


//T0 select tool
//G0 X12  move X axis to 12mm
//G28 move to Origin
//M114 Get Current Position



function startServer() {
    var allowed_hosts = '*';
    app.get("/status",function(req,res) {
        console.log("got status request");
        res.writeHead(200, {
            'Content-Type':'text/json',
            'Access-Control-Allow-Origin':allowed_hosts,
        });
        sendRequest('M105',function(m) {
            console.log("got the temp back",m);
            sendRequest('M114',function(mm) {
                var pos = mm.toString().replace(/\n/g,'');
                console.log("Mposition = ",pos);
                var matches = pos.match(/X:(\d+\.\d+)Y:(\d+\.\d+)Z:(\d+\.\d+)E:(\d+\.\d+)/);
                console.log("matched ", matches[1],matches[2],matches[3],matches[4]);
                res.end(JSON.stringify({
                    status:'pretty good',
                    temp:24.8,
                    x:matches[1],
                    y:matches[2],
                    z:matches[3],
                    e:matches[4],
                }));
            });
        });
    });
    app.post("/move",function(req,res) {
        console.log("got move request",req.query);
        res.writeHead(200, {
            'Content-Type':'text/json',
            'Access-Control-Allow-Origin':allowed_hosts,
        });
        console.log('alt = ', req.param('x'));
        if(req.param('x')) {
            var x = parseFloat(req.param('x'));
            console.log("x =>",x);
            sendRequest('G0 X'+x, function() {
                res.end(JSON.stringify({status:'ok', x:x}));
            });
            return;
        }
        if(req.param('y')) {
            var y = parseFloat(req.param('y'));
            console.log("y =>",y);
            sendRequest('G0 Y'+y, function() {
                res.end(JSON.stringify({status:'ok', y:y}));
            });
            return;
        }
        if(req.param('z')) {
            var z = parseFloat(req.param('z'));
            console.log("z =>",z);
            sendRequest('G0 Z'+z, function() {
                res.end(JSON.stringify({status:'ok', z:z}));
            });
            return;
        }
        res.end(JSON.stringify({status:'failure', message:'you must supply at least z, y, or z'}));
    });

    var server = app.listen(3589,function() {
        console.log('listening on port ', server.address().port);
    });

}
