var SP = require("serialport");

exports.MessageQueue = {
    cbqueue:[],
    mess:"",
    queueWaiting:false,
    appendMessage: function(m) {
        this.mess += m;
        this.mess += '\n';
    },
    endMessage: function(m) {
        this.mess += m;
        //console.log(this.mess);
        var command = this.cbqueue.shift();
        //console.log("done with command",command.cmd);
        command.cb(this.mess);
        this.mess = "";
        this.queueWaiting = false;
    },
    sendRequest:function(cmd,cb) {
        this.cbqueue.push({
            cmd:cmd,
            cb:cb,
        });
        this.checkQueue();
    },
    sendCommands:function(arr) {
        var self = this;
        arr.forEach(function(cmd) {
            self.sendRequest(cmd,function(){console.log("done",cmd)});
        });
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

    checkQueue:function() {
        if(this.queueWaiting) {
            console.log("waiting for the queue");
        } else {
            if(this.cbqueue.length > 0) {
                var command = this.cbqueue[0];
                //console.log("going to send",command.cmd);
                var cm = this.appendChecksum("N"+this.linecount+" "+command.cmd);
                this.linecount++;
                this.queueWaiting = true;
                this.serialPort.write(cm+'\n',function(err,results) {
                    //console.log("wrote ",results,'bytes');
                });
            }
        }
    },

    openSerial:function(path,cb) {
        this.serialPort = new SP.SerialPort(path, {
          baudrate: 57600
        });
        var self = this;
        this.serialPort.on('open',function() {
            console.log("opened " + path);
            self.serialPort.on('data',function(data) {
                //console.log("got data",data.length);
                self.queueWaiting = false;
                var str = data.toString();
                var lines = str.split("\n");
                lines.forEach(function(line) {
                    //console.log("line = -",line,"-");
                    if(line == "" || line == "\n" || line == "  ") {
                        return;
                    }
                    if(line[0] == 'T' && line[1] == ':') {
                        var temp = line.match(/T:(\d+\.\d+)/);
                        console.log("temp: ",temp[1]);
                        return;
                    }
                    if(line[0] == 'o' && line[1] == 'k') {
                        self.endMessage(line);
                    } else {
                        self.appendMessage(line);
                    }
                });

            });
            if(cb) cb();
        });
    }
}
