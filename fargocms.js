const myProductName = "fargocms", myVersion = "0.4.1"; 

exports.init = init;
exports.render = render;

const utils = require ("daveutils");
const request = require ("request"); 
const marked = require ("marked");
const mime = require ("mime"); 
const md5 = require ("md5");
const opmlToJs = require ("opmltojs");
const fs = require ("fs");
const emoji = require ("node-emoji"); 
const strftime = require ("strftime"); 

//porting helpers, might factor out at some point -- 6/25/17 by DW
	const string = {
		filledString: utils.filledString,
		delete: utils.stringDelete,
		insert: utils.stringInsert,
		countFields: utils.stringCountFields,
		lower: utils.stringLower,
		upper: utils.stringUpper,
		nthField: utils.stringNthField
		};
	var appPrefs = {
		authorTwitterAccount: "",
		authorFacebookAccount: "",
		authorUrlProfile: "",
		cmsFileSuffix: ".html",
		cmsDefaultFilename: "index.html"
		};
	
	var vendor = {
		write: fs.writeFile
		};
	
	function getNumber (val) { //1/4/14 by DW
		switch (typeof (val)) {
			case "string":
				if (string.lower (val) == "infinity") {
					return (infinity);
					}
				break;
			case "number":
				return (val);
			}
		val = Number (val);
		if (isNaN (val)) {
			val = 0;
			}
		return (val);
		}

var cmsVersion = "0.57";
var cmsGlobalPrefs;
var cmsGlobalDavePrefs;
var urlsJsonFilePath = "#prefs/urls.json";
var defaultNameAtt = "index"; //if there's an object with this name att, don't auto-generate the default index file
var defaultTemplate = "outline";
var macroStart = "<" + "%", macroEnd = "%" + ">"; 
var lineEnding = "\r\n";
var cmsNodeStackCache = new Array ();
var flCmsStarted = false;
var segmentTimes = [];
var flPackagesEnabled = true, flPingPackagesServer = true;
var hostingFoldername = "#hosting/";
var flCmsRenderBarCursor = false, flCmsRenderAllPages = false, flCmsRenderSubOutline = false; //globals for background tasks
var flCmsGenNameAtts = false, cmsTabForRender, bchForRenderBarCursor; //globals for background tasks
var embedCache = {}; //6/26/14 by DW

var config = {
	urlDavePrefs: "http://fargo.io/cms/globalPrefs.opml", 
	cmsPrefsOpmlPath: "cmsPrefs.opml", 
	urlTwitterEmbedServer: "http://twitter.happyfriends.camp/"
	};

function httpRequest (url, callback) {
	var options = {
		url: url,
		jar: true, //"remember cookies for future use"
		maxRedirects: 5,
		headers: {
			"User-Agent": myProductName + " v" + myVersion
			}
		};
	request (options, callback);
	}
function httpRequestOpml (url, callback) {
	httpRequest (url, function (err, response, data) {
		if (err) {
			console.log ("httpRequestOpml: url == " + url + ", err.message == " + err.message);
			callback (undefined);
			}
		else {
			callback (data);
			}
		});
	}
function emojiProcess (s) {
	return (emoji.emojify (s));
	}
function hotUpText (s, url) {
	
	if (url == undefined) { //makes it easier to call -- 3/14/14 by DW
		return (s);
		}
	
	function linkit (s) {
		return ("<a href=\"" + url + "\" target=\"_blank\">" + s + "</a>");
		}
	var ixleft = s.indexOf ("["), ixright = s.indexOf ("]");
	if ((ixleft == -1) || (ixright == -1)) {
		return (linkit (s));
		}
	if (ixright < ixleft) {
		return (linkit (s));
		}
	
	var linktext = s.substr (ixleft + 1, ixright - ixleft - 1); //string.mid (s, ixleft, ixright - ixleft + 1);
	linktext = "<a href=\"" + url + "\" target=\"_blank\">" + linktext + "</a>";
	
	var leftpart = s.substr (0, ixleft);
	var rightpart = s.substr (ixright + 1, s.length);
	s = leftpart + linktext + rightpart;
	return (s);
	}

//segment times
	var segmentTimes = [];
	
	function addSegmentTime (name, lasttime) {
		var now = new Date ();
		if (lasttime == undefined) {
			lasttime = now;
			}
		for (var i = 0; i < segmentTimes.length; i++) {
			if (segmentTimes [i].name == name) {
				segmentTimes [i].time += now - lasttime;
				return (now);
				}
			}
		var obj = new Object ();
		obj.name = name;
		obj.time = now - lasttime;
		segmentTimes [segmentTimes.length] = obj;
		return (now);
		}
	
//packages -- 1/1/14 by DW
	function addToPackage (package, path, htmltext) {
		if (flPackagesEnabled) {
			var obj = new Object ();
			obj.path = path;
			obj.htmltext = htmltext;
			package [package.length] = obj;
			}
		}
	function writePackage (tab, package) {
		var urlPackagesServer = "http://" + cmsGetPublishServer () + "/pingPackage";
		
		if (flPackagesEnabled) {
			var idoutliner = "#" + tab.idOutline;
			var headers = $(idoutliner).concord ().op.getHeaders ();
			if (headers.link == undefined) {
				console.log ("writePackage: can't ping because the tab is not a named outline.");
				return;
				}
			
			var s = "";  //serialize the package -- not using JSON because of encoding issues
			for (var i = 0; i < package.length; i++) {
				s += "\n<[{~#--- " + package [i].path + "\n"; //ROTFL
				s += package [i].htmltext;
				}
			if (s.length == 0) {
				s = " ";
				}
			
			var f = hostingFoldername + cmsGetOutlineName (tab) + ".pack";
			vendor.write (f, s, function (metadata) {
				if (headers.linkHosting == undefined) {
					vendor.share (f, function (urlShared) {
						tab.urlHosting = urlShared;
						});
					}
				console.log ("writePackage: wrote " + s.length + " chars to " + f + ".");
				if (flPingPackagesServer) {
					console.log ("writePackage: " + urlPackagesServer + "?link=" + encodeURIComponent (headers.link)); //5/11/15 by DW
					var jxhr = $.ajax ({
						url: urlPackagesServer + "?link=" + encodeURIComponent (headers.link),
						dataType: "jsonp",
						jsonpCallback : "getData",
						timeout: 30000
						})
					.success (function (data, status, xhr) {
						console.log ("writePackage: ping accepted by server.");
						})
					.error (function (status, textStatus, errorThrown) {
						console.log ("writePackage: error from server on ping \"" + textStatus + "\".");
						});
					}
				});
			}
		}
	function cmsCheckLinkHosting () { //1/2/14 by DW
		var headers = getActiveHeaders ();
		if (headers.link != undefined) {
			if (true) { //(string.endsWith (headers.link, "smallpict.com/")) {
				var headers = getActiveHeaders ();
				if (headers.linkHosting == undefined) {
					var f = hostingFoldername + cmsGetOutlineName (getActiveTab ()) + ".pack";
					vendor.write (f, " ", function (metadata) {
						vendor.share (f, function (urlShared) {
							headers.linkHosting = urlShared;
							setActiveHeaders (headers);
							console.log ("cmsCheckTabHostingLink: set \"linkHosting\" header to " + headers.linkHosting + ".");
							});
						});
					}
				}
			}
		}
function getEmbeddedTweet (id) { //6/26/14 by DW
	return ("");
	if (embedCache [id] != undefined) {
		return (embedCache [id]);
		}
	else {
		var jsontext = $.ajax ({ 
			url:  config.urlTwitterEmbedServer + "getembedcode?id=" + encodeURIComponent (id),
			async: false,
			dataType: "text" , 
			timeout: 30000 
			}).responseText;
		var struct = JSON.parse (jsontext);
		embedCache [id] = struct.html; 
		return (struct.html);
		}
	}
function getCanonicalName (text)  { 
	var s = "", ch, flNextUpper = false;
	text = utils.stripMarkup (text); //6/30/13 by DW;
	for (var i = 0; i < text.length; i++)  { 
		ch = text [i];
		if (utils.isAlpha (ch) || utils.isNumeric (ch))  { 
			if (flNextUpper)  { 
				ch = ch.toUpperCase ();
				flNextUpper = false;
				}
			else  { 
				ch = ch.toLowerCase ();
				}
			s += ch;
			}
		else  { 
			if (ch == ' ')  { 
				flNextUpper = true;
				}
			}
		}
	return (s);
	}
function isPoundItemTableName (name) {
	switch (utils.trimWhitespace (utils.stringLower (name))) {
		case "glossary":
		case "templates":
		case "finalfilter": //12/8/13 by DW
		case "macros": //12/16/13 by DW
		case "style": //1/4/14 by DW
		case "menus":
			return (true);
		}
	return (false);
	}
function isPoundItem (s) { //#name "value"
	if (s.length > 0) {
		if (s [0] == "#") {
			s = utils.stringDelete (s, 1, 1);
			for (var i = 0; i < s.length; i++) {
				if (s [i] == " ") {
					s = utils.stringDelete (s, 1, i);
					s = utils.trimWhitespace (s);
					if (s.length >= 2) {
						if ((s [0] == "\"") && (s [s.length - 1] == "\"")) {
							return (true);
							}
						}
					break;
					}
				}
			//if it's something like #glossary, return true
				if (isPoundItemTableName (s)) {
					return (true);
					}
			}
		}
	return (false);
	}
function textOrTweet (adrx) { //6/26/14 by DW 
	if (xmlGetAttribute (adrx, "type") == "tweet") {
		return (getEmbeddedTweet (xmlGetAttribute (adrx, "tweetId"))); //it's synchronous, don't worry! ;-)
		}
	else {
		return (xmlGetTextAtt (adrx));
		}
	}
function xmlProcessMarkdown (s, flReturnDiv) {
	if (flReturnDiv === undefined) {
		flReturnDiv = true;
		}
	
	var ch = String.fromCharCode (8), magicstring = ch + ch + ch;
	s = utils.replaceAll (s, "<%", magicstring);
	s = marked (s);
	s = utils.replaceAll (s, magicstring, "<%");
	
	if (flReturnDiv) {
		return ("<div class=\"divFargoMarkdown\" id=\"idFargoMarkdown\">" + s + "</div>");
		}
	else {
		return (s); 
		}
	}
function xmlGetAttribute (adrx, name) {
	return (adrx [name]);
	}
function xmlGetTextAtt (adrx) {
	var s = xmlGetAttribute (adrx, "text");
	if (s == undefined) {
		s = "";
		}
	return (s);
	}
function xmlIsComment (adrx) {
	return (xmlGetAttribute (adrx, "isComment") == "true");
	}
function xmlGetNodeName (adrx) {
	var name = xmlGetAttribute (adrx, "name");
	if (name != undefined) {
		return (name);
		}
	return (getCanonicalName (xmlGetTextAtt (adrx)));
	}
function xmlHasSubs (adrx) {
	return (adrx.subs !== undefined);
	};
function xmlSetAttribute (adrx, name, value) {
	adrx [name] = value;
	}
function xmlDeleteAttribute (adrx, name) {
	delete adrx [name];
	}
function xmlGetDivWithData (adrx, divname) { //3/23/14 by DW
	var s = "<div class=\"" + divname + "\" ";
	for (x in adrx) {
		var name = utils.stringLower (x); //data atts are unicase
		switch (name) {
			case "text": case "created": case "name":
				break; 
			default:
				s += "data-" + name + "=\"" + adrx [x] + "\" ";
				break;
			}
		}
	return (s + ">");
	}
function xmlGetPermalinkValue (when) { //3/11/14 by DW
	var num = Number (when), name;
	if (num < 0) {
		num = -num;
		}
	name = "a" + (num / 1000);
	return (name);
	}
function xmlExpandInclude (adrx) { //6/24/17 by DW -- disabled until we figure out what to do
	}
function xmlVisit (adrx, callback, level, path) {
	if (level === undefined) {
		level = 0;
		}
	if (path === undefined) {
		path = "";
		}
	
	if (adrx.subs !== undefined) {
		for (var i = 0; i < adrx.subs.length; i++) {
			var sub = adrx.subs [i], flvisitsubs = true,  name = xmlGetNodeName (sub);
			xmlExpandInclude (sub);
			if (callback !== undefined) {
				if (!callback (sub, level, path + name)) {
					flvisitsubs = false;
					}
				}
			if (flvisitsubs) {
				if (!xmlVisit (sub, callback, level + 1, path + name + "/")) {
					return (false);
					}
				}
			}
		}
	
	return (true);
	}
function xmlOneLevelVisit (adrx, callback) {
	for (var i = 0; i < adrx.subs.length; i++) {
		var sub = adrx.subs [i];
		xmlExpandInclude (sub);
		if (callback !== undefined) {
			if (!callback (sub)) {
				return (false);
				}
			}
		}
	return (true);
	}
function xmlGetSub1 (adrx) {
	var sub1;
	xmlOneLevelVisit (adrx, function (adrx) {
		if (!xmlIsComment (adrx)) {
			sub1 = adrx;
			return (false); 
			}
		return (true); 
		});
	return (sub1);
	}
function xmlGetSubText (adrx) {
	var htmltext = "";
	xmlVisit (adrx, function (adrx, level) {
		var textatt = textOrTweet (adrx); //6/27/14 by DW
		if (xmlIsComment (adrx) || isPoundItem (textatt)) {
			return (false);
			}
		htmltext += utils.filledString ("\t", level) + textatt + lineEnding;
		return (true);
		});
	return (htmltext);
	}
function xmlGatherPoundItems (adrx, theTable) {
	var parseItem = function (adrx) {
		if (!xmlIsComment (adrx)) {
			var s = xmlGetAttribute (adrx, "text");
			if (s.length > 0) {
				if (s [0] == "#") {
					var field1 = utils.stringNthField (s, " ", 1);
					var namepart = utils.stringDelete (utils.trimWhitespace (field1), 1, 1);
					if (namepart.length > 0) {
						if (xmlHasSubs (adrx)) { //process #templates, #glossary, etc.
							theTable [namepart] = new Object ();
							xmlOneLevelVisit (adrx, function (adrx) {
								if (!xmlIsComment (adrx)) {
									var namesub = xmlGetAttribute (adrx, "text");
									switch (namepart) {
										case "menus":
											theTable [namepart] [namesub] = adrx;
											break
										case "prefs":
											parseItem (adrx);
											break;
										case "glossary": //1/8/14 by DW
											var subtext = xmlGetSubText (adrx, false);
											if (utils.endsWith (subtext, lineEnding)) {
												subtext = utils.stringMid (subtext, 1, subtext.length - lineEnding.length);
												}
											theTable [namepart] [namesub] = subtext;
											break;
										default:
											theTable [namepart] [namesub] = xmlGetSubText (adrx, false);
										}
									}
								return (true);
								});
							}
						else {
							var valuepart = utils.trimWhitespace (utils.stringDelete (s, 1, field1.length));
							if (valuepart.length >= 2) {
								if ((valuepart [0] == "\"") && (valuepart [valuepart.length - 1] == "\"")) { //first and last chars must be double-quote
									valuepart = utils.stringDelete (valuepart, 1, 1);
									valuepart = utils.stringDelete (valuepart, valuepart.length, 1);
									theTable [namepart] = valuepart;
									}
								}
							}
						}
					}
				}
			}
		}
	xmlOneLevelVisit (adrx, function (adrx) {
		parseItem (adrx);
		return (true);
		});
	
	}
function xmlGetNodeNameProp (adrx) { //12/10/13 by DW
	if (adrx === undefined) { //hit the top of the outline structure
		return ("body");
		}
	return ("outline");
	}
function xmlGetParent (adrx) { //3/4/14 by DW
	return (adrx.parent);
	}
function xmlNodeIsContent (adrx) { //12/2/13 by DW
	return ((!xmlIsComment (adrx)) && (!isPoundItem (xmlGetTextAtt (adrx))));
	}
function getXstuctBody (xstruct) {
	return (xstruct.opml.body);
	}
function xmlGatherAttributes (adrx, theTable) {
	utils.copyScalars (adrx, theTable);
	}
function xmlGetAddress (adrx, name) {
	return (adrx [name]);
	}
function xmlGetImgAtt (adrx) { //3/9/14 by DW
	var imgatt = xmlGetAttribute (adrx, "img"), img = "";
	if (imgatt != undefined) {
		var urlatt = xmlGetAttribute (adrx, "url");
		img = "<img style=\"float: right; margin-left: 25px; margin-top: 15px; margin-right: 15px; margin-bottom: 15px;\" src=\"" + imgatt + "\">";
		if (urlatt != undefined) {
			img = "<a href=\"" + urlatt + "\" target=\"_blank\">" + img + "</a>"
			}
		img += lineEnding;
		}
	return (img);
	}
function xmlGetStoryMarkdownText (adrx, ctLineEndings) { 
	var htmltext = "";
	xmlVisit (adrx, function (adrx, level) {
		var textatt = xmlGetTextAtt (adrx), urlatt = xmlGetAttribute (adrx, "url"), leadingtext = "", img = xmlGetImgAtt (adrx);
		
		if (xmlIsComment (adrx) || isPoundItem (textatt)) {
			return (false);
			}
		
		if (level > 0) {
			leadingtext = string.filledString (" ", level) + "- ";
			}
		
		//handle "link" type -- 12/5/13 by DW
			var typeatt = xmlGetAttribute (adrx, "type");
			if ((typeatt != undefined) && (urlatt != undefined) && (string.lower (typeatt) == "link")) {
				textatt = hotUpText (textatt, urlatt);
				}
		//handle "idea" type -- 3/13/14 by DW
			if ((typeatt != undefined) && (urlatt != undefined) && (string.lower (typeatt) == "idea")) {
				textatt = hotUpText (textatt, urlatt);
				}
		//handle "tweet" type -- 6/26/14 by DW
			if (typeatt == "tweet") {
				textatt = getEmbeddedTweet (xmlGetAttribute (adrx, "tweetId")); //it's synchronous, don't worry! ;-)
				}
		
		if ((textatt.length > 0) && (textatt [0] == "#")) { //11/9/13 by DW
			htmltext += img + leadingtext + textatt + lineEnding;
			}
		else {
			htmltext += img + leadingtext + textatt + string.filledString (lineEnding, ctLineEndings);
			}
		
		return (true);
		});
	return (htmltext);
	}
function xmlIsDocumentNode (adrx) {
	var type = xmlGetAttribute (adrx, "type");
	return ((type != undefined) && (type != "include") && (type != "link") && (type != "tweet"));
	}
function xmlHasSubDocs (adrx) { //1/10/14 by DW -- return true if the node has any subs that are document nodes
	var flhassubdocs = false;
	xmlVisit (adrx, function (adrx, level, path) {
		if (flhassubdocs) { //unwind levels of recursion
			return (false);
			}
		if (xmlIsComment (adrx) || isPoundItem (xmlGetTextAtt (adrx))) { 
			return (false);
			}
		if (xmlIsDocumentNode (adrx)) {
			flhassubdocs = true;
			return (false); 
			}
		return (true);
		});
	return (flhassubdocs);
	}
function xmlGetMenuHtml (pagetable, adrbody, adrx) {
	var htmltext = "", indentlevel = 0, navbarclass = "navbar-static-top";
	var add = function (s) {
		htmltext += string.filledString ("\t", indentlevel) + s + lineEnding;
		}
	var gettextatt = function (adrx) {
		return (xmlGetAttribute (adrx, "text"));
		}
	var addmenuitem = function (adrx) {
		var textatt = gettextatt (adrx);
		if (textatt == "-") {
			add ("<li class=\"divider\"></li>");
			}
		else {
			var typeatt = xmlGetAttribute (adrx, "type"), urlatt = xmlGetAttribute (adrx, "url");
			if ((typeatt == "link") && (urlatt != undefined)) {
				add ("<li><a href=\"" + urlatt + "\" target=\"_blank\">" + textatt + "</a></li>");
				}
			else {
				add ("<li>" + textatt + "</li>");
				}
			}
		}
	var adddropdownhead = function (adrx) {
		add ("<li class=\"dropdown\"><a href=\"#\" class=\"dropdown-toggle\" data-toggle=\"dropdown\">" + gettextatt (adrx) + "&nbsp;<b class=\"caret\"></b></a>"); indentlevel++
		}
	var adrwholemenu = xmlGetSub1 (adrx);
	var menutitle = xmlGetAttribute (adrwholemenu, "text");
	add ("");
	
	if (utils.getBoolean (pagetable.flFixedMenu)) { //3/7/14 by DW
		navbarclass = "navbar-fixed-top";
		}
	
	add ("<div class=\"navbar " + navbarclass + "\" id=\"idFargoNavbar\">"); indentlevel++;
	add ("<div class=\"navbar-inner\">"); indentlevel++;
	add ("<div class=\"navbar-container\">"); indentlevel++; //12/21/13 by DW
	
	add ("<a class=\"brand\" href=\"" + macroStart + "opmlLink" + macroEnd + "\">" + menutitle + "</a>")
	add ("<ul class=\"nav\">"); indentlevel++
	
	//add each top-level menu
		xmlOneLevelVisit (adrwholemenu, function (adrx) {
			if (xmlHasSubs (adrx)) {
				adddropdownhead (adrx);
				add ("<ul class=\"dropdown-menu\">"); indentlevel++
				xmlOneLevelVisit (adrx, function (adrx) {
					addmenuitem (adrx);
					return (true); //keep visiting
					});
				add ("</ul>"); indentlevel--
				add ("</li>"); indentlevel--
				}
			else {
				if (xmlGetAttribute (adrx, "type") == "stories") { //12/24/13 by DW
					adddropdownhead (adrx);
					var s = xmlGetStoryList (pagetable, adrbody); //12/30/13 by DW
					
					s = s.replace ("<ul>", "<ul class=\"dropdown-menu\">");
					add (s);
					}
				else {
					addmenuitem (adrx);
					}
				}
			return (true); //keep visiting
			});
	
	add ("</ul>"); indentlevel--;
	add ("</div>"); indentlevel--;
	add ("</div>"); indentlevel--;
	add ("</div>"); indentlevel--;
	
	return (htmltext);
	}
function xmlGetStream (pagetable, adrx) { //3/4/14 by DW
	var htmltext = "", indentlevel = 0, flNotFirstDay = false, ecId = 0, ctdays = 0, dayurl, streamVersion = 1;
	function add (s) {
		htmltext += string.filledString ("\t", indentlevel) + s + lineEnding;
		}
	function createdatt (adrx) {
		var s = xmlGetAttribute (adrx, "created");
		if (s == undefined) {
			return (new Date ());
			}
		else {
			return (new Date (s));
			}
		}
	function permalink (adrx, text) {
		var name = xmlGetPermalinkValue (createdatt (adrx));
		return ("<a name=\"" + name + "\"></a>" + text + "<span class=\"spPermalink\"><a href=\"" + dayurl + "#" + name + "\">#</a></span>")
		}
	
	
	function addpgf (adrx, flwedge) {
		var icon = "", text, img = xmlGetImgAtt (adrx);
		if (utils.getBoolean (flwedge)) {
			icon = getIcon (ecId);
			text = expandabletextlink (adrx);
			}
		else {
			var urlatt = xmlGetAttribute (adrx, "url");
			text = textOrTweet (adrx);
			if (urlatt != undefined) {
				text = hotUpText (text, urlatt);
				}
			}
		add ("<p>" + icon + img + permalink (adrx, text) + "</p>" );
		}
	function addsubs (adrx) {
		xmlOneLevelVisit (adrx, function (adrsub) {
			if (xmlHasSubs (adrsub)) {
				addpgf (adrsub, true)
				add ("<div class=\"divLevel\" id=\"idStreamLevel" + ecId + "\">"); indentlevel++
				ecId++;
				addsubs (adrsub)
				add ("</div>"); indentlevel--
				}
			else {
				addpgf (adrsub)
				}
			return (true);
			});
		}
	function expandabletextlink (adrx) {
		return ("<a class=\"aStreamTextLink\" onclick=\"ecStream (" + ecId + ")\">" + textOrTweet (adrx) + "</a>");
		}
	function notcomment (adrx) {
		if (xmlIsComment (adrx)) {
			return (false);
			}
		if (isPoundItem (xmlGetTextAtt (adrx))) {
			return (false);
			}
		return (true);
		}
	function hascalendaricon (adrx) {
		var icon = xmlGetAttribute (adrnomad, "icon");
		return (icon == "calendar");
		}
	function getDayDate (adrday) {
		function getnumber (adrx) {
			return (Number (xmlGetAttribute (adrx, "name")));
			}
		function pad (x) {
			var s = x.toString ();
			if (s.length == 1) {
				s = "0" + s;
				}
			return (s);
			}
		var daynum = getnumber (adrday);
		var adrmonth = xmlGetParent (adrday);
		var monthnum = getnumber (adrmonth);
		var adryear = xmlGetParent (adrmonth);
		var yearnum = getnumber (adryear);
		dayurl = "/" + yearnum + "/" + pad (monthnum) + "/" + pad (daynum) + "/"; //side-effect
		return (new Date (yearnum, monthnum-1, daynum));
		}
	function getIcon (idnum) {
		var clickscript = "onclick=\"ecStream (" + idnum + ")\" ", wedgedir = "right";
		var icon = "<span class=\"divStreamIcon\"><a class=\"aStreamWedgeLink\" " + clickscript + "><i class=\"fa fa-caret-" + wedgedir + "\" id=\"idStreamWedge" + idnum + "\"></i></a></span>";
		return (icon);
		}
	function visitDay (adrday) {
		var formattedDate = cmsFormatDate (getDayDate (adrday),  "%A, %B %e<span class=\"spDateYearPart\">, %Y</span>", "0"); //5/15/14 by DW
		//arrows
			var clickupscript = "onclick=\"clickUpArrow (" + ctdays + ")\" ";
			var clickdownscript = "onclick=\"clickDownArrow (" + ctdays + ")\" ";
			var arrows = "<span class=\"spStreamArrows\"><a class=\"aStreamArrowsLink\" " + clickupscript + "><i class=\"fa fa-arrow-up\" id=\"idStreamUpArrow" + ctdays + "\"></i></a><a class=\"aStreamArrowsLink\" " + clickdownscript + "><i class=\"fa fa-arrow-down\" id=\"idStreamDownArrow" + ctdays + "\"></i></a></span>";
			
			arrows = ""; //feature turned off -- 3/24/14 by DW
		add (xmlGetDivWithData (adrday, "divStreamDay")); indentlevel++; //add a divStreamDay  with the atts of the day node as data- atts on the div
		//look for backgroundImage att, add a child element if present -- only if streamVersion == 1
			if (streamVersion == 1) {
				var imgatt = xmlGetAttribute (adrday, "backgroundImage");
				if (imgatt != undefined) {
					add ("<div class=\"divStreamDayImage\" style=\"background-image: url(" + imgatt + ")\"></div>");
					}
				}
		if (flNotFirstDay) {
			add ("<div class=\"divDaySeparator\"></div>"); add ("");
			}
		add ("<div class=\"divStreamDayText\">"); indentlevel++;
		add ("<div>"); indentlevel++;
		add ("<div class=\"divStreamDayHead\">" + arrows + "<a class=\"aStreamDayLink\" href=\"" + dayurl + "\">" + formattedDate + "</a></div>"); 
		
		xmlOneLevelVisit (adrday, function (adritem) {
			if (notcomment (adritem)) {
				var text = xmlGetTextAtt (adritem);
				if (xmlHasSubs (adritem)) {
					text = expandabletextlink (adritem);
					add ("<div class=\"divStreamSectionHead\">" + getIcon (ecId) + xmlGetImgAtt (adritem) + permalink (adritem, text) + "</div>");
					add ("<div class=\"divLevel\" id=\"idStreamLevel" + ecId + "\">"); indentlevel++
					ecId++;
					addsubs (adritem);
					add ("</div>"); indentlevel--;
					}
				else {
					addpgf (adritem);
					}
				}
			return (true); 
			});
		
		add ("</div>"); indentlevel--;
		add ("</div>"); indentlevel--;
		add ("</div>"); indentlevel--;
		ctdays++;
		}
	function visitMonth (adrmonth, flMaxDaysCheck) {
		var monthnum = Number (xmlGetAttribute (adrmonth, "name"));
		xmlOneLevelVisit (adrmonth, function (adrday) {
			if (notcomment (adrday)) {
				visitDay (adrday);
				flNotFirstDay = true;
				if (flMaxDaysCheck && (ctdays >= pagetable.maxStreamDays)) { //3/21/14 by DW
					return (false);
					}
				}
			return (true); //keep visiting
			});
		}
	function visitYear (adryear) {
		var yearnum = Number (xmlGetAttribute (adryear, "name"));
		xmlOneLevelVisit (adryear, function (adrmonth) {
			if (notcomment (adrmonth)) {
				visitMonth (adrmonth, true);
				if (ctdays >= pagetable.maxStreamDays) { //3/21/14 by DW
					return (false);
					}
				}
			return (true); //keep visiting
			});
		}
	function visitCalendar (adrcal) {
		xmlOneLevelVisit (adrcal, function (adryear) {
			if (notcomment (adryear)) {
				visitYear (adryear);
				}
			return (true); //keep visiting
			});
		}
	
	//set streamVersion -- 5/20/14 by DW
		if (pagetable.streamVersion != undefined) {
			var x = parseInt (pagetable.streamVersion);
			if (!isNaN (x)) {
				streamVersion = x;
				}
			}
	//count levels up to calendar root -- result in ctlevels
		var adrnomad = adrx, ctlevels = 0;
		while (true) {
			if (xmlGetNodeNameProp (adrnomad) == "body") {
				break;
				}
			adrnomad = xmlGetParent (adrnomad);
			ctlevels++;
			}
	//add spacer at top of page to account for fixed navbar, 61 pixels high, when present -- only in version 1 -- 5/20/14 by DW
		if (streamVersion == 1) {
			add ("<div class=\"divStreamTopSpacer\"></div>");
			}
	//do traversal to generate htmltext
		switch (ctlevels) {
			case 0:
				visitCalendar (adrx);
				break;
			case 1:
				visitYear (adrx);
				break;
			case 2:
				visitMonth (adrx, false);
				break;
			case 3:
				visitDay (adrx);
				break;
			default:
				return ("");
			}
	return (htmltext);
	}
function xmlGetIndexPage (pagetable, adrx, ctLevels, adrToOmit) {
	var htmltext = "", indentlevel = 0, lastlevel = 0, ctstories = 0;
	function add (s) {
		htmltext += string.filledString ("\t", indentlevel) + s + lineEnding;
		}
	function getStoryText (pagetable, adrx) {
		var s = xmlGetStoryMarkdownText (adrx, 2);
		s = xmlProcessMarkdown (s, false);
		return ("<div class=\"divFargoStoryText\">" + s + "</div>");
		}
	if (ctLevels == undefined) {
		ctLevels = pagetable.ctLevelsOnIndexPage; //1/3/14 by DW
		}
	add ("<div class=\"divFargoIndex\">"); indentlevel++;
	add ("<ul>"); indentlevel++;
	
	xmlVisit (adrx, function (adrx, level, path) {
		if (ctstories >= pagetable.maxStoriesOnIndexPage) { //12/18/13 by DW
			return (false);
			}
		if ((level + 1) > ctLevels) { //go no deeper -- 11/30/13 by DW (level is 0-based) 
			return (false);
			}
		if ((adrToOmit != undefined) && (adrx == adrToOmit)) { //11/30/13 by DW
			return (false); 
			}
		
		var textatt = xmlGetAttribute (adrx, "text");
		var typeatt = xmlGetAttribute (adrx, "type");
		var nameatt = xmlGetAttribute (adrx, "name"); //1/5/14 by DW
		var flhastype = (typeatt != undefined) && (typeatt != "include");
		
		if (xmlIsComment (adrx) || isPoundItem (textatt)) {
			return (false);
			}
		
		//generate <ul> and </ul> elements
			if (level > lastlevel) {
				add ("<ul>"); indentlevel++;
				indentlevel++;
				}
			else {
				if (level < lastlevel) {
					for (var i = 1; i <= (lastlevel - level); i++) {
						add ("</ul>"); indentlevel--;
						}
					}
				}
			lastlevel = level;
		
		if (flhastype || (nameatt != undefined)) { //1/5/14 by DW
			var flstorytext = utils.getBoolean (pagetable.flStoryTextOnIndexPage), aClass = " class=\"aDocTitleOnIndexPage\" ", liClass = "", mypath;
			if (flhastype && (!xmlHasSubDocs (adrx))) { //1/5/14 by DW & 1/10/14 by DW
				mypath = path + appPrefs.cmsFileSuffix;
				}
			else {
				mypath = path + "/"; //it's an index page
				}
			
			if (!flstorytext) { //a different class for the title -- not as big (assume) -- 12/31/13 by DW
				aClass = " class=\"aDocSmallTitleOnIndexPage\" ";
				liClass = " class=\"liSmallTitleOnIndexPage\" ";
				}
			
			add ("<li" + liClass + "><a " + aClass + " href=\"" + mypath + "\">" + textatt + "</a></li>");
			if (flstorytext) { //12/18/13 by DW
				add (getStoryText (pagetable, adrx));
				if (utils.getBoolean (pagetable.flStoryDateOnIndexPage)) { 
					var createdAtt = xmlGetAttribute (adrx, "created");
					if (createdAtt != undefined) {
						var datestring = cmsFormatDate (createdAtt, pagetable.storyDateFormat, pagetable.siteTimeZone);
						add ("<div class=\"divFargoStoryDate\">"); indentlevel++;
						add ("<span class=\"spFargoStoryLink\"><a href=\"" + mypath + "\"><i class=\"fa fa-star\"></i></a></span>");
						add ("<span class=\"spFargoStoryDate\">" + datestring + "</span>");
						add ("</div>"); indentlevel--;
						}
					}
				ctstories++;
				}
			return (false);
			}
		if (utils.getBoolean (pagetable.flNonDocHeadsOnIndexPage)) { //12/18/13 by DW
			add ("<li>" + textatt + "</li>");
			}
		return (true);
		});
	
	while (indentlevel > 1) {
		add ("</ul>"); indentlevel--;
		}
	
	add ("</div>"); indentlevel--;
	return (htmltext);
	}
function xmlGetBlogHomePage (pagetable, adrbeingrendered) { //1/6/14 by DW
	var htmltext = "", indentlevel = 0, ctstories = 0, namenode = xmlGetNodeName (adrbeingrendered);
	function add (s) {
		htmltext += string.filledString ("\t", indentlevel) + s + lineEnding;
		}
	function getStoryText (pagetable, adrx) {
		var s = xmlGetStoryMarkdownText (adrx, 2);
		s = xmlProcessMarkdown (s, false);
		return (s);
		}
	
	
	add ("<div class=\"divFargoBlogHome\">"); indentlevel++;
	
	xmlVisit (adrbeingrendered, function (adrx, level, path) {
		var textatt = xmlGetAttribute (adrx, "text");
		
		if (ctstories >= pagetable.blogHomeItemCount) {
			return (false);
			}
		if (xmlIsComment (adrx) || isPoundItem (textatt)) {
			return (false);
			}
		
		if (xmlIsDocumentNode (adrx)) {
			var mypath;
			
			//set mypath -- 1/10/14 by DW
				if (xmlHasSubDocs (adrx)) {
					mypath = path + "/";
					}
				else {
					mypath = path + appPrefs.cmsFileSuffix;
					}
			
			add ("<div class=\"divBlogHomeItem\">"); indentlevel++;
			var createdAtt = xmlGetAttribute (adrx, "created");
			add ("<div class=\"divBlogHomeItemTitle\"><a href=\"" + mypath + "\">" + textatt + "</a></div>");
			add (getStoryText (pagetable, adrx));
			if (createdAtt != undefined) {
				var datestring = cmsFormatDate (createdAtt, pagetable.storyDateFormat, pagetable.siteTimeZone);
				add ("<div class=\"divBlogHomeStoryDate\">"); indentlevel++;
				add ("<span class=\"spFargoStoryDate\">" + datestring + "</span>");
				add ("<div class=\"divFargoStoryLink\" style=\"float: left;\"><a href=\"" + mypath + "\"><i class=\"fa fa-star\"></i></a></div>");
				add ("</div>"); indentlevel--;
				}
			add ("</div>"); indentlevel--;
			
			ctstories++;
			}
		
		return (true);
		});
	return (htmltext);
	}

function pushNodeOnStack (adrx, path, stack) {
	var stacktop, flfound = false;
	
	//look for it in the cache
		for (var i = 0; i < cmsNodeStackCache.length; i++) {
			if (cmsNodeStackCache [i].path == path) {
				stacktop = cmsNodeStackCache [i].stacktop;
				cmsNodeStackCache [i].ctUses++; //for debugging
				flfound = true;
				break;
				}
			}
	
	if (!flfound) {
		stacktop = new Object ();
		stacktop.path = path;
		stacktop.adrx = adrx;
		//set up stacktop.mypagetable
			stacktop.mypagetable = new Object ();
			xmlGatherAttributes (adrx, stacktop.mypagetable);
			xmlGatherPoundItems (adrx, stacktop.mypagetable);
		//set stacktop.name
			if (stack.length == 0) {
				stacktop.name = "Home";
				}
			else {
				stacktop.name = xmlGetTextAtt (adrx);
				}
		
		//add it to the cache
			var cacheTop = new Object ();
			cacheTop.path = path;
			cacheTop.ctUses = 0; //for debugging
			cacheTop.stacktop = stacktop;
			cmsNodeStackCache [cmsNodeStackCache.length] = cacheTop;
		}
	
	stack [stack.length] = stacktop;
	}
function initPagetable (tab, xstruct, pagetable) {
	//pagetable.opmlUrl
		if (tab.publicUrl == undefined) {
			pagetable.opmlUrl = "";
			}
		else {
			pagetable.opmlUrl = tab.publicUrl;
			}
	//get head elements from the OPML struct -- 12/12/13 by DW
		var adropml = xmlGetAddress (xstruct, "opml");
		var adrhead = xmlGetAddress (adropml, "head");
		
		
		
		for (x in adrhead) { //6/25/17 by DW -- does what the code above does, in the new context
			var opmlHeadName = "opml" + string.upper (x [0]) + utils.stringMid (x, 2, x.length - 1);
			pagetable [opmlHeadName] = adrhead [x];
			}
		
		if (pagetable.opmlTitle == undefined) {
			pagetable.opmlTitle = "";
			}
		if (pagetable.opmlLink == undefined) {
			pagetable.opmlLink = "";
			}
		if (pagetable.opmlDescription == undefined) {
			pagetable.opmlDescription = "";
			}
		if (pagetable.opmlDateCreated == undefined) {
			pagetable.opmlDateCreated = "";
			}
		if (pagetable.opmlDateModified == undefined) {
			pagetable.opmlDateModified = "";
			}
		if (pagetable.opmlLongTitle == undefined) {
			pagetable.opmlLongTitle = "";
			}
		if (pagetable.opmlOwnerEmail == undefined) {
			pagetable.opmlOwnerEmail = "";
			}
		if (pagetable.opmlOwnerId == undefined) {
			pagetable.opmlOwnerId = "";
			}
		if (pagetable.opmlOwnerName == undefined) {
			pagetable.opmlOwnerName = "";
			}
		if (pagetable.opmlOwnerProfile == undefined) {
			pagetable.opmlOwnerProfile = "";
			}
		if (pagetable.opmlFeed == undefined) {
			pagetable.opmlFeed = "";
			}
		if (pagetable.opmlExpansionState == undefined) {
			pagetable.opmlExpansionState = "";
			}
	pagetable.menuname = "default";
	pagetable.googleAnalyticsID = "";
	pagetable.domain = "";
	pagetable.bootstrapTheme = "readable";
	pagetable.type = undefined;
	pagetable.slogan = utils.getRandomSnarkySlogan (); //11/26/13 by DW
	pagetable.disqusGroupName = "smallpict"; //11/26/13 by DW
	pagetable.siteTimeZone = -4; //12/4/13 by DW
	pagetable.dateFormat = "%A, %B %e, %Y at %l:%M %p";
	pagetable.flIndexPage = false; //12/17/13 by DW
	pagetable.flDisqusComments = true; //12/19/13 by DW
	
	pagetable.flStoryTextOnIndexPage = false; //12/18/13 by DW
	pagetable.flNonDocHeadsOnIndexPage = true //12/18/13 by DW
	pagetable.flStoryDateOnIndexPage = false; //12/18/13 by DW
	pagetable.storyDateFormat = "%D; %R %p"; //12/18/13 by DW
	pagetable.maxStoriesOnIndexPage = 25; //12/18/13 by DW
	pagetable.maxStoryList = 25; //12/19/13 by DW
	pagetable.authorTwitterAccount = appPrefs.authorTwitterAccount; //12/24/13 by DW
	pagetable.authorFacebookAccount = appPrefs.authorFacebookAccount; //12/24/13 by DW
	pagetable.authorProfileUrl = appPrefs.authorUrlProfile; //12/24/13 by DW
	pagetable.titleColor = "white"; //12/24/13 by DW
	pagetable.siteFolder = cmsGetHtmlFolder (tab); //12/27/13 by DW
	pagetable.flProfile = false; //12/28/13 by DW
	pagetable.ctLevelsOnIndexPage = 1; //1/3/14 by DW
	pagetable.blogHomeItemCount = 25; //1/6/14 by DW
	pagetable.flPgfPermaLinks = false; //2/23/14 by DW
	pagetable.flFixedMenu = true; //3/7/14 by DW
	pagetable.maxStreamDays = 14; //3/21/14 by DW
	pagetable.flMarkdown = true; //7/10/14 by DW
	pagetable.leftIndent = 0; //7/12/14 by DW
	
	//initializations for the default site home page -- 12/11/13 by DW
		//pagetable.text
			if (pagetable.opmlLongTitle.length > 0) {
				pagetable.text = pagetable.opmlLongTitle;
				}
			else {
				if (pagetable.opmlTitle.length > 0) {
					pagetable.text = pagetable.opmlTitle;
					}
				else {
					pagetable.text = utils.stringLastField (pagetable.opmlUrl, "/");
					}
				}
		//pagetable.created
			if (pagetable.opmlDateCreated.length > 0) {
				pagetable.created = pagetable.opmlDateCreated;
				}
			else {
				if (pagetable.opmlDateModified.length > 0) {
					pagetable.created = pagetable.opmlDateModified;
					}
				else {
					pagetable.created = new Date ();
					}
				}
		//pagetable.description
			pagetable.description = pagetable.opmlDescription;
	}
function cmsGetHtmlFolder (tab) { //11/23/13 by DW
	return ("html/docs/"); //6/25/17 by DW
	}
function cmsRunScripts (pagetable, scriptname) { //12/8/13 by DW
	var adrscripts = pagetable [scriptname];
	if (adrscripts != undefined) {
		for (var x in adrscripts) {
			try {
				var s = adrscripts [x];
				eval (s);
				}
			catch (err) {
				console.log ("cmsRunScripts, error: " + err.message);
				}
			}
		}
	}
function cmsFormatDate (theDate, dateformat, timezone) {
	try {
		var offset = new Number (timezone);
		var d = new Date (theDate);
		var localTime = d.getTime ();
		var localOffset = d.getTimezoneOffset () *  60000;
		var utc = localTime + localOffset;
		var newTime = utc + (3600000 * offset);
		return (strftime (dateformat, new Date (newTime))); //6/25/17 by DW
		}
	catch (tryerror) {
		return (strftime (dateformat, new Date (theDate))); //6/25/17 by DW
		}
	}
function getCommentHtml (pagetable, groupname, flHidable, createdAtt) {
	var id = "", hidingCode, visibleStyle;
	if (pagetable.opmlUrl != undefined) {
		id += pagetable.opmlUrl;
		}
	//add in a value for "created" 
		if (createdAtt != undefined) { //5/16/14 by DW
			id += createdAtt;
			}
		else {
			if (pagetable.created != undefined) {
				id += pagetable.created;
				}
			}
	//set hidingCode
		if (pagetable.type == "thread") {
			if (flHidable == undefined) {
				flHidable = false;
				}
			}
		else {
			if (pagetable.flCommentsHidable != undefined) {
				if (pagetable.flCommentsHidable == "true") {
					flHidable = true;
					}
				else {
					flHidable = false;
					}
				}
			else {
				if (flHidable == undefined) {
					flHidable = true;
					}
				}
			}
		if (flHidable) { 
			var initialState = "visible";
			hidingCode = "<a onclick=\"showHideComments ()\"><span id=\"idShowHideComments\" style=\"cursor: pointer;\"></span></a>";
			if (pagetable.flCommentsVisible != undefined) {
				if (pagetable.flCommentsVisible == "false") {
					initialState = "hidden";
					}
				}
			visibleStyle = " style=\"visibility: " + initialState + ";\" ";
			}
		else {
			hidingCode = "";
			visibleStyle = "";
			}
	if (id.length > 0) {
		id = "&lt;script>var disqus_identifier = \"" + id + "\";&lt;/script>";
		}
	var code = id + hidingCode + "&lt;div class=\"divDisqusComments\" id=\"idDisqusComments\"" + visibleStyle + ">&lt;div id=\"disqus_thread\">&lt;/div>&lt;/div>&lt;script type=\"text/javascript\" src=\"http://disqus.com/forums/" + groupname + "/embed.js\">&lt;/script>&lt;/div>";
	return (code.replace (/&lt;/g,'<'));
	}
function xmlStoryVisit (adrsummit, adrmustvisit, callback) { //12/28/13 by DW
	var fldone = false;
	xmlVisit (adrsummit, function (adrx, level, path) {
		if (fldone) {
			return (false);
			}
		if (xmlIsComment (adrx) || isPoundItem (xmlGetTextAtt (adrx))) { //12/31/13 by DW
			return (false);
			}
		if (xmlIsDocumentNode (adrx) || (adrx == adrmustvisit)) {
			if (callback != undefined) {
				var name = xmlGetNodeName (this);
				if (!callback (adrx, level, path + name)) {
					fldone = true;
					}
				}
			return (false); //don't visit inside document nodes
			}
		return (true);
		});
	}
function cmsRenderPage (tab, xstruct, path, package) {
	
	function processMacros (pagetable, s) {
		var i = 0;
		
		function icon (name) {
			return ("<i class=\"fa fa-" + name + "\"></i>");
			};
		function includeHTTP (url) {
			return (xmlReadFile (url));
			};
		function version () {
			return (cmsVersion);
			};
		function includeOutliner (opmlurl, font, fontSize, lineHeight, flReader) {
			var s = "", glossName;
			
			if (opmlurl != undefined) {
				opmlurl = opmlurl.replace ("dl.dropbox.com", "dl.dropboxusercontent.com"); //8/7/13 by DW
				opmlurl = opmlurl.replace ("www.dropbox.com", "dl.dropboxusercontent.com"); //8/7/13 by DW
				}
			
			if (font == undefined) {
				font = "Arial";
				}
			if (fontSize == undefined) {
				fontSize = "16";
				}
			if (lineHeight == undefined) {
				lineHeight = "24";
				}
			if (flReader == undefined) {
				flReader = true;
				}
			
			if (flReader) {
				glossName = "outlineEmbedCode";
				}
			else {
				glossName = "outlinerEmbedCode";
				}
			
			if (pagetable.glossary [macroStart + glossName + macroEnd] != undefined) { 
				s = pagetable.glossary [macroStart + glossName + macroEnd];
				if (opmlurl != undefined) {
					s = s.replace (macroStart + "opmlUrl" + macroEnd, opmlurl);
					}
				s = s.replace (macroStart + "font" + macroEnd, font);
				s = s.replace (macroStart + "fontSize" + macroEnd, fontSize);
				s = s.replace (macroStart + "lineHeight" + macroEnd, lineHeight);
				}
			
			return (s);
			};
		function reader (opmlurl, font, fontSize, lineHeight) {
			return (includeOutliner (opmlurl, font, fontSize, lineHeight, true));
			
			};
		function outliner (font, fontSize, lineHeight) { //6/18/14 by DW
			if (font == undefined) {
				font = "Georgia";
				}
			if (fontSize == undefined) {
				fontSize = "18";
				}
			if (lineHeight == undefined) {
				lineHeight = "27";
				}
			return (includeOutliner (undefined, font, fontSize, lineHeight, false));
			}
		function prevNextLinks (iconPrev, iconNext) { //rewrite -- 12/28/13 by DW
			function pathtourl (path) {
				return (pagetable.opmlLink + path + appPrefs.cmsFileSuffix);
				}
			if (iconPrev == undefined) {
				iconPrev = "arrow-left";
				}
			if (iconNext == undefined) {
				iconNext = "arrow-right";
				}
			
			//get prev link
				var adrprev, pathprev, prevlink;
				xmlStoryVisit (adrbody, null, function (adrthis, level, path) {
					if (adrthis == adrx) { //found node we're rendering
						return (false);
						}
					adrprev = adrthis;
					pathprev = path;
					return (true);
					});
				
				if (adrprev != undefined) {
					var urlprev = pathtourl (pathprev);
					var textatt = xmlGetTextAtt (adrprev), title = "";
					if (textatt.length > 0) {
						title = " title=\"" + textatt + "\" ";
						}
					prevLink = "<a href=\"" + urlprev + "\"" + title + "><i class=\"fa fa-" + iconPrev + "\" style=\"color: black\"></i></a>";
					}
				else {
					prevLink = "<i class=\"fa fa-" + iconPrev + "\" style=\"color: silver\"></i>";
					}
				
			//get next link
				var adrnext, pathnext, flfound = false;
				xmlStoryVisit (adrbody, adrx, function (adrthis, level, path) {
					if (flfound) {
						adrnext = adrthis;
						pathnext = path;
						return (false);
						}
					if (adrthis == adrx) { //found node we're rendering
						flfound = true;
						}
					return (true);
					});
				
				if (adrnext != undefined) {
					var urlnext = pathtourl (pathnext);
					var textatt = xmlGetTextAtt (adrnext), title = "";
					if (textatt.length > 0) {
						title = " title=\"" + textatt + "\" ";
						}
					nextLink = "<a href=\"" + urlnext + "\"" + title + "><i class=\"fa fa-" + iconNext + "\" style=\"color: black\"></i></a>";
					}
				else {
					nextLink = "<i class=\"fa fa-" + iconNext + "\" style=\"color: silver\"></i>";
					}
			
			return ("<div class=\"divPrevNextLinks\">" + prevLink + "&nbsp;&nbsp;" + nextLink + "</div>");
			}
		function tableOfContents (ctLevels) {
			if (ctLevels == undefined) {
				ctLevels = 1;
				}
			return (xmlGetIndexPage (pagetable, $(adrx).parent (), ctLevels, adrx));
			}
		function useMenu (menuname) {
			var s;
			if (menuname == undefined) {
				menuname = pagetable.menuname;
				}
			s = xmlGetMenuHtml (pagetable, adrbody, pagetable.menus [menuname]);
			s = utils.multipleReplaceAll (s, pagetable, false, macroStart, macroEnd);
			return (s);
			}
		function menu  () {
			var adrmenu = pagetable.menus [pagetable.menuname], s;
			if (adrmenu == undefined) {
				return ("");
				}
			s = xmlGetMenuHtml (pagetable, adrbody, adrmenu);
			s = utils.multipleReplaceAll (s, pagetable, false, macroStart, macroEnd);
			return (processMacros (pagetable, s));
			}
		function menuAsList  () { //12/21/13 by DW
			var adrmenu = pagetable.menus [pagetable.menuname], s;
			if (adrmenu == undefined) {
				return ("");
				}
			s = xmlGetMenuAsList (pagetable, adrbody, adrmenu);
			s = utils.multipleReplaceAll (s, pagetable, false, macroStart, macroEnd);
			return (processMacros (pagetable, s));
			}
		function breadcrumbs () {
			var s = "<ul id=\"idBreadcrumbList\" class=\"breadcrumb\">";
			var adr, ixlast = stack.length - 2, siteurl = pagetable.opmlLink;
			
			if (utils.endsWith (siteurl, "/")) {
				siteurl = utils.stringMid (siteurl, 1, siteurl.length - 1);
				}
			
			for (var i = 0; i <= ixlast; i++) {
				var stackitem = stack [i], url = siteurl + stackitem.path;
				
				s += "<li><a href=\"" + url + "\">" + stackitem.name + "</a>";
				
				if (i != ixlast) {
					s += "<span class=\"divider\">/</span>";
					}
				else {
					s += "</li>";
					}
				}
			
			
			
			
			return (s + "</ul>\r");
			}
		function byline  () {
			var name = pagetable.opmlOwnerName, url = pagetable.opmlOwnerProfile;
			if (url.length = 0) {
				url = pagetable.opmlLink
				}
			if (url.length = 0) {
				return (name);
				}
			return ("<a href=\"" + url + "\" target=\"_blank\">" + name + "</a>");
			}
		function disqusComments (groupname) {
			if (!utils.getBoolean (pagetable.flDisqusComments)) {
				return ("");
				}
			if (groupname == undefined) {
				groupname = pagetable.disqusGroupName;
				}
			if (groupname == undefined) {
				return ("");
				}
			return (getCommentHtml (pagetable, groupname));
			}
		function rssLink () {
			if (pagetable.opmlFeed.length > 0) {
				return ("<link rel=\"alternate\" type=\"application/rss+xml\" title=\"RSS\" href=\"" + pagetable.opmlFeed + "\" />");
				}
			return ("");
			}
		function slogan () { //12/27/13 by DW
			return (pagetable.slogan);
			}
		function googleAnalytics  (account, domain) {
			var s = 
				"var _gaq = _gaq || []; _gaq.push(['_setAccount', '%%account%%']); _gaq.push(['_setDomainName', '%%domain%%']); _gaq.push(['_trackPageview']); (function() {var ga = document.createElement('script'); ga.type = ";
				s += "'text/javascript'; ga.async = true; ga.src = ('https:' == document.location.protocol ? 'https://ssl' : 'http://www') + '.google-analytics.com/ga.js'; var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(ga, s); })();";
			if (account == undefined) {
				account = pagetable.googleAnalyticsID;
				}
			if (domain == undefined) {
				domain = pagetable.domain;
				}
			if ((account.length == 0) || (domain.length == 0)) {
				return ("");
				}
			s = s.replace ("%%account%%", account);
			s = s.replace ("%%domain%%", domain);
			s = "&lt;script>" + s + "&lt;/script>";
			return (s.replace (/&lt;/g,'<'));
			}
		function formatDate (d, dateformat, timezone) {
			if (d == undefined) {
				d = new Date ();
				}
			if (timezone == undefined) {
				timezone = pagetable.siteTimeZone;
				}
			if (dateformat == undefined) {
				dateformat = pagetable.dateFormat;
				}
			return (cmsFormatDate (d, dateformat, timezone));
			}
		function socialMediaLinks () {
			var htmltext = "", indentlevel = 0;
			var add = function (s) {
				htmltext += string.filledString ("\t", indentlevel) + s + lineEnding;
				}
			var addlink = function (id, url, icon, color) {
				add ("<a class=\"aSocialMediaLink\" id=\"" + id + "\" href=\"" + url + "\" target=\"_blank\"><i class=\"fa fa-" + icon + "\" style=\"color: " + color + "; font-weight: bold;\"></i></a>");
				}
			addlink ("idTwitterLink", "http://twitter.com/" + pagetable.authorTwitterAccount, "twitter", "#4099FF");
			addlink ("idFacebookLink", "http://facebook.com/" + pagetable.authorFacebookAccount, "facebook", "#4C66A4");
			
			if (pagetable.authorGithubAccount != undefined) { //2/17/14 by DW
				addlink ("idGithubLink", "http://github.com/" + pagetable.authorGithubAccount, "github", "black");
				}
			if (pagetable.authorLinkedInAccount != undefined) { //3/16/14 by DW
				addlink ("idLinkedInLink", "http://www.linkedin.com/in/" + pagetable.authorGithubAccount, "linkedin", "#069");
				}
			
			addlink ("idRssLink", pagetable.opmlFeed, "rss", "orange");
			return (htmltext);
			}
		function userStyles () { //1/4/14 by DW
			var s = "";
			if (pagetable.style != undefined) {
				for (var x in pagetable.style) { 
					s += lineEnding + pagetable.style [x] + lineEnding;
					}
				}
			if (s.length > 0) {
				return ("<" + "style>" + s + "<" + "/style>");
				}
			else {
				return ("");
				}
			}
		function pagetableInJSON () { 
			var pt = new Object ();
			for (var x in pagetable) { //copy the scalars from pagetable into pt
				if (x != "storyList") { //12/29/13 by DW
					var type, val = pagetable [x];
					if (val instanceof Date) { //1/7/14 by DW
						val = val.toString ();
						}
					type = typeof (val);
					if ((type != "object") && (type != undefined)) {
						pt [x] = val;
						}
					}
				}
			var s = JSON.stringify (pt, undefined, 4); //pretty print -- 12/20/13 by DW
			return (s);
			}
		function includeRiver (urlRiver) { //10/12/14 by DW
			var s = 
				"<div class=\"divRiverContainer\"><div class=\"divRiverDisplay\" id=\"idRiverDisplay\"></div></div>" + 
				"<script>httpGetRiver (\"" + urlRiver + "\", undefined, \"idRiverDisplay\")</script>";
			return (s);
			}
		
		function seeCommentForExplain () {
			//12/28/13 by DW
				//This creates a shell so the user's macros can be "more local" than the built-in macros. 
				//So you can override a built-in macro with one of your own.
			//set up macros
				var macros = "";
				for (var x in pagetable.macros) {
					macros += "function " + x + " () {" + pagetable.macros [x] + "}; ";
					}
				eval (macros);
			
			var process = function (s) {
				try {
					var val = eval (s);
					if (val instanceof Date) { //12/12/13 by DW
						return (cmsFormatDate (val, pagetable.dateFormat, pagetable.siteTimeZone));
						}
					return (val.toString ());
					}
				catch (err) {
					if (!utils.endsWith (err.message, " is not defined")) {
						console.log ("processMacros error on \"" + s + "\": " + err.message);
						}
					console.log ("processMacros error on \"" + s + "\": " + err.message);
					return (macroStart + s + macroEnd); //pass it back unchanged
					}
				};
			
			while (i < (s.length - 1)) {
				if (s [i] == "<") {
					if (s [i+1] == "%") {
						var j, flfound = false;
						for (var j = i + 2; j <= s.length - 2; j++) {
							if ((s [j] == "%") && (s [j+1] == ">")) {
								var macrotext = utils.stringMid (s, i + 3, j - i - 2);
								macrotext = process (macrotext);
								s = string.delete (s, i + 1, j - i + 2);
								s = string.insert (macrotext, s, i);
								i += macrotext.length;
								flfound = true;
								break;
								}
							}
						if (!flfound) {
							break;
							}
						}
					else {
						i += 2;
						}
					}
				else {
					i++;
					}
				}
			return (s);
			}
		return (seeCommentForExplain (s));
		}
	
	var starttime = new Date (), adrbody = getXstuctBody (xstruct), flprofile = false;
	var nomad = adrbody, ctparts, stack = new Array (), pagetable = new Object (), htmltext;
	var lastsegmenttime = starttime;
	
	pushNodeOnStack (nomad, "", stack);
	
	if ((path.length > 0) && (path [0] == "/")) {
		path = string.delete (path, 1, 1);
		}
	ctparts = string.countFields (path, "/");
	
	//locate the node to be rendered, in nomad and build a stack of pagetables
		for (i = 1; i <= ctparts; i++) {
			var s = string.lower (string.nthField (path, "/", i)), flnotfound = true, thispath;
			xmlOneLevelVisit (nomad, function (adrx) {
				if (string.lower (xmlGetNodeName (adrx)) == s) {
					nomad = adrx;
					flnotfound = false;
					//set thispath
						thispath = "";
						for (j = 1; j <= i; j++) {
							thispath += "/" + string.nthField (path, "/", j)
							}
					pushNodeOnStack (nomad, thispath, stack);
					return (false);
					}
				return (true);
				});
			if (!xmlNodeIsContent (nomad)) { //we don't render commented structures or # directives -- 12/9/13 by DW
				return;
				}
			if (flnotfound) {
				console.log ("cmsRenderPage: Error rendering \"" + path + "\". Not found. Lost the path at \"" + s + "\".");
				return;
				}
			}
		
		lastsegmenttime = addSegmentTime ("findNomad", lastsegmenttime);
		
	//build the pagetable from globals and the stack
		
		initPagetable (tab, xstruct, pagetable);
		pagetable.path = path; 
		if (cmsGlobalDavePrefs != undefined) {
			for (var x in cmsGlobalDavePrefs) {
				pagetable [x] = cmsGlobalDavePrefs [x];
				}
			}
		if (cmsGlobalPrefs != undefined) {
			for (var attname in cmsGlobalPrefs) {
				if ((isPoundItemTableName (attname)) && (pagetable [attname] != undefined)) { 
					var x = cmsGlobalPrefs [attname];
					for (var itemname in x) {
						pagetable [attname] [itemname] = x [itemname];
						}
					}
				else {
					pagetable [attname] = cmsGlobalPrefs [attname];
					}
				}
			}
		for (var i = 0; i < stack.length; i++) {
			for (var attname in stack [i].mypagetable) {
				if ((isPoundItemTableName (attname)) && (pagetable [attname] != undefined)) { //#glossary, #menus, #templates are tables that accumulate
					var x = stack [i].mypagetable [attname];
					for (var itemname in x) {
						pagetable [attname] [itemname] = x [itemname];
						}
					}
				else {
					pagetable [attname] = stack [i].mypagetable [attname];
					}
				}
			}
		
		lastsegmenttime = addSegmentTime ("buildPagetable", lastsegmenttime);
	//start the profiler, if enabled -- 12/28/13 by DW
		if (utils.getBoolean (pagetable.flProfile)) {
			flprofile = true;
			console.profile (pagetable.path);
			}
	//render the page
		var templatetext, adrx = nomad;
		
		//pagetable initializations
			//bootstrapTheme -- 2/22/14 by DW -- convert from Fargo 1 to Fargo 2
				var lowertheme = pagetable.bootstrapTheme.toLowerCase ();
				if ((utils.beginsWith (lowertheme, "http://bootswatch.com/")) && (utils.endsWith (lowertheme, "/bootstrap.min.css"))) {
					pagetable.bootstrapTheme = string.nthField (pagetable.bootstrapTheme, "/", 4);
					}
			if (pagetable.cssUrl == undefined) { //12/4/13 by DW -- used in #bootstrapTheme
				pagetable.cssUrl = "http://static.smallpicture.com/bootswatch/" + pagetable.bootstrapTheme + "/bootstrap.min.css";
				}
			if (pagetable.type != undefined) { //all type comparisons are unicase
				pagetable.type = string.lower (pagetable.type);
				}
			if (pagetable.menus == undefined) { //12/21/13 by DW -- now we don't have to check if it's undefined
				pagetable.menus = new Object ();
				}
			if (pagetable.macros == undefined) { 
				pagetable.macros = new Object ();
				}
			//pagetable.menutitle
				if (pagetable.menuTitle == undefined) { //3/5/14 by DW
					if (pagetable.opmlLongTitle.length > 0) {
						pagetable.menuTitle = pagetable.opmlLongTitle;
						}
					else {
						pagetable.menuTitle = pagetable.opmlTitle;
						}
					}
			pagetable.now = new Date (); 
			//pagetable.copyright -- 3/19/14 by DW
				if (pagetable.copyright == undefined) {
					if ((pagetable.opmlOwnerName != undefined) && (pagetable.opmlOwnerName.length > 0)) {
						pagetable.copyright = "&copy; " + pagetable.now.getFullYear () + " " + pagetable.opmlOwnerName + ".";
						}
					else {
						pagetable.copyright = "";
						}
					}
			
			//set pagetable.url
				pagetable.url = pagetable.opmlLink;
				if (!utils.endsWith (pagetable.url, "/")) { //1/31/14 by DW
					pagetable.url += "/";
					}
				pagetable.url += pagetable.path + appPrefs.cmsFileSuffix; 
			
			pagetable.ctLevelsOnIndexPage = getNumber (pagetable.ctLevelsOnIndexPage); //1/3/14 by DW
		//set up the body text
			var flFlowThroughMarkdown = true;
			
			switch (pagetable.type) {
				case "html":
					htmltext = xmlGetSubText (adrx);
					flFlowThroughMarkdown = false;
					break;
				case "outline":
					if (utils.getBoolean (pagetable.flMarkdown)) {
						htmltext = xmlGetStoryMarkdownText (adrx, 2);
						}
					else {
						htmltext = xmlGetStoryOutlineText (pagetable, adrx); //7/10/14 by DW
						flFlowThroughMarkdown = false;
						}
					break;
				case "presentation":
					htmltext = xmlGetPresentation (adrx);
					flFlowThroughMarkdown = false;
					break;
				case "markdown":
					htmltext = xmlGetStoryMarkdownText (adrx, 1);
					break;
				case "bloghome": //1/6/14 by DW
					htmltext = xmlGetBlogHomePage (pagetable, adrx);
					flFlowThroughMarkdown = false;
					break;
				case "index": //1/9/14 by DW
					htmltext = xmlGetIndexPage (pagetable, adrx);
					pagetable.flIndexPage = true; 
					flFlowThroughMarkdown = false;
					break;
				case "stream": //3/4/14 by DW
					htmltext = xmlGetStream (pagetable, adrx);
					if (htmltext.length == 0) { //we're too deep, bail out
						return;
						}
					flFlowThroughMarkdown = false;
					break;
				case "idea": //3/13/14 by DW
					return; //simple --> these don't render on their own pages
				case undefined:
					var defaultNameAtt = string.nthField (appPrefs.cmsDefaultFilename, ".", 1); //12/16/13 by DW
					if (xmlFind (adrx, defaultNameAtt) != undefined) { //bail out -- 12/3/13 by DW
						if (flprofile) {
							console.profileEnd ();
							}
						return;
						}
					htmltext = xmlGetIndexPage (pagetable, adrx);
					
					pagetable.flIndexPage = true; //12/17/13 by DW
					
					flFlowThroughMarkdown = false;
					break;
				default:
					htmltext = xmlGetStoryMarkdownText (adrx, 2);
					break;
				}
			
			htmltext = utils.multipleReplaceAll (htmltext, pagetable.glossary, false); //page text can contain glossary items
			htmltext = utils.multipleReplaceAll (htmltext, pagetable, false, macroStart, macroEnd);
			htmltext = processMacros (pagetable, htmltext); //page text can contain macros
			
			
			lastsegmenttime = addSegmentTime ("setupBodyText", lastsegmenttime);
			
			if (flFlowThroughMarkdown) {
				htmltext = xmlProcessMarkdown (htmltext); 
				
				lastsegmenttime = addSegmentTime ("flowThroughMarkdown", lastsegmenttime);
				}
		//replace Emoji codes -- 6/5/14 by DW
			if (utils.getBoolean (pagetable.flEmojify)) {
				htmltext = emojiProcess (htmltext); //6/25/17 by DW
				pagetable.text = emojiProcess (pagetable.text); //this is where the title is stored
				}
		//set templatetext
			if ((pagetable.type == undefined) || (pagetable.templates [pagetable.type] == undefined)) {
				templatetext = pagetable.templates.outline;
				}
			else {
				templatetext = pagetable.templates [pagetable.type];
				}
			
			if (templatetext == undefined) {
				debugMessage ("Can't process the page because there is no template named \"" + pagetable.type + ".\"");
				if (flprofile) {
					console.profileEnd ();
					}
				return (htmltext);
				}
			templatetext = utils.multipleReplaceAll (templatetext, pagetable.glossary, false); //templates can contain glossary items
			templatetext = utils.multipleReplaceAll (templatetext, pagetable, false, macroStart, macroEnd);
			templatetext = processMacros (pagetable, templatetext); //templates can contain macros
			
			lastsegmenttime = addSegmentTime ("setupTemplate", lastsegmenttime);
		
		pagetable.bodytext = htmltext;
		htmltext = utils.multipleReplaceAll (templatetext, pagetable, false, macroStart, macroEnd);
		
		lastsegmenttime = addSegmentTime ("readyToWriteFile", lastsegmenttime);
	//call finalFilter scripts -- 12/8/13 by DW
		pagetable.htmltext = htmltext;
		cmsRunScripts (pagetable, "finalFilter");
		htmltext = pagetable.htmltext;
	//write the file to the html folder
		var newpath = path; 
		
		if (xmlIsDocumentNode (nomad)) {
			if (utils.endsWith (newpath, "/")) {
				newpath = string.delete (newpath, newpath.length, 1);
				}
			
			if (xmlHasSubDocs (nomad)) { //1/10/14 by DW
				newpath += "/" + appPrefs.cmsDefaultFilename;
				}
			else {
				newpath += appPrefs.cmsFileSuffix;
				}
			}
		else {
			if (newpath.length > 0) {
				if (!utils.endsWith (newpath, "/")) {
					newpath += "/";
					}
				}
			newpath += appPrefs.cmsDefaultFilename;
			}
		
		addToPackage (package, "/" + newpath, htmltext); //1/1/14 by DW
		
		var f = pagetable.siteFolder + newpath;
		
		
		vendor.write (f, htmltext, function (metadata) {
			});
		
		lastsegmenttime = addSegmentTime ("renderComplete", lastsegmenttime);
	
	if (flprofile) {
		console.profileEnd ();
		}
	return (htmltext);
	}

function addParentLinksToOutline (theOutline) {
	function traverse (theOutline, theParent) {
		theOutline.parent = theParent;
		if (theOutline.subs !== undefined) {
			for (var i = 0; i < theOutline.subs.length; i++) {
				traverse (theOutline.subs [i], theOutline);
				}
			}
		}
	traverse (theOutline.opml.body, undefined);
	}

var namedOutlineCache = {
	};

function readNamedOutline (name, callback) {
	var now = new Date ();
	if (namedOutlineCache [name] !== undefined) {
		var cacheElement = namedOutlineCache [name];
		cacheElement.ctAccesses++;
		cacheElement.whenLastAccess = now;
		callback (cacheElement.theOutline);
		}
	else {
		var url = "http://beta.fargo.io/data/names/" + name + ".json";
		httpRequest (url, function (err, response, jsontext) {
			if (err) {
				console.log ("readNamedOutline: url == " + url + ", err.message == " + err.message);
				callback (undefined);
				}
			else {
				var jstruct = JSON.parse (jsontext);
				httpRequestOpml (jstruct.opmlUrl, function (opmltext) {
					if (opmltext !== undefined) {
						opmlToJs.parse (opmltext, function (theOutline) {
							namedOutlineCache [name] = {
								theOutline: theOutline,
								ctAccesses: 0,
								whenLastAccess: now
								}
							callback (theOutline);
							});
						}
					else {
						callback (undefined);
						}
					});
				}
			});
		}
	}
function readOpmlFile (f, callback) {
	fs.readFile (f, function (err, opmltext) {
		if (err) { 
			console.log ("readOpmlFile: err.message == " + err.message);
			if (callback !== undefined) {
				callback (undefined);
				}
			}
		else {
			opmlToJs.parse (opmltext, function (theOutline) {
				addParentLinksToOutline (theOutline);
				if (callback !== undefined) {
					callback (theOutline);
					}
				});
			}
		});
	}
function cmsGetDavePrefs (callback) {
	httpRequestOpml (config.urlDavePrefs, function (opmltext) {
		if (opmltext !== undefined) {
			opmlToJs.parse (opmltext, function (theOutline) {
				cmsGlobalDavePrefs = new Object ();
				xmlGatherPoundItems (theOutline.opml.body, cmsGlobalDavePrefs);
				if (callback !== undefined) {
					callback ();
					}
				});
			}
		});
	}
function cmsGetPrefs (callback) {
	readOpmlFile (config.cmsPrefsOpmlPath, function (theOutline) {
		cmsGlobalPrefs = new Object ();
		xmlGatherPoundItems (theOutline.opml.body, cmsGlobalPrefs);
		if (callback !== undefined) {
			callback ();
			}
		});
	}

function init (config, callback) {
	cmsGetPrefs (function () {
		cmsGetDavePrefs (function () {
			if (callback !== undefined) {
				callback ();
				}
			});
		});
	}
function render (config, f, path, callback) {
	var starttime = new Date ();
	var outlineName = utils.stringNthField (path, "/", 2);
	path = utils.stringDelete (path, 1, outlineName.length + 1);
	
	console.log ("fargocms.render: f == " + f + ", outlineName == " + outlineName + ", path == " + path);
	
	if (utils.endsWith (path, "/")) {
		path = utils.stringDelete (path, path.length, 1);
		}
	path = utils.stringPopExtension (path);
	
	readNamedOutline (outlineName, function (theOutline) {
		var package = new Array (), htmltext;
		var tab = {
			publicUrl: undefined
			};
		
		htmltext = cmsRenderPage (tab, theOutline, path, package);
		console.log ("fargocms.render: \"" + path + "\", " +  htmltext.length + " chars, " + utils.secondsSince (starttime) + " secs.");
		callback (htmltext);
		fs.writeFile ("test.html", htmltext);
		
		});
	
	}

