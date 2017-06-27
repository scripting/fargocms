# fargocms

This is the CMS from Fargo.

`npm install fargocms`

### Background

On June 28, Fargo will stop working because of a change in the Dropbox API. They told us about the change over a year in advance, and it was a good time to announce that that would be the end of Fargo as a product. We already had a better outliner, Little Outliner, one that didn't require Dropbox. And Dropbox was not a popular choice with users. It was a great place to start, and we totally appreciate the opportunity to work on the Dropbox platform. It helped get everything going.

One thing remained in Fargo that was not replicated elsewhere, the content management system that was built into it. Now with the release of the fargocms package, that last bit is taken care of. Any applications that depended on it can be rebuilt using this module. This was important to preserve the ability to edit the docs for Fargo and other projects that depended on the CMS. It was important to get this ported while Fargo was running so I could probe around inside to answer questions about what the CMS depended on. 

### Examples

Here are some examples of websites that are deployed using this package.



1. A <a href="http://fargocms.com/dave/2014/01/01/whatWouldAPublicNotepadDo.html">blog post</a> from Scripting News. You can click around on the navigation links, they should work. 

2. The <a href="http://fargocms.com/happy/">home page</a> of the Happy Friends docs site. 

3. The <a href="http://storage.littleoutliner.com/users/davewiner/electric/fargoDocs.opml">OPML</a> for the Fargo Docs site. 

4. The <a href="http://fargocms.com/docs/">rendering</a> of that site. The <a href="http://fargo.io/docs/">original version</a> as rendered by Fargo.

### What's not ported

Here I will list things that do not work that used to work. Mostly things that are not core to the mission of the CMS.

1. Presentation type.

2. Stream type.

2. Embedded tweets.

3. RSS feed for blogs.

The source code for the original Fargo CMS is here, should we eventually want to port the remaining bits. 

