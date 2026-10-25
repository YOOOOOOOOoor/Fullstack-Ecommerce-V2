import { useEffect, useReducer, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Grid2X2,
  List,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import API from "../../../API/api.js";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toSelectItems } from "@/lib/selectOptions.js";
import {
  buildProductsQuery,
  createProductsPageState,
  hasActiveProductFilters,
  PRODUCTS_PAGE_SIZE,
  PRODUCTS_VIEW_KEY,
  productsPageReducer,
  writePreference,
} from "./productsPageState.js";

const stockFilters = [
  { value: "all", label: "All stock" },
  { value: "in_stock", label: "In stock" },
  { value: "low_stock", label: "Low stock (1â€“10)" },
  { value: "out_of_stock", label: "Out of stock" },
];

const priceLabel = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? `ETB ${amount.toLocaleString("en-ET", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "â€”";
};

const dateLabel = (value) => {
  if (!value) return "â€”";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "â€”" : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const stockInfo = (value) => {
  const stock = Number(value);
  if (!Number.isFinite(stock)) return { label: "Unknown", variant: "outline", quantity: "â€”" };
  if (stock <= 0) return { label: "Out of stock", variant: "destructive", quantity: stock.toLocaleString() };
  if (stock <= 10) return { label: "Low stock", variant: "warning", quantity: stock.toLocaleString() };
  if (stock <= 20) return { label: "Medium", variant: "secondary", quantity: stock.toLocaleString() };
  return { label: "In stock", variant: "success", quantity: stock.toLocaleString() };
};

const statusVariant = (status) => {
  if (status === "published") return "success";
  if (status === "draft") return "warning";
  return "secondary";
};

function ProductImage({ product, grid = false }) {
  const [failed, setFailed] = useState(false);
  const imageClass = grid
    ? "relative flex h-44 w-full items-center justify-center overflow-hidden rounded-lg bg-muted/60"
    : "relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/60";
  return (
    <div className={imageClass}>
      {(!product.image_url || failed) && <Package className="size-6 text-muted-foreground" aria-hidden="true" />}
      {product.image_url && !failed && <img src={product.image_url} alt={product.title || "Product"} loading="lazy" className="absolute inset-0 size-full object-contain p-1" onError={() => setFailed(true)} />}
    </div>
  );
}

function ProductActions({ product, onEdit, onDelete, deleting }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button type="button" variant="outline" size="sm" onClick={() => onEdit(product.id)}><Pencil />Edit</Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={`More actions for ${product.title || "product"}`}><MoreHorizontal /></Button>} />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(product.id)}><Pencil />Edit product</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmOpen(true)}><Trash2 />Delete product</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this product?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes â€œ{product.title || "Untitled product"}â€. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={() => onDelete(product.id)}>{deleting ? "Deletingâ€¦" : "Delete product"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ProductStatus({ product }) {
  return <Badge variant={statusVariant(product.status)}>{product.status || "Unknown"}</Badge>;
}

function ProductSkeleton({ view }) {
  return view === "table" ? (
    <div className="space-y-3 p-4" aria-label="Loading products">
      {[1, 2, 3, 4, 5].map((item) => <Skeleton key={item} className="h-14 w-full" />)}
    </div>
  ) : (
    <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Loading products">
      {[1, 2, 3, 4, 5, 6].map((item) => <div key={item} className="space-y-3 rounded-xl border p-3"><Skeleton className="h-36 w-full" /><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-9 w-full" /></div>)}
    </div>
  );
}

function ProductToolbarButton({ label, active, icon: Icon, onClick }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant={active ? "secondary" : "ghost"} size="icon-sm" aria-label={label} aria-pressed={active} onClick={onClick}>
          <Icon aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

const Products = () => {
  const navigate = useNavigate();
  const [pageState, dispatch] = useReducer(productsPageReducer, undefined, () => createProductsPageState());
  const { filters, page, view } = pageState;
  const [categories, setCategories] = useState([]);
  const [colors, setColors] = useState([]);
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    try {
      writePreference(globalThis.localStorage, PRODUCTS_VIEW_KEY, view);
    } catch {
      // The page still works when browser storage is blocked.
    }
  }, [view]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    Promise.allSettled([API.get("/category", { signal: controller.signal }), API.get("/products/color", { signal: controller.signal })])
      .then(([categoryResult, colorResult]) => {
        if (!active) return;
        if (categoryResult.status === "fulfilled") setCategories(Array.isArray(categoryResult.value.data) ? categoryResult.value.data : []);
        if (colorResult.status === "fulfilled") setColors(Array.isArray(colorResult.value.data) ? colorResult.value.data : []);
        if (categoryResult.status === "rejected" || colorResult.status === "rejected") {
          const requestError = categoryResult.status === "rejected" ? categoryResult.reason : colorResult.reason;
          if (requestError.code !== "ERR_CANCELED") toast.error(requestError.response?.data?.message || "Some product filters could not be loaded.");
        }
      })
      .catch(() => { if (active) toast.error("Product filters could not be loaded."); });
    return () => { active = false; controller.abort(); };
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    API.get("/products", { params: buildProductsQuery(filters, page), signal: controller.signal })
      .then(({ data }) => {
        if (!active) return;
        if (!Array.isArray(data?.products)) throw new Error("Invalid products response");
        setProducts(data.products);
        setTotal(Number(data.total) || 0);
        setTotalPages(Math.max(1, Number(data.totalPages) || 1));
      })
      .catch((requestError) => {
        if (!active || requestError.code === "ERR_CANCELED") return;
        setError(requestError.response?.data?.message || "Products could not be loaded. Check your connection and try again.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [filters, page, refreshVersion]);

  const updateFilter = (name, value) => {
    setLoading(true);
    setError("");
    dispatch({ type: "filter", name, value });
  };
  const changePage = (nextPage) => {
    setLoading(true);
    setError("");
    dispatch({ type: "page", page: nextPage });
  };
  const clearFilters = () => {
    setLoading(true);
    setError("");
    dispatch({ type: "clear-filters" });
  };
  const retry = () => {
    setLoading(true);
    setError("");
    setRefreshVersion((version) => version + 1);
  };
  const editProduct = (id) => navigate(`/admin/products/${id}`);

  const deleteProduct = async (id) => {
    try {
      setDeletingId(id);
      await API.delete(`/products/${id}`);
      toast.success("Product deleted successfully.");
      setLoading(true);
      setError("");
      setRefreshVersion((version) => version + 1);
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || "Failed to delete product.");
    } finally {
      setDeletingId(null);
    }
  };

  const filtersActive = hasActiveProductFilters(filters);

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 p-4 sm:p-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Catalog management</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">Products</h1>
          <p className="mt-2 text-sm text-muted-foreground">Manage your catalog and inventory.</p>
        </div>
        <Button type="button" onClick={() => navigate("/admin/products/add")}><Plus />Add Product</Button>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2"><SlidersHorizontal className="size-4 text-primary" /><CardTitle className="text-base">Search and filters</CardTitle></div>
          <CardDescription>Find products by name, category, status, stock, or price.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2 sm:col-span-2 xl:col-span-1">
              <label htmlFor="product-search" className="block text-sm font-medium leading-none">Search products</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input id="product-search" type="search" value={filters.search} placeholder="Search products…" className="h-10 rounded-xl pl-9 text-sm" onChange={(event) => updateFilter("search", event.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="product-category" className="block text-sm font-medium leading-none">Category</label>
              <Select value={filters.category} onValueChange={(value) => updateFilter("category", value)} items={toSelectItems([{ value: "all", label: "All categories" }, ...categories.map((category) => ({ value: category.id, label: category.name }))])}>
                <SelectTrigger id="product-category" aria-label="Filter by category" className="h-10 w-full rounded-xl text-sm"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All categories</SelectItem>{categories.map((category) => <SelectItem key={category.id} value={String(category.id)}>{category.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label htmlFor="product-status" className="block text-sm font-medium leading-none">Publication status</label>
              <Select value={filters.status} onValueChange={(value) => updateFilter("status", value)} items={toSelectItems(["all", "published", "draft", "archived"].map((status) => ({ value: status, label: status === "all" ? "All statuses" : status[0].toUpperCase() + status.slice(1) })))}>
                <SelectTrigger id="product-status" aria-label="Filter by publication status" className="h-10 w-full rounded-xl text-sm"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup><SelectLabel>Status</SelectLabel>{["all", "published", "draft", "archived"].map((status) => <SelectItem key={status} value={status}>{status === "all" ? "All statuses" : status[0].toUpperCase() + status.slice(1)}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label htmlFor="product-color" className="block text-sm font-medium leading-none">Color</label>
              <Select value={filters.color} onValueChange={(value) => updateFilter("color", value)} items={toSelectItems([{ value: "all", label: "All colors" }, ...colors.map((entry) => ({ value: entry.color, label: entry.color }))])}>
                <SelectTrigger id="product-color" aria-label="Filter by color" className="h-10 w-full rounded-xl text-sm"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All colors</SelectItem>{colors.map((entry) => <SelectItem key={entry.id} value={String(entry.color)}>{entry.color}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label htmlFor="product-stock" className="block text-sm font-medium leading-none">Stock status</label>
              <Select value={filters.stockStatus} onValueChange={(value) => updateFilter("stockStatus", value)} items={toSelectItems(stockFilters)}>
                <SelectTrigger id="product-stock" aria-label="Filter by stock status" className="h-10 w-full rounded-xl text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{stockFilters.map((filter) => <SelectItem key={filter.value} value={filter.value}>{filter.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <span className="block text-sm font-medium leading-none">Price range (ETB)</span>
              <div className="grid grid-cols-2 gap-3">
                <div><label htmlFor="product-min-price" className="sr-only">Minimum price</label><Input id="product-min-price" type="number" min="0" step="0.01" inputMode="decimal" placeholder="Minimum" value={filters.minPrice} className="h-10 rounded-xl text-sm" onChange={(event) => updateFilter("minPrice", event.target.value)} /></div>
                <div><label htmlFor="product-max-price" className="sr-only">Maximum price</label><Input id="product-max-price" type="number" min="0" step="0.01" inputMode="decimal" placeholder="Maximum" value={filters.price === "all" ? "" : filters.price} className="h-10 rounded-xl text-sm" onChange={(event) => updateFilter("price", event.target.value || "all")} /></div>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            {filtersActive ? <Button type="button" variant="ghost" onClick={clearFilters}>Clear filters</Button> : <span />}
            <span className="text-xs text-muted-foreground">{loading ? "Updating results…" : `${total.toLocaleString()} ${total === 1 ? "product" : "products"}`}</span>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-col gap-3 border-b py-4 sm:flex-row sm:items-center sm:justify-between">
          <div><CardTitle>Product catalog</CardTitle><CardDescription className="mt-1">{loading ? "Loading productsâ€¦" : `Page ${page} of ${totalPages} | ${total.toLocaleString()} total`}</CardDescription></div>
          <TooltipProvider>
            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              <div className="flex items-center rounded-lg border bg-muted/40 p-0.5" aria-label="Product view">
                <ProductToolbarButton label="Table view" active={view === "table"} icon={List} onClick={() => dispatch({ type: "view", view: "table" })} />
                <ProductToolbarButton label="Grid view" active={view === "grid"} icon={Grid2X2} onClick={() => dispatch({ type: "view", view: "grid" })} />
              </div>
            </div>
          </TooltipProvider>
        </CardHeader>

        {loading ? <ProductSkeleton view={view} /> : error ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center" role="alert">
            <CircleAlert className="size-8 text-destructive" aria-hidden="true" />
            <p className="max-w-lg text-sm text-muted-foreground">{error}</p>
            <Button type="button" variant="outline" onClick={retry}>Retry</Button>
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <div className="rounded-full bg-primary/10 p-3 text-primary"><Archive className="size-6" aria-hidden="true" /></div>
            <div><h2 className="font-semibold">{filtersActive ? "No matching products" : "No products yet"}</h2><p className="mt-1 text-sm text-muted-foreground">{filtersActive ? "Try adjusting your filters or clear them to see the full catalog." : "Add a product to start building your catalog."}</p></div>
            {filtersActive ? <Button type="button" variant="outline" onClick={clearFilters}>Clear filters</Button> : <Button type="button" onClick={() => navigate("/admin/products/add")}><Plus />Add Product</Button>}
          </div>
        ) : view === "table" ? (
          <div className="overflow-x-auto">
            <Table className="min-w-[1040px]">
              <TableHeader><TableRow className="bg-muted/30 hover:bg-muted/30"><TableHead>Product</TableHead><TableHead>Category</TableHead><TableHead>Color</TableHead><TableHead>Price</TableHead><TableHead>Stock</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {products.map((product) => {
                  const stock = stockInfo(product.stock);
                  return <TableRow key={product.id} className="hover:bg-muted/30">
                    <TableCell><div className="flex min-w-0 items-center gap-3"><ProductImage product={product} /><div className="min-w-0"><p className="max-w-64 truncate font-medium">{product.title || "Untitled product"}</p><p className="max-w-72 line-clamp-2 text-xs text-muted-foreground">{product.description || "No description"}</p></div></div></TableCell>
                    <TableCell>{product.category_name ? <Badge variant="outline" className="max-w-36 truncate">{product.category_name}</Badge> : <span className="text-sm text-muted-foreground">Uncategorized</span>}</TableCell>
                    <TableCell>{product.color ? <span className="flex items-center gap-2 text-sm"><span className="size-4 rounded-full border" style={{ backgroundColor: product.color }} aria-hidden="true" />{product.color}</span> : <span className="text-sm text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="whitespace-nowrap font-medium">{priceLabel(product.price)}</TableCell>
                    <TableCell><div className="flex items-center gap-2"><span className="font-medium tabular-nums">{stock.quantity}</span><Badge variant={stock.variant}>{stock.label}</Badge></div></TableCell>
                    <TableCell><ProductStatus product={product} /></TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{dateLabel(product.created_at)}</TableCell>
                    <TableCell><ProductActions product={product} onEdit={editProduct} onDelete={deleteProduct} deleting={deletingId === product.id} /></TableCell>
                  </TableRow>;
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {products.map((product) => {
              const stock = stockInfo(product.stock);
              return <Card key={product.id} className="overflow-hidden border-border/80 shadow-none">
                <ProductImage product={product} grid />
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-semibold">{product.title || "Untitled product"}</h3><p className="mt-1 line-clamp-2 min-h-10 text-sm text-muted-foreground">{product.description || "No description available."}</p></div><span className="shrink-0 font-semibold text-primary">{priceLabel(product.price)}</span></div>
                  <div className="flex flex-wrap items-center gap-1.5"><ProductStatus product={product} /><Badge variant={stock.variant}>{stock.label}</Badge><Badge variant="outline">{product.category_name || "Uncategorized"}</Badge></div>
                  <div className="flex items-center justify-between gap-3 border-t pt-3 text-sm"><span className="flex min-w-0 items-center gap-2 truncate text-muted-foreground">{product.color ? <><span className="size-4 shrink-0 rounded-full border" style={{ backgroundColor: product.color }} aria-hidden="true" />{product.color}</> : "Color not set"}</span><span className="shrink-0">Stock <strong className="tabular-nums">{stock.quantity}</strong></span></div>
                  <div className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">Created {dateLabel(product.created_at)}</span><ProductActions product={product} onEdit={editProduct} onDelete={deleteProduct} deleting={deletingId === product.id} /></div>
                </CardContent>
              </Card>;
            })}
          </div>
        )}

        {!loading && !error && products.length > 0 && <footer className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">Showing {((page - 1) * PRODUCTS_PAGE_SIZE) + 1}â€“{Math.min(page * PRODUCTS_PAGE_SIZE, total)} of {total.toLocaleString()} products</p>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => changePage(page - 1)}><ChevronLeft />Previous</Button>
            <span className="min-w-16 text-center text-sm tabular-nums">{page} / {totalPages}</span>
            <Button type="button" variant="outline" size="sm" disabled={page >= totalPages} onClick={() => changePage(page + 1)}>Next<ChevronRight /></Button>
          </div>
        </footer>}
      </Card>
      <span className="sr-only" aria-live="polite">{loading ? "Loading products" : `${total} products found`}</span>
    </div>
  );
};

export default Products;
