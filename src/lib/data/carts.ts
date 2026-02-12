import fs from "fs";
import path from "path";

const dataDir = path.join(process.cwd(), "data");

export interface CartItem {
  productId: string;
  quantity: number;
  addedAt: string;
}

export interface Cart {
  items: CartItem[];
  updatedAt: string;
}

type CartsData = Record<string, Cart>;

function readCarts(): CartsData {
  const raw = fs.readFileSync(path.join(dataDir, "carts.json"), "utf-8");
  return JSON.parse(raw);
}

function writeCarts(carts: CartsData): void {
  fs.writeFileSync(
    path.join(dataDir, "carts.json"),
    JSON.stringify(carts, null, 2)
  );
}

export function getCart(userId: string): Cart {
  const carts = readCarts();
  return carts[userId] || { items: [], updatedAt: new Date().toISOString() };
}

export function addToCart(
  userId: string,
  productId: string,
  quantity: number = 1
): Cart {
  const carts = readCarts();
  if (!carts[userId]) {
    carts[userId] = { items: [], updatedAt: new Date().toISOString() };
  }
  const cart = carts[userId];
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
  writeCarts(carts);
  return cart;
}

export function removeFromCart(userId: string, productId: string): Cart {
  const carts = readCarts();
  if (!carts[userId]) {
    return { items: [], updatedAt: new Date().toISOString() };
  }
  const cart = carts[userId];
  cart.items = cart.items.filter((i) => i.productId !== productId);
  cart.updatedAt = new Date().toISOString();
  writeCarts(carts);
  return cart;
}

export function clearCart(userId: string): Cart {
  const carts = readCarts();
  carts[userId] = { items: [], updatedAt: new Date().toISOString() };
  writeCarts(carts);
  return carts[userId];
}

export function checkout(userId: string): { orderId: string; total: number } {
  const carts = readCarts();
  const cart = carts[userId];
  if (!cart || cart.items.length === 0) {
    throw new Error("Cart is empty");
  }
  const productsRaw = fs.readFileSync(
    path.join(dataDir, "products.json"),
    "utf-8"
  );
  const products = JSON.parse(productsRaw);
  let total = 0;
  for (const item of cart.items) {
    const product = products.find(
      (p: { id: string; price: number }) => p.id === item.productId
    );
    if (product) {
      total += product.price * item.quantity;
    }
  }
  carts[userId] = { items: [], updatedAt: new Date().toISOString() };
  writeCarts(carts);
  const orderId = `order-${Date.now()}`;
  return { orderId, total: Math.round(total * 100) / 100 };
}
