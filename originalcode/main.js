// Copyright 2013-2015, Small Picture, Inc.

var cmsVersion = "0.57";
var cmsPrefsOpmlPath = "cmsPrefs.opml", cmsGlobalPrefs;
var urlDavePrefs = "http://fargo.io/cms/globalPrefs.opml", cmsGlobalDavePrefs;
var urlsJsonFilePath = "#prefs/urls.json";
var defaultNameAtt = "index"; //if there's an object with this name att, don't auto-generate the default index file
var defaultTemplate = "outline";
var macroStart = "<" + "%", macroEnd = "%" + ">"; 
var lineEnding = "\r\n";
var cmsNodeStackCache = new Array ();
var markdown = new Markdown.Converter ();
var flCmsStarted = false;
var segmentTimes = [];
var flPackagesEnabled = true, flPingPackagesServer = true;
var hostingFoldername = "#hosting/";
var flCmsRenderBarCursor = false, flCmsRenderAllPages = false, flCmsRenderSubOutline = false; //globals for background tasks
var flCmsGenNameAtts = false, cmsTabForRender, bchForRenderBarCursor; //globals for background tasks
var embedCache = {}; //6/26/14 by DW



function debugMessage (s) {
	console.log (s);
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
	
//shared urls
	var sharedUrls = [];
	
	function cmsFindSharedUrl (f) {
		for (var i = 0; i < sharedUrls.length; i++) {
			if (sharedUrls [i].f == f) {
				return (sharedUrls [i].url);
				}
			}
		return (undefined);
		}
	function cmsGetSharedUrlForPage (f) {
		if (!cmsFindSharedUrl (f)) {
			vendor.share (f, function (url) {
				var obj = new Object ();
				obj.f = f;
				obj.url = string.replaceAll (url, "https://", "http://"); //pages referenced in the rendered page are not https, so the browser doesn't read them -- 11/23/13 by DW
				sharedUrls [sharedUrls.length] = obj;
				
				vendor.write (urlsJsonFilePath, JSON.stringify (sharedUrls), function (metadata) {
					debugMessage ("cmsGetSharedUrlForPage, saved urls array: " + metadata.path);
					});
				});
			}
		}
	
	function cmsRestoreUrls () {
		vendor.exists (urlsJsonFilePath, function (file) {
			vendor.read (urlsJsonFilePath, function (data) {
				sharedUrls = JSON.parse (data);
				debugMessage ("cmsRestoreUrls, restored urls array: " + sharedUrls);
				});
			});
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
	if (embedCache [id] != undefined) {
		return (embedCache [id]);
		}
	else {
		var jsontext = $.ajax ({ 
			url:  urlTwitterEmbedServer + "getembedcode?id=" + encodeURIComponent (id),
			async: false,
			dataType: "text" , 
			timeout: 30000 
			}).responseText;
		var struct = JSON.parse (jsontext);
		embedCache [id] = struct.html; 
		return (struct.html);
		}
	}
function md5 (s) { //3/10/14 by DW
	return (SparkMD5.hash (s));
	}
function isPoundItemTableName (name) {
	switch (string.trimWhitespace (string.lower (name))) {
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
			s = string.delete (s, 1, 1);
			for (var i = 0; i < s.length; i++) {
				if (s [i] == " ") {
					s = string.delete (s, 1, i);
					s = trimWhitespace (s);
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
function xmlProcessMarkdown (s, flReturnDiv) {
	if (flReturnDiv == undefined) {
		flReturnDiv = true;
		}
	
	var ch = String.fromCharCode (8), magicstring = ch + ch + ch;
	s = string.replaceAll (s, "<%", magicstring);
	s = markdown.makeHtml (s);
	s = string.replaceAll (s, magicstring, "<%");
	
	if (flReturnDiv) {
		return ("<div class=\"divFargoMarkdown\" id=\"idFargoMarkdown\">" + s + "</div>");
		}
	else {
		return (s); 
		}
	}

function xmlGetValue (adrx, name) {
	return (adrx.children (name).text ());
	}
function xmlGetAddress (adrx, name) {
	return (adrx.find (name));
	}
function xmlGetAttribute (adrx, name) {
	return ($(adrx).attr (name));
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
function xmlSetAttribute (adrx, name, value) {
	$(adrx).attr (name, value);
	}
function xmlDeleteAttribute (adrx, name) {
	$(adrx).removeAttr (name);
	}
function xmlGatherAttributes (adrx, theTable) {
	if (adrx.attributes != undefined) {
		for (var i = 0; i < adrx.attributes.length; i++) {
			var att = adrx.attributes [i];
			if (att.specified) {
				theTable [att.name] = att.value;
				}
			}
		}
	}
function xmlHasSubs (adrx) {
	return ($(adrx).children ().length > 0); //use jQuery to get answer -- 12/30/13 by DW
	
	};
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
function xmlGetParent (adrx) { //3/4/14 by DW
	return ($(adrx).parent ());
	}
function xmlGetNodeName (adrx) {
	var name = xmlGetAttribute (adrx, "name");
	if (name != undefined) {
		return (name);
		}
	return (getCanonicalName (xmlGetTextAtt (adrx)));
	}
function xmlGetDivWithData (adrx, divname) { //3/23/14 by DW
	var s = "<div class=\"" + divname + "\" ";
	$.each (adrx.attributes, function () {
		if (this.specified) {
			var name = this.name.toLowerCase (); //data atts are unicase
			switch (name) {
				case "text": case "created": case "name":
					break; 
				default:
					s += "data-" + name + "=\"" + this.value + "\" ";
					break;
				}
			}
		});
	return (s + ">");
	}
function xmlNodesAreSiblings (adr1, adr2) { //1/10/14 by DW
	return ($(adr1).parent () == $(adr2).parent ());
	}
function xmlIsDocumentNode (adrx) {
	var type = xmlGetAttribute (adrx, "type");
	return ((type != undefined) && (type != "include") && (type != "link") && (type != "tweet"));
	}
function xmlGetNodeNameProp (adrx) { //12/10/13 by DW
	return ($(adrx).prop ("nodeName"));
	}
function xmlNodeIsContent (adrx) { //12/2/13 by DW
	if (xmlGetNodeNameProp (adrx) != "outline") { //12/10/13 by DW
		return (false);
		}
	return ((!xmlIsComment (adrx)) && (!isPoundItem (xmlGetTextAtt (adrx))));
	}
function xmlReadFile (url) { //a synchronous file read
	return ($.ajax ({ 
		url: getReadHttpUrl () + "?url=" + encodeURIComponent (url) + "&type=" + encodeURIComponent ("text/plain"),
		headers: {"Accept": "text/x-opml"},
		async: false,
		dataType: "text" , 
		timeout: 30000 
		}).responseText);
	}
function xmlExpandInclude (adrx) {
	var typeatt = xmlGetAttribute (adrx, "type");
	if (typeatt == "include") {
		var urlatt = xmlGetAttribute (adrx, "url");
		if (urlatt != undefined) {
			try {
				var opmltext = xmlReadFile (urlatt);
				var xstruct = $($.parseXML (opmltext));
				var adropml = xmlGetAddress (xstruct, "opml");
				var adrbody = xmlGetAddress (adropml, "body");
				$(adrbody).children ("outline").each (function () {
					var adrcopy = this.cloneNode (true);
					adrx.appendChild (adrcopy);
					});
				xmlDeleteAttribute (adrx, "type");
				xmlDeleteAttribute (adrx, "url");
				}
			catch (err) {
				console.log ("xmlExpandInclude, error expanding: " + urlatt + ", " + err.message);
				}
			
			}
		}
	}
function xmlVisit (adrx, callback, level, path) {
	if (level == undefined) {
		level = 0;
		}
	if (path == undefined) {
		path = "";
		}
	$(adrx).children ("outline").each (function () {
		var flvisitsubs = true,  name = xmlGetNodeName (this);
		xmlExpandInclude (this);
		if (callback != undefined) {
			if (!callback (this, level, path + name)) {
				flvisitsubs = false;
				}
			}
		if (flvisitsubs) {
			if (!xmlVisit (this, callback, level + 1, path + name + "/")) {
				return (false);
				}
			}
		});
	return (true);
	}
function xmlOneLevelVisit (adrx, callback) {
	$(adrx).children ("outline").each (function () {
		xmlExpandInclude (this);
		if (callback != undefined) {
			if (!callback (this)) {
				return (false);
				}
			}
		return (true);
		});
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
function xmlFind (adrparent, nameToLookFor) {
	var s = string.lower (nameToLookFor), adrfound;
	xmlOneLevelVisit (adrparent, function (adrsub) {
		if (xmlNodeIsContent (adrsub)) {
			if (string.lower (xmlGetNodeName (adrsub)) == s) {
				adrfound = adrsub;
				return (false);
				}
			}
		return (true); 
		});
	return (adrfound);
	}
function textOrTweet (adrx) { //6/26/14 by DW 
	if (xmlGetAttribute (adrx, "type") == "tweet") {
		return (getEmbeddedTweet (xmlGetAttribute (adrx, "tweetId"))); //it's synchronous, don't worry! ;-)
		}
	else {
		return (xmlGetTextAtt (adrx));
		}
	}
function xmlGetSubText (adrx) {
	var htmltext = "";
	xmlVisit (adrx, function (adrx, level) {
		var textatt = textOrTweet (adrx); //6/27/14 by DW
		if (xmlIsComment (adrx) || isPoundItem (textatt)) {
			return (false);
			}
		htmltext += string.filledString ("\t", level) + textatt + lineEnding;
		return (true);
		});
	return (htmltext);
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
function xmlGetPermalinkValue (when) { //3/11/14 by DW
	var num = Number (when), name;
	if (num < 0) {
		num = -num;
		}
	name = "a" + (num / 1000);
	return (name);
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
function xmlGetStoryList (pagetable, adrx) { //return a <ul> with links to recent stories -- 12/19/13 by DW
	var htmltext = "", indentlevel = 0, lastlevel = 0, ctstories = 0;
	function add (s) {
		htmltext += string.filledString ("\t", indentlevel) + s + lineEnding;
		}
	add ("<ul>"); indentlevel++;
	xmlVisit (adrx, function (adrx, level, path) {
		if (ctstories >= pagetable.maxStoryList) {
			return (false);
			}
		var textatt = xmlGetAttribute (adrx, "text");
		var typeatt = xmlGetAttribute (adrx, "type");
		
		if (xmlIsComment (adrx) || isPoundItem (textatt)) {
			return (false);
			}
		
		if ((typeatt != undefined) && (typeatt != "include")) {
			var url = pagetable.opmlLink + path + appPrefs.cmsFileSuffix;
			add ("<li><a href=\"" + url + "\" target=\"_blank\">" + textatt + "</a></li>");
			ctstories++;
			return (false);
			}
		return (true);
		});
	add ("</ul>"); indentlevel--;
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
			var flstorytext = getBoolean (pagetable.flStoryTextOnIndexPage), aClass = " class=\"aDocTitleOnIndexPage\" ", liClass = "", mypath;
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
				if (getBoolean (pagetable.flStoryDateOnIndexPage)) { 
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
		if (getBoolean (pagetable.flNonDocHeadsOnIndexPage)) { //12/18/13 by DW
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
function xmlGetIndexOpml (adrx) {
	var opmltext = "", indentlevel = 0, lastlevel = 0, now = new Date ();
	function add (s) {
		opmltext += string.filledString ("\t", indentlevel) + s + lineEnding;
		}
	function encode (s) {
		return (xmlEncode (s));
		}
	add ("<opml version=\"2.0\">"); indentlevel++;
	//head
		add ("<head>"); indentlevel++;
		add ("<dateModified>" + date.netStandardString (now) + "</dateModified>");
		add ("</head>"); indentlevel--;
	//body
		add ("<body>"); indentlevel++;
		xmlVisit (adrx, function (adrx, level, path) {
			var textatt = xmlGetAttribute (adrx, "text");
			var typeatt = xmlGetAttribute (adrx, "type");
			if (xmlIsComment (adrx) || isPoundItem (textatt)) {
				return (false);
				}
			
			//deal with level changes
				if (level < lastlevel) {
					for (var i = 1; i <= (lastlevel - level); i++) {
						add ("</outline>"); indentlevel--;
						}
					}
				else {
					if (level > lastlevel) {
						indentlevel++;
						}
					}
				lastlevel = level;
			
			if ((typeatt != undefined) && (typeatt != "include")) {
				var mypath = path + appPrefs.cmsFileSuffix;
				add ("<outline text=\"" + encode (textatt) + "\" type=\"link\" url=\"" + mypath + "\"/>");
				return (false);
				}
			
			if (xmlHasSubs (adrx)) {
				add ("<outline text=\"" + encode (textatt) + "\">");
				}
			else {
				add ("<outline text=\"" + encode (textatt) + "\" />");
				}
			return (true);
			});
		while (indentlevel > 2) {
			add ("</outline>"); indentlevel--;
			}
		add ("</body>"); indentlevel--;
	add ("</opml>"); indentlevel--
	return (opmltext);
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
		if (getBoolean (flwedge)) {
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

function xmlNotComment (adrx) { //7/10/1 by DW
	if (xmlIsComment (adrx)) {
		return (false);
		}
	if (isPoundItem (xmlGetTextAtt (adrx))) {
		return (false);
		}
	return (true);
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
function xmlGetPresentation (adrx) {
	var htmltext = "", indentlevel = 0, lastlevel = 0;
	var add = function (s) {
		htmltext += string.filledString ("\t", indentlevel) + s + lineEnding;
		}
	xmlOneLevelVisit (adrx, function (adrx) {
		if (!xmlIsComment (adrx)) {
			add ("<section class=\"secFargoPresentation\">"); indentlevel++
			add ("<h2>" + xmlGetTextAtt (adrx) + "</h2>")
			
			xmlVisit (adrx, function (adrx, level, path) {
				var textatt = xmlGetTextAtt (adrx);
				if (xmlIsComment (adrx)) {
					return (false);
					}
				//generate <ul> and </ul> elements
					if (level > lastlevel) {
						add ("<ul class=\"ulFargoPresentation\">"); indentlevel++
						}
					else {
						if (level < lastlevel) {
							for (var i = 1; i <= (lastlevel - level); i++) {
								add ("</ul>"); indentlevel--
								}
							}
						}
					lastlevel = level;
				
				if (xmlGetAttribute (adrx, "type") == "tweet") { //6/27/14 by DW
					add ("<center><div class=\"divTweetInPresentation\">" + textOrTweet (adrx) + "</div></center>");
					}
				else {
					add ("<li class=\"liFargoPresentation\">" + xmlGetTextAtt (adrx) + "</li>");
					}
				
				return (true);
				});
			
			add ("</section>"); indentlevel--
			}
		return (true);
		});
	return (htmltext);
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
	
	if (getBoolean (pagetable.flFixedMenu)) { //3/7/14 by DW
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
function xmlGetMenuAsList (pagetable, adrbody, adrx, flCollapsable) {
	var htmltext = "", indentlevel = 0, ecId = 0;
	var adrwholemenu = xmlGetSub1 (adrx);
	var menutitle = xmlGetTextAtt (adrwholemenu);
	var add = function (s) {
		htmltext += string.filledString ("\t", indentlevel) + s + lineEnding;
		}
	var addmenuitem = function (adrx, flHasSubs, flDownWedge) {
		var textatt = xmlGetTextAtt (adrx), typeatt = xmlGetAttribute (adrx, "type"), icon = "", iconclose = "";
		if (flCollapsable && flHasSubs) {
			var clickscript = "onclick=\"ecUL(" + ecId + ")\"", wedgedir = "right";
			if (flDownWedge) {
				wedgedir = "down";
				}
			icon = "<a class=\"aWedgeLink\" " + clickscript + "><i class=\"fa fa-caret-" + wedgedir + "\" id=\"idCaret" + ecId + "\"></i>";
			iconclose = "</a>";
			}
		if (textatt == "-") {
			add ("<li class=\"divider\"></li>");
			}
		else {
			var urlatt = xmlGetAttribute (adrx, "url");
			if ((typeatt == "link") && (urlatt != undefined)) {
				add ("<li><a class=\"aMenuLink\" href=\"" + urlatt + "\" target=\"_blank\">" + textatt + "</a></li>");
				}
			else {
				add ("<li>" + icon + textatt + iconclose + "</li>");
				}
			}
		}
	if (flCollapsable == undefined) {
		flCollapsable = true;
		}
	add ("<div class=\"divFargoMenu\">"); indentlevel++;
	add ("<center><h4><a class=\"aSiteLink\" href=\"" + macroStart + "opmlLink" + macroEnd + "\">" + menutitle + "</a></h4></center>")
	add ("<ul>"); indentlevel++;
	
	xmlOneLevelVisit (adrwholemenu, function (adrx) { //add each top-level menu
		ecId++;
		
		var id = "", style = " style=\"display: block;\" ", fldownwedge = true;
		if (getBoolean (xmlGetAttribute (adrx, "collapse"))) {
			style = " style=\"display: none;\"";
			fldownwedge = false;
			}
		if (flCollapsable) { //12/21/13 by DW -- set id
			id = " id='idUL" + ecId + "'";
			}
		if (xmlHasSubs (adrx)) {
			addmenuitem (adrx, true, fldownwedge);
			add ("<ul" + id + style + ">"); indentlevel++;
			xmlOneLevelVisit (adrx, function (adrx) {
				addmenuitem (adrx);
				return (true); //keep visiting
				});
			add ("</ul>"); indentlevel--
			}
		else {
			if (xmlGetAttribute (adrx, "type") == "stories") { //12/24/13 by DW
				addmenuitem (adrx, true, fldownwedge);
				var s = xmlGetStoryList (pagetable, adrbody); //12/30/13 by DW -- was pagetable.storyList;
				s = s.replace ("<ul>", "\n<ul" + id + style + ">");
				add (s);
				
				}
			else {
				addmenuitem (adrx, false);
				}
			}
		return (true); //keep visiting
		});
	
	add ("</ul>"); indentlevel--;
	add ("</div>"); indentlevel--;
	
	return (htmltext);
	}
function xmlGatherPoundItems (adrx, theTable) {
	var parseItem = function (adrx) {
		if (!xmlIsComment (adrx)) {
			var s = xmlGetAttribute (adrx, "text");
			if (s.length > 0) {
				if (s [0] == "#") {
					var field1 = string.nthField (s, " ", 1);
					var namepart = string.delete (trimWhitespace (field1), 1, 1);
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
											if (string.endsWith (subtext, lineEnding)) {
												subtext = string.mid (subtext, 1, subtext.length - lineEnding.length);
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
							var valuepart = trimWhitespace (string.delete (s, 1, field1.length));
							if (valuepart.length >= 2) {
								if ((valuepart [0] == "\"") && (valuepart [valuepart.length - 1] == "\"")) { //first and last chars must be double-quote
									valuepart = string.delete (valuepart, 1, 1);
									valuepart = string.delete (valuepart, valuepart.length, 1);
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
function xmlDecode (s) {
	return (s.replace (/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&'));
	}
function xmlEncode (s) { //12/17/13 by DW
	s = s.replace (/&/g, "&amp;");
	s = s.replace (/</g, "&lt;");
	s = s.replace (/>/g, "&gt;");
	s = s.replace (/"/g, "&" + "quot;");
	s = s.replace (/'/g, "&" + "apos;");
	return (s);
	}
function xmlGetNext (adrx) {
	while (true) {
		adrx = $(adrx).next ();
		if ($(adrx).length == 0) { //hit the end
			return (undefined);
			}
		if (xmlNodeIsContent (adrx)) {
			return (adrx);
			}
		}
	}
function xmlGetPrev (adrx) {
	while (true) {
		adrx = $(adrx).prev ();
		if ($(adrx).length == 0) { //hit the end
			return (undefined);
			}
		if (xmlNodeIsContent (adrx)) {
			return (adrx);
			}
		}
	}
function xmlGetUrlOfSibling (adrsib, adrthis) {
	var prefix = "";
	if (!xmlIsDocumentNode (adrthis)) {
		prefix = "../";
		}
	if (xmlIsDocumentNode (adrsib)) {
		return (prefix + xmlGetNodeName (adrsib) + appPrefs.cmsFileSuffix);
		}
	else {
		return (prefix + xmlGetNodeName (adrsib) + "/" + appPrefs.cmsDefaultFilename);
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
function cmsFormatDate (theDate, dateformat, timezone) {
	try {
		var offset = new Number (timezone);
		var d = new Date (theDate);
		var localTime = d.getTime ();
		var localOffset = d.getTimezoneOffset () *  60000;
		var utc = localTime + localOffset;
		var newTime = utc + (3600000 * offset);
		return (new Date (newTime).strftime (dateformat));
		}
	catch (tryerror) {
		return (new Date (theDate).strftime (dateformat));
		}
	}
function cmsGetOutlineName (tab) {
	var name = tab.url;
	name = name.substr (0, name.lastIndexOf ('.'));
	return (name)
	}
function cmsGetHtmlFolder (tab) { //11/23/13 by DW
	var f = "html/" + tab.url; //something like html/myPublicProfile.opml
	var folder = f.substr (0, f.lastIndexOf ('.')) + "/";
	return (folder)
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
		
		
		$(adrhead).children ().each (function () { //copy all head elements from opml into pagetable -- 12/24/13 by DW
			var name = $(this).prop ("nodeName");
			if (name.length > 0) {
				var val = $(this).prop ("textContent");
				name = "opml" + string.upper (name [0]) + string.mid (name, 2, name.length - 1);
				pagetable [name] = val;
				}
			});
		
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
	pagetable.slogan = getRandomSnarkySlogan (); //11/26/13 by DW
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
					pagetable.text = string.lastField (pagetable.opmlUrl, "/");
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
function getTabXstruct (tab) {
	return ($($.parseXML (getTabOpmltext (tab))));
	}
function getXstuctBody (xstruct) {
	var adropml, adrbody;
	adropml = xmlGetAddress (xstruct, "opml");
	adrbody = xmlGetAddress (adropml, "body");
	return (adrbody);
	}
function getTabParam (tab) {
	if (tab == undefined) {
		return (getActiveTab ());
		}
	return (tab);
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
function cmsEmojifyString (s) { //7/12/14 by DW
	emojify.setConfig ({
		img_dir: "http://fargo.io/code/emojify/images/emoji",  
		});
	return (emojify.replace (s));
	}
function cmsRenderForRss (s) { //2/28/14 by DW
	var myGlossary = new Object (); 
	//set up myGlossary
		if (cmsGlobalDavePrefs != undefined) {
			if (cmsGlobalDavePrefs.glossary != undefined) {
				for (x in cmsGlobalDavePrefs.glossary) {
					myGlossary [x] = cmsGlobalDavePrefs.glossary [x];
					}
				}
			}
		if (cmsGlobalPrefs != undefined) {
			if (cmsGlobalPrefs.glossary != undefined) {
				for (x in cmsGlobalPrefs.glossary) {
					myGlossary [x] = cmsGlobalPrefs.glossary [x];
					}
				}
			}
	s = multipleReplaceAll (s, myGlossary, false); 
	s = xmlProcessMarkdown (s, false); 
	return (s);
	}
function cmsRenderRss (tab, package, pagetable) {
	var xmltext = "", indentlevel = 0, maxitems = 25, starttime = new Date (); nowstring = starttime.toGMTString ();
	var idoutliner = "#" + tab.idOutline, opmlhead = $(idoutliner).concord ().op.getHeaders ();
	var urlGetEnclosureInfo = "http://" + cmsGetPublishServer () + "/getEnclosureInfo"; 
	
	function encode (s) {
		return (ConcordUtil.escapeXml (s));
		}
	function processGlossaryAndMacros (s, flMarkdown, flEmojify) { //7/12/14 by DW
		if (flMarkdown == undefined) {
			flMarkdown = true;
			}
		if (flEmojify == undefined) { //11/4/14 by DW
			flEmojify = true;
			}
		s = multipleReplaceAll (s, pagetable.glossary, false); 
		s = multipleReplaceAll (s, pagetable, false, encode (macroStart), encode (macroEnd));
		if (flMarkdown) {
			s = xmlProcessMarkdown (s, false); 
			}
		if (flEmojify && getBoolean (pagetable.flEmojify)) { //11/4/14 by DW
			s = cmsEmojifyString (s);
			}
		return (s);
		}
	function filledString (s, ct) {
		var theString = "";
		for (var i = 1; i <= ct; i++) { 
			theString += s;
			}
		return (theString);
		}
	function add (s) {
		xmltext += filledString ("\t", indentlevel) + s + "\n";
		}
	function addWithoutIndent (s) { //10/8/15 by DW
		xmltext += s + "\n";
		}
	function addAccount (servicename, username) {
		if ((username != undefined) && (username.length > 0)) { //7/29/13 by DW
			add ("<source:account service=\"" + encode (servicename) + "\">" + encode (username) + "</source:account>");
			}
		}
	function addDescription (itemnode, flMarkdown) { //2/28/14 by DW
		var origlevel = indentlevel, markdowntext = "";
		function visitSub (sub) {
			var fldontskip = true, linetext = sub.getLineText ();
			if (getBoolean (sub.attributes.getOne ("isComment"))) {
				fldontskip = false;
				}
			else {
				var s = linetext.toLowerCase ();
				if ((s.substr (0, 6) == "<rules") && (s.charAt (s.length - 1) == ">")) {
					fldontskip = false;
					}
				else {
					if (isPoundItem (s)) { //call a CMS routine, to eliminate # directives -- 1/8/14 by DW
						fldontskip = false;
						}
					}
				}
			if (fldontskip) {
				var img;
				//set img -- 7/29/13 by DW
					var imgAtt = sub.attributes.getOne ("img");
					if ((imgAtt == undefined) || (imgAtt == "")) {
						img = "";
						}
					else {
						img = "<img style=\"float: right; margin-left: 25px; margin-bottom: 15px;\" src=\"" + imgAtt + "\">";
						}
				
				//do the hotup routine -- 3/14/14 by DW
					linetext = hotUpText (linetext, sub.attributes.getOne ("url"));
				
				if (!flMarkdown) {
					linetext = encode (linetext + img);
					if (indentlevel == origlevel) {
						add (encode ("<p>") + linetext + encode ("</p>"))
						}
					else {
						add (encode ("<li>") + linetext + encode ("</li>"))
						}
					if (sub.countSubs () > 0) {
						add (encode ("<ul>")); indentlevel++;
						sub.visitLevel (visitSub); 
						add (encode ("</ul>")); indentlevel--; 
						}
					}
				else { //no markup
					linetext += img;
					if ((linetext.length > 0) && (linetext [0] == "#")) { //2/28/14 by DW
						markdowntext += linetext + lineEnding;
						}
					else {
						markdowntext += linetext + lineEnding + lineEnding;
						}
					
					if (sub.countSubs () > 0) {
						sub.visitLevel (visitSub); 
						}
					}
				}
			};
		itemnode.visitLevel (visitSub);
		if (flMarkdown) {
			addWithoutIndent (encode (processGlossaryAndMacros (markdowntext))); //2/28/14 by DW & 10/8/15 by DW
			
			}
		}
	function addOutlineElement (itemnode) { //7/11/14 by DW
		function getattsstring (atts) {
			var s = "";
			for (var x in atts) {
				switch (x) {
					case "isComment": case "isFeedItem": 
						break;
					default:
						s += encode (x) + "=\"" + encode (atts [x]) + "\" ";
						break;
					}
				}
			return (s);
			}
		function visit (sub) {
			var atts = sub.attributes.getAll ();
			if (!getBoolean (atts.isComment)) { //don't put comments in the feed
				var s = "<source:outline text=\"" + encode (processGlossaryAndMacros (sub.getLineText (), false, false)) + "\" " + getattsstring (atts);
				if (sub.countSubs () > 0) {
					add (s + ">"); indentlevel++;
					sub.visitLevel (visit); 
					add ("</source:outline>"); indentlevel--; 
					}
				else {
					add (s + "/>");
					}
				}
			}
		add ("<source:outline text=\"" + encode (itemnode.getLineText ()) + "\" " + getattsstring (itemnode.attributes.getAll ()) + ">"); indentlevel++;
		itemnode.visitLevel (visit);
		add ("</source:outline>"); indentlevel--;
		}
	function isFeedItem (atts) { 
		return ((atts.isFeedItem == "true") && (atts.isComment != "true") && (atts.created != undefined));
		}
	function getEnclosureInfo (url, headline) {
		var jxhr = $.ajax ({ 
			url: urlGetEnclosureInfo + "?url=" + encodeURIComponent (url),
			dataType: "jsonp", 
			timeout: 30000,
			jsonpCallback : "getData"
			}) 
		.success (function (data, status) { 
			if (data.flError != undefined) { //2/15/14 by DW
				headline.attributes.setOne ("enclosureError", "true");
				}
			else {
				headline.attributes.setOne ("enclosureLength", data.length);
				headline.attributes.setOne ("enclosureType", data.type);
				}
			}) 
		.error (function (status) { 
			console.log ("getEnclosureInfo: Error getting type and length -- " + status);
			headline.attributes.setOne ("enclosureError", "true");
			});
		}
	function getGuidUrlForIdeaNode (url) { //3/11/14 by DW
		var parts = url.split ("/");
		return ("http://" + parts [2] + "/" + parts [3] + "/" + parts [4] + "/" + parts [5] + "/");
		}
	function getNodeOpml (node) { //3/12/14 by DW
		return ($(idoutliner).concord ().op.getNodeOpml (node.getCursorRef ()));
		}
	function rssCloudPing (urlFeed) { //6/21/15 by DW -- cribbed outlinerssfeed.js 
		if ((appConsts.rssCloud !== undefined) && appConsts.rssCloud.enabled) {
			var urlServer = "http://" + appConsts.rssCloud.domain + ":" + appConsts.rssCloud.port + appConsts.rssCloud.pingPath;
			$.post (urlServer, {url: urlFeed}, function (data, status) {
				console.log ("rssCloudPing: urlServer == " + urlServer + ", urlFeed == " + urlFeed + ", status == " + status);
				});
			}
		}
	
	if (idoutliner == undefined) {
		idoutliner = getActiveOutliner ();
		}
	if (appPrefs.maxRssItems != undefined) {
		maxitems = appPrefs.maxRssItems;
		}
	
	add ("<?xml version=\"1.0\"?>")
	add ("<!-- RSS generated by " + appConsts.domain + " on " + nowstring + " -->")
	add ("<rss version=\"2.0\" xmlns:source=\"http://source.smallpict.com/2014/07/12/theSourceNamespace.html\">"); indentlevel++
	add ("<channel>"); indentlevel++
	//add header elements
		
		if ((opmlhead.longTitle != undefined) && (opmlhead.longTitle.length > 0)) {
			add ("<title>" + encode (opmlhead.longTitle) + "</title>");
			}
		else {
			add ("<title>" + encode (opmlhead.title) + "</title>");
			}
		
		if (opmlhead.link != undefined) {
			add ("<link>" + encode (opmlhead.link) + "</link>");
			}
		if (opmlhead.description != undefined) {
			add ("<description>" + encode (opmlhead.description) + "</description>");
			}
		if (opmlhead.dateModified != undefined) {
			add ("<pubDate>" + encode (opmlhead.dateModified) + "</pubDate>");
			}
		add ("<lastBuildDate>" + nowstring + "</lastBuildDate>");
		if (appPrefs.rssLanguage != undefined) {
			add ("<language>" + encode (appPrefs.rssLanguage) + "</language>");
			}
		add ("<generator>" + appConsts.productnameForDisplay + " v" + appConsts.version + "</generator>");
		add ("<docs>http://cyber.law.harvard.edu/rss/rss.html</docs>");
		//<cloud> element -- 6/21/15 by DW
			if ((appConsts.rssCloud !== undefined) && appConsts.rssCloud.enabled) {
				add ("<cloud domain=\"" + appConsts.rssCloud.domain + "\" port=\"" + appConsts.rssCloud.port + "\" path=\"" + appConsts.rssCloud.path + "\" registerProcedure=\"" + appConsts.rssCloud.registerProcedure + "\" protocol=\"" + appConsts.rssCloud.protocol + "\" />")
				}
		if (opmlhead.ownerEmail != undefined) {
			add ("<webMaster>" + encode (opmlhead.ownerEmail) + "</webMaster>");
			}
		addAccount ("twitter", appPrefs.authorTwitterAccount); //7/29/13 by DW
		addAccount ("facebook", appPrefs.authorFacebookAccount); //7/29/13 by DW
		
	//add items
		var eligableHeadlines = new Array (), ctitems = 0; 
		//build eligableHeadlines array -- 8/5/13 by DW
			op.visitAll (function (headline) {
				var atts = headline.attributes.getAll ();
				if (isFeedItem (atts)) {
					var obj = new Object ();
					obj.headline = headline;
					obj.created = new Date (atts.created);
					eligableHeadlines [eligableHeadlines.length] = obj;
					}
				return (true);
				});
		while ((ctitems < maxitems) && (eligableHeadlines.length > 0)) {
			var headline;
			//get the next eligable headline
				var maxdate = new Date (0), ixmaxdate;
				for (var i = 0; i < eligableHeadlines.length; i++) {
					if (eligableHeadlines [i].created > maxdate) {
						maxdate = eligableHeadlines [i].created;
						ixmaxdate = i;
						}
					}
				headline = eligableHeadlines [ixmaxdate].headline;
				eligableHeadlines.splice (ixmaxdate, 1); //delete the headline in the array
			
			var atts = headline.attributes.getAll (), ctsubs = headline.countSubs (), permalink;
			add ("<item>"); indentlevel++;
			
			//set permalink -- 3/11/14 by DW
				permalink = getTrexUrl (idoutliner, headline, false) + appPrefs.cmsFileSuffix; 
				if (atts.type == "idea") {
					if (atts.created == undefined) {
						permalink = undefined;
						}
					else {
						var name = xmlGetPermalinkValue (new Date (atts.created));
						permalink = getGuidUrlForIdeaNode (permalink) + "#" + name;
						}
					}
			
			//title
				if (ctsubs > 0) { //it will have both a title and description
					add ("<title>" + encode (stripMarkup (processGlossaryAndMacros (headline.getLineText ()))) + "</title>"); 
					}
			//link
				if (atts.type == "link") {
					add ("<link>" + encode (atts.url) + "</link>"); 
					}
				else {
					if (permalink != undefined) { //6/28/13 by DW
						add ("<link>" + encode (permalink) + "</link>"); 
						}
					}
			//description
				var flMarkdown = true; //(atts.type == "markdown") || (atts.method == "markdown");
				
				//set flMarkdown -- 7/13/14 by DW
					if (atts.type == "idea") {
						flMarkdown = false;
						}
					else {
						if (!getBoolean (pagetable.flMarkdown)) {
							flMarkdown = false;
							}
						else {
							if (atts.flMarkdown !== undefined) { //it's actually specified
								if (!getBoolean (atts.flMarkdown)) { //it's false
									flMarkdown = false;
									}
								}
							}
						}
				
				if (ctsubs > 0) {
					add ("<description>"); indentlevel++;
					addDescription (headline, flMarkdown);
					add ("</description>"); indentlevel--;
					}
				else {
					var s = stripMarkup (headline.getLineText ());
					s = processGlossaryAndMacros (hotUpText (s, atts.url));
					add ("<description>" + encode (s) + "</description>"); 
					}
			//outline -- 7/11/14 by DW
				addOutlineElement (headline);
			//pubDate
				if (atts.created != undefined) {
					add ("<pubDate>" + encode (atts.created) + "</pubDate>"); 
					}
			
			//category -- 8/24/13 by DW
				if (atts.category != undefined) {
					var ct = string.countFields (atts.category, ",");
					for (var i = 1; i <= ct; i++) { 
						var cat = string.trimWhitespace (string.nthField (atts.category, ",", i));
						add ("<category>" + encode (cat) + "</category>"); 
						}
					}
			
			//guid
				if (permalink != undefined) {
					add ("<guid>" + encode (permalink) + "</guid>"); 
					}
				else {
					if (atts.created != undefined) {
						add ("<guid isPermaLink=\"false\">" + md5 (atts.created) + "</guid>"); 
						}
					}
			//enclosure -- 7/2/13 by DW
				if (atts.enclosure != undefined) {
					if (atts.enclosureLength == undefined) {
						if (atts.enclosureError == undefined) {
							getEnclosureInfo (atts.enclosure, headline);
							}
						}
					else {
						add ("<enclosure url=\"" + atts.enclosure + "\" length=\"" + atts.enclosureLength + "\" type=\"" + atts.enclosureType + "\" />")
						}
					}
			add ("</item>"); indentlevel--;
			ctitems++;
			}
		
	add ("</channel>"); indentlevel--
	add ("</rss>"); indentlevel--
	
	addToPackage (package, "/rss.xml", xmltext); //2/13/14 by DW
	
	//write the RSS file, link into head if OPML file is public
		var f = pagetable.siteFolder + "rss.xml"; //7/7/14 by DW
		console.log ("cmsRenderRss: " + f);
		
		vendor.write (f, xmltext, function (metadata) {
			if (opmlhead.link != undefined) { //it's a named outline, therefore public
				var publicUrl = opmlhead.link + "rss.xml";
				if ((opmlhead.feed == undefined) || (opmlhead.feed != publicUrl)) { //6/30/13 by DW -- avoid writing to header, dirties outline, forces save, and rebuild of the RSS, etc. Oy!
					opmlhead.feed = publicUrl;
					$(idoutliner).concord ().op.setHeaders (opmlhead);
					console.log ("saveTabRss: set opmlhead.feed to " + publicUrl);
					}
				rssCloudPing (publicUrl); //6/21/15 by DW
				}
			});
	console.log ("saveTabRss: RSS build took " + secondsSince (starttime) + " seconds.");
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
			return (fargo.version ());
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
			s = multipleReplaceAll (s, pagetable, false, macroStart, macroEnd);
			return (s);
			}
		function menu  () {
			var adrmenu = pagetable.menus [pagetable.menuname], s;
			if (adrmenu == undefined) {
				return ("");
				}
			s = xmlGetMenuHtml (pagetable, adrbody, adrmenu);
			s = multipleReplaceAll (s, pagetable, false, macroStart, macroEnd);
			return (processMacros (pagetable, s));
			}
		function menuAsList  () { //12/21/13 by DW
			var adrmenu = pagetable.menus [pagetable.menuname], s;
			if (adrmenu == undefined) {
				return ("");
				}
			s = xmlGetMenuAsList (pagetable, adrbody, adrmenu);
			s = multipleReplaceAll (s, pagetable, false, macroStart, macroEnd);
			return (processMacros (pagetable, s));
			}
		function breadcrumbs () {
			var s = "<ul id=\"idBreadcrumbList\" class=\"breadcrumb\">";
			var adr, ixlast = stack.length - 2, siteurl = pagetable.opmlLink;
			
			if (string.endsWith (siteurl, "/")) {
				siteurl = string.mid (siteurl, 1, siteurl.length - 1);
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
			if (!getBoolean (pagetable.flDisqusComments)) {
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
					if (!string.endsWith (err.message, " is not defined")) {
						console.log ("processMacros error on \"" + s + "\": " + err.message);
						}
					return (macroStart + s + macroEnd); //pass it back unchanged
					}
				};
			
			while (i < (s.length - 1)) {
				if (s [i] == "<") {
					if (s [i+1] == "%") {
						var j, flfound = false;
						for (var j = i + 2; j <= s.length - 2; j++) {
							if ((s [j] == "%") && (s [j+1] == ">")) {
								var macrotext = string.mid (s, i + 3, j - i - 2);
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
		if (getBoolean (pagetable.flProfile)) {
			flprofile = true;
			console.profile (pagetable.path);
			}
	//render the page
		var templatetext, adrx = nomad;
		
		//pagetable initializations
			//bootstrapTheme -- 2/22/14 by DW -- convert from Fargo 1 to Fargo 2
				var lowertheme = pagetable.bootstrapTheme.toLowerCase ();
				if ((string.beginsWith (lowertheme, "http://bootswatch.com/")) && (string.endsWith (lowertheme, "/bootstrap.min.css"))) {
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
				if (!string.endsWith (pagetable.url, "/")) { //1/31/14 by DW
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
					if (getBoolean (pagetable.flMarkdown)) {
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
			
			htmltext = multipleReplaceAll (htmltext, pagetable.glossary, false); //page text can contain glossary items
			htmltext = multipleReplaceAll (htmltext, pagetable, false, macroStart, macroEnd);
			htmltext = processMacros (pagetable, htmltext); //page text can contain macros
			
			
			lastsegmenttime = addSegmentTime ("setupBodyText", lastsegmenttime);
			
			if (flFlowThroughMarkdown) {
				htmltext = xmlProcessMarkdown (htmltext); 
				
				lastsegmenttime = addSegmentTime ("flowThroughMarkdown", lastsegmenttime);
				}
		//replace Emoji codes -- 6/5/14 by DW
			if (getBoolean (pagetable.flEmojify)) {
				emojify.setConfig ({
					img_dir: "http://fargo.io/code/emojify/images/emoji",  
					});
				htmltext = emojify.replace (htmltext);
				pagetable.text = emojify.replace (pagetable.text); //this is where the title is stored
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
			templatetext = multipleReplaceAll (templatetext, pagetable.glossary, false); //templates can contain glossary items
			templatetext = multipleReplaceAll (templatetext, pagetable, false, macroStart, macroEnd);
			templatetext = processMacros (pagetable, templatetext); //templates can contain macros
			
			lastsegmenttime = addSegmentTime ("setupTemplate", lastsegmenttime);
		
		pagetable.bodytext = htmltext;
		htmltext = multipleReplaceAll (templatetext, pagetable, false, macroStart, macroEnd);
		
		lastsegmenttime = addSegmentTime ("readyToWriteFile", lastsegmenttime);
	//call finalFilter scripts -- 12/8/13 by DW
		pagetable.htmltext = htmltext;
		cmsRunScripts (pagetable, "finalFilter");
		htmltext = pagetable.htmltext;
	//write the file to the html folder
		var newpath = path; 
		
		if (xmlIsDocumentNode (nomad)) {
			if (string.endsWith (newpath, "/")) {
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
				if (!string.endsWith (newpath, "/")) {
					newpath += "/";
					}
				}
			newpath += appPrefs.cmsDefaultFilename;
			}
		
		addToPackage (package, "/" + newpath, htmltext); //1/1/14 by DW
		
		var f = pagetable.siteFolder + newpath;
		
		console.log ("cmsRenderPage: \"" + f + "\", " +  htmltext.length + " chars, " + secondsSince (starttime) + " secs.");
		
		vendor.write (f, htmltext, function (metadata) {
			});
		
		lastsegmenttime = addSegmentTime ("renderComplete", lastsegmenttime);
	
	if (flprofile) {
		console.profileEnd ();
		}
	return (htmltext);
	}

function getTabOpmltext (tab) {
	return ($("#" + tab.idOutline).concord ().op.outlineToXml (appPrefs.authorName, appPrefs.authorEmail));
	}
function cmsGetTabPagetable (tab, pagetable) { //12/16/13 by DW
	var starttime = new Date (), adrbody;
	adrbody = getXstuctBody (xstruct);
	initPagetable (tab, xstruct, pagetable);
	if (cmsGlobalDavePrefs != undefined) {
		for (var x in cmsGlobalDavePrefs) {
			pagetable [x] = cmsGlobalDavePrefs [x];
			}
		}
	xmlGatherPoundItems (adrbody, pagetable);
	debugMessage ("cmsGetTabPagetable: Took " + secondsSince (starttime) + " seconds.");
	}
function cmsNodeHasSubDocs (adrnode) {
	var visitSub = function (sub) {
		var type = sub.attributes.getOne ("type");
		if ((type != undefined) && (type != "include") && (type != "link") && (type != "tweet")) {
			flhasdocs = true;
			}
		else {
			sub.visitLevel (visitSub); 
			}
		}
	var flhasdocs = false;
	adrnode.visitLevel (visitSub);
	return (flhasdocs)
	}
function cmsGetPathToNode (theNode, flGenerateFileName, flGenerateNameAtt) {
	var getPath = function (flTypeRequired) {
		var path = "", flHitTypeYet = false;
		theNode.visitToSummit (function (theNode) {
			var type = theNode.attributes.getOne ("type");
			if ((type != undefined) && (type != "include")) {
				flHitTypeYet = true;
				}
			if (flHitTypeYet || (!flTypeRequired)) {
				var name = theNode.attributes.getOne ("name");
				if ((name == undefined) || (name.length == 0)) {
					name = getCanonicalName (theNode.getLineText ());
					if (flGenerateNameAtt) { //11/30/13 by DW
						if (name.length > 0) {
							theNode.attributes.setOne ("name", name);
							}
						}
					}
				path = "/" + name + path
				}
			return (true);
			});
		if ((!flHitTypeYet) && flTypeRequired) {
			return (undefined);
			}
		return (path);
		};
	
	if (flGenerateFileName == undefined) {
		flGenerateFileName = false;
		}
	if (flGenerateNameAtt == undefined) {
		flGenerateNameAtt = true;
		}
	
	
	var path = getPath (true);
	if (path == undefined) {
		path = getPath (false);
		if (flGenerateFileName) {
			path += "/" + appPrefs.cmsDefaultFilename;
			}
		}
	else {
		if (flGenerateFileName) {
			if (cmsNodeHasSubDocs (theNode)) {
				path += "/";
				}
			else {
				path += appPrefs.cmsFileSuffix;
				}
			}
		}
	return (path)
	}
function cmsGetPathToBarCursor (flGenerateFileName, flGenerateNameAtt) { //generate something like this -- "/2013/11/21/todo"
	
	var bch = $(getActiveOutliner ()).concord ().op.getCursorRef (), pagetable = new Object ();
	return (cmsGetPathToNode (bch, flGenerateFileName, flGenerateNameAtt));
	
	}
function cmsCursorInComment () { //12/22/13 by DW
	var bch = $(getActiveOutliner ()).concord ().op.getCursorRef (), flincomment = false;
	bch.visitToSummit (function (theNode) {
		if (getBoolean (theNode.attributes.getOne ("isComment"))) {
			flincomment = true;
			return (false);
			}
		if (isPoundItem (theNode.getLineText ())) {
			flincomment = true;
			return (false);
			}
		return (true); //keep looking
		});
	return (flincomment);
	}
function cmsRenderBarCursorHeadline (flRenderToSummit, flView) {
	var starttime = new Date ();
	
	if (flRenderToSummit == undefined) {
		flRenderToSummit = true;
		}
	if (flView == undefined) {
		flView = false;
		}
	
	
	cmsRenderPageInTab (getActiveTab (), cmsGetPathToBarCursor (false, false), flRenderToSummit, flView);
	
	
	debugMessage ("cmsRenderBarCursorHeadline: Build took " + secondsSince (starttime) + " seconds.");
	
	document.getElementById ("idDebugMessage").innerHTML = secondsSince (starttime) + " secs.";
	}
function cmsGetBarCursorFilePath () {
	var folder = cmsGetHtmlFolder (getActiveTab ());
	var path = cmsGetPathToBarCursor (true, false);
	path = string.delete (path, 1, 1); //pop off the first slash
	return (folder + path);
	}
function cmsBarCursorViewable () { //if true, Fargo displays the eye icon
	var headers = getActiveHeaders ();
	if (headers.link != undefined) {
		return (true);
		}
	
	var f = cmsGetBarCursorFilePath ();
	var url = cmsFindSharedUrl (f);
	return (url != undefined);
	}
function cmsViewBarCursorHeadline () {
	var headers = getActiveHeaders ();
	if (headers.link != undefined) {
		var url =  string.popTrailing (headers.link, "/") + cmsGetPathToBarCursor (true, true);
		window.open (url);
		return (true);
		}
	
	var f = cmsGetBarCursorFilePath ();
	var url = cmsFindSharedUrl (f);
	if (url != undefined) {
		window.open (url);
		}
	return (true);
	}
function cmsTossNodeStackCache () {
	while (cmsNodeStackCache.length > 0) {
		cmsNodeStackCache.pop ();
		}
	cmsNodeStackCache = []; //7/14/14 by DW
	}
function cmsRenderAllPages (tab) {
	fargoStartSpin (); //2/2/14 by DW
	flCmsRenderAllPages = true;
	cmsTabForRender = tab;
	}
function cmsRenderBarCursor (tab, flGenerateNameAtts) {
	fargoStartSpin (); //2/2/14 by DW
	flCmsRenderBarCursor = true;
	cmsTabForRender = tab;
	flCmsGenNameAtts = flGenerateNameAtts;
	bchForRenderBarCursor = $(getActiveOutliner ()).concord ().op.getCursorRef (); //1/10/14 by DW
	}
function cmsRenderBarCursorNow (tab, flGenerateNameAtts, flCursorOnly) { 
	if (!cmsCursorInComment ()) {
		if (bchForRenderBarCursor == undefined) { //1/23/14 by DW
			bchForRenderBarCursor = $(getActiveOutliner ()).concord ().op.getCursorRef (); 
			}
		if (flCursorOnly == undefined) { //1/31/14 by DW
			flCursorOnly = false;
			}
		var doRender = function () {
			var starttime = new Date (), package = [], pagetableForRss = {};
			var xstruct = getTabXstruct (getTabParam (tab));
			var adrbody = getXstuctBody (xstruct);
			var path = cmsGetPathToBarCursor (false, flGenerateNameAtts); //something like this -- /2013/11/21/todo
			while (true) {
				cmsRenderPage (getTabParam (tab), xstruct, path, package);
				if (path.length == 0) {
					break;
					}
				if (flCursorOnly) { //1/31/14 by DW
					return;
					}
				path = string.popLastField (path, "/");
				}
			
			//render subordinate document nodes -- 1/10/14 by DW
				var visitSub = function (sub) {
					var type = sub.attributes.getOne ("type");
					if ((type != undefined) && (type != "include") && (type != "link") && (type != "tweet")) {
						var path = cmsGetPathToNode (sub, false, flGenerateNameAtts);
						cmsRenderPage (getTabParam (tab), xstruct, path, package);
						}
					else {
						sub.visitLevel (visitSub); 
						}
					}
				bchForRenderBarCursor.visitLevel (visitSub);
			
			//build pagetableForRss -- 7/7/14 by DW -- xxx
				initPagetable (tab, xstruct, pagetableForRss);
				if (cmsGlobalDavePrefs != undefined) {
					for (var x in cmsGlobalDavePrefs) {
						pagetableForRss [x] = cmsGlobalDavePrefs [x];
						}
					}
				if (cmsGlobalPrefs != undefined) {
					for (var attname in cmsGlobalPrefs) {
						if ((isPoundItemTableName (attname)) && (pagetableForRss [attname] != undefined)) { 
							var x = cmsGlobalPrefs [attname];
							for (var itemname in x) {
								pagetableForRss [attname] [itemname] = x [itemname];
								}
							}
						else {
							pagetableForRss [attname] = cmsGlobalPrefs [attname];
							}
						}
					}
				xmlGatherAttributes (adrbody, pagetableForRss);
				xmlGatherPoundItems (adrbody, pagetableForRss);
			
			cmsRenderRss (tab, package, pagetableForRss); //2/13/14 by DW -- xxx
			
			cmsTossNodeStackCache ();
			
			writePackage (tab, package, function () {
				});
			debugMessage ("cmsRenderBarCursor: Build took " + secondsSince (starttime) + " seconds.");
			document.getElementById ("idDebugMessage").innerHTML = secondsSince (starttime) + " secs.";
			}
		tab = getTabParam (tab);
		if (tab.publicUrl == undefined) {
			vendor.createSharedUrl (tab.url, function (publicUrl) {
				tab.publicUrl = publicUrl;
				doRender ();
				});
			}
		else {
			doRender ();
			}
		}
	}
function cmsGetDavePrefs () {
	var opmltext = xmlReadFile (urlDavePrefs);
	var xstruct = $($.parseXML (opmltext));
	var adropml = xmlGetAddress (xstruct, "opml");
	var adrhead = xmlGetAddress (adropml, "head");
	var adrbody = xmlGetAddress (adropml, "body");
	cmsGlobalDavePrefs = new Object ();
	xmlGatherPoundItems (adrbody, cmsGlobalDavePrefs);
	}
function cmsGetPrefs () {
	vendor.exists (cmsPrefsOpmlPath, function (file) {
		vendor.read (cmsPrefsOpmlPath, function (data) {
			var xstruct = $($.parseXML (data));
			var adropml = xmlGetAddress (xstruct, "opml");
			var adrhead = xmlGetAddress (adropml, "head");
			var adrbody = xmlGetAddress (adropml, "body");
			cmsGlobalPrefs = new Object ();
			xmlGatherPoundItems (adrbody, cmsGlobalPrefs);
			console.log ("cmsGetPrefs."); //12/23/13 by DW
			});
		});
	}
function cmsSaveCallback () { //called after an outline is saved -- reload global prefs if the user edited them
	var tab = getActiveTab ();
	if (string.lower (tab.url) == string.lower (cmsPrefsOpmlPath)) {
		cmsGetPrefs ();
		}
	}
function cmsSetupMarkdown () { //1/4/14 by DW
	markdown.hooks.set ("plainLinkText", function (s) { //don't hot-up plain text links
		console.log ("markdown.hooks.set: " + s);
		return (s); 
		});
	}
function cmsGetPublishServer () { //1/24/14 by DW
	var server = appPrefs.cmsPublishServer;
	if ((server == "pub.fargo.io") || (server.length == 0)) { //5/11/15 by DW
		console.log ("cmsGetPublishServer: using the default fargopub server == " + defaultFargoPubServer);
		server = defaultFargoPubServer;
		}
	return (server);
	}
function cmsBackgroundProcess () {
	var xstruct, adrbody;
	if (!flCmsStarted) { //only startup once
		flCmsStarted = true;
		cmsSetupMarkdown (); //1/4/14 by DW
		cmsGetPrefs ();
		cmsGetDavePrefs ();
		cmsRestoreUrls ();
		}
	else {
		cmsCheckLinkHosting (); //1/2/14 by DW
		}
	if (flCmsRenderBarCursor) {
		flCmsRenderBarCursor = false;
		cmsRenderBarCursorNow (cmsTabForRender, flCmsGenNameAtts);
		}
	if (flCmsRenderAllPages) {
		var starttime = new Date (), package = [];
		var tab = cmsTabForRender;
		flCmsRenderAllPages = false;
		xstruct = getTabXstruct (getTabParam (tab));
		adrbody = getXstuctBody (xstruct);
		function showTimeElapsed () {
			document.getElementById ("idDebugMessage").innerHTML = secondsSince (starttime) + " secs.";
			}
		function doLevel (adrx, path) {
			var htmltext;
			if (xmlIsDocumentNode (adrx)) {
				cmsRenderPage (getTabParam (tab), xstruct, path, package);
				showTimeElapsed ();
				return; //don't go deeper
				}
			cmsRenderPage (getTabParam (tab), xstruct, path, package);
			showTimeElapsed ();
			xmlOneLevelVisit (adrx, function (adrsub) {
				if (xmlNodeIsContent (adrsub)) {
					doLevel (adrsub, path + "/" + xmlGetNodeName (adrsub));
					}
				return (true); 
				});
			}
		doLevel (adrbody, "");
		cmsTossNodeStackCache ();
		writePackage (tab, package, function () {
			});
		debugMessage ("cmsRenderAllPagesInTab: Build took " + secondsSince (starttime) + " seconds.");
		}
	}

