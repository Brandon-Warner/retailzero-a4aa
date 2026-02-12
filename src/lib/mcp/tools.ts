import { searchProducts, getProductById } from "@/lib/data/products";
import { getCart, checkout } from "@/lib/data/carts";
import { getUser, updateUser } from "@/lib/data/users";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler: (args: Record<string, unknown>) => unknown;
}

export const tools: ToolDefinition[] = [
  {
    name: "show_products",
    description:
      "Search and list products in the store. Can filter by search query and/or category.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query to filter products by name or description",
        },
        category: {
          type: "string",
          description:
            "Category filter (Electronics, Clothing, Home, Sports)",
        },
      },
    },
    handler: (args) => {
      const products = searchProducts(
        args.query as string | undefined,
        args.category as string | undefined
      );
      return products.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        category: p.category,
        stock: p.stock,
        rating: p.rating,
      }));
    },
  },
  {
    name: "get_product_details",
    description: "Get detailed information about a specific product by ID.",
    inputSchema: {
      type: "object",
      properties: {
        productId: {
          type: "string",
          description: "The product ID to look up",
        },
      },
      required: ["productId"],
    },
    handler: (args) => {
      const product = getProductById(args.productId as string);
      if (!product) return { error: "Product not found" };
      return product;
    },
  },
  {
    name: "view_cart",
    description: "View the contents of a user's shopping cart.",
    inputSchema: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description: "The user ID whose cart to view",
        },
      },
      required: ["userId"],
    },
    handler: (args) => {
      const cart = getCart(args.userId as string);
      const items = cart.items.map((item) => {
        const product = getProductById(item.productId);
        return {
          productId: item.productId,
          productName: product?.name || "Unknown",
          price: product?.price || 0,
          quantity: item.quantity,
          subtotal: (product?.price || 0) * item.quantity,
        };
      });
      const total = items.reduce((sum, i) => sum + i.subtotal, 0);
      return { items, total: Math.round(total * 100) / 100 };
    },
  },
  {
    name: "checkout_cart",
    description:
      "Process checkout for a user's cart. Returns an order confirmation with order ID and total.",
    inputSchema: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description: "The user ID whose cart to checkout",
        },
      },
      required: ["userId"],
    },
    handler: (args) => {
      try {
        return checkout(args.userId as string);
      } catch (e) {
        return { error: (e as Error).message };
      }
    },
  },
  {
    name: "view_profile",
    description: "View a user's profile information.",
    inputSchema: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description: "The user ID whose profile to view",
        },
      },
      required: ["userId"],
    },
    handler: (args) => {
      const user = getUser(args.userId as string);
      if (!user) return { error: "User not found" };
      return user;
    },
  },
  {
    name: "edit_profile",
    description:
      "Update a user's profile information (name, address, preferences).",
    inputSchema: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description: "The user ID whose profile to update",
        },
        updates: {
          type: "object",
          description:
            "Object with fields to update (name, address, preferences)",
        },
      },
      required: ["userId", "updates"],
    },
    handler: (args) => {
      const updated = updateUser(
        args.userId as string,
        args.updates as Record<string, unknown>
      );
      if (!updated) return { error: "User not found" };
      return updated;
    },
  },
];
