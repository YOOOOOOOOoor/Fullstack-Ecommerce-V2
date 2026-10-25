import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import API from "../../API/api.js";
import { useCustomerShop } from "../context/CustomerShopContext.jsx";

const Success = () => {
  const [orderId, setOrderId] = useState(null);
  const [searchParams] = useSearchParams();
  const { refreshCart } = useCustomerShop();

  const [status, setStatus] = useState("verifying");
  const [failureMessage, setFailureMessage] = useState(
    "We couldn't verify your payment. Check your orders or contact support before trying to pay again.",
  );

  useEffect(() => {
    const verify = async () => {
      try {
        const tx_ref = searchParams.get("tx_ref");

        if (!tx_ref) {
          setFailureMessage("This payment link does not include a valid reference.");
          setStatus("failed");
          return;
        }

        const res = await API.get(`/checkout/verify/${tx_ref}`);

        if (res.data.success) {
          sessionStorage.removeItem("checkout-idempotency-key");
          setOrderId(res.data.order_id);
          setStatus("success");
          void refreshCart({ silent: true });
        } else if (res.data.needs_review) {
          sessionStorage.removeItem("checkout-idempotency-key");
          setOrderId(res.data.order_id);
          setFailureMessage(res.data.message || "Your payment was verified after the order expired. The store will review it before taking any fulfillment or refund action.");
          setStatus("review");
        } else {
          setFailureMessage(res.data.message || "Payment has not been confirmed yet.");
          setStatus("failed");
        }
      } catch (error) {
        setFailureMessage(
          error.response?.data?.message ||
            "We couldn't verify your payment. Check your orders or contact support before trying to pay again.",
        );
        setStatus("failed");
      }
    };

    verify();
  }, [searchParams, refreshCart]);

  return (
    <div
      className="
    min-h-screen
    bg-background
    flex
    items-center
    justify-center
    px-4
    sm:px-6
    "
    >
      <div
        className="
      bg-card
      max-w-md
      w-full
      rounded-3xl
      shadow-sm
      border
      p-6
      sm:p-8
      text-center
      "
      >
        {status === "verifying" ? (
          <div role="status" aria-live="polite" className="py-8">
            <h1 className="text-2xl font-bold">Verifying your payment</h1>
            <p className="text-muted-foreground mt-3">
              Please wait while we confirm the transaction with the payment provider.
            </p>
          </div>
        ) : status === "success" ? (
          <>
            {/* Success Icon */}

            <div
              className="
            w-20
            h-20
            mx-auto
            rounded-full
            bg-emerald-100
            flex
            items-center
            justify-center
            text-4xl
            mb-6
            "
            >
              ✓
            </div>

            <h1
              className="
            text-3xl
            font-bold
            text-emerald-600
            "
            >
              Payment Successful
            </h1>

            <p
              className="
            text-muted-foreground
            mt-3
            "
            >
              Thank you for your purchase. Your order has been confirmed.
            </p>

            {orderId && (
              <div
                className="
              mt-6
              bg-secondary
              rounded-xl
              p-4
              "
              >
                <p className="text-sm text-muted-foreground">Order Number</p>

                <p
                  className="
                text-xl
                font-bold
                mt-1
                "
                >
                  #{orderId}
                </p>
              </div>
            )}

            <div
              className="
            flex
            flex-col
            sm:flex-row
            gap-3
            mt-6
            "
            >
              <button
                onClick={() => (window.location.href = `/order/${orderId}`)}
                className="
              flex-1
              bg-primary
              hover:opacity-90
              text-primary-foreground
              py-3
              rounded-xl
              font-semibold
              transition
              "
              >
                View Order
              </button>

              <button
                onClick={() => (window.location.href = "/")}
                className="
              flex-1
              border
              py-3
              rounded-xl
              font-semibold
              hover:bg-secondary
              transition
              "
              >
                Continue Shopping
              </button>
            </div>
          </>
        ) : status === "review" ? (
          <>
            <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-full bg-amber-100 text-4xl text-amber-700" aria-hidden="true">!</div>
            <h1 className="text-3xl font-bold text-amber-700">Payment Received for Review</h1>
            <p className="mt-3 text-muted-foreground">{failureMessage}</p>
            {orderId && <button type="button" onClick={() => (window.location.href = `/order/${orderId}`)} className="mt-6 w-full rounded-xl bg-primary py-3 font-semibold text-primary-foreground">View Order</button>}
            <button type="button" onClick={() => (window.location.href = "/")} className="mt-3 w-full rounded-xl border py-3 font-semibold transition hover:bg-secondary">Continue Shopping</button>
          </>
        ) : (
          <>
            {/* Failed Icon */}

            <div
              className="
            w-20
            h-20
            mx-auto
            rounded-full
            bg-red-100
            flex
            items-center
            justify-center
            text-4xl
            mb-6
            "
            >
              ✕
            </div>

            <h1
              className="
            text-3xl
            font-bold
            text-red-600
            "
            >
              Payment Failed
            </h1>

            <p
              className="
            text-muted-foreground
            mt-3
            "
            >
              {failureMessage}
            </p>

            <button
              onClick={() => (window.location.href = "/cart")}
              className="
            w-full
            mt-6
            bg-primary
            hover:opacity-90
            text-primary-foreground
            py-3
            rounded-xl
            font-semibold
            transition
            "
            >
              Return to Cart
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default Success;
