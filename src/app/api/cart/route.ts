import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth/auth0";
import { getProductById } from "@/lib/data/products";
import {
  hydrateUser,
  getCachedCart,
  setCachedCart,
  addOrderAndClearCart,
} from "@/lib/auth0/user-cache";
import { addOrderDocument } from "@/lib/fga/order-store";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getTokenAndUserId(): Promise<{
  accessToken: string;
  userId: string;
} | null> {
  const session = await auth0.getSession();
  if (!session?.user) return null;
  const tokenResult = await auth0.getAccessToken();
  return { accessToken: tokenResult.token, userId: session.user.sub };
}

/** Ensure the user's cart/orders are loaded into memory. */
async function ensureHydrated(accessToken: string, userId: string) {
  await hydrateUser(accessToken, userId);
}

// ---------------------------------------------------------------------------
// GET — read the authenticated user's cart (from cache)
// ---------------------------------------------------------------------------

export async function GET() {
  const auth = await getTokenAndUserId();
  if (!auth) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  await ensureHydrated(auth.accessToken, auth.userId);
  return NextResponse.json(getCachedCart(auth.userId));
}

// ---------------------------------------------------------------------------
// POST — add item / merge guest cart / checkout
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const auth = await getTokenAndUserId();
  if (!auth) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  await ensureHydrated(auth.accessToken, auth.userId);

  const body = await request.json();
  const { action, productId, quantity } = body;

  // -- Merge guest cart items -----------------------------------------------
  if (action === "merge") {
    const guestItems: { productId: string; quantity: number }[] =
      body.items || [];
    const cart = getCachedCart(auth.userId);

    for (const gi of guestItems) {
      const existing = cart.items.find((i) => i.productId === gi.productId);
      if (existing) {
        existing.quantity += gi.quantity;
      } else {
        cart.items.push({
          productId: gi.productId,
          quantity: gi.quantity,
          addedAt: new Date().toISOString(),
        });
      }
    }
    cart.updatedAt = new Date().toISOString();
    setCachedCart(auth.accessToken, auth.userId, cart);
    return NextResponse.json(cart);
  }

  // -- Checkout -------------------------------------------------------------
  if (action === "checkout") {
    const cart = getCachedCart(auth.userId);
    if (cart.items.length === 0) {
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
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

    addOrderAndClearCart(auth.accessToken, auth.userId, order);
    // Index in FGA-backed document store (background)
    addOrderDocument(order, auth.userId).catch(() => {});
    return NextResponse.json({ orderId, total });
  }

  // -- Add item -------------------------------------------------------------
  if (!productId) {
    return NextResponse.json(
      { error: "productId is required" },
      { status: 400 }
    );
  }

  const cart = getCachedCart(auth.userId);
  const existing = cart.items.find((i) => i.productId === productId);
  if (existing) {
    existing.quantity += quantity || 1;
  } else {
    cart.items.push({
      productId,
      quantity: quantity || 1,
      addedAt: new Date().toISOString(),
    });
  }
  cart.updatedAt = new Date().toISOString();
  setCachedCart(auth.accessToken, auth.userId, cart);
  return NextResponse.json(cart);
}

// ---------------------------------------------------------------------------
// DELETE — remove item or clear cart
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest) {
  const auth = await getTokenAndUserId();
  if (!auth) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  await ensureHydrated(auth.accessToken, auth.userId);

  const productId = request.nextUrl.searchParams.get("productId");
  const cart = getCachedCart(auth.userId);

  if (productId) {
    cart.items = cart.items.filter((i) => i.productId !== productId);
  } else {
    cart.items = [];
  }
  cart.updatedAt = new Date().toISOString();
  setCachedCart(auth.accessToken, auth.userId, cart);
  return NextResponse.json(cart);
}
