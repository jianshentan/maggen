var http = require("http")
  , gm = require("gm"); 

 
// start a server (for some reason)
http.createServer(function (req, res) { 
  res.writeHead(200, {'Content-Type': 'text/plain'}); 
  res.end('Hello World');
}).listen(8080);
console.log("Server is running on localhost:8080");

compositeImage("image1.jpg", "watermark.png", "output.jpg", function(){
    console.log("composited to output.jpg");
});

gm('image1.jpg')
.stroke("#ffffff")
.font("Helvetica.ttf", 12)
.drawText(30, 20, "People")
.write("output.png", function (err) {
    if (!err) console.log('text!');
    process.exit(1);
});


function compositeImage(source, watermark, destination, callback) {
    var spawn = require('child_process').spawn;
    var composite = spawn('gm',
      [
          'composite',
          '-dissolve', '100', //溶解度,和透明度类似
          watermark,
          source,
          destination
      ]);

    composite.stdout.on('data',function(data){
      console.log(data);
    });

    composite.stderr.on('data',function(data){
      console.log(data);
    });

    composite.on('exit',function(code){
      if(code != 0){
          console.log('gm composite process exited with code ' + code);
      }
      callback();
    });
}

