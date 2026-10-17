const STORAGE_KEY = "commonplace-products-v1";
const productList = document.querySelector("#product-list");
const addForm = document.querySelector("#add-form");
const productDialog = document.querySelector("#product-dialog");
const detailsForm = document.querySelector("#product-details-form");
const toast = document.querySelector("#toast");
let storageError = false;

const sampleProduct = {
  id: "sample-earbuds",
  name: "Everyday wireless headphones",
  url: "https://www.amazon.com/",
  price: 79,
  shipping: 0,
  tax: 6.32,
  origin: "Vietnam",
  warehouse: "Not disclosed",
  delivery: "Standard · 3–5 business days",
  image: "",
  demo: true,
  offers: [
    { store: "Audio Corner", price: 72, shipping: 5, tax: 6.16, origin: "Vietnam", warehouse: "Not disclosed", delivery: "Standard · 4–6 business days" },
    { store: "Sound Supply", price: 68, shipping: 9, tax: 6.16, origin: "Unknown", warehouse: "Not disclosed", delivery: "Express · 2–3 business days" },
  ],
};

let products = readProducts();
let toastTimer;

function readProducts() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.filter(isProduct) : [];
  } catch (error) {
    console.error("Could not load saved products.", error);
    storageError = true;
    return [];
  }
}

function isProduct(value) {
  return value && typeof value.id === "string" && typeof value.name === "string" &&
    typeof value.url === "string" && Array.isArray(value.offers);
}

function saveProducts() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
  } catch (error) {
    console.error("Could not save products.", error);
    showToast("Could not save your list on this device.");
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function getHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Online store";
  }
}

function isHttpUrl(value) {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function money(value, currency = "USD") {
  if (value === "" || value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  currency = /^[A-Za-z]{3}$/.test(String(currency)) ? String(currency).toUpperCase() : "XXX";
  if (currency === "XXX") return `${Number(value).toFixed(2)} (currency unknown)`;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(value));
  } catch {
    return `${currency} ${Number(value).toFixed(2)}`;
  }
}

function totalFor(item) {
  if (item.price === "" || item.price === null || item.price === undefined || !Number.isFinite(Number(item.price))) return null;
  return Number(item.price) +
    (item.shipping === "" || item.shipping === null || item.shipping === undefined ? 0 : Number(item.shipping)) +
    (item.tax === "" || item.tax === null || item.tax === undefined ? 0 : Number(item.tax));
}

function hasCompleteCosts(item) {
  return item.price !== "" && item.price !== null && item.price !== undefined &&
    item.shipping !== "" && item.shipping !== null && item.shipping !== undefined &&
    item.tax !== "" && item.tax !== null && item.tax !== undefined;
}

function renderProduct(item) {
  const total = totalFor(item);
  const completeCosts = hasCompleteCosts(item);
  const host = getHost(item.url);
  const image = item.image
    ? `<img src="${escapeHtml(item.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`
    : `<span class="image-placeholder" aria-hidden="true">◇</span>`;
  const origin = item.origin ? escapeHtml(item.origin) : "Not provided";
  const warehouse = item.warehouse ? escapeHtml(item.warehouse) : "Not provided";
  const delivery = item.delivery ? escapeHtml(item.delivery) : "Not provided";
  const priceSummary = total === null
    ? `<div class="total-label">EST. TOTAL</div><div class="total-price unknown">—</div><p class="price-note">Add price details</p>`
    : `<div class="total-label">${completeCosts ? "EST. TOTAL" : "KNOWN SUBTOTAL"}</div><div class="total-price">${money(total, item.currency)}</div><p class="price-note">${completeCosts ? "Tax &amp; shipping included" : "Excludes unknown costs"}</p>`;

  return `<article class="product-card" data-product-id="${escapeHtml(item.id)}">
    <div class="product-main">
      <div class="product-image">${image}</div>
      <div class="product-details">
        <div class="product-store"><span class="store-dot"></span>${escapeHtml(host)}${item.demo ? " · example data" : ""}</div>
        <h3 class="product-title" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</h3>
        <a class="product-url" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.url)}</a>
        <div class="product-facts">
          <span class="fact-chip ${money(item.price, item.currency) ? "" : "unknown"}"><span class="fact-label">Item</span>${money(item.price, item.currency) || "Unknown"}</span>
          <span class="fact-chip ${money(item.shipping, item.currency) ? "" : "unknown"}"><span class="fact-label">Shipping</span>${money(item.shipping, item.currency) || "Unknown"}</span>
          <span class="fact-chip ${money(item.tax, item.currency) ? "" : "unknown"}"><span class="fact-label">Est. tax</span>${money(item.tax, item.currency) || "Unknown"}</span>
          <span class="fact-chip ${item.origin ? "" : "unknown"}"><span class="fact-label">Made in</span>${origin}</span>
          <span class="fact-chip ${item.warehouse ? "" : "unknown"}"><span class="fact-label">Ships from</span>${warehouse}</span>
        </div>
      </div>
      <div class="product-price">${priceSummary}</div>
    </div>
    <div class="card-footer">
      <span class="shipping-summary">Shipping: ${money(item.shipping, item.currency) || "unknown"} · ${delivery}</span>
      <div class="card-actions">
        <button class="card-action" type="button" data-action="compare">Compare offers</button>
        <button class="card-action" type="button" data-action="edit">Edit details</button>
        <button class="card-action delete" type="button" data-action="delete" aria-label="Remove ${escapeHtml(item.name)}">Remove</button>
      </div>
    </div>
    <div class="alternatives" hidden>
      <div class="alternatives-heading"><h4>Other offers</h4><div><a class="search-offers" href="https://www.google.com/search?tbm=shop&amp;q=${encodeURIComponent(item.name)}" target="_blank" rel="noopener noreferrer">Find similar offers ↗</a><button class="card-action add-offer" type="button" data-action="add-offer">＋ Add offer</button></div></div>
      ${item.demo ? `<p class="offer-disclaimer">Illustrative offers only — not real listings or live prices.</p>` : ""}
      ${renderOffers(item, total)}
    </div>
  </article>`;
}

function renderOffers(item, baseTotal) {
  if (!item.offers.length) {
    const query = encodeURIComponent(item.name);
    return `<p class="offer-empty">No offers added yet. <a href="https://www.google.com/search?tbm=shop&q=${query}" target="_blank" rel="noopener noreferrer">Search shopping results for this item ↗</a>, then use “Add offer” to record a seller’s details. Search results open in a new tab and aren’t verified by Commonplace.</p>`;
  }
  const rows = item.offers.map((offer) => {
    const offerTotal = totalFor(offer);
    const offerCurrency = offer.currency || item.currency || "USD";
    const sameCurrency = offerCurrency === (item.currency || "USD") && offerCurrency !== "XXX";
    const below = sameCurrency && baseTotal !== null && offerTotal !== null && offerTotal < baseTotal;
    const offerName = offer.url
      ? `<a href="${escapeHtml(offer.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(offer.store)}</a>`
      : escapeHtml(offer.store);
    return `<tr>
      <td>${offerName}</td>
      <td>${money(offer.price, offerCurrency) || "Unknown"}</td>
      <td>${money(offer.shipping, offerCurrency) || "Unknown"}</td>
      <td>${money(offer.tax, offerCurrency) || "Unknown"}</td>
      <td>${escapeHtml(offer.origin || "Unknown")}</td>
      <td>${escapeHtml(offer.warehouse || "Unknown")}</td>
      <td>${escapeHtml(offer.delivery || "Unknown")}</td>
      <td class="offer-total">${offerTotal === null ? "Unknown" : `${hasCompleteCosts(offer) ? "" : "Partial · "}${money(offerTotal, offerCurrency)}${below ? " · less" : ""}`}</td>
    </tr>`;
  }).join("");
  return `<div class="offer-table-wrap"><table class="offer-table">
    <thead><tr><th>Store</th><th>Item</th><th>Shipping</th><th>Est. tax</th><th>Made in</th><th>Ships from</th><th>Delivery</th><th>Est. total</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function render() {
  productList.innerHTML = products.length
    ? products.map(renderProduct).join("")
    : `<div class="empty-state">
        <div><div class="empty-icon" aria-hidden="true">＋</div>
        <h3>Your list is ready when you are.</h3>
        <p>Paste a product link above to start comparing. You can save the price, origin, and shipping details you confirm with the seller.</p></div>
      </div>`;
  document.querySelector("#item-count").textContent = products.length ? `(${products.length})` : "";
  document.querySelector("#nav-count").textContent = products.length;
  document.querySelector("#clear-list").hidden = products.length === 0;
}

function openDetails(url, product, lookup = null) {
  detailsForm.reset();
  detailsForm.dataset.mode = "product";
  document.querySelector("#detail-url").value = url;
  document.querySelector("#detail-offer-url").required = false;
  document.querySelector("#detail-name").value = product?.name || lookup?.name || getHost(url);
  document.querySelector("#detail-price").value = product?.price ?? lookup?.price ?? "";
  document.querySelector("#detail-shipping").value = product?.shipping ?? lookup?.shipping ?? "";
  document.querySelector("#detail-tax").value = product?.tax ?? lookup?.tax ?? "";
  document.querySelector("#detail-origin").value = product?.origin || lookup?.origin || "";
  document.querySelector("#detail-warehouse").value = product?.warehouse || "";
  document.querySelector("#detail-delivery").value = product?.delivery || lookup?.delivery || "";
  document.querySelector("#detail-image").value = product?.image || lookup?.image || "";
  document.querySelector("#detail-currency").value = product?.currency || lookup?.currency || (lookup?.price !== null && lookup?.price !== undefined ? "XXX" : "USD");
  document.querySelector("#detail-currency").dispatchEvent(new Event("input", { bubbles: true }));
  detailsForm.dataset.productId = product?.id || "";
  document.querySelector("#dialog-title").textContent = product ? "Edit product details" : "Add product details";
  document.querySelector("#detail-submit-label").innerHTML = product ? "Save changes <span>→</span>" : "Save product <span>→</span>";
  document.querySelector("#detail-name-label").textContent = "Product name";
  document.querySelector("#offer-url-field").hidden = true;
  document.querySelector("#detail-name").placeholder = "e.g. Ceramic pour-over set";
  document.querySelector("#detail-image-field").hidden = false;
  document.querySelector("#dialog-description").textContent = lookup?.found
    ? "We filled in the information this page publishes. Shipping, tax, manufacturing origin, and warehouse details are often missing or depend on your address; check the retailer before buying."
    : "We couldn’t find structured product details on this page. If the store blocks automatic lookup, its information may not be available; any fields you enter are saved only in this browser.";
  productDialog.showModal();
  document.querySelector("#detail-name").focus();
}

function openOfferDetails(product) {
  detailsForm.reset();
  detailsForm.dataset.mode = "offer";
  detailsForm.dataset.productId = product.id;
  document.querySelector("#detail-url").value = product.url;
  document.querySelector("#detail-offer-url").required = true;
  document.querySelector("#dialog-title").textContent = "Add a competing offer";
  document.querySelector("#detail-submit-label").innerHTML = "Add offer <span>→</span>";
  document.querySelector("#detail-name-label").textContent = "Store / offer name";
  document.querySelector("#detail-name").placeholder = "e.g. Local home goods shop";
  document.querySelector("#offer-url-field").hidden = false;
  document.querySelector("#detail-image-field").hidden = true;
  document.querySelector("#detail-delivery").value = "";
  document.querySelector("#detail-currency").value = product.currency || "USD";
  document.querySelector("#detail-currency").dispatchEvent(new Event("input", { bubbles: true }));
  productDialog.showModal();
  document.querySelector("#detail-name").focus();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2800);
}

addForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const urlField = document.querySelector("#product-url");
  let url;
  try {
    url = new URL(urlField.value.trim());
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Unsupported URL protocol");
  } catch {
    urlField.setCustomValidity("Enter a valid product link starting with https://");
    urlField.reportValidity();
    return;
  }
  urlField.setCustomValidity("");
  const submitButton = addForm.querySelector('button[type="submit"]');
  const previousButtonContent = submitButton.innerHTML;
  submitButton.disabled = true;
  submitButton.textContent = "Reading product page…";
  document.querySelector("#lookup-status").textContent = "Checking the product page for published product details…";
  let lookup = null;
  try {
    const response = await fetch("/api/product", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url.href }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The product page could not be read.");
    lookup = result;
    const found = [result.name, result.price !== null && result.price !== undefined, result.image, result.origin, result.shipping !== null && result.shipping !== undefined]
      .filter(Boolean).length;
    document.querySelector("#lookup-status").textContent = found
      ? `Found ${found} published detail${found === 1 ? "" : "s"}. Missing details remain blank rather than guessed.`
      : "This store did not publish product details we could read. You can still add the link.";
  } catch (error) {
    document.querySelector("#lookup-status").textContent = "Automatic lookup was unavailable. You can still save the link and add details manually.";
    showToast(error instanceof Error ? error.message : "Could not read product details from that link.");
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = previousButtonContent;
  }
  openDetails(url.href, null, lookup);
});

document.querySelector("#product-url").addEventListener("input", (event) => event.currentTarget.setCustomValidity(""));

detailsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const id = detailsForm.dataset.productId;
  const previous = products.find((item) => item.id === id);
  const readNumber = (selector) => {
    const value = document.querySelector(selector).value;
    return value === "" ? "" : Number(value);
  };
  if (detailsForm.dataset.mode === "offer") {
    if (!previous) return;
    const offerUrl = document.querySelector("#detail-offer-url").value.trim();
    if (!isHttpUrl(offerUrl)) {
      showToast("Offer links must start with http:// or https://.");
      return;
    }
    const offer = {
      store: document.querySelector("#detail-name").value.trim(),
      url: offerUrl,
      price: readNumber("#detail-price"),
      shipping: readNumber("#detail-shipping"),
      tax: readNumber("#detail-tax"),
      origin: document.querySelector("#detail-origin").value.trim(),
      warehouse: document.querySelector("#detail-warehouse").value.trim(),
      delivery: document.querySelector("#detail-delivery").value.trim(),
      currency: document.querySelector("#detail-currency").value.trim().toUpperCase(),
    };
    products = products.map((item) => item.id === id ? { ...item, offers: [...item.offers, offer] } : item);
    saveProducts();
    render();
    productDialog.close();
    const card = productList.querySelector(`[data-product-id="${CSS.escape(id)}"]`);
    if (card) {
      card.querySelector(".alternatives").hidden = false;
      card.querySelector('[data-action="compare"]').textContent = "Hide offers";
    }
    showToast("Competing offer added.");
    return;
  }
  const product = {
    id: id || crypto.randomUUID(),
    name: document.querySelector("#detail-name").value.trim(),
    url: document.querySelector("#detail-url").value,
    price: readNumber("#detail-price"),
    shipping: readNumber("#detail-shipping"),
    tax: readNumber("#detail-tax"),
    origin: document.querySelector("#detail-origin").value.trim(),
    warehouse: document.querySelector("#detail-warehouse").value.trim(),
    delivery: document.querySelector("#detail-delivery").value.trim(),
    image: document.querySelector("#detail-image").value.trim(),
    currency: document.querySelector("#detail-currency").value.trim().toUpperCase(),
    offers: previous?.offers || [],
    demo: false,
  };
  if (previous) products = products.map((item) => item.id === id ? product : item);
  else products.unshift(product);
  saveProducts();
  render();
  productDialog.close();
  addForm.reset();
  showToast(previous ? "Product details updated." : "Product added to your list.");
});

document.querySelector("#close-dialog").addEventListener("click", () => productDialog.close());
document.querySelector("#cancel-dialog").addEventListener("click", () => productDialog.close());
productDialog.addEventListener("click", (event) => {
  if (event.target === productDialog) productDialog.close();
});

productList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const card = button.closest("[data-product-id]");
  const item = products.find((product) => product.id === card.dataset.productId);
  if (!item) return;
  if (button.dataset.action === "compare") {
    const alternatives = card.querySelector(".alternatives");
    alternatives.hidden = !alternatives.hidden;
    button.textContent = alternatives.hidden ? "Compare offers" : "Hide offers";
  } else if (button.dataset.action === "edit") {
    openDetails(item.url, item);
  } else if (button.dataset.action === "add-offer") {
    openOfferDetails(item);
  } else if (button.dataset.action === "delete") {
    products = products.filter((product) => product.id !== item.id);
    saveProducts();
    render();
    showToast("Product removed.");
  }
});

document.querySelector("#load-sample").addEventListener("click", () => {
  const exists = products.some((item) => item.id === sampleProduct.id);
  if (!exists) {
    products.unshift(structuredClone(sampleProduct));
    saveProducts();
    render();
  }
  const card = productList.querySelector(`[data-product-id="${sampleProduct.id}"]`);
  if (card) {
    card.querySelector(".alternatives").hidden = false;
    card.querySelector('[data-action="compare"]').textContent = "Hide offers";
    card.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  showToast("Sample figures are illustrative, not live retailer data.");
});

document.querySelector("#clear-list").addEventListener("click", () => {
  products = [];
  saveProducts();
  render();
  showToast("Your list has been cleared.");
});

render();
if (storageError) showToast("Could not read the saved list from this browser.");

document.querySelector("#detail-currency").addEventListener("input", (event) => {
  const currency = event.currentTarget.value.trim().toUpperCase() || "USD";
  document.querySelectorAll(".currency-label").forEach((label) => {
    label.textContent = currency;
  });
});
