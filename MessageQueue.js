var SP = require("serialport");


//when ready to receive more commands
//if printing and not paused, fetch from file queue
//if printing and paused, fetch from fast queue
//if not printing, fetch from fast queue


exports.MessageQueue = {
    paused:false,
    printing: false,
    cmdqueue:[],
    filequeue:[],
    waitqueue:[],
    mess:"",
    queueWaiting:false,

    sendRequest:function(cmd,cb) {
        this.cmdqueue.push({
            type:'command',
            cmd:cmd,
            cb:cb,
        });
    },

    sendPrintFile:function(arr, cb) {
        this.printing = true;
        console.log("printing file from list of gcode commands",arr.length);
        var self = this;
        for(var i=0; i<arr.length; i++) {
            var cmd = arr[i];
            this.filequeue.push({
                type:'file',
                cmd:cmd,
                cb:function() {
                    //console.log("wrote a command");
                }
            });
        }
        if(cb)cb();
    },



    broadcast: function(event) {
        //console.log("event",event);
    },


    sendCommands:function(arr, cb) {
        var self = this;
        for(var i=0; i<arr.length-1; i++) {
            var cmd = arr[i];
            this.sendRequest(cmd, function() { });
        }
        var cmd = arr[arr.length-1];
        this.sendRequest(cmd, cb);
    },

    linecount:1,

    appendChecksum: function(cmd) {
        var cs = 0;
        for(var i=0; i<cmd.length; i++) {
            cs = cs ^ cmd[i].charCodeAt(0);
        }
        cs &= 0xff;
        return cmd+'*'+cs;
    },

    pause: function() {
        this.paused = true;
    },
    resume: function() {
        this.paused = false;
    },

    getNextCommand: function() {
        //pull from the command queue first, then the file queue
        if(this.cmdqueue.length >= 1) {
            return this.cmdqueue.shift();
        }
        if(this.paused) {
            return null;
        }
        if(this.filequeue.length <= 0) {
            console.log('nothing more to process');
            return null;
        }
        var command = this.filequeue.shift();
        var cm = command.cmd;
        //strip trailing comments
        if(cm.indexOf(';') >=0)  cm = cm.substring(0,cm.indexOf(';'));
        //strip whitespace
        cm = cm.trim();

        //skip empty lines (which used to be comments)
        if(cm.length == 0) {
            return this.getNextCommand();
        }
        command.cmd = cm;
        return command;
    },

    lastZ: 0,
    lastE: 0,

    trackPosition:function(cmd) {
        if(cmd.indexOf('G0') == 0 || cmd.indexOf('G1') == 0) {
            //console.log('move command');
            var parts = cmd.split(' ');
            for(var i=1; i<parts.length; i++) {
                var part = parts[i];
                //console.log('part = ',part);
                if(part.indexOf('Z') == 0) {
                    this.lastZ = part;
                }
                if(part.indexOf('E') == 0) {
                    this.lastE = part;
                }
            }
        }
    },

    processNextCommand:function() {
        console.log("last Z = ",this.lastZ, 'E', this.lastE);
        if(this.cc != null) {
            console.log("#### WARNING. DOUBLE COMMAND");
            return;
        }
        var command = this.getNextCommand();
        if(command == null) return;
        this.cc = command;
        console.log("got the command",command.type, command.cmd);//, command.cb);
        if(command.type == 'file') {
            this.trackPosition(command.cmd);
        }
        //add the checksum
        var cmd = this.appendChecksum("N"+this.linecount+" "+command.cmd);
        //var cmd = command.cmd;
        //console.log("sending text: ",cmd);
        this.linecount++;
        this.queueWaiting = true;
        var self = this;
        this.serialPort.write(cmd+'\n',function(err,results) {
            //console.log("wrote ",results,'bytes');
            self.serialPort.flush(function() {
                //console.log("flushed");
            });
        });
    },

    processInput:function(data) {
        console.log('received: ' + data);
        var str = data.toString();
        var lines = str.split("\n");
        for(var i=0; i<lines.length; i++) {
            var line = lines[i];
            //console.log("line = -",line,"-");
            if(line == 'ok') {
                //console.log("==== ok ====");
            }
            if(line == "" || line == "\n" || line == "  ") {
                return;
            }
            if(line[0] == 'T' && line[1] == ':') {
                var temp = line.match(/T:(\d+\.\d+)/);
                console.log("temp: ",temp[1]);
                this.broadcast({
                    type:"temp",
                    value:temp[1],
                });
                return;
            }
            if(line[0] == 'o' && line[1] == 'k') {
                this.endMessage(line);
            } else {
                this.appendMessage(line);
            }
        };
    },
    appendMessage: function(m) {
        this.mess += m;
        this.mess += '\n';
    },

    endMessage: function(m) {
        this.mess += m;
        console.log('end message:',this.mess);
        //console.log("current command = ",this.cc);
        this.cc.cb(this.mess);
        this.mess = "";
        this.broadcast({type:'okay',command:this.cc.cmd});
        this.cc = null;
        this.processNextCommand();
    },

    openSerial:function(path,cb) {
        this.serialPort = new SP.SerialPort(path, {
          baudrate: 57600,
          stopbits: 1,
          parity:'none',
          buffersize:63,
          },false);
        var self = this;
        this.serialPort.open(function() {
            console.log("opened " + path);
            self.serialPort.on('data',function(data) { self.processInput(data); });
            self.sendCommands(['M110','M115','M111 S6','M111 S6'],function() {
                console.log("done with startup");
                self.sendRequest('G28',function() {
                    console.log("done homing");
                    if(cb) cb();
                });
            });
            self.processNextCommand();
        });
    }
}
