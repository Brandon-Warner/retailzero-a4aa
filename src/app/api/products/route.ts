import { NextRequest, NextResponse } from "next/server";
import { searchProducts } from "@/lib/data/products";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const query = searchParams.get("q") || undefined;
  const category = searchParams.get("category") || undefined;
  const products = searchProducts(query, category);
  return NextResponse.json(products);
}
