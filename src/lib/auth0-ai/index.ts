import { tool, type Tool } from "ai";
import { z } from "zod";
import { Auth0AI, getAccessTokenFromTokenVault } from "@auth0/ai-vercel";

import { searchProducts, getProductById } from "@/lib/data/products";
import { getUser, updateUser } from "@/lib/data/users";
import {
  hydrateUser,
  getCachedCart,
  getCachedOrders,
  setCachedCart,
  addOrderAndClearCart,
} from "@/lib/auth0/user-cache";

import { getCIBAParams } from "./ciba";
import { getFGAParams } from "./fga";
import { createCalendarEvent } from "./calendar";
import {
  searchOrderDocuments,
  getOrderFilter,
  repairMissingTuples,
} from "@/lib/fga/order-store";

// ---------------------------------------------------------------------------
// Guest cart context — set per-request from the chat route so that AI tools
// can read/write the guest cart without touching the JSON file.  The client
// sends the current localStorage cart in the request body and the tool
// results include the updated cart so the client can sync back.
// ---------------------------------------------------------------------------

let _guestCart: { productId: string; quantity: number; addedAt: string }[] = [];

export function setGuestCart(
  items: { productId: string; quantity: number; addedAt: string }[]
) {
  _guestCart = items ?? [];
}

function getGuestCartItems() {
  return _guestCart;
}

function addToGuestCart(productId: string, quantity: number) {
  const existing = _guestCart.find((i) => i.productId === productId);
  if (existing) {
    existing.quantity += quantity;
  } else {
    _guestCart.push({
      productId,
      quantity,
      addedAt: new Date().toISOString(),
    });
  }
  return _guestCart;
}

// ---------------------------------------------------------------------------
// Authenticated user context — set per-request from the chat route so that
// AI tools can read/write user_metadata via the Management API.
// ---------------------------------------------------------------------------

let _authAccessToken: string | null = null;
let _authRefreshToken: string | null = null;

export function setAuthAccessToken(token: string) {
  _authAccessToken = token;
}

export function getAuthAccessToken(): string | null {
  return _authAccessToken;
}

export function setAuthRefreshToken(token: string) {
  _authRefreshToken = token;
}

export function getAuthRefreshToken(): string | null {
  return _authRefreshToken;
}

// ---------------------------------------------------------------------------
// Public tools (no auth required) — safe to define at module level
// ---------------------------------------------------------------------------

export const showProducts = tool({
  description:
    "Search and list products in the store. Can filter by search query and/or category.",
  inputSchema: z.object({
    query: z
      .string()
      .optional()
      .describe("Search query to filter products by name or description"),
    category: z
      .string()
      .optional()
      .describe("Category filter (Electronics, Clothing, Home, Sports)"),
  }),
  execute: async ({ query, category }) => {
    const products = searchProducts(query, category);
    return products.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      category: p.category,
      stock: p.stock,
      rating: p.rating,
    }));
  },
});

export const getProductDetails = tool({
  description: "Get detailed information about a specific product by ID.",
  inputSchema: z.object({
    productId: z.string().describe("The product ID to look up"),
  }),
  execute: async ({ productId }) => {
    const product = getProductById(productId);
    if (!product) return { error: "Product not found" };
    return product;
  },
});

// ---------------------------------------------------------------------------
// Session tools — no Token Vault required
// For guests: works with in-memory cart (synced from/to localStorage via client)
// For authenticated users: works with Auth0 user_metadata via Management API
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

const viewCartTool = tool({
  description:
    "View the contents of the current user's shopping cart. Do not ask the user for their userId — it is provided automatically.",
  inputSchema: z.object({
    userId: z
      .string()
      .optional()
      .default("guest")
      .describe("The user ID (provided automatically, do not ask the user)"),
  }),
  execute: async ({ userId }: { userId: string }) => {
    if (userId === "guest") {
      return enrichCart(getGuestCartItems());
    }
    try {
      const accessToken = getAuthAccessToken();
      if (!accessToken) return { error: "Not authenticated" };
      await hydrateUser(accessToken, userId);
      return enrichCart(getCachedCart(userId).items);
    } catch (e) {
      return { error: (e as Error).message };
    }
  },
});

const addToCartTool = tool({
  description:
    "Add a product to the current user's shopping cart. If the product is already in the cart, increases the quantity. Do not ask the user for their userId — it is provided automatically.",
  inputSchema: z.object({
    userId: z
      .string()
      .optional()
      .default("guest")
      .describe("The user ID (provided automatically, do not ask the user)"),
    productId: z.string().describe("The product ID to add"),
    quantity: z
      .number()
      .int()
      .positive()
      .optional()
      .default(1)
      .describe("Quantity to add (defaults to 1)"),
  }),
  execute: async ({
    userId,
    productId,
    quantity,
  }: {
    userId: string;
    productId: string;
    quantity: number;
  }) => {
    const product = getProductById(productId);
    if (!product) return { error: "Product not found" };

    if (userId === "guest") {
      const items = addToGuestCart(productId, quantity);
      return enrichCart(items);
    }

    try {
      const accessToken = getAuthAccessToken();
      if (!accessToken) return { error: "Not authenticated" };
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
      return enrichCart(cart.items);
    } catch (e) {
      return { error: (e as Error).message };
    }
  },
});

const prepareCheckoutTool = tool({
  description:
    "Preview the current user's cart for checkout. Returns the cart summary with items and total. " +
    "Call this BEFORE calling checkout_cart so the user knows what they are purchasing and that a push notification will be sent for approval. " +
    "Do not ask the user for their userId — it is provided automatically.",
  inputSchema: z.object({
    userId: z
      .string()
      .optional()
      .default("guest")
      .describe("The user ID (provided automatically, do not ask the user)"),
  }),
  execute: async ({ userId }: { userId: string }) => {
    if (userId === "guest") {
      return { error: "You must be logged in to checkout." };
    }
    try {
      const accessToken = getAuthAccessToken();
      if (!accessToken) return { error: "Not authenticated" };
      await hydrateUser(accessToken, userId);
      const cart = getCachedCart(userId);
      if (cart.items.length === 0) {
        return { error: "Cart is empty" };
      }
      const enriched = enrichCart(cart.items);
      return {
        ...enriched,
        message:
          "A push notification will be sent to the user's device for approval. " +
          "Tell the user to check their device, then call checkout_cart to proceed.",
      };
    } catch (e) {
      return { error: (e as Error).message };
    }
  },
});

const viewProfileTool = tool({
  description:
    "View the current user's profile information. Do not ask the user for their userId — it is provided automatically.",
  inputSchema: z.object({
    userId: z
      .string()
      .optional()
      .default("guest")
      .describe("The user ID (provided automatically, do not ask the user)"),
  }),
  execute: async ({ userId }: { userId: string }) => {
    const user = getUser(userId);
    if (!user) return { error: "User not found" };
    return user;
  },
});

const searchOrdersTool = tool({
  description:
    "Search the current user's order history. Returns past orders filtered by fine-grained authorization. " +
    "Use this to answer questions about past purchases, order totals, items bought, etc. " +
    "Do not ask the user for their userId — it is provided automatically.",
  inputSchema: z.object({
    userId: z
      .string()
      .describe("The user ID (provided automatically, do not ask the user)"),
    query: z
      .string()
      .optional()
      .describe(
        "Optional search query to filter orders by product name or summary"
      ),
  }),
  execute: async ({ userId, query }: { userId: string; query?: string }) => {
    if (!userId || userId === "guest") {
      return { error: "You must be logged in to search order history." };
    }

    try {
      // Get candidate documents (optionally filtered by text query)
      const candidates = searchOrderDocuments(query);

      if (candidates.length === 0) {
        return { orders: [], message: "No orders found." };
      }

      // Apply FGA filter — only returns orders the user is authorized to view
      const filter = getOrderFilter(userId);
      let authorized = await filter.filter(candidates);

      // Self-healing: check for orders in user_metadata that FGA denied
      // (missing tuples). Repair them and re-filter once.
      const cachedOrders = getCachedOrders(userId);
      const authorizedIds = new Set(authorized.map((d) => d.id));
      const missingOrders = cachedOrders.filter(
        (o) => !authorizedIds.has(o.orderId)
      );

      if (missingOrders.length > 0) {
        const repairedIds = await repairMissingTuples(missingOrders, userId);
        if (repairedIds.length > 0) {
          // Re-filter only the repaired candidates to avoid redundant checks
          const repairedCandidates = candidates.filter((d) =>
            repairedIds.includes(d.id)
          );
          const newlyAuthorized = await filter.filter(repairedCandidates);
          authorized = [...authorized, ...newlyAuthorized];
        }
      }

      return {
        orders: authorized.map((doc) => ({
          orderId: doc.id,
          items: doc.items,
          total: doc.total,
          placedAt: doc.placedAt,
          summary: doc.summary,
        })),
        count: authorized.length,
      };
    } catch (e) {
      return { error: (e as Error).message };
    }
  },
});

// ---------------------------------------------------------------------------
// Lazily-initialized Auth0AI instance and authorized tools.
// Auth0AI reads AUTH0_DOMAIN / AUTH0_CLIENT_ID / AUTH0_CLIENT_SECRET from
// process.env at construction time, so we defer creation to request time
// to avoid build-time failures when env vars aren't set.
// ---------------------------------------------------------------------------

let _authorizedTools: Record<string, Tool> | null = null;

function getAuthorizedTools(): Record<string, Tool> {
  if (_authorizedTools) return _authorizedTools;

  const tools: Record<string, Tool> = {};
  const auth0AI = new Auth0AI();

  // -- CIBA: checkout with push approval --
  try {
    const withCIBA = auth0AI.withAsyncAuthorization(getCIBAParams());
    tools.checkout_cart = withCIBA(
      tool({
        description:
          "Process checkout for a user's cart. Returns an order confirmation with order ID and total. " +
          "High-value purchases require user approval on their device via push notification.",
        inputSchema: z.object({
          userId: z.string().describe("The user ID whose cart to checkout"),
        }),
        execute: async ({ userId }: { userId: string }) => {
          try {
            const accessToken = getAuthAccessToken();
            if (!accessToken) {
              return { error: "Not authenticated" };
            }

            await hydrateUser(accessToken, userId);
            const cart = getCachedCart(userId);
            if (cart.items.length === 0) {
              return { error: "Cart is empty" };
            }

            // Compute total and build order items
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
            return { orderId, total };
          } catch (e) {
            return { error: (e as Error).message };
          }
        },
      })
    );
  } catch (e) {
    console.warn("CIBA checkout tool unavailable:", (e as Error).message);
  }

  // -- FGA: profile edit with fine-grained authorization --
  try {
    const fgaAI = new Auth0AI.FGA();
    const withFGA = fgaAI.withFGA(getFGAParams());
    tools.edit_profile = withFGA(
      tool({
        description:
          "Update a user's profile information (name, address, preferences). " +
          "Only the profile owner or an admin can edit a profile.",
        inputSchema: z.object({
          userId: z.string().describe("The user ID whose profile to update"),
          updates: z
            .record(z.unknown())
            .describe(
              "Object with fields to update (name, address, preferences)"
            ),
        }),
        execute: async ({
          userId,
          updates,
        }: {
          userId: string;
          updates: Record<string, unknown>;
        }) => {
          const updated = updateUser(
            userId,
            updates as Record<string, unknown>
          );
          if (!updated) return { error: "User not found" };
          return updated;
        },
      })
    );
  } catch (e) {
    console.warn("FGA edit_profile tool unavailable:", (e as Error).message);
  }

  // -- Token Vault: Google Calendar reminder --
  try {
    const protect = auth0AI.withTokenVault({
      connection: "google-oauth2",
      scopes: ["https://www.googleapis.com/auth/calendar.events"],
      refreshToken: () => getAuthRefreshToken() ?? undefined,
    });
    tools.set_calendar_reminder = protect(
      tool({
        description:
          "Set a Google Calendar reminder for a product drop or restock. " +
          "Creates a calendar event on the user's Google Calendar. " +
          "If this tool fails with an authorization error, the user needs to connect their Google account " +
          "by visiting /connect/google — tell them to click the link and authorize, then try again.",
        inputSchema: z.object({
          productId: z
            .string()
            .describe("The product ID to set a reminder for"),
          dropDate: z
            .string()
            .describe(
              "ISO 8601 date-time for the product drop (e.g. 2025-01-15T10:00:00-05:00)"
            ),
          notes: z
            .string()
            .optional()
            .describe("Optional notes to include in the calendar event"),
        }),
        execute: async ({
          productId,
          dropDate,
          notes,
        }: {
          productId: string;
          dropDate: string;
          notes?: string;
        }) => {
          const accessToken = getAccessTokenFromTokenVault();
          const product = getProductById(productId);
          if (!product) return { error: "Product not found" };

          const startDateTime = dropDate;
          const endDate = new Date(dropDate);
          endDate.setHours(endDate.getHours() + 1);
          const endDateTime = endDate.toISOString();

          const result = await createCalendarEvent(accessToken, {
            summary: `Product Drop: ${product.name}`,
            description:
              notes || `Reminder for ${product.name} drop — $${product.price}`,
            startDateTime,
            endDateTime,
          });

          return {
            success: true,
            eventId: result.eventId,
            calendarLink: result.htmlLink,
            product: product.name,
            reminderTime: result.start,
          };
        },
      })
    );
  } catch (e) {
    console.warn("Token Vault calendar tool unavailable:", (e as Error).message);
  }

  _authorizedTools = tools;
  return _authorizedTools;
}

// ---------------------------------------------------------------------------
// Combined tool set for use with streamText / generateText.
// Call getRetailTools() at request time (not at module level).
// ---------------------------------------------------------------------------
export function getRetailTools() {
  const sessionTools = {
    show_products: showProducts,
    get_product_details: getProductDetails,
    view_cart: viewCartTool,
    add_to_cart: addToCartTool,
    prepare_checkout: prepareCheckoutTool,
    view_profile: viewProfileTool,
    search_orders: searchOrdersTool,
  };

  try {
    const authorizedTools = getAuthorizedTools();
    return { ...sessionTools, ...authorizedTools };
  } catch (e) {
    console.warn(
      "Auth0AI tools could not be initialized (missing env vars?) — " +
        "checkout, profile edit, and calendar tools will be unavailable.",
      (e as Error).message
    );
    return sessionTools;
  }
}
