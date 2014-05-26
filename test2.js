
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

var express = require('express');
var bodyParser = require('body-parser');
var formidable = require('formidable');
var child_process = require('child_process');
var fs = require('fs');
var app = express();
app.use(bodyParser());


var CURA_PATH = '/Applications/Cura/Cura.app/Contents/MacOS/Cura';
var outpath = 'foo.gcode';

/*
SP.list(function(err,ports){
    console.log("ports",ports);
});
*/


var MessageQueue = require('./MessageQueue.js').MessageQueue;
MessageQueue.openSerial("/dev/cu.usbmodem12341",startServer);

var STATUS = {
    file:null,
    state:'standby',
    gcodefile:null,
}

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
        MessageQueue.sendRequest('G28',cb);
    }
}

function startServer() {
    console.log('starting webserver');
    var allowed_hosts = '*';

    app.get("/status",function(req,res) {
        res.writeHead(200, {
            'Content-Type':'text/json',
            'Access-Control-Allow-Origin':allowed_hosts,
        });
        MessageQueue.sendRequest('M105',function(m) {
            var temp = m.match(/T:(\d+\.\d+)/);
            MessageQueue.sendRequest('M114',function(mm) {
                var pos = mm.toString().replace(/\n/g,'');
                var matches = pos.match(/X:(\d+\.\d+)Y:(\d+\.\d+)Z:(\d+\.\d+)E:(\d+\.\d+)/);
                console.log("sending status request");
                res.end(JSON.stringify({
                    status:'pretty good',
                    temp: parseFloat(temp[1]),
                    x:    parseFloat(matches[1]),
                    y:    parseFloat(matches[2]),
                    z:    parseFloat(matches[3]),
                    e:    parseFloat(matches[4]),
                }));
            });
        });
    });

    app.post("/move",function(req,res) {
        res.writeHead(200, {
            'Content-Type':'text/json',
            'Access-Control-Allow-Origin':allowed_hosts,
        });
        if(req.param('x')) {
            var x = parseFloat(req.param('x'));
            console.log("x =>",x);
            MessageQueue.sendRequest('G0 X'+x, function() {
                res.end(JSON.stringify({status:'ok', x:x}));
            });
            return;
        }
        if(req.param('y')) {
            var y = parseFloat(req.param('y'));
            console.log("y =>",y);
            MessageQueue.sendRequest('G0 Y'+y, function() {
                res.end(JSON.stringify({status:'ok', y:y}));
            });
            return;
        }
        if(req.param('z')) {
            var z = parseFloat(req.param('z'));
            console.log("z =>",z);
            MessageQueue.sendRequest('G0 Z'+z, function() {
                res.end(JSON.stringify({status:'ok', z:z}));
            });
            return;
        }
        res.end(JSON.stringify({status:'failure', message:'you must supply at least z, y, or z'}));
    });

    app.post("/home",function(req,res) {
        res.writeHead(200, {
            'Content-Type':'text/json',
            'Access-Control-Allow-Origin':allowed_hosts,
        });
        console.log("pos => home");
        Printer.goHome(function() {
            res.end(JSON.stringify({status:'ok'}));
        });
    });

    app.post("/print",function(req,res){
        console.log("printing ",STATUS.file);
        console.log("temp to S30");
        res.writeHead(200, {
            'Content-Type':'text/json',
            'Access-Control-Allow-Origin':allowed_hosts,
        });

        STATUS.gcodefile = process.cwd()+"/foo.gcode";
        slice(STATUS.file,STATUS.gcodefile,function() {
            console.log("done with slicing");
            MessageQueue.sendRequest('M109 S195',function() {
                //set temp to 195C and wait
                console.log("reached target temp");
                res.end(JSON.stringify({status:'ok'}));

                MessageQueue.sendRequest("G28", function(r) {
                    console.log("home finished",r);
                    console.log('starting to print');
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
            res.writeHead(200, {
                'Content-Type':'text/json',
                'Access-Control-Allow-Origin':allowed_hosts,
            });
            res.end(JSON.stringify({
                status:'ok',
                path: STATUS.file,
            }));

        });
    });

    var server = app.listen(3589,function() {
        console.log('listening on port ', server.address().port);
    });

}
