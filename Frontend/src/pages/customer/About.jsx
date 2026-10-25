import { Link } from "react-router-dom";

const About = () => (
  <main className="mx-auto max-w-4xl space-y-8 py-4 sm:py-8">
    <header className="max-w-3xl">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">About Yordi Store</p>
      <h1 className="mt-3 text-3xl font-bold sm:text-5xl">A hands-on e-commerce project</h1>
      <p className="mt-4 text-lg leading-7 text-muted-foreground">Yordi Store is a full-stack shopping application built to bring the parts of an online order into one working experience.</p>
    </header>

    <section className="grid gap-4 sm:grid-cols-2">
      <article className="rounded-2xl border bg-card p-5 sm:p-6">
        <h2 className="text-xl font-semibold">About the project</h2>
        <p className="mt-3 leading-7 text-muted-foreground">The application brings together product browsing, customer accounts, shopping carts, orders, checkout, and payment integration. Building those connected workflows was a way to explore how an e-commerce product works across its customer interface and backend.</p>
      </article>
      <article className="rounded-2xl border bg-card p-5 sm:p-6">
        <h2 className="text-xl font-semibold">Why I built it</h2>
        <p className="mt-3 leading-7 text-muted-foreground">I built this project to develop and demonstrate practical full-stack engineering skills by working through the details of a real application: authentication, order handling, checkout, and payment integration.</p>
      </article>
    </section>

    <section className="rounded-2xl border bg-muted/40 p-5 sm:p-7">
      <h2 className="text-xl font-semibold">What the store aims to provide</h2>
      <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">The goal is a clear and dependable shopping flow: make it easy to explore products, understand an order’s progress, and complete checkout through the payment options available in the application.</p>
    </section>

    <section className="rounded-2xl border bg-card p-5 sm:p-7">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">The developer</p>
      <h2 className="mt-2 text-2xl font-semibold">Built by a software engineering student</h2>
      <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">I’m a Software Engineering student at HiLCoE with practical full-stack development experience. This project gives me room to apply what I’m learning and build an end-to-end application with real product, order, and payment workflows.</p>
    </section>

    <p className="text-sm text-muted-foreground">Want to explore the store? <Link to="/products" className="font-medium text-primary underline-offset-4 hover:underline">Browse products</Link>.</p>
  </main>
);

export default About;
