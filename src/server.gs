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
    style = {};

  style[DocumentApp.Attribute.FONT_FAMILY] = DocumentApp.FontFamily.TIMES_NEW_ROMAN;
  style[DocumentApp.Attribute.FONT_SIZE] = 12;

  lines.push('Approx. size: ' + form.pagesize);
  lines.push('Proposed Category: ' + (form.category ? form.category : 'None'));

  for (var i = 0, L = captions.length; i < L; i++) {
    lines.push('Photo ' + (i + 1) + ': ' + captions[i]);
  }//end for: captions added

  lines.push(form.headline);
  lines.push(form.author + ' ' + form.email + ' ' + form.phone);
  lines = lines.concat(form.article.split(/\r?\n/));

  for (var i = 0, L = lines.length; i < L; i++) {
    var line = lines[i].trim();
    if (!line) { continue; }

    par = body.appendParagraph(lines[i]);
    par.setAttributes(style);
  }//end for: lines added

  if (form.hasbio) {
    par = body.appendParagraph(form.bio);
    style[DocumentApp.Attribute.ITALIC] = true;
    par.setAttributes(style);
  }// end if: added bio

  folder.addFile(DriveApp.getFileById(doc.getId()));
  return doc;
};

// Notify the folder owner and editors.
server.notifyEditors = function (folder) {
  Logger.log('Start: notifyEditors');
  var
    editors = folder.getEditors(),
    cc = [],
    msg = {
      to: folder.getOwner().getEmail(),
      noReply: true,
      subject: '[' + config.path_root + '] ' + folder.getName(),
      htmlBody:
        'New submission: ' +
        '<a href="' + folder.getUrl() + '">' + folder.getName() + '</a>.' +
        '<br /><br /><em>This is an automated message.'
    };

  for (var i = 0, L = editors.length; i < L; i++) {
    cc.push(editors[i].getEmail());
  }//end for: editors notified

  if (cc.length) { msg.cc = cc.join(','); }
  Logger.log(msg);
  MailApp.sendEmail(msg);
};
