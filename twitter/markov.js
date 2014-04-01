var Markov = module.exports = function(titles, descriptions) {
    var source = buildStringFromStringArray(titles) + buildStringFromStringArray(descriptions);
    //console.log(source);

    this.unigram = this.buildUnigram(source);
    this.bigram = this.buildBigram(source);
    
    //console.log(this.unigram);
};

// source is of type string
Markov.prototype.buildUnigram = function(source) {
    var unigram = {};
    var unigramBuilder = {};
    var words = source.split(/[ ,]+/);

    for (var w in words) {
        //var word = words[w].replace(/["']/g, ""); // remove single and double quotation marks
        if (checkValid(words[w]))
            unigramBuilder[words[w]] = unigramBuilder[words[w]] == null ? 
                1 : unigramBuilder[words[w]] + 1;
    }

    for (var key in unigramBuilder) {
        var count = unigramBuilder[key];
        if (typeof unigram[count] === "undefined") 
            unigram[count] = [key];
        else 
            unigram[count].push(key);
    }

    return unigram;
};

// source is of type string
Markov.prototype.buildBigram = function(source) {
    var bigram = {};
    var bigramBuilder = {};
    var sentences = source.match( /[^\.!\?]+[\.!\?]+/g );

    for (var s in sentences) {
        var sentence = sentences[s].match(/\S+/g);
        for (var i=0; i<sentence.length-1; i++) {
            if (checkValid(sentence[i]))
                if (typeof bigramBuilder[sentence[i]] === "undefined") {
                    bigramBuilder[sentence[i]] = {};
                    bigramBuilder[sentence[i]][sentence[i+1]] = 1;
                } else {
                    var obj = bigramBuilder[sentence[i]];
                    if (typeof obj[sentence[i+1]] === "undefined")
                        obj[sentence[i+1]] = 1;
                    else 
                        obj[sentence[i+1]] = obj[sentence[i+1]] + 1;
                }
        }
    }

    for (var word in bigramBuilder) {
        var data = {};
        for (var key in bigramBuilder[word]) {
            var count = bigramBuilder[word][key];
            if (typeof data[count] === "undefined") {
                data[count] = [];
                data[count].push(key);
            } else 
                data[count].push(key);

        }
        bigram[word] = data;
    }

    return bigram;
};

function buildStringFromStringArray(array) {
    var ret = "";
    for (var i=0; i<array.length; i++) {
        var k = (array[i].charAt(array[i].length-1) == '.' ||
                 array[i].charAt(array[i].length-1) == '?' ||
                 array[i].charAt(array[i].length-1) == '!' ) ? " " : ". ";
        ret = ret + array[i] + k;
    }
    return ret;
};

function checkValid(word) {
    var invalidWords = ["...", "Mr.", "Mrs."];
    for (var i in invalidWords)
        if (invalidWords[i] == word)
            return false;
    return true;
};
