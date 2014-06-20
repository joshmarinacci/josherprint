var CURA_PATH = '/Applications/Cura/Cura.app/Contents/MacOS/Cura';

var fs = require('fs');
var express = require('express');
var bodyParser = require('body-parser');
var formidable = require('formidable');
var cors = require('cors');
var Printer = require('./printer').Printer;
var websocket = require('nodejs-websocket');
var child_process = require('child_process');

var app = express();
//middleware function to set mimetype and cross-domain access
app.use(cors());
//parse post bodies
app.use(bodyParser());

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

var MessageQueue = require('./MessageQueue.js').MessageQueue;
var printer = new Printer(MessageQueue);
MessageQueue.broadcast = function(mess) {
    console.log('printer queue reported',mess);
    if(mess.type == 'temp') {
        printer.temp = parseFloat(mess.value);
        sendUpdate({
            temp: {
                actual: parseFloat(mess.value),
                target: -1,
                offset: 0,
            }
        });
    }
    if(mess.type == 'okay') {
        if(printer.printing) {
            console.log("we can decrement number of commands now");
            printer.linesleft--;
            sendUpdate({
                progress:{
                    completion: 1.0-(printer.linesleft/printer.totallines),
                    printTime:-1,
                    printTimeLeft:-1,
                }
            });
        }
    }

}



var printqueue = [];
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

//current printer state
app.get('/api/printer', function(req,res) {
    res.json({
        'temperature':{
            tool0: {
                actual:printer.temp,
                target:-1,
                offset:0,
            },
        },
        state: {
            text:printer.text,
            flags: {
                operational:true,
                paused: printer.paused,
                printing: printer.printing,
                error:false,
                ready:true,
                closedOrError:false,
            }
        }
    }).end();
});


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



//start, pause, resume, and cancel
app.post('/api/job', function(req,res) {
    console.log('job command is',req.body.command);
    if(req.body.command == 'start') {
        var item = printqueue.shift();
        //var file = process.cwd()+'/octogon.stl';
        console.log("printing ",item.file);
        item.gcodefile = process.cwd()+"/tmp/toprint.gcode";
        printer.text = 'slicing';
        slice(item.file, item.gcodefile,function() {
            console.log("done with slicing to ", item.gcodefile);
            printer.text = 'homing';
            printer.goHome(['x','y','z'],function() {
                printer.text = 'printing';
                printer.writeFile(item.gcodefile);
                sendUpdate({state:{
                    text:printer.text,
                    flags:{ printing:printer.printing, }
                    }});
            });
        });
        res.json({status:'ok'}).end();
        return;

        /*
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
        */
    }
    if(req.body.command == 'pause') {
        printer.pause(function() {
            console.log('successfully paused');
            res.json({status:'ok'}).end();
            sendUpdate({
                state:{
                    text:'printing',
                    flags:{
                        printing:true,
                        error:false,
                        paused:printer.paused,
                    }
                }});
        });
        return;
    }
    res.json({status:'ok'}).end();

});


app.get("/queue",function(req,res) {
    console.log("queue = ",printqueue);
    var queueinfo = {
        status:"ok",
        queue: printqueue,
        id: "id"+Math.floor(Math.random()*100000)+"",
    }
    res.end(JSON.stringify(queueinfo));
})
app.post('/upload', function(req,res) {
    var form = new formidable.IncomingForm();
    form.parse(req, function(err, fields, files) {
        console.log(err,fields,files);
        var file = files.stlfile;
        var newitem = {
            file : process.cwd()+"/tmp/toslice"+Math.floor(Math.random()*10*1000)+".stl",
            name: files.stlfile.name,
            state: 'waiting',
        }
        fs.renameSync(file.path,newitem.file);
        printqueue.push(newitem);
        console.log("new file = ",newitem);
        console.log("queue = ",printqueue);
        res.end(JSON.stringify({
            status:'ok',
            item: newitem,
        }));
    });
});

var server = app.listen(3589,function() {
    console.log('listening on port ', server.address().port);


    MessageQueue.openSerial("/dev/cu.usbmodem12341",function() {
        console.log('sending a request');
        MessageQueue.sendRequest('M110',function(m) {
            console.log("m = ",m);
            //writeFile(process.cwd()+"/toprint.gcode");
        });
    });

});


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
