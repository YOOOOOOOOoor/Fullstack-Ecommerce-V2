import { Link, useLocation } from "react-router-dom";
import { Home, SearchX } from "lucide-react";
import { getNotFoundDestination } from "./notFoundDestination.js";

const NotFound = () => {
  const { pathname } = useLocation();
  const destination = getNotFoundDestination(pathname);
  const destinationLabel = destination === "/driver/dashboard" ? "driver dashboard" : destination === "/admin" ? "admin dashboard" : "home page";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12 text-foreground">
      <section className="w-full max-w-lg rounded-3xl border bg-card p-8 text-center shadow-sm sm:p-10">
        <SearchX aria-hidden="true" className="mx-auto size-12 text-primary" />
        <p className="mt-5 text-sm font-semibold uppercase tracking-wider text-primary">404 error</p>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Page not found</h1>
        <p className="mt-3 text-muted-foreground">This address doesn’t match a page in the store.</p>
        <Link to={destination} className="mt-7 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <Home size={17} aria-hidden="true" /> Return to the {destinationLabel}
        </Link>
      </section>
    </main>
  );
};

export default NotFound;
