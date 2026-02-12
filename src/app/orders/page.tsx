"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/provider";
import { Package } from "lucide-react";

interface OrderItem {
  productId: string;
  productName: string;
  price: number;
  quantity: number;
}

interface Order {
  orderId: string;
  items: OrderItem[];
  total: number;
  placedAt: string;
}

export default function OrdersPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    fetch("/api/orders")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setOrders(data))
      .finally(() => setLoading(false));
  }, [isAuthenticated, authLoading]);

  if (loading || authLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <Package className="h-12 w-12 mx-auto text-muted-foreground" />
        <p className="text-muted-foreground mt-4">
          Please log in to view your orders.
        </p>
        <Link
          href="/login"
          className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
        >
          Log In
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Your Orders</h1>
      {orders.length === 0 ? (
        <div className="text-center py-12">
          <Package className="h-12 w-12 mx-auto text-muted-foreground" />
          <p className="text-muted-foreground mt-4">No orders yet.</p>
          <Link
            href="/products"
            className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
          >
            Browse Products
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {[...orders].reverse().map((order) => (
            <div
              key={order.orderId}
              className="rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {order.orderId}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(order.placedAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <p className="text-lg font-semibold">
                  ${order.total.toFixed(2)}
                </p>
              </div>
              <div className="divide-y divide-[#2a2a2a]">
                {order.items.map((item) => (
                  <div
                    key={item.productId}
                    className="flex items-center justify-between py-3"
                  >
                    <div>
                      <p className="font-medium">{item.productName}</p>
                      <p className="text-sm text-muted-foreground">
                        Qty: {item.quantity} &times; ${item.price.toFixed(2)}
                      </p>
                    </div>
                    <p className="font-medium">
                      ${(item.price * item.quantity).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
