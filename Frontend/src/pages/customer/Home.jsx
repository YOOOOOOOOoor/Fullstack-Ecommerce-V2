import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import API from "../../../API/api.js";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

const Home = ({ user }) => {
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFeatured = async () => {
      try {
        const res = await API.get("/products/featured");

        setFeaturedProducts(res.data);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    fetchFeatured();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}

      <section
        className="
      max-w-7xl
      mx-auto
      px-5
      sm:px-8
      py-12
      lg:py-20
      "
      >
        <div
          className="
        grid
        lg:grid-cols-2
        gap-10
        items-center
        "
        >
          {/* Hero Content */}

          <div className="space-y-6">
            <h1
              className="
            text-4xl
            sm:text-5xl
            lg:text-6xl
            font-bold
            tracking-tight
            text-foreground
            "
            >
              Discover products
              <br />
              you will love
            </h1>

            <p
              className="
            max-w-xl
            text-lg
            text-muted-foreground
            "
            >
              Find high quality products at the best prices. Shop our latest
              collection with a modern shopping experience.
            </p>

            <div className="flex gap-4">
              <Link to="/products">
                <Button
                  size="lg"
                  className="
                rounded-lg
                "
                >
                  Shop Now
                </Button>
              </Link>

              <Link to="/products">
                <Button variant="outline" size="lg">
                  Explore Products
                </Button>
              </Link>
            </div>
          </div>

          {/* Hero Image Card */}

          <div
            className="
          relative
          "
          >
            <div
              className="
            bg-card
            border
            rounded-xl
            shadow-sm
            p-3
            "
            >
              <img
                src="https://images.unsplash.com/photo-1560769629-975ec94e6a86?q=80&w=764"
                alt="shopping"
                className="
              w-full
              h-[420px]
              object-cover
              rounded-lg
              "
              />
            </div>
          </div>
        </div>
      </section>

      {/* Welcome */}

      <section
        className="
      max-w-7xl
      mx-auto
      px-5
      sm:px-8
      "
      >
        <div
          className="
        bg-card
        border
        rounded-xl
        shadow-sm
        p-6
        "
        >
          <h2
            className="
          text-xl
          font-semibold
          text-foreground
          "
          >
            {user ? `Welcome back, ${user.name}` : "Welcome new customer"}
          </h2>

          <p
            className="
          mt-2
          text-muted-foreground
          "
          >
            Discover our newest products and exclusive collections.
          </p>
        </div>
      </section>

      {/* Featured Products */}

      <section
        className="
      max-w-7xl
      mx-auto
      px-5
      sm:px-8
      py-16
      "
      >
        <div
          className="
        flex
        items-end
        justify-between
        mb-8
        "
        >
          <div>
            <h2
              className="
            text-3xl
            font-bold
            text-foreground
            "
            >
              Featured Products
            </h2>

            <p
              className="
            mt-2
            text-muted-foreground
            "
            >
              Explore our latest available products.
            </p>
          </div>

          <Link
            to="/products"
            className="
          hidden
          sm:block
          text-primary
          font-medium
          hover:underline
          "
          >
            View All
          </Link>
        </div>

        {loading ? (
          <div
            className="
      bg-card
      border
      rounded-xl
      shadow-sm
      py-16
      px-6
    "
          >
            <div className="flex flex-col items-center justify-center text-center">
              <Spinner className="size-8 mb-5" />
            </div>
          </div>
        ) : featuredProducts.length === 0 ? (
          <div
            className="
      bg-card
      border
      rounded-xl
      shadow-sm
      py-16
      text-center
      text-muted-foreground
    "
          >
            No featured products found.
          </div>
        ) : (
          <div
            className="
      grid
      grid-cols-1
      sm:grid-cols-2
      lg:grid-cols-4
      gap-6
    "
          >
            {featuredProducts.map((product) => (
              <Link
                key={product.id}
                to={`/products/${product.id}`}
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
                <div className="overflow-hidden">
                  <img
                    src={product.image_url}
                    alt={product.title}
                    className="
              w-full
              h-60
              object-cover
              group-hover:scale-105
              transition
              duration-300
            "
                  />
                </div>

                <div className="p-5 space-y-3">
                  <h3 className="font-semibold text-lg text-foreground">
                    {product.title}
                  </h3>

                  <p className="text-sm text-muted-foreground">
                    {product.category_name}
                  </p>

                  <p className="text-xl font-bold text-primary">
                    ${product.price}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default Home;
