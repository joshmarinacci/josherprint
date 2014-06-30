var SerialPort = require("serialport").SerialPort;
var serial = new SerialPort('/dev/tty.usbmodem12341', {
  baudrate: 57600,//250000,
  stopbits: 1,
  parity:'none',
  buffersize:63,
},false);


serial.open(function() {
    console.log("opened");
    serial.on('data', function(data) {
        console.log('received ' + data);
    });
    serial.write('M110\nM115\nM111 S6\nM111 S6\n',function() {
        console.log("done");
        serial.write('G28\n',function() {
            console.log("done homing");
        });
    });
});
