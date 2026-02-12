import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { AuthInfo } from "./auth";
import { searchProducts, getProductById } from "@/lib/data/products";
import { getUser, updateUser } from "@/lib/data/users";
import {
  hydrateUser,
  getCachedCart,
  getCachedOrders,
  setCachedCart,
  addOrderAndClearCart,
} from "@/lib/auth0/user-cache";
import {
  searchOrderDocuments,
  getOrderFilter,
  repairMissingTuples,
} from "@/lib/fga/order-store";

// ---------------------------------------------------------------------------
// Helper — enrich cart items with product details
// ---------------------------------------------------------------------------

function enrichCart(items: { productId: string; quantity: number }[]) {
  const enriched = items.map((item) => {
    const product = getProductById(item.productId);
    return {
      productId: item.productId,
      productName: product?.name || "Unknown",
      price: product?.price || 0,
      quantity: item.quantity,
      subtotal: (product?.price || 0) * item.quantity,
    };
  });
  const total = enriched.reduce((sum, i) => sum + i.subtotal, 0);
  return { items: enriched, total: Math.round(total * 100) / 100 };
}

// ---------------------------------------------------------------------------
// Create MCP server with all tools, using the authenticated user's token
// ---------------------------------------------------------------------------

export function createMcpServer(authInfo?: AuthInfo): McpServer {
  const server = new McpServer({
    name: "RetailZero MCP Server",
    version: "1.0.0",
  });

  const userId = authInfo?.sub || "guest";
  const accessToken = authInfo?.token || null;

  // -- Public tools --

  server.tool(
    "show_products",
    "Search and list products in the store. Can filter by search query and/or category.",
    {
      query: z
        .string()
        .optional()
        .describe("Search query to filter products by name or description"),
      category: z
        .string()
        .optional()
        .describe("Category filter (Electronics, Clothing, Home, Sports)"),
    },
    async ({ query, category }) => {
      const products = searchProducts(query, category);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              products.map((p) => ({
                id: p.id,
                name: p.name,
                price: p.price,
                category: p.category,
                stock: p.stock,
                rating: p.rating,
              })),
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "get_product_details",
    "Get detailed information about a specific product by ID.",
    {
      productId: z.string().describe("The product ID to look up"),
    },
    async ({ productId }) => {
      const product = getProductById(productId);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              product || { error: "Product not found" },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // -- Authenticated tools (require bearer token) --

  server.tool(
    "view_cart",
    "View the contents of the current user's shopping cart.",
    {},
    async () => {
      if (!accessToken) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "Not authenticated" }) }],
        };
      }
      try {
        await hydrateUser(accessToken, userId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(enrichCart(getCachedCart(userId).items), null, 2),
            },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: (e as Error).message }) }],
        };
      }
    }
  );

  server.tool(
    "add_to_cart",
    "Add a product to the current user's shopping cart. If already in the cart, increases the quantity.",
    {
      productId: z.string().describe("The product ID to add"),
      quantity: z
        .number()
        .int()
        .positive()
        .optional()
        .default(1)
        .describe("Quantity to add (defaults to 1)"),
    },
    async ({ productId, quantity }) => {
      if (!accessToken) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "Not authenticated" }) }],
        };
      }
      const product = getProductById(productId);
      if (!product) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "Product not found" }) }],
        };
      }
      try {
        await hydrateUser(accessToken, userId);
        const cart = getCachedCart(userId);
        const existing = cart.items.find((i) => i.productId === productId);
        if (existing) {
          existing.quantity += quantity;
        } else {
          cart.items.push({
            productId,
            quantity,
            addedAt: new Date().toISOString(),
          });
        }
        cart.updatedAt = new Date().toISOString();
        setCachedCart(accessToken, userId, cart);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(enrichCart(cart.items), null, 2) },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: (e as Error).message }) }],
        };
      }
    }
  );

  server.tool(
    "prepare_checkout",
    "Preview the current user's cart for checkout. Returns the cart summary with items and total. Call this BEFORE checkout_cart.",
    {},
    async () => {
      if (!accessToken) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "Not authenticated" }) }],
        };
      }
      try {
        await hydrateUser(accessToken, userId);
        const cart = getCachedCart(userId);
        if (cart.items.length === 0) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: "Cart is empty" }) }],
          };
        }
        const enriched = enrichCart(cart.items);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  ...enriched,
                  message:
                    "A push notification will be sent to the user's device for approval. " +
                    "Tell the user to check their device, then call checkout_cart to proceed.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: (e as Error).message }) }],
        };
      }
    }
  );

  server.tool(
    "checkout_cart",
    "Process checkout for a user's cart. Returns an order confirmation with order ID and total.",
    {},
    async () => {
      if (!accessToken) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "Not authenticated" }) }],
        };
      }
      try {
        await hydrateUser(accessToken, userId);
        const cart = getCachedCart(userId);
        if (cart.items.length === 0) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: "Cart is empty" }) }],
          };
        }

        let total = 0;
        const orderItems: {
          productId: string;
          productName: string;
          price: number;
          quantity: number;
        }[] = [];

        for (const item of cart.items) {
          const product = getProductById(item.productId);
          const price = product?.price ?? 0;
          total += price * item.quantity;
          orderItems.push({
            productId: item.productId,
            productName: product?.name ?? "Unknown",
            price,
            quantity: item.quantity,
          });
        }
        total = Math.round(total * 100) / 100;

        const orderId = `order-${Date.now()}`;
        const order = {
          orderId,
          items: orderItems,
          total,
          placedAt: new Date().toISOString(),
        };

        addOrderAndClearCart(accessToken, userId, order);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ orderId, total }, null, 2) },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: (e as Error).message }) }],
        };
      }
    }
  );

  server.tool(
    "view_profile",
    "View the current user's profile information.",
    {},
    async () => {
      const user = getUser(userId);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(user || { error: "User not found" }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "edit_profile",
    "Update the current user's profile information (name, address, preferences).",
    {
      updates: z
        .record(z.unknown())
        .describe("Object with fields to update (name, address, preferences)"),
    },
    async ({ updates }) => {
      if (!accessToken) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "Not authenticated" }) }],
        };
      }
      const updated = updateUser(userId, updates as Record<string, unknown>);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(updated || { error: "User not found" }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "search_orders",
    "Search the current user's order history. Returns past orders filtered by fine-grained authorization.",
    {
      query: z
        .string()
        .optional()
        .describe("Optional search query to filter orders by product name or summary"),
    },
    async ({ query }) => {
      if (!accessToken) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "Not authenticated" }) }],
        };
      }
      try {
        const candidates = searchOrderDocuments(query);
        if (candidates.length === 0) {
          return {
            content: [
              { type: "text" as const, text: JSON.stringify({ orders: [], message: "No orders found." }) },
            ],
          };
        }

        const filter = getOrderFilter(userId);
        let authorized = await filter.filter(candidates);

        // Self-healing: repair missing FGA tuples
        const cachedOrders = getCachedOrders(userId);
        const authorizedIds = new Set(authorized.map((d) => d.id));
        const missingOrders = cachedOrders.filter(
          (o) => !authorizedIds.has(o.orderId)
        );

        if (missingOrders.length > 0) {
          const repairedIds = await repairMissingTuples(missingOrders, userId);
          if (repairedIds.length > 0) {
            const repairedCandidates = candidates.filter((d) =>
              repairedIds.includes(d.id)
            );
            const newlyAuthorized = await filter.filter(repairedCandidates);
            authorized = [...authorized, ...newlyAuthorized];
          }
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  orders: authorized.map((doc) => ({
                    orderId: doc.id,
                    items: doc.items,
                    total: doc.total,
                    placedAt: doc.placedAt,
                    summary: doc.summary,
                  })),
                  count: authorized.length,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: (e as Error).message }) }],
        };
      }
    }
  );

  return server;
}
