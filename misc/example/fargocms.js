const myProductName = "fargoCmsServer", myVersion = "0.40q";  

const fargocms = require ("fargocms");
const davehttp = require ("davehttp"); 
const utils = require ("daveutils");

var namedOutlineCache = new Object ();

var config = {
	publicUrl: undefined,
	port: 5378
	};

function getUrlFromName (name, callback) {
	var now = new Date ();
	if (name == "docs") { //hack
		callback ("http://storage.littleoutliner.com/users/davewiner/electric/fargoDocs.opml");
		}
	else {
		if (namedOutlineCache [name] !== undefined) {
			var cacheElement = namedOutlineCache [name];
			cacheElement.ctAccesses++;
			cacheElement.whenLastAccess = now;
			callback (cacheElement.opmlUrl);
			}
		else {
			var url = "http://beta.fargo.io/data/names/" + name + ".json";
			console.log ("getUrlFromName: url == " + url);
			fargocms.httpRequest (url, function (err, response, jsontext) {
				if (!err && (response.statusCode == 200)) {
					var jstruct = JSON.parse (jsontext);
					namedOutlineCache [name] = {
						opmlUrl: jstruct.opmlUrl,
						ctAccesses: 0,
						whenLastAccess: now
						}
					callback (jstruct.opmlUrl);
					}
				else {
					callback (undefined);
					}
				});
			}
		}
	}

fargocms.init (config, function () {
	davehttp.start (config, function (theRequest) {
		var outlineName = utils.stringNthField (theRequest.path, "/", 2);
		if (outlineName.length == 0) {
			theRequest.httpReturn (404, "text/html", "Can't process the request because no outline name was specified in the URL.");
			}
		else {
			var path = utils.stringDelete (theRequest.path, 1, outlineName.length + 1);
			getUrlFromName (outlineName, function (opmlUrl) {
				if (opmlUrl === undefined) {
					theRequest.httpReturn (404, "text/html", "Can't process the request because there is no outline named " + outlineName + ".");
					}
				else {
					
					config.baseUrl = "http://fargocms.com/" + outlineName + "/";
					
					fargocms.render (config, opmlUrl, path, function (htmltext) {
						theRequest.httpReturn (200, "text/html", htmltext);
						});
					}
				});
			}
		});
	});
