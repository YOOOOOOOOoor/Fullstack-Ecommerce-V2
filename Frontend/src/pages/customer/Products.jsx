import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";

// import {
//   AlertDialog,
//   AlertDialogAction,
//   AlertDialogCancel,
//   AlertDialogContent,
//   AlertDialogDescription,
//   AlertDialogFooter,
//   AlertDialogHeader,
//   AlertDialogTitle,
//   AlertDialogTrigger,
// } from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { useState, useEffect } from "react";
import API from "../../../API/api.js";

import { Field } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { SearchIcon } from "lucide-react";
import { Heart } from "lucide-react";
import { useCustomerShop } from "../../context/CustomerShopContext.jsx";
import { toSelectItems } from "@/lib/selectOptions.js";

const Products = () => {
  const [loading, setLoading] = useState(false);
  const [imageStyle, setImageStyle] = useState({});
  const navigate = useNavigate();
  const { refreshCart, addCartItem, toggleWishlist, wishlistIds, wishlistLoading } = useCustomerShop();
  const [wishlistBusy, setWishlistBusy] = useState(() => new Set());
  const [form, setForm] = useState({
    category: "",
    search: "",
    color: "",
    price: "all",
  });

  // const [cart, setCart] = useEffect({
  //   product_id: "",
  //   quantity: "",
  // });

  const addCarts = async (id, quantity, product = {}) => {
    const product_id = id;

    if (quantity == null) {
      quantity = 1;
    }

    try {
      const res = await API.post("/cart", {
        product_id,
        quantity,
      });

      addCartItem(product_id, quantity, product);
      void refreshCart({ silent: true });
      toast.success(res.data.message || "Product added to cart successfully.");
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Failed to add product to cart.",
      );
    }
  };

  const toggleProductWishlist = async (product) => {
    const product_id = product.id;
    setWishlistBusy((current) => new Set(current).add(product_id));
    try {
      const result = await toggleWishlist(product_id, product);
      toast.success(result.added ? "Product added to wishlist." : "Product removed from wishlist.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not update your wishlist.");
    } finally {
      setWishlistBusy((current) => {
        const next = new Set(current);
        next.delete(product_id);
        return next;
      });
    }
  };

  const [category, setCategory] = useState([]);
  useEffect(() => {
    const fetchCategory = async () => {
      try {
        const res = await API.get("/category");
        const data = res.data.map((c) => ({
          id: c.id,
          name: c.name,
        }));
        setCategory(data);
      } catch (error) {
        console.log(error, "error");
      }
    };
    fetchCategory();
  }, []);

  const [color, setColor] = useState([]);
  useEffect(() => {
    const fetchColor = async () => {
      try {
        const res = await API.get("/products/color");
        const data = res.data.map((c) => ({
          id: c.id,
          color: c.color,
        }));
        setColor(data);
      } catch (error) {
        console.log(error, "error");
      }
    };
    fetchColor();
  }, []);

  const [products, setProducts] = useState([]);
  // const [val, setVal] = useState(1);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);

        const res = await API.get("/products/customer", {
          params: {
            ...form,
            page,
            limit: 5,
          },
        });

        setProducts(res.data.products);
        setTotalPages(res.data.totalPages);
      } catch (error) {
        console.error(error);
        toast.error("Failed to load products.");
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [page, form]);

  return (
    <div
      className="
    min-h-screen
    bg-background
    px-4
    sm:px-6
    lg:px-10
    py-8
    sm:py-12
    "
    >
      {/* Header */}

      <div
        className="
      max-w-7xl
      mx-auto
      mb-8
      sm:mb-10
      "
      >
        <h1
          className="
        text-3xl
        sm:text-4xl
        font-bold
        text-foreground
        tracking-tight
        "
        >
          Products
        </h1>

        <p
          className="
        mt-2
        text-sm
        sm:text-base
        text-muted-foreground
        "
        >
          Explore our collection and find something you love.
        </p>
      </div>

      {/* Filters */}

      <div
        className="
      max-w-7xl
      mx-auto
      bg-card
      border
      rounded-2xl
      shadow-sm
      p-5
      sm:p-7
      mb-10
      "
      >
        <div
          className="
        grid
        md:grid-cols-4
        gap-5
        sm:gap-6
        "
        >
          {/* Search */}

          <div className="md:col-span-2">
            <Field>
              <InputGroup>
                <InputGroupAddon>
                  <SearchIcon />
                </InputGroupAddon>

                <InputGroupInput
                  placeholder="Search products..."
                  onChange={(e) =>
                    setForm({
                      ...form,
                      search: e.target.value,
                    })
                  }
                />
              </InputGroup>
            </Field>
          </div>

          {/* Price */}

          <div className="flex items-center gap-3">
            <span
              className="
    text-sm
    font-medium
    text-muted-foreground
    whitespace-nowrap
    "
            >
              Price
            </span>

            <Select
              value={String(form.price)}
              items={toSelectItems([
                { value: "all", label: "All Prices" },
                { value: "5000", label: "Under 5,000" },
                { value: "10000", label: "Under 10,000" },
                { value: "25000", label: "Under 25,000" },
                { value: "50000", label: "Under 50,000" },
                { value: "100000", label: "Under 100,000" },
              ])}
              onValueChange={(value) =>
                setForm({
                  ...form,
                  price: value,
                })
              }
            >
              <SelectTrigger
                className="
      flex-1
      h-11
      rounded-xl
      "
              >
                <SelectValue placeholder="All Prices" />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="all">All Prices</SelectItem>
                <SelectItem value="5000">Under 5,000</SelectItem>
                <SelectItem value="10000">Under 10,000</SelectItem>
                <SelectItem value="25000">Under 25,000</SelectItem>
                <SelectItem value="50000">Under 50,000</SelectItem>
                <SelectItem value="100000">Under 100,000</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Category */}

          <div className="flex items-center gap-3">
            <span
              className="
    text-sm
    font-medium
    text-muted-foreground
    whitespace-nowrap
    "
            >
              Category
            </span>

            <Select
              value={form.category}
              items={toSelectItems([{ value: "all", label: "All Categories" }, ...category.map((c) => ({ value: c.id, label: c.name }))])}
              onValueChange={(value) =>
                setForm({
                  ...form,
                  category: value,
                })
              }
            >
              <SelectTrigger
                className="
      flex-1
      h-11
      rounded-xl
      "
              >
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>

                {category.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Colors */}

        <div
          className="
        mt-7
        flex
        items-center
        gap-3
        flex-wrap
        "
        >
          <span
            className="
          text-sm
          font-medium
          text-muted-foreground
          mr-2
          "
          >
            Colors
          </span>

          <button
            onClick={() =>
              setForm({
                ...form,
                color: "all",
              })
            }
            className={`
  border
  rounded-full
  px-4
  py-1.5
  text-sm
  transition

  ${
    form.color === "all"
      ? "ring-2 ring-primary ring-offset-2"
      : "hover:bg-muted"
  }
  `}
          >
            All
          </button>

          {color.map((c) => (
            <button
              key={c.id}
              onClick={() =>
                setForm({
                  ...form,
                  color: c.color,
                })
              }
              className={`

              w-8
              h-8
              rounded-full
              border-2
              transition

              ${
                form.color === c.color
                  ? "ring-2 ring-primary ring-offset-2"
                  : "hover:ring-2 hover:ring-muted"
              }

              `}
              style={{
                backgroundColor: c.color,
              }}
            />
          ))}
        </div>
      </div>

      {/* Products */}

      <div className="max-w-7xl mx-auto">
        {loading ? (
          <div
            className="
      grid
      sm:grid-cols-2
      lg:grid-cols-3
      xl:grid-cols-4
      gap-5
      sm:gap-6
    "
          >
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="
          bg-card
          border
          rounded-2xl
          overflow-hidden
          shadow-sm
        "
              >
                {/* Image Skeleton */}
                <Skeleton
                  className="
            h-60
            sm:h-64
            w-full
          "
                />

                {/* Content Skeleton */}
                <div
                  className="
            p-4
            sm:p-5
            space-y-4
          "
                >
                  {/* Title */}
                  <Skeleton className="h-6 w-3/4" />

                  {/* Description */}
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                  </div>

                  {/* Price + Color */}
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-8 w-24" />

                    <Skeleton
                      className="
                h-7
                w-7
                rounded-full
              "
                    />
                  </div>

                  {/* Stock */}
                  <Skeleton
                    className="
              h-6
              w-28
              rounded-full
            "
                  />

                  {/* Buttons */}
                  <div className="flex gap-3 pt-2">
                    <Skeleton
                      className="
                h-10
                flex-1
                rounded-xl
              "
                    />

                    <Skeleton
                      className="
                h-10
                w-10
                rounded-xl
              "
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div
            className="
      bg-card
      border
      rounded-2xl
      shadow-sm
      py-20
      text-center
      text-muted-foreground
    "
          >
            No products found.
          </div>
        ) : (
          <div
            className="
        grid
        sm:grid-cols-2
        lg:grid-cols-3
        xl:grid-cols-4
        gap-5
        sm:gap-6
        "
          >
            {products.map((p) => (
              <div
                key={p.id}
                className="
              group
              bg-card
              border
              rounded-2xl
              overflow-hidden
              shadow-sm
              hover:shadow-md
              transition-all
              duration-300
              "
              >
                {/* Image */}

                {/* Image */}

                <div
                  onClick={() => navigate(`/products/${p.id}`)}
                  className="
  cursor-pointer
  overflow-hidden
  bg-muted
  flex
  items-center
  justify-center
  h-60
  sm:h-64
  "
                >
                  <img
                    src={p.image_url}
                    alt={p.title}
                    onLoad={(e) => {
                      const img = e.currentTarget;

                      const ratio = img.naturalWidth / img.naturalHeight;

                      let style = "object-cover";

                      if (ratio < 0.8) {
                        // very tall image
                        style = "object-contain";
                      } else if (ratio > 1.5) {
                        // very wide image
                        style = "object-cover";
                      } else {
                        // normal image
                        style = "object-cover";
                      }

                      setImageStyle((prev) => ({
                        ...prev,
                        [p.id]: style,
                      }));
                    }}
                    className={`
    w-full
    h-full
    transition
    duration-300
    group-hover:scale-105

    ${imageStyle[p.id] || "object-cover"}
  `}
                  />
                </div>
                {/* Content */}
                <div
                  className="
                p-4
                sm:p-5
                space-y-4
                "
                >
                  <h2
                    className="
                  text-lg
                  font-semibold
                  truncate
                  "
                  >
                    {p.title}
                  </h2>

                  <p
                    className="
                  text-sm
                  text-muted-foreground
                  line-clamp-2
                  min-h-[40px]
                  "
                  >
                    {p.description}
                  </p>

                  {/* Price + Color */}

                  <div
                    className="
                  flex
                  items-center
                  justify-between
                  "
                  >
                    <span
                      className="
                    text-xl
                    sm:text-2xl
                    font-bold
                    "
                    >
                      ${p.price}
                    </span>

                    <div
                      className="
                    w-7
                    h-7
                    rounded-full
                    border
                    "
                      style={{
                        backgroundColor: p.color,
                      }}
                    />
                  </div>

                  {/* Stock */}

                  <div>
                    <span
                      className="
                    inline-flex
                    rounded-full
                    bg-muted
                    px-3
                    py-1
                    text-xs
                    text-muted-foreground
                    "
                    >
                      {p.stock} available
                    </span>
                  </div>

                  {/* Buttons */}

                  <div
                    className="
                  flex
                  gap-3
                  pt-2
                  "
                  >
                    <Button
                      className="
                    flex-1
                    rounded-xl
                    "
                      onClick={() => addCarts(p.id, 1, p)}
                    >
                      Add Cart
                    </Button>

                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={wishlistIds.has(Number(p.id)) ? `Remove ${p.title} from wishlist` : `Add ${p.title} to wishlist`}
                      aria-pressed={wishlistIds.has(Number(p.id))}
                      disabled={wishlistBusy.has(Number(p.id)) || wishlistLoading}
                      className={`rounded-xl ${wishlistIds.has(Number(p.id)) ? "text-red-500 hover:text-red-600" : "text-muted-foreground"}`}
                      onClick={() => toggleProductWishlist(p)}
                    >
                      <Heart className={`size-5 ${wishlistIds.has(Number(p.id)) ? "fill-current" : ""}`} />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div
            className="
        mt-10
        sm:mt-14
        flex
        justify-center
        "
          >
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();

                      if (page > 1) setPage(page - 1);
                    }}
                  />
                </PaginationItem>

                {[...Array(totalPages)].map((_, index) => (
                  <PaginationItem key={index}>
                    <PaginationLink
                      href="#"
                      isActive={page === index + 1}
                      onClick={(e) => {
                        e.preventDefault();

                        setPage(index + 1);
                      }}
                    >
                      {index + 1}
                    </PaginationLink>
                  </PaginationItem>
                ))}

                <PaginationItem>
                  <PaginationNext
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();

                      if (page < totalPages) setPage(page + 1);
                    }}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
      </div>
    </div>
  );
};

export default Products;
