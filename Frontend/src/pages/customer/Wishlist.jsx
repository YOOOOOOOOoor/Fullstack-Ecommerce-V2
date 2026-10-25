import { useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../../../API/api.js";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { Heart } from "lucide-react";
import { useCustomerShop } from "../../context/CustomerShopContext.jsx";
const Wishlist = () => {
  const { wishlistItems: orders, wishlistLoading: loading, wishlistLoaded, toggleWishlist, refreshCart, refreshWishlist, addCartItem } = useCustomerShop();
  const navigate = useNavigate();
  const [busyProducts, setBusyProducts] = useState(() => new Set());

  const addCarts = async (id, quantity) => {
    let product_id = id;

    if (quantity == null) {
      quantity = 1;
    }

    try {
      const res = await API.post("/cart", {
        product_id,
        quantity,
      });

      addCartItem(product_id, quantity, orders.find((item) => Number(item.product_id) === Number(product_id)) || {});
      void refreshCart({ silent: true });
      toast.success(res.data.message || "Product added to cart successfully.");
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Failed to add product to cart.",
      );
    }
  };

  const remove = async (id) => {
    setBusyProducts((current) => new Set(current).add(Number(id)));
    try {
      await toggleWishlist(id);
      toast.success("Product removed from wishlist.");
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "Failed to remove product from wishlist.",
      );
    } finally {
      setBusyProducts((current) => {
        const next = new Set(current);
        next.delete(Number(id));
        return next;
      });
    }
  };

  return (
    <div
      className="
    min-h-screen
    bg-background
    px-4
    sm:px-6
    py-8
    sm:py-12
    "
    >
      <div className="max-w-7xl mx-auto">
        {/* Header */}

        <div className="mb-10">
          <div
            className="
          flex
          items-center
          gap-3
          "
          >
            <div>
              <h1
                className="
              text-3xl
              sm:text-4xl
              font-bold
              "
              >
                My Wishlist
              </h1>

              <p className="text-muted-foreground mt-1">
                Products you saved for later
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner className="size-8" />
          </div>
        ) : !wishlistLoaded ? (
          <div className="rounded-3xl border bg-card p-10 text-center shadow-sm sm:p-14">
            <h2 className="text-2xl font-semibold">Your wishlist could not be loaded</h2>
            <p className="mt-2 text-muted-foreground">Check your connection and try again.</p>
            <button type="button" onClick={() => { void refreshWishlist(); }} className="mt-5 rounded-xl border px-5 py-2 font-medium hover:bg-muted">Try again</button>
          </div>
        ) : orders.length === 0 ? (
          <div
            className="
          bg-card
          border
          rounded-3xl
          shadow-sm
          p-10
          sm:p-16
          text-center
          "
          >
            <Heart aria-hidden="true" className="mx-auto size-12 text-primary" />
            <h2
              className="
            text-2xl
            font-bold
            mt-6
            "
            >
              Your wishlist is empty
            </h2>

            <p
              className="
            text-muted-foreground
            mt-3
            "
            >
              Save products you love and come back anytime.
            </p>

            <button
              onClick={() => navigate("/products")}
              className="
            mt-8
            bg-primary
            text-primary-foreground
            px-8
            py-3
            rounded-xl
            font-semibold
            hover:opacity-90
            transition
            "
            >
              Continue Shopping
            </button>
          </div>
        ) : (
          <div
            className="
          grid
          sm:grid-cols-2
          lg:grid-cols-3
          xl:grid-cols-4
          gap-6
          "
          >
            {orders.map((order) => (
              <div
                key={order.id}
                className="
              bg-card
              border
              rounded-3xl
              shadow-sm
              overflow-hidden
              hover:shadow-lg
              transition
              "
              >
                {/* Image */}

                <div
                  onClick={() => navigate(`/products/${order.product_id}`)}
                  className="
                cursor-pointer
                bg-secondary
                "
                >
                  <img
                    src={order.image_url}
                    alt={order.title}
                    className="
                  w-full
                  h-56
                  object-cover
                  "
                  />
                </div>

                {/* Content */}

                <div className="p-5">
                  <h2
                    className="
                  text-lg
                  font-bold
                  truncate
                  "
                  >
                    {order.title}
                  </h2>

                  <p
                    className="
                  text-sm
                  text-muted-foreground
                  mt-2
                  line-clamp-2
                  "
                  >
                    {order.description}
                  </p>

                  <div
                    className="
                  flex
                  justify-between
                  items-center
                  mt-4
                  "
                  >
                    <p
                      className="
                    text-xl
                    font-bold
                    "
                    >
                      {order.price} ETB
                    </p>

                    <span
                      className="
                    text-sm
                    text-green-600
                    font-medium
                    "
                    >
                      {order.stock} left
                    </span>
                  </div>

                  <div
                    className="
                  grid
                  grid-cols-2
                  gap-2
                  mt-5
                  "
                  >
                    <button
                      onClick={() => addCarts(order.product_id)}
                      className="
                    col-span-2
                    bg-primary
                    text-primary-foreground
                    py-2.5
                    rounded-xl
                    font-medium
                    hover:opacity-90
                    transition
                    "
                    >
                      Add to Cart
                    </button>

                    <button
                      onClick={() => navigate(`/products/${order.product_id}`)}
                      className="
                    border
                    py-2
                    rounded-xl
                    hover:bg-secondary
                    transition
                    "
                    >
                      View
                    </button>

                    <button
                      type="button"
                      aria-label={`Remove ${order.title} from wishlist`}
                      disabled={busyProducts.has(Number(order.product_id))}
                      onClick={() => remove(order.product_id)}
                      className="
                    border
                    text-red-600
                    bg-red-50
                    py-2
                    rounded-xl
                    hover:bg-red-100
                    transition
                    "
                    >
                      <span className="inline-flex items-center justify-center gap-2"><Heart aria-hidden="true" className="size-4 fill-red-500 text-red-500" />Remove</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Wishlist;
