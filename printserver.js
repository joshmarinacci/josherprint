
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


// imports
var express = require('express');
var bodyParser = require('body-parser');
var formidable = require('formidable');
var child_process = require('child_process');
var fs = require('fs');

// ==== configure the webserver
var app = express();
//parse post bodies
app.use(bodyParser());
//middleware function to set mimetype and cross-domain access
app.use(function(req, res, next){
    console.log("request came in");
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


//start up the serial port and webserver
var MessageQueue = require('./MessageQueue.js').MessageQueue;
startServer(function() {
    MessageQueue.openSerial("/dev/cu.usbmodem12341");
});


function writeFile() {
    console.log("loading gcode file",STATUS.gcodefile);
    var gcode = fs.readFileSync(STATUS.gcodefile);
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
        console.log("goHome");
        MessageQueue.sendRequest('G28',cb);
    },
    getTemp: function(cb) {
        console.log("getTemp");
        MessageQueue.sendRequest('M105',function(m) {
            var temp = m.match(/T:(\d+\.\d+)/);
            console.log("got temp: ",temp[1]);
            cb(temp[1]);
        });
    },
    getPositions: function(cb) {
        console.log("getPositions");
        MessageQueue.sendRequest('M114',function(mm) {
            var pos = mm.toString().replace(/\n/g,'');
            var matches = pos.match(/X:(\d+\.\d+)Y:(\d+\.\d+)Z:(\d+\.\d+)E:(\d+\.\d+)/);
            cb({
                x:    parseFloat(matches[1]),
                y:    parseFloat(matches[2]),
                z:    parseFloat(matches[3]),
                e:    parseFloat(matches[4]),
            });
        });
    },
    move: function(axis, value, cb) {
        var req = 'G0 '+axis.toUpperCase()+value;
        console.log("move: ",req);
        MessageQueue.sendRequest(req, function() { cb(value); });
    },
    setTemp:function(temp, cb) {
        MessageQueue.sendRequest('M109 S'+temp,function() {
            cb(temp);
        });
    }
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

    app.post("/print",function(req,res){
        console.log("printing ",STATUS.file);
        STATUS.gcodefile = process.cwd()+"/foo.gcode";
        slice(STATUS.file,STATUS.gcodefile,function() {
            console.log("done with slicing");
            Printer.setTemp(195, function(temp) {
                console.log("reached target temp",temp);
                Printer.goHome(function() {
                    console.log('starting to print');
                    res.end(JSON.stringify({status:'ok'}));
                    writeFile();
                });
            });
        });
    });

    app.post('/upload', function(req,res) {
        var form = new formidable.IncomingForm();
        form.parse(req, function(err, fields, files) {
            var file = files.stlfile;
            STATUS.file = process.cwd()+"/toslice.stl";
            fs.renameSync(file.path,STATUS.file);
            console.log("new file = ",STATUS.file);
            res.end(JSON.stringify({
                status:'ok',
                path: STATUS.file,
            }));

        });
    });

    var server = app.listen(3589,function() {
        console.log('listening on port ', server.address().port);
    });

    if(cb) cb();

}
