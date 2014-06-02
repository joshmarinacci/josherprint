var ometajs = require('ometa-js');
var fs = require('fs');
//var Calc = require('./test1.ometajs').Calc;
//console.log("results 2 ",Calc.matchAll('6*(4+3)','expr'));

//ometajs.compile('./gcode.ometajs')

var GCode = require('./gcode.ometajs').GCode;


var text = fs.readFileSync("test.gcode").toString();

//console.log("text ="+text);
console.log("========");
GCode.matchAll(text,'start');
console.log("gcode len = ", text.length);
console.log("total line count = ", GCode.lineCount);
console.log("estimated layer count = ",GCode.zmoves);
