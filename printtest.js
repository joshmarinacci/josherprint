var SP = require("serialport");
var Printer = require('./printer').Printer;

var MessageQueue = require('./MessageQueue.js').MessageQueue;
var printer = new Printer(MessageQueue);
//send home
printer.open('/dev/cu.usbmodem12341', function() {
    console.log("calling, go home");
    printer.setTemp(200,function() {
        console.log("moving Z up");
        printer.move('z',10,function() {
            //send gcode file
            console.log("sending gcode");
            printer.writeFile('test.gcode', function() {
                console.log('really printing now');

                //wait 10sec
                setTimeout(function() {
                    console.log("############### sending pause");
                    //send pause
                    printer.pause(function() {
                        setTimeout(function() {
                            console.log("########## paused");
                            //adjust extruder
                            printer.move('z',10,function() {
                                console.log("####### moved Z up");
                                //printer.move('z',0,function() {
                                    console.log("######### resuming to let it reset");
                                    //send resume
                                    printer.resume(function() {
                                        console.log("resumed printing");
                                    })
                                //});
                            })

                        },15*1000);
                    });
                },30*1000);
            });
        });
    });
});
