import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

// --- Replace with your Shopify credentials ---
const SHOPIFY_STORE = "SHOPIFY_STORE";
const ADMIN_API_TOKEN = "ADMIN_API_TOKEN";

// --- Option → SKU mapping table ---
const optionToSkuMap = {
  "Coin Year": {
    "Year 1": "LegacyCoin1",
    "Year 2": "LegacyCoin2",
    "Year 3": "LegacyCoin3",
    "Year 4": "LegacyCoin4",
    "Year 5": "LegacyCoin5",
    "Year 6": "LegacyCoin6",
    "Year 7": "LegacyCoin7",
    "Year 8": "LegacyCoin8",
    "Year 9": "LegacyCoin9",
    "Year 10": "LegacyCoin10",
    "Year 11": "LegacyCoin11",
    "Year 12": "LegacyCoin12"
  },
  "Hoodie Size": {
    "S": "hoodie-small-sku",
    "M": "hoodie-medium-sku",
    "L": "hoodie-large-sku"
  }
};

// --- Helper: adjust inventory ---
async function adjustInventory(sku, delta) {
  // Step 1: Get variant by SKU
  const variantQuery = `
    {
      productVariants(first: 1, query: "sku:${sku}") {
        edges {
          node {
            id
            inventoryItem {
              id
              inventoryLevels(first: 1) {
                edges {
                  node {
                    id
                    available
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const variantRes = await fetch(`https://${SHOPIFY_STORE}/admin/api/2025-01/graphql.json`, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": ADMIN_API_TOKEN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query: variantQuery })
  });

  const variantData = await variantRes.json();
  const variant = variantData.data.productVariants.edges[0]?.node;
  if (!variant) {
    console.error("Variant not found for SKU:", sku);
    return;
  }

  const levelId = variant.inventoryItem.inventoryLevels.edges[0].node.id;

  // Step 2: Adjust inventory
  const adjustQuery = `
    mutation {
      inventoryAdjustQuantity(
        input: {
          inventoryLevelId: "${levelId}"
          availableDelta: ${delta}
        }
      ) {
        inventoryLevel {
          id
          available
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const adjustRes = await fetch(`https://${SHOPIFY_STORE}/admin/api/2025-01/graphql.json`, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": ADMIN_API_TOKEN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query: adjustQuery })
  });

  const adjustData = await adjustRes.json();
  console.log("Adjust result:", adjustData);
}

// --- Webhook endpoint ---
app.post("/webhook/orders-create", async (req, res) => {
  try {
    const order = req.body;

    for (const item of order.line_items) {
      const qty = item.quantity;
      if (item.properties) {
        for (const [propKey, propValue] of Object.entries(item.properties)) {
          if (optionToSkuMap[propKey]?.[propValue]) {
            const sku = optionToSkuMap[propKey][propValue];
            await adjustInventory(sku, -qty);
          }
        }
      }
    }

    res.status(200).send("Inventory updated");
  } catch (err) {
    console.error("Error processing webhook:", err);
    res.status(500).send("Error");
  }
});

app.listen(3000, () => console.log("Server running on port 3000"));
