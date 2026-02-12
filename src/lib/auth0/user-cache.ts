/**
 * In-memory per-user cache for cart and orders.
 *
 * On the first access for a given user the data is hydrated from Auth0
 * user_metadata via the Management API.  Subsequent reads are served
 * from memory.  Writes update the in-memory cache immediately and
 * persist to user_metadata in the background (fire-and-forget).
 */

import {
  getAuth0UserMetadata,
  patchAuth0UserMetadata,
} from "./metadata";
import { addOrderDocument } from "@/lib/fga/order-store";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CartItem {
  productId: string;
  quantity: number;
  addedAt: string;
}

export interface Cart {
  items: CartItem[];
  updatedAt: string;
}

export interface OrderItem {
  productId: string;
  productName: string;
  price: number;
  quantity: number;
}

export interface Order {
  orderId: string;
  items: OrderItem[];
  total: number;
  placedAt: string;
}

interface UserData {
  cart: Cart;
  orders: Order[];
}

// ---------------------------------------------------------------------------
// Cache store
// ---------------------------------------------------------------------------

const cache = new Map<string, UserData>();

function emptyCart(): Cart {
  return { items: [], updatedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Hydrate — called once per user, pulls from Management API
// ---------------------------------------------------------------------------

export async function hydrateUser(
  accessToken: string,
  userId: string
): Promise<void> {
  if (cache.has(userId)) return;

  const meta = await getAuth0UserMetadata(accessToken, userId);

  const rawCart = (meta.cart as Cart | undefined) ?? emptyCart();
  if (!rawCart.items) rawCart.items = [];

  const rawOrders = (meta.orders as Order[] | undefined) ?? [];

  cache.set(userId, { cart: rawCart, orders: rawOrders });

  // Seed existing orders into the FGA-backed document store (idempotent)
  for (const order of rawOrders) {
    addOrderDocument(order, userId).catch(() => {});
  }
}

/** Returns true if the user's data has already been loaded. */
export function isHydrated(userId: string): boolean {
  return cache.has(userId);
}

// ---------------------------------------------------------------------------
// Cart — read / write
// ---------------------------------------------------------------------------

export function getCachedCart(userId: string): Cart {
  return cache.get(userId)?.cart ?? emptyCart();
}

export function setCachedCart(
  accessToken: string,
  userId: string,
  cart: Cart
): void {
  const entry = cache.get(userId);
  if (entry) {
    entry.cart = cart;
  } else {
    cache.set(userId, { cart, orders: [] });
  }
  // Persist in background — don't await
  patchAuth0UserMetadata(accessToken, userId, { cart }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Orders — read / append
// ---------------------------------------------------------------------------

export function getCachedOrders(userId: string): Order[] {
  return cache.get(userId)?.orders ?? [];
}

/**
 * Append an order, clear the cart, and persist both to user_metadata
 * in one PATCH call (background).
 */
export function addOrderAndClearCart(
  accessToken: string,
  userId: string,
  order: Order
): void {
  const entry = cache.get(userId) ?? { cart: emptyCart(), orders: [] };
  entry.orders.push(order);
  entry.cart = emptyCart();
  cache.set(userId, entry);

  // Persist in background
  patchAuth0UserMetadata(accessToken, userId, {
    orders: entry.orders,
    cart: entry.cart,
  }).catch(() => {});

  // Index in FGA-backed document store (background)
  addOrderDocument(order, userId).catch(() => {});
}

// ---------------------------------------------------------------------------
// Evict (e.g. on logout)
// ---------------------------------------------------------------------------

export function evictUser(userId: string): void {
  cache.delete(userId);
}
