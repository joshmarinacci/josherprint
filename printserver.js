// ========= GLOBALS
var CURA_PATH = '/Applications/Cura/Cura.app/Contents/MacOS/Cura';
var outpath = 'foo.gcode';

var STATUS = {
    filen:null,
    state:'standby',
    gcodefile:null,
    ctemp:0,
    ttemp:0,
    totallines:0,
    linesleft:0,
}

var printqueue = [];


// imports
var express = require('express');
var bodyParser = require('body-parser');
var formidable = require('formidable');
var child_process = require('child_process');
var fs = require('fs');
var websocket = require('nodejs-websocket');
var PrinterObj = require('./printer').Printer;

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
    if(mess.type == 'temp') {
        STATUS.ctemp = parseFloat(mess.value);
        mess.target = STATUS.ttemp;
    }
    if(mess.type == 'okay') {
        console.log("we can decrement number of commands now");
        STATUS.linesleft--;
        mess.totallines = STATUS.totallines;
        mess.linesleft = STATUS.linesleft;
    }
    wslisteners.forEach(function(conn) {
        if(!conn.readyState) return;
        conn.sendText(JSON.stringify(mess));
    })
}

/*
startServer(function() {
    MessageQueue.openSerial("/dev/cu.usbmodem12341",function() {
        console.log('sending a request');
        MessageQueue.sendRequest('M110',function(m) {
            console.log("m = ",m);
            //writeFile(process.cwd()+"/toprint.gcode");
        });
    });
});
*/

app.post("/api/printer/printhead",function(req,res) {
    console.log("print head called");
    res.end(JSON.stringify({status:'ok'}));
    /*

    res.send(JSON.stringify({foo:'bar'}));
    res.end();
    return;*/
});

var server = app.listen(3589,function() {
    console.log('listening on port ', server.address().port);
});


function writeFile(gcodefile) {
    console.log("loading gcode file",gcodefile);
    var gcode = fs.readFileSync(gcodefile);
    var lines = gcode.toString().split("\n");
    console.log("gcode line count ",lines.length);
    STATUS.totallines = lines.length;
    STATUS.linesleft  = lines.length;
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


var Printer = new PrinterObj(MessageQueue);


function setState(state) {
    STATUS.state = state;
    MessageQueue.broadcast({
        type:"state",
        value:state
    });
}


function startServer(cb) {
    console.log('starting webserver');

    app.get("/api/printer",function(req,res) {
        console.log("here");
        Printer.getTemp(function(temp) {
            Printer.getPositions(function(pos) {
                res.end(JSON.stringify({
                    temperature: {
                        tool0: {
                            "actual":STATUS.ctemp,
                            "target":STATUS.ttemp,
                            "offset":0,
                        }
                    },
                    position: {
                        x:pos.x,
                        y:pos.y,
                        z:pos.z,
                        e:pos.e,
                    },
                    state: {
                        text: STATUS.state,
                        flags: {
                            "operational":true,
                            "paused":false,
                            "printing":true,
                            "sdReady":false,
                            "error":false,
                            "ready":true,
                            "closedOrError":false,
                        }
                    },
                }));
            });
        });
    });

    app.post("/api/printer/printhead",function(req,res) {
        console.log("print head called");


        res.send(JSON.stringify({foo:'bar'}));
        res.end();
        return;

        if(cmd.command == 'jog') {
            console.llg("doing jog");
            if(cmd.x) {
                Printer.move('x', parseFloat(cmd.x), function(val) {
                    console.log("got called back");
                    res.json(JSON.stringify({status:'ok',x:val}));
                });
            }
            if(cmd.y) {
                Printer.move('y', parseFloat(cmd.x), function(val) {
                    res.end(JSON.stringify({status:'ok',y:val}));
                });
            }
            if(cmd.z) {
                Printer.move('z', parseFloat(cmd.z), function(val) {
                    res.end(JSON.stringify({status:'ok',z:val}));
                });
            }
            return;
        }

        if(cmd.command == 'home') {
            console.log('doing home');
            /*
            Printer.goHome(cmd.axes,function() {
                console.log("got the callback");
                res.json({status:'ok'});
                res.end();
            });
            */
            res.json({status:'ok'});
            //res.end();
            return;
        }

        console.log('doing other');
        res.end(JSON.stringify({status:'failure', message:'you must supply at least z, y, or z'}));
    });

    app.post("/api/printer/tool",function(req,res) {
        var cmd = req.body;
        if(cmd.command == 'target') {
            console.log('setting temp to ', cmd.targets.tool0);
            Printer.setTemp(cmd.targets.tool0, function() {
                res.send(JSON.stringify({status:'ok'}));
                res.end();
            });
        }
        if(cmd.command == 'extrude') {
            Printer.extrude(cmd.amount,function() {
                res.end(JSON.stringify({status:'ok'}));
            })
        }
    });

    app.post("/api/job", function(req, res) {
        console.log('doing a job request');
        var cmd = {
            'command':'start',
        }
        if(cmd.command == 'start') {
            console.log("start the current job");
        }
        if(cmd.command == 'restart') {

        }
        if(cmd.command == 'pause') {

        }
        if(cmd.command == 'cancel') {

        }
    });

    app.get("/api/job", function(req,res) {
        res.end(
            JSON.stringify({
                "job": {
                    "file":{
                        name:"foo.stl",
                        origin:'local',
                        size:146780, //in bytes
                        date: 1378847754, //time the job was started?
                    },
                    estimatedPrintTime: 8811,
                    filament: {
                        length: 810,
                        volume: 5.36,
                    },

                },
                progress: {
                    completion: 0.22, //percent complete
                    filepos: 337842, //??
                    printTime: 276, //in minutes?
                    printTimeLeft: 912, // in minutes?
                }
            })
        );
    });

    /*
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
    */


    if(cb) cb();

}
