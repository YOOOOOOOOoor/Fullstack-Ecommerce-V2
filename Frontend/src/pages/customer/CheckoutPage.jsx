import API from "../../../API/api.js";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useCustomerShop } from "../../context/CustomerShopContext.jsx";

const ethiopiaLocations = {
  "Addis Ababa": [
    "Bole",
    "Yeka",
    "Arada",
    "Kirkos",
    "Lideta",
    "Nifas Silk-Lafto",
    "Kolfe Keranio",
    "Akaki Kaliti",
    "Gullele",
  ],

  "Dire Dawa": ["Dire Dawa"],

  Adama: ["Adama"],

  Hawassa: ["Tabor", "Menaharia", "Bahil Adarash"],

  "Bahir Dar": ["Bahir Dar"],

  Mekelle: ["Mekelle"],
};

const finiteAmount = (value) => {
  const amount = value === null || value === undefined || value === "" ? NaN : Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

const validPrice = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0;

const CheckoutPage = () => {
  const [cartAmount, setCartAmount] = useState([]);

  const [totalAmount, setTotalAmount] = useState(null);
  const [pricingValid, setPricingValid] = useState(false);
  const [shippingFee, setShippingFee] = useState(null);
  const [pricingError, setPricingError] = useState("");
  const [codEnabled, setCodEnabled] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("chapa");
  const navigate = useNavigate();
  const { clearCart, refreshCart } = useCustomerShop();

  const [loading, setLoading] = useState(false);
  const checkoutKeyRef = useRef(null);

  const [user, setUser] = useState({
    receiver_name: "",

    email: "",

    phone: "",

    city: "",

    sub_city: "",

    address: "",
  });

  // =========================
  // PAYMENT
  // =========================

  const handlePayment = async () => {
    try {
      if (!pricingValid || cartAmount.length === 0) {
        toast.error(pricingError || "Your cart has invalid pricing or no items. Please review your cart before checkout.");
        return;
      }

      if (
        !user.receiver_name ||
        !user.email ||
        !user.phone ||
        !user.city ||
        !user.sub_city ||
        !user.address
      ) {
        toast.error("Please fill in all shipping information.");

        return;
      }

      setLoading(true);
      const key = checkoutKeyRef.current || sessionStorage.getItem("checkout-idempotency-key") || crypto.randomUUID();
      checkoutKeyRef.current = key;
      sessionStorage.setItem("checkout-idempotency-key", key);

      if (paymentMethod === "cod") {
        const result = await API.post("/checkout/cod", {
          receiver_name: user.receiver_name,
          phone: user.phone,
          city: user.city,
          sub_city: user.sub_city,
          address: user.address,
        }, { headers: { "Idempotency-Key": key } });
        toast.success(result.data.message || "Cash on Delivery order placed.");
        sessionStorage.removeItem("checkout-idempotency-key");
        checkoutKeyRef.current = null;
        clearCart();
        void refreshCart({ silent: true });
        navigate(`/order/${result.data.order_id}`);
        return;
      }

      const res = await API.post("/checkout/chapa", {
        receiver_name: user.receiver_name,

        email: user.email,

        phone: user.phone,

        city: user.city,

        sub_city: user.sub_city,

        address: user.address,
      }, { headers: { "Idempotency-Key": key } });

      let checkoutUrl = res.data?.data?.checkout_url;
      if (!checkoutUrl && res.data?.order_id) {
        const continuation = await API.post(`/checkout/continue/${res.data.order_id}`);
        checkoutUrl = continuation.data?.checkout_url;
      }
      if (!checkoutUrl) throw new Error("The payment session could not be resumed. Try again or contact support with your order number.");
      window.location.href = checkoutUrl;
    } catch (error) {
      console.log(error.response?.data);

      toast.error(error.response?.data?.message || error.message || "Payment failed.");

      setLoading(false);
    }
  };

  // =========================
  // FETCH DATA
  // =========================

  useEffect(() => {
    const fetchData = async () => {
      const [carts, total, options, info] = await Promise.allSettled([
        API.get("/checkout/cart"),
        API.get("/checkout/total"),
        API.get("/checkout/options"),
        API.get("/checkout/info"),
      ]);

      let cartItems = [];
      if (carts.status === "fulfilled") {
        cartItems = Array.isArray(carts.value.data) ? carts.value.data : [];
        setCartAmount(cartItems);
      } else {
        setCartAmount([]);
        toast.error(carts.reason.response?.data?.message || "Could not load your cart.");
      }

      if (options.status === "fulfilled") {
        setCodEnabled(Boolean(options.value.data?.cod_enabled));
        setShippingFee(validPrice(options.value.data?.shipping_fee) ? Number(options.value.data.shipping_fee) : null);
      } else if (typeof options.reason.response?.data?.cod_enabled === "boolean") {
        setCodEnabled(options.reason.response.data.cod_enabled);
      }

      if (info.status === "fulfilled") {
        const infoData = info.value.data;
        setUser({
          receiver_name: infoData.name || "",
          email: infoData.email || "",
          phone: infoData.phone || "",
          city: "",
          sub_city: "",
          address: "",
        });
      }

      if (total.status === "fulfilled") {
        const totalData = total.value.data;
        const amount = totalData?.total;
        const validCartPricing = cartItems.length > 0 &&
          cartItems.every((item) => validPrice(item.price) && Number.isFinite(Number(item.quantity)) && Number(item.quantity) > 0) &&
          amount !== null && amount !== undefined && amount !== "" && Number.isFinite(Number(amount)) && Number(amount) >= 0;
        setPricingValid(validCartPricing);
        setTotalAmount(validPrice(amount) ? Number(amount) : null);
        setShippingFee(validPrice(totalData?.shipping_fee) ? Number(totalData.shipping_fee) : null);
        setPricingError(validCartPricing ? "" : "Your cart pricing is invalid. Please review your cart before checkout.");
      } else {
        setPricingValid(false);
        setTotalAmount(null);
        setShippingFee(null);
        setPricingError(total.reason.response?.data?.message || "The order total could not be calculated. Please try again later.");
      }
    };

    fetchData();
  }, []);
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
        {/* HEADER */}

        <div className="mb-10">
          <h1
            className="
          text-3xl
          sm:text-4xl
          font-bold
          "
          >
            Shipping &amp; Payment
          </h1>

          <p className="text-muted-foreground mt-2">
            Complete your information and place your order securely.
          </p>
        </div>

        <div
          className="
        grid
        lg:grid-cols-3
        gap-8
        "
        >
          {/* CHECKOUT FORM */}

          <div
            className="
          lg:col-span-2
          bg-card
          rounded-3xl
          border
          shadow-sm
          p-6
          sm:p-8
          "
          >
            <div
              className="
            flex
            items-center
            gap-3
            mb-8
            "
            >
              <div
                className="
              w-11
              h-11
              rounded-xl
              bg-emerald-100
              text-emerald-700
              flex
              items-center
              justify-center
              "
              >
                ✓
              </div>

              <div>
                <h2 className="text-xl font-bold">Delivery Information</h2>

                <p className="text-sm text-muted-foreground">
                  Enter your shipping details
                </p>
              </div>
            </div>
            <div
              className="
            grid
            sm:grid-cols-2
            gap-5
            "
            >
              {/* RECEIVER NAME */}

              <div>
                <label className="text-sm font-medium">Receiver Name</label>

                <input
                  type="text"
                  value={user.receiver_name}
                  onChange={(e) =>
                    setUser({
                      ...user,

                      receiver_name: e.target.value,
                    })
                  }
                  placeholder="Full name"
                  className="
                mt-2
                w-full
                rounded-xl
                border
                bg-background
                px-4
                py-3
                outline-none
                focus:ring-2
                focus:ring-primary
                "
                />
              </div>

              {/* EMAIL */}

              <div>
                <label className="text-sm font-medium">Email</label>

                <input
                  type="email"
                  value={user.email}
                  onChange={(e) =>
                    setUser({
                      ...user,

                      email: e.target.value,
                    })
                  }
                  placeholder="Email address"
                  className="
                mt-2
                w-full
                rounded-xl
                border
                bg-background
                px-4
                py-3
                outline-none
                focus:ring-2
                focus:ring-primary
                "
                />
              </div>

              {/* PHONE */}

              <div>
                <label className="text-sm font-medium">Phone Number</label>

                <input
                  type="text"
                  value={user.phone}
                  onChange={(e) =>
                    setUser({
                      ...user,

                      phone: e.target.value,
                    })
                  }
                  placeholder="09xxxxxxxx"
                  className="
                mt-2
                w-full
                rounded-xl
                border
                bg-background
                px-4
                py-3
                outline-none
                focus:ring-2
                focus:ring-primary
                "
                />
              </div>

              {/* CITY */}

              <div>
                <label className="text-sm font-medium">City</label>

                <select
                  value={user.city}
                  onChange={(e) =>
                    setUser({
                      ...user,

                      city: e.target.value,

                      sub_city: "",
                    })
                  }
                  className="
                mt-2
                w-full
                rounded-xl
                border
                bg-background
                px-4
                py-3
                outline-none
                "
                >
                  <option value="">Select City</option>

                  {Object.keys(ethiopiaLocations).map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>
              </div>

              {/* SUB CITY */}

              <div>
                <label className="text-sm font-medium">Sub City</label>

                <select
                  value={user.sub_city}
                  disabled={!user.city}
                  onChange={(e) =>
                    setUser({
                      ...user,

                      sub_city: e.target.value,
                    })
                  }
                  className="
                mt-2
                w-full
                rounded-xl
                border
                bg-background
                px-4
                py-3
                outline-none
                disabled:opacity-50
                "
                >
                  <option value="">Select Sub City</option>

                  {ethiopiaLocations[user.city]?.map((sub) => (
                    <option key={sub} value={sub}>
                      {sub}
                    </option>
                  ))}
                </select>
              </div>

              {/* ADDRESS / WOREDA */}

              <div
                className="
              sm:col-span-2
              "
              >
                <label className="text-sm font-medium">
                  Woreda / Detailed Address
                </label>

                <input
                  type="text"
                  value={user.address}
                  onChange={(e) =>
                    setUser({
                      ...user,

                      address: e.target.value,
                    })
                  }
                  placeholder="Example: Woreda 03, near Edna Mall"
                  className="
                mt-2
                w-full
                rounded-xl
                border
                bg-background
                px-4
                py-3
                outline-none
                focus:ring-2
                focus:ring-primary
                "
                />
              </div>
            </div>{" "}
            {/* PAYMENT */}
            <div className="mt-10">
              <h2 className="text-xl font-bold mb-5">Payment Method</h2>

              <div className="flex gap-4">
                <button
                  type="button"
                  aria-pressed={paymentMethod === "chapa"}
                  onClick={() => setPaymentMethod("chapa")}
                  className={`
                flex-1
                border-2
                rounded-xl
                py-4
                font-semibold
                ${paymentMethod === "chapa" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground"}
                `}
                >
                  Chapa
                </button>

                <button
                  type="button"
                  aria-pressed={paymentMethod === "cod"}
                  disabled={!codEnabled}
                  onClick={() => setPaymentMethod("cod")}
                  className={`
                flex-1
                border-2
                rounded-xl
                py-4
                font-semibold
                disabled:cursor-not-allowed
                disabled:opacity-50
                ${paymentMethod === "cod" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground"}
                `}
                >
                  Cash on Delivery
                </button>
              </div>
            </div>
          </div>

          {/* ORDER SUMMARY */}

          <div
            className="
          bg-card
          rounded-3xl
          border
          shadow-sm
          p-6
          sm:p-8
          h-fit
          sticky
          top-24
          "
          >
            <div
              className="
            flex
            items-center
            justify-between
            mb-7
            "
            >
              <h2
                className="
              text-2xl
              font-bold
              "
              >
                Order Summary
              </h2>

              <span
                className="
              text-sm
              bg-emerald-100
              text-emerald-700
              px-3
              py-1
              rounded-full
              font-medium
              "
              >
                Secure
              </span>
            </div>

            {/* PRODUCTS */}

            <div
              className="
            space-y-5
            max-h-[420px]
            overflow-y-auto
            pr-2
            "
            >
              {cartAmount.map((c) => (
                <div
                  key={c.id}
                  className="
                  flex
                  gap-4
                  items-center
                  "
                >
                  <img
                    src={c.image_url}
                    alt={c.title}
                    className="
                    w-20
                    h-20
                    rounded-2xl
                    object-cover
                    border
                    "
                  />

                  <div
                    className="
                    flex-1
                    "
                  >
                    <p
                      className="
                      font-semibold
                      line-clamp-1
                      "
                    >
                      {c.title}
                    </p>

                    <p
                      className="
                      text-sm
                      text-muted-foreground
                      mt-1
                      "
                    >
                      {c.quantity} × ETB {finiteAmount(c.price).toLocaleString()}
                    </p>
                  </div>

                  <p
                    className="
                    font-bold
                    "
                  >
                    ETB {(finiteAmount(c.quantity) * finiteAmount(c.price)).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>

            <div
              className="
            my-6
            border-t
            "
            />

            {/* PRICE DETAILS */}

            <div
              className="
            space-y-4
            "
            >
              <div
                className="
              flex
              justify-between
              text-sm
              "
              >
                <span
                  className="
                text-muted-foreground
                "
                >
                  Subtotal
                </span>

                <span
                  className="
                font-medium
                "
                >
                  {totalAmount === null ? "Unavailable" : `ETB ${totalAmount.toLocaleString()}`}
                </span>
              </div>

              <div
                className="
              flex
              justify-between
              text-sm
              "
              >
                <span
                  className="
                text-muted-foreground
                "
                >
                  Shipping
                </span>

                <span
                  className="
                text-emerald-600
                font-semibold
                "
                >
                  {shippingFee === null ? "Not configured" : `ETB ${shippingFee.toLocaleString()}`}
                </span>
              </div>

              <div
                className="
              border-t
              pt-5
              flex
              justify-between
              items-center
              "
              >
                <span
                  className="
                text-xl
                font-bold
                "
                >
                  Total
                </span>

                <span
                  className="
                text-2xl
                font-bold
                "
                >
                  {totalAmount === null || shippingFee === null ? "Unavailable" : `ETB ${(totalAmount + shippingFee).toLocaleString()}`}
                </span>
              </div>
            </div>

            {/* PLACE ORDER */}

            {pricingError && <p role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{pricingError}</p>}

            <button
              disabled={loading || !pricingValid || cartAmount.length === 0}
              onClick={handlePayment}
              className="
            w-full
            mt-8
            bg-primary
            text-primary-foreground
            py-4
            rounded-xl
            font-semibold
            transition
            hover:opacity-90
            disabled:opacity-50
            "
            >
              {loading ? (paymentMethod === "cod" ? "Placing order..." : "Redirecting...") : (paymentMethod === "cod" ? "Place COD Order" : "Continue to Chapa")}
            </button>

            <p
              className="
            text-xs
            text-center
            text-muted-foreground
            mt-5
            "
            >
              Your payment information is processed securely.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CheckoutPage;
