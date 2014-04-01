var face_detect = require('face-detect')
  , Canvas = require('canvas')
  , fs = require('fs')
  , https = require('https')
  , request = require('request')
  , async = require('async')
  , gossip = require('./gossip');

var imgDir = "./images";
var imgCount;
if (!fs.existsSync(imgDir+"/img_count"))
    imgCount = 0;
else
    imgCount = fs.readFileSync(imgDir+"/img_count", "utf8");

// start the cover generator
writeLog("\n Maggen is going!");
gossip.gossipForMaggen();

// Tumblr Stuff
var tumblr = require('tumblr.js');
var client = tumblr.createClient({
    consumer_key: 'Eo8NSAeATzYe8EUPYdWZWWUcH1tSJxaXo7QEmLrrEiQlpf0vV0',
    consumer_secret: 'KhaJbJMXKa8W8i4tBeSVOqXvq5s1WREbLYEPfxn5nMadiQxnzr',
    token: 'TnsBQlYwEmbc2hmh045fk0feB8MaON5XTG856TRhrzEkHnBFWK',
    token_secret: '82f049y0qdD0p33rzHT9EXkhIEKbHXtWFXP6rZjfiOmNHQ4Mcs'
});


var MIN_FACE_WIDTH = 100
  , MIN_FACE_HEIGHT = 100
  , MIN_EDGE_DISTANCE = 150 // distance from edge of face detection to closest edge
  , MAX_FACE_WIDTH = 500
  , MAX_FACE_HEIGHT = 500
  , COVER_WIDTH = 600 // width of the final image
  , COVER_HEIGHT = 800 // hieght of the final image
  , LOGO_COUNT = 6
  , EXTRA_FEATURE_COUNT = 21
  , LOGO_POS_X = 50
  , LOGO_POS_Y = 30
  , TWEET_BEGIN_X = 300
  , TWEET_BEGIN_Y = 660
  , TWEET_WIDTH = 280
  , LEFT_TITLE_COUNT = 15
  , RIGHT_TITLE_COUNT = 8
  , CENTER_TITLE_COUNT = 2
  , WRAP_TWEET_MIN_LETTERS = 9
  , WRAP_TWEET_MAX_LETTERS = 14;

exports.generateCover = getImages;

/*
 * MAIN FUNCTION
 */
function getImages(keyword, tweet) {
    //SAMPLE: 
    //https://www.googleapis.com/customsearch/v1?key=AIzaSyCjU8e3WCKIUJ_zsCEE4URG-jbD-60nuMs&cx=017418398159517884736:ef8ndqn4wba&q=celebrities&searchType=image&imgSize=large&imgType=face&dateRestrict=d1

    var host = "https://www.googleapis.com";
    var path = "/customsearch/v1";
    var params = {
        key         : "AIzaSyBdG4WFMzNGAeLd5BYkUoqTHMAD5_kiwss"
      , cx          : "017418398159517884736:ef8ndqn4wba"
      , q           : keyword
      , searchType  : "image"
      , imgSize     : "xlarge"
      , imgType     : "face"
      , dateRestrict: "d1"
    }
    var options = {
        hostname: host
      , path: buildURL(path, params)
    };

    https.get(host + buildURL(path, params), function(res) {
        //console.log("statusCode: ", res.statusCode);
        //console.log("headers: ", res.headers);

        var data = '';
        res.on('data', function (chunk){
            data += chunk;
        });
        res.on('end',function(){
            var obj = JSON.parse(data);
            if (obj.hasOwnProperty('items')) {
                selectImage(obj.items, function(src, sq) { editImage(src, sq, tweet); });
            } else 
                writeLog("ERROR: no reuslts from googleapis");
        })
    }).on('error', function(err) {
        handleError(err, "");
    });
};

/*
 * this funtion will check the image link to see if the image will work
 * as a magazine cover based on the face-detection module. If it doesn't 
 * work, it will test the next item on the list until something works.
 * return: the index of the image to use
 */
function selectImage(list, callback) {
    var checkImage = function(i, list) {
        // list will only ever be of length 10 or less
        if (i > 9 || list.length <= i) {
            writeLog("PROBLEM: no usable image. wait till next time");
            return;
        }

        async.series([
            function(callback) {
                download(list[i].link, imgDir+'/checker/image'+i, function(err) {
                    if (err) { 
                        handleError(null, err.message); 
                        checkImage(++i, list); 
                        return 
                    }
                    callback(null, 'ok');
                });
            }
        ], function(err, results) {
            if (err) handleError(err, "");

            if (results[0] == 'error') {
                writeLog("TRYING AGAIN: invalid image type");
                checkImage(++i, list);
            }

            var fd = detectFaces(imgDir+"/checker/image"+i);
            if (fd.length == 1) {
                // check if face is too big
                if (fd[0].topRight - fd[0].topLeft > MAX_FACE_WIDTH ||
                    fd[0].botLeft - fd[0].topLeft > MAX_FACE_HEIGHT) {
                    writeLog("TRYING AGAIN: face is too big");
                    checkImage(++i, list);
                }
                else {
                    callback(imgDir+"/image"+imgCount+".png", fd[0]);
                    imgCount++;
                    fs.writeFileSync(imgDir+"/img_count", imgCount);
                }
            } else {
                writeLog("TRYING AGAIN: too many faces, or no faces detected");
                checkImage(++i, list);
            }
        });
    };
    checkImage(0, list);
};


/*
 * This function centers and crops the image based on the location 
 * provided by face-detection
 */
function editImage(src, sq, tweet) {
    var data = fs.readFileSync(src);
    img = new Canvas.Image;
    img.src = data;
    canvas = new Canvas(COVER_WIDTH, COVER_HEIGHT);
    ctx = canvas.getContext('2d');

    var facePoint = findSquareCenter(sq);

    // drawing center - testing purposes only
    /*
    ctx.strokeStyle = 'rgba(0, 0, 255, 1)';
    ctx.beginPath();
    ctx.lineTo(facePoint.x, facePoint.y);
    ctx.lineTo(facePoint.x, facePoint.y+20);
    ctx.stroke();
    */

    minDistance = findMinEdgeDistance(facePoint, img);

    var topLeft = new point(facePoint.x - minDistance, facePoint.y - minDistance);
    var topRight = new point(facePoint.x + minDistance, facePoint.y - minDistance);
    var botRight = new point(facePoint.x + minDistance, facePoint.y + minDistance);
    var botLeft = new point(facePoint.x - minDistance, facePoint.y + minDistance);
    var sqCrop = new square(topLeft, topRight, botRight, botLeft);
   
    var cropHeight = minDistance * 2
      , cropWidth = minDistance * 2;
    ctx.drawImage(img, 
                  topLeft.x, topLeft.y, 
                  cropWidth, cropHeight,
                  -100, 0, 
                  800, 800
                  );

    // LOGO
    var logoImg = new Canvas.Image;
    var randImgNum = Math.floor(Math.random() * LOGO_COUNT) + 1;
    logoImg.src = fs.readFileSync("./media/logo" + randImgNum + ".png");
    ctx.drawImage(logoImg, LOGO_POS_X, LOGO_POS_Y);

    // setup title/tweet
    var titleCount;
    var position = ["left", "right", "center"];
    var alignment = position[Math.floor(Math.random()* (position.length-1))];

    if (alignment == "left")
        titleCount = LEFT_TITLE_COUNT;
    if (alignment == "right")
        titleCount = RIGHT_TITLE_COUNT;
    if (alignment == "center")
        titleCount = CENTER_TITLE_COUNT;

    // add tweet
    var color = ["yellow", "white"];
    ctx.fillStyle = color[Math.floor(Math.random() * (color.length-1))] ;
    ctx.textAlign = alignment;
    var tweetXPos = (alignment == "left") ? 15 : 585;
    ctx.shadowColor = "black";
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 4;
    ctx.shadowBlur = 4;
    wrapText(ctx, tweet, tweetXPos /*TWEET_BEGIN_X*/, TWEET_BEGIN_Y, TWEET_WIDTH);

    // add title
    var titleImg = new Canvas.Image;
    var randTitleNum = Math.floor(Math.random() * titleCount) +1;
    titleImg.src = fs.readFileSync("./media/title_"+alignment+"_"+randTitleNum+".png");
    ctx.drawImage(titleImg, 0, 0);

    // add extra-feature
    /*
    var extraFeature = new Canvas.Image;
    var p = (Math.random() > .5);
    var randExtraNum = Math.floor(Math.random() * EXTRA_FEATURE_COUNT) + 1;
    extraFeature.src = fs.readFileSync("./media/feature"+randExtraNum+".png");
    var xPos = (Math.random() > .5) ? 0 : 400;
    ctx.drawImage(extraFeature, xPos, 100, 200, 200);
    */

    // write canvas-image to png
    var buf = canvas.toBuffer();
    fs.writeFileSync("./images/cover" + imgCount + ".png", buf, 'binary');

    // upload to tumblr!
    client.photo("peoplesmagazinegenerator.tumblr.com", 
        { data: "./images/cover" + imgCount + ".png" }, 
        function(err, data) {
            if (err) console.log(err); 
            writeLog("post id: " + data.id);
        });
};


/*
 * returns an array where each element of the array is 
 * the (x,y) value of the 4 corners of a detected face in the
 * order: top-left, top-right, bottom-right, bottom-left
 * return empty object if no faces detected
 */
function detectFaces(src) {
    var data = fs.readFileSync(src);
        
    img = new Canvas.Image;
    img.src = data;
    canvas = new Canvas(img.width, img.height);
    ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, img.width, img.height);

    var result = face_detect.detect_objects({ 
        "canvas" : canvas,
        "interval" : 5,
        "min_neighbors" : 1 
    });

    var ret = [];
    var topLeft, topRight, botRight, botLeft, sq;
    var counter = 0;
    for (var i = 0; i < result.length; i++){
        counter++;
        var face = result[i];

        // make sure faces are big enough
        if (face.width < MIN_FACE_WIDTH || face.height < MIN_FACE_HEIGHT) {
            writeLog("PROBLEM: face width/height too small: " + 
                    " width=" + face.width + 
                    " | height=" + face.height);
            break;
        }

        topLeft = new point(face.x, face.y);
        topRight = new point(face.x + face.width, face.y);
        botRight = new point(face.x + face.width, face.y + face.height);
        botLeft = new point(face.x, face.y + face.height);
        sq = new square(topLeft, topRight, botRight, botLeft);
        
        // make sure the face is not close the edge
        var center = findSquareCenter(sq);
        var minDistance = findMinEdgeDistance(center, img);
        if (minDistance - (topRight.x - topLeft.x)/2 < MIN_EDGE_DISTANCE) {
            writeLog("PROBLEM: face is too close to an edge");
            break;;
        }

        // draw sqaure around face for debugging purposes
        /*
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
        ctx.beginPath();
        ctx.lineTo(face.x, face.y);
        ctx.lineTo(face.x + face.width, face.y);
        ctx.lineTo(face.x + face.width, face.y + face.height);
        ctx.lineTo(face.x, face.y + face.height);
        ctx.lineTo(face.x, face.y);
        ctx.stroke();
        */

        ret.push(sq);
    }

    if (counter == 0) {
        writeLog("PROBLEM: no faces detected");
        return ret;
    }

    // write canvas-image to png
    var buf = canvas.toBuffer();
    fs.writeFileSync(imgDir + "/image" + imgCount + ".png", buf, 'binary')

    return ret;
};

function download(uri, filename, callback){
    request.head(uri, function(err, res, body){
        var stream = fs.createWriteStream(filename);

        stream.on('error', function (err) {
            if (err && (err.code === 'EPIPE' || err.code === 'ECONNRESET')) return; // eat EPIPEs
            server.emit('error', err);
        });

        stream.on('close', function() { 
            writeLog("downloaded image from " + uri + " as: " + filename);
            callback(); 
        });

        request(uri).pipe(stream);
    });
};

function buildURL(path, params) {
    var ret = path;
    for (var param in params) {
        if (ret == path)
            ret += "?";
        ret += param + "=" + params[param] + "&";
    }
    ret = ret.substring(0, ret.length-1);
    return ret;
};

// returns the vertical length of space the text takes up
function wrapText(context, text, x, y, maxWidth, lineHeight) {
    var words = text.split(' ');
    var line = '';
    var fontSize;
    var headlineFont = "Helvetica";

    for (var i=0; i<words.length; i++) {
        line = line + words[i] + ' ';
        if (line.length > Math.floor(Math.random()*WRAP_TWEET_MAX_LETTERS) 
                + WRAP_TWEET_MIN_LETTERS) { // letter count

            fontSize = 1;
            context.font = "bold "+ fontSize +"px " + headlineFont;

            while (context.measureText(line).width <= maxWidth) 
                context.font = "bold "+ ++fontSize +"px " + headlineFont;

            if (i == words.length) {
                fontSize = 30;
                context.font = "bold "+ fontSize + "px " +headlineFont;
            }

            y = y + 0.9*fontSize;
            context.fillText(line, x, y);    

            line = '';
        }
    }

    // handles remainder letters
    if (line.length == 0) return;
    else {
        fontSize = 1;
        context.font = "bold "+ fontSize +"px " + headlineFont;

        while (context.measureText(line).width <= maxWidth)
            context.font = "bold "+ ++fontSize +"px " + headlineFont;
        y = y + 0.9*fontSize;
        context.fillText(line, x, y);
    }

};

function findMinEdgeDistance(facePoint, img) {
    var rightDistance = img.width - facePoint.x;
    var leftDistance = facePoint.x;
    var topDistance = facePoint.y;
    var botDistance = img.height - facePoint.y;
    var minDistance = Math.min(leftDistance, 
                         Math.min(rightDistance, 
                             Math.min(topDistance, botDistance)));
    return minDistance;
};

function findSquareCenter(square) {
    var x = square.tl.x + (square.tr.x - square.tl.x)/2;
    var y = square.tl.y + (square.bl.y - square.tl.y)/2;
    return new point(x, y);
};

function point(x, y) {
    this.x = x;
    this.y = y;
};

function square(tl, tr, br, bl) {
    this.tl = tl;
    this.tr = tr;
    this.br = br;
    this.bl = bl;
};

function writeLog(print) {
    fs.appendFile("./maggen_log", print);
    fs.appendFile("./maggen_log", "\n");
    console.log(print);
};

function handleError(err, print) {
    if (err != null) {
        //console.error('response status: ', err.statusCode);
        //console.error('data: ', err.data);
        fs.appendFile('./maggen_error_log', 'response status: ' + err.statusCode);
        fs.appendFile('./maggen_error_log', 'data: ' + err.data);
        fs.appendFile('./maggen_error_log', '\n');
    } else {
        fs.appendFile('./maggen_error_log', print);
        fs.appendFile('./maggen_error_log', '\n');
    }
    console.log(print);
    console.log(err);
};
