
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

// ========= GLOBALS
var CURA_PATH = '/Applications/Cura/Cura.app/Contents/MacOS/Cura';
var outpath = 'foo.gcode';

var STATUS = {
    file:null,
    state:'standby',
    gcodefile:null,
}

var printqueue = [
/*
    {
        name:'foo1.stl',
        state:'printing',
        eta_sec:60*60*3,
        id:'12341',
    },
    {
        name:'foo2.stl',
        state:'waiting',
        id:'12342',
    }
    */
];



// imports
var express = require('express');
var bodyParser = require('body-parser');
var formidable = require('formidable');
var child_process = require('child_process');
var fs = require('fs');
var websocket = require('nodejs-websocket');

// ==== configure the webserver
var app = express();
//parse post bodies
app.use(bodyParser());
//middleware function to set mimetype and cross-domain access
app.use(function(req, res, next){
    res.writeHead(200, {
        'Content-Type':'text/json',
        'Access-Control-Allow-Origin':'*',
    });
    next();
});


/*
SP.list(function(err,ports){
    console.log("ports",ports);
});
*/




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

//start up the serial port and webserver
var MessageQueue = require('./MessageQueue.js').MessageQueue;

MessageQueue.broadcast = function(mess) {
    wslisteners.forEach(function(conn) {
        if(!conn.readyState) return;
        conn.sendText(JSON.stringify(mess));
    })
}

startServer(function() {
    MessageQueue.openSerial("/dev/cu.usbmodem12341",function() {
        console.log('sending a request');
        MessageQueue.sendRequest('M110',function(m) {
            console.log("m = ",m);
            //writeFile(process.cwd()+"/toprint.gcode");
        });
    });
});


function writeFile(gcodefile) {
    console.log("loading gcode file",gcodefile);
    var gcode = fs.readFileSync(gcodefile);
    var lines = gcode.toString().split("\n");
    console.log("gcode line count ",lines.length);
    MessageQueue.sendCommands(lines);
}

function slice(inpath, outpath,cb) {
    var args = [
        "--output="+outpath,
        "--slice",
        inpath,
    ];

    console.log("slicing", inpath, "to",outpath);

    var proc = child_process.execFile(CURA_PATH,args);
    proc.on('exit',function() {
        console.log("exited");
        if(cb)cb();
    });
    proc.on('error',function() {console.log("errored");});
    proc.on('close',function() {console.log("closed");});
    proc.on('disconnect',function() {console.log("disconnected");});

    proc.stdout.pipe(process.stdout);
    proc.stderr.pipe(process.stdout);
}

Printer = {
    goHome: function(cb) {
        setState('homing');
        MessageQueue.sendRequest('G28',function() {
            setState('standby');
            if(cb) cb();
        });
    },
    getTemp: function(cb) {
        console.log("getTemp");
        MessageQueue.sendRequest('M105',function(m) {
            console.log("getting temp return ",m);
            var temp = m.match(/T:(\d+\.\d+)/);
            if(temp) {
                console.log("got temp: ",temp[1]);
                cb(temp[1]);
            }  else {
                console.log("getting temp failed for some reason");
                cb(-1);
            }
        });
    },
    getPositions: function(cb) {
        console.log("getPositions");
        MessageQueue.sendRequest('M114',function(mm) {
            console.log("get positiosn returned",mm);
            var pos = mm.toString().replace(/\n/g,'');
            var matches = pos.match(/X:(\d+\.\d+)Y:(\d+\.\d+)Z:(\d+\.\d+)E:(\d+\.\d+)/);
            if(!matches) {
                cb({
                    x:-1,
                    y:-1,
                    z:-1,
                    e:-1,
                });
            } else {
                cb({
                    x:    parseFloat(matches[1]),
                    y:    parseFloat(matches[2]),
                    z:    parseFloat(matches[3]),
                    e:    parseFloat(matches[4]),
                });
            }
        });
    },
    move: function(axis, value, cb) {
        var req = 'G0 '+axis.toUpperCase()+value;
        console.log("move: ",req);
        MessageQueue.sendRequest(req, function() { cb(value); });
    },
    setTemp:function(temp, cb) {
        setState('heating');
        MessageQueue.sendRequest('M109 S'+temp,function() {
            setState('standby');
            cb(temp);
        });
    }
}


function setState(state) {
    STATUS.state = state;
    MessageQueue.broadcast({
        type:"state",
        value:state
    });
}


function startServer(cb) {
    console.log('starting webserver');

    app.get("/status",function(req,res) {
        Printer.getTemp(function(temp) {
            Printer.getPositions(function(pos) {
                res.end(JSON.stringify({
                    status:'pretty good',
                    temp: parseFloat(temp),
                    x:pos.x,
                    y:pos.y,
                    z:pos.z,
                    e:pos.e,
                }));
            });
        });
    });

    app.post("/move",function(req,res) {
        if(req.param('x')) {
            Printer.move('x',parseFloat(req.param('x')), function(val) {
                res.end(JSON.stringify({status:'ok',x:val}));
            });
            return;
        }
        if(req.param('y')) {
            Printer.move('y',parseFloat(req.param('y')), function(val) {
                res.end(JSON.stringify({status:'ok',y:val}));
            });
            return;
        }
        if(req.param('z')) {
            Printer.move('z',parseFloat(req.param('z')), function(val) {
                res.end(JSON.stringify({status:'ok',z:val}));
            });
            return;
        }
        res.end(JSON.stringify({status:'failure', message:'you must supply at least z, y, or z'}));
    });

    app.post("/home",function(req,res) {
        Printer.goHome(function() {
            res.end(JSON.stringify({status:'ok'}));
        });
    });

    app.post("/temp",function(req,res) {
        Printer.setTemp(parseFloat(req.param('temp')), function(temp) {
            res.end(JSON.stringify({status:'ok'}));
        });
    });

    app.post("/print",function(req,res){
        var item = printqueue.shift();
        item.percent = 0;
        console.log("printing ",item.file);
        item.gcodefile = process.cwd()+"/toprint.gcode";
        res.end(JSON.stringify({status:'ok',item:item}));
        setState('slicing');
        slice(item.file,item.gcodefile,function() {
            console.log("done with slicing");
            Printer.goHome(function() {
                Printer.setTemp(195, function(temp) {
                    setState('standby');
                    console.log("reached target temp",temp);
                    console.log('starting to print');
                    setState('printing');
                    writeFile(item.gcodefile);
                });
            });
        });
    });

    app.post('/upload', function(req,res) {
        var form = new formidable.IncomingForm();
        form.parse(req, function(err, fields, files) {
            console.log(err,fields,files);
            var file = files.stlfile;
            var newitem = {
                file : process.cwd()+"/toslice"+Math.floor(Math.random()*10*1000)+".stl",
                name: 'new file',
                state: 'waiting',
            }
            fs.renameSync(file.path,newitem.file);
            printqueue.push(newitem);
            console.log("new file = ",newitem);
            res.end(JSON.stringify({
                status:'ok',
                item: newitem,
            }));
        });
    });

    app.get("/queue",function(req,res) {
        var queueinfo = {
            status:"ok",
            queue: printqueue,
            id: "id"+Math.floor(Math.random()*100000)+"",
        }
        res.end(JSON.stringify(queueinfo));
    })

    var server = app.listen(3589,function() {
        console.log('listening on port ', server.address().port);
    });

    if(cb) cb();

}
