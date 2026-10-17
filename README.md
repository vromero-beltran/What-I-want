# Commonplace

A responsive shopping comparison prototype. Paste a product link and the local lookup service reads product information that the retailer publishes in standard page metadata or Schema.org structured data. Products are stored locally in the browser.

## Run it

Install Python 3.9 or later, then run `python server.py` from this folder and open <http://127.0.0.1:8000>. The local server is required for product-link lookup; opening `index.html` directly will not enable the lookup API.

## What it does (and doesn't)

- Automatically fills the product name, image, item price, currency, country of manufacture, and shipping/delivery fields when the product page publishes them in readable structured data or metadata.
- Saves product links, item prices, shipping, estimated tax, image URLs, country of manufacture, warehouse/ship-from details, and delivery notes in browser local storage.
- Calculates an estimated total from the values entered. Unknown values stay unknown; a blank tax or shipping amount is not treated as a confirmed zero.
- Offers a shopping-results search link when no alternative offers have been recorded. Search results and seller information must be checked by the user.
- Includes an explicitly labeled illustrative sample comparison to demonstrate the interface.

Automatic lookup is best-effort, not universal: some stores block automated requests or do not publish product metadata. Taxes are normally calculated at checkout based on the delivery address. Warehouse/ship-from locations and manufacturing origin are often absent from product pages, and shipping charges and delivery dates can depend on location. These fields remain unknown when the store does not publish them; the app does not guess or claim to have verified them. Retailer-specific APIs or product-data services would be needed for broader coverage or consistently current fulfillment data.

The lookup service fetches only public HTTP/HTTPS pages, limits page size and redirects, rejects non-public network addresses, and listens on the local machine only. Product links and saved items are not sent to a Commonplace-hosted service.
