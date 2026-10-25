import { Link, useParams } from "react-router-dom";
import { useState, useEffect } from "react";

import API from "../../../API/api.js";

import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Heart, Star } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useCustomerShop } from "../../context/CustomerShopContext.jsx";

const SinglePage = () => {
  const [loading, setLoading] = useState(true);
  const productId = useParams();

  const [user, setUser] = useState(null);
  const { refreshCart, addCartItem, toggleWishlist, wishlistIds, wishlistLoading } = useCustomerShop();
  const [wishlistBusy, setWishlistBusy] = useState(false);

  const [product, setProduct] = useState({});

  const [recommendations, setRecommendations] = useState([]);

  const [reviews, setReviews] = useState([]);

  const [averageRating, setAverageRating] = useState(0);

  const [totalReviews, setTotalReviews] = useState(0);

  const [canReview, setCanReview] = useState(false);

  const [quantity1, setQuantity] = useState(1);

  const [reviewForm, setReviewForm] = useState({
    id: null,

    rating: 5,

    title: "",

    comment: "",
  });

  // =========================
  // Get Current User
  // =========================

  useEffect(() => {
    const getUser = async () => {
      try {
        const res = await API.get("/auth/me");

        setUser(res.data.user);
      } catch (error) {
        console.log(error);
      }
    };

    getUser();
  }, []);

  // =========================
  // Fetch Product
  // =========================

  const fetchProduct = async () => {
    try {
      const res = await API.get(`/products/customer/${productId.id}`);

      setProduct(res.data);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load product.");
    }
  };

  // =========================
  // Fetch Recommendations
  // =========================

  const fetchRecommendations = async () => {
    try {
      const res = await API.get(`/products/${productId.id}/recommendations`);

      setRecommendations(res.data);
    } catch (error) {
      console.error("Failed to fetch recommendations", error);
    }
  };

  // =========================
  // Fetch Reviews
  // =========================

  const fetchReviews = async () => {
    try {
      const res = await API.get(`/reviews/${productId.id}`);

      setReviews(res.data.reviews);

      setAverageRating(res.data.average_rating);

      setTotalReviews(res.data.total_reviews);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load reviews.");
    }
  };

  // =========================
  // Check Can Review
  // =========================

  const checkReview = async () => {
    try {
      const res = await API.get(`/reviews/${productId.id}/can-review`);

      setCanReview(res.data.canReview);
    } catch (error) {
      setCanReview(false);
    }
  };

  // =========================
  // Load Page Data
  // =========================

  useEffect(() => {
    const loadPage = async () => {
      try {
        setLoading(true);

        await Promise.all([
          fetchProduct(),
          fetchRecommendations(),
          fetchReviews(),
          checkReview(),
        ]);
      } finally {
        setLoading(false);
      }
    };

    loadPage();
  }, [productId.id]);

  // =========================
  // Delete Review
  // =========================

  const deleteReview = async (id) => {
    try {
      await API.delete(`/reviews/${id}`);

      toast.success("Review deleted successfully.");

      fetchReviews();

      checkReview();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to delete review.");
    }
  };

  // =========================
  // Edit Review
  // =========================

  const editReview = (review) => {
    setReviewForm({
      id: review.id,

      rating: review.rating,

      title: review.title || "",

      comment: review.comment,
    });
  };

  // =========================
  // Submit Review
  // =========================

  const submitReview = async () => {
    try {
      if (reviewForm.id) {
        await API.put(`/reviews/${reviewForm.id}`, {
          rating: reviewForm.rating,

          title: reviewForm.title,

          comment: reviewForm.comment,
        });

        toast.success("Review updated successfully.");
      } else {
        await API.post("/reviews", {
          product_id: product.product_id,

          rating: reviewForm.rating,

          title: reviewForm.title,

          comment: reviewForm.comment,
        });

        toast.success("Review submitted successfully.");
      }

      setReviewForm({
        id: null,

        rating: 5,

        title: "",

        comment: "",
      });

      fetchReviews();

      checkReview();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to submit review.");
    }
  };

  // =========================
  // Add Cart
  // =========================

  const addCarts = async (id) => {
    try {
      const res = await API.post("/cart/", {
        product_id: id,

        quantity: quantity1,
      });

      addCartItem(id, quantity1, product);
      void refreshCart({ silent: true });
      toast.success(res.data.message || "Product added to cart successfully.");
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Failed to add product to cart.",
      );
    }
  };
  const toggleProductWishlist = async () => {
    setWishlistBusy(true);
    try {
      const result = await toggleWishlist(product.product_id, product);
      toast.success(result.added ? "Product added to wishlist." : "Product removed from wishlist.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not update your wishlist.");
    } finally {
      setWishlistBusy(false);
    }
  };
  return (
    <div className="min-h-screen bg-background px-5 sm:px-8 py-10">
      {/* Product */}

      <section
        className="
      max-w-7xl
      mx-auto
      "
      >
        <div
          className="
        grid
        lg:grid-cols-2
        gap-10
        "
        >
          {/* Image */}

          <div
            className="
          bg-card
          border
          rounded-xl
          shadow-sm
          p-5
          "
          >
            <div
              className="
            bg-muted
            rounded-lg
            p-6
            flex
            items-center
            justify-center
            "
            >
              {loading ? (
                <Skeleton className="w-full h-[550px] rounded-lg" />
              ) : (
                <img
                  src={product.image_url}
                  alt={product.title}
                  className="
      w-full
      max-h-[550px]
      object-contain
      rounded-lg
    "
                />
              )}
            </div>
          </div>

          {/* Details */}

          <div
            className="
          bg-card
          border
          rounded-xl
          shadow-sm
          p-6
          lg:p-8
          "
          >
            {loading ? (
              <div className="space-y-5">
                <Skeleton className="h-4 w-24" />

                <Skeleton className="h-10 w-3/4" />

                <Skeleton className="h-24 w-full" />

                <Skeleton className="h-8 w-32" />

                <Skeleton className="h-8 w-40" />

                <Skeleton className="h-10 w-40" />

                <Skeleton className="h-12 w-full rounded-lg" />
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <p
                    className="
                text-sm
                text-muted-foreground
                "
                  >
                    {product.category_name}
                  </p>

                  <h1
                    className="
                text-3xl
                sm:text-4xl
                font-bold
                mt-2
                "
                  >
                    {product.title}
                  </h1>
                </div>

                <p
                  className="
              text-muted-foreground
              leading-7
              "
                >
                  {product.description}
                </p>

                <div
                  className="
              flex
              items-center
              justify-between
              "
                >
                  <p
                    className="
                text-3xl
                font-bold
                text-primary
                "
                  >
                    ${product.price}
                  </p>

                  <div
                    className="
                flex
                items-center
                gap-3
                "
                  >
                    <span
                      className="
                  text-sm
                  text-muted-foreground
                  "
                    >
                      Color
                    </span>

                    <div
                      className="
                  w-9
                  h-9
                  rounded-full
                  border
                  "
                      style={{
                        backgroundColor: product.color,
                      }}
                    />
                  </div>
                </div>

                <div
                  className="
              flex
              "
                >
                  <span
                    className="
                rounded-full
                bg-muted
                px-4
                py-2
                text-sm
                "
                  >
                    {product.stock} items available
                  </span>
                </div>

                {/* Quantity */}

                <div className="space-y-3">
                  <p
                    className="
                font-semibold
                "
                  >
                    Quantity
                  </p>

                  <div
                    className="
                flex
                items-center
                gap-4
                "
                  >
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={quantity1 === 1}
                      onClick={() => setQuantity(quantity1 - 1)}
                    >
                      -
                    </Button>

                    <span
                      className="
                  text-xl
                  font-semibold
                  "
                    >
                      {quantity1}
                    </span>

                    <Button
                      variant="outline"
                      size="icon"
                      disabled={quantity1 === product.stock}
                      onClick={() => setQuantity(quantity1 + 1)}
                    >
                      +
                    </Button>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    className="h-12 flex-1 text-base"
                    onClick={() => addCarts(product.product_id)}
                  >
                    Add to Cart
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className={`size-12 ${wishlistIds.has(Number(product.product_id)) ? "text-red-500" : "text-muted-foreground"}`}
                    aria-label={wishlistIds.has(Number(product.product_id)) ? `Remove ${product.title} from wishlist` : `Add ${product.title} to wishlist`}
                    aria-pressed={wishlistIds.has(Number(product.product_id))}
                    disabled={wishlistBusy || wishlistLoading || !product.product_id}
                    onClick={toggleProductWishlist}
                  >
                    <Heart className={`size-5 ${wishlistIds.has(Number(product.product_id)) ? "fill-current" : ""}`} />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Reviews */}

      <section
        className="
      max-w-7xl
      mx-auto
      mt-12
      bg-card
      border
      rounded-xl
      shadow-sm
      p-6
      sm:p-8
      "
      >
        <div
          className="
        flex
        justify-between
        items-start
        mb-8
        "
        >
          <div>
            <h2
              className="
            text-2xl
            font-bold
            "
            >
              Customer Reviews
            </h2>

            <p
              className="
            text-muted-foreground
            mt-1
            "
            >
              What customers think about this product
            </p>
          </div>

          <div className="text-right">
            <p
              className="
            text-2xl
            font-bold
            "
            >
              ⭐ {averageRating}
            </p>

            <p
              className="
            text-sm
            text-muted-foreground
            "
            >
              {totalReviews} reviews
            </p>
          </div>
        </div>

        {/* Review Form */}

        {(canReview || reviewForm.id) && (
          <div
            className="
          bg-muted
          rounded-xl
          p-5
          mb-8
          "
          >
            <h3
              className="
            text-xl
            font-semibold
            mb-5
            "
            >
              {reviewForm.id ? "Edit Review" : "Write a Review"}
            </h3>
            <div className="flex gap-2 mb-5">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  size={24}
                  onClick={() =>
                    setReviewForm({
                      ...reviewForm,
                      rating: star,
                    })
                  }
                  className={
                    star <= reviewForm.rating
                      ? "cursor-pointer fill-yellow-400 text-yellow-400"
                      : "cursor-pointer text-muted-foreground"
                  }
                />
              ))}
            </div>

            <div className="space-y-4">
              <div>
                <Label>Title</Label>

                <input
                  className="
                mt-2
                w-full
                rounded-lg
                border
                bg-background
                px-4
                py-3
                outline-none
                focus:ring-2
                focus:ring-ring
                "
                  value={reviewForm.title}
                  onChange={(e) =>
                    setReviewForm({
                      ...reviewForm,
                      title: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <Label>Comment</Label>

                <Textarea
                  className="
                mt-2
                "
                  value={reviewForm.comment}
                  onChange={(e) =>
                    setReviewForm({
                      ...reviewForm,
                      comment: e.target.value,
                    })
                  }
                />
              </div>

              <div className="flex gap-3">
                <Button onClick={submitReview}>
                  {reviewForm.id ? "Update Review" : "Submit Review"}
                </Button>

                {reviewForm.id && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      setReviewForm({
                        id: null,
                        rating: 5,
                        title: "",
                        comment: "",
                      })
                    }
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Reviews List */}

        <div className="space-y-5">
          {loading ? (
            [...Array(3)].map((_, index) => (
              <div
                key={index}
                className="
          border
          rounded-xl
          p-5
          bg-background
          space-y-4
        "
              >
                <Skeleton className="h-5 w-40" />

                <Skeleton className="h-4 w-24" />

                <Skeleton className="h-5 w-48" />

                <Skeleton className="h-4 w-full" />

                <Skeleton className="h-4 w-5/6" />
              </div>
            ))
          ) : reviews.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              No reviews yet.
            </div>
          ) : (
            reviews.map((review) => (
              <div
                key={review.id}
                className="
            border
            rounded-xl
            p-5
            bg-background
            "
              >
                <div
                  className="
              flex
              justify-between
              gap-5
              "
                >
                  <div>
                    <h3
                      className="
                  font-semibold
                  "
                    >
                      {review.name}
                    </h3>

                    <div className="flex mt-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          size={16}
                          className={
                            star <= review.rating
                              ? "fill-yellow-400 text-yellow-400"
                              : "text-muted-foreground"
                          }
                        />
                      ))}
                    </div>
                  </div>

                  <p
                    className="
                text-sm
                text-muted-foreground
                "
                  >
                    {new Date(review.created_at).toLocaleDateString()}
                  </p>
                </div>

                <h4
                  className="
              font-semibold
              mt-4
              "
                >
                  {review.title}
                </h4>

                <p
                  className="
              mt-2
              text-muted-foreground
              "
                >
                  {review.comment}
                </p>

                {user?.id === review.user_id && (
                  <div
                    className="
                flex
                gap-3
                mt-5
                "
                  >
                    <Button
                      variant="outline"
                      onClick={() => editReview(review)}
                    >
                      Edit
                    </Button>

                    <Button
                      variant="destructive"
                      onClick={() => deleteReview(review.id)}
                    >
                      Delete
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {/* Recommendations */}
      {loading ? (
        <div
          className="
      grid
      grid-cols-1
      sm:grid-cols-2
      md:grid-cols-3
      lg:grid-cols-5
      gap-5
    "
        >
          {[...Array(5)].map((_, index) => (
            <div
              key={index}
              className="
          bg-card
          border
          rounded-xl
          overflow-hidden
        "
            >
              <Skeleton className="h-48 w-full" />

              <div className="p-4 space-y-3">
                <Skeleton className="h-5 w-3/4" />

                <Skeleton className="h-4 w-1/2" />

                <Skeleton className="h-5 w-20" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        recommendations.length > 0 && (
          <section
            className="
        max-w-7xl
        mx-auto
        mt-16
        "
          >
            <div className="mb-8">
              <h2
                className="
            text-3xl
            font-bold
            "
              >
                You may also like
              </h2>

              <p
                className="
            text-muted-foreground
            mt-2
            "
              >
                Similar products you might enjoy.
              </p>
            </div>

            <div
              className="
          grid
          grid-cols-1
          sm:grid-cols-2
          md:grid-cols-3
          lg:grid-cols-5
          gap-5
          "
            >
              {recommendations.map((item) => (
                <Link
                  key={item.id}
                  to={`/products/${item.id}`}
                  className="
              group
              bg-card
              border
              rounded-xl
              overflow-hidden
              shadow-sm
              hover:shadow-md
              transition
              "
                >
                  <img
                    src={item.image_url}
                    alt={item.title}
                    className="
                w-full
                h-48
                object-cover
                group-hover:scale-105
                transition
                "
                  />

                  <div className="p-4">
                    <h3
                      className="
                  font-semibold
                  truncate
                  "
                    >
                      {item.title}
                    </h3>

                    <p
                      className="
                  text-sm
                  text-muted-foreground
                  mt-1
                  "
                    >
                      {item.category_name}
                    </p>

                    <p
                      className="
                  font-bold
                  text-primary
                  mt-3
                  "
                    >
                      ${item.price}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )
      )}
    </div>
  );
};

export default SinglePage;
