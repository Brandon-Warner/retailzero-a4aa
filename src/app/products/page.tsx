import { getProducts } from "@/lib/data/products";
import { ProductGrid } from "@/components/products/product-grid";

export default function ProductsPage() {
  const products = getProducts();

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Products</h1>
        <p className="mt-2 text-muted-foreground">
          Browse our collection of products
        </p>
      </div>
      <ProductGrid products={products} />
    </div>
  );
}
