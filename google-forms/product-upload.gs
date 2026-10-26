/**
 * Ndeeelicious product upload form (Google Apps Script).
 *
 * 1. Set Script properties API_BASE_URL and API_KEY (see README.md), optionally NOTIFY_EMAIL.
 * 2. Run createProductForm() once. It builds the form and installs the submit trigger.
 * 3. In the form editor, add a "File upload" question titled exactly "Photos" (Apps Script cannot create one).
 *
 * Each submission creates a product through POST /api/integrations/products, then uploads every photo
 * through POST /api/integrations/products/images. The result is emailed to NOTIFY_EMAIL (default: you).
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

const ALLERGENS = ["Wheat / gluten", "Milk", "Eggs", "Peanuts", "Tree nuts", "Soy", "Sesame"];

// Vercel rejects request bodies over 4.5 MB, so photos are capped below that.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

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
    .setCollectEmail(true);

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
  form
    .addTextItem()
    .setTitle(TITLES.preparationHours)
    .setHelpText("Ready to bake: prep time. Custom cakes: lead time (e.g. 48 for two days).")
    .setValidation(money);
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

/** Installed trigger: runs for every form response. */
function onProductSubmit(e) {
  const answers = {};
  e.response.getItemResponses().forEach((item) => {
    answers[item.getItem().getTitle()] = item.getResponse();
  });
  const submitter = e.response.getRespondentEmail();
  const name = text_(answers[TITLES.name]);
  try {
    const product = buildProduct_(answers);
    const created = request_("/api/integrations/products", {
      contentType: "application/json",
      payload: JSON.stringify(product),
    });
    const imageErrors = uploadImages_(created.id, product.name, answers);
    notify_(
      "Product added: " + name,
      [
        '"' + name + '" was created as ' + created.status + " (" + created.slug + ").",
        "Shop link: " + config_().baseUrl + "/product/" + created.slug,
        "Admin: " + config_().baseUrl + "/admin/products",
        imageErrors.length ? "\nSome photos were not added:\n- " + imageErrors.join("\n- ") : "",
        submitter ? "\nSubmitted by " + submitter : "",
      ].join("\n"),
    );
  } catch (error) {
    console.error(error);
    notify_(
      "Product NOT added: " + name,
      "The form response could not be imported.\n\nReason: " +
        error.message +
        "\n\nFix the answer and submit the form again." +
        (submitter ? "\n\nSubmitted by " + submitter : ""),
    );
  }
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
    preparationHours: answers[TITLES.preparationHours] ? number_(answers[TITLES.preparationHours], TITLES.preparationHours) : 0,
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

function uploadImages_(productId, productName, answers) {
  const errors = [];
  const sources = []
    .concat(answers[TITLES.photos] || []) // File upload answers are Drive file IDs
    .concat(lines_(answers[TITLES.imageLinks]));
  sources.slice(0, 12).forEach((source, index) => {
    try {
      const blob = imageBlob_(source);
      if (IMAGE_TYPES.indexOf(blob.getContentType()) < 0) throw new Error("not a JPG, PNG, WebP or AVIF image");
      if (blob.getBytes().length > MAX_IMAGE_BYTES) throw new Error("larger than 4 MB");
      request_("/api/integrations/products/images", {
        payload: {
          productId: productId,
          altText: productName + (index ? " photo " + (index + 1) : ""),
          sortOrder: String(index),
          file: blob,
        },
      });
    } catch (error) {
      errors.push(String(source).slice(0, 120) + ": " + error.message);
    }
  });
  if (sources.length > 12) errors.push("Only the first 12 photos were used.");
  return errors;
}

function imageBlob_(source) {
  const driveId = /^[\w-]{20,}$/.test(source)
    ? source
    : (String(source).match(/(?:\/d\/|[?&]id=)([\w-]{20,})/) || [])[1];
  if (driveId) return DriveApp.getFileById(driveId).getBlob();
  const response = UrlFetchApp.fetch(source, { muteHttpExceptions: true, followRedirects: true });
  if (response.getResponseCode() >= 400) throw new Error("download failed (" + response.getResponseCode() + ")");
  return response.getBlob();
}

function request_(path, options) {
  const config = config_();
  const response = UrlFetchApp.fetch(
    config.baseUrl + path,
    Object.assign({ method: "post", muteHttpExceptions: true, headers: { Authorization: "Bearer " + config.apiKey } }, options),
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
