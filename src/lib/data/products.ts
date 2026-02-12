import fs from "fs";
import path from "path";

const dataDir = path.join(process.cwd(), "data");

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  category: string;
  stock: number;
  rating: number;
}

function readProducts(): Product[] {
  const raw = fs.readFileSync(path.join(dataDir, "products.json"), "utf-8");
  return JSON.parse(raw);
}

export function getProducts(): Product[] {
  return readProducts();
}

export function getProductById(id: string): Product | undefined {
  return readProducts().find((p) => p.id === id);
}

export function searchProducts(query?: string, category?: string): Product[] {
  let products = readProducts();
  if (category) {
    products = products.filter(
      (p) => p.category.toLowerCase() === category.toLowerCase()
    );
  }
  if (query) {
    const q = query.toLowerCase();
    products = products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
    );
  }
  return products;
}
