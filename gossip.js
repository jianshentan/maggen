var News = require('./twitter/news')
  , Markov = require('./twitter/markov')
  , request = require('request')
  , async = require('async')
  , Bot = require('./twitter/bot')
  , config1 = require('./config1')
  , fs = require('fs');

var bot = new Bot(config1);
var alchemyKey = "a8beb164524c1ebf02895cc2701ffd2bbf339268";
var recurseCounter = 0;

var maggen = require("./maggen");

// min words per tweet
var MIN_WORDS = 4; 
// max words per tweet
var MAX_WORDS = 12; 
// how many words need to be different to be considered non-duplicate
var DUPLICATE_TOLERANCE = 4; 

exports.gossipForMaggen = startMaggen;

//start bot!
function startMaggen() {
    gossip();
    setInterval(function() {
        bot.twit.get('followers/ids', function(err, reply) {
            if (err) return handleError(err, '');
            writeLog('\n# followers: ' + reply.ids.length.toString());
        });

        // gossip tweets and follows whoever is tagged in the tweet
        gossip();

    }, 18000000);
}

/*
 * calling gossip() eventually calls this method
 * param - tweet is [], and param entities = [{}, {}..]
 */
function processTweet(tweet, entities) {
    var t = "";
    for (var word in tweet)
        t += tweet[word] + " "; 

    // call maggen
    maggen.generateCover(entities[0].text, t);

    // DEPRECATED: This code is from gossipbot code (not needed here)
    // It interfaces with twitter (posting tweets, follows etc)
    /*
    // ask find twitter id tags for people entities
    var findRequests = [];
    var addHashTag = function(entity) {
        return function(callback) {
            bot.find(entity.text, function(err, reply) {
                if (err) return handleError(err, '');
                if (reply == null || reply.length <= 0) 
                    return handleError(null, 'no results');
                var person = {
                    text: entity.text
                  , name: reply[0].name
                  , screen_name: reply[0].screen_name
                  , id: reply[0].id
                }
                callback(null, person);
            });
        };
    };

    for (var i=0; i<entities.length; i++) {
        var entity = entities[i];
        if (entity.type === "Person")
            findRequests.push(addHashTag(entity));
    }

    async.parallel(findRequests, function(err, results) {
        if (err) return handleError(err, 'async parallel results failed');
        var tags = [];
        var userObj = [];
        for (var i=0; i<results.length; i++) {
            // check that at least one part of the name twitter found matches original text
            var eName = results[i].name.split(' ');
            var eText = results[i].text.split(' ');

            loop1:
            for (var j=0; j<eName.length; j++) {
                loop2:
                for (var k=0; k<eText.length; k++) {
                    if (eName[j].toLowerCase() === eText[k].toLowerCase()) {
                        userObj.push(JSON.stringify(results[i]));
                        tags.push(results[i].screen_name);
                        break loop1;
                    }
                }
            }
        }

        // follow tagged people
        for (var i=0; i<tags.length; i++)
            bot.followUserByScreenName(tags[i], function(err, reply) {
                if (err) return handleError(err, 'could not follow user.');
                writeLog('\n# Followed @' + reply.screen_name);
            });

        // construct sentence 
        var tweetSentence = makeSentence(tweet);
        for (var i=0; i<tags.length; i++)
            tweetSentence += ' @'+tags[i];
        var tweetObj = { userObj: userObj, tweet: tweetSentence };

        var k = fs.existsSync('./tweet_data') ? '':'[';
        if (fs.existsSync('./tweet_data')) {
            var content = fs.readFileSync('./tweet_data', 'utf8');
            fs.writeFileSync('./tweet_data', 
                    content.substring(0, content.length-1) + ',', 'utf8');
        }
        fs.appendFile('./tweet_data', k + JSON.stringify(tweetObj) + "]");
        
        // send tweet
        console.log(tweetSentence);
        bot.tweet(tweetSentence, function(err, reply) {
            if (err) return handleError(err, 'could not tweet.');
            writeLog('\n# Tweeted: ' + (reply ? reply.text: reply));
        });

    });
    */
};

function gossip() {
    var news = new News();
    var id = setInterval(function() {
        // check if news object has received and processed data from usa-today's api
        if (news.requestCount != news.totalRequests) return;
        else {
            clearInterval(id);
            if (!news.success) {
                handleError(null, 
                    "ERROR: could not get data from usa-today api. Till next time");
                return;
            }
        }

        var titles = news.getTitles();
        var descriptions = news.getDescriptions();

        var m = new Markov(titles, descriptions);
        recurseTweet(m, titles, descriptions, processTweet);

    }, 1000);
};

// build tweet with bigram/unigram
var generateTweet = function(m, titles) {
    // get first word
    var firstWord;
    while (true) {
        firstWord = getFirstWord(m, titles);
        if (firstWord != null)
            break;
        else
            handleError(null, "ERROR: could not find an appropriate first word.");
    }
            
    // generate tweet with first word
    var tweet = [];
    tweet.push(firstWord);
    while (tweet[tweet.length-1].charAt(tweet[tweet.length-1].length-1) != '.' &&
           tweet[tweet.length-1].charAt(tweet[tweet.length-1].length-1) != '?' &&
           tweet[tweet.length-1].charAt(tweet[tweet.length-1].length-1) != '!') {
        var wordOptions = [];

        var bigrams = m.bigram[tweet[tweet.length-1]];
        if (bigrams != null) {
            for (var count in bigrams) 
                for (var word in bigrams[count])
                    for (var j=0; j<count; j++)
                        wordOptions.push(bigrams[count][word]);
        } else {
            for (var count in m.unigram)
                for (var word in m.unigram[count])
                    for (var j=0; j<count; j++)
                        wordOptions.push(m.unigram[count][word]);
        }

        // randomly select word and add to tweet array
        var randWord = wordOptions[Math.floor(Math.random() * wordOptions.length)];
        tweet.push(randWord);
    }

    return tweet;
}

// keeps generating tweet until it satisfies all the conditions
// the handler gets called it we successfully find a tweet,
// otherwise, it will keep recursing
function recurseTweet(m, titles, descriptions, handler) {
    if (recurseCounter > 10) {
        recurseCounter = 0;
        writeLog("max recusion reached - nothing will be tweeted");
        return;
    }
    recurseCounter++;

    var tweet = generateTweet(m, titles);
    //printTweet(tweet, "CURRENT");
    
    var entities = [];
    async.series([
        function(callback) {
            // check that its longer than 4 words but less than 12
            if (tweet.length <= MIN_WORDS || tweet.length >= MAX_WORDS) {
                callback(null, false);
                return;
            }

            // check that we have less than 140 characters
            var totalString = ""; 
            for (var word in tweet)
                totalString = totalString + tweet[word] + " ";
            if (totalString.length >= 140) {
                callback(null, false);
                return;
            }

            // check if duplicate exists to generate a new tweet
            if (hasDuplicate(tweet, titles) || hasDuplicate(tweet, descriptions)) {
                callback(null, false);
                return;
            }

            callback(null, true);
            return;
        },
        function(callback) {
            request.post({
                headers: {'content-type': 'application/x-www-form-urlencoded'}
              , url: 'http://access.alchemyapi.com/calls/text/TextGetRankedNamedEntities' 
                +'?apikey='+alchemyKey
                +'&text='+makeSentence(tweet)
                +'&outputMode=json'
            }, function(err, response, body) {
                if (err) { handleError(err, "ERROR with alchemy"); return; }
                if (body.toString().charAt(0) === '<') {
                    handleError(null, "ERROR with alchemy, result is in xml");
                    callback(null, false);
                    return;
                }
                entities = JSON.parse(body).entities;
                if (entities !== null)
                    if (entities.length > 0) {
                        var hasCeleb = false;
                        for (var i in entities)
                            if (entities[i].type == "Person") {
                                hasCeleb = true; 
                                break;
                            }
                        callback(null, hasCeleb ? true : false);
                    } else 
                        callback(null, false);
            });    
        }
    ], function(err, results) {
        if (results[0] && results[1]) {
            recurseCounter = 0;
            handler(tweet, entities);
        } else 
            recurseTweet(m, titles, descriptions, processTweet);
    });
};

// a is either an array of titles or descriptions to check against for duplicates
function hasDuplicate(tweet, a) {
    for (var i=0; i<a.length; i++) {
        var b= a[i].match(/\S+/g);
        if (b.length === tweet.length) {
            var count = tweet.length;
            for (var j=0; j<tweet.length; j++) 
                for (var k=0; k<b.length; k++) 
                    if (b[k] == tweet[j])
                        count--;
            if (count <= DUPLICATE_TOLERANCE) {
                //printTweet(tweet, "DUPLICATE");
                return true;
            }
        }
    }
    return false;
};


function makeSentence(tweet) {
    var t = "";
    for (var w in tweet)
        t = t + tweet[w] + " ";
    return t;
};

function printTweet(tweet, add) {
    var t = "";
    for (var w in tweet)
        t = t + tweet[w] + " ";
    var t = add != null ? add+" : "+t : t;
    console.log(t);
};

function getTweetLength(titles) {
    // randomly selects a title and returns its length 
    title = titles[Math.floor(Math.random() * titles.length)];
    if (title != null)
        return title.match(/\S+/g).length; 
    else
        return null;
};

function getFirstWord(m, titles) {
    // Option 1: select random first word of title
    title = titles[Math.floor(Math.random() * titles.length)];
    if (title != null)
        return title.match(/\S+/g)[0];
    else
        return titles[0].match(/\S+/g)[0];
    
    // Option 2: pick random key and check that its greater than 4 letters
    /*
    var counter = 0;
    while (true) {
        var firstWord = pickRandomKey(m.bigram);
        if (firstWord != null) {
            if (firstWord.length >= 4 && // check that word is longer than 4 letters 
                firstWord.charAt(0) == firstWord.charAt(0).toUpperCase()) // check is-capitalized
                return firstWord;
            if (counter > 9999) // ERROR, cannot find word that is greater than 4 characters
                return null;
        } else 
            return null;
    }
    */
};

function pickRandomKey(obj) {
    var result;
    var count = 0;
    for (var key in obj)
        if (Math.random() < 1/++count)
            result = key;
    return result;
};

function handleError(err, print) {
    if (err != null) {
        console.error('response status: ', err.statusCode);
        console.error('data: ', err.data);
        fs.appendFile('./tweet_log', 'response status: ' + err.statusCode);
        fs.appendFile('./tweet_log', 'data: ' + err.data);
    }
    console.log(print);
    fs.appendFile('./tweet_log', print);

};

function writeLog(print) {
    fs.appendFile('./tweet_log', print);
    //console.log(print);
};

