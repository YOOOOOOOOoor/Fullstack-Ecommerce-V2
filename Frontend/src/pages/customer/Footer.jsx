import { Link } from "react-router-dom";
import { FaFacebook, FaGithub, FaInstagram } from "react-icons/fa";

const Footer = () => {
  return (
    <footer className="border-t bg-background mt-20">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
        <div
          className="
        grid
        grid-cols-1
        sm:grid-cols-2
        lg:grid-cols-4
        gap-10
        "
        >
          {/* Logo */}

          <div>
            <h2 className="text-2xl font-bold text-foreground">Yordi Store</h2>

            <p
              className="
            mt-4
            text-sm
            leading-6
            text-muted-foreground
            "
            >
              Modern shopping experience built using the PERN stack with secure
              payments and fast delivery.
            </p>
          </div>

          {/* Company */}

          <div>
            <h3 className="font-semibold mb-4 text-foreground">Company</h3>

            <div className="space-y-3">
              <Link
                to="/about"
                className="
              block
              text-muted-foreground
              hover:text-primary
              transition
              "
              >
                About
              </Link>

              <Link
                to="/support"
                className="
              block
              text-muted-foreground
              hover:text-primary
              transition
              "
              >
                Contact
              </Link>

              <Link
                to="/support"
                className="
              block
              text-muted-foreground
              hover:text-primary
              transition
              "
              >
                FAQ & Support
              </Link>
            </div>
          </div>

          {/* Shop */}

          <div>
            <h3 className="font-semibold mb-4 text-foreground">Shop</h3>

            <div className="space-y-3">
              <Link
                to="/products"
                className="
              block
              text-muted-foreground
              hover:text-primary
              transition
              "
              >
                Products
              </Link>

              <Link
                to="/wishlist"
                className="
              block
              text-muted-foreground
              hover:text-primary
              transition
              "
              >
                Wishlist
              </Link>

              <Link
                to="/order"
                className="
              block
              text-muted-foreground
              hover:text-primary
              transition
              "
              >
                Orders
              </Link>
            </div>
          </div>

          {/* Contact */}

          <div>
            <h3 className="font-semibold mb-4 text-foreground">Contact</h3>

            <div className="flex gap-5">
              <a
                href="#"
                className="
              text-muted-foreground
              hover:text-primary
              transition
              "
              >
                <FaGithub size={22} />
              </a>

              <a
                href="#"
                className="
              text-muted-foreground
              hover:text-primary
              transition
              "
              >
                <FaFacebook size={22} />
              </a>

              <a
                href="#"
                className="
              text-muted-foreground
              hover:text-primary
              transition
              "
              >
                <FaInstagram size={22} />
              </a>
            </div>
          </div>
        </div>

        {/* Bottom */}

        <div
          className="
        border-t
        mt-10
        pt-6
        text-center
        text-sm
        text-muted-foreground
        "
        >
          © {new Date().getFullYear()} Yordi Store. All rights reserved.
        </div>
        <div className="mt-3 flex justify-center">
          <a
            href="https://portfolio-4vcm.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-full border border-primary/10 bg-accent/70 px-3 py-1.5 text-xs font-medium text-accent-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Made by Yordi
          </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
