import http.client
import ipaddress
import json
import math
import mimetypes
import re
import socket
import ssl
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


ROOT = Path(__file__).resolve().parent
MAX_PAGE_BYTES = 2_000_000
MAX_REDIRECTS = 4
USER_AGENT = "CommonplaceProductLookup/1.0 (+local shopping comparison app)"


class ProductPageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.meta = {}
        self.json_scripts = []
        self._script_parts = None
        self._title_parts = None
        self.title = ""

    def handle_starttag(self, tag, attrs):
        values = {key.lower(): value for key, value in attrs if key}
        if tag == "meta":
            key = values.get("property") or values.get("name") or values.get("itemprop")
            content = values.get("content")
            if key and content:
                self.meta[key.lower()] = content.strip()
        elif tag == "script" and (values.get("type") or "").split(";")[0].strip().lower() == "application/ld+json":
            self._script_parts = []
        elif tag == "title":
            self._title_parts = []

    def handle_data(self, data):
        if self._script_parts is not None:
            self._script_parts.append(data)
        if self._title_parts is not None:
            self._title_parts.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self._script_parts is not None:
            self.json_scripts.append("".join(self._script_parts))
            self._script_parts = None
        elif tag == "title" and self._title_parts is not None:
            self.title = "".join(self._title_parts).strip()
            self._title_parts = None


def _public_address(hostname, port):
    try:
        results = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
    except OSError as error:
        raise ValueError("The product website could not be reached.") from error
    addresses = {result[4][0] for result in results}
    if not addresses or any(not ipaddress.ip_address(address.split("%")[0]).is_global for address in addresses):
        raise ValueError("This link cannot be fetched because it does not resolve to a public website.")
    return sorted(addresses)[0]


class _PinnedHTTPConnection(http.client.HTTPConnection):
    def __init__(self, hostname, address, port, timeout):
        super().__init__(hostname, port=port, timeout=timeout)
        self._address = address

    def connect(self):
        self.sock = socket.create_connection((self._address, self.port), self.timeout)


class _PinnedHTTPSConnection(_PinnedHTTPConnection):
    def connect(self):
        raw_socket = socket.create_connection((self._address, self.port), self.timeout)
        try:
            self.sock = ssl.create_default_context().wrap_socket(raw_socket, server_hostname=self.host)
        except Exception:
            raw_socket.close()
            raise


def fetch_page(initial_url):
    current_url = initial_url
    for redirect_count in range(MAX_REDIRECTS + 1):
        parts = urlsplit(current_url)
        if parts.scheme not in ("http", "https") or not parts.hostname or parts.username or parts.password:
            raise ValueError("Enter a public http:// or https:// product link.")
        try:
            port = parts.port or (443 if parts.scheme == "https" else 80)
        except ValueError as error:
            raise ValueError("The product link has an invalid port.") from error
        expected_port = 443 if parts.scheme == "https" else 80
        if port != expected_port:
            raise ValueError("Only standard web links on ports 80 and 443 are supported.")

        hostname = parts.hostname
        try:
            ipaddress.ip_address(hostname)
            request_host = f"[{hostname}]" if ":" in hostname else hostname
        except ValueError:
            hostname = hostname.encode("idna").decode("ascii")
            request_host = hostname
        address = _public_address(hostname, port)
        connection_type = _PinnedHTTPSConnection if parts.scheme == "https" else _PinnedHTTPConnection
        connection = connection_type(request_host, address, port, timeout=8)
        target = parts.path or "/"
        if parts.query:
            target += "?" + parts.query
        try:
            connection.request("GET", target, headers={
                "User-Agent": USER_AGENT,
                "Accept": "text/html,application/xhtml+xml;q=0.9",
                "Accept-Encoding": "identity",
                "Connection": "close",
            })
            response = connection.getresponse()
            if response.status in (301, 302, 303, 307, 308):
                location = response.getheader("Location")
                response.close()
                if not location or redirect_count == MAX_REDIRECTS:
                    raise ValueError("The product page redirected too many times.")
                current_url = urljoin(current_url, location)
                continue
            if response.status < 200 or response.status >= 300:
                raise ValueError(f"The product website returned HTTP {response.status}.")
            content_type = response.getheader("Content-Type", "").lower()
            if "html" not in content_type:
                raise ValueError("The link did not return an HTML product page.")
            page = response.read(MAX_PAGE_BYTES + 1)
            if len(page) > MAX_PAGE_BYTES:
                raise ValueError("The product page is larger than the supported limit.")
            charset_match = re.search(r"charset\s*=\s*['\"]?([a-zA-Z0-9._-]+)", content_type)
            encoding = charset_match.group(1) if charset_match else "utf-8"
            return page.decode(encoding, errors="replace"), current_url
        except (TimeoutError, socket.timeout) as error:
            raise ValueError("The product website took too long to respond.") from error
        except ssl.SSLError as error:
            raise ValueError("A secure connection to the product website could not be verified.") from error
        finally:
            connection.close()
    raise ValueError("The product page redirected too many times.")


def _as_list(value):
    return value if isinstance(value, list) else [value]


def _walk_json(value):
    pending = [value]
    while pending:
        current = pending.pop()
        if isinstance(current, dict):
            yield current
            pending.extend(current.values())
        elif isinstance(current, list):
            pending.extend(current)


def _schema_value(value):
    if isinstance(value, dict):
        return value.get("name") or value.get("value") or value.get("url") or value.get("contentUrl") or value.get("@id") or ""
    return value if isinstance(value, (str, int, float)) else ""


def _numeric(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, dict):
        value = value.get("value") or value.get("price")
    if isinstance(value, (int, float)):
        candidate = value
    elif isinstance(value, str):
        match = re.search(r"\d[\d,]*(?:\.\d+)?", value)
        if match:
            try:
                candidate = float(match.group(0).replace(",", ""))
            except (OverflowError, ValueError):
                return None
        else:
            return None
    else:
        return None
    try:
        amount = float(candidate)
    except (OverflowError, ValueError):
        return None
    return amount if math.isfinite(amount) and 0 <= amount <= 1_000_000_000_000 else None


def _product_data(parser):
    products = []
    for text in parser.json_scripts:
        try:
            decoded = json.loads(text.strip().removeprefix("\ufeff"))
        except (ValueError, TypeError, RecursionError):
            continue
        for entry in _walk_json(decoded):
            types = _as_list(entry.get("@type", []))
            if any(str(item).lower().split("/")[-1] == "product" for item in types):
                products.append(entry)

    product = products[0] if products else {}
    offers_value = product.get("offers", {})
    offers = _as_list(offers_value)
    offer = next((item for item in offers if isinstance(item, dict)), {})
    shipping_details = _as_list(offer.get("shippingDetails", []))
    shipping_detail = next((item for item in shipping_details if isinstance(item, dict)), {})
    shipping_rate = shipping_detail.get("shippingRate", {})
    delivery_time = shipping_detail.get("deliveryTime", {})
    transit_time = delivery_time.get("transitTime", {}) if isinstance(delivery_time, dict) else {}
    delivery = ""
    if isinstance(transit_time, dict):
        minimum = transit_time.get("minValue")
        maximum = transit_time.get("maxValue")
        unit = transit_time.get("unitText") or transit_time.get("unitCode") or "days"
        if minimum is not None and maximum is not None:
            delivery = f"{minimum}–{maximum} {unit}"
        elif minimum is not None:
            delivery = f"{minimum}+ {unit}"

    image = product.get("image", "")
    if isinstance(image, list):
        image = next((_schema_value(value) for value in image if _schema_value(value)), "")
    else:
        image = _schema_value(image)

    name = _schema_value(product.get("name"))
    currency = str(offer.get("priceCurrency") or "").upper()
    price = _numeric(offer.get("price") or offer.get("lowPrice"))
    origin = _schema_value(product.get("countryOfOrigin"))
    brand = _schema_value(product.get("brand"))
    shipping = _numeric(shipping_rate)
    availability = _schema_value(offer.get("availability"))
    return {
        "name": str(name) if name else "",
        "price": price,
        "currency": currency if re.fullmatch(r"[A-Z]{3}", currency) else "",
        "image": str(image) if image else "",
        "origin": str(origin) if origin else "",
        "brand": str(brand) if brand else "",
        "shipping": shipping,
        "delivery": delivery,
        "availability": str(availability).rsplit("/", 1)[-1] if availability else "",
    }


def extract_product(page, page_url):
    parser = ProductPageParser()
    parser.feed(page)
    data = _product_data(parser)
    structured = data.copy()
    meta = parser.meta

    data["name"] = data["name"] or meta.get("og:title") or meta.get("twitter:title") or parser.title
    data["image"] = data["image"] or meta.get("og:image") or meta.get("twitter:image") or ""
    data["image"] = urljoin(page_url, data["image"]) if data["image"] else ""
    if data["image"] and urlsplit(data["image"]).scheme not in ("http", "https"):
        data["image"] = ""
    if data["price"] is None:
        data["price"] = _numeric(meta.get("product:price:amount") or meta.get("og:price:amount") or meta.get("price"))
    data["currency"] = data["currency"] or str(meta.get("product:price:currency") or meta.get("og:price:currency") or "").upper()
    if not re.fullmatch(r"[A-Z]{3}", data["currency"]):
        data["currency"] = ""
    data["origin"] = data["origin"] or meta.get("product:country_of_origin", "")
    data["brand"] = data["brand"] or meta.get("product:brand", "")
    data["warehouse"] = ""
    data["tax"] = None
    data["sources"] = {
        "name": "product structured data" if structured["name"] else (
            "page metadata" if meta.get("og:title") or meta.get("twitter:title") else ("page title" if parser.title else "")
        ),
        "image": "product structured data" if structured["image"] else (
            "page metadata" if meta.get("og:image") or meta.get("twitter:image") else ""
        ),
        "origin": "product structured data" if structured["origin"] else (
            "page metadata" if meta.get("product:country_of_origin") else ""
        ),
        "brand": "product structured data" if structured["brand"] else (
            "page metadata" if meta.get("product:brand") else ""
        ),
        "price": "product structured data" if structured["price"] is not None else (
            "page metadata" if meta.get("product:price:amount") or meta.get("og:price:amount") or meta.get("price") else ""
        ),
    }
    data["sources"]["shipping"] = "product structured data" if data["shipping"] is not None else ""
    return data


class CommonplaceHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/api/product":
            self.send_error(404)
            return
        if self.headers.get("Host") not in ("127.0.0.1:8000", "localhost:8000"):
            self._json(403, {"error": "Product lookup is available only from the local Commonplace page."})
            return
        origin = self.headers.get("Origin")
        if origin and origin not in ("http://127.0.0.1:8000", "http://localhost:8000"):
            self._json(403, {"error": "Product lookup requests must come from the local Commonplace page."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 4096:
                raise ValueError("The lookup request is invalid or too large.")
            request = json.loads(self.rfile.read(length))
            url = request.get("url") if isinstance(request, dict) else None
            if not isinstance(url, str) or len(url) > 2048:
                raise ValueError("Enter a valid product link.")
            page, final_url = fetch_page(url)
            result = extract_product(page, final_url)
            result["url"] = final_url
            result["found"] = bool(result["name"] or result["price"] is not None or result["image"])
            self._json(200, result)
        except (ValueError, json.JSONDecodeError) as error:
            self._json(400, {"error": str(error)})
        except (OSError, http.client.HTTPException) as error:
            self._json(502, {"error": f"Could not read product details: {error}"})

    def do_GET(self):
        if self.path == "/api/health":
            self._json(200, {"ok": True})
            return
        self._serve_file()

    def _json(self, status, value):
        body = json.dumps(value).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def _serve_file(self):
        path = unquote(urlsplit(self.path).path).lstrip("/") or "index.html"
        if path not in ("index.html", "style.css", "script.js"):
            self.send_error(404)
            return
        target = ROOT / path
        content = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(target.name)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, format_string, *args):
        print(f"{self.address_string()} - {format_string % args}")


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 8000), CommonplaceHandler)
    print("Commonplace is running at http://127.0.0.1:8000 (Ctrl+C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Commonplace.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
