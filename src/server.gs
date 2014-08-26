function isDebug() { return true; }

// Include files in views.
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// Display form.
function doGet() {
  var out = HtmlService.createTemplateFromFile('view').evaluate();
  out.setTitle('Submit an Article | JLBC');
  return out;
}

// Check form.
function doCheck(form) {
  var result = [];
  if (!form.headline) { result.push('Missing headline.'); }
  if (!form.author) { result.push('Missing author.'); }
  if (!form.email) { result.push('Missing email.'); }
  if (!form.phone) { result.push('Missing phone.'); }
  if (!form.article) { result.push('Missing article.'); }
  return result;
}

// Process form.
function doSubmit (form) {
  var result = {status: 'success', data: {}};
  try {
    var errs = doCheck(form);
    if (0 !== errs.length) {
      result = {status: 'fail', data: errs};
    } else {
      var
        folder = server.createFolder(form),
        photos = server.uploadPhotos(folder, form),
        doc = server.createDocument(folder, form, photos);

      server.notifyEditors(folder);
      result.data = { url: folder.getUrl() };
    }//end if: check for errors
  } catch (error) {
    result = {status: 'error', data: '' + error};
  }//end try

  Logger.log(result);
  return result;
}

// Private Methods //

var
  server = {},
  config = {
    path_root: 'JLBC',
    path_time: 'MMM yyyy',
    path_article: '{author} - {headline}'
  };

// Get or create a folder.
server.putFolder = function (name, parent) {
  parent = parent || DriveApp;
  var search = parent.getFoldersByName(name);
  return search.hasNext() ? search.next() : parent.createFolder(name);
};

// Get or create the destination folder.
server.createFolder = function (form) {
  var
    path_root = server.putFolder(config.path_root),
    path_time = server.putFolder(
      Utilities.formatDate(new Date(), 'GMT', config.path_time),
      path_root),
    path_dest = server.putFolder(
      config.path_article
        .replace('{author}', form.author)
        .replace('{headline}', form.headline),
      path_time);

  return path_dest;
};

// Upload a single photo.
server.uploadPhoto = function (folder, idx, photo, caption, credit) {
  Logger.log('Start: uploadPhoto: ' + (idx + 1));
  var
    file = folder.createFile(photo),
    text = caption + ' (Credit: ' + credit + ')';

  file.setName('Photo ' + (idx + 1));
  file.setDescription(text);

  return text;
};

// Upload the photos in the form.
server.uploadPhotos = function (folder, form) {
  Logger.log('Start: uploadPhotos');
  var result = [];
  if (!form.photo) { // none
    return result;
  } else if (!Array.isArray(form.photo)) { // one
    result.push(server.uploadPhoto(
      folder, 0, form.photo, form.caption, form.credit
    ));
  } else { // many
    for (var i = 0, L = form.photo.length; i < L; i++) {
      result.push(server.uploadPhoto(
        folder, i, form.photo[i], form.caption[i], form.credit[i]
      ));
    }//end for: photos uploaded
  }//end if: have an array

  return result;
};

// Create a Google Doc from the form.
server.createDocument = function (folder, form, captions) {
  Logger.log('Start: createDocument');
  var
    doc = DocumentApp.create(form.headline),
    body = doc.getBody(),
    par,
    lines = [],
    style = {},
    write = function (str, attr) {
      return body.appendParagraph(str).setAttributes(attr || style);
    };

  style[DocumentApp.Attribute.LINE_SPACING] = 1;
  style[DocumentApp.Attribute.FONT_FAMILY] = DocumentApp.FontFamily.TIMES_NEW_ROMAN;
  style[DocumentApp.Attribute.FONT_SIZE] = 12;

  write('Approx. size: ' + form.article.split(/\s+/).length
        + ' words (' + form.pagesize + ')');
  write('Proposed Category: ' + (form.category ? form.category : 'None'));

  for (var i = 0, L = captions.length; i < L; i++) {
    write('Photo ' + (i + 1) + ': ' + captions[i]);
  }//end for: captions added

  write('Contact: ' + form.email + ' ' + form.phone);

  style[DocumentApp.Attribute.SPACING_BEFORE] = 0;
  style[DocumentApp.Attribute.SPACING_AFTER] = 12;

  style[DocumentApp.Attribute.BOLD] = true;
  write(form.headline + '\nBy ' + form.author);
  style[DocumentApp.Attribute.BOLD] = false;

  lines = lines.concat(form.article.split(/\r?\n/));

  for (var i = 0, L = lines.length; i < L; i++) {
    var line = lines[i].trim();
    if (line) { write(line); }
  }//end for: lines added

  if (form.hasbio) {
    style[DocumentApp.Attribute.ITALIC] = true;
    write(form.bio);
    style[DocumentApp.Attribute.ITALIC] = false;
  }// end if: added bio

  folder.addFile(DriveApp.getFileById(doc.getId()));
  return doc;
};

// Notify the folder owner and editors.
server.notifyEditors = function (folder) {
  Logger.log('Start: notifyEditors');
  var
    editors = server.putFolder(config.path_root).getEditors(),
    cc = [],
    bcc = [],
    folderurl = folder.getUrl()
      .replace('https://docs.google.com/folderview?id=', 'https://drive.google.com/drive/u/0/#folders/')
      .replace('&usp=drivesdk', ''),
    msg = {
      to: folder.getOwner().getEmail(), // by default
      noReply: true, // Google Apps only
      replyTo: 'editors@jewishlinkbc.com',
      name: 'JLBC Zinc',
      subject: '[' + config.path_root + '] ' + folder.getName(),
      htmlBody:
        'New submission: ' +
        '<a href="' + folderurl + '">' + folder.getName() + '</a>.' +
        '<br /><br /><em>This is an automated message.'
    };

  if (!isDebug()) { msg.to = 'editors@jewishlinkbc.com'; }
  bcc.push(folder.getOwner().getEmail());
  for (var i = 0, L = editors.length; i < L; i++) {
    cc.push(editors[i].getEmail());
  }//end for: list of editors

  if (cc.length) { msg.cc = cc.join(','); }
  if (bcc.length) { msg.bcc = bcc.join(','); }

  Logger.log(msg);
  MailApp.sendEmail(msg);
};
