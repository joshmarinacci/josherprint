var fs = require('fs');

function Printer(MessageQueue) {
    this.dummy = false;
    this.paused = false;
    this.printing = false;
    this.text = 'blah';
    this.temp = -1;
    this.totallines = 0;
    this.linesleft = 0;

    this.open = function(port, cb) {
        MessageQueue.openSerial(port,cb);
    }

    this.goHome = function(axes,cb) {
        console.log('homing the axes',axes);
        //setState('homing');
        this.sendRequest('G28',function() {
            //setState('standby');
            if(cb) cb();
        });
    }

    this.getTemp = function(cb) {
        console.log("getTemp");
        this.sendRequest('M105',function(m) {
            console.log("getting temp return ",m);
            var temp = m.match(/T:(\d+\.\d+)/);
            if(temp) {
                console.log("got temp: ",temp[1]);
                cb(temp[1]);
                STATUS.ctemp = parseFloat(temp[1]);
            }  else {
                console.log("getting temp failed for some reason");
                cb(-1);
            }
        });
    }

    this.setTemp = function(temp, cb) {
        //setState('heating');
        console.log("moving to the target temp of ", temp);
        //STATUS.ttemp = parseFloat(temp);
        this.sendRequest('M109 S'+temp,function() {
            //setState('standby');
            cb(temp);
        });
    }

    this.sendRequest = function(req,cb) {
        if(!this.dummy) {
            MessageQueue.sendRequest(req,cb);
            MessageQueue.processNextCommand();
        } else {
            cb();
        }
    };


    this.getPositions = function(cb) {
        console.log("getPositions");
        this.sendRequest('M114',function(mm) {
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
    };


    this.move = function(axis, value, cb) {
        var req = 'G0 '+axis.toUpperCase()+value;
        console.log("move: ",req);
        this.sendRequest(req, function() { cb(value); });
    };


    this.extrude = function(amt, cb) {
        console.log("extruding by ",amt);
        var self = this;
        self.sendRequest('G92 E0', function() {
            self.sendRequest('G1 F200 E'+amt, function() {
                self.sendRequest('G92 E0', function() {
                    cb(amt);
                })
            })
        })
    }

    this.writeFile = function(gcodefile, cb) {
        this.printing = true;
        console.log("loading gcode file",gcodefile);
        var gcode = fs.readFileSync(gcodefile);
        var lines = gcode.toString().split("\n");
        console.log("gcode line count ",lines.length);
        this.totallines = lines.length;
        this.linesleft = lines.length;
        MessageQueue.sendPrintFile(lines, function() {
            if(cb) cb();
        });
    }

    this.pause = function(cb) {
        MessageQueue.pause();
        this.paused = true;
        if(cb) cb();
    }

    this.resume = function(cb) {
        MessageQueue.resume();
        var self = this;
        this.sendRequest('G0 '+MessageQueue.lastZ, function() {
            console.log("reset the Z");
            self.sendRequest('G92 '+MessageQueue.lastE, function() {
                console.log('reset the E counter');
                self.paused = false;
                MessageQueue.processNextCommand();
                if(cb) cb();
            });
        })
    }

    this.setFanSpeed = function(speed, cb) {
        console.log("setting speed to ", speed);
        var intSpeed = Math.floor(speed*255);
        this.sendRequest('M106 S'+intSpeed, function() {
            console.log("sent the speed to " + intSpeed);
            cb(speed);
        });
    }

    this.setExtrusionFactor = function(factor, cb) {
        console.log('setting extrusion factor to ', factor);
        this.sendRequest('M221 S'+Math.floor(factor*100), function() {
            console.log("set the extrusion factor to ", factor);
            cb(factor);
        });
    }

    this.setSpeedFactor = function(factor, cb) {
        console.log('setting speed factor to ', factor);
        this.sendRequest('M220 S'+Math.floor(factor*100), function() {
            console.log("set the extrusion factor to ", factor);
            cb(factor);
        });
    }

}


exports.Printer = Printer;
