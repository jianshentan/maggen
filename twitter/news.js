var request = require("request");

/*
 * using USA Today's API
 * develop.usatoday.com
 */
var News = module.exports = function() {
    this.descriptions = [];
    this.titles = [];
    this.requestCount = 0;
    this.totalRequests = 2;
    this.success = true;

    var moviePath = "http://api.usatoday.com/open/articles/topnews/movies?count=100&days=0&page=0&encoding=json&api_key=e4uyadjf4tyr2ca4p4c7rsr9";
    var peoplePath = "http://api.usatoday.com/open/articles/topnews/people?count=100&days=0&page=0&encoding=json&api_key=e4uyadjf4tyr2ca4p4c7rsr9";

    var NewsObject = this;
    var handler = function(err, res, body) {
        if (err == null) {
            var content = JSON.parse(res.body).stories;

            // OPTION 1: randomly select 3 entries to use in corpus
            /*
            for (var i=0; i<3; i++) {
                if (typeof content !== "undefined") { 
                    var rand = Math.floor(Math.random() * content.length);
                    if (typeof content[rand] !== "undefined") {
                        NewsObject.descriptions.push(content[rand].description);
                        NewsObject.titles.push(content[rand].title);
                    }
                } else 
                    i--;
            }
            */

            // OPTION 2: use all 100 entries in corpus
            for (var i=0; i<100; i++) {
                if (typeof content !== "undefined" && typeof content[i] !== "undefined") {
                    NewsObject.descriptions.push(content[i].description);
                    NewsObject.titles.push(content[i].title);
                }
            }
        } else {
            console.error("ERROR: could not make request to usatoday's api", err);
            NewsObject.success = false;
        }
        NewsObject.requestCount = NewsObject.requestCount + 1;
    };

    request(peoplePath, handler);
    request(moviePath, handler);
};

News.prototype.getTitles = function() {
    return this.titles;
};

News.prototype.getDescriptions = function() {
    return this.descriptions;
};

/*
var N = new News();
setTimeout(function() {
    var titles = N.getTitles();
    console.log("settimeout: " + titles.length);
    if (titles != null) 
        for(var i=0; i<titles.length; i++) 
            console.log(titles[i]);
}, 10000);
*/
