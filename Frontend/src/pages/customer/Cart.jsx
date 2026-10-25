import API from "../../../API/api.js";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCustomerShop } from "../../context/CustomerShopContext.jsx";

import { Spinner } from "@/components/ui/spinner";
import { ShoppingBag } from "lucide-react";

const toFiniteNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const formatEtb = (value) => `ETB ${(toFiniteNumber(value) ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const Cart = () => {
  const navigate = useNavigate();
  const { cartItems: cart, cartCount, cartLoading, cartLoaded, refreshCart, updateCartItem } = useCustomerShop();
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryReload, setSummaryReload] = useState(0);
  const [summaryError, setSummaryError] = useState(false);
  const loading = cartLoading || summaryLoading;

  const [summary, setSummary] = useState({ subtotal: null, shipping_fee: null, payable_total: null, shipping_configured: false, configuration_message: "" });

  useEffect(() => {
    let active = true;
    const fetchSummary = async () => {
      try {
        setSummaryLoading(true);
        setSummaryError(false);
        const totalRes = await API.get("/cart/all");
        const subtotal = toFiniteNumber(totalRes.data?.subtotal ?? totalRes.data?.total);
        if (!active) return;
        setSummary({
          subtotal,
          shipping_fee: toFiniteNumber(totalRes.data?.shipping_fee),
          payable_total: toFiniteNumber(totalRes.data?.payable_total),
          shipping_configured: Boolean(totalRes.data?.shipping_configured),
          configuration_message: totalRes.data?.configuration_message || "",
        });
      } catch {
        if (active) setSummaryError(true);
      } finally {
        if (active) setSummaryLoading(false);
      }
    };

    void fetchSummary();
    return () => { active = false; };
  }, [summaryReload]);

  const remove = async (id) => {
    try {
      await API.delete(`/cart/${id}`);
      updateCartItem(id, 0);
      void refreshCart({ silent: true });
      setSummaryReload((current) => current + 1);
    } catch (error) {
      console.log(error.response.data.message);
    }
  };

  const inc = async (id) => {
    let product_id = id;
    const quantity = cart.find((c) => c.product_id === id).quantity + 1;
    try {
      await API.patch(`/cart/${product_id}`, {
        quantity,
      });

      updateCartItem(product_id, quantity);
      void refreshCart({ silent: true });
      setSummaryReload((current) => current + 1);
    } catch (error) {
      console.log(error.response.data.message);
    }
  };
  const dec = async (id) => {
    let product_id = id;
    let quantity = cart.find((c) => c.product_id === id).quantity - 1;
    try {
      await API.patch(`/cart/${product_id}`, {
        quantity,
      });

      updateCartItem(product_id, quantity);
      void refreshCart({ silent: true });
      setSummaryReload((current) => current + 1);
    } catch (error) {
      console.log(error.response.data.message);
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
          <h1
            className="
          text-3xl
          sm:text-4xl
          font-bold
          "
          >
            Shopping Cart
          </h1>

          <p className="text-muted-foreground mt-2">
            Review your items before completing your purchase.
          </p>
        </div>

        <div
          className="
        grid
        lg:grid-cols-3
        gap-8
        "
        >
          {/* Cart Items */}

          <div
            className="
          lg:col-span-2
          space-y-5
          "
          >
            {loading ? (
              <div
                className="
      bg-card
      rounded-3xl
      border
      shadow-sm
      py-20
      px-6
    "
              >
                <div className="flex flex-col items-center justify-center text-center">
                  <Spinner className="size-8 mb-5" />

                  <h3 className="text-lg font-semibold">
                    Loading your cart...
                  </h3>
                </div>
              </div>
            ) : !cartLoaded ? (
              <div className="rounded-3xl border bg-card p-10 text-center shadow-sm">
                <h2 className="text-xl font-semibold">Your cart could not be loaded</h2>
                <p className="mt-2 text-sm text-muted-foreground">Check your connection and try again.</p>
                <button type="button" onClick={() => { void refreshCart(); setSummaryReload((current) => current + 1); }} className="mt-5 rounded-xl border px-5 py-2 font-medium hover:bg-muted">Try again</button>
              </div>
            ) : cart.length === 0 ? (
              <div
                className="
              bg-card
              rounded-3xl
              border
              p-12
              text-center
              shadow-sm
              "
              >
                <ShoppingBag aria-hidden="true" className="mx-auto mb-5 size-12 text-primary" />

                <h2 className="text-2xl font-bold">Your cart is empty</h2>

                <p className="text-muted-foreground mt-3">
                  Looks like you haven't added anything yet.
                </p>

                <button
                  onClick={() => navigate("/products")}
                  className="
                mt-7
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
                  Browse Products
                </button>
              </div>
            ) : (
              cart.map((c) => (
                <div
                  key={c.id}
                  className="
                bg-card
                rounded-3xl
                border
                p-5
                flex
                gap-5
                hover:shadow-md
                transition
                "
                >
                  <img
                    src={c.image_url}
                    alt={c.title}
                    className="
                  w-32
                  h-32
                  rounded-2xl
                  object-cover
                  "
                  />

                  <div className="flex-1">
                    <div className="flex justify-between gap-4">
                      <div>
                        <h2 className="text-xl font-bold">{c.title}</h2>

                        <p
                          className="
                        text-sm
                        text-muted-foreground
                        mt-2
                        line-clamp-2
                        "
                        >
                          {c.description}
                        </p>

                        <p
                          className="
                        text-emerald-600
                        text-sm
                        mt-3
                        font-medium
                        "
                        >
                          {c.stock} available
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-2xl font-bold">{formatEtb(c.price)}</p>

                        <button
                          type="button"
                          aria-label={`Remove ${c.title} from cart`}
                          onClick={() => remove(c.product_id)}
                          className="
                        text-red-500
                        text-sm
                        mt-3
                        hover:text-red-600
                        transition
                        "
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    <div
                      className="
                    flex
                    items-center
                    justify-between
                    mt-6
                    "
                    >
                      <span className="text-muted-foreground">Quantity</span>

                      <div
                        className="
                      flex
                      items-center
                      gap-4
                      bg-secondary
                      rounded-full
                      px-4
                      py-2
                      "
                      >
                        <button
                          type="button"
                          aria-label={`Decrease ${c.title} quantity`}
                          onClick={() => dec(c.product_id)}
                          className="
                        min-w-10
                        h-10
                        rounded-full
                        hover:bg-card
                        transition
                        "
                        >
                          -
                        </button>

                        <span className="font-semibold">{c.quantity}</span>

                        <button
                          type="button"
                          aria-label={`Increase ${c.title} quantity`}
                          disabled={c.quantity >= c.stock}
                          onClick={() => inc(c.product_id)}
                          className="
                        min-w-10
                        h-10
                        rounded-full
                        hover:bg-card
                        transition
                        disabled:opacity-40
                        "
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Summary */}

          <div
            className="
          bg-card
          rounded-3xl
          border
          shadow-sm
          p-7
          h-fit
          sticky
          top-24
          "
          >
            <h2 className="text-2xl font-bold mb-7">Order Summary</h2>

            <div className="space-y-5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Items</span>

                <span className="font-medium">{cartCount}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{summaryLoading ? "Loading..." : summaryError || summary.subtotal === null ? "Unavailable" : formatEtb(summary.subtotal)}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping</span>
                <span className="text-emerald-600 font-medium">{summaryLoading ? "Loading..." : summaryError || summary.shipping_fee === null ? "Not configured" : formatEtb(summary.shipping_fee)}</span>
              </div>

              <hr />

              <div
                className="
              flex
              justify-between
              text-xl
              font-bold
              "
              >
                <span>Total</span>

                <span>{summaryLoading ? "Loading..." : summaryError || summary.payable_total === null ? "Unavailable" : formatEtb(summary.payable_total)}</span>
              </div>
            </div>

            {summary.configuration_message && <p role="status" className="mt-4 text-sm text-muted-foreground">{summary.configuration_message}</p>}
            {summaryError && <div role="alert" className="mt-4 text-sm text-destructive">Order totals could not be loaded. <button type="button" className="font-semibold underline underline-offset-2" onClick={() => setSummaryReload((current) => current + 1)}>Try again</button></div>}

            <button
              disabled={loading || !cartLoaded || cart.length === 0 || cart.some((item) => toFiniteNumber(item.price) === null || toFiniteNumber(item.quantity) === null || toFiniteNumber(item.price) < 0 || toFiniteNumber(item.quantity) <= 0)}
              onClick={() => navigate("/checkout")}
              className="
            w-full
            mt-7
            bg-primary
            text-primary-foreground
            py-3
            rounded-xl
            font-semibold
            hover:opacity-90
            transition
            disabled:cursor-not-allowed
            disabled:opacity-50
            "
            >
              Proceed to Checkout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Cart;
