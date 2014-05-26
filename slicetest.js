var child_process = require('child_process');
var CURA_PATH = '/Applications/Cura/Cura.app/Contents/MacOS/Cura';

var outpath = 'foo.gcode';
var inpath = '/Users/josh/projects/gcodeprotocol/octogon.stl';


slice(inpath,outpath);

function slice(inpath, outpath) {
    var args = [
        "--output="+outpath,
        "--slice",
        inpath,
    ];


    var proc = child_process.execFile(CURA_PATH,args);
    proc.on('exit',function() {console.log("exited");});
    proc.on('error',function() {console.log("errored");});
    proc.on('close',function() {console.log("closed");});
    proc.on('disconnect',function() {console.log("disconnected");});

    proc.stdout.pipe(process.stdout);
}
