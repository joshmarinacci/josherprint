var SP = require("serialport");
var fs = require('fs');
var serialPort = new SP.SerialPort("/dev/cu.usbmodem12341", {
  baudrate: 57600
});

var cbqueue = [];
var queueWaiting = false;
var mess = "";
function appendMessage(m) {
    mess += m;
    mess += '\n';
}
function endMessage(m) {
    console.log("finished the message",m);
    mess += m;
    console.log(mess);
    var command = cbqueue.shift();
    console.log("done with command",command.cmd);
    command.cb(mess);
    mess = "";
    queueWaiting = false;
}

function checkQueue() {
    if(queueWaiting) {
        console.log("waiting for the queue");
    } else {
        if(cbqueue.length > 0) {
            var command = cbqueue[0];
            console.log("going to send",command.cmd);
            queueWaiting = true;
            serialPort.write(command.cmd+'\n',function(err,results) {
                console.log("wrote ",results,'bytes');
            });
        }
    }
}

function sendRequest(cmd,cb) {
    cbqueue.push({
        cmd:cmd,
        cb:cb,
    });
    checkQueue();
    /*
    serialPort.write(cmd+'\n',function(err,results) {
        console.log("wrote ",results,'bytes');
    })
    */
}

function sendCommands(arr) {
    arr.forEach(function(cmd) {
        console.log("sending",cmd);
        sendRequest(cmd,function(){console.log("done",cmd)});
    });
}

function writeFile() {
    var gcode = fs.readFileSync('octogon.gcode');
    var lines = gcode.toString().split("\n");
    console.log("gcode line count ",lines.length);
    sendCommands(lines);
}

serialPort.on('open',function() {
    console.log("opened");
    serialPort.on('data',function(data) {
        queueWaiting = false;
        //console.log("got data",data.length);
        var str = data.toString();
        var lines = str.split("\n");
        lines.forEach(function(line) {
            //console.log("line = -",line,"-");
            if(line == "" || line == "\n" || line == "  ") {
                return;
            }
            if(line[0] == 'T' && line[1] == ':') {
                var temp = line.match(/T:(\d+\.\d+)/);
                console.log("got temp back: ",temp[1]);
                return;
            }
            if(line[0] == 'o' && line[1] == 'k') {
                endMessage(line);
            } else {
                appendMessage(line);
            }
        });

    });

    sendRequest("G28", function(r) {
        console.log("home finished",r);
        sendRequest('M109 S196',function(r) {
            console.log("temp finished",r);
            writeFile();
        })
    });

});

/*
serialPort.on('open',function() {
    console.log("opened serial port");
    serialPort.on('data',function(data) {
        console.log("got data",data.length,data.toString());
        var line = data.toString();

        var temp = line.match(/T:(\d+\.\d+)/);
        if(temp && temp.length > 1) {
            console.log("temp",temp[1]);
            if(parseFloat(temp[1]) > 195) {
                writeFile();
            }
        }

    });


    serialPort.write('M501\n',function(err,results){
        console.log('wrote to the serial port');
        console.log("wrote",results,"bytes");
        serialPort.write('G28', function() {});
        //serialPort.write('M109 S196\n',function(err,results) {
            //console.log("done with temp");
            // writeFile();
        //});
    });


//    writeFile();


});
*/
