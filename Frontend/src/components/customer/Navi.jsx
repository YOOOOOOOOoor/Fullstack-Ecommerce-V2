import { Link, useNavigate, useLocation } from "react-router-dom";
import { useLayoutEffect, useRef, useState } from "react";
import API from "../../../API/api.js";

import { Button } from "@/components/ui/button";

import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  Menu,
  X,
  ShoppingBag,
  ChevronDown,
  Heart,
  ShoppingCart,
} from "lucide-react";
import ThemeToggle from "../ThemeToggle";
import { useCustomerShop } from "../../context/CustomerShopContext.jsx";

const routeIsActive = (pathname, path) =>
  path === "/"
    ? pathname === "/"
    : pathname === path || pathname.startsWith(`${path}/`);

const CountedShopLink = ({ to, label, count, loaded, icon: Icon, onClick }) => (
  <Link
    to={to}
    aria-label={`${label}${loaded && count ? `, ${count > 9 ? "9 plus" : count} ${count === 1 ? "item" : "items"}` : ""}`}
    onClick={onClick}
    className="relative inline-flex size-10 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
  >
    <Icon
      size={19}
      className={
        label === "Wishlist" && count > 0 ? "fill-red-500 text-red-500" : ""
      }
    />
    {loaded && count > 0 && (
      <span
        aria-hidden="true"
        className="absolute right-0 top-0 inline-flex min-h-4 min-w-4 -translate-y-1/4 translate-x-1/4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground"
      >
        {count > 9 ? "9+" : count}
      </span>
    )}
  </Link>
);

const SlidingNavLinks = ({
  links,
  pathname,
  className,
  mobile = false,
  onNavigate,
}) => {
  const containerRef = useRef(null);
  const [indicator, setIndicator] = useState(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const updateIndicator = () => {
      const activeLink = container.querySelector('[aria-current="page"]');
      if (!activeLink) {
        setIndicator(null);
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const linkRect = activeLink.getBoundingClientRect();
      setIndicator({
        x: linkRect.left - containerRect.left,
        y: linkRect.top - containerRect.top,
        width: linkRect.width,
        height: linkRect.height,
      });
    };

    updateIndicator();
    const observer = new ResizeObserver(updateIndicator);
    observer.observe(container);
    window.addEventListener("resize", updateIndicator);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateIndicator);
    };
  }, [pathname]);

  return (
    <div ref={containerRef} className={`sliding-nav-links ${className}`}>
      {indicator && (
        <span
          aria-hidden="true"
          className="sliding-nav-indicator"
          style={{
            width: indicator.width,
            height: indicator.height,
            transform: `translate3d(${indicator.x}px, ${indicator.y}px, 0)`,
          }}
        />
      )}
      {links.map((link) => {
        const active = routeIsActive(pathname, link.path);
        return (
          <Link
            key={link.path}
            to={link.path}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`sliding-nav-link relative z-10 flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${mobile ? "w-full rounded-xl py-3" : "md:px-2 lg:px-4"} ${active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {link.icon && (
              <span
                className="relative inline-flex shrink-0"
                aria-hidden="true"
              >
                <link.icon
                  size={17}
                  className={
                    link.name === "Wishlist" && link.count > 0
                      ? "fill-red-500 text-red-500"
                      : ""
                  }
                />
                {link.countLoaded && link.count > 0 && (
                  <span className="absolute -right-2.5 -top-2 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
                    {link.count > 9 ? "9+" : link.count}
                  </span>
                )}
              </span>
            )}
            {link.name}
          </Link>
        );
      })}
    </div>
  );
};

const Navi = ({ user, setUser }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { cartCount, wishlistCount, cartLoaded, wishlistLoaded } =
    useCustomerShop();

  const [open, setOpen] = useState(false);

  const logout = async () => {
    try {
      await API.post("/auth/logout");

      setUser(null);

      navigate("/");
    } catch (error) {
      console.error(error);
    }
  };

  const closeMenu = () => setOpen(false);

  const navLinks = [
    {
      name: "Home",
      path: "/",
    },
    {
      name: "Products",
      path: "/products",
    },

    ...(user
      ? [
          {
            name: "Cart",
            path: "/cart",
            icon: ShoppingCart,
            count: cartCount,
            countLoaded: cartLoaded,
          },
          {
            name: "Orders",
            path: "/order",
          },
          {
            name: "Wishlist",
            path: "/wishlist",
            icon: Heart,
            count: wishlistCount,
            countLoaded: wishlistLoaded,
          },
        ]
      : []),
    {
      name: "Support",
      path: "/support",
    },
  ];

  return (
    <nav
      className="
      sticky
      top-0
      z-50
      px-4
      pt-4
    "
    >
      <div
        className="
        max-w-7xl
        mx-auto
      "
      >
        <div
          className="
            flex
            items-center
            justify-between
            rounded-2xl
            border
            bg-background/80
            backdrop-blur-xl
            shadow-sm
            px-5
            py-3
            "
        >
          {/* Brand */}

          <Link
            to="/"
            className="
              flex
              items-center
              gap-3
              group
            "
          >
            <div
              className="
                flex
                items-center
                justify-center
                w-10
                h-10
                rounded-xl
                bg-primary
                text-primary-foreground
                transition
                group-hover:scale-105
              "
            >
              <ShoppingBag size={21} />
            </div>

            <div className="hidden sm:block">
              <h1
                className="
                font-bold
                text-lg
                text-foreground
              "
              >
                EthioShopping
              </h1>

              <p
                className="
                text-xs
                text-muted-foreground
              "
              >
                Modern marketplace
              </p>
            </div>
          </Link>

          {/* Desktop Navigation */}

          <div className="hidden md:flex items-center gap-1 lg:gap-2">
            <SlidingNavLinks
              links={navLinks}
              pathname={location.pathname}
              className="items-center gap-1 lg:gap-2"
            />

            {user?.role === "admin" && (
              <Link
                to="/admin/"
                className="
                  px-4
                  py-2
                  rounded-lg
                  text-sm
                  font-medium
                  text-primary
                  hover:bg-muted
                  transition
                "
              >
                {user.is_super_admin ? "Super Admin" : "Staff"}
              </Link>
            )}
          </div>

          {/* Right Actions */}

          <div
            className="
            flex
            items-center
            gap-3
          "
          >
            {user && (
              <div className="flex items-center gap-1 md:hidden">
                <CountedShopLink
                  to="/wishlist"
                  label="Wishlist"
                  count={wishlistCount}
                  loaded={wishlistLoaded}
                  icon={Heart}
                  onClick={closeMenu}
                />
                <CountedShopLink
                  to="/cart"
                  label="Cart"
                  count={cartCount}
                  loaded={cartLoaded}
                  icon={ShoppingCart}
                  onClick={closeMenu}
                />
              </div>
            )}
            <ThemeToggle />
            <button
              type="button"
              aria-label={
                open ? "Close navigation menu" : "Open navigation menu"
              }
              aria-expanded={open}
              aria-controls="customer-mobile-menu"
              className="
                md:hidden
                flex
                items-center
                justify-center
                w-10
                h-10
                rounded-lg
                hover:bg-muted
                transition
              "
              onClick={() => setOpen(!open)}
            >
              {open ? <X size={22} /> : <Menu size={22} />}
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                {user ? (
                  <button
                    className="
                      flex
                      items-center
                      gap-2
                      rounded-full
                      border
                      p-1
                      hover:bg-muted
                      transition
                    "
                  >
                    <img
                      src={user.avatar}
                      alt="Profile"
                      className="
                        w-9
                        h-9
                        rounded-full
                        object-cover
                      "
                    />

                    <ChevronDown size={16} className="hidden sm:block" />
                  </button>
                ) : (
                  <Button onClick={() => navigate("/login")}>Login</Button>
                )}
              </DropdownMenuTrigger>

              {user && (
                <DropdownMenuContent
                  align="end"
                  className="
                    w-52
                    rounded-xl
                  "
                >
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>My Account</DropdownMenuLabel>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={() => navigate("/settings")}
                    >
                      Settings
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={() => navigate("/order")}
                    >
                      Orders
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={() => navigate("/wishlist")}
                    >
                      Wishlist
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={() => navigate("/cart")}
                    >
                      Cart
                    </DropdownMenuItem>
                  </DropdownMenuGroup>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem
                    onClick={logout}
                    className="
                      cursor-pointer
                      text-red-600
                    "
                  >
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              )}
            </DropdownMenu>
          </div>
        </div>

        {/* Mobile Menu */}

        {open && (
          <div
            id="customer-mobile-menu"
            className="
              md:hidden
              mt-3
              rounded-2xl
              border
              bg-card
              shadow-sm
              p-5
              space-y-2
            "
          >
            <SlidingNavLinks
              links={navLinks}
              pathname={location.pathname}
              mobile
              onNavigate={closeMenu}
              className="flex-col gap-2"
            />

            {user?.role === "admin" && (
              <Link
                onClick={closeMenu}
                to="/admin/"
                className="
                  block
                  px-4
                  py-3
                  rounded-xl
                  text-primary
                  hover:bg-muted
                  transition
                "
              >
                {user.is_super_admin ? "Super Admin" : "Staff"}
              </Link>
            )}
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navi;
