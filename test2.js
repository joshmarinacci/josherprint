var ometajs = require('ometa-js');
var fs = require('fs');
//var Calc = require('./test1.ometajs').Calc;
//console.log("results 2 ",Calc.matchAll('6*(4+3)','expr'));

//ometajs.compile('./gcode.ometajs')

var GCode = require('./gcode.ometajs').GCode;
var text = fs.readFileSync("boomerang.gcode").toString();
var tt = text.substring(0,50);
for(var i=0;i<tt.length; i++) {
//    console.log("tt = ",tt[i],tt[i].charCodeAt(0));
}
console.log("text = ",text.substring(0,200));
GCode.matchAll(text,'start');
