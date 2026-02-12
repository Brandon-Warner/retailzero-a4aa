/**
 * In-memory order document store with OpenFGA integration.
 *
 * Simulates a vector database where every order is stored as a document.
 * When a document is added, an FGA tuple is written granting the owner
 * `owner` access to that order.  Retrieval is filtered through FGAFilter
 * so only documents the requesting user is authorized to view are returned.
 */

import { FGAFilter, buildOpenFgaClient } from "@auth0/ai";
import type { Order } from "@/lib/auth0/user-cache";

// ---------------------------------------------------------------------------
// Order document shape
// ---------------------------------------------------------------------------

export interface OrderDocument {
  id: string; // orderId
  userId: string; // owner's Auth0 user ID
  items: Order["items"];
  total: number;
  placedAt: string;
  summary: string; // human-readable summary for text search
}

// ---------------------------------------------------------------------------
// In-memory store (simulates a vector DB)
// ---------------------------------------------------------------------------

const store = new Map<string, OrderDocument>();

function buildSummary(order: Order): string {
  const parts = order.items.map(
    (i) => `${i.productName} x${i.quantity}`
  );
  return `${parts.join(", ")} — $${order.total.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Write path — store document + write FGA tuple
// ---------------------------------------------------------------------------

export async function addOrderDocument(
  order: Order,
  userId: string
): Promise<void> {
  // Idempotent — skip if already indexed
  if (store.has(order.orderId)) return;

  const doc: OrderDocument = {
    id: order.orderId,
    userId,
    items: order.items,
    total: order.total,
    placedAt: order.placedAt,
    summary: buildSummary(order),
  };

  store.set(order.orderId, doc);

  // Write FGA tuple: user:{userId} is owner of order:{orderId}
  try {
    const fgaClient = buildOpenFgaClient();
    await fgaClient.write(
      {
        writes: [
          {
            user: `user:${userId}`,
            relation: "owner",
            object: `order:${order.orderId}`,
          },
        ],
      },
    );
  } catch (e) {
    // Log but don't block — the document is still in the store.
    // FGA checks will simply deny access until the tuple exists.
    console.warn(
      `[order-store] Failed to write FGA tuple for order ${order.orderId}:`,
      (e as Error).message
    );
  }
}

// ---------------------------------------------------------------------------
// Read path — unfiltered retrieval (for FGAFilter to process)
// ---------------------------------------------------------------------------

export function getAllOrderDocuments(): OrderDocument[] {
  return Array.from(store.values());
}

/**
 * Basic text search on the summary field (simulates vector similarity).
 * Returns all documents if no query is provided.
 */
export function searchOrderDocuments(query?: string): OrderDocument[] {
  const docs = getAllOrderDocuments();
  if (!query) return docs;

  const lower = query.toLowerCase();
  return docs.filter((d) => d.summary.toLowerCase().includes(lower));
}

// ---------------------------------------------------------------------------
// Self-healing — retry FGA tuple writes for orders missing authorization
// ---------------------------------------------------------------------------

/**
 * For orders that exist in user_metadata but were denied by FGA (missing
 * tuples), ensure the documents are in the store and batch-write tuples.
 * Returns the order IDs that were successfully repaired.
 *
 * This is intentionally separate from `addOrderDocument` (which is
 * idempotent on the store key) so it doesn't change `hydrateUser` behavior.
 */
export async function repairMissingTuples(
  orders: Order[],
  userId: string
): Promise<string[]> {
  if (orders.length === 0) return [];

  // Ensure every order has a document in the store
  for (const order of orders) {
    if (!store.has(order.orderId)) {
      store.set(order.orderId, {
        id: order.orderId,
        userId,
        items: order.items,
        total: order.total,
        placedAt: order.placedAt,
        summary: buildSummary(order),
      });
    }
  }

  // Batch-write all missing tuples in a single request
  try {
    const fgaClient = buildOpenFgaClient();
    await fgaClient.write({
      writes: orders.map((order) => ({
        user: `user:${userId}`,
        relation: "owner",
        object: `order:${order.orderId}`,
      })),
    });
    return orders.map((o) => o.orderId);
  } catch (e) {
    console.warn(
      `[order-store] Failed to repair FGA tuples:`,
      (e as Error).message
    );
    return [];
  }
}

// ---------------------------------------------------------------------------
// FGAFilter factory — returns a filter scoped to a specific user
// ---------------------------------------------------------------------------

export function getOrderFilter(userId: string) {
  return FGAFilter.create<OrderDocument>({
    buildQuery: (doc) => ({
      user: `user:${userId}`,
      object: `order:${doc.id}`,
      relation: "viewer",
    }),
  });
}
