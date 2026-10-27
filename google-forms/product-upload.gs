/**
 * Ndeeelicious product upload form (Google Apps Script).
 *
 * 1. Set Script properties API_BASE_URL and API_KEY (see README.md), optionally NOTIFY_EMAIL.
 *    Only admins listed in the app's PRODUCT_IMPORT_ADMIN_EMAILS can submit; the form records each
 *    respondent's verified Google email and the shop credits the product to that admin.
 * 2. Run createProductForm() once. It builds the form and installs the submit trigger.
 * 3. In the form editor, add a "File upload" question for photos (Apps Script cannot create one).
 *
 * Each submission creates a product through POST /api/integrations/products, then uploads every photo
 * through POST /api/integrations/products/images. The result is emailed to NOTIFY_EMAIL (default: you).
 *
 * Retrying: a failure email has a link to fix the answers and resubmit that same response. To retry
 * failures unchanged (for example after the site was down), run retryFailedSubmissions(). A response that
 * already created a product is never imported twice. Forms created before retrying existed: run
 * enableFixLinks() once. Forms that still ask for "Lead time (hours)": run updatePreparationQuestions() once.
 */

const TITLES = {
  name: "Product name",
  category: "Category",
  collection: "Sub-category",
  shortDescription: "Short description",
  description: "Full description",
  price: "Price (CAD)",
  salePrice: "Sale price (CAD)",
  variants: "Sizes / packs",
  status: "Publish",
  featured: "Feature on the home page?",
  taxClass: "Tax classification",
  preparationHours: "Preparation time (hours)",
  preparationMinutes: "Preparation time (minutes)",
  trackInventory: "Track stock?",
  lowStockThreshold: "Low stock alert at",
  ingredients: "Ingredients",
  allergens: "Allergens",
  storageInstructions: "Storage instructions",
  preparationInstructions: "Preparation instructions",
  flavours: "Cake flavours",
  fillings: "Cake fillings",
  imageLinks: "Image links",
  photos: "Photos",
};

const CATEGORIES = {
  "Ready to order": "PASTRIES",
  "Ready to bake": "READY_TO_BAKE",
  "Custom cakes": "CUSTOM_CAKES",
};

const STATUSES = {
  "Draft (review in admin before it goes live)": "DRAFT",
  "Active (live on the shop straight away)": "ACTIVE",
};

const TAX_CLASSES = {
  "Setup required": "REQUIRES_REVIEW",
  "Eligible basic grocery (zero rated)": "ZERO_RATED_GROCERY",
  "Eligible sweet single servings (pack rule)": "SWEET_SINGLE_SERVING",
  "Eligible full cake (zero rated)": "FULL_CAKE",
  "Eligible edible wedding cake (zero rated)": "WEDDING_CAKE",
  "Standard taxable": "STANDARD_TAXABLE",
};

// Older forms asked for one combined lead time; their answers are read as preparation hours.
const LEGACY_LEAD_TIME_TITLE = "Lead time (hours)";
const PREPARATION_HELP =
  "How long this product takes to make. Blank means none. Every order also waits the shop's 24-hour " +
  "minimum lead time; customers get whichever is longer.";

const ALLERGENS = ["Wheat / gluten", "Milk", "Eggs", "Peanuts", "Tree nuts", "Soy", "Sesame"];

// Vercel rejects request bodies over 4.5 MB, so photos are capped below that.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
// Longest side of the copy made for photos that are too big or not a web format, as in the admin editor.
const RESIZED_IMAGE_PIXELS = 2000;

/** Run once. Creates the form and the submit trigger. */
function createProductForm() {
  config_(); // fail early if the script properties are missing
  const form = FormApp.create("Ndeeelicious – Add a product");
  form
    .setDescription(
      "Each response creates a product on the Ndeeelicious shop. Prices are in Canadian dollars. " +
        "Choose Draft to check the product in the admin before it goes live.",
    )
    .setConfirmationMessage("Thanks! The product is being added – you will get an email with the result.")
    .setEmailCollectionType(FormApp.EmailCollectionType.VERIFIED)
    .setAllowResponseEdits(true); // powers the "fix and resubmit" link in failure emails

  form.addTextItem().setTitle(TITLES.name).setRequired(true);
  form
    .addMultipleChoiceItem()
    .setTitle(TITLES.category)
    .setChoiceValues(Object.keys(CATEGORIES))
    .setRequired(true);
  form
    .addTextItem()
    .setTitle(TITLES.collection)
    .setHelpText("Optional. Must match an existing sub-category name in the admin, e.g. Cupcakes.");
  form
    .addParagraphTextItem()
    .setTitle(TITLES.shortDescription)
    .setHelpText("One or two sentences for product cards. Required unless it is a custom cake.");
  form
    .addParagraphTextItem()
    .setTitle(TITLES.description)
    .setHelpText("Shown on the product page. Required unless it is a custom cake.");

  const money = FormApp.createTextValidation()
    .requireNumberGreaterThanOrEqualTo(0)
    .setHelpText("Enter a number, e.g. 24.50")
    .build();
  form.addTextItem().setTitle(TITLES.price).setValidation(money).setRequired(true);
  form
    .addTextItem()
    .setTitle(TITLES.salePrice)
    .setHelpText("Optional. Must be lower than the price.")
    .setValidation(money);
  form
    .addParagraphTextItem()
    .setTitle(TITLES.variants)
    .setHelpText(
      "Optional. One per line: Name | Price | Pack size or serves | Stock\n" +
        "e.g.  Box of 6 | 18 | 6\n        Box of 12 | 32.50 | 12 | 10\n" +
        "Leave blank for a single option at the price above.",
    );

  form
    .addMultipleChoiceItem()
    .setTitle(TITLES.status)
    .setChoiceValues(Object.keys(STATUSES))
    .setRequired(true);
  form.addMultipleChoiceItem().setTitle(TITLES.featured).setChoiceValues(["No", "Yes"]);
  form
    .addListItem()
    .setTitle(TITLES.taxClass)
    .setHelpText("Confirm the CRA classification. Leave as Setup required if unsure.")
    .setChoiceValues(Object.keys(TAX_CLASSES));
  addPreparationQuestions_(form);
  form.addMultipleChoiceItem().setTitle(TITLES.trackInventory).setChoiceValues(["No", "Yes"]);
  form
    .addTextItem()
    .setTitle(TITLES.lowStockThreshold)
    .setValidation(FormApp.createTextValidation().requireWholeNumber().build());

  form.addParagraphTextItem().setTitle(TITLES.ingredients);
  form.addCheckboxItem().setTitle(TITLES.allergens).setChoiceValues(ALLERGENS).showOtherOption(true);
  form.addParagraphTextItem().setTitle(TITLES.storageInstructions);
  form.addParagraphTextItem().setTitle(TITLES.preparationInstructions);
  form
    .addTextItem()
    .setTitle(TITLES.flavours)
    .setHelpText("Custom cakes only. Comma separated, e.g. Vanilla, Chocolate, Red velvet");
  form
    .addTextItem()
    .setTitle(TITLES.fillings)
    .setHelpText("Custom cakes only. Comma separated.");
  form
    .addParagraphTextItem()
    .setTitle(TITLES.imageLinks)
    .setHelpText(
      "Optional. One link per line: Google Drive file links (shared with you) or direct image URLs. " +
        "JPG, PNG, WebP or AVIF under 4 MB.",
    );

  ScriptApp.newTrigger("onProductSubmit").forForm(form).onFormSubmit().create();
  PropertiesService.getScriptProperties().setProperty("FORM_ID", form.getId());
  console.log("Form created. Edit: " + form.getEditUrl());
  console.log("Share: " + form.getPublishedUrl());
  console.log('Now add a "File upload" question titled "Photos" in the form editor.');
}

/** Installed trigger: runs for every new or edited form response. */
function onProductSubmit(e) {
  processResponse_(e.response);
}

/** Run this to retry every failed submission as it is, e.g. after the site was down. */
function retryFailedSubmissions() {
  const failed = failedSubmissions_();
  if (!failed.length) {
    console.log("Nothing to retry: no failed submissions.");
    return;
  }
  const form = productForm_();
  failed.forEach((entry) => {
    let response;
    try {
      response = form.getResponse(entry.id);
    } catch (_) {
      // The response was deleted from the form; nothing left to retry.
      forget_("failed:" + entry.id);
      console.log("Skipped " + entry.name + ": the response no longer exists.");
      return;
    }
    const added = processResponse_(response);
    console.log((added ? "Added " : "Still failing ") + entry.name);
  });
}

/** Run this to list failed submissions and why they failed, in the execution log. */
function listFailedSubmissions() {
  const failed = failedSubmissions_();
  if (!failed.length) console.log("No failed submissions.");
  failed.forEach((entry) => console.log(entry.at + "  " + entry.name + "  —  " + entry.reason));
}

/** Run once on a form created before retrying existed, to turn on the "fix and resubmit" links. */
function enableFixLinks() {
  productForm_().setAllowResponseEdits(true);
  console.log("Fix links are on. Failure emails will include a link to correct and resubmit.");
}

/**
 * Run once on a form that still asks for "Lead time (hours)". That question becomes
 * "Preparation time (hours)" (earlier answers are kept) and a minutes question is added after it.
 */
function updatePreparationQuestions() {
  const form = productForm_();
  const titles = form.getItems().map((item) => item.getTitle());
  if (titles.indexOf(TITLES.preparationMinutes) >= 0) {
    console.log("The form already asks for preparation time in hours and minutes.");
    return;
  }
  const legacy = form.getItems().filter((item) => item.getTitle() === LEGACY_LEAD_TIME_TITLE)[0];
  if (!legacy) throw new Error('No "' + LEGACY_LEAD_TIME_TITLE + '" question found. Add the questions by hand.');
  const hours = legacy
    .asTextItem()
    .setTitle(TITLES.preparationHours)
    .setHelpText(PREPARATION_HELP)
    .setValidation(preparationValidation_(null));
  const minutes = form
    .addTextItem()
    .setTitle(TITLES.preparationMinutes)
    .setValidation(preparationValidation_(59));
  form.moveItem(minutes, hours.getIndex() + 1);
  console.log("Done. The form now asks for preparation time in hours and minutes.");
}

function addPreparationQuestions_(form) {
  form
    .addTextItem()
    .setTitle(TITLES.preparationHours)
    .setHelpText(PREPARATION_HELP)
    .setValidation(preparationValidation_(null));
  form.addTextItem().setTitle(TITLES.preparationMinutes).setValidation(preparationValidation_(59));
}

function preparationValidation_(max) {
  const validation = FormApp.createTextValidation();
  return (max == null ? validation.requireNumberGreaterThanOrEqualTo(0) : validation.requireNumberBetween(0, max))
    .setHelpText(max == null ? "Enter a number of hours, e.g. 2" : "Enter minutes from 0 to 59, e.g. 45")
    .build();
}

// Hours plus minutes, in hours rounded to whole minutes. Blank means no preparation time.
function preparationHours_(answers) {
  const hoursAnswer = answers[TITLES.preparationHours] || answers[LEGACY_LEAD_TIME_TITLE];
  const hours = hoursAnswer ? number_(hoursAnswer, TITLES.preparationHours) : 0;
  const minutes = answers[TITLES.preparationMinutes]
    ? number_(answers[TITLES.preparationMinutes], TITLES.preparationMinutes)
    : 0;
  return Math.round(hours * 60 + minutes) / 60;
}

// Imports one response and emails the result. Returns true when the product exists afterwards.
function processResponse_(response) {
  const id = response.getId();
  const answers = {};
  const photos = [];
  response.getItemResponses().forEach((item) => {
    answers[item.getItem().getTitle()] = item.getResponse();
    // Photos come from any File upload question, so a renamed "Photos" question still works.
    if (item.getItem().getType() === FormApp.ItemType.FILE_UPLOAD) photos.push.apply(photos, item.getResponse() || []);
  });
  answers[TITLES.photos] = photos;
  const submitter = response.getRespondentEmail();
  const name = text_(answers[TITLES.name]) || "(no name)";
  const signature = submitter ? "\n\nSubmitted by " + submitter : "";

  // An edited or retried response that already created a product must not create a second one.
  const done = remembered_("done:" + id);
  if (done) {
    notify_(
      "Already added: " + name,
      '"' + name + '" was already created from this form response (' + done.slug + "), so nothing was added again.\n" +
        "To change it, edit the product in the admin: " + config_().baseUrl + "/admin/products" + signature,
    );
    return true;
  }

  try {
    if (!submitter) throw new Error("The form did not record an email. Sign in to Google and submit again.");
    const product = buildProduct_(answers);
    const created = request_(
      "/api/integrations/products",
      { contentType: "application/json", payload: JSON.stringify(product) },
      submitter,
    );
    remember_("done:" + id, { productId: created.id, slug: created.slug });
    forget_("failed:" + id);
    const imageErrors = uploadImages_(created.id, product.name, answers, submitter);
    notify_(
      "Product added: " + name,
      [
        '"' + name + '" was created as ' + created.status + " (" + created.slug + ").",
        "Shop link: " + config_().baseUrl + "/product/" + created.slug,
        "Admin: " + config_().baseUrl + "/admin/products",
        imageErrors.length
          ? "\nSome photos were not added. Add them to the product in the admin:\n- " + imageErrors.join("\n- ")
          : "",
      ].join("\n") + signature,
    );
    return true;
  } catch (error) {
    console.error(error);
    remember_("failed:" + id, { name: name, reason: error.message, at: new Date().toISOString() });
    let fixLink = "";
    try {
      fixLink = response.getEditResponseUrl() || "";
    } catch (_) {
      // Response editing is off for this form; run enableFixLinks() to get fix links.
    }
    notify_(
      "Product NOT added: " + name,
      [
        "The form response could not be imported.",
        "",
        "Reason: " + error.message,
        "",
        fixLink
          ? "To fix it: open this link, correct the answer, and submit. It retries automatically:\n" + fixLink
          : "To fix it: submit the form again with the answer corrected.",
        "",
        "If nothing needs changing (for example the site was briefly down), open the script and run " +
          "retryFailedSubmissions to try again as is.",
      ].join("\n") + signature,
    );
    return false;
  }
}

function productForm_() {
  const id = PropertiesService.getScriptProperties().getProperty("FORM_ID");
  if (!id) throw new Error("FORM_ID is missing. Run createProductForm first.");
  return FormApp.openById(id);
}

function failedSubmissions_() {
  const properties = PropertiesService.getScriptProperties().getProperties();
  return Object.keys(properties)
    .filter((key) => key.indexOf("failed:") === 0)
    .map((key) => Object.assign({ id: key.slice("failed:".length) }, JSON.parse(properties[key])))
    .sort((a, b) => (a.at < b.at ? -1 : 1));
}

function remember_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(value));
}

function remembered_(key) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  return value ? JSON.parse(value) : null;
}

function forget_(key) {
  PropertiesService.getScriptProperties().deleteProperty(key);
}

function buildProduct_(answers) {
  const category = CATEGORIES[text_(answers[TITLES.category])];
  if (!category) throw new Error("Choose a category.");
  return {
    name: text_(answers[TITLES.name]),
    category: category,
    collection: text_(answers[TITLES.collection]),
    shortDescription: text_(answers[TITLES.shortDescription]),
    description: text_(answers[TITLES.description]),
    price: number_(answers[TITLES.price], TITLES.price),
    salePrice: answers[TITLES.salePrice] ? number_(answers[TITLES.salePrice], TITLES.salePrice) : null,
    status: STATUSES[text_(answers[TITLES.status])] || "DRAFT",
    featured: text_(answers[TITLES.featured]) === "Yes",
    taxClass: TAX_CLASSES[text_(answers[TITLES.taxClass])] || "REQUIRES_REVIEW",
    preparationHours: preparationHours_(answers),
    trackInventory: text_(answers[TITLES.trackInventory]) === "Yes",
    lowStockThreshold: answers[TITLES.lowStockThreshold] ? number_(answers[TITLES.lowStockThreshold], TITLES.lowStockThreshold) : 0,
    ingredients: text_(answers[TITLES.ingredients]),
    allergens: (answers[TITLES.allergens] || []).map(text_).filter(Boolean),
    storageInstructions: text_(answers[TITLES.storageInstructions]),
    preparationInstructions: text_(answers[TITLES.preparationInstructions]),
    flavours: splitList_(answers[TITLES.flavours]),
    fillings: splitList_(answers[TITLES.fillings]),
    variants: parseVariants_(answers[TITLES.variants]),
  };
}

// "Name | Price | Pack size | Stock" per line; everything after the name is optional.
function parseVariants_(value) {
  return lines_(value).map((line, index) => {
    const parts = line.split("|").map((part) => part.trim());
    const label = "Sizes / packs line " + (index + 1);
    return {
      name: parts[0],
      price: parts[1] ? number_(parts[1], label + " price") : null,
      packQuantity: parts[2] ? number_(parts[2], label + " pack size") : null,
      stock: parts[3] ? number_(parts[3], label + " stock") : null,
    };
  });
}

function uploadImages_(productId, productName, answers, submitter) {
  const errors = [];
  const sources = []
    .concat(answers[TITLES.photos] || []) // File upload answers are Drive file IDs
    .concat(lines_(answers[TITLES.imageLinks]));
  sources.slice(0, 12).forEach((source, index) => {
    const send = (blob) =>
      request_("/api/integrations/products/images", {
        payload: {
          productId: productId,
          altText: productName + (index ? " photo " + (index + 1) : ""),
          sortOrder: String(index),
          file: blob,
        },
      }, submitter);
    try {
      const image = uploadableImage_(source);
      try {
        send(image.blob);
      } catch (error) {
        // The shop can refuse a photo whose name says JPG but whose contents are not (often iPhone HEIC).
        if (!image.driveId || image.resized) throw error;
        send(resizedDriveImage_(image.driveId));
      }
    } catch (error) {
      const label = /^[\w-]{20,}$/.test(source) ? "Photo " + (index + 1) : String(source).slice(0, 120);
      errors.push(label + ": " + error.message);
    }
  });
  if (sources.length > 12) errors.push("Only the first 12 photos were used.");
  return errors;
}

// Phone photos are often over 4 MB or in iPhone's HEIC format. A Drive photo that would be refused is
// replaced by a JPEG copy Drive renders, at most 2000 px on its longest side. Web links must already fit.
function uploadableImage_(source) {
  const driveId = /^[\w-]{20,}$/.test(source)
    ? source
    : (String(source).match(/(?:\/d\/|[?&]id=)([\w-]{20,})/) || [])[1];
  const blob = driveId ? DriveApp.getFileById(driveId).getBlob() : downloadImage_(source);
  const problem = imageProblem_(blob);
  if (!problem) return { blob: blob, driveId: driveId, resized: false };
  if (!driveId) throw new Error(problem);
  return { blob: resizedDriveImage_(driveId, problem), driveId: driveId, resized: true };
}

function imageProblem_(blob) {
  if (IMAGE_TYPES.indexOf(blob.getContentType()) < 0) return "not a JPG, PNG, WebP or AVIF image";
  if (blob.getBytes().length > MAX_IMAGE_BYTES) return "larger than 4 MB";
  return "";
}

// Drive's preview of the file at a larger size. A photo uploaded moments ago may not have a preview yet,
// so this waits and tries again a few times.
function resizedDriveImage_(fileId, reason) {
  const auth = { Authorization: "Bearer " + ScriptApp.getOAuthToken() };
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) Utilities.sleep(5000);
    const file = UrlFetchApp.fetch(
      "https://www.googleapis.com/drive/v3/files/" + fileId + "?fields=thumbnailLink&supportsAllDrives=true",
      { headers: auth, muteHttpExceptions: true },
    );
    const link = file.getResponseCode() < 300 ? JSON.parse(file.getContentText()).thumbnailLink : "";
    if (!link) continue;
    const url = link.replace(/=s\d+[^=]*$/, "") + "=s" + RESIZED_IMAGE_PIXELS;
    for (const headers of [auth, {}]) {
      const image = UrlFetchApp.fetch(url, { headers: headers, muteHttpExceptions: true });
      if (image.getResponseCode() >= 300) continue;
      const problem = imageProblem_(image.getBlob());
      if (problem) throw new Error((reason ? reason + "; " : "") + "Google Drive's copy was " + problem);
      return image.getBlob().setName(fileId + ".jpg");
    }
  }
  throw new Error((reason ? reason + "; " : "") + "Google Drive could not make a JPEG copy of it");
}

function downloadImage_(source) {
  const response = UrlFetchApp.fetch(source, { muteHttpExceptions: true, followRedirects: true });
  if (response.getResponseCode() >= 400) throw new Error("download failed (" + response.getResponseCode() + ")");
  return response.getBlob();
}

function request_(path, options, submitter) {
  const config = config_();
  const headers = { Authorization: "Bearer " + config.apiKey, "X-Submitted-By": submitter };
  const response = UrlFetchApp.fetch(
    config.baseUrl + path,
    Object.assign({ method: "post", muteHttpExceptions: true, headers: headers }, options),
  );
  let body = {};
  try {
    body = JSON.parse(response.getContentText() || "{}");
  } catch (_) {
    // Plain-text error pages (e.g. 413 from the host) fall through to the status message below.
  }
  if (response.getResponseCode() >= 300) {
    throw new Error(body.error || "The shop returned HTTP " + response.getResponseCode() + ".");
  }
  return body;
}

function notify_(subject, body) {
  const to = PropertiesService.getScriptProperties().getProperty("NOTIFY_EMAIL") || Session.getEffectiveUser().getEmail();
  MailApp.sendEmail(to, subject, body);
}

function config_() {
  const properties = PropertiesService.getScriptProperties();
  const baseUrl = (properties.getProperty("API_BASE_URL") || "").replace(/\/+$/, "");
  const apiKey = properties.getProperty("API_KEY") || "";
  if (!/^https:\/\//.test(baseUrl)) throw new Error("Set the API_BASE_URL script property, e.g. https://www.ndeelicious.com");
  if (apiKey.length < 32) throw new Error("Set the API_KEY script property to PRODUCT_IMPORT_API_KEY.");
  return { baseUrl: baseUrl, apiKey: apiKey };
}

function text_(value) {
  return value == null ? "" : String(value).trim();
}

function number_(value, label) {
  const parsed = Number(text_(value).replace(/[$,\s]/g, ""));
  if (!isFinite(parsed)) throw new Error(label + " must be a number.");
  return parsed;
}

function lines_(value) {
  return text_(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function splitList_(value) {
  return text_(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
