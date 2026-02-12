"use client";

import { Trash2 } from "lucide-react";
import type { Product } from "@/lib/data/products";

interface CartItemProps {
  product: Product;
  quantity: number;
  onRemove: (productId: string) => void;
}

export function CartItem({ product, quantity, onRemove }: CartItemProps) {
  return (
    <div className="flex items-center gap-4 py-4 border-b">
      <div className="h-20 w-20 rounded-md bg-muted flex-shrink-0 overflow-hidden">
        <img
          src={product.image}
          alt={product.name}
          className="h-full w-full object-cover"
        />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-sm">{product.name}</h3>
        <p className="text-sm text-muted-foreground">Qty: {quantity}</p>
      </div>
      <div className="text-right">
        <p className="font-semibold">
          ${(product.price * quantity).toFixed(2)}
        </p>
        <button
          onClick={() => onRemove(product.id)}
          className="mt-1 text-sm text-destructive hover:underline inline-flex items-center gap-1"
        >
          <Trash2 className="h-3 w-3" />
          Remove
        </button>
      </div>
    </div>
  );
}
