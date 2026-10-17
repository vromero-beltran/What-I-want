import unittest

from server import extract_product, fetch_page


class ProductExtractionTests(unittest.TestCase):
    def test_extracts_schema_product_and_offer(self):
        page = """
        <html><head><script type="application/ld+json">
        {"@context":"https://schema.org","@type":"Product","name":"Field mug",
         "image":["/images/mug.jpg"],"countryOfOrigin":{"@type":"Country","name":"Japan"},
         "brand":{"@type":"Brand","name":"Studio North"},
         "offers":{"@type":"Offer","price":"24.50","priceCurrency":"CAD",
         "shippingDetails":{"shippingRate":{"value":"4.00"},
         "deliveryTime":{"transitTime":{"minValue":2,"maxValue":4,"unitText":"days"}}}}
        }
        </script></head><body></body></html>
        """

        result = extract_product(page, "https://shop.example/products/mug")

        self.assertEqual(result["name"], "Field mug")
        self.assertEqual(result["price"], 24.5)
        self.assertEqual(result["currency"], "CAD")
        self.assertEqual(result["shipping"], 4)
        self.assertEqual(result["origin"], "Japan")
        self.assertEqual(result["brand"], "Studio North")
        self.assertEqual(result["delivery"], "2–4 days")
        self.assertEqual(result["image"], "https://shop.example/images/mug.jpg")
        self.assertIsNone(result["tax"])
        self.assertEqual(result["warehouse"], "")

    def test_uses_open_graph_metadata_when_product_schema_is_missing(self):
        page = """
        <html><head>
        <meta property="og:title" content="Canvas tote">
        <meta property="og:image" content="//cdn.example/tote.jpg">
        <meta property="product:price:amount" content="18.00">
        <meta property="product:price:currency" content="USD">
        </head><body></body></html>
        """

        result = extract_product(page, "https://shop.example/tote")

        self.assertEqual(result["name"], "Canvas tote")
        self.assertEqual(result["price"], 18)
        self.assertEqual(result["currency"], "USD")
        self.assertEqual(result["image"], "https://cdn.example/tote.jpg")
        self.assertEqual(result["sources"]["price"], "page metadata")
        self.assertFalse(result["origin"])

    def test_rejects_non_web_links_before_fetching(self):
        with self.assertRaisesRegex(ValueError, "public http:// or https://"):
            fetch_page("file:///etc/passwd")

    def test_rejects_local_network_addresses(self):
        with self.assertRaisesRegex(ValueError, "public website"):
            fetch_page("http://localhost/")


if __name__ == "__main__":
    unittest.main()
